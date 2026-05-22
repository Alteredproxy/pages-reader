import { useState, useEffect } from 'react';
import type { Chapter } from '../types';
import { fetchChapters } from '../api';

export function useChapters(documentId: string) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!documentId) return;
    fetchChapters(documentId)
      .then(res => setChapters(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [documentId]);

  return { chapters, loading };
}
