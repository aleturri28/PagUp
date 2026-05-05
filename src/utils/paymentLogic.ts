import { MoneyItem } from '../api/database.types';

// ============================================================
// TAGLI EURO VALIDI
// Usati per validazione e come riferimento dell'algoritmo.
// ============================================================
export const EURO_DENOMINATIONS = [
  50.00, 20.00, 10.00, 5.00,
  2.00, 1.00,
  0.50, 0.20, 0.10, 0.05, 0.02, 0.01,
] as const;

export type EuroDenomination = (typeof EURO_DENOMINATIONS)[number];
export type PaymentMode = 'exact' | 'fast';

// ============================================================
// RISULTATO DEL CALCOLO DI PAGAMENTO
// ============================================================
export interface PaymentResult {
  // Gli items selezionati dall'inventory per effettuare il pagamento.
  selectedItems: MoneyItem[];
  // Totale coperto dagli items selezionati (>= total richiesto).
  coveredAmount: number;
  // Resto da ricevere (coveredAmount - total). Può essere 0.
  change: number;
  // True se il totale esatto è stato raggiunto senza resto.
  isExact: boolean;
  // True se l'inventory non ha abbastanza denaro per coprire il totale.
  isInsufficient: boolean;
}

// ============================================================
// ARROTONDAMENTO A 2 DECIMALI (evita floating-point drift)
// ============================================================
const round2 = (n: number): number => Math.round(n * 100) / 100;
const toCents = (n: number): number => Math.round(n * 100);
const fromCents = (n: number): number => round2(n / 100);
const MIN_USABLE_CENTS = 10;

export const roundPaymentTarget = (amount: number): number =>
  fromCents(Math.ceil(toCents(amount) / MIN_USABLE_CENTS) * MIN_USABLE_CENTS);

function isUsableItem(item: MoneyItem): boolean {
  return toCents(item.value) >= MIN_USABLE_CENTS;
}

function resultFromSelection(selectedItems: MoneyItem[], total: number): PaymentResult {
  const coveredAmount = round2(selectedItems.reduce((sum, item) => sum + item.value, 0));
  const isInsufficient = coveredAmount < roundPaymentTarget(total);
  const change = isInsufficient ? 0 : round2(coveredAmount - total);

  return {
    selectedItems,
    coveredAmount,
    change,
    isExact: change === 0 && !isInsufficient,
    isInsufficient,
  };
}

function findExactCombination(items: MoneyItem[], targetCents: number): MoneyItem[] | null {
  const sorted = [...items].sort((a, b) => toCents(b.value) - toCents(a.value));
  const bySum = new Map<number, MoneyItem[]>();
  bySum.set(0, []);

  for (const item of sorted) {
    const value = toCents(item.value);
    const entries = Array.from(bySum.entries());
    for (const [sum, combo] of entries) {
      const nextSum = sum + value;
      if (nextSum > targetCents || bySum.has(nextSum)) continue;
      const nextCombo = [...combo, item];
      if (nextSum === targetCents) return nextCombo;
      bySum.set(nextSum, nextCombo);
    }
  }

  return null;
}

function findSmallestCoveringCombination(items: MoneyItem[], targetCents: number): MoneyItem[] {
  const sorted = [...items].sort((a, b) => toCents(b.value) - toCents(a.value));
  const bySum = new Map<number, MoneyItem[]>();
  bySum.set(0, []);

  for (const item of sorted) {
    const value = toCents(item.value);
    const entries = Array.from(bySum.entries());
    for (const [sum, combo] of entries) {
      const nextSum = sum + value;
      if (bySum.has(nextSum)) continue;
      bySum.set(nextSum, [...combo, item]);
    }
  }

  let bestSum = Number.POSITIVE_INFINITY;
  let bestCombo: MoneyItem[] = [];
  bySum.forEach((combo, sum) => {
    if (sum >= targetCents && sum < bestSum) {
      bestSum = sum;
      bestCombo = combo;
    }
  });

  return bestCombo;
}

function calculateExactModePayment(inventory: MoneyItem[], total: number): PaymentResult {
  const targetCents = toCents(roundPaymentTarget(total));
  const usableItems = (inventory || []).filter(isUsableItem);
  const exactCombo = findExactCombination(usableItems, targetCents);
  return resultFromSelection(exactCombo ?? findSmallestCoveringCombination(usableItems, targetCents), total);
}

function calculateFastModePayment(inventory: MoneyItem[], total: number): PaymentResult {
  const target = roundPaymentTarget(total);
  const selectedItems: MoneyItem[] = [];
  let coveredAmount = 0;

  const bills = (inventory || [])
    .filter((item) => item.type === 'bill' && isUsableItem(item))
    .sort((a, b) => b.value - a.value);
  const coins = (inventory || [])
    .filter((item) => item.type === 'coin' && isUsableItem(item))
    .sort((a, b) => b.value - a.value);

  for (const item of bills) {
    if (round2(coveredAmount) >= target) break;
    selectedItems.push(item);
    coveredAmount = round2(coveredAmount + item.value);
  }

  for (const item of coins) {
    if (round2(coveredAmount) >= target) break;
    selectedItems.push(item);
    coveredAmount = round2(coveredAmount + item.value);
  }

  return resultFromSelection(selectedItems, total);
}

export function calculateStudentPayment(
  inventory: MoneyItem[],
  total: number,
  mode: PaymentMode = 'exact',
): PaymentResult {
  return mode === 'fast'
    ? calculateFastModePayment(inventory, total)
    : calculateExactModePayment(inventory, total);
}

// ============================================================
// ALGORITMO GREEDY DI PAGAMENTO
//
// Strategia:
// 1. Ordina l'inventory dal taglio più grande al più piccolo.
// 2. Per ogni item (partendo dal più grande), aggiungilo alla
//    selezione finché non supera o raggiunge il totale.
// 3. Se l'inventory non copre il totale → isInsufficient = true.
//
// Perché Greedy e non Exact Change First?
// L'obiettivo educativo è insegnare a usare le monete più grandi
// possibili, non necessariamente il cambio esatto. Il tutor
// riempirebbe il wallet con i tagli corretti per l'esercizio.
// ============================================================
export function calculateOptimalPayment(
  inventory: MoneyItem[],
  total: number,
): PaymentResult {
  return calculateStudentPayment(inventory, total, 'exact');
}

// ============================================================
// SOTTRAI GLI ITEMS USATI DALL'INVENTORY
//
// Rimuove gli items per ID. Non tocca gli items non selezionati.
// Restituisce il nuovo inventory senza mutare l'originale.
// ============================================================
export function subtractItemsFromInventory(
  inventory: MoneyItem[],
  usedItems: MoneyItem[],
): MoneyItem[] {
  const usedIds = new Set(usedItems.map((i) => i.id));
  return inventory.filter((item) => !usedIds.has(item.id));
}

// ============================================================
// FORMATTAZIONE IMPORTO IN EURO (es. 12.5 → "12,50 €")
// ============================================================
export function formatEuro(amount: number): string {
  return amount.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });
}
