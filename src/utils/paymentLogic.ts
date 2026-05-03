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
  // Ordina per valore decrescente: prima le banconote grandi.
  const safeInventory = inventory || [];
  const sorted = [...safeInventory].sort((a, b) => b.value - a.value);

  const selectedItems: MoneyItem[] = [];
  let coveredAmount = 0;

  for (const item of sorted) {
    // Aggiungi l'item solo se non abbiamo ancora coperto il totale.
    if (round2(coveredAmount) < round2(total)) {
      selectedItems.push(item);
      coveredAmount = round2(coveredAmount + item.value);
    }
  }

  const isInsufficient = round2(coveredAmount) < round2(total);
  const change = isInsufficient ? 0 : round2(coveredAmount - total);

  return {
    selectedItems,
    coveredAmount,
    change,
    isExact: change === 0 && !isInsufficient,
    isInsufficient,
  };
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
