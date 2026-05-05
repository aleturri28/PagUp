ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

UPDATE public.profiles
SET username = lower(split_part(coalesce(full_name, id::text), ' ', 1))
WHERE username IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_key UNIQUE (username);

CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'username', ''),
      split_part(COALESCE(NEW.email, NEW.id::text), '@', 1)
    )
  );
  RETURN NEW;
END;
$$;
