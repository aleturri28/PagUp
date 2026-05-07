import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import QRCode from 'react-native-qrcode-svg';
import { GraduationCap, Link2, LockKeyhole, Settings, Store, UserPlus, WalletCards, X } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { supabase } from '../../api/supabase';
import { useWalletStore } from '../../store/useWalletStore';
import { formatEuro } from '../../utils/paymentLogic';
import { studentTheme as t } from '../../theme';

type Props = StackScreenProps<RootStackParamList, 'StudentHome'>;

const SETTINGS_HOLD_MS = 3000;
const PAIRING_PREFIX = 'pagup-student:';

export default function StudentHome({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const inventory = useWalletStore((s) => s.inventory);
  const balance = inventory.reduce((sum, item) => sum + item.value, 0);
  const [pinVisible, setPinVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [paired, setPaired] = useState<boolean | null>(null);
  const [pairingQrVisible, setPairingQrVisible] = useState(false);
  const [checkingPin, setCheckingPin] = useState(false);
  const settingsHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compact = width < 390;
  const qrBoxSize = Math.max(220, Math.min(width - 72, 286));
  const qrCodeSize = Math.max(180, Math.min(qrBoxSize - 38, 230));
  const pairingValue = studentId ? `${PAIRING_PREFIX}${studentId}` : '';

  useEffect(() => {
    let active = true;

    async function loadStudent() {
      try {
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        setStudentId(data.user?.id ?? null);
      } catch {
        if (!active) return;
        setStudentId(null);
      }
    }

    loadStudent().catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const refreshPairingState = useCallback(async (currentStudentId: string) => {
    const { data: links, error } = await supabase
      .from('tutor_students')
      .select('tutor_id')
      .eq('student_id', currentStudentId);

    if (error) throw error;
    setPaired((links?.length ?? 0) > 0);
  }, []);

  useEffect(() => {
    if (!studentId) {
      setPaired(null);
      return;
    }

    let active = true;

    refreshPairingState(studentId).catch((error) => {
      if (!active) return;
      console.warn('[StudentHome] Impossibile leggere associazione tutor:', error);
      setPaired(false);
    });

    const channel = supabase
      .channel(`student-pairing:${studentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tutor_students',
          filter: `student_id=eq.${studentId}`,
        },
        () => {
          refreshPairingState(studentId).catch((error) => {
            if (!active) return;
            console.warn('[StudentHome] Refresh associazione tutor fallito:', error);
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [refreshPairingState, studentId]);

  const clearSettingsHoldTimer = useCallback(() => {
    if (settingsHoldTimer.current) {
      clearTimeout(settingsHoldTimer.current);
      settingsHoldTimer.current = null;
    }
  }, []);

  const openSettingsGate = useCallback(() => {
    clearSettingsHoldTimer();
    setPin('');
    setPinVisible(true);
  }, [clearSettingsHoldTimer]);

  const startSettingsHold = useCallback(() => {
    clearSettingsHoldTimer();
    settingsHoldTimer.current = setTimeout(openSettingsGate, SETTINGS_HOLD_MS);
  }, [clearSettingsHoldTimer, openSettingsGate]);

  useEffect(() => clearSettingsHoldTimer, [clearSettingsHoldTimer]);

  const closeSettingsGate = useCallback(() => {
    setPin('');
    setPinVisible(false);
  }, []);

  const submitPin = useCallback(async () => {
    if (!studentId) {
      Alert.alert('Profilo non disponibile', 'Riapri l’app e riprova.');
      return;
    }

    const normalizedPin = pin.trim();
    if (!normalizedPin) {
      Alert.alert('PIN mancante', 'Inserisci il PIN del tutor per continuare.');
      return;
    }

    setCheckingPin(true);
    try {
      const { data: links, error: linksError } = await supabase
        .from('tutor_students')
        .select('tutor_id')
        .eq('student_id', studentId);

      if (linksError) throw linksError;
      const tutorIds = [...new Set((links ?? []).map((entry) => entry.tutor_id))];
      if (tutorIds.length === 0) {
        throw new Error('Nessun tutor associato a questo profilo.');
      }

      const { data: tutors, error: tutorsError } = await supabase
        .from('profiles')
        .select('id, tutor_pin')
        .in('id', tutorIds);

      if (tutorsError) throw tutorsError;
      const availablePins = (tutors ?? []).map((tutor) => tutor.tutor_pin).filter((value): value is string => !!value);
      if (availablePins.length === 0) {
        throw new Error('Il tutor associato non ha ancora impostato un PIN.');
      }
      const hasMatch = availablePins.some((value) => value.trim() === normalizedPin);

      if (!hasMatch) {
        Alert.alert('PIN errato', 'Inserisci il PIN del tutor associato a questa app.');
        setPin('');
        return;
      }

      closeSettingsGate();
      navigation.push('Settings', { unlocked: true });
    } catch (error) {
      Alert.alert('Accesso non riuscito', error instanceof Error ? error.message : 'Riprova.');
    } finally {
      setCheckingPin(false);
    }
  }, [closeSettingsGate, navigation, pin, studentId]);

  if (paired === null) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={t.colors.primary} />
          <Text style={styles.loadingText}>Carico il profilo studente...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!paired) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={[styles.unpairedContent, compact && styles.unpairedContentCompact]}>
          <View style={styles.unpairedHero}>
            <View style={styles.unpairedBadge}>
              <Link2 size={24} color={t.colors.onPrimary} />
            </View>
            <Text style={styles.unpairedTitle}>Collega il tuo tutor per iniziare</Text>
            <Text style={styles.unpairedText}>
              Finche il tutor non scansiona il tuo QR, l&apos;account studente resta in attesa e non mostra pagamenti o allenamento.
            </Text>
          </View>

          <View style={styles.unpairedCard}>
            <View style={[styles.unpairedQrBox, { width: qrBoxSize, height: qrBoxSize }]}>
              {pairingValue ? <QRCode value={pairingValue} size={qrCodeSize} quietZone={12} /> : null}
            </View>
            <Text style={styles.unpairedQrTitle}>Mostra questo QR al tutor</Text>
            <Text style={styles.unpairedQrText}>
              Appena il tutor completa l&apos;associazione, questa schermata si aggiorna e la home studente si attiva.
            </Text>
            <TouchableOpacity
              style={styles.unpairedPrimaryAction}
              onPress={() => setPairingQrVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Apri QR studente a schermo intero"
            >
              <UserPlus size={20} color={t.colors.onPrimary} />
              <Text style={styles.unpairedPrimaryActionText}>Apri QR grande</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Modal
          visible={pairingQrVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPairingQrVisible(false)}
        >
          <SafeAreaView style={styles.modalRoot}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Link2 size={22} color={t.colors.primary} />
                <Text style={styles.modalTitle}>Pairing studente</Text>
              </View>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setPairingQrVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Chiudi QR studente"
              >
                <X size={20} color={t.colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.qrStage}>
              <View style={[styles.qrModalBox, { width: qrBoxSize, height: qrBoxSize }]}>
                {pairingValue ? <QRCode value={pairingValue} size={qrCodeSize} quietZone={12} /> : null}
              </View>
              <Text style={styles.qrModalTitle}>Mostra questo QR al tutor</Text>
              <Text style={styles.qrModalText}>
                Quando viene scansionato, la home studente si sblocca automaticamente.
              </Text>
            </View>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.settingsButton}
          onPressIn={startSettingsHold}
          onPressOut={clearSettingsHoldTimer}
          accessibilityRole="button"
          accessibilityLabel="Apri impostazioni protette"
          accessibilityHint="Tieni premuto per tre secondi, poi inserisci il PIN tutor"
        >
          <Settings size={26} color={t.colors.primary} />
        </TouchableOpacity>
      </View>

      <View
        style={styles.balanceCard}
        accessible
        accessibilityLabel={`Hai ${formatEuro(balance)} nel portafoglio`}
        accessibilityHint="Mostra il saldo attuale del tuo portafoglio"
      >
        <View style={styles.balanceRow}>
          <WalletCards size={20} color={t.colors.textSecondary} />
          <Text style={styles.balanceLabel}>Il tuo saldo:</Text>
        </View>
        <Text style={styles.balanceAmount}>{formatEuro(balance)}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.action, styles.payAction]}
          onPress={() => navigation.navigate('PaymentWizard')}
          accessibilityRole="button"
          accessibilityLabel="Vai a pagare"
          accessibilityHint="Apre la procedura di pagamento guidata"
        >
          <Store size={64} color={t.colors.onPrimary} />
          <Text style={styles.actionTitle}>Paga alla cassa</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.action, styles.trainingAction]}
          onPress={() => navigation.navigate('Training')}
          accessibilityRole="button"
          accessibilityLabel="Vai ad allenarti"
          accessibilityHint="Apre la modalità allenamento senza usare soldi veri"
        >
          <GraduationCap size={64} color={t.colors.primary} />
          <Text style={[styles.actionTitle, styles.trainingTitle]}>Allenati</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={pinVisible} transparent animationType="fade" onRequestClose={closeSettingsGate}>
        <KeyboardAvoidingView
          style={styles.pinOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.pinCard}>
            <View style={styles.pinHeader}>
              <View style={styles.pinIconWrap}>
                <LockKeyhole size={24} color={t.colors.primary} />
              </View>
              <TouchableOpacity
                style={styles.pinClose}
                onPress={closeSettingsGate}
                accessibilityRole="button"
                accessibilityLabel="Chiudi richiesta PIN"
              >
                <X size={20} color={t.colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.pinTitle}>PIN tutor</Text>
            <Text style={styles.pinText}>Inserisci il PIN del tutor associato per aprire le impostazioni.</Text>
            <TextInput
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="PIN"
              placeholderTextColor={t.colors.textDisabled}
              style={styles.pinInput}
              accessibilityLabel="PIN tutor"
              onSubmitEditing={() => { submitPin().catch(() => {}); }}
            />
            <TouchableOpacity
              style={styles.pinSubmit}
              onPress={() => { submitPin().catch(() => {}); }}
              accessibilityRole="button"
              accessibilityLabel="Conferma PIN tutor"
            >
              <Text style={styles.pinSubmitText}>{checkingPin ? 'Verifica...' : 'Apri impostazioni'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: t.colors.surface,
    paddingHorizontal: t.spacing.lg,
    paddingBottom: t.spacing.lg,
    gap: t.spacing.md,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
  },
  loadingText: {
    color: t.colors.textSecondary,
    fontSize: 16,
    fontWeight: t.typography.weightSemiBold,
  },
  unpairedContent: {
    flex: 1,
    justifyContent: 'center',
    gap: t.spacing.lg,
    paddingTop: t.spacing.md,
    paddingBottom: t.spacing.xl,
  },
  unpairedContentCompact: {
    gap: t.spacing.md,
  },
  unpairedHero: {
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.primary,
    padding: t.spacing.lg,
    gap: t.spacing.sm,
  },
  unpairedBadge: {
    width: 48,
    height: 48,
    borderRadius: t.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unpairedTitle: {
    color: t.colors.onPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: t.typography.weightBold,
  },
  unpairedText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: t.typography.weightMedium,
  },
  unpairedCard: {
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.background,
    padding: t.spacing.lg,
    alignItems: 'center',
    gap: t.spacing.md,
  },
  unpairedQrBox: {
    borderRadius: t.radius.xl,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unpairedQrTitle: {
    color: t.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: t.typography.weightBold,
    textAlign: 'center',
  },
  unpairedQrText: {
    color: t.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  unpairedPrimaryAction: {
    minHeight: t.spacing.touchTarget,
    minWidth: '100%',
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.primary,
    paddingHorizontal: t.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
  },
  unpairedPrimaryActionText: {
    color: t.colors.onPrimary,
    fontSize: 16,
    fontWeight: t.typography.weightBold,
  },
  topRow: {
    paddingTop: t.spacing.md,
    alignItems: 'flex-start',
  },
  settingsButton: {
    width: t.spacing.touchTarget,
    height: t.spacing.touchTarget,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  pinOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 17, 28, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pinCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 22,
    gap: 14,
  },
  pinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pinIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinClose: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinTitle: {
    color: t.colors.text,
    fontSize: 26,
    fontWeight: t.typography.weightBold,
  },
  pinText: {
    color: t.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: t.typography.weightMedium,
  },
  pinInput: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#D6DEEA',
    paddingHorizontal: 16,
    color: t.colors.text,
    fontSize: 20,
    fontWeight: t.typography.weightBold,
    letterSpacing: 0,
  },
  pinSubmit: {
    minHeight: 56,
    borderRadius: 8,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pinSubmitText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: t.typography.weightBold,
  },
  balanceCard: {
    backgroundColor: t.colors.background,
    borderRadius: t.radius.xl,
    borderWidth: 2,
    borderColor: t.colors.primary,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.lg,
    gap: t.spacing.xs,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
  },
  balanceLabel: {
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightMedium,
    color: t.colors.textSecondary,
  },
  balanceAmount: {
    fontSize: t.typography.sizeXXL,
    fontWeight: t.typography.weightBold,
    color: t.colors.primary,
    lineHeight: t.typography.sizeXXL * t.typography.lineHeightHeading,
  },
  actions: {
    flex: 1,
    gap: t.spacing.md,
  },
  action: {
    flex: 1,
    borderRadius: t.radius.xl,
    padding: t.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.md,
  },
  payAction: {
    backgroundColor: t.colors.primary,
  },
  trainingAction: {
    backgroundColor: '#FFE56B',
  },
  actionTitle: {
    fontSize: t.typography.sizeLG,
    fontWeight: t.typography.weightBold,
    color: t.colors.onPrimary,
    textAlign: 'center',
  },
  trainingTitle: {
    color: t.colors.primary,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: t.colors.surface,
  },
  modalHeader: {
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
  },
  modalTitle: {
    color: t.colors.text,
    fontSize: 22,
    fontWeight: t.typography.weightBold,
  },
  modalClose: {
    width: 42,
    height: 42,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.spacing.xl,
    gap: t.spacing.md,
  },
  qrModalBox: {
    borderRadius: t.radius.xl,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrModalTitle: {
    color: t.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: t.typography.weightBold,
    textAlign: 'center',
  },
  qrModalText: {
    color: t.colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
});
