import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeMediaSession, resolveArtworkUrl } from "../src/components/widgets/mediaModel.ts";
import { APP_VERSION, APP_VERSION_LABEL } from "../src/version.ts";
import type { MediaSession } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = path.resolve(DESKTOP_DIR, "../..");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("BBQ v4.2 Regression & Quality Gates", () => {
  // =========================================================================
  // 1. Island Blur Restoration & Native Silhouette Clipping
  // =========================================================================
  describe("1. Island Blur Restoration & HWND Clipping", () => {
    it("restores native OS window backdrop effects (Acrylic/Blur on Windows, HudWindow on macOS)", () => {
      const settingsRs = fs.readFileSync(
        path.join(DESKTOP_DIR, "src-tauri/src/commands/settings.rs"),
        "utf-8"
      );
      assert.ok(
        settingsRs.includes("Effect::Acrylic") && settingsRs.includes("Effect::Blur"),
        "Windows must configure Effect::Acrylic and Effect::Blur for desktop background sampling"
      );
      assert.ok(
        settingsRs.includes("Effect::HudWindow"),
        "macOS must configure Effect::HudWindow for glass sampling"
      );
      assert.ok(
        settingsRs.includes("clip_native_window_region"),
        "apply_native_window_backdrop must invoke clip_native_window_region"
      );
      assert.ok(
        settingsRs.includes("clear_native_window_region"),
        "apply_native_window_backdrop must clear native clipping when blur is disabled"
      );
    });

    it("verifies platform crate exports clip_native_window_region and clear_native_window_region", () => {
      const platformLib = fs.readFileSync(
        path.join(ROOT_DIR, "crates/platform/src/lib.rs"),
        "utf-8"
      );
      assert.ok(
        platformLib.includes("pub use windows::{clear_native_window_region, clip_native_window_region};"),
        "crates/platform/src/lib.rs must export clip and clear window region helpers on Windows"
      );

      const windowsRs = fs.readFileSync(
        path.join(ROOT_DIR, "crates/platform/src/windows.rs"),
        "utf-8"
      );
      assert.ok(
        windowsRs.includes("pub fn clip_native_window_region"),
        "crates/platform/src/windows.rs must implement clip_native_window_region"
      );
      assert.ok(
        windowsRs.includes("CreateRoundRectRgn") && windowsRs.includes("CreateEllipticRgn"),
        "clip_native_window_region must support rounded rect and elliptic (dot) regions"
      );
      assert.ok(
        windowsRs.includes("SetWindowRgn"),
        "clip_native_window_region must apply region via SetWindowRgn"
      );
    });

    it("updates native window clipping on geometry and mode changes in island.rs", () => {
      const islandRs = fs.readFileSync(
        path.join(DESKTOP_DIR, "src-tauri/src/commands/island.rs"),
        "utf-8"
      );
      const backdropMatches = islandRs.match(/apply_native_window_backdrop/g);
      assert.ok(
        backdropMatches && backdropMatches.length >= 3,
        "island.rs must re-apply native window backdrop and clipping whenever window is resized or mode changes"
      );
    });
  });

  // =========================================================================
  // 2. Notch Mode Rounded Corners & Continuous Borders
  // =========================================================================
  describe("2. Notch Mode All-Corner Rounding & Continuous Borders", () => {
    it("ensures Notch mode has continuous 4-corner borders and no border-top: none or border-bottom: none", () => {
      const activeCss = stripComments(
        fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8")
      );

      // Verify no severed borders in Notch CSS
      assert.strictEqual(
        activeCss.includes("border-top: none;"),
        false,
        "Notch CSS must not have border-top: none; which creates cut-off borders"
      );
      assert.strictEqual(
        activeCss.includes("border-bottom: none;"),
        false,
        "Notch CSS must not have border-bottom: none; which creates cut-off borders"
      );

      // Verify 18px radius on idle notch and 24px on expanded notch
      assert.ok(
        activeCss.includes("border-radius: 18px;") && activeCss.includes("clip-path: inset(0 round 18px);"),
        "Notch mode idle must round all 4 corners with 18px radius"
      );
      assert.ok(
        activeCss.includes("border-radius: 24px;") && activeCss.includes("clip-path: inset(0 round 24px);"),
        "Notch mode expanded must round all 4 corners with 24px radius"
      );
    });
  });

  // =========================================================================
  // 3. Media Artwork Serialization & Dual Compatibility
  // =========================================================================
  describe("3. Media Artwork IPC Normalization & Rendering", () => {
    it("verifies normalizeMediaSession extracts artwork from both camelCase and snake_case payloads", () => {
      const camelSession: MediaSession = {
        id: "sess-1",
        state: "playing",
        title: "Test Track",
        artist: "Test Artist",
        album: "Test Album",
        albumArt: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        durationMs: 180000,
        positionMs: 60000,
        lastUpdatedTime: 123456789,
        volume: 1.0,
        source: "Spotify",
        capabilities: {
          canPlay: false,
          canPause: true,
          canGoNext: true,
          canGoPrevious: true,
          canSeek: true,
          canChangeVolume: true,
        },
      };

      const normalizedCamel = normalizeMediaSession(camelSession);
      assert.ok(normalizedCamel);
      assert.strictEqual(normalizedCamel.albumArt, "data:image/jpeg;base64,/9j/4AAQSkZJRg==");
      assert.strictEqual(normalizedCamel.title, "Test Track");
      assert.strictEqual(normalizedCamel.canPause, true);

      // Raw snake_case session payload (legacy / direct rust serialization)
      const snakeSession = {
        id: "sess-2",
        state: "playing",
        title: "Snake Track",
        artist: "Snake Artist",
        album: "Snake Album",
        album_art: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
        duration_ms: 240000,
        position_ms: 120000,
        last_updated_time: 987654321,
        capabilities: {
          can_play: false,
          can_pause: true,
          can_go_next: true,
          can_go_previous: false,
        },
      } as unknown as MediaSession;

      const normalizedSnake = normalizeMediaSession(snakeSession);
      assert.ok(normalizedSnake);
      assert.strictEqual(normalizedSnake.albumArt, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==");
      assert.strictEqual(normalizedSnake.durationMs, 240000);
      assert.strictEqual(normalizedSnake.positionMs, 120000);
      assert.strictEqual(normalizedSnake.canPause, true);
      assert.strictEqual(normalizedSnake.canGoNext, true);
      assert.strictEqual(normalizedSnake.canGoPrevious, false);
    });

    it("verifies resolveArtworkUrl handles data URIs across PNG, JPEG, WEBP, GIF, and BMP", () => {
      const pngData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
      const jpegData = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
      const webpData = "data:image/webp;base64,UklGRmYAAABXRUJQVlA4==";
      const gifData = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      const bmpData = "data:image/bmp;base64,Qk02AAAAAAAAADYAAAAoAAAA";

      assert.strictEqual(resolveArtworkUrl(pngData), pngData);
      assert.strictEqual(resolveArtworkUrl(jpegData), jpegData);
      assert.strictEqual(resolveArtworkUrl(webpData), webpData);
      assert.strictEqual(resolveArtworkUrl(gifData), gifData);
      assert.strictEqual(resolveArtworkUrl(bmpData), bmpData);

      // Rejects dangerous / invalid
      assert.strictEqual(resolveArtworkUrl("javascript:alert(1)"), null);
      assert.strictEqual(resolveArtworkUrl("data:text/html;base64,PHNjcmlwdD4="), null);
      assert.strictEqual(resolveArtworkUrl(""), null);
      assert.strictEqual(resolveArtworkUrl(null), null);
    });

    it("verifies CompactMediaIndicator defensively accesses albumArt with album_art fallback", () => {
      const compactSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/CompactIndicators.tsx"),
        "utf-8"
      );
      assert.ok(
        compactSrc.includes("albumArt") && compactSrc.includes("album_art"),
        "CompactIndicators must read albumArt with album_art fallback"
      );
    });

    it("verifies Rust MediaSession in bbq-core specifies rename_all = camelCase and alias for dual-compatibility", () => {
      const coreMediaRs = fs.readFileSync(
        path.join(ROOT_DIR, "crates/core/src/media.rs"),
        "utf-8"
      );
      assert.ok(
        coreMediaRs.includes('#[serde(rename_all = "camelCase", default)]'),
        "MediaSession and MediaCapabilities must use camelCase serde serialization"
      );
      assert.ok(
        coreMediaRs.includes('#[serde(alias = "album_art")]'),
        "MediaSession must include serde alias for album_art"
      );
      assert.ok(
        coreMediaRs.includes('#[serde(alias = "duration_ms")]'),
        "MediaSession must include serde alias for duration_ms"
      );
    });
  });

  // =========================================================================
  // 4. Version Hygiene & Release State
  // =========================================================================
  describe("4. Version Hygiene & Release State", () => {
    it("preserves stable version manifests strictly aligned with v4.2 release", () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
      const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8"));
      const typesPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "packages/types/package.json"), "utf-8"));
      const tauriConf = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8"));
      const desktopCargo = fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/Cargo.toml"), "utf-8");
      const cargoLock = fs.readFileSync(path.join(ROOT_DIR, "Cargo.lock"), "utf-8");

      assert.strictEqual(rootPkg.version, "4.2", "Root package.json version must be 4.2");
      assert.strictEqual(desktopPkg.version, "4.2", "Desktop package.json version must be 4.2");
      assert.strictEqual(typesPkg.version, "4.2", "Types package.json version must be 4.2");
      assert.strictEqual(APP_VERSION, "4.2", "APP_VERSION must be 4.2");
      assert.strictEqual(APP_VERSION_LABEL, "v4.2", "APP_VERSION_LABEL must be v4.2");

      assert.strictEqual(tauriConf.version, "4.2.0", "tauri.conf.json version must be 4.2.0");
      assert.ok(desktopCargo.includes('version = "4.2.0"'), "Cargo.toml must declare version = 4.2.0");
      assert.ok(
        cargoLock.includes('name = "bbq-desktop"\nversion = "4.2.0"') ||
        cargoLock.includes('name = "bbq-desktop"\r\nversion = "4.2.0"'),
        "Cargo.lock must resolve bbq-desktop to 4.2.0"
      );
    });
  });
});
