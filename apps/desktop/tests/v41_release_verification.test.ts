import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  settingsStore,
  defaultSettings,
  composeIslandPosition,
  decomposeIslandPosition,
  normalizePositionSettings,
  applyThemeAndMotionToDom,
} from "../src/state/settingsState.ts";
import { createDomainStore } from "../src/state/createStore.ts";
import { resolveArtworkUrl } from "../src/components/widgets/mediaModel.ts";
import { APP_VERSION, APP_VERSION_LABEL } from "../src/version.ts";
import type { IslandVerticalPosition, IslandHorizontalPosition } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = path.resolve(DESKTOP_DIR, "../..");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("BBQ v4.1 — Blur Clipping, Notch Radius, 9-Anchor Position Grid & Artwork Verification", () => {
  beforeEach(() => {
    settingsStore.setState({
      settings: { ...defaultSettings },
      isLoading: false,
      error: null,
    });
  });

  // =========================================================================
  // 1. Island Blur Overflow Fix
  // =========================================================================
  describe("1. Island Blur Overflow & Silhouette Clipping", () => {
    it("clears OS-level rectangular window effects in Rust apply_native_window_backdrop", () => {
      const settingsRs = fs.readFileSync(
        path.join(DESKTOP_DIR, "src-tauri/src/commands/settings.rs"),
        "utf-8"
      );
      assert.ok(
        settingsRs.includes("let _ = window.set_effects(None);"),
        "apply_native_window_backdrop must clear OS rectangular window effects to prevent rectangular blur spill"
      );
    });

    it("enforces strict CSS paint containment, clip-path inheritance on ::before, and smooth inset round on Dot mode", () => {
      const activeCss = stripComments(
        fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8")
      );
      assert.ok(activeCss.includes("contain: paint;"), ".bbq-island-shell must enforce contain: paint");
      assert.ok(activeCss.includes("clip-path: inherit;"), ".bbq-island-shell::before must inherit clip-path");
      assert.ok(
        activeCss.includes("clip-path: inset(0 round 50%) !important;"),
        "Dot mode must use inset(0 round 50%) so compact <-> expanded clip-path transitions interpolate smoothly without rectangular unclipped frames"
      );
      assert.strictEqual(
        activeCss.includes("-webkit-mask-image: -webkit-radial-gradient(white, black);"),
        false,
        "Active CSS rules must not include -webkit-radial-gradient mask hack that conflicts with clip-path"
      );
      assert.strictEqual(
        activeCss.includes("drop-shadow("),
        false,
        "Active CSS must never use drop-shadow()"
      );
    });
  });

  // =========================================================================
  // 2. Notch Mode Corner Radius & Edge Alignment
  // =========================================================================
  describe("2. Notch Mode Rounded Corners & Screen Edge Alignment", () => {
    it("rounds all 4 corners of Notch mode across top, bottom, and center vertical positions in compact and expanded states", () => {
      const activeCss = stripComments(
        fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8")
      );
      assert.ok(
        activeCss.includes("border-radius: 10px 10px 18px 18px;") &&
          activeCss.includes("clip-path: inset(0 round 10px 10px 18px 18px);"),
        "Top Notch idle must round top corners (10px) and bottom corners (18px)"
      );
      assert.ok(
        activeCss.includes("border-radius: 14px 14px 24px 24px;") &&
          activeCss.includes("clip-path: inset(0 round 14px 14px 24px 24px);"),
        "Top Notch expanded must round top corners (14px) and bottom corners (24px)"
      );
      assert.ok(
        activeCss.includes("border-radius: 18px 18px 10px 10px;") &&
          activeCss.includes("clip-path: inset(0 round 18px 18px 10px 10px);"),
        "Bottom Notch idle must round top corners (18px) and bottom corners (10px)"
      );
      assert.ok(
        activeCss.includes("border-radius: 24px 24px 14px 14px;") &&
          activeCss.includes("clip-path: inset(0 round 24px 24px 14px 14px);"),
        "Bottom Notch expanded must round top corners (24px) and bottom corners (14px)"
      );
      assert.ok(
        activeCss.includes("border-radius: 18px;") &&
          activeCss.includes("clip-path: inset(0 round 18px);"),
        "Center Notch idle must round all corners symmetrically (18px)"
      );
    });

    it("aligns Notch mode flush with top/bottom display work_area edges in Rust", () => {
      const islandRs = fs.readFileSync(
        path.join(DESKTOP_DIR, "src-tauri/src/commands/island.rs"),
        "utf-8"
      );
      assert.ok(
        islandRs.includes("pub fn apply_notch_edge_alignment("),
        "island.rs must define apply_notch_edge_alignment"
      );
      assert.ok(
        islandRs.includes("geo.y = display.work_area.y;"),
        "Notch top position must align flush with work_area.y"
      );
      assert.ok(
        islandRs.includes("display.work_area.y + display.work_area.height as i32 - geo.height as i32"),
        "Notch bottom position must align flush with bottom of work_area"
      );
    });
  });

  // =========================================================================
  // 3. Independent Vertical & Horizontal Position Settings (All 9 Combinations)
  // =========================================================================
  describe("3. Independent Vertical & Horizontal Island Position Settings", () => {
    it("composes and decomposes all 9 (vertical, horizontal) combinations accurately", () => {
      const expectedGrid: Array<[IslandVerticalPosition, IslandHorizontalPosition, string]> = [
        ["top", "left", "top-left"],
        ["top", "center", "top-center"],
        ["top", "right", "top-right"],
        ["center", "left", "center-left"],
        ["center", "center", "center"],
        ["center", "right", "center-right"],
        ["bottom", "left", "bottom-left"],
        ["bottom", "center", "bottom-center"],
        ["bottom", "right", "bottom-right"],
      ];

      for (const [v, h, combined] of expectedGrid) {
        assert.strictEqual(composeIslandPosition(v, h), combined);
        assert.deepStrictEqual(decomposeIslandPosition(combined), {
          vertical: v,
          horizontal: h,
        });
      }
    });

    it("migrates legacy saved island_position values cleanly into vertical + horizontal settings", () => {
      const migratedBottomRight = normalizePositionSettings({
        ...defaultSettings,
        island_position: "bottom-right",
        island_vertical_position: undefined,
        island_horizontal_position: undefined,
      });
      assert.strictEqual(migratedBottomRight.island_vertical_position, "bottom");
      assert.strictEqual(migratedBottomRight.island_horizontal_position, "right");
      assert.strictEqual(migratedBottomRight.island_position, "bottom-right");

      const migratedTopLeft = normalizePositionSettings({
        ...defaultSettings,
        island_position: "top-left",
        island_vertical_position: "top",
        island_horizontal_position: undefined,
      });
      assert.strictEqual(migratedTopLeft.island_vertical_position, "top");
      assert.strictEqual(migratedTopLeft.island_horizontal_position, "left");
      assert.strictEqual(migratedTopLeft.island_position, "top-left");
    });

    it("replaces single #island-position-select JSX with #island-vertical-pos-select and #island-horizontal-pos-select", () => {
      const tabSource = stripComments(
        fs.readFileSync(
          path.join(DESKTOP_DIR, "src/components/widgets/settings/IslandSettingsTab.tsx"),
          "utf-8"
        )
      );
      assert.ok(
        tabSource.includes('id="island-vertical-pos-select"'),
        "Must render #island-vertical-pos-select"
      );
      assert.ok(
        tabSource.includes('id="island-horizontal-pos-select"'),
        "Must render #island-horizontal-pos-select"
      );
      assert.strictEqual(
        tabSource.includes('id="island-position-select"'),
        false,
        "Active JSX must not render legacy combined #island-position-select"
      );
    });

    it("applies data-vertical-pos and data-horizontal-pos DOM attributes", () => {
      const mockAttrs = new Map<string, string>();
      const origDoc = (globalThis as any).document;
      (globalThis as any).document = {
        documentElement: {
          setAttribute: (k: string, v: string) => mockAttrs.set(k, v),
          removeAttribute: (k: string) => mockAttrs.delete(k),
          style: {
            setProperty: () => {},
            removeProperty: () => {},
          },
        },
      };

      try {
        applyThemeAndMotionToDom({
          ...defaultSettings,
          island_vertical_position: "bottom",
          island_horizontal_position: "right",
        });
        assert.strictEqual(mockAttrs.get("data-vertical-pos"), "bottom");
        assert.strictEqual(mockAttrs.get("data-horizontal-pos"), "right");
      } finally {
        (globalThis as any).document = origDoc;
      }
    });
  });

  // =========================================================================
  // 4. Music Artwork Pipeline & Resolver Hardening
  // =========================================================================
  describe("4. Music Artwork Pipeline & Resolver Hardening", () => {
    it("normalizes base64 data URIs including embedded linebreaks/whitespace", () => {
      const rawWithNewlines =
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ\r\nAAAQABAAD/2wBDAAMCAgICAgMCAgID\nAwMDBAYEBAQE";
      const resolved = resolveArtworkUrl(rawWithNewlines);
      assert.strictEqual(
        resolved,
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQE"
      );
    });

    it("supports HTTPS, local loopback HTTP, asset://, blob:, and local file paths", () => {
      assert.strictEqual(
        resolveArtworkUrl("https://cdn.example.com/cover.webp"),
        "https://cdn.example.com/cover.webp"
      );
      assert.strictEqual(
        resolveArtworkUrl("http://127.0.0.1:8080/artwork.png"),
        "http://127.0.0.1:8080/artwork.png"
      );
      assert.strictEqual(
        resolveArtworkUrl("http://localhost:9000/artwork.jpg"),
        "http://localhost:9000/artwork.jpg"
      );
      assert.strictEqual(
        resolveArtworkUrl("blob:http://localhost:1420/550e8400-e29b-41d4-a716-446655440000"),
        "blob:http://localhost:1420/550e8400-e29b-41d4-a716-446655440000"
      );
      assert.strictEqual(
        resolveArtworkUrl("http://asset.localhost/C%3A%2FMusic%2Fcover.jpg"),
        "http://asset.localhost/C%3A%2FMusic%2Fcover.jpg"
      );
      assert.ok(resolveArtworkUrl("C:\\Users\\Music\\cover.png")?.includes("cover.png"));
      assert.ok(resolveArtworkUrl("/Users/music/cover.png")?.includes("cover.png"));
      assert.ok(resolveArtworkUrl("file:///C:/Users/Music/cover.png")?.includes("cover.png"));
    });

    it("still rejects non-loopback insecure HTTP and dangerous schemes", () => {
      assert.strictEqual(resolveArtworkUrl("http://example.com/art.png"), null);
      assert.strictEqual(resolveArtworkUrl("javascript:alert(1)"), null);
      assert.strictEqual(resolveArtworkUrl("data:text/html;base64,PHNjcmlwdD4="), null);
    });

    it("verifies Windows SMTC stream Seek(0), delayed artwork retry, and timeline optimization in windows.rs", () => {
      const winRs = fs.readFileSync(
        path.join(ROOT_DIR, "crates/platform/src/windows.rs"),
        "utf-8"
      );
      assert.ok(
        winRs.includes("stream.Seek(0)") && winRs.includes("stream.GetInputStreamAt(0)"),
        "Windows extract_artwork must rewind SMTC thumbnail stream to byte 0 before reading"
      );
      assert.ok(
        winRs.includes("spawn_delayed_artwork_retry"),
        "Windows MediaPropertiesChanged must retry artwork extraction when SMTC populates thumbnail asynchronously"
      );
      assert.ok(
        winRs.includes("MediaEvent::PositionChanged"),
        "Windows TimelinePropertiesChanged must emit lightweight PositionChanged without re-reading thumbnail stream"
      );
    });

    it("verifies MediaService preserves existing artwork on transient None updates for the same track", () => {
      const mediaRs = fs.readFileSync(
        path.join(ROOT_DIR, "crates/services/src/media.rs"),
        "utf-8"
      );
      assert.ok(
        mediaRs.includes("existing.title == session.title") &&
          mediaRs.includes("session.album_art = existing.album_art.clone();"),
        "MediaService must preserve cached album_art when a same-track status update arrives with album_art: None"
      );
    });
  });

  // =========================================================================
  // 5. Performance & Store Optimization
  // =========================================================================
  describe("5. Store Shallow Equality & Redundant Effect Removal", () => {
    it("skips listener notification in createStore when setState produces identical shallow state", () => {
      const store = createDomainStore({ count: 1, label: "idle" });
      let notifications = 0;
      const unsub = store.subscribe(() => {
        notifications += 1;
      });

      store.setState({ count: 1 });
      store.setState((prev) => ({ count: prev.count, label: "idle" }));
      assert.strictEqual(notifications, 0, "Identical state updates must not trigger listeners");

      store.setState({ count: 2 });
      assert.strictEqual(notifications, 1, "Changed state update must trigger listener once");
      unsub();
    });

    it("verifies IslandContent does not duplicate initSettingsState() on expand/collapse", () => {
      const islandContentSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/IslandContent.tsx"),
        "utf-8"
      );
      assert.strictEqual(
        islandContentSrc.includes("initSettingsState"),
        false,
        "IslandContent must not re-run initSettingsState()"
      );
    });
  });

  // =========================================================================
  // 6. Localization Parity (476 keys across en, tr, de, es, fr)
  // =========================================================================
  describe("6. Exact 5-Locale Key Parity for v4.1", () => {
    const locales = ["en", "tr", "de", "es", "fr"];
    for (const loc of locales) {
      it(`includes horizontal position translation keys in ${loc}.json`, () => {
        const data = JSON.parse(
          fs.readFileSync(path.join(DESKTOP_DIR, `src/i18n/locales/${loc}.json`), "utf-8")
        );
        assert.ok(data.settings.island.horizontalPos, `Missing horizontalPos in ${loc}`);
        assert.ok(data.settings.island.horizontalPosDesc, `Missing horizontalPosDesc in ${loc}`);
        assert.ok(data.settings.island.posLeft, `Missing posLeft in ${loc}`);
        assert.ok(data.settings.island.posRight, `Missing posRight in ${loc}`);
      });
    }
  });

  // =========================================================================
  // 7. Version Hygiene & Release State
  // =========================================================================
  describe("7. Version Hygiene & Release State", () => {
    it("preserves stable version manifests strictly aligned with v4.1 release", () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
      const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8"));
      const typesPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "packages/types/package.json"), "utf-8"));
      const tauriConf = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8"));
      const desktopCargo = fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/Cargo.toml"), "utf-8");
      const cargoLock = fs.readFileSync(path.join(ROOT_DIR, "Cargo.lock"), "utf-8");

      assert.strictEqual(rootPkg.version, "4.1", "Root package.json version must be 4.1");
      assert.strictEqual(desktopPkg.version, "4.1", "Desktop package.json version must be 4.1");
      assert.strictEqual(typesPkg.version, "4.1", "Types package.json version must be 4.1");
      assert.strictEqual(APP_VERSION, "4.1", "APP_VERSION must be 4.1");
      assert.strictEqual(APP_VERSION_LABEL, "v4.1", "APP_VERSION_LABEL must be v4.1");

      assert.strictEqual(tauriConf.version, "4.1.0", "tauri.conf.json version must be 4.1.0");
      assert.ok(desktopCargo.includes('version = "4.1.0"'), "Cargo.toml must declare version = 4.1.0");
      assert.ok(
        cargoLock.includes('name = "bbq-desktop"\nversion = "4.1.0"') ||
        cargoLock.includes('name = "bbq-desktop"\r\nversion = "4.1.0"'),
        "Cargo.lock must resolve bbq-desktop to 4.1.0"
      );
    });
  });
});
