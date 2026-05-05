import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, CheckCircle2, Minus, PartyPopper, Plus, RefreshCcw, Sparkles } from 'lucide-react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { MoneyChip } from '../../components/money/MoneyVisualizer';
import { MoneyItem } from '../../api/database.types';
import { EURO_DENOMINATIONS, formatEuro } from '../../utils/paymentLogic';
import { studentTheme as t } from '../../theme';

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
    imageUri: '',
  };
}

function createTarget(): number {
  const easyPool = [0.5, 1, 2, 5, 10, 20];
  const centPool = [0, 0.1, 0.2, 0.5, 0.7, 0.9];
  const base = easyPool[Math.floor(Math.random() * easyPool.length)];
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
      imageUri: '',
    })),
  );
}

function hintFor(target: number, selectedTotal: number): string {
  const diff = round2(target - selectedTotal);
  if (diff === 0) return 'Perfetto: hai dato i soldi giusti.';
  if (diff > 0) return `Mancano ${formatEuro(diff)}. Aggiungi un taglio adatto.`;
  return `Hai dato ${formatEuro(Math.abs(diff))} in più. Togli qualcosa.`;
}

export default function Training({ navigation }: Props) {
  const [target, setTarget] = useState(createTarget);
  const [counts, setCounts] = useState<CountMap>({});
  const [feedback, setFeedback] = useState('Scegli i tagli dalla cassa di prova.');
  const [success, setSuccess] = useState(false);
  const celebration = useSharedValue(0);

  const selectedTotal = useMemo(() => totalFromCounts(counts), [counts]);
  const selectedItems = useMemo(() => buildSelectedItems(counts), [counts]);
  const remaining = round2(target - selectedTotal);
  const exact = remaining === 0;

  const celebrationStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + celebration.value * 0.12 }, { rotate: `${celebration.value * 2}deg` }],
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
    Haptics.selectionAsync();
  }, []);

  const checkAnswer = useCallback(() => {
    if (exact) {
      setSuccess(true);
      setFeedback('Perfetto! Hai pagato con i soldi giusti, senza resto.');
      celebration.value = 0;
      celebration.value = withSequence(withTiming(1, { duration: 180 }), withTiming(0, { duration: 420 }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    setSuccess(false);
    setFeedback(hintFor(target, selectedTotal));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [celebration, exact, selectedTotal, target]);

  const clearSelection = useCallback(() => {
    setCounts({});
    setSuccess(false);
    setFeedback('Selezione pulita. Riprova con calma.');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const nextRound = useCallback(() => {
    setTarget(createTarget());
    setCounts({});
    setSuccess(false);
    setFeedback('Nuova cifra: prepara i soldi giusti.');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      {/* Barra in alto */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Torna indietro"
          accessibilityHint="Torna alla schermata precedente"
        >
          <ArrowLeft size={26} color={t.colors.text} />
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
          accessibilityHint="Genera una nuova cifra casuale da pagare"
        >
          <RefreshCcw size={24} color={t.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Importo target */}
        <Animated.View
          style={[styles.challenge, success && styles.challengeSuccess, celebrationStyle]}
          accessible
          accessibilityLabel={`Devi pagare ${formatEuro(target)}`}
          accessibilityHint="Mostra la cifra che devi pagare in questo esercizio"
        >
          <View style={styles.challengeIcon}>
            {success
              ? <CheckCircle2 size={40} color="#FFFFFF" />
              : <Sparkles size={40} color="#FFFFFF" />
            }
          </View>
          <Text style={styles.challengeLabel}>Devi pagare</Text>
          <Text style={styles.challengeAmount}>{formatEuro(target)}</Text>
        </Animated.View>

        {/* Pannello stato */}
        <View style={styles.statusGrid}>
          <View
            style={styles.statusPanel}
            accessible
            accessibilityLabel={`Hai dato ${formatEuro(selectedTotal)}`}
            accessibilityHint="Mostra il totale dei tagli che hai selezionato"
          >
            <Text style={styles.statusLabel}>Hai dato</Text>
            <Text style={styles.statusValue}>{formatEuro(selectedTotal)}</Text>
          </View>
          <View
            style={[
              styles.statusPanel,
              exact ? styles.statusExact : remaining < 0 ? styles.statusOver : null,
            ]}
            accessible
            accessibilityLabel={
              exact
                ? 'Esatto!'
                : remaining > 0
                  ? `Mancano ${formatEuro(remaining)}`
                  : `In più di ${formatEuro(Math.abs(remaining))}`
            }
            accessibilityHint="Mostra quanto manca o quanto è in più rispetto alla cifra giusta"
          >
            <Text style={styles.statusLabel}>
              {exact ? 'Esatto!' : remaining > 0 ? 'Manca' : 'In più'}
            </Text>
            <Text style={styles.statusValue}>{formatEuro(Math.abs(remaining))}</Text>
          </View>
        </View>

        {/* Feedback di successo enorme */}
        {success && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.successBanner}>
            <CheckCircle2 size={64} color={t.colors.onSuccess} />
            <Text style={styles.successBannerText}>Bravo! Soldi giusti!</Text>
            <PartyPopper size={40} color={t.colors.onSuccess} />
          </Animated.View>
        )}

        {/* Cassa di prova */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Cassa di prova</Text>
              <Text style={styles.sectionHint}>Questi tagli non toccano il portafoglio vero.</Text>
            </View>
            <Sparkles size={22} color={t.colors.error} />
          </View>

          <View style={styles.denomGrid}>
            {TRAINING_DENOMS.map((value) => {
              const count = counts[keyFor(value)] ?? 0;
              const item = makeTrainingItem(value);
              return (
                <View
                  key={value}
                  style={styles.denomRow}
                >
                  <MoneyChip item={item} size="small" />
                  <Text style={styles.denomText}>{formatEuro(value)}</Text>
                  <View style={styles.counter}>
                    <TouchableOpacity
                      style={[styles.counterButton, count === 0 && styles.counterButtonDisabled]}
                      onPress={() => updateCount(value, -1)}
                      disabled={count === 0}
                      accessibilityRole="button"
                      accessibilityLabel={`Togli una ${value >= 5 ? 'banconota' : 'moneta'} da ${formatEuro(value)}`}
                      accessibilityHint="Riduce la quantità di questo taglio di 1"
                    >
                      <Minus size={22} color={count === 0 ? t.colors.textDisabled : t.colors.error} />
                    </TouchableOpacity>
                    <Text style={styles.countText} accessible accessibilityLabel={`${count}`} accessibilityHint="Quantità attualmente selezionata">{count}</Text>
                    <TouchableOpacity
                      style={styles.counterButton}
                      onPress={() => updateCount(value, 1)}
                      accessibilityRole="button"
                      accessibilityLabel={`Aggiungi una ${value >= 5 ? 'banconota' : 'moneta'} da ${formatEuro(value)}`}
                      accessibilityHint="Aumenta la quantità di questo taglio di 1"
                    >
                      <Plus size={22} color={t.colors.success} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Sul banco */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Sul banco</Text>
              <Text style={styles.sectionHint}>I tagli che hai scelto per pagare.</Text>
            </View>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={clearSelection}
              accessibilityRole="button"
              accessibilityLabel="Togli tutto dal banco"
              accessibilityHint="Rimuove tutti i tagli selezionati e ricomincia"
            >
              <Text style={styles.clearButtonText}>Pulisci tutto</Text>
            </TouchableOpacity>
          </View>

          {selectedItems.length > 0 ? (
            <View style={styles.selectedGrid}>
              {selectedItems.slice(0, 24).map((item) => (
                <MoneyChip key={item.id} item={item} size="small" />
              ))}
            </View>
          ) : (
            <View style={styles.emptyBench}>
              <Text style={styles.emptyText}>Nessun taglio scelto ancora.</Text>
            </View>
          )}
        </View>

        {/* Messaggio suggerimento */}
        {!success && (
          <Animated.View entering={FadeIn.duration(180)} style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>{feedback}</Text>
          </Animated.View>
        )}

        {/* Pulsanti azione */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={nextRound}
            accessibilityRole="button"
            accessibilityLabel="Nuova cifra da pagare"
            accessibilityHint="Genera un nuovo esercizio con una cifra diversa"
          >
            <Text style={styles.secondaryButtonText}>Nuova cifra</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.checkButton}
            onPress={checkAnswer}
            accessibilityRole="button"
            accessibilityLabel="Controlla se hai messo i soldi giusti"
            accessibilityHint="Verifica se la cifra composta è esattamente quella richiesta"
          >
            <Text style={styles.checkButtonText}>Controlla</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFF8EE',
  },
  topBar: {
    minHeight: 80,
    paddingHorizontal: t.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing.sm,
    borderBottomWidth: 3,
    borderBottomColor: t.colors.text,
  },
  iconButton: {
    width: t.spacing.touchTarget,
    height: t.spacing.touchTarget,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: t.colors.text,
  },
  topCopy: {
    flex: 1,
    alignItems: 'center',
  },
  kicker: {
    color: t.colors.error,
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightBold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  topTitle: {
    color: t.colors.text,
    fontSize: t.typography.sizeLG,
    fontWeight: t.typography.weightBold,
    textAlign: 'center',
  },
  content: {
    padding: t.spacing.md,
    paddingBottom: t.spacing.xxl,
    gap: t.spacing.md,
  },

  // Importo target
  challenge: {
    borderRadius: t.radius.lg,
    borderWidth: 3,
    borderColor: t.colors.text,
    backgroundColor: t.colors.text,
    padding: t.spacing.lg,
    alignItems: 'center',
    gap: t.spacing.sm,
  },
  challengeSuccess: {
    backgroundColor: t.colors.success,
    borderColor: t.colors.success,
  },
  challengeIcon: {
    width: 72,
    height: 72,
    borderRadius: t.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeLabel: {
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
    color: t.colors.textInverse,
  },
  challengeAmount: {
    fontSize: 64,
    fontWeight: t.typography.weightBold,
    color: '#FFE56B',
    lineHeight: 72,
  },

  // Stato
  statusGrid: {
    flexDirection: 'row',
    gap: t.spacing.sm,
  },
  statusPanel: {
    flex: 1,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surface,
    borderWidth: 3,
    borderColor: t.colors.text,
    padding: t.spacing.md,
    gap: 4,
  },
  statusExact: {
    backgroundColor: '#DDF4E7',
    borderColor: t.colors.success,
  },
  statusOver: {
    backgroundColor: '#F8E0DD',
    borderColor: t.colors.error,
  },
  statusLabel: {
    color: t.colors.textSecondary,
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightBold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statusValue: {
    color: t.colors.text,
    fontSize: t.typography.sizeLG,
    fontWeight: t.typography.weightBold,
  },

  // Banner successo gigante
  successBanner: {
    borderRadius: t.radius.lg,
    borderWidth: 3,
    borderColor: t.colors.success,
    backgroundColor: t.colors.success,
    paddingVertical: t.spacing.xl,
    paddingHorizontal: t.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.md,
  },
  successBannerText: {
    fontSize: t.typography.sizeXL,
    fontWeight: t.typography.weightBold,
    color: t.colors.onSuccess,
    textAlign: 'center',
    flex: 1,
  },

  // Sezioni
  section: {
    borderRadius: t.radius.md,
    borderWidth: 3,
    borderColor: t.colors.text,
    backgroundColor: t.colors.surface,
    padding: t.spacing.md,
    gap: t.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: t.spacing.sm,
  },
  sectionTitle: {
    color: t.colors.text,
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
  },
  sectionHint: {
    color: t.colors.textSecondary,
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightMedium,
    marginTop: 2,
  },

  // Griglia denominazioni
  denomGrid: {
    gap: t.spacing.sm,
  },
  denomRow: {
    minHeight: t.spacing.touchTarget + 4,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceVariant,
    borderWidth: 2,
    borderColor: t.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.spacing.sm,
    gap: t.spacing.sm,
  },
  denomText: {
    flex: 1,
    color: t.colors.text,
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
  },
  counterButton: {
    width: t.spacing.touchTarget,
    height: t.spacing.touchTarget,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: t.colors.text,
  },
  counterButtonDisabled: {
    opacity: 0.35,
  },
  countText: {
    width: 36,
    color: t.colors.text,
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
    textAlign: 'center',
  },

  // Pulsante pulisci
  clearButton: {
    minHeight: t.spacing.touchTarget,
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: t.colors.text,
    backgroundColor: t.colors.background,
  },
  clearButtonText: {
    color: t.colors.text,
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightBold,
  },

  // Sul banco
  selectedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.spacing.sm,
  },
  emptyBench: {
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceVariant,
    padding: t.spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    color: t.colors.textSecondary,
    fontSize: t.typography.sizeSM,
    fontWeight: t.typography.weightMedium,
    textAlign: 'center',
  },

  // Feedback suggerimento
  feedbackBox: {
    minHeight: 80,
    borderRadius: t.radius.md,
    borderWidth: 3,
    borderColor: t.colors.warning,
    backgroundColor: '#FFF3CD',
    padding: t.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackText: {
    color: t.colors.text,
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
    textAlign: 'center',
    lineHeight: t.typography.sizeMD * t.typography.lineHeightBody,
  },

  // Pulsanti fondo
  bottomActions: {
    flexDirection: 'row',
    gap: t.spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    minHeight: t.spacing.touchTarget,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surface,
    borderWidth: 3,
    borderColor: t.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: t.colors.text,
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
  },
  checkButton: {
    flex: 1.5,
    minHeight: t.spacing.touchTarget,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.primary,
    borderWidth: 3,
    borderColor: t.colors.primaryVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkButtonText: {
    color: t.colors.onPrimary,
    fontSize: t.typography.sizeMD,
    fontWeight: t.typography.weightBold,
  },
});
