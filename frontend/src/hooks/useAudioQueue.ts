import { useState, useEffect, useRef, useCallback } from 'react';
import type { PlayerState, PlayerControls, UseAudioQueueReturn, ChunkPlaylist, PlayableChunk } from '../types';

export function useAudioQueue(playlist: ChunkPlaylist | null): UseAudioQueueReturn {
  const [state, setState] = useState<PlayerState>({
    status: 'idle',
    activeChunkId: null,
    activeChunkIndex: -1,
    offsetMs: 0,
    error: null,
    speed: 1,
  });

  const speedRef = useRef<number>(1);

  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const scheduledChunksRef = useRef<Set<string>>(new Set());
  const sourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const chunkStartTimesRef = useRef<Map<string, number>>(new Map());
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const offsetIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize AudioContext lazily
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      clearTimeouts();
    };
  }, []);

  const clearTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    if (offsetIntervalRef.current) {
      clearInterval(offsetIntervalRef.current);
      offsetIntervalRef.current = null;
    }
  };

  const scheduleChunk = async (chunk: PlayableChunk, index: number, startTime: number) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    try {
      let buffer = bufferCacheRef.current.get(chunk.id);
      if (!buffer) {
        // Fetch audio
        const response = await fetch(chunk.audio_url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        buffer = await ctx.decodeAudioData(arrayBuffer);
        bufferCacheRef.current.set(chunk.id, buffer);
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = speedRef.current;
      source.connect(ctx.destination);
      source.start(startTime);
      
      sourcesRef.current.set(chunk.id, source);
      chunkStartTimesRef.current.set(chunk.id, startTime);

      // Schedule activeChunkId update
      const delayMs = Math.max(0, (startTime - ctx.currentTime) * 1000);
      const timeout = setTimeout(() => {
        setState(prev => ({
          ...prev,
          activeChunkId: chunk.id,
          activeChunkIndex: index,
        }));
      }, delayMs);
      timeoutsRef.current.push(timeout);

    } catch (error) {
      console.warn(`Chunk fetch error for ${chunk.id}:`, error);
    }
  };

  // Keep queue filled (gapless playback & prefetch window)
  const manageQueue = useCallback(async () => {
    if (!playlist || !audioContextRef.current) return;
    const ctx = audioContextRef.current;
    
    let currentIndex = state.activeChunkIndex === -1 ? 0 : state.activeChunkIndex;
    
    // Always decode + schedule next 2 chunks ahead
    for (let i = currentIndex; i < Math.min(currentIndex + 3, playlist.chunks.length); i++) {
      const chunk = playlist.chunks[i];
      if (!scheduledChunksRef.current.has(chunk.id)) {
        scheduledChunksRef.current.add(chunk.id);
        
        if (nextStartTimeRef.current === 0 || nextStartTimeRef.current < ctx.currentTime) {
            nextStartTimeRef.current = ctx.currentTime + 0.1;
        }

        await scheduleChunk(chunk, i, nextStartTimeRef.current);
        
        const buffer = bufferCacheRef.current.get(chunk.id);
        const durationSec = buffer ? buffer.duration : (chunk.duration_ms / 1000);
        nextStartTimeRef.current += (durationSec / speedRef.current);
      }
    }
  }, [playlist, state.activeChunkIndex]);

  useEffect(() => {
    if (state.status === 'playing' || state.status === 'loading') {
      manageQueue();
    }
  }, [manageQueue, state.status, playlist?.chunks.length]);

  // Offset tracking
  useEffect(() => {
    if (state.status === 'playing') {
      offsetIntervalRef.current = setInterval(() => {
        const ctx = audioContextRef.current;
        if (ctx && state.activeChunkId) {
           const startTime = chunkStartTimesRef.current.get(state.activeChunkId);
           if (startTime !== undefined) {
             const offset = Math.max(0, (ctx.currentTime - startTime) * 1000);
             setState(prev => ({ ...prev, offsetMs: offset }));
           }
        }
      }, 250);
    } else {
      if (offsetIntervalRef.current) clearInterval(offsetIntervalRef.current);
    }
    return () => {
      if (offsetIntervalRef.current) clearInterval(offsetIntervalRef.current);
    };
  }, [state.status, state.activeChunkId]);

  const stopAll = () => {
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    scheduledChunksRef.current.clear();
    chunkStartTimesRef.current.clear();
    clearTimeouts();
    nextStartTimeRef.current = 0;
  };

  const controls: PlayerControls = {
    play: async () => {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      if (ctx?.state === 'suspended') {
        await ctx.resume();
      }
      setState(prev => ({ ...prev, status: 'playing' }));
    },
    pause: () => {
      const ctx = audioContextRef.current;
      if (ctx?.state === 'running') {
        ctx.suspend();
      }
      setState(prev => ({ ...prev, status: 'paused' }));
    },
    seekToChunk: (chunkId: string) => {
      if (!playlist) return;
      const index = playlist.chunks.findIndex(c => c.id === chunkId);
      if (index === -1) return;

      stopAll();
      
      setState(prev => ({
        ...prev,
        activeChunkId: chunkId,
        activeChunkIndex: index,
        offsetMs: 0,
        status: 'playing'
      }));
      
      const ctx = audioContextRef.current;
      if (ctx) {
         nextStartTimeRef.current = ctx.currentTime + 0.1;
      }
    },
    skipForward: () => {
      if (!playlist) return;
      const nextIndex = state.activeChunkIndex + 1;
      if (nextIndex < playlist.chunks.length) {
        controls.seekToChunk(playlist.chunks[nextIndex].id);
      }
    },
    skipBack: () => {
      if (!playlist) return;
      const prevIndex = Math.max(0, state.activeChunkIndex - 1);
      controls.seekToChunk(playlist.chunks[prevIndex].id);
    },
    setSpeed: (rate: number) => {
      speedRef.current = rate;
      setState(prev => ({ ...prev, speed: rate }));
    }
  };

  return { state, controls, playlist };
}
