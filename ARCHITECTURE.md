# ARCHITECTURE.md
# Pages — Audio-Reading & Knowledge-Capture Application
# Source of Truth for Codex (backend) and Gemini (frontend)
# Last Updated: 2026-05-01

---

## 0. PROJECT OVERVIEW

Pages converts PDFs and web articles into chunked audio with paragraph-anchored notes.

**Agents:**
| Agent | Workspace | Reads This Doc For |
|-------|-----------|-------------------|
| Codex | `/backend` only | Schema, API contracts, env vars, shared constants |
| Gemini | `/frontend` only | API contracts, TypeScript interfaces, audio player contract, mock shapes |

**Rule:** Neither agent modifies `ARCHITECTURE.md`. All deviations require a human decision logged in this file.

---

## 1. REPOSITORY STRUCTURE

```
/
├── ARCHITECTURE.md          ← this file (read-only for agents)
├── CLAUDE.md                ← Claude agent config
├── GEMINI.md                ← Gemini agent config
├── AGENTS.md                ← Codex agent config
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── constants.py     ← shared enum values (source of truth)
│   │   ├── config.py
│   │   ├── api/
│   │   │   ├── deps.py      ← get_current_user FastAPI dependency
│   │   │   ├── documents.py
│   │   │   ├── chunks.py
│   │   │   ├── notes.py
│   │   │   └── tts.py
│   │   ├── models/
│   │   │   ├── document.py
│   │   │   ├── chunk.py
│   │   │   └── note.py
│   │   ├── services/
│   │   │   ├── parser.py        # PDF (pdfplumber) + URL (trafilatura) extraction
│   │   │   ├── chunker.py       # text → paragraph chunks
│   │   │   ├── tts_service.py   # Google Cloud TTS + OpenAI fallback
│   │   │   └── storage.py       # Supabase Storage upload
│   │   └── db/
│   │       ├── supabase.py      # client init
│   │       └── migrations/      # SQL migration files
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/                 # typed API client functions
│   │   │   └── mock.ts          # mock fixtures (VITE_USE_MOCK_API=true)
│   │   ├── components/
│   │   │   ├── Player/
│   │   │   ├── DocumentList/
│   │   │   └── Notes/
│   │   ├── hooks/
│   │   │   ├── useAudioQueue.ts
│   │   │   ├── useChunks.ts
│   │   │   └── useNotes.ts
│   │   ├── types/
│   │   │   └── index.ts         # all TypeScript interfaces (source of truth)
│   │   ├── constants.ts         # mirrors backend shared constants exactly
│   │   └── App.tsx
│   ├── public/
│   ├── package.json
│   └── .env.example
```

---

## 2. DATABASE SCHEMA

**Platform:** Supabase (PostgreSQL 15)
**Auth:** Supabase Auth — `auth.users` is managed by Supabase. All app tables reference it.

### 2.1 Table: `users`

```sql
CREATE TABLE public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON public.users(email);
```

> Codex: Upsert on first authenticated API call.

---

### 2.2 Table: `documents`

```sql
CREATE TYPE document_source AS ENUM ('pdf', 'url');
CREATE TYPE document_status AS ENUM ('pending', 'processing', 'ready', 'error');

CREATE TABLE public.documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  source_type     document_source NOT NULL,
  source_url      TEXT,                          -- NULL if source_type = 'pdf'
  original_file   TEXT,                          -- Storage path, NULL if source_type = 'url'
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
```

---

### 2.3 Table: `chapters`

```sql
CREATE TABLE public.chapters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  sequence_order  INT NOT NULL,
  title           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (document_id, sequence_order)
);

CREATE INDEX idx_chapters_document_id ON public.chapters(document_id);
CREATE INDEX idx_chapters_sequence    ON public.chapters(document_id, sequence_order ASC);

ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_chapters" ON public.chapters
  FOR ALL USING (
    document_id IN (
      SELECT id FROM public.documents WHERE user_id = auth.uid()
    )
  );
```

> Codex: Insert chapters during `parse_and_chunk_document`. A document with no detectable headings gets zero chapter rows — chunks remain flat.

---

### 2.4 Table: `chunks`

```sql
CREATE TYPE audio_status AS ENUM ('pending', 'generating', 'ready', 'error');

CREATE TABLE public.chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  chapter_id      UUID REFERENCES public.chapters(id) ON DELETE SET NULL,  -- NULL if no chapters detected
  sequence_order  INT NOT NULL,
  raw_text        TEXT NOT NULL,
  audio_url       TEXT,                          -- NULL until TTS complete
  audio_status    audio_status NOT NULL DEFAULT 'pending',
  character_count INT NOT NULL,
  duration_ms     INT,                           -- populated after TTS
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (document_id, sequence_order)
);

CREATE INDEX idx_chunks_document_id       ON public.chunks(document_id);
CREATE INDEX idx_chunks_document_sequence ON public.chunks(document_id, sequence_order ASC);
CREATE INDEX idx_chunks_audio_status      ON public.chunks(audio_status);
CREATE INDEX idx_chunks_chapter_id        ON public.chunks(chapter_id);
```

---

### 2.5 Table: `notes`

```sql
CREATE TABLE public.notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id         UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  chunk_id            UUID NOT NULL REFERENCES public.chunks(id) ON DELETE CASCADE,
  content             TEXT NOT NULL,
  playback_offset_ms  INT,                       -- ms into chunk when note was created
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_user_id     ON public.notes(user_id);
CREATE INDEX idx_notes_document_id ON public.notes(document_id);
CREATE INDEX idx_notes_chunk_id    ON public.notes(chunk_id);
CREATE INDEX idx_notes_created_at  ON public.notes(created_at DESC);
```

---

### 2.6 Row Level Security (RLS)

Codex must apply all policies in migrations.

```sql
-- users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile" ON public.users
  FOR ALL USING (auth.uid() = id);

-- documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_documents" ON public.documents
  FOR ALL USING (auth.uid() = user_id);

-- chunks (scoped to document owner)
ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_chunks" ON public.chunks
  FOR ALL USING (
    document_id IN (
      SELECT id FROM public.documents WHERE user_id = auth.uid()
    )
  );

-- notes
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_notes" ON public.notes
  FOR ALL USING (auth.uid() = user_id);
```

---

## 3. SHARED CONSTANTS

**Both Codex and Gemini MUST use these exact string values. No deviation.**

### 3.1 `backend/app/constants.py` (Codex writes this first)

```python
class AudioStatus:
    PENDING    = "pending"
    GENERATING = "generating"
    READY      = "ready"
    ERROR      = "error"

class DocumentStatus:
    PENDING    = "pending"
    PROCESSING = "processing"
    READY      = "ready"
    ERROR      = "error"

class DocumentSource:
    PDF = "pdf"
    URL = "url"

MAX_CHUNK_CHARS         = 800
MIN_CHUNK_CHARS         = 50
TTS_PROVIDER            = "google_cloud"
TTS_MODEL               = "en-US-Chirp3-HD-Pulcherrima"
TTS_VOICE_DEFAULT       = "en-US-Chirp3-HD-Pulcherrima"
TTS_VOICES_AVAILABLE    = [
    "en-US-Chirp3-HD-Aoede",
    "en-US-Chirp3-HD-Charon",
    "en-US-Chirp3-HD-Kore",
    "en-US-Chirp3-HD-Pulcherrima",
    "en-US-Chirp3-HD-Zephyr",
    "en-US-Chirp3-HD-Fenrir",
    "en-US-Chirp3-HD-Leda",
    "en-US-Chirp3-HD-Puck",
]
TTS_AUDIO_FORMAT        = "wav"
TTS_CONCURRENCY_DEFAULT = 3
```

### 3.2 `frontend/src/constants.ts` (Gemini writes this first)

```typescript
export const AudioStatus = {
  PENDING:    "pending",
  GENERATING: "generating",
  READY:      "ready",
  ERROR:      "error",
} as const;
export type AudioStatusType = typeof AudioStatus[keyof typeof AudioStatus];

export const DocumentStatus = {
  PENDING:    "pending",
  PROCESSING: "processing",
  READY:      "ready",
  ERROR:      "error",
} as const;
export type DocumentStatusType = typeof DocumentStatus[keyof typeof DocumentStatus];

export const DocumentSource = {
  PDF: "pdf",
  URL: "url",
} as const;
export type DocumentSourceType = typeof DocumentSource[keyof typeof DocumentSource];

export const MAX_CHUNK_CHARS    = 800;
export const API_BASE_URL       = import.meta.env.VITE_API_BASE_URL as string;
export const POLLING_INTERVAL   = Number(import.meta.env.VITE_POLLING_INTERVAL_MS ?? 3000);
```

---

## 4. API CONTRACT

### 4.1 Global Conventions

| Property | Value |
|----------|-------|
| Base URL | `${VITE_API_BASE_URL}/api/v1` |
| Auth Header | `Authorization: Bearer <supabase_jwt>` |
| Content-Type (JSON) | `application/json` |
| Content-Type (upload) | `multipart/form-data` |
| Success envelope | `{ "data": <payload>, "meta": <meta \| null> }` |
| Error envelope | `{ "error": { "code": string, "message": string, "details": any \| null } }` |
| Timestamps | ISO 8601 UTC — `"2026-04-27T10:00:00Z"` |
| UUIDs | RFC 4122 v4 lowercase string |

All endpoints require `Authorization` header.

---

### 4.2 `POST /api/v1/documents`

Ingest a PDF or URL. Triggers parsing + chunking in background. Returns immediately.

**Request — PDF:**
```
Content-Type: multipart/form-data
file  : File    (required, .pdf, max 20MB)
title : string  (optional, defaults to filename)
```

**Request — URL:**
```json
{ "url": "string", "title": "string (optional)" }
```

**Response 201:**
```json
{
  "data": {
    "id":           "uuid",
    "user_id":      "uuid",
    "title":        "string",
    "source_type":  "pdf | url",
    "source_url":   "string | null",
    "status":       "processing",
    "total_chunks": 0,
    "ready_chunks": 0,
    "created_at":   "ISO8601"
  },
  "meta": null
}
```

**Errors:**
| Code | HTTP | Condition |
|------|------|-----------|
| `INVALID_INPUT` | 400 | Missing required field |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Non-PDF file |
| `PAYLOAD_TOO_LARGE` | 413 | File > 20MB |
| `PARSE_FAILED` | 422 | Text extraction failed |

---

### 4.3 `GET /api/v1/documents`

**Query params:** `status` (optional), `limit` (default 20, max 100), `offset` (default 0)

**Response 200:**
```json
{
  "data": [
    {
      "id":           "uuid",
      "title":        "string",
      "source_type":  "pdf | url",
      "source_url":   "string | null",
      "status":       "pending | processing | ready | error",
      "total_chunks": 42,
      "ready_chunks": 12,
      "created_at":   "ISO8601",
      "updated_at":   "ISO8601"
    }
  ],
  "meta": { "total": 100, "limit": 20, "offset": 0 }
}
```

---

### 4.4 `GET /api/v1/documents/{doc_id}`

**Response 200:**
```json
{
  "data": {
    "id":            "uuid",
    "user_id":       "uuid",
    "title":         "string",
    "source_type":   "pdf | url",
    "source_url":    "string | null",
    "original_file": "string | null",
    "status":        "pending | processing | ready | error",
    "total_chunks":  42,
    "ready_chunks":  42,
    "error_message": "string | null",
    "created_at":    "ISO8601",
    "updated_at":    "ISO8601"
  },
  "meta": null
}
```

**Errors:** `NOT_FOUND` 404

---

### 4.5 `GET /api/v1/documents/{doc_id}/chapters`

Returns all chapters for a document, ordered by `sequence_order ASC`. Empty array if no chapters detected.

**Response 200:**
```json
{
  "data": [
    {
      "id":             "uuid",
      "document_id":    "uuid",
      "sequence_order": 0,
      "title":          "string",
      "created_at":     "ISO8601"
    }
  ],
  "meta": { "total": 5 }
}
```

**Errors:** `NOT_FOUND` 404

---

### 4.6 `GET /api/v1/documents/{doc_id}/chunks`

Primary payload consumed by the audio player. Always ordered by `sequence_order ASC`.

**Query params:** `status` (optional, filter by `audio_status`)

**Response 200:**
```json
{
  "data": [
    {
      "id":              "uuid",
      "document_id":     "uuid",
      "chapter_id":      "uuid | null",
      "sequence_order":  0,
      "raw_text":        "string",
      "audio_url":       "string | null",
      "audio_status":    "pending | generating | ready | error",
      "character_count": 342,
      "duration_ms":     "int | null",
      "created_at":      "ISO8601"
    }
  ],
  "meta": { "total": 42 }
}
```

---

### 4.7 `POST /api/v1/documents/{doc_id}/process-tts`

Triggers async TTS for all chunks where `audio_status` is `pending` or `error`.

**Request body:**
```json
{ "voice_id": "string (optional, uses default if omitted)" }
```

**Response 202:**
```json
{
  "data": {
    "document_id":   "uuid",
    "queued_chunks": 42,
    "message":       "TTS generation started"
  },
  "meta": null
}
```

**Errors:** `ALREADY_PROCESSING` 409 (if generating_count > 0)

---

### 4.8 `POST /api/v1/notes`

**Request body:**
```json
{
  "document_id":        "uuid",
  "chunk_id":           "uuid",
  "content":            "string (1–10000 chars)",
  "playback_offset_ms": 3200
}
```

**Response 201:**
```json
{
  "data": {
    "id":                "uuid",
    "user_id":           "uuid",
    "document_id":       "uuid",
    "chunk_id":          "uuid",
    "content":           "string",
    "playback_offset_ms": 3200,
    "created_at":        "ISO8601",
    "chunk_context": {
      "sequence_order": 5,
      "raw_text":       "string (first 200 chars)"
    }
  },
  "meta": null
}
```

**Errors:** `INVALID_INPUT` 400, `NOT_FOUND` 404

---

### 4.9 `GET /api/v1/documents/{doc_id}/notes`

**Query params:** `chunk_id` (optional), `limit` (default 50, max 200), `offset` (default 0)

**Response 200:**
```json
{
  "data": [
    {
      "id":                "uuid",
      "document_id":       "uuid",
      "chunk_id":          "uuid",
      "content":           "string",
      "playback_offset_ms": 3200,
      "created_at":        "ISO8601",
      "updated_at":        "ISO8601",
      "chunk_context": {
        "sequence_order": 5,
        "raw_text":       "string (first 200 chars)"
      }
    }
  ],
  "meta": { "total": 15, "limit": 50, "offset": 0 }
}
```

---

### 4.10 `DELETE /api/v1/documents/{doc_id}`

**Response 204:** Empty body.
**Errors:** `NOT_FOUND` 404

Cascades: deletes all chunks, chapters, notes, and Supabase Storage audio files for this document.

---

### 4.11 `DELETE /api/v1/notes/{note_id}`

**Response 204:** Empty body.
**Errors:** `NOT_FOUND` 404

---

### 4.12 `GET /api/v1/health`

No auth required.

**Response 200:**
```json
{ "status": "ok", "timestamp": "ISO8601" }
```

---

### 4.11 HTTP Error Code Reference

| HTTP | `error.code` | Meaning |
|------|-------------|---------|
| 400 | `INVALID_INPUT` | Malformed body or params |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Resource belongs to another user |
| 404 | `NOT_FOUND` | Resource not found or RLS hides it |
| 409 | `CONFLICT` | State conflict (e.g., already processing) |
| 413 | `PAYLOAD_TOO_LARGE` | File exceeds 20MB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Non-PDF file |
| 422 | `PARSE_FAILED` | Extraction failed |
| 429 | `RATE_LIMITED` | TTS provider rate limit |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 503 | `SERVICE_UNAVAILABLE` | TTS provider unreachable |

---

## 5. DATA FLOW DIAGRAM

```
┌─────────────┐
│    USER     │
└──────┬──────┘
       │ Upload PDF or paste URL
       ▼
┌────────────────────────────────────────────────────────┐
│  POST /api/v1/documents                                │
│                                                        │
│  1. Validate input                                     │
│  2. Insert document record (status: processing)        │
│  3. Return 201 immediately                             │
│                                                        │
│  [BackgroundTask]                                      │
│  4a. PDF  → pdfplumber  → raw text                     │
│   OR                                                   │
│  4b. URL  → trafilatura → clean article text           │
│                                                        │
│  5. chunker.py: split → paragraph chunks               │
│     • target ≤ 800 chars per chunk                     │
│     • assign sequence_order (0-indexed)                │
│     • bulk INSERT → chunks table                       │
│                                                        │
│  6. UPDATE documents SET total_chunks=N, status='ready'│
└────────────────────────────────────────────────────────┘
       │
       │ Gemini polls GET /documents/{id}/chunks
       │ Renders text immediately (audio_status: pending)
       │
       ▼
┌────────────────────────────────────────────────────────┐
│  POST /api/v1/documents/{doc_id}/process-tts           │
│                                                        │
│  For each chunk (audio_status = pending):              │
│  1. SET audio_status = 'generating'                    │
│  2. Call Gemini TTS (Google AI Studio):                │
│     POST generativelanguage.googleapis.com/v1beta/     │
│       models/gemini-3.1-flash-tts-preview:             │
│       generateContent                                  │
│     Header: x-goog-api-key: GEMINI_API_KEY             │
│     { contents:[{parts:[{text: chunk.raw_text}]}],     │
│       generationConfig:{                               │
│         responseModalities:["AUDIO"],                  │
│         speechConfig:{voiceConfig:{                    │
│           prebuiltVoiceConfig:{voiceName: voice_id}}}}} │
│     voice_id defaults to GEMINI_TTS_VOICE env var       │
│     client may pass voice_id in POST /process-tts body  │
│     Response: base64 raw PCM (24kHz, 16-bit, mono)     │
│                                                        │
│  3. Decode base64 → raw PCM bytes (store as .wav)      │
│  4. Upload to Supabase Storage:                        │
│     bucket: "audio" (public)                           │
│     path:   {user_id}/{doc_id}/{chunk_id}.wav          │
│  5. duration_ms = len(bytes)/2/24000*1000              │
│  6. UPDATE chunk SET audio_url=<url>,                  │
│                      audio_status='ready',              │
│                      duration_ms=<ms>                  │
│  7. INCREMENT documents.ready_chunks                   │
│                                                        │
│  On unrecoverable error:                               │
│     SET audio_status='error', error_message=<str>      │
└────────────────────────────────────────────────────────┘
       │
       │ Gemini polls GET /documents/{id}/chunks
       │ As chunks become 'ready', player queue grows
       │
       ▼
┌────────────────────────────────────────────────────────┐
│  FRONTEND: AUDIO PLAYBACK ENGINE                       │
│                                                        │
│  1. useChunks: fetch ChunkPlaylist, poll until all ready│
│  2. useAudioQueue: filter chunks where status='ready'  │
│  3. AudioContext + AudioBufferSourceNode:              │
│     • fetch audio_url → ArrayBuffer → AudioBuffer     │
│     • source.start(nextStartTime)                      │
│     • nextStartTime += buffer.duration                 │
│  4. activeChunkId updates as each chunk begins         │
│  5. TranscriptPane highlights active chunk's raw_text  │
│  6. NoteEditor receives activeChunkId + offsetMs       │
└────────────────────────────────────────────────────────┘
       │
       │ User clicks "Add Note"
       ▼
┌────────────────────────────────────────────────────────┐
│  POST /api/v1/notes                                    │
│  { document_id, chunk_id: activeChunkId,               │
│    content, playback_offset_ms: offsetMs }             │
│                                                        │
│  Backend validates chunk belongs to document           │
│  Inserts → notes table                                 │
│  Returns note + chunk_context                          │
└────────────────────────────────────────────────────────┘
```

---

## 6. FRONTEND TYPESCRIPT INTERFACES

File: `frontend/src/types/index.ts` — Gemini MUST use these exact types.

### 6.1 Domain Types

```typescript
// ── Documents ────────────────────────────────────────────
export interface Document {
  id:            string;
  user_id:       string;
  title:         string;
  source_type:   "pdf" | "url";
  source_url:    string | null;
  status:        "pending" | "processing" | "ready" | "error";
  total_chunks:  number;
  ready_chunks:  number;
  error_message: string | null;
  created_at:    string;
  updated_at:    string;
}

// ── Chapters ─────────────────────────────────────────────
export interface Chapter {
  id:             string;
  document_id:    string;
  sequence_order: number;
  title:          string;
  created_at:     string;
}

// ── Chunks ───────────────────────────────────────────────
export interface Chunk {
  id:              string;
  document_id:     string;
  chapter_id:      string | null;
  sequence_order:  number;
  raw_text:        string;
  audio_url:       string | null;
  audio_status:    "pending" | "generating" | "ready" | "error";
  character_count: number;
  duration_ms:     number | null;
  created_at:      string;
}

// ── Notes ────────────────────────────────────────────────
export interface ChunkContext {
  sequence_order: number;
  raw_text:       string;  // first 200 chars
}

export interface Note {
  id:                 string;
  document_id:        string;
  chunk_id:           string;
  content:            string;
  playback_offset_ms: number | null;
  created_at:         string;
  updated_at:         string;
  chunk_context:      ChunkContext;
}

// ── API Envelopes ─────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  meta: PaginationMeta | null;
}

export interface PaginationMeta {
  total:  number;
  limit:  number;
  offset: number;
}

export interface ApiError {
  error: {
    code:    string;
    message: string;
    details: Record<string, unknown> | null;
  };
}
```

---

### 6.2 Audio Player Types

```typescript
// ── Playlist ──────────────────────────────────────────────
// Only chunks with audio_status === 'ready' enter the queue.
export interface PlayableChunk extends Chunk {
  audio_url:   string;   // narrowed: guaranteed non-null
  duration_ms: number;   // narrowed: guaranteed non-null
}

export interface ChunkPlaylist {
  document_id:  string;
  chunks:       PlayableChunk[];   // ordered by sequence_order ASC
  total_chunks: number;            // includes non-ready (for progress display)
  ready_count:  number;
}

// ── Player State ──────────────────────────────────────────
export interface PlayerState {
  status:            "idle" | "loading" | "playing" | "paused" | "ended" | "error";
  activeChunkId:     string | null;
  activeChunkIndex:  number;
  offsetMs:          number;   // ms elapsed in current chunk
  error:             string | null;
}

// ── Controls ─────────────────────────────────────────────
export interface PlayerControls {
  play:        () => void;
  pause:       () => void;
  seekToChunk: (chunkId: string) => void;
  skipForward: () => void;
  skipBack:    () => void;
}

export interface UseAudioQueueReturn {
  state:    PlayerState;
  controls: PlayerControls;
  playlist: ChunkPlaylist | null;
}

// ── Note creation ─────────────────────────────────────────
export interface CreateNotePayload {
  document_id:        string;
  chunk_id:           string;
  content:            string;
  playback_offset_ms: number | null;
}
```

---

### 6.3 Audio Queue Behavioral Contract

| Rule | Requirement |
|------|-------------|
| **Gapless playback** | Each chunk's `AudioBufferSourceNode` scheduled with `source.start(nextStartTime)`; `nextStartTime += buffer.duration` |
| **Prefetch window** | Always decode + schedule the next 2 chunks ahead of currently playing |
| **`activeChunkId` update** | Must update at exact moment chunk begins (use scheduled `setTimeout` based on `nextStartTime - audioContext.currentTime`) |
| **`offsetMs` tracking** | Updated every 250ms while playing: `(audioContext.currentTime - chunkStartTime) * 1000` |
| **New ready chunks** | Appended to schedule without interrupting playback (poll-driven) |
| **`seekToChunk`** | Stop current source, clear schedule, recompute from target chunk, restart |
| **Single AudioContext** | One per session; use `suspend()` / `resume()` for pause/play |
| **Chunk fetch error** | Skip chunk, `console.warn(chunk.id)`, continue — never stop playback |

---

### 6.4 Note Creation Flow

```typescript
// When user submits a note:
// 1. Read playerState.activeChunkId
// 2. Read playerState.offsetMs
// 3. POST /api/v1/notes:
//    { document_id, chunk_id: activeChunkId, content, playback_offset_ms: offsetMs }
// 4. Optimistic append to local notes list; replace with server response on success
```

---

## 7. PARALLEL EXECUTION CONSTRAINTS

### 7.1 Mock API (Gemini)

Gemini implements `frontend/src/api/mock.ts`. Activated via `VITE_USE_MOCK_API=true`.

**Mock shapes must match the exact API response structure above.** Suggested fixtures:

```typescript
// 5 chunks, all audio_status: "ready"
// Use a real short public MP3 URL for audio_url (e.g. any publicly hosted .mp3)
// duration_ms: 3000 for each
// 2 notes anchored to chunks at sequence_order 1 and 3
```

### 7.2 Integration Handoff Sequence

Gemini switches from mock → real by updating `VITE_USE_MOCK_API=false` per endpoint:

| Step | Codex delivers | Gemini integrates |
|------|---------------|-------------------|
| 1 | `GET /documents` | Document list screen |
| 2 | `POST /documents` (URL) | URL ingest form |
| 3 | `GET /documents/{id}/chunks` | Player playlist load |
| 4 | `POST /documents/{id}/process-tts` | TTS trigger button |
| 5 | `POST /notes` | Note editor submit |
| 6 | `GET /documents/{id}/notes` | Notes sidebar |
| 7 | `POST /documents` (PDF) | PDF upload form |

### 7.3 CORS (Codex must apply)

```python
# backend/app/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",       # Vite dev
        os.environ["FRONTEND_URL"],    # production
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
```

### 7.4 Auth Dependency (Codex implements exactly)

```python
# backend/app/api/deps.py
from fastapi import Header, HTTPException, Depends
from app.db.supabase import get_supabase

async def get_current_user(
    authorization: str = Header(...),
    supabase = Depends(get_supabase)
) -> dict:
    token = authorization.removeprefix("Bearer ").strip()
    response = supabase.auth.get_user(token)
    if not response.user:
        raise HTTPException(status_code=401, detail={
            "error": {
                "code": "UNAUTHORIZED",
                "message": "Invalid or expired token",
                "details": None
            }
        })
    return response.user
```

---

## 8. PROCESSING PIPELINE DETAIL

### 8.1 Chunking Algorithm

```
Input:  raw text string
Output: list of { raw_text, sequence_order, character_count }

1. Split on \n\n → paragraph candidates
2. If paragraph > 800 chars:
   a. Split on \n within paragraph
   b. If still > 800: split on sentence boundary (". " | "! " | "? ")
   c. If still > 800: hard split at 800 (avoid mid-word)
3. If paragraph < 50 chars: merge with next candidate
4. Normalize: strip leading/trailing whitespace, collapse >2 consecutive newlines
5. sequence_order: 0-indexed, no gaps
6. character_count: len(raw_text) after normalization
```

### 8.2 TTS Processing (Google Cloud Text-to-Speech)

```
For each chunk (audio_status = 'pending'):

1. SET audio_status = 'generating'

2. Call Google Cloud Text-to-Speech API:
   SDK: google-cloud-texttospeech (gRPC)
   Auth: GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON key file)
   Client: texttospeech.TextToSpeechClient()

   Request:
     SynthesisInput(text="<chunk.raw_text>")
     VoiceSelectionParams(language_code="en-US", name=voice_id)
     AudioConfig(audio_encoding=LINEAR16, sample_rate_hertz=24000)

   Response: response.audio_content = raw 24kHz, 16-bit, mono PCM
   (SDK may include RIFF/WAV header depending on version — stripped before re-wrapping
    via _strip_wav_header() to guarantee a consistent, controlled WAV structure)

   voice_id defaults to GOOGLE_TTS_VOICE env var (default: en-US-Neural2-J)
   Client may pass voice_id in POST /process-tts body (Neural2 format e.g. "en-US-Neural2-J")

   On failure: raise exception → audio_status = 'error'
   Retry logic: up to 3 attempts with 2s backoff before marking error.

3. Upload to Supabase Storage:
   bucket: "audio" (public read)
   path:   "{user_id}/{doc_id}/{chunk_id}.wav"
   content-type: "audio/wav"
   → returns public URL

4. Parse duration_ms:
   duration_ms = (len(audio_bytes) / 2 / 24000) * 1000
   (bytes ÷ 2 bytes-per-sample ÷ 24000 samples/sec × 1000 ms/sec)

5. UPDATE chunks SET
     audio_url     = <public_url>,
     audio_status  = 'ready',
     duration_ms   = <calculated_ms>,
     updated_at    = NOW()

6. UPDATE documents SET ready_chunks = ready_chunks + 1

On unrecoverable error:
   UPDATE chunks SET
     audio_status  = 'error',
     error_message = <error_string>,
     updated_at    = NOW()
```

### 8.3 Supabase Storage Buckets

| Bucket | Access | Path pattern | Notes |
|--------|--------|-------------|-------|
| `audio` | Public (no auth on GET) | `{user_id}/{doc_id}/{chunk_id}.mp3` | Max 10MB per file |
| `documents` | Private | `{user_id}/{doc_id}/original.pdf` | Original PDF; served via signed URL only |

### 8.4 Background Task Strategy

```python
# FastAPI BackgroundTasks for document parsing (fire-and-return 201)
@router.post("/documents", status_code=201)
async def create_document(background_tasks: BackgroundTasks, ...):
    doc = await db_create_document(...)
    background_tasks.add_task(parse_and_chunk_document, doc.id)
    return {"data": doc.model_dump(), "meta": None}

# TTS uses asyncio.Semaphore for concurrency control
# Semaphore limit = TTS_CONCURRENCY env var (default 3)
# process-tts endpoint is 202 Accepted; runs chunks sequentially under semaphore
```

---

## 9. FRONTEND COMPONENT STRUCTURE

```
App.tsx
├── AuthGuard                  — redirects unauthenticated users
├── DocumentListPage
│   ├── DocumentCard           — title, status badge, ready_chunks/total_chunks progress
│   └── IngestForm             — URL text input + PDF file upload → POST /documents
└── ReaderPage  (?docId=...)
    ├── PlayerBar
    │   ├── PlayPauseButton
    │   ├── SkipControls       — previous/next chunk
    │   └── ProgressIndicator  — "Chunk 5 of 42 · 42 ready"
    ├── TranscriptPane
    │   └── ChunkRow[]         — raw_text; highlights activeChunkId
    └── NotesPanel
        ├── NoteEditor         — props: activeChunkId, offsetMs
        └── NoteList           — GET /documents/{id}/notes
```

**State ownership:**

| State | Hook / Location | Notes |
|-------|----------------|-------|
| Auth | `AuthContext` | Supabase session |
| Document list | `useDocuments` | Not cached globally |
| Chunks | `useChunks` | Polls while any chunk not ready |
| Player | `useAudioQueue` | Local to ReaderPage |
| Notes | `useNotes` | Refetches after POST |
| `activeChunkId` | Lifted to ReaderPage | Prop-drilled to NoteEditor + TranscriptPane |

**Polling:**
```typescript
// Stop polling when all chunks are ready or error (not pending/generating)
const hasPending = chunks.some(c =>
  c.audio_status === "pending" || c.audio_status === "generating"
);
```

---

## 10. ENVIRONMENT VARIABLES

### Backend `/backend/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (bypasses RLS for server ops) |
| `SUPABASE_ANON_KEY` | Yes | Anon key (for auth verification) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | Path to GCP service account JSON key file |
| `GOOGLE_TTS_VOICE` | No | Default Neural2 voice name. Default: `en-US-Neural2-J` |
| `FRONTEND_URL` | Yes | Production frontend URL for CORS |
| `MAX_FILE_SIZE_MB` | No | PDF upload limit. Default: `20` |
| `TTS_CONCURRENCY` | No | Max parallel TTS calls. Default: `3` |
| `LOG_LEVEL` | No | Default: `INFO` |
| `ENV` | No | `development` or `production` |

### Frontend `/frontend/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key (safe for browser) |
| `VITE_API_BASE_URL` | Yes | Backend URL (e.g. `http://localhost:8000`) |
| `VITE_USE_MOCK_API` | No | `true` to use mock fixtures. Default: `false` |
| `VITE_POLLING_INTERVAL_MS` | No | Chunk status poll interval. Default: `3000` |

---

## 11. SECURITY

| Constraint | Enforced By | Detail |
|-----------|------------|--------|
| Data scoped to user | RLS | Cannot read/write other users' data even with valid JWT |
| Service role key server-only | Backend | Never exposed to frontend |
| Audio files publicly readable | Storage bucket | Only URL needed to stream; no auth on GET |
| JWT refresh | Supabase client | `supabase.auth.onAuthStateChange` handles expiry |
| PDF size limit | FastAPI + check | Reject > MAX_FILE_SIZE_MB before processing |
| Note content length | Server + client | 1–10000 chars, enforced server-side |
| Chunk ownership | Backend | Validates chunk belongs to doc_id before note insert |

---

## 12. DECISION LOG

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-27 | TTS triggered explicitly, not auto after parse | User previews text before incurring TTS cost |
| 2026-04-27 | Audio stored in Supabase Storage (public bucket) | Browser fetches directly; no backend streaming proxy needed |
| 2026-05-01 | ~~Gemini TTS via Google AI Studio~~ (superseded 2026-05-09) | Original: free tier, no billing needed. Replaced due to rate limit exhaustion. |
| 2026-05-09 | Migrated TTS to Google Cloud Text-to-Speech (Neural2) | Gemini AI Studio free tier rate limits exhausted; GCP $300 credits available; WAV/LINEAR16 format kept to avoid storage.py changes and mutagen dependency |
| 2026-05-09 | Upgraded TTS voice to Chirp 3 HD (Pulcherrima) | Neural2 voice sounded robotic on long chunks; Chirp 3 HD is significantly more natural; same voice name as prior Gemini voice |
| 2026-05-09 | Added chapters table; chapter_id FK on chunks (nullable) | Enables collapsible chapter sidebar in reader; nullable so docs without headings remain fully functional |
| 2026-05-09 | Chapter detection via heuristic heading parser | Detects "Chapter N", "PART N", short title-cased/all-caps lines; works for books and articles with section headings |
| 2026-04-27 | Chunk size ceiling 800 chars | Balance between TTS latency per chunk and semantic coherence |
| 2026-04-27 | Polling for chunk status (not WebSockets) | Lower complexity; 3s interval is acceptable UX |
| 2026-04-27 | `playback_offset_ms` on notes | Enables future "jump to moment" feature |
| 2026-04-27 | `chunk_context` inline in notes response | Avoids N+1 queries; 200-char preview sufficient for display |
| 2026-04-27 | `UNIQUE(document_id, sequence_order)` on chunks | Prevents duplicate ordering on concurrent background inserts |
| 2026-04-27 | `document_id` FK on notes (redundant with chunk FK) | Enables `GET /documents/{id}/notes` without join through chunks |

---

## 13. OPEN QUESTIONS

| # | Question | Default if unresolved |
|---|----------|----------------------|
| 1 | ~~Google Cloud TTS voice~~ RESOLVED 2026-05-09: `en-US-Neural2-J` (Neural2 family). Chirp 3 HD deferred to v2. | — |
| 2 | TTS concurrency: process chunks in strict sequence or parallel under semaphore? | Semaphore, limit=3 |
| 3 | Should notes support editing (PATCH /notes/{id})? | Not in v1 |
| 4 | Mobile browser support for Web Audio API? | Desktop-only for v1 |
| 5 | Full-text search on chunk raw_text? | Not in v1 |
| 6 | Should original PDF be stored in Supabase Storage? | Yes, bucket: `documents`, private |
