import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Banknote, CheckCircle2, CircleDollarSign, Minus, PartyPopper, Plus, RefreshCcw } from 'lucide-react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { MoneyChip } from '../../components/money/MoneyVisualizer';
import { MoneyItem } from '../../api/database.types';
import { EURO_DENOMINATIONS, formatEuro } from '../../utils/paymentLogic';
import { studentTheme as t } from '../../theme';
import { getMoneyImageUri } from '../../constants/moneyImages';

type Props = StackScreenProps<RootStackParamList, 'Training'>;
type CountMap = Record<string, number>;

const TRAINING_DENOMS = EURO_DENOMINATIONS;
const round2 = (n: number) => Math.round(n * 100) / 100;
const keyFor = (value: number) => value.toFixed(2);

function makeTrainingItem(value: number): MoneyItem {
  return {
    id: `training-${value}`,
    value,
    type: value >= 5 ? 'bill' : 'coin',
    imageUri: getMoneyImageUri(value),
  };
}

function createTarget(): number {
  const easyPool = [0.5, 1, 2, 5, 10, 20];
  const centPool = [0, 0.1, 0.2, 0.5, 0.7, 0.9];
  const base = easyPool[Math.floor(Math.random() * easyPool.length)] ?? 0;
  const extra = easyPool[Math.floor(Math.random() * easyPool.length)] ?? 0;
  const cents = centPool[Math.floor(Math.random() * centPool.length)] ?? 0;
  return round2(Math.min(50, base + extra + cents));
}

function totalFromCounts(counts: CountMap): number {
  return round2(
    TRAINING_DENOMS.reduce((sum, value) => sum + value * (counts[keyFor(value)] ?? 0), 0),
  );
}

function buildSelectedItems(counts: CountMap): MoneyItem[] {
  return TRAINING_DENOMS.flatMap((value) =>
    Array.from({ length: counts[keyFor(value)] ?? 0 }, (_, index) => ({
      id: `selected-${value}-${index}`,
      value,
      type: value >= 5 ? 'bill' : 'coin',
      imageUri: getMoneyImageUri(value),
    })),
  );
}

function hintFor(target: number, selectedTotal: number): string {
  const diff = round2(target - selectedTotal);
  if (diff === 0) return 'Perfetto: hai dato i soldi giusti.';
  if (diff > 0) return `Mancano ${formatEuro(diff)}. Aggiungi un taglio adatto.`;
  return `Hai dato ${formatEuro(Math.abs(diff))} in piu. Togli qualcosa.`;
}

export default function Training({ navigation }: Props) {
  const [target, setTarget] = useState(createTarget);
  const [counts, setCounts] = useState<CountMap>({});
  const [feedback, setFeedback] = useState('');
  const [success, setSuccess] = useState(false);
  const celebration = useSharedValue(0);
  const bannerOpacity = useSharedValue(0);
  const bannerTranslateY = useSharedValue(-12);

  const stickyBannerStyle = useAnimatedStyle(() => ({
    opacity: bannerOpacity.value,
    transform: [{ translateY: bannerTranslateY.value }],
  }));

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const visible = event.nativeEvent.contentOffset.y > 130;
    bannerOpacity.value = withTiming(visible ? 1 : 0, { duration: 200 });
    bannerTranslateY.value = withTiming(visible ? 0 : -12, { duration: 200 });
  }, [bannerOpacity, bannerTranslateY]);

  const selectedTotal = useMemo(() => totalFromCounts(counts), [counts]);
  const selectedItems = useMemo(() => buildSelectedItems(counts), [counts]);
  const remaining = round2(target - selectedTotal);
  const exact = remaining === 0;
  const totalPieces = selectedItems.length;

  const celebrationStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + celebration.value * 0.08 }],
  }));

  const updateCount = useCallback((value: number, delta: 1 | -1) => {
    setSuccess(false);
    setFeedback('Continua a comporre la cifra esatta.');
    setCounts((current) => {
      const key = keyFor(value);
      const nextValue = Math.max(0, (current[key] ?? 0) + delta);
      const next = { ...current };
      if (nextValue === 0) {
        delete next[key];
      } else {
        next[key] = nextValue;
      }
      return next;
    });
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const checkAnswer = useCallback(() => {
    if (exact) {
      setSuccess(true);
      setFeedback('Perfetto! Hai pagato con i soldi giusti, senza resto.');
      celebration.value = 0;
      celebration.value = withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 420 }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }

    setSuccess(false);
    setFeedback(hintFor(target, selectedTotal));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [celebration, exact, selectedTotal, target]);

  const clearSelection = useCallback(() => {
    setCounts({});
    setSuccess(false);
    setFeedback('Selezione pulita. Riprova con calma.');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const nextRound = useCallback(() => {
    setTarget(createTarget());
    setCounts({});
    setSuccess(false);
    setFeedback('Nuova cifra: prepara i soldi giusti.');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Torna indietro"
        >
          <ArrowLeft size={24} color={t.colors.text} />
        </TouchableOpacity>

        <View style={styles.topCopy}>
          <Text style={styles.kicker}>Allenamento</Text>
          <Text style={styles.topTitle}>Metti i soldi giusti</Text>
        </View>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={nextRound}
          accessibilityRole="button"
          accessibilityLabel="Nuova cifra"
        >
          <RefreshCcw size={22} color={t.colors.text} />
        </TouchableOpacity>
      </View>

      <Animated.View pointerEvents="none" style={[styles.stickyAmountBanner, stickyBannerStyle]}>
        <View style={styles.stickyAmountGroup}>
          <Text style={styles.stickyAmountLabel}>Da pagare</Text>
          <Text style={styles.stickyAmountValue} numberOfLines={1} adjustsFontSizeToFit>{formatEuro(target)}</Text>
        </View>
        <View style={[styles.stickyAmountGroup, styles.stickyAmountGroupRight]}>
          <Text style={styles.stickyAmountLabel}>Hai messo</Text>
          <Text style={styles.stickyAmountValue} numberOfLines={1} adjustsFontSizeToFit>{formatEuro(selectedTotal)}</Text>
        </View>
      </Animated.View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <Animated.View style={[styles.heroCard, success && styles.heroCardSuccess, celebrationStyle]}>
          <View style={styles.heroTop}>
            <View style={styles.heroBadge}>
              {success
                ? <CheckCircle2 size={24} color={t.colors.onSuccess} />
                : <Banknote size={24} color={t.colors.onPrimary} />}
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>Importo da comporre</Text>
              <Text style={styles.heroAmount}>{formatEuro(target)}</Text>
            </View>
          </View>
        </Animated.View>

        <View style={styles.statusRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Hai messo</Text>
            <Text style={styles.metricValue}>{formatEuro(selectedTotal)}</Text>
            <Text style={styles.metricSub}>{totalPieces} pezzi sul banco</Text>
          </View>
          <View
            style={[
              styles.metricCard,
              exact ? styles.metricCardPositive : remaining < 0 ? styles.metricCardAlert : null,
            ]}
          >
            <Text style={styles.metricLabel}>{exact ? 'Esatto' : remaining > 0 ? 'Manca' : 'In piu'}</Text>
            <Text style={styles.metricValue}>{formatEuro(Math.abs(remaining))}</Text>
            <Text style={styles.metricSub}>
              {exact ? 'Nessun resto necessario' : remaining > 0 ? 'Devi aggiungere ancora' : 'Devi togliere qualcosa'}
            </Text>
          </View>
        </View>

        {success ? (
          <Animated.View entering={FadeIn.duration(180)} style={styles.successBanner}>
            <CheckCircle2 size={28} color={t.colors.onSuccess} />
            <Text style={styles.successBannerText}>Bravo, pagamento corretto.</Text>
            <PartyPopper size={22} color={t.colors.onSuccess} />
          </Animated.View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Cassa di prova</Text>
              <Text style={styles.sectionHint}>Scegli monete e banconote.</Text>
            </View>
            <View style={styles.sectionIconWrap}>
              <Banknote size={18} color={t.colors.primary} />
            </View>
          </View>

          <View style={styles.denomList}>
            {TRAINING_DENOMS.map((value) => {
              const count = counts[keyFor(value)] ?? 0;
              const item = makeTrainingItem(value);

              return (
                <View key={value} style={styles.denomCard}>
                  <View style={styles.denomInfo}>
                    <MoneyChip item={item} size="small" />
                    <View style={styles.denomCopy}>
                      <Text style={styles.denomValue}>{formatEuro(value)}</Text>
                      <Text style={styles.denomCaption}>{value >= 5 ? 'Banconota' : 'Moneta'}</Text>
                    </View>
                  </View>

                  <View style={styles.stepper}>
                    <TouchableOpacity
                      style={[styles.stepperButton, count === 0 && styles.stepperButtonDisabled]}
                      onPress={() => updateCount(value, -1)}
                      disabled={count === 0}
                      accessibilityRole="button"
                      accessibilityLabel={`Togli ${formatEuro(value)}`}
                    >
                      <Minus size={18} color={count === 0 ? t.colors.textDisabled : t.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.stepperCount}>{count}</Text>
                    <TouchableOpacity
                      style={[styles.stepperButton, styles.stepperButtonPrimary]}
                      onPress={() => updateCount(value, 1)}
                      accessibilityRole="button"
                      accessibilityLabel={`Aggiungi ${formatEuro(value)}`}
                    >
                      <Plus size={18} color={t.colors.onPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Sul banco</Text>
              <Text style={styles.sectionHint}>{feedback || 'Totale scelto sul banco.'}</Text>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={clearSelection}
              accessibilityRole="button"
              accessibilityLabel="Pulisci selezione"
            >
              <Text style={styles.clearButtonText}>Pulisci</Text>
            </TouchableOpacity>
          </View>

          {selectedItems.length > 0 ? (
            <View style={styles.selectedGrid}>
              {selectedItems.slice(0, 24).map((item) => (
                <MoneyChip key={item.id} item={item} size="small" />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <CircleDollarSign size={22} color={t.colors.textSecondary} />
              <Text style={styles.emptyTitle}>Nessun taglio selezionato</Text>
            </View>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={nextRound}
            accessibilityRole="button"
            accessibilityLabel="Nuova cifra da pagare"
          >
            <Text style={styles.secondaryButtonText}>Nuova cifra</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={checkAnswer}
            accessibilityRole="button"
            accessibilityLabel="Controlla risultato"
          >
            <Text style={styles.primaryButtonText}>Controlla</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: t.colors.surface,
  },
  topBar: {
    minHeight: 72,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: t.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: '#D8DFEC',
    gap: 12,
  },
  iconButton: {
    width: t.spacing.touchTarget,
    height: t.spacing.touchTarget,
    borderRadius: 10,
    backgroundColor: '#EEF3FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCopy: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  kicker: {
    fontSize: t.typography.sizeSM,
    fontWeight: '800',
    color: t.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0,
    textAlign: 'center',
  },
  topTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: t.colors.text,
    textAlign: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  stickyAmountBanner: {
    position: 'absolute',
    top: 82,
    left: 16,
    right: 16,
    zIndex: 20,
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: '#082C6C',
    borderWidth: 1,
    borderColor: '#C7D7F3',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stickyAmountGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  stickyAmountGroupRight: {
    alignItems: 'flex-end',
  },
  stickyAmountLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  stickyAmountValue: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  heroCard: {
    borderRadius: 18,
    backgroundColor: t.colors.primary,
    padding: 18,
    gap: 12,
  },
  heroCardSuccess: {
    backgroundColor: t.colors.success,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    fontSize: t.typography.sizeSM,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroAmount: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  heroBody: {
    fontSize: t.typography.sizeSM,
    lineHeight: t.typography.sizeSM * t.typography.lineHeightBody,
    color: '#FFFFFF',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: t.colors.background,
    borderWidth: 1,
    borderColor: '#D8DFEC',
    padding: 16,
    gap: 6,
  },
  metricCardPositive: {
    backgroundColor: '#EAF7EF',
    borderColor: '#9FD1AE',
  },
  metricCardAlert: {
    backgroundColor: '#FFF1F1',
    borderColor: '#E6B0B0',
  },
  metricLabel: {
    fontSize: t.typography.sizeSM,
    fontWeight: '800',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: t.colors.text,
  },
  metricSub: {
    fontSize: t.typography.sizeSM,
    lineHeight: t.typography.sizeSM * t.typography.lineHeightBody,
    color: t.colors.textSecondary,
  },
  successBanner: {
    borderRadius: 18,
    backgroundColor: t.colors.success,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  successBannerText: {
    flex: 1,
    fontSize: t.typography.sizeSM,
    fontWeight: '800',
    color: t.colors.onSuccess,
    textAlign: 'center',
  },
  feedbackCard: {
    borderRadius: 18,
    backgroundColor: '#FFF6E8',
    borderWidth: 1,
    borderColor: '#E3C98C',
    padding: 16,
    gap: 6,
  },
  feedbackTitle: {
    fontSize: t.typography.sizeSM,
    fontWeight: '800',
    color: t.colors.warning,
    textTransform: 'uppercase',
  },
  feedbackText: {
    fontSize: t.typography.sizeSM,
    lineHeight: t.typography.sizeSM * t.typography.lineHeightBody,
    fontWeight: '600',
    color: t.colors.text,
  },
  sectionCard: {
    borderRadius: 18,
    backgroundColor: t.colors.background,
    borderWidth: 1,
    borderColor: '#D8DFEC',
    padding: 16,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionCopy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: t.colors.text,
  },
  sectionHint: {
    fontSize: t.typography.sizeSM,
    lineHeight: t.typography.sizeSM * t.typography.lineHeightBody,
    color: t.colors.textSecondary,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF3FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  denomList: {
    gap: 10,
  },
  denomCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D8DFEC',
    backgroundColor: '#FBFCFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  denomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  denomCopy: {
    gap: 2,
  },
  denomValue: {
    fontSize: t.typography.sizeSM,
    fontWeight: '800',
    color: t.colors.text,
  },
  denomCaption: {
    fontSize: t.typography.sizeSM,
    color: t.colors.textSecondary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  stepperButton: {
    width: t.spacing.touchTarget,
    height: t.spacing.touchTarget,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8DFEC',
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonPrimary: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
  stepperButtonDisabled: {
    opacity: 0.45,
  },
  stepperCount: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: t.typography.sizeSM,
    fontWeight: '800',
    color: t.colors.text,
  },
  clearButton: {
    minHeight: t.spacing.touchTarget,
    borderRadius: 12,
    backgroundColor: '#EEF3FA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  clearButtonText: {
    fontSize: t.typography.sizeSM,
    fontWeight: '800',
    color: t.colors.text,
  },
  selectedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  emptyState: {
    borderRadius: 14,
    backgroundColor: '#F7F9FC',
    borderWidth: 1,
    borderColor: '#D8DFEC',
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: t.typography.sizeSM,
    fontWeight: '800',
    color: t.colors.text,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: t.typography.sizeSM,
    lineHeight: t.typography.sizeSM * t.typography.lineHeightBody,
    color: t.colors.textSecondary,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 2,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#EEF3FA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: t.typography.sizeSM,
    fontWeight: '800',
    color: t.colors.text,
  },
  primaryButton: {
    flex: 1.2,
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    fontSize: t.typography.sizeSM,
    fontWeight: '800',
    color: t.colors.onPrimary,
  },
});
