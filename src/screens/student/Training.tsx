import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, CheckCircle2, Minus, PartyPopper, Plus, RefreshCcw, Sparkles, Target } from 'lucide-react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { MoneyChip } from '../../components/money/MoneyVisualizer';
import { MoneyItem } from '../../api/database.types';
import { EURO_DENOMINATIONS, formatEuro } from '../../utils/paymentLogic';

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
  return `Hai dato ${formatEuro(Math.abs(diff))} in piu'. Togli qualcosa.`;
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
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#10201B" />
        </TouchableOpacity>
        <View style={styles.topCopy}>
          <Text style={styles.kicker}>Allenamento</Text>
          <Text style={styles.topTitle}>Soldi giusti</Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={nextRound}>
          <RefreshCcw size={22} color="#10201B" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.challenge, success && styles.challengeSuccess, celebrationStyle]}>
          <View style={styles.challengeIcon}>
            {success ? <CheckCircle2 size={30} color="#FFFFFF" /> : <Target size={30} color="#FFFFFF" />}
          </View>
          <Text style={styles.challengeText}>Importo da pagare</Text>
          <Text style={styles.challengeAmount}>{formatEuro(target)}</Text>
        </Animated.View>

        <View style={styles.statusGrid}>
          <View style={styles.statusPanel}>
            <Text style={styles.statusLabel}>Hai dato</Text>
            <Text style={styles.statusValue}>{formatEuro(selectedTotal)}</Text>
          </View>
          <View style={[styles.statusPanel, exact ? styles.statusExact : remaining < 0 ? styles.statusOver : null]}>
            <Text style={styles.statusLabel}>{exact ? 'Esatto' : remaining > 0 ? 'Manca' : 'In piu'}</Text>
            <Text style={styles.statusValue}>{formatEuro(Math.abs(remaining))}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Cassa di prova</Text>
              <Text style={styles.sectionText}>Questi tagli non vengono presi dal wallet reale.</Text>
            </View>
            <Sparkles size={22} color="#B34C1D" />
          </View>

          <View style={styles.denomGrid}>
            {TRAINING_DENOMS.map((value) => {
              const count = counts[keyFor(value)] ?? 0;
              const item = makeTrainingItem(value);
              return (
                <View key={value} style={styles.denomRow}>
                  <MoneyChip item={item} size="small" />
                  <Text style={styles.denomText}>{formatEuro(value)}</Text>
                  <View style={styles.counter}>
                    <TouchableOpacity
                      style={[styles.counterButton, count === 0 && styles.counterButtonDisabled]}
                      onPress={() => updateCount(value, -1)}
                      disabled={count === 0}
                    >
                      <Minus size={18} color={count === 0 ? '#A6AEA8' : '#9E2F32'} />
                    </TouchableOpacity>
                    <Text style={styles.countText}>{count}</Text>
                    <TouchableOpacity style={styles.counterButton} onPress={() => updateCount(value, 1)}>
                      <Plus size={18} color="#0C5C43" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Sul banco</Text>
              <Text style={styles.sectionText}>Qui vedi i pezzi scelti per l'esercizio.</Text>
            </View>
            <TouchableOpacity style={styles.clearButton} onPress={clearSelection}>
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
            <Text style={styles.emptyText}>Nessun taglio selezionato.</Text>
          )}
        </View>

        <Animated.View entering={FadeIn.duration(180)} style={[styles.feedbackBox, success && styles.feedbackSuccess]}>
          {success && <PartyPopper size={24} color="#0F6F53" />}
          <Text style={[styles.feedbackText, success && styles.feedbackTextSuccess]}>{feedback}</Text>
        </Animated.View>

        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={nextRound}>
            <Text style={styles.secondaryButtonText}>Nuova cifra</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.checkButton} onPress={checkAnswer}>
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
    backgroundColor: '#F2E6D8',
  },
  topBar: {
    minHeight: 72,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#FFFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#10201B',
  },
  topCopy: {
    flex: 1,
    alignItems: 'center',
  },
  kicker: {
    color: '#B34C1D',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  topTitle: {
    color: '#10201B',
    fontSize: 25,
    fontWeight: '900',
  },
  content: {
    padding: 16,
    paddingBottom: 34,
    gap: 14,
  },
  challenge: {
    borderRadius: 8,
    backgroundColor: '#10201B',
    padding: 22,
    alignItems: 'center',
  },
  challengeSuccess: {
    backgroundColor: '#0C5C43',
  },
  challengeIcon: {
    width: 54,
    height: 54,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeText: {
    marginTop: 12,
    fontSize: 17,
    color: '#F7FFF8',
    fontWeight: '900',
  },
  challengeAmount: {
    marginTop: 2,
    color: '#F2CF64',
    fontSize: 58,
    lineHeight: 64,
    fontWeight: '900',
  },
  statusGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statusPanel: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#FFFDF5',
    borderWidth: 2,
    borderColor: '#10201B',
    padding: 14,
  },
  statusExact: {
    backgroundColor: '#DDF4E7',
    borderColor: '#0C5C43',
  },
  statusOver: {
    backgroundColor: '#F8E0DD',
    borderColor: '#9E2F32',
  },
  statusLabel: {
    color: '#5D6861',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statusValue: {
    marginTop: 4,
    color: '#10201B',
    fontSize: 26,
    fontWeight: '900',
  },
  section: {
    borderRadius: 8,
    backgroundColor: '#FFFDF5',
    borderWidth: 2,
    borderColor: '#10201B',
    padding: 14,
  },
  sectionHeader: {
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    color: '#10201B',
    fontSize: 20,
    fontWeight: '900',
  },
  sectionText: {
    marginTop: 3,
    color: '#66736D',
    fontSize: 13,
    fontWeight: '800',
  },
  denomGrid: {
    gap: 8,
  },
  denomRow: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: '#F2F5EE',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 10,
  },
  denomText: {
    flex: 1,
    color: '#10201B',
    fontSize: 17,
    fontWeight: '900',
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D0CA',
  },
  counterButtonDisabled: {
    opacity: 0.45,
  },
  countText: {
    width: 28,
    color: '#10201B',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  clearButton: {
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: '#F2E6D8',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D7C5B4',
  },
  clearButtonText: {
    color: '#10201B',
    fontSize: 13,
    fontWeight: '900',
  },
  selectedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emptyText: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#F2F5EE',
    color: '#66736D',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  feedbackBox: {
    minHeight: 72,
    borderRadius: 8,
    backgroundColor: '#F2CF64',
    borderWidth: 2,
    borderColor: '#10201B',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  feedbackSuccess: {
    backgroundColor: '#DDF4E7',
    borderColor: '#0C5C43',
  },
  feedbackText: {
    flex: 1,
    color: '#10201B',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  feedbackTextSuccess: {
    color: '#0C5C43',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 62,
    borderRadius: 8,
    backgroundColor: '#FFFDF5',
    borderWidth: 2,
    borderColor: '#10201B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#10201B',
    fontSize: 17,
    fontWeight: '900',
  },
  checkButton: {
    flex: 1.35,
    minHeight: 62,
    borderRadius: 8,
    backgroundColor: '#B34C1D',
    borderWidth: 2,
    borderColor: '#10201B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
});
