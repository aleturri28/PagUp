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
  View,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { LockKeyhole, UserPlus } from 'lucide-react-native';
import { RootStackParamList } from '../navigation/types';
import { signUp } from '../api/auth';
import { useWalletStore } from '../store/useWalletStore';
import { registerForPushNotifications } from '../services/notifications';

type Props = StackScreenProps<RootStackParamList, 'Register'>;

export default function Register({ navigation }: Props) {
  const syncWithSupabase = useWalletStore((s) => s.syncWithSupabase);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'student' | 'tutor'>('student');
  const [loading, setLoading] = useState(false);

  const handleRegister = useCallback(async () => {
    if (!email.trim() || !password) {
      Alert.alert('Dati mancanti', 'Inserisci email e password.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password non corrispondenti', 'Le password inserite non coincidono.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Password debole', 'La password deve essere lunga almeno 6 caratteri.');
      return;
    }

    setLoading(true);
    try {
      const { session, profile, route } = await signUp(email.trim(), password, role);
      await registerForPushNotifications(session.user.id);
      if (profile.role === 'student') {
        await syncWithSupabase(session.user.id);
      }
      Alert.alert(
        'Registrazione completata',
        `Benvenuto in PagUp come ${profile.role === 'student' ? 'Studente' : 'Tutor'}!`,
        [{ text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: route }] }) }]
      );
    } catch (error) {
      Alert.alert(
        'Registrazione non riuscita',
        error instanceof Error ? error.message : 'Riprova.'
      );
    } finally {
      setLoading(false);
    }
  }, [email, password, confirmPassword, role, navigation, syncWithSupabase]);

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <View style={styles.brandIcon}>
            <UserPlus size={34} color="#0E3B2E" />
          </View>
          <Text style={styles.title}>Crea Account</Text>
          <Text style={styles.subtitle}>Scegli il tuo ruolo. Non potrà essere cambiato.</Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="email"
            style={styles.input}
            editable={!loading}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="password"
            style={styles.input}
            editable={!loading}
          />
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="conferma password"
            style={styles.input}
            editable={!loading}
          />

          <Text style={styles.roleLabel}>Seleziona il tuo ruolo:</Text>
          <View style={styles.roleSelector}>
            <TouchableOpacity
              style={[styles.roleOption, role === 'student' && styles.roleOptionActive]}
              onPress={() => setRole('student')}
            >
              <Text style={[styles.roleOptionText, role === 'student' && styles.roleOptionTextActive]}>
                Studente
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleOption, role === 'tutor' && styles.roleOptionActive]}
              onPress={() => setRole('tutor')}
            >
              <Text style={[styles.roleOptionText, role === 'tutor' && styles.roleOptionTextActive]}>
                Tutor
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Registrati"
          >
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <UserPlus size={22} color="#FFFFFF" />}
            <Text style={styles.buttonText}>{loading ? 'Creazione...' : 'Crea Account'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Torna al login"
          >
            <Text style={styles.backButtonText}>Hai già un account? Accedi</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F4F7F4',
  },
  keyboard: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
  },
  card: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderWidth: 1,
    borderColor: '#DCE5DC',
    shadowColor: '#1D2B23',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 5,
  },
  brandIcon: {
    width: 66,
    height: 66,
    borderRadius: 20,
    backgroundColor: '#E4F1E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 38,
    fontWeight: '900',
    color: '#102B22',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 22,
    fontSize: 16,
    color: '#64746C',
  },
  input: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#D7E0D8',
    paddingHorizontal: 16,
    marginBottom: 12,
    fontSize: 17,
    color: '#17251E',
    backgroundColor: '#FBFCFB',
  },
  roleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64746C',
    marginBottom: 8,
    marginTop: 4,
  },
  button: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: '#0F6F53',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  backButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#0F6F53',
    fontSize: 16,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  divider: {
    height: 1,
    backgroundColor: '#DCE5DC',
    marginVertical: 20,
  },
  roleSelector: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#F4F7F4',
    borderRadius: 14,
    padding: 4,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  roleOptionActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#1D2B23',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  roleOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64746C',
  },
  roleOptionTextActive: {
    color: '#0F6F53',
    fontWeight: '800',
  },
});
