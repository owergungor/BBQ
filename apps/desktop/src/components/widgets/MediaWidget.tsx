import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMediaState, refreshMediaSession } from "../../state/mediaState.ts";
import { bbqCommands } from "../../ipc/commands.ts";
import { Icon } from "../common/Icon.tsx";
import {
  normalizeMediaSession,
  formatTime,
  calculateInterpolatedPosition,
  extractAmbientColor,
  DEFAULT_AMBIENT_PALETTE,
  type AmbientPalette,
} from "./mediaModel.ts";

export const MediaWidget: React.FC = () => {
  const { currentSession } = useMediaState();
  const [ambientPalette, setAmbientPalette] = useState<AmbientPalette>(DEFAULT_AMBIENT_PALETTE);
  const [artError, setArtError] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosMs, setSeekPosMs] = useState<number | null>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const settlingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meta = useMemo(() => normalizeMediaSession(currentSession), [currentSession]);
  const [interpolatedMs, setInterpolatedMs] = useState<number>(() => calculateInterpolatedPosition(meta));

  // Clean up any pending seek settling timer on unmount
  useEffect(() => {
    return () => {
      if (settlingTimeoutRef.current) {
        clearTimeout(settlingTimeoutRef.current);
        settlingTimeoutRef.current = null;
      }
    };
  }, []);

  // Lazily query latest media session on widget activation
  useEffect(() => {
    refreshMediaSession();
  }, []);

  // Reset art error when artwork URL changes
  useEffect(() => {
    setArtError(false);
  }, [meta?.albumArt]);

  // Synchronize interpolated position when meta changes (rebased on timeline event, pause, resume, track change)
  useEffect(() => {
    setInterpolatedMs(calculateInterpolatedPosition(meta));
  }, [meta]);

  // Bounded, cancelable one-shot timeout scheduling strictly targeting the next second boundary while actively playing
  useEffect(() => {
    if (!meta || !meta.isPlaying || isSeeking || meta.durationMs <= 0) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const scheduleNextTick = () => {
      if (isCancelled) return;
      const now = Date.now();
      setInterpolatedMs(calculateInterpolatedPosition(meta, now));

      // Target the next whole second boundary for energy-efficient, smooth seconds progression
      const delay = Math.max(100, 1000 - (now % 1000));
      timeoutId = setTimeout(scheduleNextTick, delay);
    };

    scheduleNextTick();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
  }, [meta?.id, meta?.title, meta?.positionMs, meta?.lastUpdatedTime, meta?.isPlaying, meta?.durationMs, isSeeking]);

  // Ambient color extraction: single-shot per artwork URL change
  useEffect(() => {
    if (!meta?.albumArt || artError) {
      setAmbientPalette(DEFAULT_AMBIENT_PALETTE);
      return;
    }

    let isSubscribed = true;
    extractAmbientColor(meta.albumArt).then((palette) => {
      if (isSubscribed) {
        setAmbientPalette(palette);
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [meta?.albumArt, artError]);

  // Clear seek settling if backend event position catches up to within 1500ms of target
  useEffect(() => {
    if (!isSeeking && seekPosMs !== null && meta) {
      if (Math.abs(meta.positionMs - seekPosMs) <= 1500) {
        if (settlingTimeoutRef.current) {
          clearTimeout(settlingTimeoutRef.current);
          settlingTimeoutRef.current = null;
        }
        setSeekPosMs(null);
      }
    }
  }, [meta?.positionMs, isSeeking, seekPosMs]);

  const handleTogglePlayPause = useCallback(async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    await bbqCommands.mediaTogglePlayPause();
  }, []);

  const handleNext = useCallback(async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    await bbqCommands.mediaNext();
  }, []);

  const handlePrevious = useCallback(async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    await bbqCommands.mediaPrevious();
  }, []);

  // Calculate current display position (user drag, settling optimistic position, or monotonic timeline position)
  const currentPosMs = useMemo(() => {
    if (seekPosMs !== null) return seekPosMs;
    return interpolatedMs;
  }, [seekPosMs, interpolatedMs]);

  const currentPercent = useMemo(() => {
    if (!meta || meta.durationMs <= 0) return 0;
    return Math.max(0, Math.min(100, (currentPosMs / meta.durationMs) * 100));
  }, [currentPosMs, meta]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!meta || !meta.canSeek || meta.durationMs <= 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (settlingTimeoutRef.current) {
        clearTimeout(settlingTimeoutRef.current);
        settlingTimeoutRef.current = null;
      }
      setIsSeeking(true);
      const rect = seekBarRef.current?.getBoundingClientRect();
      if (rect) {
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setSeekPosMs(Math.round(ratio * meta.durationMs));
      }

      const onPointerMove = (moveEvt: PointerEvent) => {
        if (!seekBarRef.current || !meta) return;
        const r = seekBarRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (moveEvt.clientX - r.left) / r.width));
        setSeekPosMs(Math.round(ratio * meta.durationMs));
      };

      const onPointerUp = async (upEvt: PointerEvent) => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        setIsSeeking(false);
        if (seekBarRef.current && meta) {
          const r = seekBarRef.current.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (upEvt.clientX - r.left) / r.width));
          const finalPosMs = Math.round(ratio * meta.durationMs);
          setSeekPosMs(finalPosMs);
          if (settlingTimeoutRef.current) {
            clearTimeout(settlingTimeoutRef.current);
          }
          settlingTimeoutRef.current = setTimeout(() => {
            setSeekPosMs(null);
            settlingTimeoutRef.current = null;
          }, 500);
          const ok = await bbqCommands.mediaSeek(finalPosMs);
          if (!ok) {
            if (settlingTimeoutRef.current) {
              clearTimeout(settlingTimeoutRef.current);
              settlingTimeoutRef.current = null;
            }
            setSeekPosMs(null);
          }
        }
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [meta]
  );

  // Keyboard navigation for seek slider
  const handleSeekKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!meta || !meta.canSeek || meta.durationMs <= 0) return;

      const stepMs = 5000; // 5 second step
      let target: number | null = null;

      switch (e.key) {
        case "ArrowLeft":
        case "ArrowDown":
          target = Math.max(0, currentPosMs - stepMs);
          break;
        case "ArrowRight":
        case "ArrowUp":
          target = Math.min(meta.durationMs, currentPosMs + stepMs);
          break;
        case "Home":
          target = 0;
          break;
        case "End":
          target = meta.durationMs;
          break;
        default:
          return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (target !== null) {
        if (settlingTimeoutRef.current) {
          clearTimeout(settlingTimeoutRef.current);
        }
        setSeekPosMs(target);
        settlingTimeoutRef.current = setTimeout(() => {
          setSeekPosMs(null);
          settlingTimeoutRef.current = null;
        }, 500);
        const ok = await bbqCommands.mediaSeek(target);
        if (!ok) {
          if (settlingTimeoutRef.current) {
            clearTimeout(settlingTimeoutRef.current);
            settlingTimeoutRef.current = null;
          }
          setSeekPosMs(null);
        }
      }
    },
    [meta, currentPosMs]
  );

  // Empty / Stopped state
  if (!meta || meta.isStopped) {
    return (
      <div id="bbq-media-widget" className="bbq-expanded-media-container empty">
        <div className="bbq-media-empty-state">
          <div className="bbq-media-empty-icon-wrap" aria-hidden="true">
            <Icon name="media" size={28} />
          </div>
          <span className="bbq-media-empty-title">No Active Media</span>
          <span className="bbq-media-empty-subtitle">
            Play music or video on your system to control it from BBQ
          </span>
        </div>
      </div>
    );
  }

  const containerStyle = {
    "--bbq-media-ambient": ambientPalette.dominantRgb,
    "--bbq-media-ambient-soft": ambientPalette.ambientSoft,
    "--bbq-media-ambient-strong": ambientPalette.ambientStrong,
    "--bbq-media-ambient-border": ambientPalette.ambientBorder,
  } as React.CSSProperties;

  const durationSec = Math.floor(meta.durationMs / 1000);
  const currentSec = Math.floor(currentPosMs / 1000);

  return (
    <div
      id="bbq-media-widget"
      className="bbq-expanded-media-container"
      style={containerStyle}
      data-playing={meta.isPlaying}
    >
      {/* Ambient Internal Glow Backdrop */}
      <div className="bbq-media-ambient-wash" aria-hidden="true" />

      <div className="bbq-media-hud">
        {/* Source / App Header */}
        <div className="bbq-media-hud-header">
          <div className="bbq-media-source-tag">
            <Icon name="media" size={12} className="bbq-media-source-icon" />
            <span className="bbq-media-source-text">
              {meta.source ? meta.source.split(".").pop() || meta.source : "System Media"}
            </span>
          </div>
          {meta.isPlaying && (
            <div className="bbq-media-live-badge" title="Playing">
              <span className="bbq-media-live-dot" />
              <span>Playing</span>
            </div>
          )}
        </div>

        {/* Center: Hero Artwork + Track Information */}
        <div className="bbq-media-hero-section">
          <div className="bbq-media-art-hero">
            {meta.albumArt && !artError ? (
              <img
                src={meta.albumArt}
                alt=""
                aria-hidden="true"
                className="bbq-media-art-hero-img"
                onError={() => setArtError(true)}
              />
            ) : (
              <div className="bbq-media-art-fallback" aria-hidden="true">
                <Icon name="media" size={40} />
              </div>
            )}
          </div>

          <div className="bbq-media-track-info">
            <h3 className="bbq-media-title" title={meta.title}>
              {meta.title}
            </h3>
            <p className="bbq-media-artist" title={meta.artist}>
              {meta.artist}
            </p>
            {meta.album && (
              <p className="bbq-media-album" title={meta.album}>
                {meta.album}
              </p>
            )}
          </div>
        </div>

        {/* Bottom Section: Progress + Controls */}
        <div className="bbq-media-footer-section">
          {/* Progress / Seek Bar */}
          <div className="bbq-media-progress-container">
            <div className="bbq-media-time-labels">
              <span className="bbq-media-time-current">{formatTime(currentPosMs)}</span>
              <span className="bbq-media-time-duration">
                {meta.durationMs > 0 ? formatTime(meta.durationMs) : "--:--"}
              </span>
            </div>

            <div
              ref={seekBarRef}
              className={`bbq-media-seek-bar ${meta.canSeek ? "interactive" : "disabled"}`}
              role="slider"
              tabIndex={meta.canSeek ? 0 : -1}
              aria-label="Seek track"
              aria-valuemin={0}
              aria-valuemax={durationSec}
              aria-valuenow={currentSec}
              aria-valuetext={formatTime(currentPosMs)}
              aria-disabled={!meta.canSeek}
              onPointerDown={handlePointerDown}
              onKeyDown={handleSeekKeyDown}
            >
              <div className="bbq-media-seek-track">
                <div
                  className="bbq-media-seek-fill"
                  style={{ width: `${currentPercent}%` }}
                />
                {meta.canSeek && (
                  <div
                    className="bbq-media-seek-thumb"
                    style={{ left: `${currentPercent}%` }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="bbq-media-controls-row">
            <button
              type="button"
              className="bbq-media-ctrl-btn secondary"
              onClick={handlePrevious}
              disabled={!meta.canGoPrevious}
              aria-label="Previous track"
              title="Previous track"
            >
              <Icon name="skip-back" size={16} />
            </button>

            <button
              type="button"
              className="bbq-media-ctrl-btn primary"
              onClick={handleTogglePlayPause}
              disabled={!meta.canPlay && !meta.canPause}
              aria-label={meta.isPlaying ? "Pause" : "Play"}
              title={meta.isPlaying ? "Pause" : "Play"}
            >
              <Icon name={meta.isPlaying ? "pause" : "play"} size={20} />
            </button>

            <button
              type="button"
              className="bbq-media-ctrl-btn secondary"
              onClick={handleNext}
              disabled={!meta.canGoNext}
              aria-label="Next track"
              title="Next track"
            >
              <Icon name="skip-next" size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
