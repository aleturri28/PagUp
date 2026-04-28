import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import PaymentWizard from './src/screens/student/PaymentWizard';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="dark" />
      <PaymentWizard />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
