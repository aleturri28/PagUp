import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StackScreenProps } from '@react-navigation/stack';
import { ArrowLeft, Camera, Link2, LogOut, UserPlus, X } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { RootStackParamList } from '../navigation/types';
import { getProfile, signOut, UserRole } from '../api/auth';
import { supabase } from '../api/supabase';
import { useWalletStore } from '../store/useWalletStore';

type Props = StackScreenProps<RootStackParamList, 'Settings'>;

type PairingPayload = {
  app: 'pagup';
  type: 'student_pairing';
  version: 1;
  studentId: string;
};

const PAIRING_PREFIX = 'pagup-student:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePairingPayload(raw: string): PairingPayload | null {
  const value = raw.trim();
  const prefixedId = value.startsWith(PAIRING_PREFIX) ? value.slice(PAIRING_PREFIX.length).trim() : '';
  if (UUID_PATTERN.test(prefixedId)) {
    return {
      app: 'pagup',
      type: 'student_pairing',
      version: 1,
      studentId: prefixedId,
    };
  }

  const urlMatch = value.match(/[?&]studentId=([^&]+)/);
  if (urlMatch) {
    const studentId = decodeURIComponent(urlMatch[1]);
    if (UUID_PATTERN.test(studentId)) {
      return {
        app: 'pagup',
        type: 'student_pairing',
        version: 1,
        studentId,
      };
    }
  }

  try {
    const payload = JSON.parse(value) as Partial<PairingPayload>;
    if (
      payload.app === 'pagup' &&
      payload.type === 'student_pairing' &&
      payload.version === 1 &&
      typeof payload.studentId === 'string' &&
      UUID_PATTERN.test(payload.studentId)
    ) {
      return payload as PairingPayload;
    }
  } catch {
    return null;
  }
  return null;
}

export default function SettingsScreen({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const stopSync = useWalletStore((s) => s.stopSync);
  const isCompact = width < 390;
  const qrBoxSize = Math.max(220, Math.min(width - 88, 286));
  const qrCodeSize = Math.max(180, Math.min(qrBoxSize - 38, 230));

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          throw error ?? new Error('Utente non autenticato.');
        }

        const profile = await getProfile(data.user.id);
        if (!mounted) return;
        setUserId(data.user.id);
        setRole(profile.role);
        setFullName(profile.fullName);
        setEmail(data.user.email ?? null);

        if (profile.role === 'student' && route.params?.unlocked !== true) {
          Alert.alert('Accesso protetto', 'Tieni premuto il pulsante impostazioni per 3 secondi e inserisci il PIN tutor.');
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.reset({ index: 0, routes: [{ name: 'StudentHome' }] });
          }
        }
      } catch (error) {
        Alert.alert('Profilo non disponibile', error instanceof Error ? error.message : 'Riprova.');
      } finally {
        if (mounted) setProfileLoading(false);
      }
    }

    loadProfile().catch(() => {});
    return () => {
      mounted = false;
    };
  }, [navigation, route.params?.unlocked]);

  const pairingValue = useMemo(() => {
    if (!userId || role !== 'student') return '';
    return `${PAIRING_PREFIX}${userId}`;
  }, [role, userId]);

  const openScanner = useCallback(async () => {
    if (role !== 'tutor') return;
    if (!cameraPermission?.granted) {
      const response = await requestCameraPermission();
      if (!response.granted) {
        Alert.alert('Fotocamera bloccata', 'Serve la fotocamera per scansionare il QR dello studente.');
        return;
      }
    }
    setScanLocked(false);
    setScannerVisible(true);
  }, [cameraPermission?.granted, requestCameraPermission, role]);

  const pairStudent = useCallback(
    async (studentId: string) => {
      if (!userId || role !== 'tutor') return;
      setPairingBusy(true);
      try {
        const { error: linkError } = await supabase
          .from('tutor_students')
          .insert({ tutor_id: userId, student_id: studentId });

        if (linkError && linkError.code !== '23505') {
          throw linkError;
        }

        const { data: student, error: studentError } = await supabase
          .from('profiles')
          .select('id, role, full_name')
          .eq('id', studentId)
          .single();

        if (studentError) throw studentError;
        if (student.role !== 'student') {
          throw new Error('Questo QR non appartiene a uno studente.');
        }

        setScannerVisible(false);
        Alert.alert(
          'Pairing completato',
          `${student.full_name ?? 'Studente'} e' ora collegato al tuo profilo tutor.`,
        );
      } catch (error) {
        setScanLocked(false);
        Alert.alert('Pairing non riuscito', error instanceof Error ? error.message : 'QR non valido.');
      } finally {
        setPairingBusy(false);
      }
    },
    [role, userId],
  );

  const handleBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanLocked || pairingBusy) return;
      const payload = parsePairingPayload(data);
      if (!payload) {
        setScanLocked(true);
        const preview = data.trim().slice(0, 42);
        Alert.alert('QR non valido', `Scansiona il QR PagUp dello studente.\n\nLetto: ${preview || 'vuoto'}`, [
          { text: 'Riprova', onPress: () => setScanLocked(false) },
        ]);
        return;
      }

      setScanLocked(true);
      pairStudent(payload.studentId).catch(() => {});
    },
    [pairStudent, pairingBusy, scanLocked],
  );

  const handleLogout = useCallback(async () => {
    Alert.alert('Logout', 'Sei sicuro di voler uscire? Dovrai accedere nuovamente per continuare.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Esci',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await signOut();
            stopSync();
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          } catch (error) {
            Alert.alert('Errore', error instanceof Error ? error.message : 'Impossibile effettuare il logout.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }, [navigation, stopSync]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <ArrowLeft size={36} color="#06428C" strokeWidth={2.3} />
        </TouchableOpacity>
        <Text style={[styles.title, isCompact && styles.titleCompact]}>Impostazioni</Text>
        <View style={styles.iconButtonSpacer} />
      </View>

      <View style={[styles.content, isCompact && styles.contentCompact]}>
        <View style={styles.identityBand}>
          <Text style={[styles.identityName, isCompact && styles.identityNameCompact]}>{fullName ?? 'Profilo PagUp'}</Text>
          <Text style={[styles.identityEmail, isCompact && styles.identityEmailCompact]}>{email ?? ''}</Text>
        </View>

        {profileLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#003A80" />
            <Text style={styles.loadingText}>Carico profilo...</Text>
          </View>
        ) : role === 'student' ? (
          <TouchableOpacity
            style={[styles.pairingButton, isCompact && styles.ctaButtonCompact]}
            onPress={() => setQrVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Collega Tutor"
          >
            {pairingBusy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <UserPlus size={30} color="#FFFFFF" strokeWidth={2.7} />
            )}
            <Text style={styles.primaryButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              Collega Tutor
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.pairingButton, isCompact && styles.ctaButtonCompact]}
            onPress={() => {
              openScanner().catch(() => {});
            }}
            disabled={pairingBusy}
            accessibilityRole="button"
            accessibilityLabel="Scansiona QR studente"
          >
            {pairingBusy ? <ActivityIndicator color="#FFFFFF" /> : <Camera size={24} color="#FFFFFF" />}
            <Text style={styles.primaryButtonText}>{pairingBusy ? 'Collego...' : 'Scansiona QR'}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.logoutButton, isCompact && styles.ctaButtonCompact, loading && styles.buttonDisabled]}
          onPress={handleLogout}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Esci dall'account"
        >
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <LogOut size={30} color="#FFFFFF" strokeWidth={2.7} />}
          <Text style={styles.logoutButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
            {loading ? 'Uscita...' : "Esci dall'account"}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal visible={qrVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setQrVisible(false)}>
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Link2 size={24} color="#0F6F53" />
              <Text style={styles.modalTitle}>Pairing</Text>
            </View>
            <TouchableOpacity style={styles.iconButton} onPress={() => setQrVisible(false)} accessibilityLabel="Chiudi">
              <X size={24} color="#17352D" />
            </TouchableOpacity>
          </View>

          <View style={styles.qrStage}>
            <View style={[styles.qrBox, { width: qrBoxSize, height: qrBoxSize }]}>
              {pairingValue ? <QRCode value={pairingValue} size={qrCodeSize} quietZone={12} /> : null}
            </View>
            <Text style={[styles.qrTitle, isCompact && styles.qrTitleCompact]}>Mostra questo QR al tutor</Text>
            <Text style={[styles.qrText, isCompact && styles.qrTextCompact]}>Quando il tutor lo scansiona, il tuo wallet comparira' nella sua dashboard.</Text>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={scannerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setScannerVisible(false)}
      >
        <SafeAreaView style={styles.scannerRoot}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scansiona QR studente</Text>
            <TouchableOpacity style={styles.scannerClose} onPress={() => setScannerVisible(false)} accessibilityLabel="Chiudi">
              <X size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned}
          >
            <View style={[styles.scanFrame, { margin: isCompact ? 22 : 42 }]}>
              {pairingBusy ? <ActivityIndicator color="#FFFFFF" size="large" /> : null}
            </View>
          </CameraView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8F8F9',
  },
  header: {
    minHeight: 92,
    paddingHorizontal: 36,
    paddingTop: 14,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF5',
    backgroundColor: '#FFFFFF',
  },
  headerCompact: {
    minHeight: 78,
    paddingHorizontal: 18,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonSpacer: {
    width: 42,
    height: 42,
  },
  title: {
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '900',
    color: '#06428C',
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 28,
    lineHeight: 34,
  },
  content: {
    flex: 1,
    paddingHorizontal: 29,
    paddingTop: 77,
    gap: 0,
    alignItems: 'stretch',
  },
  contentCompact: {
    paddingHorizontal: 18,
    paddingTop: 44,
  },
  identityBand: {
    alignItems: 'center',
    paddingVertical: 0,
    gap: 14,
    marginBottom: 87,
  },
  identityName: {
    color: '#16171A',
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '900',
    textAlign: 'center',
  },
  identityNameCompact: {
    fontSize: 30,
    lineHeight: 36,
  },
  identityEmail: {
    color: '#3E424B',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    textAlign: 'center',
  },
  identityEmailCompact: {
    fontSize: 18,
    lineHeight: 24,
  },
  loadingBox: {
    minHeight: 76,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 62,
  },
  loadingText: {
    color: '#434751',
    fontSize: 16,
    fontWeight: '700',
  },
  pairingButton: {
    height: 116,
    borderRadius: 16,
    backgroundColor: '#06428C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 24,
    marginBottom: 88,
    shadowColor: '#001B43',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  ctaButtonCompact: {
    minHeight: 88,
    height: 88,
    gap: 14,
    marginBottom: 36,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  logoutButton: {
    height: 116,
    borderRadius: 16,
    backgroundColor: '#C91717',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 24,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#F4F7F4',
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    color: '#102B22',
    fontSize: 24,
    fontWeight: '900',
  },
  qrStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 22,
  },
  qrBox: {
    width: 286,
    height: 286,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCE8DF',
  },
  qrTitle: {
    color: '#102B22',
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  qrTitleCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  qrText: {
    color: '#40564E',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  qrTextCompact: {
    fontSize: 15,
    lineHeight: 22,
  },
  scannerRoot: {
    flex: 1,
    backgroundColor: '#07110E',
  },
  scannerHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scannerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  scannerClose: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    flex: 1,
  },
  scanFrame: {
    flex: 1,
    margin: 42,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
