import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  ViewStyle,
} from 'react-native';
import { MoneyItem } from '../../api/database.types';
import { formatEuro } from '../../utils/paymentLogic';

// ============================================================
// PALETTE VISIVA PER OGNI TAGLIO
// Simula i colori reali delle banconote/monete Euro.
// Sostituire 'backgroundColor' con un'Image quando gli asset
// saranno disponibili in src/assets/money/.
// ============================================================
const DENOMINATION_STYLE: Record<number, { bg: string; border: string; text: string }> = {
  // Banconote
  5:   { bg: '#D4EDDA', border: '#28A745', text: '#155724' },
  10:  { bg: '#CCE5FF', border: '#0069D9', text: '#004085' },
  20:  { bg: '#FFF3CD', border: '#D39E00', text: '#856404' },
  50:  { bg: '#FFE5B4', border: '#E07B00', text: '#7A3E00' },
  // Monete
  2:   { bg: '#E8D5B7', border: '#8B6914', text: '#5C4300' },
  1:   { bg: '#F0E6C8', border: '#A07840', text: '#6B4E1A' },
  0.5: { bg: '#F5E6CC', border: '#B8903A', text: '#7A5520' },
  0.2: { bg: '#F8F0E0', border: '#C4A060', text: '#8B6530' },
  0.1: { bg: '#FBF5EA', border: '#D4B070', text: '#9A7040' },
  0.05:{ bg: '#FDF8F0', border: '#E0C080', text: '#A88050' },
  0.02:{ bg: '#FEFCF5', border: '#EAD090', text: '#B89060' },
  0.01:{ bg: '#FFFFF8', border: '#F0DCA0', text: '#C8A070' },
};

const DEFAULT_STYLE = { bg: '#F0F0F0', border: '#AAAAAA', text: '#333333' };

function getDenominationStyle(value: number) {
  return DENOMINATION_STYLE[value] ?? DEFAULT_STYLE;
}

// ============================================================
// SINGOLO ELEMENTO VISIVO
// Se imageUri è popolato usa Image, altrimenti usa il placeholder.
// ============================================================
interface MoneyChipProps {
  item: MoneyItem;
  size?: 'small' | 'medium' | 'large';
}

export function MoneyChip({ item, size = 'medium' }: MoneyChipProps) {
  const palette = getDenominationStyle(item.value);
  const isBill = item.type === 'bill';
  const chipStyle = SIZE_MAP[size];

  return (
    <View
      accessible
      accessibilityLabel={`${isBill ? 'Banconota' : 'Moneta'} da ${formatEuro(item.value)}`}
      style={[
        styles.chip,
        chipStyle.container,
        isBill ? styles.bill : styles.coin,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
      ]}
    >
      {item.imageUri ? (
        <Image
          source={{ uri: item.imageUri }}
          style={chipStyle.image}
          resizeMode="contain"
          accessible={false}
        />
      ) : (
        <Text style={[styles.chipValue, chipStyle.text, { color: palette.text }]}>
          {formatEuro(item.value)}
        </Text>
      )}
    </View>
  );
}

// ============================================================
// VISUALIZZATORE LISTA
// Mostra tutti gli items in un ScrollView orizzontale wrappato.
// ============================================================
interface MoneyVisualizerProps {
  items: MoneyItem[];
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
  label?: string;
}

export function MoneyVisualizer({
  items,
  size = 'medium',
  style,
  label,
}: MoneyVisualizerProps) {
  if (items.length === 0) {
    return (
      <View style={[styles.emptyContainer, style]}>
        <Text style={styles.emptyText}>Nessun elemento</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <ScrollView
        horizontal={false}
        contentContainerStyle={styles.grid}
        accessible
        accessibilityLabel={label ?? 'Elementi nel wallet'}
      >
        {items.map((item) => (
          <MoneyChip key={item.id} item={item} size={size} />
        ))}
      </ScrollView>
    </View>
  );
}

// ============================================================
// DIMENSIONI PER OGNI SIZE
// ============================================================
const SIZE_MAP = {
  small: {
    container: { width: 64, height: 40, borderRadius: 8, borderWidth: 2 } as ViewStyle,
    text: { fontSize: 12 },
    image: { width: 56, height: 32 },
  },
  medium: {
    container: { width: 96, height: 60, borderRadius: 12, borderWidth: 2.5 } as ViewStyle,
    text: { fontSize: 16 },
    image: { width: 84, height: 52 },
  },
  large: {
    container: { width: 140, height: 90, borderRadius: 16, borderWidth: 3 } as ViewStyle,
    text: { fontSize: 22 },
    image: { width: 124, height: 80 },
  },
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 4,
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Le banconote sono rettangolari, le monete tonde.
  bill: {
    borderRadius: 12,
  },
  coin: {
    borderRadius: 999,
    aspectRatio: 1,
    width: undefined,
    height: undefined,
  },
  chipValue: {
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
});
