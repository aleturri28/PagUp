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
