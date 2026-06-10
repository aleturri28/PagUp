import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useWalletStore } from '../../store/useWalletStore';
import { MoneyItem } from '../../api/database.types';
import { formatEuro } from '../../utils/paymentLogic';
import { getMoneyImageUri } from '../../constants/moneyImages';
import { studentTheme as t } from '../../theme';

// Importo di test per il pulsante "Paga"
const TEST_PAYMENT_AMOUNT = 12.5;

// ============================================================
// CARD SINGOLA ITEM
// ============================================================
interface MoneyCardProps {
  item: MoneyItem;
  isSelected: boolean;
}

function MoneyCard({ item, isSelected }: MoneyCardProps) {
  return (
    <View
      style={[styles.card, isSelected && styles.cardSelected]}
      accessible
      accessibilityLabel={`${item.type === 'coin' ? 'Moneta' : 'Banconota'} da ${formatEuro(item.value)}${isSelected ? ', selezionata per il pagamento' : ''}`}
      accessibilityHint={isSelected ? 'Questo taglio verrà usato per il pagamento' : 'Taglio nel portafoglio'}
    >
      {/* Segnaposto immagine */}
      <View style={[styles.imagePlaceholder, item.type === 'bill' ? styles.billPlaceholder : styles.coinPlaceholder]}>
        <Text style={styles.imagePlaceholderText}>
          {item.type === 'coin' ? '🪙' : '💵'}
        </Text>
      </View>

      <Text style={styles.cardValue}>{formatEuro(item.value)}</Text>
      <Text style={styles.cardType}>{item.type === 'coin' ? 'Moneta' : 'Banconota'}</Text>

      {isSelected && (
        <View style={styles.selectedBadge} accessible={false}>
          <Text style={styles.selectedBadgeText}>✓</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// SCHERMATA DI TEST WALLET
// ============================================================
export default function WalletTest() {
  const inventory = useWalletStore((s) => s.inventory);
  const calculateOptimalPayment = useWalletStore((s) => s.calculateOptimalPayment);
  const processPayment = useWalletStore((s) => s.processPayment);
  const setInventory = useWalletStore((s) => s.setInventory);
  const isBypassActive = useWalletStore((s) => s.isBypassActive);
  const toggleBypass = useWalletStore((s) => s.toggleBypass);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Calcola l'anteprima degli items che verrebbero usati per il pagamento.
  const preview = calculateOptimalPayment(TEST_PAYMENT_AMOUNT);

  const handlePayment = useCallback(() => {
    const result = processPayment(TEST_PAYMENT_AMOUNT);
    setSelectedIds(new Set());

    if (result.isInsufficient && !isBypassActive) {
      Alert.alert('Fondi insufficienti', 'Non hai abbastanza soldi nel wallet.');
      return;
    }

    const msg = result.isInsufficient
      ? `Bypass attivo. Pagamento di ${formatEuro(TEST_PAYMENT_AMOUNT)} registrato.`
      : `Pagato ${formatEuro(result.coveredAmount)}.\nResto: ${formatEuro(result.change)}`;

    Alert.alert('Pagamento completato', msg);
  }, [processPayment, isBypassActive]);

  // Carica dati di test nell'inventory per poter testare l'algoritmo.
  const handleLoadTestData = useCallback(() => {
    const testItems: MoneyItem[] = [
      { id: '1', value: 10.00, type: 'bill',  imageUri: getMoneyImageUri(10) },
      { id: '2', value: 5.00,  type: 'bill',  imageUri: getMoneyImageUri(5) },
      { id: '3', value: 2.00,  type: 'coin',  imageUri: getMoneyImageUri(2) },
      { id: '4', value: 1.00,  type: 'coin',  imageUri: getMoneyImageUri(1) },
      { id: '5', value: 0.50,  type: 'coin',  imageUri: getMoneyImageUri(0.5) },
      { id: '6', value: 0.20,  type: 'coin',  imageUri: getMoneyImageUri(0.2) },
      { id: '7', value: 0.20,  type: 'coin',  imageUri: getMoneyImageUri(0.2) },
      { id: '8', value: 0.10,  type: 'coin',  imageUri: getMoneyImageUri(0.1) },
    ];
    setInventory(testItems);
  }, [setInventory]);

  const renderItem = useCallback(
    ({ item }: { item: MoneyItem }) => (
      <MoneyCard
        item={item}
        isSelected={preview.selectedItems.some((s) => s.id === item.id)}
      />
    ),
    [preview.selectedItems],
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Wallet Test</Text>

      {/* Statistiche inventory */}
      <View style={styles.statsRow} accessible accessibilityLabel={`Hai ${inventory.length} oggetti nel wallet`} accessibilityHint="Mostra il numero di elementi e il saldo totale del wallet">
        <Text style={styles.statsText}>Items: {inventory.length}</Text>
        <Text style={styles.statsText}>
          Totale:{' '}
          {formatEuro(inventory.reduce((sum, i) => sum + i.value, 0))}
        </Text>
      </View>

      {/* Anteprima selezione algoritmo */}
      {inventory.length > 0 && (
        <View style={styles.previewBox} accessible accessibilityLabel={`Per pagare ${formatEuro(TEST_PAYMENT_AMOUNT)}: selezionati ${preview.selectedItems.length} items, coprono ${formatEuro(preview.coveredAmount)}`} accessibilityHint="Mostra l'anteprima dei tagli che verranno usati dall'algoritmo">
          <Text style={styles.previewTitle}>
            Algoritmo per {formatEuro(TEST_PAYMENT_AMOUNT)}:
          </Text>
          <Text style={styles.previewText}>
            {preview.isInsufficient
              ? 'Fondi insufficienti'
              : `${preview.selectedItems.length} items → Copre ${formatEuro(preview.coveredAmount)} (resto ${formatEuro(preview.change)})`}
          </Text>
        </View>
      )}

      {/* Lista items */}
      <FlatList
        data={inventory}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Wallet vuoto. Carica dati di test.</Text>
        }
      />

      {/* Controlli */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={handleLoadTestData}
          accessible
          accessibilityLabel="Carica dati di test nel wallet"
          accessibilityHint="Aggiunge monete e banconote di esempio per testare il pagamento"
          accessibilityRole="button"
        >
          <Text style={styles.btnSecondaryText}>Carica Dati Test</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnBypass, isBypassActive && styles.btnBypassActive]}
          onPress={toggleBypass}
          accessible
          accessibilityLabel={`Ho altri soldi: ${isBypassActive ? 'attivo' : 'non attivo'}`}
          accessibilityHint="Attiva o disattiva la modalità bypass per pagare con banconote diverse"
          accessibilityRole="switch"
        >
          <Text style={styles.btnBypassText}>
            Ho altri soldi {isBypassActive ? '✓' : '○'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnPay}
          onPress={handlePayment}
          accessible
          accessibilityLabel={`Paga ${formatEuro(TEST_PAYMENT_AMOUNT)}`}
          accessibilityHint="Esegue il pagamento di test e mostra il risultato"
          accessibilityRole="button"
        >
          <Text style={styles.btnPayText}>Paga {formatEuro(TEST_PAYMENT_AMOUNT)}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ============================================================
// STILI
// Contrasto elevato (WCAG AAA), touch target >= 48dp
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginVertical: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
    marginHorizontal: 16,
    borderRadius: 8,
  },
  statsText: {
    fontSize: t.typography.sizeSM,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  previewBox: {
    margin: 16,
    padding: 12,
    backgroundColor: '#EBF5FB',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2980B9',
  },
  previewTitle: {
    fontSize: t.typography.sizeSM,
    fontWeight: '700',
    color: '#1A5276',
    marginBottom: 4,
  },
  previewText: {
    fontSize: t.typography.sizeSM,
    color: '#1A5276',
  },
  list: {
    padding: 8,
    paddingBottom: 16,
  },
  card: {
    flex: 1,
    margin: 8,
    padding: 12,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    minHeight: 120,
  },
  cardSelected: {
    borderColor: t.colors.success,
    backgroundColor: '#EAFAF1',
  },
  imagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  coinPlaceholder: {
    backgroundColor: '#FEF9E7',
    borderWidth: 2,
    borderColor: '#F1C40F',
  },
  billPlaceholder: {
    backgroundColor: '#EBF5FB',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3498DB',
  },
  imagePlaceholderText: {
    fontSize: 28,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  cardType: {
    fontSize: t.typography.sizeSM,
    color: t.colors.textSecondary,
    marginTop: 2,
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: t.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedBadgeText: {
    color: '#FFFFFF',
    fontSize: t.typography.sizeSM,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: t.colors.textSecondary,
    fontSize: t.typography.sizeSM,
    marginTop: 40,
  },
  controls: {
    padding: 16,
    gap: 12,
  },
  btnPay: {
    backgroundColor: t.colors.success,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  btnPayText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: '#ECF0F1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: t.spacing.touchTarget,
    justifyContent: 'center',
  },
  btnSecondaryText: {
    color: '#1A1A1A',
    fontSize: t.typography.sizeSM,
    fontWeight: '600',
  },
  btnBypass: {
    backgroundColor: '#FDF2E9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E67E22',
    minHeight: t.spacing.touchTarget,
    justifyContent: 'center',
  },
  btnBypassActive: {
    backgroundColor: '#FDEBD0',
    borderColor: '#CA6F1E',
  },
  btnBypassText: {
    color: '#784212',
    fontSize: t.typography.sizeSM,
    fontWeight: '600',
  },
});
