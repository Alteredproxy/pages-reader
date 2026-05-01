import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChunks } from '../../hooks/useChunks';
import { useAudioQueue } from '../../hooks/useAudioQueue';
import { useNotes } from '../../hooks/useNotes';
import { PlayerBar } from './PlayerBar';
import { TranscriptPane } from './TranscriptPane';
import { NotesPanel } from './NotesPanel';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Sun, Moon, ArrowLeft, LogOut, Play } from 'lucide-react';
import { triggerTTS, fetchChunks } from '../../api';
import type { PlayableChunk } from '../../types';

export function ReaderPage() {
  const { docId = '' } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  
  const { chunks, playlist, loading: chunksLoading, setChunks, setPlaylist } = useChunks(docId);
  const { state, controls } = useAudioQueue(playlist);
  const { notes, addNote } = useNotes(docId);

  const initialSeekDone = useRef(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [polling, setPolling] = useState(false);
  const [ttsError, setTtsError] = useState(false);

  // Polling logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const POLLING_INTERVAL = Number(import.meta.env.VITE_POLLING_INTERVAL_MS) || 3000;

    if (polling) {
      interval = setInterval(async () => {
        try {
          const response = await fetchChunks(docId);
          const newChunks = response.data;
          setChunks(newChunks);
          
          const readyChunks = newChunks.filter((c): c is PlayableChunk => c.audio_status === 'ready' && c.audio_url !== null);
          setPlaylist({
            document_id: docId,
            chunks: readyChunks,
            total_chunks: newChunks.length,
            ready_count: readyChunks.length
          });

          const stillWorking = newChunks.some(c => c.audio_status === 'pending' || c.audio_status === 'generating');
          if (!stillWorking) {
            setPolling(false);
          }
        } catch (err) {
          console.error('Polling failed', err);
        }
      }, POLLING_INTERVAL);
    }

    return () => clearInterval(interval);
  }, [polling, docId, setChunks, setPlaylist]);

  const handleGenerateAudio = async () => {
    setIsTriggering(true);
    setTtsError(false);
    try {
      await triggerTTS(docId);
      setPolling(true);
    } catch (err) {
      console.error(err);
      setTtsError(true);
      setTimeout(() => setTtsError(false), 5000);
    } finally {
      setIsTriggering(false);
    }
  };

  useEffect(() => {
    if (!initialSeekDone.current && !chunksLoading && playlist && playlist.chunks.length > 0) {
      initialSeekDone.current = true;
      const lastChunkId = localStorage.getItem(`pages_progress_${docId}`);
      if (lastChunkId) {
        controls.seekToChunk(lastChunkId);
      }
    }
  }, [chunksLoading, playlist, controls, docId]);

  useEffect(() => {
    if (state.activeChunkId) {
      localStorage.setItem(`pages_progress_${docId}`, state.activeChunkId);
    }
  }, [state.activeChunkId, docId]);

  if (chunksLoading) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  const readyCount = playlist?.ready_count || 0;
  const totalChunks = playlist?.total_chunks || chunks.length;
  const errorCount = chunks.filter(c => c.audio_status === 'error').length;
  const showGenerateBtn = totalChunks > 0 && (readyCount < totalChunks) && !polling && !isTriggering;
  const isGenerating = polling || isTriggering;

  return (
    <div className="reader-page">
      <header className="top-nav">
        <button className="control-btn" onClick={() => navigate('/')} style={{ marginRight: '1rem' }}>
          <ArrowLeft size={20} />
        </button>
        <div className="logo">Pages</div>
        <div className="doc-title">Document View</div>
        <div style={{ flex: 1 }} />
        
        {showGenerateBtn && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: '1rem', position: 'relative' }}>
            <button 
              className={`primary-btn ${isGenerating ? 'generating' : ''}`}
              onClick={handleGenerateAudio}
              disabled={isGenerating}
              style={{ padding: '0.4rem 1rem', width: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}
            >
              <Play size={16} />
              {isGenerating ? `Generating... (${readyCount} / ${totalChunks} ready)` : errorCount > 0 ? `Retry Failed (${errorCount} chunks)` : 'Generate Audio'}
            </button>
            {ttsError && (
              <span style={{ color: 'var(--accent-color)', fontSize: '0.75rem', position: 'absolute', top: '110%', whiteSpace: 'nowrap' }}>
                Failed to start audio generation. Try again.
              </span>
            )}
          </div>
        )}

        <button className="control-btn" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button className="control-btn" onClick={signOut} style={{ marginLeft: '0.5rem' }} title="Sign Out">
          <LogOut size={20} />
        </button>
      </header>
      
      <main className="reader-main">
        <TranscriptPane 
          chunks={chunks} 
          activeChunkId={state.activeChunkId} 
          onChunkClick={controls.seekToChunk}
        />
        <NotesPanel
          notes={notes}
          activeChunkId={state.activeChunkId}
          firstChunkId={chunks[0]?.id ?? null}
          offsetMs={state.offsetMs}
          onAddNote={addNote}
        />
      </main>

      <PlayerBar 
        state={state} 
        controls={controls} 
        playlist={playlist} 
      />
    </div>
  );
}
