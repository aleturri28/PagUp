// Tipi generati dalla struttura del database Supabase.
// Aggiornare con: supabase gen types typescript --linked > src/api/database.types.ts
// (richiede: supabase link --project-ref <ref>)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: 'student' | 'tutor';
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: 'student' | 'tutor';
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: 'student' | 'tutor';
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      wallets: {
        Row: {
          id: string;
          user_id: string;
          items: MoneyItem[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          items?: MoneyItem[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          items?: MoneyItem[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tutor_students: {
        Row: {
          tutor_id: string;
          student_id: string;
          created_at: string;
        };
        Insert: {
          tutor_id: string;
          student_id: string;
          created_at?: string;
        };
        Update: {
          tutor_id?: string;
          student_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      activity_logs: {
        Row: {
          id: string;
          student_id: string;
          tutor_id: string | null;
          kind: 'payment' | 'sos' | 'wallet_adjustment';
          amount: number | null;
          covered_amount: number | null;
          used_bypass: boolean;
          message: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          tutor_id?: string | null;
          kind: 'payment' | 'sos' | 'wallet_adjustment';
          amount?: number | null;
          covered_amount?: number | null;
          used_bypass?: boolean;
          message: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          tutor_id?: string | null;
          kind?: 'payment' | 'sos' | 'wallet_adjustment';
          amount?: number | null;
          covered_amount?: number | null;
          used_bypass?: boolean;
          message?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          platform?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          token?: string;
          platform?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: 'student' | 'tutor';
    };
  };
}

// Tipo core del dominio: rappresenta un singolo pezzo di denaro nel wallet.
export interface MoneyItem {
  id: string;
  value: number;      // in euro (es. 0.01, 0.50, 1.00, 2.00, 5.00...)
  type: 'coin' | 'bill';
  imageUri: string;
}
