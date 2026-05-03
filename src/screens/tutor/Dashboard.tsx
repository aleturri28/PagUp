import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  Banknote,
  BellRing,
  CircleDollarSign,
  Clock3,
  Eye,
  Filter,
  Minus,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  WalletCards,
} from 'lucide-react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { supabase } from '../../api/supabase';
import { Database, Json, MoneyItem } from '../../api/database.types';
import { MoneyVisualizer } from '../../components/money/MoneyVisualizer';
import { RootStackParamList } from '../../navigation/types';
import { EURO_DENOMINATIONS, formatEuro } from '../../utils/paymentLogic';

type Props = StackScreenProps<RootStackParamList, 'TutorDashboard'>;

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type WalletRow = Database['public']['Tables']['wallets']['Row'];
type ActivityRow = Database['public']['Tables']['activity_logs']['Row'];
type LogFilter = 'all' | 'wallet_add' | 'payment';

interface StudentState {
  profile: ProfileRow;
  wallet: MoneyItem[];
  logs: ActivityRow[];
}

const TUTOR_PIN = process.env.EXPO_PUBLIC_TUTOR_PIN ?? '1234';
const QUICK_DENOMS = EURO_DENOMINATIONS.filter((value) => value >= 0.5);

function makeMoneyItem(value: number): MoneyItem {
  return {
    id: `tutor-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    value,
    type: value >= 5 ? 'bill' : 'coin',
    imageUri: '',
  };
}

function getBalance(items: MoneyItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.value, 0) * 100) / 100;
}

function metadataDirection(metadata: Json): 'add' | 'remove' | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const direction = metadata.direction;
    return direction === 'add' || direction === 'remove' ? direction : null;
  }
  return null;
}

function matchesLogFilter(log: ActivityRow, filter: LogFilter): boolean {
  if (filter === 'payment') return log.kind === 'payment';
  if (filter === 'wallet_add') return log.kind === 'wallet_adjustment' && metadataDirection(log.metadata) === 'add';
  return true;
}

function logTone(log: ActivityRow): 'green' | 'amber' | 'red' | 'blue' {
  if (log.kind === 'sos') return 'red';
  if (log.kind === 'payment') return log.used_bypass ? 'amber' : 'blue';
  return metadataDirection(log.metadata) === 'add' ? 'green' : 'amber';
}

function logLabel(log: ActivityRow): string {
  if (log.kind === 'payment') return log.used_bypass ? 'Pagamento + bypass' : 'Pagamento';
  if (log.kind === 'sos') return 'SOS';
  return metadataDirection(log.metadata) === 'add' ? 'Aggiunta wallet' : 'Rimozione wallet';
}

function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [checkingBio, setCheckingBio] = useState(false);

  const unlockWithBiometry = useCallback(async () => {
    setCheckingBio(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        Alert.alert('Biometria non disponibile', 'Usa il PIN tutor.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sblocca Dashboard Tutor',
        fallbackLabel: 'Usa PIN',
      });

      if (result.success) onUnlock();
    } finally {
      setCheckingBio(false);
    }
  }, [onUnlock]);

  const submitPin = useCallback(() => {
    if (pin === TUTOR_PIN) {
      onUnlock();
      return;
    }
    Alert.alert('PIN errato', 'Riprova o usa la biometria.');
    setPin('');
  }, [onUnlock, pin]);

  return (
    <SafeAreaView style={styles.gateRoot}>
      <View style={styles.gatePanel}>
        <View style={styles.gateMark}>
          <ShieldCheck size={38} color="#0C1915" />
        </View>
        <Text style={styles.gateKicker}>Area riservata</Text>
        <Text style={styles.gateTitle}>Console Tutor</Text>
        <Text style={styles.gateText}>Controllo wallet, pagamenti e richieste degli studenti collegati.</Text>

        <TouchableOpacity
          style={styles.bioButton}
          onPress={() => {
            unlockWithBiometry().catch(() => {});
          }}
          disabled={checkingBio}
        >
          {checkingBio ? <ActivityIndicator color="#F7FFF8" /> : <ShieldCheck size={22} color="#F7FFF8" />}
          <Text style={styles.bioButtonText}>{checkingBio ? 'Controllo...' : 'Sblocca con biometria'}</Text>
        </TouchableOpacity>

        <TextInput
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          placeholder="PIN tutor"
          placeholderTextColor="#7D8983"
          style={styles.pinInput}
        />

        <TouchableOpacity style={styles.pinButton} onPress={submitPin}>
          <Text style={styles.pinButtonText}>Entra</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function TutorDashboard({ navigation }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentState[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');

  const selectedStudent = useMemo(
    () => students.find((student) => student.profile.id === selectedStudentId) ?? students[0],
    [selectedStudentId, students],
  );

  const selectedLogs = useMemo(
    () => (selectedStudent?.logs ?? []).filter((log) => matchesLogFilter(log, logFilter)),
    [logFilter, selectedStudent?.logs],
  );

  const allLogs = useMemo(() => students.flatMap((student) => student.logs), [students]);
  const totalBalance = useMemo(() => students.reduce((sum, student) => sum + getBalance(student.wallet), 0), [students]);
  const paymentCount = useMemo(() => allLogs.filter((log) => log.kind === 'payment').length, [allLogs]);
  const walletAddCount = useMemo(
    () => allLogs.filter((log) => log.kind === 'wallet_adjustment' && metadataDirection(log.metadata) === 'add').length,
    [allLogs],
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error('Tutor non autenticato.');
      setTutorId(userData.user.id);

      const { data: links, error: linkError } = await supabase
        .from('tutor_students')
        .select('student_id')
        .eq('tutor_id', userData.user.id);
      if (linkError) throw linkError;

      const ids = (links ?? []).map((link) => link.student_id);
      if (ids.length === 0) {
        setStudents([]);
        setSelectedStudentId(null);
        return;
      }

      const [{ data: profiles, error: profilesError }, { data: wallets, error: walletsError }, { data: logs, error: logsError }] =
        await Promise.all([
          supabase.from('profiles').select('*').in('id', ids),
          supabase.from('wallets').select('*').in('user_id', ids),
          supabase
            .from('activity_logs')
            .select('*')
            .in('student_id', ids)
            .order('created_at', { ascending: false })
            .limit(160),
        ]);

      if (profilesError) throw profilesError;
      if (walletsError) throw walletsError;
      if (logsError) throw logsError;

      const walletByStudent = new Map((wallets ?? []).map((wallet: WalletRow) => [wallet.user_id, wallet.items]));
      const logsByStudent = new Map<string, ActivityRow[]>();
      (logs ?? []).forEach((log: ActivityRow) => {
        logsByStudent.set(log.student_id, [...(logsByStudent.get(log.student_id) ?? []), log]);
      });

      const next = (profiles ?? []).map((profile: ProfileRow) => ({
        profile,
        wallet: walletByStudent.get(profile.id) ?? [],
        logs: logsByStudent.get(profile.id) ?? [],
      }));

      setStudents(next);
      setSelectedStudentId((current) => current ?? next[0]?.profile.id ?? null);
    } catch (error) {
      Alert.alert('Dashboard non caricata', error instanceof Error ? error.message : 'Riprova.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked) loadDashboard().catch(() => {});
  }, [loadDashboard, unlocked]);

  useEffect(() => {
    if (!unlocked || !tutorId) return;

    const channel = supabase
      .channel(`tutor-dashboard:${tutorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, (payload) => {
        const wallet = payload.new as WalletRow;
        setStudents((current) =>
          current.map((student) =>
            student.profile.id === wallet.user_id ? { ...student, wallet: wallet.items } : student,
          ),
        );
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, (payload) => {
        const log = payload.new as ActivityRow;
        setStudents((current) =>
          current.map((student) =>
            student.profile.id === log.student_id
              ? { ...student, logs: [log, ...student.logs].slice(0, 40) }
              : student,
          ),
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tutorId, unlocked]);

  const adjustWallet = useCallback(
    async (student: StudentState, value: number, direction: 'add' | 'remove') => {
      if (!tutorId) return;

      const nextWallet =
        direction === 'add'
          ? [...student.wallet, makeMoneyItem(value)]
          : (() => {
              const index = student.wallet.findIndex((item) => item.value === value);
              if (index === -1) return student.wallet;
              return student.wallet.filter((_, itemIndex) => itemIndex !== index);
            })();

      if (nextWallet === student.wallet) return;

      setStudents((current) =>
        current.map((entry) =>
          entry.profile.id === student.profile.id ? { ...entry, wallet: nextWallet } : entry,
        ),
      );

      const { error } = await supabase
        .from('wallets')
        .upsert({ user_id: student.profile.id, items: nextWallet }, { onConflict: 'user_id' });

      if (error) {
        Alert.alert('Wallet non aggiornato', error.message);
        loadDashboard().catch(() => {});
        return;
      }

      await supabase.from('activity_logs').insert({
        student_id: student.profile.id,
        tutor_id: tutorId,
        kind: 'wallet_adjustment',
        amount: value,
        message: `${direction === 'add' ? 'Aggiunto' : 'Rimosso'} ${formatEuro(value)} dal wallet di ${student.profile.full_name ?? 'studente'}.`,
        metadata: { direction },
      });
    },
    [loadDashboard, tutorId],
  );

  if (!unlocked) {
    return <AccessGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topRail}>
        <View style={styles.brandBlock}>
          <Text style={styles.eyebrow}>PagUp Tutor</Text>
          <Text style={styles.title}>Console</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Settings')}>
            <Settings size={23} color="#101713" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshButton} onPress={() => loadDashboard().catch(() => {})}>
            <Eye size={18} color="#101713" />
            <Text style={styles.refreshText}>Sync</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#101713" />
          <Text style={styles.loadingText}>Carico studenti...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.metricsStrip}>
            <Metric icon={<WalletCards size={20} color="#F7FFF8" />} label="Studenti" value={`${students.length}`} />
            <Metric icon={<CircleDollarSign size={20} color="#F7FFF8" />} label="Saldo gestito" value={formatEuro(totalBalance)} />
            <Metric icon={<ReceiptText size={20} color="#F7FFF8" />} label="Pagamenti" value={`${paymentCount}`} />
            <Metric icon={<Plus size={20} color="#F7FFF8" />} label="Aggiunte" value={`${walletAddCount}`} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.studentTabs}>
            {students.map((student) => {
              const selected = selectedStudent?.profile.id === student.profile.id;
              const recentPayment = student.logs.find((log) => log.kind === 'payment');
              return (
                <TouchableOpacity
                  key={student.profile.id}
                  style={[styles.studentTab, selected && styles.studentTabActive]}
                  onPress={() => setSelectedStudentId(student.profile.id)}
                >
                  <Text style={[styles.studentTabName, selected && styles.studentTabNameActive]} numberOfLines={1}>
                    {student.profile.full_name ?? 'Studente'}
                  </Text>
                  <Text style={[styles.studentTabBalance, selected && styles.studentTabBalanceActive]}>
                    {formatEuro(getBalance(student.wallet))}
                  </Text>
                  <Text style={[styles.studentTabMeta, selected && styles.studentTabMetaActive]} numberOfLines={1}>
                    {recentPayment ? `Ultimo pagamento ${formatEuro(recentPayment.amount ?? 0)}` : 'Nessun pagamento'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {!selectedStudent ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>Nessuno studente collegato</Text>
              <Text style={styles.emptyText}>Usa il pairing dalle impostazioni per aggiungere il primo profilo.</Text>
            </View>
          ) : (
            <>
              <View style={styles.heroPanel}>
                <View style={styles.heroCopy}>
                  <Text style={styles.panelLabel}>Studente selezionato</Text>
                  <Text style={styles.heroName} numberOfLines={1}>
                    {selectedStudent.profile.full_name ?? 'Studente'}
                  </Text>
                  <Text style={styles.heroBalance}>{formatEuro(getBalance(selectedStudent.wallet))}</Text>
                </View>
                <View style={styles.heroBadge}>
                  <WalletCards size={34} color="#101713" />
                  <Text style={styles.heroBadgeText}>{selectedStudent.wallet.length} pezzi</Text>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Wallet visivo</Text>
                  <Text style={styles.sectionMeta}>Primi 12 pezzi</Text>
                </View>
                <MoneyVisualizer items={selectedStudent.wallet.slice(0, 12)} size="small" />
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Modifica rapida</Text>
                  <Text style={styles.sectionMeta}>Aggiungi o rimuovi</Text>
                </View>
                <View style={styles.denomGrid}>
                  {QUICK_DENOMS.map((value) => (
                    <View key={value} style={styles.denomRow}>
                      <View style={styles.denomLabel}>
                        {value >= 5 ? <Banknote size={18} color="#2A3430" /> : <CircleDollarSign size={18} color="#2A3430" />}
                        <Text style={styles.denomText}>{formatEuro(value)}</Text>
                      </View>
                      <View style={styles.denomActions}>
                        <TouchableOpacity
                          style={[styles.smallAction, styles.removeAction]}
                          onPress={() => adjustWallet(selectedStudent, value, 'remove').catch(() => {})}
                        >
                          <Minus size={18} color="#9E2F32" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.smallAction, styles.addAction]}
                          onPress={() => adjustWallet(selectedStudent, value, 'add').catch(() => {})}
                        >
                          <Plus size={18} color="#0C5C43" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>Log attivita'</Text>
                    <Text style={styles.sectionMeta}>Pagamenti e modifiche wallet in tempo reale</Text>
                  </View>
                  <Filter size={20} color="#56615B" />
                </View>

                <View style={styles.filterBar}>
                  <FilterChip label="Tutto" active={logFilter === 'all'} onPress={() => setLogFilter('all')} />
                  <FilterChip label="Aggiunte wallet" active={logFilter === 'wallet_add'} onPress={() => setLogFilter('wallet_add')} />
                  <FilterChip label="Pagamenti" active={logFilter === 'payment'} onPress={() => setLogFilter('payment')} />
                </View>

                {selectedLogs.slice(0, 18).map((log) => (
                  <ActivityItem key={log.id} log={log} />
                ))}
                {selectedLogs.length === 0 && (
                  <Text style={styles.emptyText}>Nessuna attivita' per questo filtro.</Text>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}>{icon}</View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActivityItem({ log }: { log: ActivityRow }) {
  const tone = logTone(log);
  const amountText = log.amount !== null ? formatEuro(log.amount) : null;

  return (
    <View style={styles.logRow}>
      <View style={[styles.logMarker, styles[`logMarker_${tone}`]]}>
        {log.kind === 'payment' ? (
          <ReceiptText size={17} color="#FFFFFF" />
        ) : log.kind === 'sos' ? (
          <BellRing size={17} color="#FFFFFF" />
        ) : (
          <WalletCards size={17} color="#FFFFFF" />
        )}
      </View>
      <View style={styles.logBody}>
        <View style={styles.logTopLine}>
          <Text style={styles.logKind}>{logLabel(log)}</Text>
          {amountText ? <Text style={styles.logAmount}>{amountText}</Text> : null}
        </View>
        <Text style={styles.logMessage}>{log.message}</Text>
        <View style={styles.logDateRow}>
          <Clock3 size={12} color="#7A8580" />
          <Text style={styles.logDate}>{new Date(log.created_at).toLocaleString('it-IT')}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#E8ECE6',
  },
  gateRoot: {
    flex: 1,
    backgroundColor: '#0C1915',
    justifyContent: 'center',
    padding: 22,
  },
  gatePanel: {
    borderRadius: 8,
    backgroundColor: '#F5F2E8',
    padding: 24,
    borderWidth: 2,
    borderColor: '#1D2A25',
  },
  gateMark: {
    width: 70,
    height: 70,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D8C87A',
    marginBottom: 18,
  },
  gateKicker: {
    color: '#5C4C1F',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  gateTitle: {
    marginTop: 4,
    fontSize: 34,
    fontWeight: '900',
    color: '#0C1915',
  },
  gateText: {
    marginTop: 8,
    color: '#47534E',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  bioButton: {
    marginTop: 22,
    minHeight: 56,
    borderRadius: 8,
    backgroundColor: '#0C1915',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  bioButtonText: {
    color: '#F7FFF8',
    fontSize: 17,
    fontWeight: '900',
  },
  pinInput: {
    marginTop: 14,
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#C8CFC9',
    paddingHorizontal: 14,
    fontSize: 18,
    color: '#0C1915',
    backgroundColor: '#FFFFFF',
  },
  pinButton: {
    marginTop: 10,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: '#D8C87A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinButtonText: {
    color: '#0C1915',
    fontSize: 17,
    fontWeight: '900',
  },
  topRail: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#E8ECE6',
  },
  brandBlock: {
    flex: 1,
  },
  eyebrow: {
    color: '#59655F',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#0C1915',
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '900',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F7FFF8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C9D1CB',
  },
  refreshButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#D8C87A',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshText: {
    color: '#101713',
    fontWeight: '900',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#4A5650',
    fontWeight: '800',
  },
  content: {
    padding: 14,
    paddingBottom: 40,
    gap: 14,
  },
  metricsStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  metric: {
    flex: 1,
    minHeight: 104,
    borderRadius: 8,
    backgroundColor: '#101713',
    padding: 10,
    justifyContent: 'space-between',
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#20332B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    color: '#A9B4AF',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: '#F7FFF8',
    fontSize: 18,
    fontWeight: '900',
  },
  studentTabs: {
    gap: 10,
    paddingRight: 14,
  },
  studentTab: {
    width: 178,
    minHeight: 104,
    borderRadius: 8,
    padding: 13,
    backgroundColor: '#F7FFF8',
    borderWidth: 1,
    borderColor: '#C9D1CB',
  },
  studentTabActive: {
    backgroundColor: '#0C5C43',
    borderColor: '#0C5C43',
  },
  studentTabName: {
    color: '#101713',
    fontSize: 16,
    fontWeight: '900',
  },
  studentTabNameActive: {
    color: '#FFFFFF',
  },
  studentTabBalance: {
    marginTop: 8,
    color: '#0C1915',
    fontSize: 23,
    fontWeight: '900',
  },
  studentTabBalanceActive: {
    color: '#FFFFFF',
  },
  studentTabMeta: {
    marginTop: 6,
    color: '#66736D',
    fontSize: 12,
    fontWeight: '800',
  },
  studentTabMetaActive: {
    color: '#CAEADB',
  },
  heroPanel: {
    borderRadius: 8,
    backgroundColor: '#F7FFF8',
    borderWidth: 1,
    borderColor: '#C9D1CB',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  heroCopy: {
    flex: 1,
  },
  panelLabel: {
    color: '#66736D',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroName: {
    marginTop: 6,
    color: '#101713',
    fontSize: 22,
    fontWeight: '900',
  },
  heroBalance: {
    marginTop: 2,
    color: '#0C5C43',
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '900',
  },
  heroBadge: {
    width: 92,
    height: 92,
    borderRadius: 8,
    backgroundColor: '#D8C87A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  heroBadgeText: {
    color: '#101713',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  section: {
    borderRadius: 8,
    backgroundColor: '#F7FFF8',
    borderWidth: 1,
    borderColor: '#C9D1CB',
    padding: 14,
  },
  sectionHeader: {
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    color: '#101713',
    fontSize: 19,
    fontWeight: '900',
  },
  sectionMeta: {
    marginTop: 2,
    color: '#66736D',
    fontSize: 12,
    fontWeight: '800',
  },
  denomGrid: {
    gap: 8,
  },
  denomRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    backgroundColor: '#EDF1EE',
    paddingHorizontal: 12,
  },
  denomLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  denomText: {
    color: '#26322D',
    fontSize: 16,
    fontWeight: '900',
  },
  denomActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallAction: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  removeAction: {
    backgroundColor: '#F5E2DF',
    borderColor: '#E3B7B1',
  },
  addAction: {
    backgroundColor: '#DDEFE6',
    borderColor: '#B8D8C8',
  },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF1EE',
    borderWidth: 1,
    borderColor: '#D6DDD8',
  },
  filterChipActive: {
    backgroundColor: '#101713',
    borderColor: '#101713',
  },
  filterChipText: {
    color: '#3F4B45',
    fontSize: 13,
    fontWeight: '900',
  },
  filterChipTextActive: {
    color: '#F7FFF8',
  },
  logRow: {
    flexDirection: 'row',
    gap: 11,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E7E2',
  },
  logMarker: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logMarker_green: {
    backgroundColor: '#0C5C43',
  },
  logMarker_amber: {
    backgroundColor: '#A77B14',
  },
  logMarker_red: {
    backgroundColor: '#9E2F32',
  },
  logMarker_blue: {
    backgroundColor: '#245B90',
  },
  logBody: {
    flex: 1,
    minWidth: 0,
  },
  logTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  logKind: {
    flex: 1,
    color: '#101713',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  logAmount: {
    color: '#0C5C43',
    fontSize: 14,
    fontWeight: '900',
  },
  logMessage: {
    marginTop: 4,
    color: '#2E3934',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  logDateRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  logDate: {
    color: '#7A8580',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyPanel: {
    borderRadius: 8,
    backgroundColor: '#F7FFF8',
    borderWidth: 1,
    borderColor: '#C9D1CB',
    padding: 20,
  },
  emptyTitle: {
    color: '#101713',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    color: '#66736D',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    textAlign: 'center',
    padding: 14,
  },
});
