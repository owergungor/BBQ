import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeMediaSession,
  clampPosition,
  calculateProgressPercent,
  calculateInterpolatedPosition,
  formatTime,
  createAmbientPalette,
  DEFAULT_AMBIENT_PALETTE,
  setCachedAmbientPalette,
  getCachedAmbientPalette,
  clearAmbientCache,
  extractAmbientColor,
} from "../src/components/widgets/mediaModel.ts";
import type { MediaSession } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ v1.3 - Milestone 4: Media Presentation & Ambient Glow", () => {
  describe("MEDIA_MODEL Normalization & Safety", () => {
    it("returns null for null or undefined session", () => {
      assert.strictEqual(normalizeMediaSession(null), null);
      assert.strictEqual(normalizeMediaSession(undefined), null);
    });

    it("normalizes a complete active media session accurately", () => {
      const session: MediaSession = {
        id: "spotify-session-1",
        state: "playing",
        title: "Starlight",
        artist: "Muse",
        album: "Black Holes and Revelations",
        albumArt: "https://example.com/art.jpg",
        durationMs: 240000,
        positionMs: 60000,
        volume: 0.8,
        source: "Spotify.exe",
        capabilities: {
          canPlay: true,
          canPause: true,
          canGoNext: true,
          canGoPrevious: true,
          canSeek: true,
          canChangeVolume: false,
        },
      };

      const meta = normalizeMediaSession(session);
      assert.ok(meta);
      assert.strictEqual(meta.id, "spotify-session-1");
      assert.strictEqual(meta.title, "Starlight");
      assert.strictEqual(meta.artist, "Muse");
      assert.strictEqual(meta.album, "Black Holes and Revelations");
      assert.strictEqual(meta.albumArt, "https://example.com/art.jpg");
      assert.strictEqual(meta.source, "Spotify.exe");
      assert.strictEqual(meta.isPlaying, true);
      assert.strictEqual(meta.isPaused, false);
      assert.strictEqual(meta.isStopped, false);
      assert.strictEqual(meta.durationMs, 240000);
      assert.strictEqual(meta.positionMs, 60000);
      assert.strictEqual(meta.progressPercent, 25);
      assert.strictEqual(meta.canPlay, true);
      assert.strictEqual(meta.canPause, true);
      assert.strictEqual(meta.canGoNext, true);
      assert.strictEqual(meta.canGoPrevious, true);
      assert.strictEqual(meta.canSeek, true);
    });

    it("handles missing or whitespace title/artist gracefully with fallbacks", () => {
      const session: MediaSession = {
        id: "",
        state: "paused",
        title: "   ",
        artist: "",
        album: "  ",
        albumArt: undefined,
        durationMs: 0,
        positionMs: 0,
        volume: null,
        source: null,
        capabilities: {
          canPlay: true,
          canPause: false,
          canGoNext: false,
          canGoPrevious: false,
          canSeek: false,
          canChangeVolume: false,
        },
      };

      const meta = normalizeMediaSession(session);
      assert.ok(meta);
      assert.strictEqual(meta.title, "Unknown Track");
      assert.strictEqual(meta.artist, "Unknown Artist");
      assert.strictEqual(meta.album, null);
      assert.strictEqual(meta.albumArt, null);
      assert.strictEqual(meta.isPaused, true);
      assert.strictEqual(meta.isPlaying, false);
    });

    it("clamps positionMs to [0, durationMs] and guards against negative/infinite values", () => {
      assert.strictEqual(clampPosition(-100, 200000), 0);
      assert.strictEqual(clampPosition(50000, 200000), 50000);
      assert.strictEqual(clampPosition(250000, 200000), 200000);
      assert.strictEqual(clampPosition(NaN, 200000), 0);
      assert.strictEqual(clampPosition(50000, 0), 0);
      assert.strictEqual(clampPosition(50000, -1000), 0);
      assert.strictEqual(clampPosition(Infinity, 200000), 0);
    });

    it("calculates progress percentage with strict zero-division guards", () => {
      assert.strictEqual(calculateProgressPercent(0, 0), 0);
      assert.strictEqual(calculateProgressPercent(500, 0), 0);
      assert.strictEqual(calculateProgressPercent(0, 10000), 0);
      assert.strictEqual(calculateProgressPercent(5000, 10000), 50);
      assert.strictEqual(calculateProgressPercent(10000, 10000), 100);
      assert.strictEqual(calculateProgressPercent(15000, 10000), 100);
      assert.strictEqual(calculateProgressPercent(-500, 10000), 0);
      assert.strictEqual(calculateProgressPercent(NaN, 10000), 0);
      assert.strictEqual(calculateProgressPercent(5000, NaN), 0);
    });

    it("formats duration/position correctly for diverse time ranges", () => {
      assert.strictEqual(formatTime(null), "0:00");
      assert.strictEqual(formatTime(undefined), "0:00");
      assert.strictEqual(formatTime(-500), "0:00");
      assert.strictEqual(formatTime(0), "0:00");
      assert.strictEqual(formatTime(9000), "0:09");
      assert.strictEqual(formatTime(65000), "1:05");
      assert.strictEqual(formatTime(245000), "4:05");
      assert.strictEqual(formatTime(3600000), "1:00:00");
      assert.strictEqual(formatTime(3665000), "1:01:05");
    });
  });

  describe("PHASE 3: Media Timeline Model & Monotonic Progress", () => {
    it("handles startup state gracefully with 0ms position", () => {
      assert.strictEqual(calculateInterpolatedPosition(null), 0);
      const emptyMeta = normalizeMediaSession({
        id: "idle",
        state: "stopped",
        title: "",
        artist: "",
        album: "",
        albumArt: null,
        durationMs: 0,
        positionMs: 0,
        volume: 1,
        source: null,
        capabilities: {
          canPlay: false,
          canPause: false,
          canGoNext: false,
          canGoPrevious: false,
          canSeek: false,
          canChangeVolume: false,
        },
      });
      assert.strictEqual(calculateInterpolatedPosition(emptyMeta), 0);
    });

    it("interpolates monotonic elapsed time accurately while playing", () => {
      const baseTime = 1700000000000;
      const meta = normalizeMediaSession({
        id: "spotify-1",
        state: "playing",
        title: "Song",
        artist: "Artist",
        durationMs: 180000,
        positionMs: 30000,
        lastUpdatedTime: baseTime,
      });

      // Exactly at baseTime: 30,000ms
      assert.strictEqual(calculateInterpolatedPosition(meta, baseTime), 30000);

      // 5,000ms later: 35,000ms
      assert.strictEqual(calculateInterpolatedPosition(meta, baseTime + 5000), 35000);

      // 120,000ms later: 150,000ms
      assert.strictEqual(calculateInterpolatedPosition(meta, baseTime + 120000), 150000);
    });

    it("freezes monotonic interpolation when paused", () => {
      const baseTime = 1700000000000;
      const meta = normalizeMediaSession({
        id: "spotify-1",
        state: "paused",
        title: "Song",
        artist: "Artist",
        durationMs: 180000,
        positionMs: 42000,
        lastUpdatedTime: baseTime,
      });

      // Even when Date.now() advances by 10s, paused state stays strictly at 42,000ms
      assert.strictEqual(calculateInterpolatedPosition(meta, baseTime + 10000), 42000);
      assert.strictEqual(calculateInterpolatedPosition(meta, baseTime + 60000), 42000);
    });

    it("clamps position to durationMs on short tracks without overflowing", () => {
      const baseTime = 1700000000000;
      const meta = normalizeMediaSession({
        id: "short-clip",
        state: "playing",
        title: "Short Jingle",
        artist: "Artist",
        durationMs: 15000, // 15 second track
        positionMs: 10000,
        lastUpdatedTime: baseTime,
      });

      // 3s later: 13,000ms
      assert.strictEqual(calculateInterpolatedPosition(meta, baseTime + 3000), 13000);

      // 10s later (would be 20,000ms): clamped strictly to 15,000ms
      assert.strictEqual(calculateInterpolatedPosition(meta, baseTime + 10000), 15000);
    });

    it("correctly handles long tracks (2-hour podcast) and boundary formatting", () => {
      const baseTime = 1700000000000;
      const durationMs = 2 * 3600 * 1000; // 7,200,000ms
      const meta = normalizeMediaSession({
        id: "podcast-ep1",
        state: "playing",
        title: "Long Podcast",
        artist: "Host",
        durationMs,
        positionMs: 3600 * 1000, // 1 hour in
        lastUpdatedTime: baseTime,
      });

      assert.strictEqual(formatTime(meta?.durationMs), "2:00:00");
      assert.strictEqual(formatTime(meta?.positionMs), "1:00:00");

      // 30 minutes later
      const advanced = calculateInterpolatedPosition(meta, baseTime + 1800 * 1000);
      assert.strictEqual(advanced, 5400000);
      assert.strictEqual(formatTime(advanced), "1:30:00");

      // Progress percent at 1h 30m of 2h = 75%
      assert.strictEqual(calculateProgressPercent(advanced, durationMs), 75);
    });

    it("resets position and rebases timeline on track change", () => {
      const baseTime = 1700000000000;
      // Track 1
      const track1 = normalizeMediaSession({
        id: "spotify-1",
        state: "playing",
        title: "Track 1",
        durationMs: 200000,
        positionMs: 180000,
        lastUpdatedTime: baseTime,
      });
      assert.strictEqual(calculateInterpolatedPosition(track1, baseTime), 180000);

      // Track 2 metadata arrives with position 0
      const track2Time = baseTime + 20000;
      const track2 = normalizeMediaSession({
        id: "spotify-1",
        state: "playing",
        title: "Track 2",
        durationMs: 240000,
        positionMs: 0,
        lastUpdatedTime: track2Time,
      });

      assert.strictEqual(track2?.positionMs, 0);
      assert.strictEqual(calculateInterpolatedPosition(track2, track2Time), 0);
      assert.strictEqual(calculateInterpolatedPosition(track2, track2Time + 2000), 2000);
    });
  });

  describe("AMBIENT_GLOW & Palette Derivation", () => {
    it("creates a correctly formatted AmbientPalette from RGB numbers", () => {
      const palette = createAmbientPalette(42, 128, 255);
      assert.strictEqual(palette.dominantRgb, "42, 128, 255");
      assert.strictEqual(palette.ambientSoft, "rgba(42, 128, 255, 0.20)");
      assert.strictEqual(palette.ambientStrong, "rgba(42, 128, 255, 0.45)");
      assert.strictEqual(palette.ambientBorder, "rgba(42, 128, 255, 0.28)");
    });

    it("clamps RGB values when creating AmbientPalette", () => {
      const palette = createAmbientPalette(-50, 300, 120.4);
      assert.strictEqual(palette.dominantRgb, "0, 255, 120");
    });

    it("provides deterministic default palette when artwork is missing", async () => {
      const p1 = await extractAmbientColor(null);
      const p2 = await extractAmbientColor("");
      const p3 = await extractAmbientColor("   ");

      assert.deepStrictEqual(p1, DEFAULT_AMBIENT_PALETTE);
      assert.deepStrictEqual(p2, DEFAULT_AMBIENT_PALETTE);
      assert.deepStrictEqual(p3, DEFAULT_AMBIENT_PALETTE);
    });

    it("maintains a bounded ambient cache with LRU/FIFO eviction (max 16 entries)", () => {
      clearAmbientCache();

      for (let i = 0; i < 20; i++) {
        const url = `https://example.com/art_${i}.jpg`;
        setCachedAmbientPalette(url, createAmbientPalette(i * 10, i * 10, i * 10));
      }

      // Oldest entries (0, 1, 2, 3) must have been evicted to maintain max 16 items
      assert.strictEqual(getCachedAmbientPalette("https://example.com/art_0.jpg"), undefined);
      assert.strictEqual(getCachedAmbientPalette("https://example.com/art_1.jpg"), undefined);
      assert.strictEqual(getCachedAmbientPalette("https://example.com/art_2.jpg"), undefined);
      assert.strictEqual(getCachedAmbientPalette("https://example.com/art_3.jpg"), undefined);

      // Newer entries must be present
      assert.ok(getCachedAmbientPalette("https://example.com/art_19.jpg"));
      assert.ok(getCachedAmbientPalette("https://example.com/art_10.jpg"));

      clearAmbientCache();
      assert.strictEqual(getCachedAmbientPalette("https://example.com/art_19.jpg"), undefined);
    });
  });

  describe("STATIC_AUDIT & INVARIANT VERIFICATION", () => {
    const mediaWidgetPath = path.resolve(__dirname, "../src/components/widgets/MediaWidget.tsx");
    const compactIndicatorsPath = path.resolve(__dirname, "../src/components/island/CompactIndicators.tsx");
    const mediaModelPath = path.resolve(__dirname, "../src/components/widgets/mediaModel.ts");
    const mediaStatePath = path.resolve(__dirname, "../src/state/mediaState.ts");
    const indexCssPath = path.resolve(__dirname, "../src/styles/index.css");

    it("ensures ZERO setInterval in media presentation & model code", () => {
      const files = [mediaWidgetPath, compactIndicatorsPath, mediaModelPath, mediaStatePath];
      for (const f of files) {
        const content = fs.readFileSync(f, "utf8");
        assert.doesNotMatch(content, /setInterval\s*\(/, `Forbidden setInterval found in ${path.basename(f)}`);
      }
    });

    it("ensures ZERO requestAnimationFrame polling loops in media code", () => {
      const files = [mediaWidgetPath, compactIndicatorsPath, mediaModelPath, mediaStatePath];
      for (const f of files) {
        const content = fs.readFileSync(f, "utf8");
        assert.doesNotMatch(content, /requestAnimationFrame\s*\(/, `Forbidden requestAnimationFrame found in ${path.basename(f)}`);
      }
    });

    it("ensures ZERO emoji icons in MediaWidget and CompactMediaIndicator", () => {
      const mediaWidgetContent = fs.readFileSync(mediaWidgetPath, "utf8");
      // Verify no emoji like 🎵, ◀, ▶, ❚❚, ⏮, ⏭, ⏸
      assert.doesNotMatch(mediaWidgetContent, /[🎵◀▶❚⏮⏭⏸]/, "Forbidden emoji found in MediaWidget.tsx");

      const compactContent = fs.readFileSync(compactIndicatorsPath, "utf8");
      // Specifically check CompactMediaIndicator section
      const mediaIndicatorMatch = compactContent.match(/export const CompactMediaIndicator[\s\S]*?^};/m);
      assert.ok(mediaIndicatorMatch, "CompactMediaIndicator must exist");
      assert.doesNotMatch(mediaIndicatorMatch[0], /[🎵◀▶❚⏮⏭⏸]/, "Forbidden emoji found in CompactMediaIndicator");
    });

    it("ensures ZERO filter: drop-shadow in expanded media CSS (zero-halo invariant)", () => {
      const cssContent = fs.readFileSync(indexCssPath, "utf8");
      const mediaCssMatch = cssContent.match(/\.bbq-expanded-media-container[\s\S]*?\.bbq-media-empty-subtitle/);
      assert.ok(mediaCssMatch, "Expanded media CSS block must exist");
      assert.doesNotMatch(mediaCssMatch[0], /drop-shadow/, "Forbidden drop-shadow found in expanded media CSS");
      assert.match(mediaCssMatch[0], /box-shadow:\s*none/, "Outer box-shadow must be strictly none");
    });

    it("ensures prefers-reduced-motion overrides exist for media transitions", () => {
      const cssContent = fs.readFileSync(indexCssPath, "utf8");
      assert.match(cssContent, /prefers-reduced-motion[\s\S]*?\.bbq-media-ambient-wash/, "Reduced motion rule must exist for media");
      assert.match(cssContent, /data-reduced-motion="true"[\s\S]*?\.bbq-media-ambient-wash/, "data-reduced-motion rule must exist for media");
    });

    it("ensures media seek settling timeout and optimistic position latching", () => {
      const mediaWidgetContent = fs.readFileSync(mediaWidgetPath, "utf8");
      
      // Settling timeout ref exists
      assert.match(mediaWidgetContent, /settlingTimeoutRef\s*=\s*useRef/, "settlingTimeoutRef must be declared");
      
      // One-shot settling timeout duration is ~500ms
      assert.match(mediaWidgetContent, /setTimeout\s*\([^,]+,\s*500\)/, "Settling timeout must be 500ms bounded");

      // Backend proximity settling within 1500ms threshold
      assert.match(mediaWidgetContent, /Math\.abs\(\s*meta\.positionMs\s*-\s*seekPosMs\s*\)\s*<=\s*1500/, "Backend proximity settling check must be <= 1500ms");

      // Timeout cleared on unmount
      assert.match(mediaWidgetContent, /clearTimeout\(\s*settlingTimeoutRef\.current\s*\)/, "settlingTimeoutRef must be cleared on unmount/re-seek");

      // Zero recursive setTimeout, zero setInterval, zero rAF
      assert.doesNotMatch(mediaWidgetContent, /setInterval/, "No setInterval allowed in MediaWidget");
      assert.doesNotMatch(mediaWidgetContent, /requestAnimationFrame/, "No rAF allowed in MediaWidget");
    });
  });
});
