import type { Chapter, Chunk } from '../../types';

interface ChaptersSidebarProps {
  chapters: Chapter[];
  chunks: Chunk[];
  activeChunkId: string | null;
  onSeek: (chunkId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function ChaptersSidebar({ chapters, chunks, activeChunkId, onSeek, isOpen }: ChaptersSidebarProps) {
  const activeChapter = chapters.find(ch => {
    if (!activeChunkId) return false;
    const activeChunk = chunks.find(c => c.id === activeChunkId);
    return activeChunk?.chapter_id === ch.id;
  });

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: '60px', // header height
        bottom: '80px', // player height
        width: '260px',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-color)',
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
        zIndex: 90,
        overflowY: 'auto',
        padding: '1rem',
        color: 'var(--text-primary)'
      }}
    >
      <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '1.25rem', marginBottom: '1rem', marginTop: 0 }}>Chapters</h2>
      
      {chapters.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          No chapters detected
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {chapters.map(chapter => {
            const isActive = activeChapter?.id === chapter.id;
            return (
              <button
                key={chapter.id}
                onClick={() => {
                  const firstChunk = chunks.find(c => c.chapter_id === chapter.id);
                  if (firstChunk) onSeek(firstChunk.id);
                }}
                style={{
                  background: isActive ? 'var(--accent-color)' : 'transparent',
                  color: isActive ? 'var(--bg-surface)' : 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  gap: '0.5rem'
                }}
              >
                <span style={{ opacity: 0.7 }}>{chapter.sequence_order + 1}.</span>
                <span style={{ flex: 1 }}>{chapter.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
