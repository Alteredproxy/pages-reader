import type { PlayerState, PlayerControls, ChunkPlaylist } from '../../types';

interface PlayerBarProps {
  state: PlayerState;
  controls: PlayerControls;
  playlist: ChunkPlaylist | null;
}

export function PlayerBar({ state, controls, playlist }: PlayerBarProps) {
  if (!playlist) return null;

  const isPlaying = state.status === 'playing';

  return (
    <div className="player-bar glass">
      <div className="player-controls">
        <button className="control-btn" onClick={controls.skipBack} disabled={state.activeChunkIndex <= 0}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button className="control-btn play-btn" onClick={isPlaying ? controls.pause : controls.play}>
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        <button className="control-btn" onClick={controls.skipForward} disabled={state.activeChunkIndex >= playlist.chunks.length - 1}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
      </div>
      <div className="player-progress">
        <div className="progress-text">
          <span>Chunk {Math.max(1, state.activeChunkIndex + 1)} of {playlist.total_chunks}</span>
          <span className="ready-badge">{playlist.ready_count} / {playlist.total_chunks} ready</span>
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
