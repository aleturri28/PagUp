import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StackScreenProps } from '@react-navigation/stack';
import { ArrowLeft, Camera, KeyRound, LogOut, ScanLine, ShieldCheck, X } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { getProfile, signOut, updateTutorPin } from '../../api/auth';
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

export default function TutorSettings({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  const stopSync = useWalletStore((s) => s.stopSync);
  const [loading, setLoading] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileUsername, setProfileUsername] = useState('');
  const [currentTutorPin, setCurrentTutorPin] = useState<string | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [tutorId, setTutorId] = useState<string | null>(null);
  const compact = width < 390;
  const scanFrameSize = Math.max(200, Math.min(width - 72, 260));
  const requiresInitialPinSetup = route.params?.requirePinSetup === true;
  const hasExistingPin = !!currentTutorPin;

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
      setCurrentTutorPin(profile.tutorPin);

      if (requiresInitialPinSetup || !profile.tutorPin) {
        setPinModalVisible(true);
      }
    }

    loadProfile().catch((error) => {
      Alert.alert('Profilo non disponibile', error instanceof Error ? error.message : 'Riprova.');
    });

    return () => {
      mounted = false;
    };
  }, [requiresInitialPinSetup]);

  const resetPinForm = useCallback(() => {
    setOldPin('');
    setNewPin('');
    setConfirmPin('');
  }, []);

  const closePinModal = useCallback(() => {
    if (requiresInitialPinSetup && !currentTutorPin) {
      return;
    }
    setPinModalVisible(false);
    resetPinForm();
  }, [currentTutorPin, requiresInitialPinSetup, resetPinForm]);

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

  const handleSavePin = useCallback(async () => {
    if (!tutorId) return;
    if (hasExistingPin && oldPin !== currentTutorPin) {
      Alert.alert('PIN attuale errato', 'Inserisci il PIN tutor attuale per modificarlo.');
      return;
    }
    if (!/^\d{4,8}$/.test(newPin)) {
      Alert.alert('PIN non valido', 'Usa un PIN numerico da 4 a 8 cifre.');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('PIN non coincidenti', 'Il nuovo PIN e la conferma devono coincidere.');
      return;
    }

    setPinBusy(true);
    try {
      await updateTutorPin(tutorId, newPin);
      setCurrentTutorPin(newPin);
      setPinModalVisible(false);
      resetPinForm();
      Alert.alert('PIN aggiornato', hasExistingPin ? 'Il PIN tutor è stato modificato.' : 'Il PIN tutor è stato impostato.');
    } catch (error) {
      Alert.alert('PIN non salvato', error instanceof Error ? error.message : 'Riprova.');
    } finally {
      setPinBusy(false);
    }
  }, [confirmPin, currentTutorPin, hasExistingPin, newPin, oldPin, resetPinForm, tutorId]);

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

  const pinCardBody = useMemo(() => (
    <>
      <Text style={styles.cardTitle}>Gestisci PIN</Text>
      <Text style={styles.cardBody}>
        {currentTutorPin
          ? 'Modifica il PIN che sblocca le impostazioni dello studente.'
          : 'Imposta il PIN che verrà richiesto allo studente per aprire le impostazioni protette.'}
      </Text>
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => setPinModalVisible(true)}>
        <KeyRound size={18} color="#1F3C88" />
        <Text style={styles.secondaryBtnText}>{currentTutorPin ? 'Modifica PIN' : 'Imposta PIN'}</Text>
      </TouchableOpacity>
    </>
  ), [currentTutorPin]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel="Indietro">
          <ArrowLeft size={22} color="#1D2A43" />
        </TouchableOpacity>
        <Text style={styles.title}>Impostazioni Tutor</Text>
        <View style={styles.iconSpacer} />
      </View>

      <View style={[styles.content, compact && styles.contentCompact]}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <ShieldCheck size={22} color="#FFFFFF" />
          </View>
          <Text style={[styles.heroName, compact && styles.heroNameCompact]}>{profileName}</Text>
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

        <View style={styles.card}>
          {pinCardBody}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <LogOut size={20} color="#FFFFFF" />}
          <Text style={styles.logoutText}>{loading ? 'Uscita...' : 'Esci dall’account'}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={pinModalVisible} transparent animationType="fade" onRequestClose={closePinModal}>
        <View style={styles.overlay}>
          <View style={styles.pinModal}>
            <View style={styles.pinModalTop}>
              <View style={styles.pinBadge}>
                <KeyRound size={18} color="#1F3C88" />
              </View>
              {!requiresInitialPinSetup || currentTutorPin ? (
                <TouchableOpacity style={styles.closeBtn} onPress={closePinModal} accessibilityLabel="Chiudi">
                  <X size={18} color="#1D2A43" />
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.pinTitle}>{currentTutorPin ? 'Modifica PIN tutor' : 'Imposta PIN tutor'}</Text>
            <Text style={styles.pinText}>
              {currentTutorPin
                ? 'Per modificarlo inserisci prima il PIN attuale.'
                : 'Questo PIN verrà chiesto allo studente per aprire le impostazioni protette.'}
            </Text>

            {currentTutorPin ? (
              <TextInput
                value={oldPin}
                onChangeText={setOldPin}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                placeholder="PIN attuale"
                style={styles.pinInput}
                placeholderTextColor="#8A93A6"
              />
            ) : null}

            <TextInput
              value={newPin}
              onChangeText={setNewPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="Nuovo PIN"
              style={styles.pinInput}
              placeholderTextColor="#8A93A6"
            />
            <TextInput
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="Conferma nuovo PIN"
              style={styles.pinInput}
              placeholderTextColor="#8A93A6"
            />

            <TouchableOpacity style={[styles.primaryBtn, pinBusy && styles.buttonDisabled]} onPress={() => { handleSavePin().catch(() => {}); }} disabled={pinBusy}>
              {pinBusy ? <ActivityIndicator color="#FFFFFF" /> : <KeyRound size={18} color="#FFFFFF" />}
              <Text style={styles.primaryBtnText}>{pinBusy ? 'Salvo...' : 'Salva PIN'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ModalCamera
        visible={scannerVisible}
        pairingBusy={pairingBusy}
        scanLocked={scanLocked}
        scanFrameSize={scanFrameSize}
        compact={compact}
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
  secondaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#EEF3FA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnText: { color: '#1F3C88', fontSize: 15, fontWeight: '800' },
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
  buttonDisabled: { opacity: 0.72 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 16, 31, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pinModal: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8DFEC',
    padding: 18,
    gap: 12,
  },
  pinModalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pinBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EEF3FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinTitle: { fontSize: 24, fontWeight: '900', color: '#1D2A43' },
  pinText: { fontSize: 14, lineHeight: 20, color: '#59657A' },
  pinInput: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D8DFEC',
    backgroundColor: '#F8FAFE',
    paddingHorizontal: 14,
    color: '#1D2A43',
    fontSize: 16,
    fontWeight: '700',
  },
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
