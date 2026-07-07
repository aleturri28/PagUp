import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { RealtimeChannel } from '@supabase/supabase-js';
import { MoneyItem } from '../api/database.types';
import { supabase } from '../api/supabase';
import {
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

  // Canale Realtime Supabase attivo (non persistito).
  _realtimeChannel: RealtimeChannel | null;
}

// ============================================================
// AZIONI DELLO STORE
// ============================================================
interface WalletActions {
  // Esegue il pagamento reale: sottrae gli items usati dall'inventory,
  // aggiorna il wallet su Supabase, registra il log e notifica il tutor.
  processRealPayment: (total: number, mode?: PaymentMode) => Promise<PaymentResult>;

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
      _realtimeChannel: null,

      // --- Azioni ---

      processRealPayment: async (total, mode = 'exact') => {
        const { inventory } = get();
        const result = calculateStudentPayment(inventory, total, mode);

        if (result.isInsufficient) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return result;
        }

        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          throw error ?? new Error('Utente non autenticato.');
        }

        const nextInventory = subtractItemsFromInventory(inventory, result.selectedItems);
        set({ inventory: nextInventory });
        await persistWallet(data.user.id, nextInventory);

        await recordPayment({
          studentId: data.user.id,
          amount: total,
          coveredAmount: result.coveredAmount,
          usedFastMode: mode === 'fast',
          selectedItems: result.selectedItems,
        });

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return result;
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
      }),
    },
  ),
);
