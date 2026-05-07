import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { ArrowLeft, Link2, LogOut, ShieldCheck, UserPlus, X } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { RootStackParamList } from '../navigation/types';
import { getProfile, signOut } from '../api/auth';
import { supabase } from '../api/supabase';
import { useWalletStore } from '../store/useWalletStore';

type Props = StackScreenProps<RootStackParamList, 'Settings'>;

const PAIRING_PREFIX = 'pagup-student:';

export default function SettingsScreen({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  const stopSync = useWalletStore((s) => s.stopSync);
  const isUnlocked = route.params?.unlocked === true;
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState('Studente');
  const [username, setUsername] = useState('');
  const [qrVisible, setQrVisible] = useState(false);
  const compact = width < 390;
  const qrBoxSize = Math.max(220, Math.min(width - 72, 286));
  const qrCodeSize = Math.max(180, Math.min(qrBoxSize - 38, 230));

  useEffect(() => {
    let mounted = true;

    async function loadStudent() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw error ?? new Error('Utente non autenticato.');

        const profile = await getProfile(data.user.id);
        if (profile.role !== 'student') {
          navigation.replace('TutorSettings');
          return;
        }

        if (!isUnlocked) {
          Alert.alert('Accesso protetto', 'Le impostazioni studente si aprono solo dopo il controllo PIN del tutor.');
          navigation.replace('StudentHome');
          return;
        }

        if (!mounted) return;
        setUserId(data.user.id);
        setName(profile.fullName ?? 'Studente');
        setUsername(profile.username);
      } catch (error) {
        Alert.alert('Profilo non disponibile', error instanceof Error ? error.message : 'Riprova.');
      } finally {
        if (mounted) setProfileLoading(false);
      }
    }

    loadStudent().catch(() => {});
    return () => { mounted = false; };
  }, [isUnlocked, navigation]);

  const pairingValue = useMemo(
    () => (userId ? `${PAIRING_PREFIX}${userId}` : ''),
    [userId],
  );

  const handleLogout = useCallback(() => {
    Alert.alert('Esci', 'Vuoi uscire dall’account studente?', [
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
        <Text style={styles.title}>Impostazioni</Text>
        <View style={styles.iconSpacer} />
      </View>

      <View style={[styles.content, compact && styles.contentCompact]}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <ShieldCheck size={22} color="#FFFFFF" />
          </View>
          <Text style={[styles.heroName, compact && styles.heroNameCompact]}>{name}</Text>
          <Text style={styles.heroUser}>@{username}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Collega tutor</Text>
          <Text style={styles.cardBody}>Mostra il QR al tutor per farti associare alla sua dashboard.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setQrVisible(true)}>
            <UserPlus size={20} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Mostra QR studente</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} disabled={loading || profileLoading}>
          {loading || profileLoading ? <ActivityIndicator color="#FFFFFF" /> : <LogOut size={20} color="#FFFFFF" />}
          <Text style={styles.logoutText}>{loading ? 'Uscita...' : 'Esci dall’account'}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={qrVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setQrVisible(false)}>
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Link2 size={22} color="#1F3C88" />
              <Text style={styles.modalTitle}>Pairing studente</Text>
            </View>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setQrVisible(false)} accessibilityLabel="Chiudi">
              <X size={22} color="#1D2A43" />
            </TouchableOpacity>
          </View>

          <View style={styles.qrStage}>
            <View style={[styles.qrBox, { width: qrBoxSize, height: qrBoxSize }]}>
              {pairingValue ? <QRCode value={pairingValue} size={qrCodeSize} quietZone={12} /> : null}
            </View>
            <Text style={styles.qrTitle}>Mostra questo QR al tutor</Text>
            <Text style={styles.qrText}>Quando viene scansionato, il tuo profilo compare subito nella dashboard tutor.</Text>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
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
  modalRoot: { flex: 1, backgroundColor: '#F5F7FB' },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1D2A43',
  },
  qrStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 18,
  },
  qrBox: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8DFEC',
  },
  qrTitle: {
    color: '#1D2A43',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  qrText: {
    color: '#59657A',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
});
