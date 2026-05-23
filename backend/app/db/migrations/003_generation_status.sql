ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS generation_status TEXT NOT NULL DEFAULT 'idle';
