import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Banknote,
  BarChart3,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  House,
  Minus,
  Plus,
  RefreshCw,
  Settings,
  UserRoundSearch,
  Users,
  WalletCards,
  X,
  Zap,
} from 'lucide-react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { supabase } from '../../api/supabase';
import { Database, Json, MoneyItem } from '../../api/database.types';
import { RootStackParamList } from '../../navigation/types';
import { EURO_DENOMINATIONS, formatEuro, PaymentMode } from '../../utils/paymentLogic';
import { tutorTheme as t } from '../../theme';
import { getMoneyImageUri } from '../../constants/moneyImages';

type Props = StackScreenProps<RootStackParamList, 'TutorDashboard'>;
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type WalletRow = Database['public']['Tables']['wallets']['Row'];
type ActivityRow = Database['public']['Tables']['activity_logs']['Row'];
type TutorTab = 'home' | 'stats' | 'students' | 'wallet';
type LogFilter = 'all' | 'payment' | 'wallet_add' | 'wallet_remove';

interface StudentState {
  profile: ProfileRow;
  wallet: MoneyItem[];
  logs: ActivityRow[];
  paymentMode: PaymentMode;
}

interface DailyBar {
  label: string;
  total: number;
  clean: number;
  bypasses: number;
  sos: number;
}

interface StudentStats {
  totalPayments: number;
  bypassCount: number;
  bypassRate: number;
  sosCount: number;
  totalVolume: number;
  avgPayment: number;
}

type BreakdownEntry = { value: number; count: number };
type DraftCounts = Record<string, number>;

const DAY_LABELS_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const EDITOR_DENOMS = EURO_DENOMINATIONS.filter((value) => value >= 0.1);

function getDailyPayments(logs: ActivityRow[]): DailyBar[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dayStr = date.toISOString().split('T')[0] ?? '';
    const dayPayments = logs.filter((l) => l.kind === 'payment' && l.created_at.startsWith(dayStr));
    return {
      label: DAY_LABELS_IT[date.getDay()] ?? '—',
      total: dayPayments.length,
      clean: dayPayments.filter((l) => !l.used_bypass).length,
      bypasses: dayPayments.filter((l) => l.used_bypass).length,
      sos: logs.filter((l) => l.kind === 'sos' && l.created_at.startsWith(dayStr)).length,
    };
  });
}

function getStudentStats(logs: ActivityRow[]): StudentStats {
  const payments = logs.filter((l) => l.kind === 'payment');
  const bypassed = payments.filter((l) => l.used_bypass);
  const sos = logs.filter((l) => l.kind === 'sos');
  const volume = payments.reduce((sum, l) => sum + (l.amount ?? 0), 0);

  return {
    totalPayments: payments.length,
    bypassCount: bypassed.length,
    bypassRate: payments.length > 0 ? Math.round((bypassed.length / payments.length) * 100) : 0,
    sosCount: sos.length,
    totalVolume: Math.round(volume * 100) / 100,
    avgPayment: payments.length > 0 ? Math.round((volume / payments.length) * 100) / 100 : 0,
  };
}

function makeMoneyItem(value: number): MoneyItem {
  return {
    id: `tutor-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    value,
    type: value >= 5 ? 'bill' : 'coin',
    imageUri: getMoneyImageUri(value),
  };
}

function getBalance(items: MoneyItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.value, 0) * 100) / 100;
}

function normalizeBreakdown(items: BreakdownEntry[]): BreakdownEntry[] {
  return items
    .filter((item) => item.value > 0 && item.count > 0)
    .sort((a, b) => b.value - a.value);
}

function moneyBreakdown(items: MoneyItem[]): BreakdownEntry[] {
  const counts = new Map<number, number>();
  items.forEach((item) => counts.set(item.value, (counts.get(item.value) ?? 0) + 1));
  return normalizeBreakdown([...counts.entries()].map(([value, count]) => ({ value, count })));
}

function metadataDirection(metadata: Json): 'add' | 'remove' | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const direction = metadata.direction;
    return direction === 'add' || direction === 'remove' ? direction : null;
  }
  return null;
}

function metadataItems(metadata: Json): BreakdownEntry[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];

  const rawItems = metadata.items;
  if (Array.isArray(rawItems)) {
    return normalizeBreakdown(
      rawItems
        .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => {
          const row = entry as { value?: unknown; count?: unknown };
          return {
            value: typeof row.value === 'number' ? row.value : 0,
            count: typeof row.count === 'number' ? row.count : 0,
          };
        }),
    );
  }

  const selectedItems = metadata.selectedItems;
  if (Array.isArray(selectedItems)) {
    return moneyBreakdown(
      selectedItems
        .filter((entry) => (
          !!entry &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          typeof (entry as { id?: unknown }).id === 'string' &&
          typeof (entry as { value?: unknown }).value === 'number'
        ))
        .map((entry) => entry as unknown as MoneyItem),
    );
  }

  return [];
}

function totalFromBreakdown(items: BreakdownEntry[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.value * item.count, 0) * 100) / 100;
}

function logKindLabel(log: ActivityRow): string {
  if (log.kind === 'sos') return 'SOS';
  if (log.kind === 'payment') return log.used_bypass ? 'Pagamento veloce' : 'Pagamento';
  return metadataDirection(log.metadata) === 'remove' ? 'Rimozione wallet' : 'Aggiunta wallet';
}

function logAmount(log: ActivityRow): number | null {
  if (log.kind === 'payment') return log.covered_amount ?? log.amount;
  const items = metadataItems(log.metadata);
  if (items.length > 0) return totalFromBreakdown(items);
  return log.amount;
}

function buildEmptyDraft(): DraftCounts {
  return Object.fromEntries(EDITOR_DENOMS.map((value) => [String(value), 0]));
}

function KpiCard({ label, value, sub, accent, cardStyle, onPress }: { label: string; value: string; sub?: string; accent?: string; cardStyle?: object; onPress?: () => void }) {
  const content = (
    <View style={[styles.kpiCard, cardStyle, accent ? { borderColor: accent } : null]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );

  if (!onPress) return content;

  return <TouchableOpacity onPress={onPress} activeOpacity={0.85}>{content}</TouchableOpacity>;
}

function WeeklyBarChart({ bars }: { bars: DailyBar[] }) {
  const maxVal = Math.max(...bars.map((bar) => bar.total), 1);
  return (
    <View style={styles.chartWrap}>
      <View style={styles.chartFrame}>
        {bars.map((bar) => {
          const height = bar.total > 0 ? Math.max((bar.total / maxVal) * 110, 6) : 4;
          const bypassHeight = bar.total > 0 ? (bar.bypasses / Math.max(bar.total, 1)) * height : 0;
          const cleanHeight = height - bypassHeight;
          return (
            <View key={bar.label} style={styles.chartColumn}>
              <View style={styles.chartTrack}>
                {bar.total === 0 ? (
                  <View style={styles.chartEmpty} />
                ) : (
                  <View style={[styles.chartBar, { height }]}>
                    {bypassHeight > 0 ? <View style={[styles.chartSeg, { height: bypassHeight, backgroundColor: t.colors.warning }]} /> : null}
                    {cleanHeight > 0 ? <View style={[styles.chartSeg, { height: cleanHeight, backgroundColor: t.colors.primary }]} /> : null}
                  </View>
                )}
              </View>
              {bar.sos > 0 ? <View style={styles.chartDot} /> : <View style={styles.chartDotSpacer} />}
              <Text style={styles.chartLabel}>{bar.label}</Text>
              <Text style={styles.chartCount}>{bar.total > 0 ? String(bar.total) : ''}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: t.colors.primary }]} />
          <Text style={styles.legendText}>ok</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: t.colors.warning }]} />
          <Text style={styles.legendText}>bypass</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: t.colors.error }]} />
          <Text style={styles.legendText}>sos</Text>
        </View>
      </View>
    </View>
  );
}

export default function TutorDashboard({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentState[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TutorTab>('home');
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [draftCounts, setDraftCounts] = useState<DraftCounts>(buildEmptyDraft);
  const [walletBusy, setWalletBusy] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [sosHistoryVisible, setSosHistoryVisible] = useState(false);

  const selectedStudent = useMemo(
    () => students.find((student) => student.profile.id === selectedStudentId) ?? students[0] ?? null,
    [selectedStudentId, students],
  );

  const allLogs = useMemo(() => students.flatMap((student) => student.logs), [students]);
  const totalBalance = useMemo(() => students.reduce((sum, student) => sum + getBalance(student.wallet), 0), [students]);
  const studentStats = useMemo(() => selectedStudent ? getStudentStats(selectedStudent.logs) : null, [selectedStudent]);
  const weeklyBars = useMemo(() => selectedStudent ? getDailyPayments(selectedStudent.logs) : [], [selectedStudent]);
  const walletBreakdown = useMemo(() => selectedStudent ? moneyBreakdown(selectedStudent.wallet) : [], [selectedStudent]);
  const recentLogs = useMemo(() => selectedStudent ? selectedStudent.logs.slice(0, 50) : [], [selectedStudent]);
  const filteredLogs = useMemo(() => {
    return recentLogs.filter((log) => {
      if (logFilter === 'all') return true;
      if (logFilter === 'payment') return log.kind === 'payment';
      if (logFilter === 'wallet_add') return log.kind === 'wallet_adjustment' && metadataDirection(log.metadata) !== 'remove';
      if (logFilter === 'wallet_remove') return log.kind === 'wallet_adjustment' && metadataDirection(log.metadata) === 'remove';
      return true;
    });
  }, [logFilter, recentLogs]);
  const sosLogs = useMemo(
    () => selectedStudent ? selectedStudent.logs.filter((log) => log.kind === 'sos').slice(0, 50) : [],
    [selectedStudent],
  );
  const latestLog = recentLogs[0] ?? null;
  const totalPayments = useMemo(() => allLogs.filter((log) => log.kind === 'payment').length, [allLogs]);
  const totalSos = useMemo(() => allLogs.filter((log) => log.kind === 'sos').length, [allLogs]);
  const isCompact = width < 390;
  const isNarrow = width < 360;
  const contentWidth = Math.max(width - 28, 220);
  const singleColumnCard = isCompact ? { minWidth: contentWidth } : undefined;
  const walletPieceStyle = width < 430 ? { minWidth: Math.max((contentWidth - 8) / 2, 120) } : undefined;

  const draftEntries = useMemo(
    () => EDITOR_DENOMS.map((value) => ({ value, count: draftCounts[String(value)] ?? 0 })).filter((item) => item.count > 0),
    [draftCounts],
  );
  const draftTotal = useMemo(() => totalFromBreakdown(draftEntries), [draftEntries]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error('Tutor non autenticato.');
      setTutorId(userData.user.id);

      let links: Array<{ student_id: string; payment_mode: PaymentMode | null }> | null = null;

      const { data: linksWithMode, error: linksWithModeError } = await supabase
        .from('tutor_students')
        .select('student_id, payment_mode')
        .eq('tutor_id', userData.user.id);

      if (linksWithModeError) {
        const { data: fallbackLinks, error: fallbackLinksError } = await supabase
          .from('tutor_students')
          .select('student_id')
          .eq('tutor_id', userData.user.id);
        if (fallbackLinksError) throw fallbackLinksError;
        links = (fallbackLinks ?? []).map((row) => ({ student_id: row.student_id, payment_mode: 'exact' }));
      } else {
        links = (linksWithMode ?? []).map((row) => ({
          student_id: row.student_id,
          payment_mode: row.payment_mode === 'fast' ? 'fast' : 'exact',
        }));
      }

      const ids = (links ?? []).map((link) => link.student_id);
      if (ids.length === 0) {
        setStudents([]);
        setSelectedStudentId(null);
        return;
      }

      const [{ data: profiles, error: profilesError }, { data: wallets, error: walletsError }, { data: logs, error: logsError }] =
        await Promise.all([
          supabase.from('profiles').select('*').in('id', ids).order('full_name', { ascending: true }),
          supabase.from('wallets').select('*').in('user_id', ids),
          supabase.from('activity_logs').select('*').in('student_id', ids).order('created_at', { ascending: false }).limit(300),
        ]);

      if (profilesError) throw profilesError;
      if (walletsError) throw walletsError;
      if (logsError) throw logsError;

      const modeByStudent = new Map<string, PaymentMode>(
        (links ?? []).map((link) => [link.student_id, link.payment_mode === 'fast' ? 'fast' : 'exact']),
      );
      const walletByStudent = new Map((wallets ?? []).map((wallet: WalletRow) => [wallet.user_id, wallet.items]));
      const logsByStudent = new Map<string, ActivityRow[]>();

      (logs ?? []).forEach((log: ActivityRow) => {
        logsByStudent.set(log.student_id, [...(logsByStudent.get(log.student_id) ?? []), log]);
      });

      const nextStudents = (profiles ?? []).map((profile: ProfileRow) => ({
        profile,
        wallet: walletByStudent.get(profile.id) ?? [],
        logs: logsByStudent.get(profile.id) ?? [],
        paymentMode: modeByStudent.get(profile.id) ?? 'exact',
      }));

      setStudents(nextStudents);
      setSelectedStudentId((current) => current && nextStudents.some((student) => student.profile.id === current) ? current : (nextStudents[0]?.profile.id ?? null));
    } catch (error) {
      Alert.alert('Dashboard non caricata', error instanceof Error ? error.message : 'Riprova.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard().catch(() => {});
  }, [loadDashboard]);

  useEffect(() => {
    if (!tutorId) return;

    const channel = supabase
      .channel(`tutor-dashboard:${tutorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, (payload) => {
        const wallet = payload.new as WalletRow;
        setStudents((current) => current.map((student) => (
          student.profile.id === wallet.user_id ? { ...student, wallet: wallet.items } : student
        )));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, (payload) => {
        const log = payload.new as ActivityRow;
        setStudents((current) => current.map((student) => (
          student.profile.id === log.student_id
            ? { ...student, logs: [log, ...student.logs].slice(0, 80) }
            : student
        )));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tutorId]);

  useEffect(() => {
    setDraftCounts(buildEmptyDraft());
  }, [selectedStudentId]);

  useEffect(() => {
    setLogFilter('all');
    setSosHistoryVisible(false);
  }, [selectedStudentId]);

  const updatePaymentMode = useCallback(async (student: StudentState, paymentMode: PaymentMode) => {
    if (!tutorId || student.paymentMode === paymentMode) return;

    setStudents((current) => current.map((entry) => (
      entry.profile.id === student.profile.id ? { ...entry, paymentMode } : entry
    )));

    const { error } = await supabase
      .from('tutor_students')
      .update({ payment_mode: paymentMode })
      .eq('tutor_id', tutorId)
      .eq('student_id', student.profile.id);

    if (error) {
      Alert.alert(
        'Modalita non aggiornata',
        error.message.includes('payment_mode')
          ? 'La migration payment_mode non e attiva su questo database.'
          : error.message,
      );
      loadDashboard().catch(() => {});
    }
  }, [loadDashboard, tutorId]);

  const changeDraft = useCallback((value: number, delta: number) => {
    setDraftCounts((current) => {
      const key = String(value);
      const next = Math.max(0, (current[key] ?? 0) + delta);
      return { ...current, [key]: next };
    });
  }, []);

  const commitDraft = useCallback(async () => {
    if (!tutorId || !selectedStudent || draftEntries.length === 0) return;
    setWalletBusy(true);
    try {
      const addedItems = draftEntries.flatMap((entry) => (
        Array.from({ length: entry.count }, () => makeMoneyItem(entry.value))
      ));
      const nextWallet = [...selectedStudent.wallet, ...addedItems];

      const { error: walletError } = await supabase
        .from('wallets')
        .upsert({ user_id: selectedStudent.profile.id, items: nextWallet }, { onConflict: 'user_id' });

      if (walletError) throw walletError;

      const { error: logError } = await supabase.from('activity_logs').insert({
        student_id: selectedStudent.profile.id,
        tutor_id: tutorId,
        kind: 'wallet_adjustment',
        amount: draftTotal,
        message: `Ricarica wallet per ${selectedStudent.profile.full_name ?? selectedStudent.profile.username}.`,
        metadata: {
          direction: 'add',
          total: draftTotal,
          items: draftEntries,
        } as Json,
      });

      if (logError) throw logError;

      setStudents((current) => current.map((entry) => (
        entry.profile.id === selectedStudent.profile.id ? { ...entry, wallet: nextWallet } : entry
      )));
      setDraftCounts(buildEmptyDraft());
    } catch (error) {
      Alert.alert('Wallet non aggiornato', error instanceof Error ? error.message : 'Riprova.');
      loadDashboard().catch(() => {});
    } finally {
      setWalletBusy(false);
    }
  }, [draftEntries, draftTotal, loadDashboard, selectedStudent, tutorId]);

  const clearWallet = useCallback(() => {
    if (!tutorId || !selectedStudent || selectedStudent.wallet.length === 0) return;

    const removedItems = moneyBreakdown(selectedStudent.wallet);
    const removedTotal = getBalance(selectedStudent.wallet);

    Alert.alert(
      'Azzera wallet',
      `Vuoi rimuovere tutti i pezzi dal wallet di ${selectedStudent.profile.full_name ?? selectedStudent.profile.username}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Azzera',
          style: 'destructive',
          onPress: async () => {
            setWalletBusy(true);
            try {
              const { error: walletError } = await supabase
                .from('wallets')
                .upsert({ user_id: selectedStudent.profile.id, items: [] }, { onConflict: 'user_id' });

              if (walletError) throw walletError;

              const { error: logError } = await supabase.from('activity_logs').insert({
                student_id: selectedStudent.profile.id,
                tutor_id: tutorId,
                kind: 'wallet_adjustment',
                amount: removedTotal,
                message: `Wallet azzerato per ${selectedStudent.profile.full_name ?? selectedStudent.profile.username}.`,
                metadata: {
                  direction: 'remove',
                  total: removedTotal,
                  items: removedItems,
                } as Json,
              });

              if (logError) throw logError;

              setStudents((current) => current.map((entry) => (
                entry.profile.id === selectedStudent.profile.id ? { ...entry, wallet: [] } : entry
              )));
            } catch (error) {
              Alert.alert('Wallet non aggiornato', error instanceof Error ? error.message : 'Riprova.');
              loadDashboard().catch(() => {});
            } finally {
              setWalletBusy(false);
            }
          },
        },
      ],
    );
  }, [loadDashboard, selectedStudent, tutorId]);

  const renderEmpty = () => (
    <View style={styles.emptyCard}>
      <Users size={30} color={t.colors.textSecondary} />
      <Text style={styles.emptyTitle}>Nessuno studente collegato</Text>
      <Text style={styles.emptyBody}>Apri le impostazioni tutor e scansiona il QR dello studente per iniziare.</Text>
      <TouchableOpacity style={styles.primaryInlineBtn} onPress={() => navigation.navigate('TutorSettings')}>
        <Text style={styles.primaryInlineBtnText}>Apri impostazioni</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHomeTab = () => {
    if (!selectedStudent || !studentStats) return renderEmpty();

    return (
      <>
        <View style={styles.heroCard}>
          <View style={[styles.heroTop, isCompact && styles.heroTopCompact]}>
            <View style={styles.heroIdentity}>
              <Text style={styles.heroEyebrow}>Studente selezionato</Text>
              <Text style={[styles.heroTitle, isCompact && styles.heroTitleCompact]}>{selectedStudent.profile.username}</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{selectedStudent.paymentMode === 'fast' ? 'Modalita veloce' : 'Modalita precisa'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroGrid}>
            <KpiCard label="Saldo" value={formatEuro(getBalance(selectedStudent.wallet))} sub={`${selectedStudent.wallet.length} pezzi`} accent={t.colors.primary} cardStyle={singleColumnCard} />
            <KpiCard label="SOS" value={`${studentStats.sosCount}`} sub="totali inviati" accent={studentStats.sosCount > 0 ? t.colors.error : t.colors.border} cardStyle={singleColumnCard} />
            <KpiCard label="Pagamenti" value={`${studentStats.totalPayments}`} sub={formatEuro(studentStats.totalVolume)} accent={t.colors.success} cardStyle={singleColumnCard} />
            <KpiCard label="Bypass" value={`${studentStats.bypassRate}%`} sub={`${studentStats.bypassCount} usi`} accent={studentStats.bypassCount > 0 ? t.colors.warning : t.colors.border} cardStyle={singleColumnCard} />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recap generale</Text>
            <Clock3 size={16} color={t.colors.textSecondary} />
          </View>
          <View style={styles.summaryList}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Ultima attivita</Text>
              <Text style={styles.summaryValue}>{latestLog ? logKindLabel(latestLog) : 'Nessuna'}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Ultimo importo gestito</Text>
              <Text style={styles.summaryValue}>{latestLog && logAmount(latestLog) != null ? formatEuro(logAmount(latestLog) ?? 0) : '—'}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Banconote e monete</Text>
              <Text style={styles.summaryValue}>{walletBreakdown.length} tagli distinti</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Pagamenti con bypass</Text>
              <Text style={styles.summaryValue}>{studentStats.bypassCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Panoramica tutor</Text>
            <Zap size={16} color={t.colors.primary} />
          </View>
          <View style={styles.overviewStrip}>
            <KpiCard label="Studenti" value={`${students.length}`} cardStyle={singleColumnCard} />
            <KpiCard label="Saldo totale" value={formatEuro(totalBalance)} cardStyle={singleColumnCard} />
            <KpiCard label="Pagamenti" value={`${totalPayments}`} cardStyle={singleColumnCard} />
            <KpiCard label="SOS" value={`${totalSos}`} accent={totalSos > 0 ? t.colors.error : t.colors.border} cardStyle={singleColumnCard} />
          </View>
        </View>
      </>
    );
  };

  const renderStatsTab = () => {
    if (!selectedStudent || !studentStats) return renderEmpty();

    return (
      <>
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Statistiche di {selectedStudent.profile.full_name ?? 'studente'}</Text>
            <BarChart3 size={17} color={t.colors.primary} />
          </View>
          <View style={styles.statsGrid}>
            <KpiCard label="Pagamenti" value={`${studentStats.totalPayments}`} sub={`medio ${formatEuro(studentStats.avgPayment)}`} accent={t.colors.primary} cardStyle={singleColumnCard} />
            <KpiCard label="Volume" value={formatEuro(studentStats.totalVolume)} sub="totale pagato" accent={t.colors.success} cardStyle={singleColumnCard} />
            <KpiCard label="Bypass" value={`${studentStats.bypassCount}`} sub={`${studentStats.bypassRate}%`} accent={studentStats.bypassCount > 0 ? t.colors.warning : t.colors.border} cardStyle={singleColumnCard} />
            <KpiCard
              label="SOS"
              value={`${studentStats.sosCount}`}
              sub="richieste aiuto"
              accent={studentStats.sosCount > 0 ? t.colors.error : t.colors.border}
              cardStyle={singleColumnCard}
              onPress={() => setSosHistoryVisible(true)}
            />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Attivita ultimi 7 giorni</Text>
            <Text style={styles.sectionMeta}>{recentLogs.length} eventi letti</Text>
          </View>
          <WeeklyBarChart bars={weeklyBars} />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Dettaglio rapido</Text>
          </View>
          <View style={styles.summaryList}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Ultimo pagamento</Text>
              <Text style={styles.summaryValue}>
                {selectedStudent.logs.find((log) => log.kind === 'payment')?.amount != null
                  ? formatEuro(selectedStudent.logs.find((log) => log.kind === 'payment')?.amount ?? 0)
                  : '—'}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Copertura media</Text>
              <Text style={styles.summaryValue}>
                {studentStats.totalPayments > 0
                  ? formatEuro(
                      selectedStudent.logs
                        .filter((log) => log.kind === 'payment')
                        .reduce((sum, log) => sum + (log.covered_amount ?? log.amount ?? 0), 0) / studentStats.totalPayments,
                    )
                  : '—'}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Modalita corrente</Text>
              <Text style={styles.summaryValue}>{selectedStudent.paymentMode === 'fast' ? 'Veloce' : 'Precisa'}</Text>
            </View>
          </View>
        </View>
      </>
    );
  };

  const renderStudentsTab = () => {
    if (students.length === 0) return renderEmpty();

    return (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Studenti associati</Text>
          <Text style={styles.sectionMeta}>{students.length} collegati</Text>
        </View>
        <View style={styles.studentList}>
          {students.map((student) => {
            const expanded = expandedStudentId === student.profile.id;
            const selected = selectedStudentId === student.profile.id;
            const stats = getStudentStats(student.logs);
            return (
              <View key={student.profile.id} style={styles.studentCard}>
                <TouchableOpacity
                  style={[styles.studentCardHead, selected && styles.studentCardHeadSelected]}
                  onPress={() => { setSelectedStudentId(student.profile.id); }}
                >
                  <View style={styles.studentCardText}>
                    <Text style={[styles.studentCardName, selected && styles.studentCardNameSelected]}>{student.profile.full_name ?? 'Studente'}</Text>
                    <Text style={[styles.studentCardUser, selected && styles.studentCardMetaSelected]}>@{student.profile.username}</Text>
                    <Text style={[styles.studentCardMeta, selected && styles.studentCardMetaSelected]}>
                      {formatEuro(getBalance(student.wallet))} · {stats.totalPayments} pagamenti · {stats.sosCount} SOS
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.studentCardChevron, selected && styles.studentCardChevronSelected]}
                  onPress={() => { setExpandedStudentId(expanded ? null : student.profile.id); }}
                  accessibilityRole="button"
                  accessibilityLabel={expanded ? 'Chiudi dettagli studente' : 'Apri dettagli studente'}
                >
                  {expanded
                    ? <ChevronUp size={18} color={selected ? '#FFFFFF' : t.colors.textSecondary} />
                    : <ChevronDown size={18} color={selected ? '#FFFFFF' : t.colors.textSecondary} />}
                </TouchableOpacity>

                {expanded ? (
                  <View style={styles.studentCardBody}>
                    <Text style={styles.sliderLabel}>Modalita studente</Text>
                    <View style={styles.modeRail}>
                      <TouchableOpacity
                        style={[styles.modeChip, student.paymentMode === 'exact' && styles.modeChipActive]}
                        onPress={() => { updatePaymentMode(student, 'exact').catch(() => {}); }}
                      >
                        <Text style={[styles.modeChipText, student.paymentMode === 'exact' && styles.modeChipTextActive]}>Precisa</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modeChip, student.paymentMode === 'fast' && styles.modeChipActive]}
                        onPress={() => { updatePaymentMode(student, 'fast').catch(() => {}); }}
                      >
                        <Text style={[styles.modeChipText, student.paymentMode === 'fast' && styles.modeChipTextActive]}>Veloce</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.modeHint}>
                      {student.paymentMode === 'fast'
                        ? 'Priorita a banconote e monete alte. Lo studente puo usare anche "Paga meno".'
                        : 'Cerca il pagamento corretto. Se manca il preciso, copre con la combinazione minima disponibile.'}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderLogRow = (log: ActivityRow) => {
    const expanded = expandedLogs[log.id] === true;
    const breakdown = metadataItems(log.metadata);
    const amount = logAmount(log);
    const direction = metadataDirection(log.metadata);
    const date = new Date(log.created_at);
    const tagColor = log.kind === 'sos'
      ? t.colors.error
      : log.kind === 'payment' && log.used_bypass
        ? t.colors.warning
        : t.colors.primary;

    return (
      <View key={log.id} style={styles.logCard}>
        <TouchableOpacity
          style={styles.logHead}
          onPress={() => setExpandedLogs((current) => ({ ...current, [log.id]: !expanded }))}
        >
          <View style={styles.logTitleWrap}>
            <View style={[styles.logTag, { backgroundColor: tagColor }]}>
              <Text style={styles.logTagText}>{logKindLabel(log)}</Text>
            </View>
            <Text style={styles.logMessage} numberOfLines={expanded ? undefined : 2}>{log.message}</Text>
          </View>
          <View style={styles.logRight}>
            <Text style={styles.logAmount}>{amount != null ? formatEuro(amount) : '—'}</Text>
            <Text style={styles.logDate}>{date.toLocaleDateString('it-IT')} · {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        </TouchableOpacity>

        {expanded ? (
          <View style={styles.logDetails}>
            {log.kind === 'payment' ? (
              <View style={styles.summaryList}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Da pagare</Text>
                  <Text style={styles.summaryValue}>{log.amount != null ? formatEuro(log.amount) : '—'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Consegnato</Text>
                  <Text style={styles.summaryValue}>{log.covered_amount != null ? formatEuro(log.covered_amount) : '—'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Modalita</Text>
                  <Text style={styles.summaryValue}>{log.used_bypass ? 'Veloce / paga meno' : 'Normale'}</Text>
                </View>
              </View>
            ) : null}

            {log.kind === 'wallet_adjustment' ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tipo</Text>
                <Text style={styles.summaryValue}>{direction === 'remove' ? 'Rimozione' : 'Aggiunta'}</Text>
              </View>
            ) : null}

            {breakdown.length > 0 ? (
              <View style={styles.breakdownList}>
                {breakdown.map((item) => (
                  <View key={`${log.id}-${item.value}`} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{formatEuro(item.value)}</Text>
                    <Text style={styles.breakdownValue}>x{item.count}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const renderWalletTab = () => {
    if (!selectedStudent) return renderEmpty();

    return (
      <>
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Wallet attuale</Text>
            <Text style={styles.sectionMeta}>{formatEuro(getBalance(selectedStudent.wallet))}</Text>
          </View>
          <TouchableOpacity
            style={[styles.secondaryInlineBtn, (walletBreakdown.length === 0 || walletBusy) && styles.secondaryInlineBtnDisabled]}
            onPress={clearWallet}
            disabled={walletBreakdown.length === 0 || walletBusy}
          >
            {walletBusy ? <ActivityIndicator color={t.colors.error} size="small" /> : <RefreshCw size={16} color={t.colors.error} />}
            <Text style={[styles.secondaryInlineBtnText, styles.secondaryInlineBtnTextDanger]}>
              {walletBusy ? 'Azzero...' : 'Azzera wallet'}
            </Text>
          </TouchableOpacity>
          {walletBreakdown.length === 0 ? (
            <Text style={styles.emptyInline}>Il wallet e vuoto.</Text>
          ) : (
            <View style={styles.walletPieces}>
              {walletBreakdown.map((item) => (
                <View key={item.value} style={[styles.walletPiece, walletPieceStyle]}>
                  <View style={styles.walletPieceLabelWrap}>
                    {item.value >= 5 ? <Banknote size={17} color={t.colors.textSecondary} /> : <CircleDollarSign size={17} color={t.colors.textSecondary} />}
                    <Text style={styles.walletPieceValue}>{formatEuro(item.value)}</Text>
                  </View>
                  <View style={styles.walletPieceCountBadge}>
                    <Text style={styles.walletPieceCount}>x{item.count}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Aggiungi pezzi</Text>
            <Text style={styles.sectionMeta}>Carrello wallet</Text>
          </View>
          <View style={styles.editorList}>
            {EDITOR_DENOMS.map((value) => {
              const count = draftCounts[String(value)] ?? 0;
              return (
                <View key={value} style={styles.editorRow}>
                  <View style={styles.editorLabelWrap}>
                    {value >= 5 ? <Banknote size={17} color={t.colors.textSecondary} /> : <CircleDollarSign size={17} color={t.colors.textSecondary} />}
                    <Text style={styles.editorLabel}>{formatEuro(value)}</Text>
                  </View>
                  <View style={styles.stepper}>
                    <TouchableOpacity style={styles.stepperBtn} onPress={() => changeDraft(value, -1)}>
                      <Minus size={16} color={t.colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.stepperCount}>{count}</Text>
                    <TouchableOpacity style={[styles.stepperBtn, styles.stepperBtnPlus]} onPress={() => changeDraft(value, 1)}>
                      <Plus size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.cartFooter}>
            <View>
              <Text style={styles.cartLabel}>Totale parziale</Text>
              <Text style={styles.cartValue}>{formatEuro(draftTotal)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.cartButton, (draftEntries.length === 0 || walletBusy) && styles.cartButtonDisabled]}
              onPress={() => { commitDraft().catch(() => {}); }}
              disabled={draftEntries.length === 0 || walletBusy}
            >
              {walletBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Plus size={18} color="#FFFFFF" />}
              <Text style={styles.cartButtonText}>{walletBusy ? 'Aggiungo...' : 'Aggiungi'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Transazioni</Text>
            <Text style={styles.sectionMeta}>{filteredLogs.length} eventi</Text>
          </View>

          <View style={styles.logFilterRow}>
            <TouchableOpacity
              style={[styles.logFilterChip, logFilter === 'all' && styles.logFilterChipActive]}
              onPress={() => setLogFilter('all')}
            >
              <Text style={[styles.logFilterChipText, logFilter === 'all' && styles.logFilterChipTextActive]}>Tutte</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logFilterChip, logFilter === 'payment' && styles.logFilterChipActive]}
              onPress={() => setLogFilter('payment')}
            >
              <Text style={[styles.logFilterChipText, logFilter === 'payment' && styles.logFilterChipTextActive]}>Pagamenti</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logFilterChip, logFilter === 'wallet_add' && styles.logFilterChipActive]}
              onPress={() => setLogFilter('wallet_add')}
            >
              <Text style={[styles.logFilterChipText, logFilter === 'wallet_add' && styles.logFilterChipTextActive]}>Ricariche</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logFilterChip, logFilter === 'wallet_remove' && styles.logFilterChipActive]}
              onPress={() => setLogFilter('wallet_remove')}
            >
              <Text style={[styles.logFilterChipText, logFilter === 'wallet_remove' && styles.logFilterChipTextActive]}>Rimozioni</Text>
            </TouchableOpacity>
          </View>

          {filteredLogs.length === 0 ? (
            <Text style={styles.emptyInline}>Ancora nessuna transazione registrata.</Text>
          ) : (
            <View style={styles.logList}>
              {filteredLogs.map(renderLogRow)}
            </View>
          )}
        </View>
      </>
    );
  };

  const tabTitle = activeTab === 'home'
    ? 'Home'
    : activeTab === 'stats'
      ? 'Statistiche'
      : activeTab === 'students'
        ? 'Studenti'
        : 'Wallet';

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.appLabel}>PagUp Tutor</Text>
          <Text style={styles.pageTitle}>{tabTitle}</Text>
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => { loadDashboard().catch(() => {}); }}>
            <RefreshCw size={18} color={t.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('TutorSettings')}>
            <Settings size={18} color={t.colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={t.colors.primary} />
          <Text style={styles.loadingText}>Caricamento dati...</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {activeTab === 'home' ? renderHomeTab() : null}
            {activeTab === 'stats' ? renderStatsTab() : null}
            {activeTab === 'students' ? renderStudentsTab() : null}
            {activeTab === 'wallet' ? renderWalletTab() : null}
          </ScrollView>

          <View style={[styles.bottomBar, isNarrow && styles.bottomBarCompact]}>
            <TouchableOpacity style={styles.bottomItem} onPress={() => setActiveTab('home')}>
              <House size={20} color={activeTab === 'home' ? t.colors.primary : t.colors.textSecondary} />
              <Text style={[styles.bottomLabel, isNarrow && styles.bottomLabelCompact, activeTab === 'home' && styles.bottomLabelActive]}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bottomItem} onPress={() => setActiveTab('stats')}>
              <BarChart3 size={20} color={activeTab === 'stats' ? t.colors.primary : t.colors.textSecondary} />
              <Text style={[styles.bottomLabel, isNarrow && styles.bottomLabelCompact, activeTab === 'stats' && styles.bottomLabelActive]}>Statistiche</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bottomItem} onPress={() => setActiveTab('students')}>
              <UserRoundSearch size={20} color={activeTab === 'students' ? t.colors.primary : t.colors.textSecondary} />
              <Text style={[styles.bottomLabel, isNarrow && styles.bottomLabelCompact, activeTab === 'students' && styles.bottomLabelActive]}>Studenti</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bottomItem} onPress={() => setActiveTab('wallet')}>
              <WalletCards size={20} color={activeTab === 'wallet' ? t.colors.primary : t.colors.textSecondary} />
              <Text style={[styles.bottomLabel, isNarrow && styles.bottomLabelCompact, activeTab === 'wallet' && styles.bottomLabelActive]}>Wallet</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Modal visible={sosHistoryVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSosHistoryVisible(false)}>
        <SafeAreaView style={styles.sosModalRoot}>
          <View style={styles.sosModalHeader}>
            <View style={styles.sosModalTitleWrap}>
              <Text style={styles.sosModalTitle}>Storico SOS</Text>
              <Text style={styles.sosModalSubtitle}>{selectedStudent?.profile.username ?? 'studente'}</Text>
            </View>
            <TouchableOpacity style={styles.sosModalClose} onPress={() => setSosHistoryVisible(false)} accessibilityLabel="Chiudi storico SOS">
              <X size={20} color={t.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.sosModalContent}>
            {sosLogs.length === 0 ? (
              <Text style={styles.emptyInline}>Nessuna richiesta SOS registrata.</Text>
            ) : (
              <View style={styles.logList}>
                {sosLogs.map(renderLogRow)}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: t.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  appLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: t.colors.text,
  },
  topActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: t.colors.textSecondary,
  },
  sosModalRoot: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  sosModalHeader: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  sosModalTitleWrap: {
    gap: 2,
  },
  sosModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: t.colors.text,
  },
  sosModalSubtitle: {
    fontSize: 14,
    color: t.colors.textSecondary,
  },
  sosModalClose: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EEF3FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosModalContent: {
    padding: 16,
    paddingBottom: 28,
  },
  content: {
    padding: 14,
    paddingBottom: 110,
    gap: 12,
  },
  heroCard: {
    backgroundColor: '#1F3D90',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroTopCompact: {
    flexDirection: 'column',
  },
  heroIdentity: {
    flexShrink: 1,
    alignItems: 'flex-start',
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroTitleCompact: {
    fontSize: 24,
    lineHeight: 30,
  },
  heroUser: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionCard: {
    backgroundColor: t.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: 14,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: t.colors.text,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: t.colors.textSecondary,
  },
  overviewStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryList: {
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 14,
    color: t.colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: t.colors.text,
    textAlign: 'right',
  },
  kpiCard: {
    minWidth: '48%',
    flexGrow: 1,
    backgroundColor: '#F7F9FD',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: 12,
    gap: 6,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: '800',
    color: t.colors.text,
  },
  kpiSub: {
    fontSize: 12,
    color: t.colors.textSecondary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chartWrap: {
    gap: 10,
  },
  chartFrame: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 150,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
  },
  chartTrack: {
    width: '100%',
    height: 112,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBar: {
    width: '70%',
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'column-reverse',
  },
  chartSeg: {
    width: '100%',
  },
  chartEmpty: {
    width: '70%',
    height: 4,
    borderRadius: 4,
    backgroundColor: t.colors.border,
  },
  chartDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: t.colors.error,
    marginTop: 6,
  },
  chartDotSpacer: {
    height: 13,
  },
  chartLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: t.colors.textSecondary,
  },
  chartCount: {
    fontSize: 11,
    color: t.colors.text,
    minHeight: 14,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: t.colors.textSecondary,
  },
  studentList: {
    gap: 10,
  },
  studentCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.colors.border,
    overflow: 'hidden',
    backgroundColor: '#FBFCFF',
    position: 'relative',
  },
  studentCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    paddingRight: 60,
    gap: 12,
  },
  studentCardHeadSelected: {
    backgroundColor: t.colors.primary,
  },
  studentCardChevron: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3FA',
  },
  studentCardChevronSelected: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  studentCardText: {
    flex: 1,
    gap: 4,
  },
  studentCardName: {
    fontSize: 18,
    fontWeight: '800',
    color: t.colors.text,
  },
  studentCardNameSelected: {
    color: '#FFFFFF',
  },
  studentCardUser: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },
  studentCardMeta: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },
  studentCardMetaSelected: {
    color: 'rgba(255,255,255,0.86)',
  },
  studentCardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  sliderLabel: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '700',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
  },
  modeRail: {
    flexDirection: 'row',
    backgroundColor: t.colors.surfaceVariant,
    borderRadius: 14,
    padding: 4,
    gap: 6,
  },
  modeChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeChipActive: {
    backgroundColor: t.colors.primary,
  },
  modeChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: t.colors.textSecondary,
  },
  modeChipTextActive: {
    color: '#FFFFFF',
  },
  modeHint: {
    fontSize: 13,
    lineHeight: 19,
    color: t.colors.textSecondary,
  },
  walletPieces: {
    gap: 8,
  },
  walletPiece: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: '#FBFCFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  walletPieceLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletPieceValue: {
    fontSize: 15,
    fontWeight: '700',
    color: t.colors.text,
  },
  walletPieceCountBadge: {
    minWidth: 42,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  walletPieceCount: {
    fontSize: 15,
    fontWeight: '800',
    color: t.colors.text,
  },
  editorList: {
    gap: 8,
  },
  editorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: '#FBFCFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  editorLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editorLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: t.colors.text,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnPlus: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
  stepperCount: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: t.colors.text,
  },
  cartFooter: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cartLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: t.colors.textSecondary,
    textTransform: 'uppercase',
  },
  cartValue: {
    fontSize: 28,
    fontWeight: '800',
    color: t.colors.primary,
  },
  cartButton: {
    minWidth: 132,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: t.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  cartButtonDisabled: {
    opacity: 0.6,
  },
  cartButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  logList: {
    gap: 8,
  },
  logFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  logFilterChip: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: '#F7F9FD',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logFilterChipActive: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
  logFilterChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: t.colors.textSecondary,
  },
  logFilterChipTextActive: {
    color: '#FFFFFF',
  },
  logCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: '#FBFCFF',
    overflow: 'hidden',
  },
  logHead: {
    padding: 12,
    gap: 10,
  },
  logTitleWrap: {
    gap: 8,
  },
  logTag: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  logTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  logMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: t.colors.text,
  },
  logRight: {
    gap: 2,
  },
  logAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: t.colors.text,
  },
  logDate: {
    fontSize: 12,
    color: t.colors.textSecondary,
  },
  logDetails: {
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    padding: 12,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  breakdownList: {
    gap: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: t.colors.surfaceVariant,
  },
  breakdownLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: t.colors.text,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '700',
    color: t.colors.primary,
  },
  emptyCard: {
    backgroundColor: t.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: t.colors.text,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    color: t.colors.textSecondary,
    textAlign: 'center',
  },
  emptyInline: {
    fontSize: 14,
    color: t.colors.textSecondary,
  },
  secondaryInlineBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.colors.error,
    backgroundColor: '#FFF5F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryInlineBtnDisabled: {
    opacity: 0.45,
  },
  secondaryInlineBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryInlineBtnTextDanger: {
    color: t.colors.error,
  },
  primaryInlineBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: t.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryInlineBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingVertical: 8,
    paddingHorizontal: 6,
    shadowColor: '#00133A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 10,
  },
  bottomBarCompact: {
    left: 8,
    right: 8,
    bottom: 8,
    paddingHorizontal: 2,
  },
  bottomItem: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bottomLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: t.colors.textSecondary,
  },
  bottomLabelCompact: {
    fontSize: 10,
  },
  bottomLabelActive: {
    color: t.colors.primary,
  },
});
