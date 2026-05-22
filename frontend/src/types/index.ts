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

// ── Chapters ────────────────────────────────────────────
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
  speed:             number;
}

// ── Controls ─────────────────────────────────────────────
export interface PlayerControls {
  play:        () => void;
  pause:       () => void;
  seekToChunk: (chunkId: string) => void;
  skipForward: () => void;
  skipBack:    () => void;
  setSpeed:    (rate: number) => void;
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
