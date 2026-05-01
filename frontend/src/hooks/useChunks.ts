import { useState, useEffect } from 'react';
import type { Chunk, ChunkPlaylist, PlayableChunk } from '../types';
import { fetchChunks } from '../api';

export function useChunks(documentId: string) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [playlist, setPlaylist] = useState<ChunkPlaylist | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await fetchChunks(documentId);
        if (!mounted) return;
        
        const newChunks = response.data;
        setChunks(newChunks);
        
        const readyChunks = newChunks.filter((c): c is PlayableChunk => c.audio_status === 'ready' && c.audio_url !== null);
        
        setPlaylist({
          document_id: documentId,
          chunks: readyChunks,
          total_chunks: newChunks.length,
          ready_count: readyChunks.length
        });
        
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [documentId]);

  return { chunks, playlist, loading, setChunks, setPlaylist };
}
