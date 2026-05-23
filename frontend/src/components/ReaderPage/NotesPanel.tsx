import React, { useState } from 'react';
import type { Note, Chunk, Chapter } from '../../types';

interface NotesPanelProps {
  notes: Note[];
  chunks: Chunk[];
  chapters: Chapter[];
  activeChunkId: string | null;
  firstChunkId: string | null;
  offsetMs: number;
  onAddNote: (chunkId: string, content: string, offsetMs: number) => void;
}

export function NotesPanel({ notes, chunks, chapters, activeChunkId, firstChunkId, offsetMs, onAddNote }: NotesPanelProps) {
  const [content, setContent] = useState('');

  const anchorChunkId = activeChunkId || firstChunkId;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !anchorChunkId) return;
    onAddNote(anchorChunkId, content, offsetMs);
    setContent('');
  };

  const activeChunk = chunks.find(c => c.id === anchorChunkId);
  const activeChapter = activeChunk?.chapter_id
    ? chapters.find(ch => ch.id === activeChunk.chapter_id)
    : null;

  return (
    <div className="notes-panel">
      <div className="notes-header">
        <h2>Notes</h2>
      </div>
      
      <div className="notes-list custom-scrollbar">
        {notes.length === 0 ? (
          <div className="empty-notes">No notes yet. Start typing while listening!</div>
        ) : (
          notes.map(note => {
            const noteChunk = chunks.find(c => c.id === note.chunk_id);
            const noteChapter = noteChunk?.chapter_id
              ? chapters.find(ch => ch.id === noteChunk.chapter_id)
              : null;

            return (
              <div key={note.id} className="note-card">
                <div className="note-meta">
                  <span className="note-time">@{Math.floor((note.playback_offset_ms || 0) / 1000)}s</span>
                  {noteChapter && (
                    <span className="note-chapter-ref">
                      Ch. {noteChapter.sequence_order + 1}: {noteChapter.title}
                    </span>
                  )}
                  <span className="note-chunk-ref">Chunk {note.chunk_context.sequence_order + 1}</span>
                </div>
                <p className="note-content">{note.content}</p>
              </div>
            );
          })
        )}
      </div>

      <div className="note-editor">
        <form onSubmit={handleSubmit}>
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              activeChapter && activeChunk
                ? `Take a note on Ch. ${activeChapter.sequence_order + 1} · Chunk ${activeChunk.sequence_order + 1}...`
                : activeChunkId
                ? "Take a note on this chunk..."
                : "Take a note..."
            }
            disabled={false}
            className="custom-scrollbar"
          />
          <button type="submit" className="primary-btn" disabled={!content.trim() || !anchorChunkId}>
            Save Note
          </button>
        </form>
      </div>
    </div>
  );
}
