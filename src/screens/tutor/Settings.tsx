import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StackScreenProps } from '@react-navigation/stack';
import { ArrowLeft, Camera, LogOut, ScanLine, ShieldCheck, X } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { getProfile, signOut } from '../../api/auth';
import { supabase } from '../../api/supabase';
import { useWalletStore } from '../../store/useWalletStore';

type Props = StackScreenProps<RootStackParamList, 'TutorSettings'>;

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
    return { app: 'pagup', type: 'student_pairing', version: 1, studentId: prefixedId };
  }

  try {
    const payload = JSON.parse(value) as Partial<PairingPayload>;
    if (payload.app === 'pagup' && payload.type === 'student_pairing' && payload.version === 1 && typeof payload.studentId === 'string' && UUID_PATTERN.test(payload.studentId)) {
      return payload as PairingPayload;
    }
  } catch {
    return null;
  }

  return null;
}

export default function TutorSettings({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const stopSync = useWalletStore((s) => s.stopSync);
  const [loading, setLoading] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileUsername, setProfileUsername] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [tutorId, setTutorId] = useState<string | null>(null);
  const isCompact = width < 390;
  const scanFrameSize = Math.max(200, Math.min(width - 72, 260));

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw error ?? new Error('Tutor non autenticato.');
      const profile = await getProfile(data.user.id);
      if (!mounted) return;
      setTutorId(data.user.id);
      setProfileName(profile.fullName ?? 'Tutor');
      setProfileUsername(profile.username);
    }

    loadProfile().catch((error) => {
      Alert.alert('Profilo non disponibile', error instanceof Error ? error.message : 'Riprova.');
    });

    return () => {
      mounted = false;
    };
  }, []);

  const openScanner = useCallback(async () => {
    if (!cameraPermission?.granted) {
      const response = await requestCameraPermission();
      if (!response.granted) {
        Alert.alert('Fotocamera bloccata', 'Serve la fotocamera per associare uno studente tramite QR.');
        return;
      }
    }
    setScanLocked(false);
    setScannerVisible(true);
  }, [cameraPermission?.granted, requestCameraPermission]);

  const pairStudent = useCallback(async (studentId: string) => {
    if (!tutorId) return;
    setPairingBusy(true);
    try {
      const { error: linkError } = await supabase
        .from('tutor_students')
        .insert({ tutor_id: tutorId, student_id: studentId });

      if (linkError && linkError.code !== '23505') throw linkError;

      const { data: student, error: studentError } = await supabase
        .from('profiles')
        .select('full_name, username, role')
        .eq('id', studentId)
        .single();

      if (studentError) throw studentError;
      if (student.role !== 'student') throw new Error('Questo QR non appartiene a uno studente.');

      setScannerVisible(false);
      Alert.alert('Studente associato', `${student.full_name ?? student.username} ora compare nella tua dashboard.`);
    } catch (error) {
      setScanLocked(false);
      Alert.alert('Associazione non riuscita', error instanceof Error ? error.message : 'QR non valido.');
    } finally {
      setPairingBusy(false);
    }
  }, [tutorId]);

  const handleBarcodeScanned = useCallback(({ data }: { data: string }) => {
    if (scanLocked || pairingBusy) return;
    const payload = parsePairingPayload(data);
    if (!payload) {
      setScanLocked(true);
      Alert.alert('QR non valido', 'Scansiona il QR PagUp mostrato sull’app dello studente.', [
        { text: 'Riprova', onPress: () => setScanLocked(false) },
      ]);
      return;
    }
    setScanLocked(true);
    pairStudent(payload.studentId).catch(() => {});
  }, [pairStudent, pairingBusy, scanLocked]);

  const handleLogout = useCallback(() => {
    Alert.alert('Esci', 'Vuoi uscire dall’account tutor?', [
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
            Alert.alert('Errore', error instanceof Error ? error.message : 'Impossibile uscire.');
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
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel="Indietro">
          <ArrowLeft size={22} color="#1D2A43" />
        </TouchableOpacity>
        <Text style={styles.title}>Impostazioni Tutor</Text>
        <View style={styles.iconSpacer} />
      </View>

      <View style={[styles.content, isCompact && styles.contentCompact]}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <ShieldCheck size={22} color="#FFFFFF" />
          </View>
          <Text style={[styles.heroName, isCompact && styles.heroNameCompact]}>{profileName}</Text>
          <Text style={styles.heroUser}>@{profileUsername}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Associa studente</Text>
          <Text style={styles.cardBody}>Apri la fotocamera e scansiona il QR mostrato sul dispositivo dello studente.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => { openScanner().catch(() => {}); }}>
            {pairingBusy ? <ActivityIndicator color="#FFFFFF" /> : <Camera size={20} color="#FFFFFF" />}
            <Text style={styles.primaryBtnText}>{pairingBusy ? 'Associo...' : 'Apri scanner QR'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <LogOut size={20} color="#FFFFFF" />}
          <Text style={styles.logoutText}>{loading ? 'Uscita...' : 'Esci dall’account'}</Text>
        </TouchableOpacity>
      </View>

      <ModalCamera
        visible={scannerVisible}
        pairingBusy={pairingBusy}
        scanLocked={scanLocked}
        scanFrameSize={scanFrameSize}
        compact={isCompact}
        onClose={() => setScannerVisible(false)}
        onBarcodeScanned={handleBarcodeScanned}
      />
    </SafeAreaView>
  );
}

function ModalCamera({
  visible,
  pairingBusy,
  scanLocked,
  scanFrameSize,
  compact,
  onClose,
  onBarcodeScanned,
}: {
  visible: boolean;
  pairingBusy: boolean;
  scanLocked: boolean;
  scanFrameSize: number;
  compact: boolean;
  onClose: () => void;
  onBarcodeScanned: ({ data }: { data: string }) => void;
}) {
  if (!visible) return null;

  return (
    <View style={styles.scannerRoot}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanLocked ? undefined : onBarcodeScanned}
      >
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerTopbar}>
            <TouchableOpacity style={styles.scannerClose} onPress={onClose} accessibilityLabel="Chiudi scanner">
              <X size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.scannerCenter}>
            <View style={[styles.scanFrame, { width: scanFrameSize, height: scanFrameSize, borderRadius: compact ? 18 : 24 }]}>
              <ScanLine size={34} color="#FFFFFF" />
            </View>
            <Text style={[styles.scanTitle, compact && styles.scanTitleCompact]}>Inquadra il QR dello studente</Text>
            <Text style={[styles.scanBody, compact && styles.scanBodyCompact]}>Mantieni il codice entro il riquadro per completare l’associazione.</Text>
            {pairingBusy ? <ActivityIndicator color="#FFFFFF" size="large" /> : null}
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FB' },
  header: {
    minHeight: 68,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#D8DFEC',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EEF3FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSpacer: { width: 40, height: 40 },
  title: { fontSize: 22, fontWeight: '800', color: '#1D2A43' },
  content: { flex: 1, padding: 16, gap: 14 },
  contentCompact: { padding: 14 },
  hero: {
    borderRadius: 18,
    backgroundColor: '#1F3C88',
    padding: 18,
    gap: 8,
  },
  heroBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: { fontSize: 28, fontWeight: '900', color: '#FFFFFF' },
  heroNameCompact: { fontSize: 24, lineHeight: 30 },
  heroUser: { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.82)' },
  card: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8DFEC',
    padding: 18,
    gap: 10,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#1D2A43' },
  cardBody: { fontSize: 14, lineHeight: 20, color: '#59657A' },
  primaryBtn: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#1F3C88',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  logoutBtn: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#C62828',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 'auto',
  },
  logoutText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  scannerRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#05070B',
  },
  camera: { flex: 1 },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,7,11,0.44)',
    padding: 18,
  },
  scannerTopbar: {
    paddingTop: 28,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  scannerClose: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  scanFrame: {
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  scanTitleCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  scanBody: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 280,
  },
  scanBodyCompact: {
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 240,
  },
});
