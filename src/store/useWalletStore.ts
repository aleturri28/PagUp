import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { RealtimeChannel } from '@supabase/supabase-js';
import { MoneyItem } from '../api/database.types';
import { supabase } from '../api/supabase';
import {
  calculateOptimalPayment,
  calculateStudentPayment,
  subtractItemsFromInventory,
  PaymentResult,
  PaymentMode,
} from '../utils/paymentLogic';
import { persistWallet, recordPayment } from '../api/payments';

// ============================================================
// STATO DEL WALLET
// ============================================================
interface WalletState {
  // Contenuto del portafoglio dello studente.
  inventory: MoneyItem[];

  // Flag "Ho altri soldi": se attivo, permette il pagamento
  // anche con inventory vuoto o insufficiente.
  isBypassActive: boolean;

  // Canale Realtime Supabase attivo (non persistito).
  _realtimeChannel: RealtimeChannel | null;
}

// ============================================================
// AZIONI DELLO STORE
// ============================================================
interface WalletActions {
  // Calcola la combinazione ottimale di items per il totale dato.
  // Non modifica lo stato: è una query pura sullo store.
  calculateOptimalPayment: (total: number) => PaymentResult;

  // Esegue il pagamento: sottrae gli items usati dall'inventory.
  // Se isBypassActive e l'inventory è insufficiente, logga e bypassa.
  processPayment: (total: number) => PaymentResult;

  // Versione reale: aggiorna wallet Supabase, registra log e notifica il tutor.
  processRealPayment: (total: number, coveredOverride?: number, mode?: PaymentMode) => Promise<PaymentResult>;

  // Attiva/disattiva il bypass "Ho altri soldi".
  toggleBypass: () => void;

  // Imposta direttamente l'inventory (usato dal tutor o dal sync).
  setInventory: (items: MoneyItem[]) => void;

  // Avvia la sottoscrizione Realtime per l'utente autenticato.
  // Chiama questa funzione dopo il login dello studente.
  syncWithSupabase: (userId: string) => Promise<void>;

  // Ferma il canale Realtime e pulisce lo stato.
  stopSync: () => void;
}

type WalletStore = WalletState & WalletActions;

// ============================================================
// STORE ZUSTAND CON PERSISTENZA SU ASYNCSTORAGE
// ============================================================
export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      // --- Stato iniziale ---
      inventory: [],
      isBypassActive: false,
      _realtimeChannel: null,

      // --- Azioni ---

      calculateOptimalPayment: (total) => {
        return calculateOptimalPayment(get().inventory, total);
      },

      processPayment: (total) => {
        const { inventory, isBypassActive } = get();
        const result = calculateOptimalPayment(inventory, total);

        if (result.isInsufficient) {
          if (isBypassActive) {
            // Il tutor ha abilitato il bypass: lo studente dichiara
            // di avere i soldi fisicamente ma non nel wallet digitale.
            console.log(
              '[WalletStore] Bypass attivo: pagamento approvato con inventory insufficiente.',
              { total, inventory },
            );
            // Feedback aptico leggero per distinguerlo dal pagamento normale.
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            return result;
          }
          // Inventory insufficiente e bypass non attivo: nessuna modifica.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return result;
        }

        // Pagamento riuscito: rimuovi gli items usati dall'inventory.
        const newInventory = subtractItemsFromInventory(inventory, result.selectedItems);
        set({ inventory: newInventory });

        // Feedback aptico medio per confermare il pagamento.
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        return result;
      },

      processRealPayment: async (total, coveredOverride, mode = 'exact') => {
        const { inventory, isBypassActive } = get();
        const result = calculateStudentPayment(inventory, total, mode);
        const coveredAmount = coveredOverride ?? result.coveredAmount;
        const usedBypass = coveredOverride !== undefined || (result.isInsufficient && isBypassActive);

        if (result.isInsufficient && !isBypassActive) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return result;
        }

        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          throw error ?? new Error('Utente non autenticato.');
        }

        let nextInventory = inventory;
        if (!usedBypass) {
          nextInventory = subtractItemsFromInventory(inventory, result.selectedItems);
          set({ inventory: nextInventory });
          await persistWallet(data.user.id, nextInventory);
        }

        await recordPayment({
          studentId: data.user.id,
          amount: total,
          coveredAmount,
          usedBypass,
          selectedItems: result.selectedItems,
        });

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return {
          ...result,
          coveredAmount,
          isInsufficient: false,
          change: Math.max(0, Math.round((coveredAmount - total) * 100) / 100),
        };
      },

      toggleBypass: () => {
        const next = !get().isBypassActive;
        set({ isBypassActive: next });
        Haptics.selectionAsync();
      },

      setInventory: (items) => {
        set({ inventory: items });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },

      // ============================================================
      // SYNC REALTIME CON SUPABASE
      //
      // Supabase Realtime trasmette eventi postgres_changes ogni volta
      // che il tutor modifica la riga del wallet dello studente.
      // Questo permette all'app di aggiornarsi senza polling.
      // ============================================================
      syncWithSupabase: async (userId) => {
        // Ferma eventuale canale precedente prima di aprirne uno nuovo.
        get().stopSync();

        // Prima lettura: carica l'inventory attuale dal DB.
        const { data, error } = await supabase
          .from('wallets')
          .select('items')
          .eq('user_id', userId)
          .single();

        if (error) {
          console.warn('[WalletStore] Impossibile caricare wallet:', error.message);
        } else if (data) {
          const row = data as unknown as { items: MoneyItem[] };
          set({ inventory: row.items });
        }

        // Sottoscrizione Realtime: ascolta UPDATE sulla riga dell'utente.
        const channel = supabase
          .channel(`wallet:${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'wallets',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              // Il tutor ha modificato il wallet → aggiorna l'inventory locale.
              const updatedItems = (payload.new as { items: MoneyItem[] }).items;
              set({ inventory: updatedItems });
              // Feedback aptico: notifica lo studente che il wallet è cambiato.
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          )
          .subscribe();

        set({ _realtimeChannel: channel });
      },

      stopSync: () => {
        const { _realtimeChannel } = get();
        if (_realtimeChannel) {
          supabase.removeChannel(_realtimeChannel);
          set({ _realtimeChannel: null });
        }
      },
    }),
    {
      name: 'pagup-wallet',
      storage: createJSONStorage(() => AsyncStorage),
      // Non persistere il canale Realtime (non serializzabile).
      partialize: (state) => ({
        inventory: state.inventory,
        isBypassActive: state.isBypassActive,
      }),
    },
  ),
);
