import type { PlayerState, PlayerControls, ChunkPlaylist, Chapter } from '../../types';

interface PlayerBarProps {
  state: PlayerState;
  controls: PlayerControls;
  playlist: ChunkPlaylist | null;
  chapters: Chapter[];
  activeChunkId: string | null;
}

export function PlayerBar({ state, controls, playlist, chapters, activeChunkId }: PlayerBarProps) {
  if (!playlist) return null;

  const isPlaying = state.status === 'playing';

  const activeChunk = playlist?.chunks.find(c => c.id === activeChunkId) ?? null;
  const activeChapter = activeChunk?.chapter_id
    ? chapters.find(ch => ch.id === activeChunk.chapter_id) ?? null
    : null;
  const chapterLabel = activeChapter
    ? `Ch. ${activeChapter.sequence_order + 1} · ${activeChapter.title}`
    : null;

  const sortedChapters = [...chapters].sort((a, b) => a.sequence_order - b.sequence_order);
  const currentChapterIndex = activeChunk?.chapter_id
    ? sortedChapters.findIndex(ch => ch.id === activeChunk.chapter_id)
    : -1;

  let prevChapter: Chapter | null = null;
  let nextChapter: Chapter | null = null;

  if (activeChunk) {
    if (activeChunk.chapter_id === null) {
      nextChapter = sortedChapters[0] ?? null;
    } else if (currentChapterIndex !== -1) {
      prevChapter = sortedChapters[currentChapterIndex - 1] ?? null;
      nextChapter = sortedChapters[currentChapterIndex + 1] ?? null;
    }
  }

  const prevChapterFirstChunk = prevChapter
    ? playlist.chunks.find(c => c.chapter_id === prevChapter!.id) ?? null
    : null;

  const nextChapterFirstChunk = nextChapter
    ? playlist.chunks.find(c => c.chapter_id === nextChapter!.id) ?? null
    : null;

  const hasPrevChapter = prevChapterFirstChunk !== null;
  const hasNextChapter = nextChapterFirstChunk !== null;

  return (
    <div className="player-bar glass">
      <div className="player-controls">
        <button 
          className="control-btn" 
          onClick={() => prevChapterFirstChunk && controls.seekToChunk(prevChapterFirstChunk.id)} 
          disabled={!hasPrevChapter} 
          title="Previous chapter"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button 
          className="control-btn" 
          onClick={controls.skipBack} 
          disabled={state.activeChunkIndex <= 0} 
          title="Previous chunk"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
        <button 
          className={`control-btn play-btn ${
            state.status === 'playing' ? 'play-btn--playing' : 
            state.status === 'paused' ? 'play-btn--paused' : 
            'play-btn--idle'
          }`} 
          onClick={isPlaying ? controls.pause : controls.play}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        <button 
          className="control-btn" 
          onClick={controls.skipForward} 
          disabled={state.activeChunkIndex >= playlist.chunks.length - 1} 
          title="Next chunk"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
        <button 
          className="control-btn" 
          onClick={() => nextChapterFirstChunk && controls.seekToChunk(nextChapterFirstChunk.id)} 
          disabled={!hasNextChapter} 
          title="Next chapter"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
      </div>
      <div className="player-progress">
        <div className="progress-text">
          {chapterLabel && (
            <span className="chapter-label" style={{
              color: 'var(--accent-color)',
              fontWeight: 600,
              fontSize: '0.8rem',
              letterSpacing: '0.02em',
            }}>
              {chapterLabel}
            </span>
          )}
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            Chunk {Math.max(1, state.activeChunkIndex + 1)} of {playlist?.total_chunks ?? 0}
          </span>
          <span className="ready-badge">
            {playlist?.ready_count} / {playlist?.total_chunks} ready
          </span>
        </div>
        <div className="progress-track">
          <div 
            className="progress-fill" 
            style={{ width: `${((Math.max(0, state.activeChunkIndex) + 1) / playlist.total_chunks) * 100}%` }}
          />
        </div>
        {state.activeChunkId && <div className="offset-time">{Math.floor(state.offsetMs / 1000)}s</div>}
      </div>
      <div className="speed-controls">
        {[0.75, 1, 1.25, 1.5, 2].map(speed => (
          <button 
            key={speed}
            className={`speed-pill ${state.speed === speed ? 'active' : ''}`}
            onClick={() => controls.setSpeed(speed)}
          >
            {speed}×
          </button>
        ))}
      </div>
    </div>
  );
}
