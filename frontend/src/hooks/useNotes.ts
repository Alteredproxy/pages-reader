import { useState, useEffect } from 'react';
import type { Note } from '../types';
import { fetchNotes, createNote } from '../api';

export function useNotes(documentId: string) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadNotes = async () => {
      try {
        const response = await fetchNotes(documentId);
        setNotes(response.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadNotes();
  }, [documentId]);

  const addNote = async (chunkId: string, content: string, offsetMs: number) => {
    try {
      const response = await createNote({
        document_id: documentId,
        chunk_id: chunkId,
        content,
        playback_offset_ms: offsetMs
      });
      setNotes(prev => [...prev, response.data]);
    } catch (err) {
      console.error(err);
    }
  };

  return { notes, loading, addNote };
}
