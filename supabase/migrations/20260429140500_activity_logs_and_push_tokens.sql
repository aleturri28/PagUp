-- ============================================================
-- FASE 4: activity log tutor + push notification tokens
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tutor_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind           text NOT NULL CHECK (kind IN ('payment', 'sos', 'wallet_adjustment')),
  amount         numeric(10, 2),
  covered_amount numeric(10, 2),
  used_bypass    boolean NOT NULL DEFAULT false,
  message        text NOT NULL,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_student_created_idx
  ON public.activity_logs(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_tutor_created_idx
  ON public.activity_logs(tutor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL,
  platform   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_user_token_key UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON public.push_tokens(user_id);

CREATE TRIGGER push_tokens_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Lo studente registra e legge i propri eventi.
CREATE POLICY "activity_logs: student reads own"
  ON public.activity_logs FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "activity_logs: student inserts own"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- Il tutor legge gli eventi dei propri studenti.
CREATE POLICY "activity_logs: tutor reads students"
  ON public.activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tutor_students ts
      WHERE ts.tutor_id = auth.uid()
        AND ts.student_id = activity_logs.student_id
    )
  );

-- Il tutor puo' registrare modifiche wallet per i propri studenti.
CREATE POLICY "activity_logs: tutor inserts student adjustments"
  ON public.activity_logs FOR INSERT
  WITH CHECK (
    tutor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tutor_students ts
      WHERE ts.tutor_id = auth.uid()
        AND ts.student_id = activity_logs.student_id
    )
  );

-- Ogni utente mantiene i propri token push.
CREATE POLICY "push_tokens: self read"
  ON public.push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "push_tokens: self insert"
  ON public.push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_tokens: self update"
  ON public.push_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Gli studenti possono leggere solo i token dei tutor associati per inviare alert.
CREATE POLICY "push_tokens: students read tutors"
  ON public.push_tokens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tutor_students ts
      WHERE ts.student_id = auth.uid()
        AND ts.tutor_id = push_tokens.user_id
    )
  );
