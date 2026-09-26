/**
 * BBQ v1.3 - Milestone 4: Media Presentation & Ambient Model
 * Pure, deterministic logic for media metadata normalization, progress calculation,
 * time formatting, and bounded ambient color extraction.
 *
 * Strict Project Invariants:
 * - NO setInterval / setTimeout loops
 * - NO requestAnimationFrame loops
 * - Bounded caches (memory-leak proof)
 * - Safe numeric handling (zero division, NaN, Infinity)
 */

import type { MediaSession, PlaybackState } from "@bbq/types";

export interface NormalizedMediaMetadata {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  albumArt: string | null;
  source: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  isStopped: boolean;
  state: PlaybackState;
  durationMs: number;
  positionMs: number;
  lastUpdatedTime: number | null;
  progressPercent: number;
  canPlay: boolean;
  canPause: boolean;
  canGoNext: boolean;
  canGoPrevious: boolean;
  canSeek: boolean;
}

export interface AmbientPalette {
  dominantRgb: string; // "r, g, b"
  ambientSoft: string; // "rgba(r, g, b, 0.2)"
  ambientStrong: string; // "rgba(r, g, b, 0.45)"
  ambientBorder: string; // "rgba(r, g, b, 0.25)"
}

export const DEFAULT_AMBIENT_PALETTE: AmbientPalette = {
  dominantRgb: "59, 130, 246",
  ambientSoft: "rgba(59, 130, 246, 0.18)",
  ambientStrong: "rgba(59, 130, 246, 0.40)",
  ambientBorder: "rgba(59, 130, 246, 0.25)",
};

/**
 * Normalizes a raw MediaSession object into a sanitized, display-ready model.
 */
export function normalizeMediaSession(
  session: MediaSession | null | undefined
): NormalizedMediaMetadata | null {
  if (!session) return null;

  const rawTitle = session.title?.trim();
  const rawArtist = session.artist?.trim();
  const rawAlbum = session.album?.trim();
  const rawSource = session.source?.trim();

  const title = rawTitle && rawTitle.length > 0 ? rawTitle : "Unknown Track";
  const artist = rawArtist && rawArtist.length > 0 ? rawArtist : "Unknown Artist";
  const album = rawAlbum && rawAlbum.length > 0 ? rawAlbum : null;
  const source = rawSource && rawSource.length > 0 ? rawSource : null;

  const rawDuration = typeof session.durationMs === "number" ? session.durationMs : 0;
  const rawPosition = typeof session.positionMs === "number" ? session.positionMs : 0;
  const rawLastUpdated =
    typeof session.lastUpdatedTime === "number" && Number.isFinite(session.lastUpdatedTime)
      ? session.lastUpdatedTime
      : null;

  const durationMs = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.floor(rawDuration) : 0;
  const positionMs = clampPosition(rawPosition, durationMs);
  const progressPercent = calculateProgressPercent(positionMs, durationMs);

  const state = session.state ?? "unknown";
  const isPlaying = state === "playing";
  const isPaused = state === "paused";
  const isStopped = state === "stopped";

  const caps = session.capabilities ?? {
    canPlay: false,
    canPause: false,
    canGoNext: false,
    canGoPrevious: false,
    canSeek: false,
    canChangeVolume: false,
  };

  return {
    id: session.id || "media-session",
    title,
    artist,
    album,
    albumArt: session.albumArt?.trim() || null,
    source,
    isPlaying,
    isPaused,
    isStopped,
    state,
    durationMs,
    positionMs,
    lastUpdatedTime: rawLastUpdated,
    progressPercent,
    canPlay: caps.canPlay ?? false,
    canPause: caps.canPause ?? false,
    canGoNext: caps.canGoNext ?? false,
    canGoPrevious: caps.canGoPrevious ?? false,
    canSeek: (caps.canSeek ?? false) && durationMs > 0,
  };
}

/**
 * Calculates current interpolated position from monotonic elapsed time.
 * Clamps strictly within [0, durationMs].
 */
export function calculateInterpolatedPosition(
  meta: NormalizedMediaMetadata | null,
  now = Date.now()
): number {
  if (!meta) return 0;
  if (!meta.isPlaying || meta.durationMs <= 0) {
    return clampPosition(meta.positionMs, meta.durationMs);
  }
  const baseTime = meta.lastUpdatedTime ?? now;
  const elapsed = Math.max(0, now - baseTime);
  return clampPosition(meta.positionMs + elapsed, meta.durationMs);
}

/**
 * Safely clamps position within [0, durationMs].
 */
export function clampPosition(positionMs: number, durationMs: number): number {
  if (!Number.isFinite(positionMs) || positionMs < 0) return 0;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.min(Math.floor(positionMs), durationMs);
}

/**
 * Calculates progress percentage [0, 100], strictly guarding against division by zero and NaN.
 */
export function calculateProgressPercent(positionMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  if (!Number.isFinite(positionMs) || positionMs <= 0) return 0;
  const pct = (positionMs / durationMs) * 100;
  return Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
}

/**
 * Formats a duration in milliseconds to "M:SS" or "H:MM:SS".
 */
export function formatTime(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`;

  if (hours > 0) {
    const paddedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

/**
 * Constructs an AmbientPalette from an RGB tuple.
 */
export function createAmbientPalette(r: number, g: number, b: number): AmbientPalette {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const cr = clamp(r);
  const cg = clamp(g);
  const cb = clamp(b);
  const rgb = `${cr}, ${cg}, ${cb}`;

  return {
    dominantRgb: rgb,
    ambientSoft: `rgba(${rgb}, 0.20)`,
    ambientStrong: `rgba(${rgb}, 0.45)`,
    ambientBorder: `rgba(${rgb}, 0.28)`,
  };
}

/**
 * Bounded ambient color cache to prevent memory leaks.
 * Maximum 16 entries with FIFO/LRU eviction.
 */
const MAX_AMBIENT_CACHE_ENTRIES = 16;
const ambientCache = new Map<string, AmbientPalette>();

export function clearAmbientCache(): void {
  ambientCache.clear();
}

export function getCachedAmbientPalette(artUrl: string): AmbientPalette | undefined {
  return ambientCache.get(artUrl);
}

export function setCachedAmbientPalette(artUrl: string, palette: AmbientPalette): void {
  if (ambientCache.size >= MAX_AMBIENT_CACHE_ENTRIES) {
    // Evict oldest entry
    const firstKey = ambientCache.keys().next().value;
    if (firstKey) {
      ambientCache.delete(firstKey);
    }
  }
  ambientCache.set(artUrl, palette);
}

/**
 * Extracts dominant color from an image URL using downsampled canvas sampling (16x16).
 * Safe for both browser and headless/test environments.
 */
export async function extractAmbientColor(
  imageUrl: string | null | undefined
): Promise<AmbientPalette> {
  if (!imageUrl || typeof imageUrl !== "string" || imageUrl.trim().length === 0) {
    return DEFAULT_AMBIENT_PALETTE;
  }

  const cached = getCachedAmbientPalette(imageUrl);
  if (cached) return cached;

  // In non-browser environments or when Image/document is unavailable, return deterministic default
  if (typeof window === "undefined" || typeof document === "undefined") {
    return DEFAULT_AMBIENT_PALETTE;
  }

  return new Promise<AmbientPalette>((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "Anonymous";

      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
      };

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            cleanup();
            resolve(DEFAULT_AMBIENT_PALETTE);
            return;
          }

          // Sample at 16x16 for minimal CPU/memory footprint
          const sampleSize = 16;
          canvas.width = sampleSize;
          canvas.height = sampleSize;
          ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

          const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
          const data = imageData.data;

          let rTotal = 0;
          let gTotal = 0;
          let bTotal = 0;
          let countedPixels = 0;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a < 128) continue; // Skip transparent pixels

            // Exclude near-black and near-white extremes to keep vibrant dominant tint
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            if (brightness < 20 || brightness > 240) continue;

            rTotal += r;
            gTotal += g;
            bTotal += b;
            countedPixels++;
          }

          let palette: AmbientPalette;
          if (countedPixels > 0) {
            palette = createAmbientPalette(
              rTotal / countedPixels,
              gTotal / countedPixels,
              bTotal / countedPixels
            );
          } else {
            palette = DEFAULT_AMBIENT_PALETTE;
          }

          setCachedAmbientPalette(imageUrl, palette);
          cleanup();
          resolve(palette);
        } catch {
          cleanup();
          resolve(DEFAULT_AMBIENT_PALETTE);
        }
      };

      img.onerror = () => {
        cleanup();
        resolve(DEFAULT_AMBIENT_PALETTE);
      };

      img.src = imageUrl;
    } catch {
      resolve(DEFAULT_AMBIENT_PALETTE);
    }
  });
}
