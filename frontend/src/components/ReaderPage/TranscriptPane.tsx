import { useEffect, useRef, Fragment } from 'react';
import type { Chunk } from '../../types';

interface TranscriptPaneProps {
  chunks: Chunk[];
  activeChunkId: string | null;
  onChunkClick: (chunkId: string) => void;
}

export function TranscriptPane({ chunks, activeChunkId, onChunkClick }: TranscriptPaneProps) {
  const activeRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeChunkId]);

  return (
    <div className="transcript-pane custom-scrollbar">
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
