DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles: student reads associated tutors'
  ) THEN
    CREATE POLICY "profiles: student reads associated tutors"
      ON public.profiles FOR SELECT
      USING (
        role = 'tutor'
        AND EXISTS (
          SELECT 1
          FROM public.tutor_students ts
          WHERE ts.student_id = auth.uid()
            AND ts.tutor_id = profiles.id
        )
      );
  END IF;
END
$$;
