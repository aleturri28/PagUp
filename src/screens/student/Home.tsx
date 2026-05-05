import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { GraduationCap, LockKeyhole, Settings, Store, WalletCards, X } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useWalletStore } from '../../store/useWalletStore';
import { formatEuro } from '../../utils/paymentLogic';
import { studentTheme as t } from '../../theme';

type Props = StackScreenProps<RootStackParamList, 'StudentHome'>;

const TUTOR_PIN = process.env.EXPO_PUBLIC_TUTOR_PIN ?? '1234';
const SETTINGS_HOLD_MS = 3000;

export default function StudentHome({ navigation }: Props) {
  const inventory = useWalletStore((s) => s.inventory);
  const balance = inventory.reduce((sum, item) => sum + item.value, 0);
  const [pinVisible, setPinVisible] = useState(false);
  const [pin, setPin] = useState('');
  const settingsHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const submitPin = useCallback(() => {
    if (pin === TUTOR_PIN) {
      closeSettingsGate();
      navigation.navigate('Settings', { unlocked: true });
      return;
    }

    Alert.alert('PIN errato', 'Inserisci il PIN del tutor associato a questa app.');
    setPin('');
  }, [closeSettingsGate, navigation, pin]);

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
              onSubmitEditing={submitPin}
            />
            <TouchableOpacity
              style={styles.pinSubmit}
              onPress={submitPin}
              accessibilityRole="button"
              accessibilityLabel="Conferma PIN tutor"
            >
              <Text style={styles.pinSubmitText}>Apri impostazioni</Text>
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
});
