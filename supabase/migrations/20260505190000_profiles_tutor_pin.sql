ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tutor_pin text;

UPDATE public.profiles
SET tutor_pin = NULL
WHERE role <> 'tutor';
