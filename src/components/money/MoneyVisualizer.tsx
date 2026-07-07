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
import { getMoneyImageSource } from '../../constants/moneyImages';

// Colori ad altissimo contrasto (≥7:1 su sfondo bianco — WCAG AAA).
// Ogni taglio ha un colore unico per distinguibilità cognitiva immediata.
const DENOMINATION_STYLE: Record<number, { bg: string; border: string; text: string; name: string }> = {
  50:   { bg: '#8B4500', border: '#5C2D00', text: '#FFFFFF', name: '50 Euro'   },
  20:   { bg: '#00308F', border: '#001F5C', text: '#FFFFFF', name: '20 Euro'   },
  10:   { bg: '#8B0000', border: '#5C0000', text: '#FFFFFF', name: '10 Euro'   },
  5:    { bg: '#1A5E1A', border: '#0D3D0D', text: '#FFFFFF', name: '5 Euro'    },
  2:    { bg: '#4A3000', border: '#2E1C00', text: '#F0D060', name: '2 Euro'    },
  1:    { bg: '#5C3A00', border: '#3D2600', text: '#F4D878', name: '1 Euro'    },
  0.5:  { bg: '#6B4400', border: '#472D00', text: '#F8E08A', name: '50 Cent'  },
  0.2:  { bg: '#7A5000', border: '#523500', text: '#FDEAA0', name: '20 Cent'  },
  0.1:  { bg: '#8A5C00', border: '#5C3D00', text: '#FDEFAA', name: '10 Cent'  },
  0.05: { bg: '#6B5400', border: '#4A3900', text: '#FEF3B8', name: '5 Cent'   },
  0.02: { bg: '#5A4800', border: '#3D3100', text: '#FFF5C5', name: '2 Cent'   },
  0.01: { bg: '#4A3C00', border: '#322800', text: '#FFF7D5', name: '1 Cent'   },
};

const DEFAULT_STYLE = { bg: '#000000', border: '#333333', text: '#FFFFFF', name: '' };

function getDenominationStyle(value: number) {
  return DENOMINATION_STYLE[value] ?? DEFAULT_STYLE;
}

// ============================================================
// SINGOLO ELEMENTO VISIVO
// Bill = rettangolo orizzontale prominente.
// Coin = cerchio grande.
// Se imageUri è popolato usa Image, altrimenti placeholder testuale.
// ============================================================
interface MoneyChipProps {
  item: MoneyItem;
  size?: 'small' | 'medium' | 'large';
}

export function MoneyChip({ item, size = 'medium' }: MoneyChipProps) {
  const palette = getDenominationStyle(item.value);
  const isBill = item.type === 'bill';
  const chipStyle = SIZE_MAP[size];
  const a11yLabel = `${isBill ? 'Banconota' : 'Moneta'} da ${palette.name || formatEuro(item.value)}`;
  // L'imageUri salvato negli items può provenire da un altro dispositivo
  // (es. wallet ricaricato dal tutor) e non essere risolvibile qui:
  // preferisci sempre l'asset locale corrispondente al valore.
  const localSource = getMoneyImageSource(item.value);
  const source = localSource ?? (item.imageUri ? { uri: item.imageUri } : null);
  const hasPhoto = source !== null;

  return (
    <View
      accessible
      accessibilityLabel={a11yLabel}
      style={[
        styles.chip,
        isBill ? [styles.bill, chipStyle.bill] : [styles.coin, chipStyle.coin],
        hasPhoto
          ? styles.photoChip
          : { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      {source ? (
        <Image
          source={source}
          style={isBill ? chipStyle.photoBill : chipStyle.photoCoin}
          resizeMode="contain"
          accessible={false}
        />
      ) : (
        <Text
          style={[styles.chipValue, chipStyle.text, { color: palette.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatEuro(item.value)}
        </Text>
      )}
    </View>
  );
}

// ============================================================
// VISUALIZZATORE LISTA
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
        accessibilityLabel={label ?? 'Elementi nel portafoglio'}
      >
        {items.map((item) => (
          <MoneyChip key={item.id} item={item} size={size} />
        ))}
      </ScrollView>
    </View>
  );
}

// ============================================================
// DIMENSIONI — touch target WCAG AAA per lo student (≥64dp)
// ============================================================
const SIZE_MAP = {
  small: {
    bill:      { width: 90, height: 56, borderRadius: 8, borderWidth: 3 } as ViewStyle,
    coin:      { width: 56, height: 56, borderRadius: 28, borderWidth: 3 } as ViewStyle,
    text:      { fontSize: 18, fontWeight: '900' as const },
    imageBill: { width: 80, height: 46 },
    imageCoin: { width: 46, height: 46 },
    photoBill: { width: 90, height: 56 },
    photoCoin: { width: 56, height: 56 },
  },
  medium: {
    bill:      { width: 130, height: 80, borderRadius: 12, borderWidth: 3 } as ViewStyle,
    coin:      { width: 80, height: 80, borderRadius: 40, borderWidth: 3 } as ViewStyle,
    text:      { fontSize: 20, fontWeight: '900' as const },
    imageBill: { width: 118, height: 68 },
    imageCoin: { width: 68, height: 68 },
    photoBill: { width: 130, height: 80 },
    photoCoin: { width: 80, height: 80 },
  },
  large: {
    bill:      { width: 170, height: 104, borderRadius: 16, borderWidth: 4 } as ViewStyle,
    coin:      { width: 104, height: 104, borderRadius: 52, borderWidth: 4 } as ViewStyle,
    text:      { fontSize: 28, fontWeight: '900' as const },
    imageBill: { width: 154, height: 90 },
    imageCoin: { width: 90, height: 90 },
    photoBill: { width: 170, height: 104 },
    photoCoin: { width: 104, height: 104 },
  },
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 4,
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoChip: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
  },
  bill: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  coin: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  chipValue: {
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#303030',
    fontSize: 18,
    fontWeight: '700',
  },
});
