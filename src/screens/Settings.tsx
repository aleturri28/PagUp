import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StackScreenProps } from '@react-navigation/stack';
import { ArrowLeft, Camera, Link2, LogOut, QrCode, Settings, X } from 'lucide-react-native';
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

export default function SettingsScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const stopSync = useWalletStore((s) => s.stopSync);

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
  }, []);

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
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <ArrowLeft size={24} color="#17352D" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Settings size={28} color="#0F6F53" />
          <Text style={styles.title}>Impostazioni</Text>
        </View>
        <View style={styles.iconButtonSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.identityBand}>
          <Text style={styles.identityLabel}>{role === 'tutor' ? 'Tutor' : 'Studente'}</Text>
          <Text style={styles.identityName}>{fullName ?? 'Profilo PagUp'}</Text>
        </View>

        {profileLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#0F6F53" />
            <Text style={styles.loadingText}>Carico profilo...</Text>
          </View>
        ) : role === 'student' ? (
          <TouchableOpacity
            style={styles.pairingButton}
            onPress={() => setQrVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Mostra QR pairing"
          >
            <QrCode size={26} color="#FFFFFF" />
            <View style={styles.buttonTextWrap}>
              <Text style={styles.primaryButtonText}>Pairing tutor</Text>
              <Text style={styles.secondaryButtonText}>Mostra il QR al tutor</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.pairingButton}
            onPress={() => {
              openScanner().catch(() => {});
            }}
            disabled={pairingBusy}
            accessibilityRole="button"
            accessibilityLabel="Scansiona QR studente"
          >
            {pairingBusy ? <ActivityIndicator color="#FFFFFF" /> : <Camera size={26} color="#FFFFFF" />}
            <View style={styles.buttonTextWrap}>
              <Text style={styles.primaryButtonText}>{pairingBusy ? 'Collego...' : 'Scansiona QR'}</Text>
              <Text style={styles.secondaryButtonText}>Collega uno studente</Text>
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.logoutButton, loading && styles.buttonDisabled]}
          onPress={handleLogout}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Esci"
        >
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <LogOut size={22} color="#FFFFFF" />}
          <Text style={styles.logoutButtonText}>{loading ? 'Uscita...' : 'Logout'}</Text>
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
            <View style={styles.qrBox}>
              {pairingValue ? <QRCode value={pairingValue} size={230} quietZone={12} /> : null}
            </View>
            <Text style={styles.qrTitle}>Mostra questo QR al tutor</Text>
            <Text style={styles.qrText}>Quando il tutor lo scansiona, il tuo wallet comparira' nella sua dashboard.</Text>
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
            <View style={styles.scanFrame}>
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
    backgroundColor: '#F4F7F4',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#E4F1E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonSpacer: {
    width: 46,
    height: 46,
  },
  headerTitleWrap: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#102B22',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
    gap: 16,
  },
  identityBand: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE8DF',
    padding: 18,
  },
  identityLabel: {
    color: '#0F6F53',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  identityName: {
    marginTop: 6,
    color: '#17352D',
    fontSize: 22,
    fontWeight: '900',
  },
  loadingBox: {
    minHeight: 76,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#40564E',
    fontSize: 15,
    fontWeight: '700',
  },
  pairingButton: {
    minHeight: 76,
    borderRadius: 8,
    backgroundColor: '#0F6F53',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 14,
  },
  buttonTextWrap: {
    flex: 1,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  secondaryButtonText: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  logoutButton: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: '#D9534F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
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
  qrText: {
    color: '#40564E',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
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
