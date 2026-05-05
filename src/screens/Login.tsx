import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { ArrowRight, LockKeyhole, Mail, Sparkles } from 'lucide-react-native';
import { RootStackParamList } from '../navigation/types';
import { signInWithPassword } from '../api/auth';
import { useWalletStore } from '../store/useWalletStore';
import { registerForPushNotifications } from '../services/notifications';

type Props = StackScreenProps<RootStackParamList, 'Login'>;

export default function Login({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const syncWithSupabase = useWalletStore((s) => s.syncWithSupabase);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const compact = width < 390;

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password) {
      Alert.alert('Dati mancanti', 'Inserisci email e password.');
      return;
    }

    setLoading(true);
    try {
      const { session, profile, route } = await signInWithPassword(email.trim(), password);
      await registerForPushNotifications(session.user.id);
      if (profile.role === 'student') {
        await syncWithSupabase(session.user.id);
      }
      navigation.reset({ index: 0, routes: [{ name: route }] });
    } catch (error) {
      Alert.alert('Accesso non riuscito', error instanceof Error ? error.message : 'Riprova.');
    } finally {
      setLoading(false);
    }
  }, [email, navigation, password, syncWithSupabase]);

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.shell, compact && styles.shellCompact]}>
          <View style={styles.hero}>
            <View style={styles.brandBadge}>
              <Sparkles size={20} color="#FFFFFF" />
              <Text style={styles.brandBadgeText}>PagUp</Text>
            </View>
            <View style={styles.heroIcon}>
              <LockKeyhole size={compact ? 28 : 34} color="#FFFFFF" />
            </View>
            <Text style={[styles.title, compact && styles.titleCompact]}>Accedi al tuo spazio</Text>
            <Text style={styles.subtitle}>
              Studente e tutor entrano dallo stesso punto. L’app apre subito la sezione corretta.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={styles.inputWrap}>
                <Mail size={18} color="#5F6B84" />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="nome@email.it"
                  placeholderTextColor="#8B96AC"
                  style={styles.input}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.inputWrap}>
                <LockKeyhole size={18} color="#5F6B84" />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Inserisci la password"
                  placeholderTextColor="#8B96AC"
                  style={styles.input}
                  editable={!loading}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Accedi"
            >
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <ArrowRight size={20} color="#FFFFFF" />}
              <Text style={styles.primaryButtonText}>{loading ? 'Accesso...' : 'Entra'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('Register')}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Vai alla registrazione"
            >
              <Text style={styles.secondaryButtonText}>Crea un nuovo account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EFF3FA',
  },
  keyboard: {
    flex: 1,
  },
  shell: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
    gap: 18,
  },
  shellCompact: {
    paddingHorizontal: 16,
    gap: 14,
  },
  hero: {
    borderRadius: 28,
    backgroundColor: '#143F90',
    padding: 22,
    gap: 12,
  },
  brandBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  brandBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  titleCompact: {
    fontSize: 28,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '600',
  },
  card: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderWidth: 1,
    borderColor: '#D8E0EE',
    gap: 14,
    shadowColor: '#0D2353',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 5,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#46536A',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputWrap: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#D8E0EE',
    backgroundColor: '#F7F9FD',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    color: '#172033',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: '#143F90',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#EEF3FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#143F90',
    fontSize: 15,
    fontWeight: '800',
  },
});
