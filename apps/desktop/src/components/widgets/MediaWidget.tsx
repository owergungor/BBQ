import React, { useCallback } from "react";
import { useMediaState } from "../../state/mediaState.ts";
import { bbqCommands } from "../../ipc/commands.ts";

export const MediaWidget: React.FC = () => {
  const { currentSession } = useMediaState();

  const handleTogglePlayPause = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await bbqCommands.mediaTogglePlayPause();
  }, []);

  const handleNext = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await bbqCommands.mediaNext();
  }, []);

  const handlePrevious = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await bbqCommands.mediaPrevious();
  }, []);

  if (!currentSession || currentSession.state === "stopped") {
    return (
      <div className="bbq-media-empty-state">
        <span className="bbq-media-empty-icon" aria-hidden="true">🎵</span>
        <span className="bbq-media-empty-text">No active media session detected</span>
      </div>
    );
  }

  const isPlaying = currentSession.state === "playing";
  const caps = currentSession.capabilities;

  return (
    <div id="bbq-media-widget" className="bbq-expanded-media-container">
      <div className="bbq-expanded-media">
        <div className="bbq-media-art expanded">
          {currentSession.albumArt ? (
            <img
              src={currentSession.albumArt}
              alt="Artwork"
              className="bbq-media-art-img"
            />
          ) : (
            <span className="bbq-media-icon" aria-hidden="true">🎵</span>
          )}
        </div>
        <div className="bbq-expanded-media-details">
          <div className="bbq-expanded-track-title" title={currentSession.title ?? "Unknown Track"}>
            {currentSession.title ?? "Unknown Track"}
          </div>
          <div className="bbq-expanded-track-artist" title={currentSession.artist ?? "Unknown Artist"}>
            {currentSession.artist ?? "Unknown Artist"}
            {currentSession.album ? ` • ${currentSession.album}` : ""}
          </div>
        </div>

        <div className="bbq-media-controls-expanded">
          {caps.canGoPrevious && (
            <button
              type="button"
              className="bbq-media-expanded-ctrl-btn"
              onClick={handlePrevious}
              title="Previous Track"
              aria-label="Previous track"
            >
              ◀
            </button>
          )}
          {(caps.canPlay || caps.canPause) && (
            <button
              type="button"
              className="bbq-media-expanded-ctrl-btn primary"
              onClick={handleTogglePlayPause}
              title={isPlaying ? "Pause" : "Play"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>
          )}
          {caps.canGoNext && (
            <button
              type="button"
              className="bbq-media-expanded-ctrl-btn"
              onClick={handleNext}
              title="Next Track"
              aria-label="Next track"
            >
              ▶
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
