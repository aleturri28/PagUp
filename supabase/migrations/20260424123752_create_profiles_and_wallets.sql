-- ============================================================
-- TABELLA: profiles
-- Estende auth.users con ruolo (tutor/student) e dati anagrafici.
-- Creata automaticamente al primo login tramite trigger.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('student', 'tutor')),
  full_name   text,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- TABELLA: wallets
-- Ogni studente ha un wallet. Il campo 'items' contiene l'array
-- di MoneyItem serializzato come JSONB.
-- Struttura MoneyItem: { id, value, type: 'coin'|'bill', imageUri }
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  items      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallets_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS wallets_user_id_idx ON public.wallets(user_id);

-- ============================================================
-- RELAZIONE TUTOR-STUDENTE
-- Necessaria per le RLS policy: il tutor vede solo i propri studenti.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tutor_students (
  tutor_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tutor_id, student_id)
);

-- ============================================================
-- TRIGGER: aggiorna updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- TRIGGER: crea profilo vuoto al signup di un nuovo utente
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_students ENABLE ROW LEVEL SECURITY;

-- --- PROFILES ---

CREATE POLICY "profiles: self read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: self update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Il tutor legge i profili dei propri studenti
CREATE POLICY "profiles: tutor reads students"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tutor_students ts
      WHERE ts.tutor_id = auth.uid()
        AND ts.student_id = profiles.id
    )
  );

-- --- WALLETS ---

-- Lo studente legge solo il proprio wallet
CREATE POLICY "wallets: student self read"
  ON public.wallets FOR SELECT
  USING (auth.uid() = user_id);

-- Lo studente aggiorna il proprio wallet (pagamento: sottrae items)
CREATE POLICY "wallets: student self update"
  ON public.wallets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "wallets: student self insert"
  ON public.wallets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Il tutor legge i wallet dei propri studenti
CREATE POLICY "wallets: tutor reads student wallets"
  ON public.wallets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tutor_students ts
      WHERE ts.tutor_id = auth.uid()
        AND ts.student_id = wallets.user_id
    )
  );

-- Il tutor modifica i wallet dei propri studenti (aggiunge/rimuove soldi)
CREATE POLICY "wallets: tutor writes student wallets"
  ON public.wallets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tutor_students ts
      WHERE ts.tutor_id = auth.uid()
        AND ts.student_id = wallets.user_id
    )
  );

CREATE POLICY "wallets: tutor inserts student wallets"
  ON public.wallets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tutor_students ts
      WHERE ts.tutor_id = auth.uid()
        AND ts.student_id = wallets.user_id
    )
  );

-- --- TUTOR_STUDENTS ---

CREATE POLICY "tutor_students: tutor manages own"
  ON public.tutor_students FOR ALL
  USING (auth.uid() = tutor_id);
