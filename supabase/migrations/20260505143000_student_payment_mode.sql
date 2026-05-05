ALTER TABLE public.tutor_students
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'exact'
  CHECK (payment_mode IN ('exact', 'fast'));

CREATE POLICY "tutor_students: student reads own tutor mode"
  ON public.tutor_students FOR SELECT
  USING (auth.uid() = student_id);
