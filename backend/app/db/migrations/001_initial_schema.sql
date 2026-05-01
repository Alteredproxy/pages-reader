CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE document_source AS ENUM ('pdf', 'url');
CREATE TYPE document_status AS ENUM ('pending', 'processing', 'ready', 'error');
CREATE TYPE audio_status AS ENUM ('pending', 'generating', 'ready', 'error');

CREATE TABLE public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON public.users(email);

CREATE TABLE public.documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  source_type     document_source NOT NULL,
  source_url      TEXT,
  original_file   TEXT,
  status          document_status NOT NULL DEFAULT 'pending',
  total_chunks    INT NOT NULL DEFAULT 0,
  ready_chunks    INT NOT NULL DEFAULT 0,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_user_id    ON public.documents(user_id);
CREATE INDEX idx_documents_status     ON public.documents(status);
CREATE INDEX idx_documents_created_at ON public.documents(created_at DESC);

CREATE TABLE public.chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  sequence_order  INT NOT NULL,
  raw_text        TEXT NOT NULL,
  audio_url       TEXT,
  audio_status    audio_status NOT NULL DEFAULT 'pending',
  character_count INT NOT NULL,
  duration_ms     INT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (document_id, sequence_order)
);

CREATE INDEX idx_chunks_document_id       ON public.chunks(document_id);
CREATE INDEX idx_chunks_document_sequence ON public.chunks(document_id, sequence_order ASC);
CREATE INDEX idx_chunks_audio_status      ON public.chunks(audio_status);

CREATE TABLE public.notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id         UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  chunk_id            UUID NOT NULL REFERENCES public.chunks(id) ON DELETE CASCADE,
  content             TEXT NOT NULL,
  playback_offset_ms  INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_user_id     ON public.notes(user_id);
CREATE INDEX idx_notes_document_id ON public.notes(document_id);
CREATE INDEX idx_notes_chunk_id    ON public.notes(chunk_id);
CREATE INDEX idx_notes_created_at  ON public.notes(created_at DESC);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile" ON public.users
  FOR ALL USING (auth.uid() = id);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_documents" ON public.documents
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_chunks" ON public.chunks
  FOR ALL USING (
    document_id IN (
      SELECT id FROM public.documents WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_notes" ON public.notes
  FOR ALL USING (auth.uid() = user_id);
