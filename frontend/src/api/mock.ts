import type { Chunk, Note, ApiResponse, PlayableChunk, Document, Chapter } from '../types';

export const mockDocId = "d0000000-0000-0000-0000-000000000000";

// Note: I will use some sample mp3 audio for the audio_url
export const mockChunks: PlayableChunk[] = [
  {
    id: "c0000000-0000-0000-0000-000000000000",
    document_id: mockDocId,
    chapter_id: null,
    sequence_order: 0,
    raw_text: "Welcome to Pages. This is the first paragraph chunk of your document. It will play first.",
    audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    audio_status: "ready",
    character_count: 89,
    duration_ms: 368000,
    created_at: new Date().toISOString()
  },
  {
    id: "c0000000-0000-0000-0000-000000000001",
    document_id: mockDocId,
    chapter_id: null,
    sequence_order: 1,
    raw_text: "Here is the second chunk. Notice how playback transitions seamlessly from one chunk to the next without interruption.",
    audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    audio_status: "ready",
    character_count: 115,
    duration_ms: 425000,
    created_at: new Date().toISOString()
  },
  {
    id: "c0000000-0000-0000-0000-000000000002",
    document_id: mockDocId,
    chapter_id: null,
    sequence_order: 2,
    raw_text: "This is the third chunk, and it has some notes attached to it.",
    audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    audio_status: "ready",
    character_count: 62,
    duration_ms: 344000,
    created_at: new Date().toISOString()
  }
];

export const mockNotes: Note[] = [
  {
    id: "n0000000-0000-0000-0000-000000000000",
    document_id: mockDocId,
    chunk_id: mockChunks[1].id,
    content: "Interesting point about seamless playback.",
    playback_offset_ms: 2500,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    chunk_context: {
      sequence_order: 1,
      raw_text: mockChunks[1].raw_text.substring(0, 200)
    }
  }
];

export const mockDocuments: Document[] = [
  {
    id: mockDocId,
    user_id: "u0000000-0000-0000-0000-000000000000",
    title: "Demo Document",
    source_type: "pdf",
    source_url: null,
    status: "ready",
    total_chunks: 3,
    ready_chunks: 3,
    generation_status: "idle",
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "d0000000-0000-0000-0000-000000000001",
    user_id: "u0000000-0000-0000-0000-000000000000",
    title: "Paul Graham Essay - How to Start a Startup",
    source_type: "url",
    source_url: "http://paulgraham.com/startup.html",
    status: "processing",
    total_chunks: 10,
    ready_chunks: 5,
    generation_status: "idle",
    error_message: null,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date().toISOString()
  }
];

export const fetchDocuments = async (): Promise<ApiResponse<Document[]>> => {
  return new Promise((resolve) => setTimeout(() => {
    resolve({
      data: mockDocuments,
      meta: { total: mockDocuments.length, limit: 100, offset: 0 }
    });
  }, 500));
};

export const fetchChunks = async (_docId: string): Promise<ApiResponse<Chunk[]>> => {
  return new Promise((resolve) => setTimeout(() => {
    resolve({
      data: mockChunks,
      meta: { total: mockChunks.length, limit: mockChunks.length, offset: 0 }
    });
  }, 500));
};

export const fetchNotes = async (_docId: string): Promise<ApiResponse<Note[]>> => {
  return new Promise((resolve) => setTimeout(() => {
    resolve({
      data: mockNotes,
      meta: { total: mockNotes.length, limit: 100, offset: 0 }
    });
  }, 500));
};

export const createNote = async (payload: { document_id: string; chunk_id: string; content: string; playback_offset_ms: number | null }): Promise<ApiResponse<Note>> => {
  return new Promise((resolve) => setTimeout(() => {
    const chunk = mockChunks.find(c => c.id === payload.chunk_id)!;
    const newNote: Note = {
      id: Math.random().toString(36).substring(7),
      document_id: payload.document_id,
      chunk_id: payload.chunk_id,
      content: payload.content,
      playback_offset_ms: payload.playback_offset_ms,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      chunk_context: {
        sequence_order: chunk.sequence_order,
        raw_text: chunk.raw_text.substring(0, 200)
      }
    };
    mockNotes.push(newNote);
    resolve({
      data: newNote,
      meta: null
    });
  }, 500));
};

export const fetchDocument = async (docId: string): Promise<ApiResponse<Document>> => {
  return new Promise((resolve) => setTimeout(() => {
    const doc = mockDocuments.find(d => d.id === docId) || mockDocuments[0];
    resolve({ data: doc, meta: null });
  }, 500));
};

export const deleteNote = async (noteId: string): Promise<ApiResponse<null>> => {
  return new Promise((resolve) => setTimeout(() => {
    const index = mockNotes.findIndex(n => n.id === noteId);
    if (index !== -1) mockNotes.splice(index, 1);
    resolve({ data: null as unknown as null, meta: null });
  }, 500));
};

export const uploadDocument = async (_file: File, title?: string): Promise<ApiResponse<Document>> => {
  return new Promise((resolve) => setTimeout(() => {
    const newDoc: Document = {
      id: Math.random().toString(36).substring(7),
      user_id: "u0000000-0000-0000-0000-000000000000",
      title: title || _file.name || "Uploaded PDF",
      source_type: "pdf",
      source_url: null,
      status: "processing",
      total_chunks: 0,
      ready_chunks: 0,
      generation_status: "idle",
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockDocuments.unshift(newDoc);
    resolve({ data: newDoc, meta: null });
  }, 500));
};

export const uploadDocumentUrl = async (url: string, title?: string): Promise<ApiResponse<Document>> => {
  return new Promise((resolve) => setTimeout(() => {
    const newDoc: Document = {
      id: Math.random().toString(36).substring(7),
      user_id: "u0000000-0000-0000-0000-000000000000",
      title: title || url,
      source_type: "url",
      source_url: url,
      status: "processing",
      total_chunks: 0,
      ready_chunks: 0,
      generation_status: "idle",
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockDocuments.unshift(newDoc);
    resolve({ data: newDoc, meta: null });
  }, 500));
};

export const triggerTTS = async (docId: string, _voiceId?: string): Promise<ApiResponse<unknown>> => {
  return new Promise((resolve) => setTimeout(() => {
    const doc = mockDocuments.find(d => d.id === docId);
    if (doc) {
      doc.generation_status = "running";
    }
    resolve({ data: { success: true }, meta: null });
  }, 500));
};

export const deleteDocument = async (_docId: string): Promise<ApiResponse<null>> => {
  return new Promise(resolve => setTimeout(() => {
    resolve({ data: null as unknown as null, meta: null });
  }, 300));
};

export const fetchChapters = async (_docId: string): Promise<ApiResponse<Chapter[]>> => {
  return new Promise(resolve => setTimeout(() => {
    resolve({ data: [], meta: { total: 0, limit: 100, offset: 0 } });
  }, 300));
};

export const pauseTTS = async (docId: string): Promise<ApiResponse<{ document_id: string; generation_status: "paused" }>> => {
  return new Promise((resolve) => setTimeout(() => {
    const doc = mockDocuments.find(d => d.id === docId);
    if (doc) {
      doc.generation_status = "paused";
    }
    resolve({ data: { document_id: docId, generation_status: "paused" }, meta: null });
  }, 500));
};

export const resumeTTS = async (docId: string, _voiceId?: string): Promise<ApiResponse<{ document_id: string; queued_chunks: number; generation_status: "running"; message: string }>> => {
  return new Promise((resolve) => setTimeout(() => {
    const doc = mockDocuments.find(d => d.id === docId);
    if (doc) {
      doc.generation_status = "running";
    }
    resolve({
      data: {
        document_id: docId,
        queued_chunks: doc ? Math.max(0, doc.total_chunks - doc.ready_chunks) : 0,
        generation_status: "running",
        message: "TTS generation resumed"
      },
      meta: null
    });
  }, 500));
};
