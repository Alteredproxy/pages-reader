ALTER TABLE public.chunks
  ADD COLUMN IF NOT EXISTS last_error TEXT;
