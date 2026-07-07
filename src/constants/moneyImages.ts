import { Image } from 'react-native';

const localMoneyImageByValue = {
  50: require('../../assets/money/50euro.jpg'),
  20: require('../../assets/money/20euro.jpg'),
  10: require('../../assets/money/10euro.jpg'),
  5: require('../../assets/money/5euro.jpg'),
  2: require('../../assets/money/2euro.jpg'),
  1: require('../../assets/money/1euro.jpg'),
  0.5: require('../../assets/money/50cent.gif'),
  0.2: require('../../assets/money/20cent.gif'),
  0.1: require('../../assets/money/10cent.gif'),
  0.05: require('../../assets/money/5cent.gif'),
  0.02: require('../../assets/money/2cent.gif'),
  0.01: require('../../assets/money/1cent.gif'),
} as const;

export const MONEY_IMAGE_BY_VALUE: Record<number, string> = Object.fromEntries(
  Object.entries(localMoneyImageByValue).map(([value, source]) => [
    Number(value),
    Image.resolveAssetSource(source).uri,
  ]),
) as Record<number, string>;

export function getMoneyImageUri(value: number): string {
  return MONEY_IMAGE_BY_VALUE[value] ?? '';
}

// Source locale (require) per il taglio: a differenza dell'URI assoluto,
// si risolve sempre, anche per items creati su un altro dispositivo.
export function getMoneyImageSource(value: number): number | null {
  return (localMoneyImageByValue as Record<number, number>)[value] ?? null;
}
