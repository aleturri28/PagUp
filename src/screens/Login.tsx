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
import { LockKeyhole, LogIn } from 'lucide-react-native';
import { RootStackParamList } from '../navigation/types';
import { signInWithPassword } from '../api/auth';
import { useWalletStore } from '../store/useWalletStore';
import { registerForPushNotifications } from '../services/notifications';

type Props = StackScreenProps<RootStackParamList, 'Login'>;

export default function Login({ navigation }: Props) {
  const syncWithSupabase = useWalletStore((s) => s.syncWithSupabase);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <View style={styles.brandIcon}>
            <LockKeyhole size={34} color="#0E3B2E" />
          </View>
          <Text style={styles.title}>PagUp</Text>
          <Text style={styles.subtitle}>Accedi per aprire l'area corretta.</Text>

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

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Accedi"
          >
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <LogIn size={22} color="#FFFFFF" />}
            <Text style={styles.buttonText}>{loading ? 'Accesso...' : 'Entra'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('Register')}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Registrati"
          >
            <Text style={styles.backButtonText}>Non hai un account? Registrati</Text>
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
});
