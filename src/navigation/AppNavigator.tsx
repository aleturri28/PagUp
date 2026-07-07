import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import Login from '../screens/Login';
import Register from '../screens/Register';
import SettingsScreen from '../screens/Settings';
import TutorSettings from '../screens/tutor/Settings';
import StudentHome from '../screens/student/Home';
import PaymentWizard from '../screens/student/PaymentWizard';
import Training from '../screens/student/Training';
import TutorDashboard from '../screens/tutor/Dashboard';
import { RootStackParamList } from './types';
import { getCurrentSession, getProfile, routeForRole } from '../api/auth';
import { useWalletStore } from '../store/useWalletStore';
import { registerForPushNotifications } from '../services/notifications';

const Stack = createStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const syncWithSupabase = useWalletStore((s) => s.syncWithSupabase);
  const stopSync = useWalletStore((s) => s.stopSync);
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const session = await getCurrentSession();
        if (!session) {
          if (mounted) setInitialRoute('Login');
          return;
        }

        const profile = await getProfile(session.user.id);
        await registerForPushNotifications(session.user.id);
        if (profile.role === 'student') {
          await syncWithSupabase(session.user.id);
        } else {
          stopSync();
        }

        if (mounted) {
          setInitialRoute(routeForRole(profile.role));
        }
      } catch (error) {
        console.warn('[Navigation] Bootstrap fallito:', error);
        if (mounted) setInitialRoute('Login');
      }
    }

    bootstrap().catch(() => {});
    return () => {
      mounted = false;
    };
  }, [stopSync, syncWithSupabase]);

  if (!initialRoute) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#0F6F53" />
        <Text style={styles.loadingText}>Apro PagUp...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="Register" component={Register} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="TutorSettings" component={TutorSettings} />
        <Stack.Screen name="StudentHome" component={StudentHome} />
        <Stack.Screen name="PaymentWizard" component={PaymentWizard} />
        <Stack.Screen name="Training" component={Training} />
        <Stack.Screen name="TutorDashboard" component={TutorDashboard} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  loadingText: {
    color: '#41524A',
    fontSize: 16,
    fontWeight: '700',
  },
});
