import React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { CreditCard, Joystick, WalletCards, Settings } from 'lucide-react-native';
import { RootStackParamList } from '../../navigation/types';
import { useWalletStore } from '../../store/useWalletStore';
import { formatEuro } from '../../utils/paymentLogic';

type Props = StackScreenProps<RootStackParamList, 'StudentHome'>;

export default function StudentHome({ navigation }: Props) {
  const inventory = useWalletStore((s) => s.inventory);
  const balance = inventory.reduce((sum, item) => sum + item.value, 0);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Area studente</Text>
          <Text style={styles.title}>Cosa facciamo?</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
          accessibilityRole="button"
          accessibilityLabel="Impostazioni"
        >
          <Settings size={24} color="#0F6F53" />
        </TouchableOpacity>
        <View style={styles.balancePill}>
          <WalletCards size={20} color="#0F6F53" />
          <Text style={styles.balanceText}>{formatEuro(balance)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.action, styles.payAction]}
          onPress={() => navigation.navigate('PaymentWizard')}
          accessibilityRole="button"
          accessibilityLabel="Apri pagamento"
        >
          <CreditCard size={38} color="#FFFFFF" />
          <Text style={styles.actionTitle}>Pagare</Text>
          <Text style={styles.actionText}>Uso reale alla cassa.</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.action, styles.trainingAction]}
          onPress={() => navigation.navigate('Training')}
          accessibilityRole="button"
          accessibilityLabel="Apri allenamento"
        >
          <Joystick size={38} color="#1F2757" />
          <Text style={[styles.actionTitle, styles.trainingTitle]}>Allenamento</Text>
          <Text style={[styles.actionText, styles.trainingText]}>Prova senza spendere.</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFDF5',
  },
  header: {
    padding: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E5F4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: '#0F6F53',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 8,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '900',
    color: '#18211D',
  },
  balancePill: {
    marginTop: 18,
    alignSelf: 'flex-start',
    borderRadius: 18,
    backgroundColor: '#E5F4EA',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceText: {
    color: '#0F6F53',
    fontSize: 18,
    fontWeight: '900',
  },
  actions: {
    flex: 1,
    padding: 20,
    gap: 18,
  },
  action: {
    flex: 1,
    minHeight: 190,
    borderRadius: 30,
    padding: 24,
    justifyContent: 'space-between',
  },
  payAction: {
    backgroundColor: '#0F6F53',
  },
  trainingAction: {
    backgroundColor: '#FFE56B',
    borderWidth: 3,
    borderColor: '#1F2757',
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
  },
  actionText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 18,
    fontWeight: '700',
  },
  trainingTitle: {
    color: '#1F2757',
  },
  trainingText: {
    color: '#434A78',
  },
});
