import { useEffect, useRef, Fragment } from 'react';
import type { Chunk, Chapter } from '../../types';

interface TranscriptPaneProps {
  chunks: Chunk[];
  activeChunkId: string | null;
  onChunkClick: (chunkId: string) => void;
  chapters: Chapter[];
}

export function TranscriptPane({ chunks, activeChunkId, onChunkClick, chapters }: TranscriptPaneProps) {
  const activeRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeChunkId]);

  const activeChunk = chunks.find(c => c.id === activeChunkId) ?? null;
  const activeChapter = activeChunk?.chapter_id
    ? chapters.find(ch => ch.id === activeChunk.chapter_id) ?? null
    : null;

  return (
    <div className="transcript-pane custom-scrollbar">
      {activeChapter && (
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          padding: '0.5rem 1rem',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-color)',
          fontSize: '0.8rem',
          fontWeight: 600,
          color: 'var(--accent-color)',
          letterSpacing: '0.04em',
        }}>
          {`Chapter ${activeChapter.sequence_order + 1}: ${activeChapter.title}`}
        </div>
      )}
      {chunks.map((chunk) => {
        const isActive = chunk.id === activeChunkId;
        const isReady = chunk.audio_status === 'ready';
        
        const isHeading = chunk.raw_text.length < 80 && !/[.?!]/.test(chunk.raw_text);

        return (
          <div 
            key={chunk.id} 
            ref={isActive ? activeRowRef : null}
            className={`chunk-row ${isActive ? 'active' : ''} ${!isReady ? 'pending' : 'ready'}`}
            onClick={() => isReady && onChunkClick(chunk.id)}
          >
            <div className="chunk-indicator">
               {isActive && <div className="playing-dot" />}
            </div>
            <div className="chunk-text">
              {isHeading ? (
                <h3>{chunk.raw_text}</h3>
              ) : (
                chunk.raw_text.split('\n\n').map((para, i) => (
                  <p key={i}>
                    {para.split('\n').map((line, j, arr) => (
                      <Fragment key={j}>
                        {line}
                        {j < arr.length - 1 && <br />}
                      </Fragment>
                    ))}
                  </p>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
