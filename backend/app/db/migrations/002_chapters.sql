CREATE TABLE IF NOT EXISTS public.chapters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  sequence_order  INT NOT NULL,
  title           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, sequence_order)
);

ALTER TABLE public.chunks ADD COLUMN IF NOT EXISTS chapter_id UUID
  REFERENCES public.chapters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chapters_document_id ON public.chapters(document_id);
CREATE INDEX IF NOT EXISTS idx_chapters_sequence    ON public.chapters(document_id, sequence_order ASC);
CREATE INDEX IF NOT EXISTS idx_chunks_chapter_id    ON public.chunks(chapter_id);

ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_chapters" ON public.chapters
  FOR ALL USING (
    document_id IN (
      SELECT id FROM public.documents WHERE user_id = auth.uid()
    )
  );
