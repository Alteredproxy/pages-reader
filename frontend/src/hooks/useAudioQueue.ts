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
  const initialSeekOffsetRef = useRef<number>(0);
  const seekVersionRef = useRef<number>(0);

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

  const stopAll = useCallback(() => {
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    scheduledChunksRef.current.clear();
    chunkStartTimesRef.current.clear();
    clearTimeouts();
    nextStartTimeRef.current = 0;
  }, []);

  const scheduleChunk = useCallback(async (chunk: PlayableChunk, index: number, startTime: number, offsetMs: number = 0) => {
    const myVersion = seekVersionRef.current;
    const ctx = audioContextRef.current;
    if (!ctx) return;

    try {
      let buffer = bufferCacheRef.current.get(chunk.id);
      if (!buffer) {
        // Fetch audio
        const response = await fetch(chunk.audio_url);
        if (myVersion !== seekVersionRef.current) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        if (myVersion !== seekVersionRef.current) return;
        buffer = await ctx.decodeAudioData(arrayBuffer);
        if (myVersion !== seekVersionRef.current) return;
        bufferCacheRef.current.set(chunk.id, buffer);
      }

      if (myVersion !== seekVersionRef.current) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = speedRef.current;
      source.connect(ctx.destination);
      
      const offsetSec = offsetMs / 1000;
      
      if (myVersion !== seekVersionRef.current) return;
      source.start(startTime, offsetSec);
      
      sourcesRef.current.set(chunk.id, source);

      if (myVersion !== seekVersionRef.current) {
        try { source.stop(); } catch (e) {}
        sourcesRef.current.delete(chunk.id);
        return;
      }
      
      const adjustedStartTime = startTime - (offsetSec / speedRef.current);
      chunkStartTimesRef.current.set(chunk.id, adjustedStartTime);

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
  }, []);

  const internalSeek = useCallback(async (targetIndex: number, targetOffsetMs: number) => {
    seekVersionRef.current++;
    if (!playlist || playlist.chunks.length === 0) return;

    // Clamp index
    targetIndex = Math.max(0, Math.min(targetIndex, playlist.chunks.length - 1));
    const targetChunk = playlist.chunks[targetIndex];
    const duration = targetChunk.duration_ms || 0;
    // Clamp offset
    targetOffsetMs = Math.max(0, Math.min(targetOffsetMs, duration));

    // Preserve play/paused state
    const wasPlaying = state.status === 'playing' || state.status === 'loading';

    // Stop all current sources
    stopAll();

    // Set state
    setState(prev => ({
      ...prev,
      activeChunkId: targetChunk.id,
      activeChunkIndex: targetIndex,
      offsetMs: targetOffsetMs,
      status: wasPlaying ? 'playing' : 'paused'
    }));

    if (wasPlaying) {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      nextStartTimeRef.current = ctx.currentTime + 0.1;
      scheduledChunksRef.current.add(targetChunk.id);
      await scheduleChunk(targetChunk, targetIndex, nextStartTimeRef.current, targetOffsetMs);

      const buffer = bufferCacheRef.current.get(targetChunk.id);
      const durationSec = buffer ? buffer.duration : (duration / 1000);
      const remainingDurationSec = Math.max(0, durationSec - (targetOffsetMs / 1000));
      nextStartTimeRef.current += (remainingDurationSec / speedRef.current);
    } else {
      initialSeekOffsetRef.current = targetOffsetMs;
    }
  }, [playlist, state.status, stopAll, scheduleChunk]);

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
        
        const isFirstScheduledChunk = nextStartTimeRef.current === 0 || nextStartTimeRef.current < ctx.currentTime;
        const currentOffset = isFirstScheduledChunk ? initialSeekOffsetRef.current : 0;
        
        if (isFirstScheduledChunk) {
            nextStartTimeRef.current = ctx.currentTime + 0.1;
            initialSeekOffsetRef.current = 0; // reset
        }

        await scheduleChunk(chunk, i, nextStartTimeRef.current, currentOffset);
        
        const buffer = bufferCacheRef.current.get(chunk.id);
        const durationSec = buffer ? buffer.duration : (chunk.duration_ms / 1000);
        const remainingDurationSec = Math.max(0, durationSec - (currentOffset / 1000));
        nextStartTimeRef.current += (remainingDurationSec / speedRef.current);
      }
    }
  }, [playlist, state.activeChunkIndex, scheduleChunk]);

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
             const offset = Math.max(0, (ctx.currentTime - startTime) * 1000 * speedRef.current);
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
      internalSeek(index, 0);
    },
    seekBy: (deltaMs: number) => {
      if (!playlist || playlist.chunks.length === 0) return;

      let currentGlobalMs = 0;
      const currentIndex = state.activeChunkIndex === -1 ? 0 : state.activeChunkIndex;
      
      for (let i = 0; i < currentIndex; i++) {
        currentGlobalMs += playlist.chunks[i].duration_ms || 0;
      }
      currentGlobalMs += state.offsetMs;

      const targetGlobalMs = currentGlobalMs + deltaMs;

      let targetIndex = 0;
      let targetOffsetMs = targetGlobalMs;

      if (targetGlobalMs <= 0) {
        targetIndex = 0;
        targetOffsetMs = 0;
      } else {
        for (let i = 0; i < playlist.chunks.length; i++) {
          const duration = playlist.chunks[i].duration_ms || 0;
          if (targetOffsetMs < duration) {
            targetIndex = i;
            break;
          }
          if (i === playlist.chunks.length - 1) {
            targetIndex = i;
            targetOffsetMs = duration;
            break;
          }
          targetOffsetMs -= duration;
        }
      }

      internalSeek(targetIndex, targetOffsetMs);
    },
    skipForward: () => {
      if (!playlist) return;
      const nextIndex = state.activeChunkIndex + 1;
      if (nextIndex < playlist.chunks.length) {
        internalSeek(nextIndex, 0);
      }
    },
    skipBack: () => {
      if (!playlist) return;
      const prevIndex = Math.max(0, state.activeChunkIndex - 1);
      internalSeek(prevIndex, 0);
    },
    setSpeed: (rate: number) => {
      speedRef.current = rate;
      setState(prev => ({ ...prev, speed: rate }));
    }
  };

  return { state, controls, playlist };
}

