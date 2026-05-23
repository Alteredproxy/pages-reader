import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChunks } from '../../hooks/useChunks';
import { useAudioQueue } from '../../hooks/useAudioQueue';
import { useNotes } from '../../hooks/useNotes';
import { useChapters } from '../../hooks/useChapters';
import { PlayerBar } from './PlayerBar';
import { TranscriptPane } from './TranscriptPane';
import { NotesPanel } from './NotesPanel';
import { ChaptersSidebar } from './ChaptersSidebar';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Sun, Moon, ArrowLeft, LogOut, Play, BookOpen, Pause, RotateCcw } from 'lucide-react';
import { triggerTTS, fetchChunks, fetchDocument, pauseTTS, resumeTTS } from '../../api';
import type { PlayableChunk } from '../../types';

export function ReaderPage() {
  const { docId = '' } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  
  const { chunks, playlist, loading: chunksLoading, setChunks, setPlaylist } = useChunks(docId);
  const { state, controls } = useAudioQueue(playlist);
  const { notes, addNote } = useNotes(docId);
  const { chapters } = useChapters(docId);

  const initialSeekDone = useRef(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [polling, setPolling] = useState(false);
  const [ttsError, setTtsError] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hasStarted = useRef(false);

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
          
          const readyChunks: PlayableChunk[] = [];
          for (const chunk of newChunks) {
            if (chunk.audio_status === 'ready' && chunk.audio_url !== null) {
              readyChunks.push(chunk as PlayableChunk);
            } else if (chunk.audio_status === 'error') {
              console.warn(`Skipping errored chunk ${chunk.id} (sequence_order ${chunk.sequence_order})`);
              continue;
            } else {
              break;
            }
          }

          const realReadyCount = newChunks.filter(c => c.audio_status === 'ready' && c.audio_url !== null).length;
          setPlaylist({
            document_id: docId,
            chunks: readyChunks,
            total_chunks: newChunks.length,
            ready_count: realReadyCount
          });

          const stillWorking = newChunks.some(c => c.audio_status === 'pending' || c.audio_status === 'generating');
          if (!stillWorking) {
            setPolling(false);
          }
          if (readyChunks.length === newChunks.length && newChunks.length > 0) {
            hasStarted.current = false;
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
      hasStarted.current = true;
      setPolling(true);
    } catch (err) {
      console.error(err);
      setTtsError(true);
      setTimeout(() => setTtsError(false), 5000);
    } finally {
      setIsTriggering(false);
    }
  };

  const handlePauseAudio = async () => {
    setIsTriggering(true);
    try {
      await pauseTTS(docId);
      setPolling(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTriggering(false);
    }
  };

  const handleResumeAudio = async () => {
    setIsTriggering(true);
    try {
      await resumeTTS(docId);
      setPolling(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTriggering(false);
    }
  };

  useEffect(() => {
    const initDocumentState = async () => {
      try {
        const response = await fetchDocument(docId);
        const doc = response.data;
        if (doc) {
          if (doc.generation_status === 'paused') {
            hasStarted.current = true;
            setPolling(false);
          } else if (doc.generation_status === 'running') {
            hasStarted.current = true;
            setPolling(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch document status:', err);
      }
    };

    if (docId) {
      initDocumentState();
    }
  }, [docId]);

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
  
  const showWidget = totalChunks > 0 && readyCount < totalChunks;

  let btnLabel = '';
  let btnIcon = null;
  let btnAction = () => {};

  if (ttsError) {
    btnLabel = 'Retry';
    btnIcon = <RotateCcw size={16} />;
    btnAction = handleGenerateAudio;
  } else if (polling) {
    btnLabel = `Generating... (${readyCount}/${totalChunks})`;
    btnIcon = <Pause size={16} />;
    btnAction = handlePauseAudio;
  } else if (!polling && !isTriggering && hasStarted.current) {
    btnLabel = 'Resume';
    btnIcon = <Play size={16} />;
    btnAction = handleResumeAudio;
  } else {
    btnLabel = 'Generate Audio';
    btnIcon = <Play size={16} />;
    btnAction = handleGenerateAudio;
  }

  return (
    <div className="reader-page">
      <header className="top-nav">
        <button className="control-btn" onClick={() => navigate('/')} style={{ marginRight: '1rem' }}>
          <ArrowLeft size={20} />
        </button>
        <button className="control-btn" onClick={() => setSidebarOpen(prev => !prev)} style={{ marginRight: '1rem' }} title="Toggle Chapters">
          <BookOpen size={20} />
        </button>
        <div className="logo">Pages</div>
        <div className="doc-title">Document View</div>
        <div style={{ flex: 1 }} />
        
        {showWidget && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginRight: '1rem', minWidth: '160px' }}>
            <button 
              className="primary-btn"
              onClick={btnAction}
              disabled={isTriggering}
              style={{ padding: '0.4rem 1rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', margin: 0 }}
            >
              {btnIcon}
              {btnLabel}
            </button>
            {hasStarted.current && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div 
                    className={`progress-fill ${polling ? 'progress-fill--generating' : ''}`} 
                    style={{ width: `${(readyCount / totalChunks) * 100}%`, height: '100%', background: 'var(--accent-color)', borderRadius: '2px' }} 
                  />
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  {readyCount} / {totalChunks} chunks ready
                </div>
              </div>
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
      
      <ChaptersSidebar
        chapters={chapters}
        chunks={chunks}
        activeChunkId={state.activeChunkId}
        onSeek={controls.seekToChunk}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(prev => !prev)}
      />

      <main className="reader-main" style={{ marginLeft: sidebarOpen ? '260px' : '0', transition: 'margin-left 0.25s ease' }}>
        <TranscriptPane 
          chunks={chunks} 
          activeChunkId={state.activeChunkId} 
          onChunkClick={controls.seekToChunk}
          chapters={chapters}
        />
        <NotesPanel
          notes={notes}
          chunks={chunks}
          chapters={chapters}
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
        chapters={chapters}
        activeChunkId={state.activeChunkId}
      />
    </div>
  );
}
