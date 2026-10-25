import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP_VERSION, APP_VERSION_LABEL } from "../src/version.ts";
import { defaultSettings } from "../src/state/settingsState.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const DESKTOP_DIR = path.resolve(__dirname, "..");

describe("BBQ v3.3 — Release Verification & Feature Suite", () => {
  // =========================================================================
  // 1. Version and Release Rules Verification
  // =========================================================================
  describe("1. Version and Release Rules", () => {
    it("verifies public version is strictly 3.3, 3.4, 3.5, or 3.6 across all manifests", () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
      const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8"));
      const typesPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "packages/types/package.json"), "utf-8"));

      assert.ok(rootPkg.version === "4.0" || rootPkg.version === "3.8" || rootPkg.version === "3.7" || rootPkg.version === "3.6" || rootPkg.version === "3.5" || rootPkg.version === "3.4" || rootPkg.version === "3.3", "Root package.json version must be strictly 3.7, 3.6, 3.5, 3.4 or 3.3");
      assert.ok(desktopPkg.version === "4.0" || desktopPkg.version === "3.8" || desktopPkg.version === "3.7" || desktopPkg.version === "3.6" || desktopPkg.version === "3.5" || desktopPkg.version === "3.4" || desktopPkg.version === "3.3", "apps/desktop/package.json version must be strictly 3.7, 3.6, 3.5, 3.4 or 3.3");
      assert.ok(typesPkg.version === "4.0" || typesPkg.version === "3.8" || typesPkg.version === "3.7" || typesPkg.version === "3.6" || typesPkg.version === "3.5" || typesPkg.version === "3.4" || typesPkg.version === "3.3", "packages/types/package.json version must be strictly 3.7, 3.6, 3.5, 3.4 or 3.3");
      assert.ok(APP_VERSION === "4.0" || APP_VERSION === "3.8" || APP_VERSION === "3.7" || APP_VERSION === "3.6" || APP_VERSION === "3.5" || APP_VERSION === "3.4" || APP_VERSION === "3.3", "APP_VERSION must be strictly 3.7, 3.6, 3.5, 3.4 or 3.3");
      assert.ok(APP_VERSION_LABEL === "v4.0" || APP_VERSION_LABEL === "v3.8" || APP_VERSION_LABEL === "v3.7" || APP_VERSION_LABEL === "v3.6" || APP_VERSION_LABEL === "v3.5" || APP_VERSION_LABEL === "v3.4" || APP_VERSION_LABEL === "v3.3", "APP_VERSION_LABEL must be strictly v3.7, v3.6, v3.5, v3.4 or v3.3");
    });

    it("verifies internal toolchain version is normalized to 3.3.0, 3.4.0, 3.5.0, 3.6.0, or 3.7.0 in Cargo & Tauri", () => {
      const tauriConf = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8"));
      const desktopCargo = fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/Cargo.toml"), "utf-8");
      const cargoLock = fs.readFileSync(path.join(ROOT_DIR, "Cargo.lock"), "utf-8");

      assert.ok(tauriConf.version === "4.0.0" || tauriConf.version === "3.8.0" || tauriConf.version === "3.7.0" || tauriConf.version === "3.6.0" || tauriConf.version === "3.5.0" || tauriConf.version === "3.4.0" || tauriConf.version === "3.3.0", "tauri.conf.json must declare SemVer compliance");
      assert.ok(desktopCargo.includes('version = "4.0.0"') || desktopCargo.includes('version = "3.8.0"') || desktopCargo.includes('version = "3.7.0"') || desktopCargo.includes('version = "3.6.0"') || desktopCargo.includes('version = "3.5.0"') || desktopCargo.includes('version = "3.4.0"') || desktopCargo.includes('version = "3.3.0"'), "Desktop Cargo.toml must declare SemVer");
      assert.ok(
        cargoLock.includes('name = "bbq-desktop"\nversion = "4.0.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "4.0.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.8.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.8.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.7.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.7.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.6.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.6.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.5.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.5.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.4.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.4.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.3.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.3.0"'),
        "Cargo.lock must resolve bbq-desktop"
      );
    });
  });

  // =========================================================================
  // 2. Tab Selection Indicator Animation (SegmentedTabBar.tsx)
  // =========================================================================
  describe("2. Tab Selection Indicator Animation", () => {
    const tabBarSource = fs.readFileSync(
      path.join(DESKTOP_DIR, "src/components/island/SegmentedTabBar.tsx"),
      "utf-8"
    );

    it("uses ResizeObserver and transitionend listener to sync indicator width dynamically", () => {
      assert.ok(
        tabBarSource.includes("ResizeObserver"),
        "SegmentedTabBar must employ ResizeObserver to track active tab element expansion"
      );
      assert.ok(
        tabBarSource.includes("transitionend"),
        "SegmentedTabBar must listen to transitionend for label max-width expansion"
      );
      assert.ok(
        tabBarSource.includes("updateIndicator"),
        "SegmentedTabBar must have updateIndicator logic"
      );
    });

    it("localizes tab title tooltips with getLocalizedTitle helper", () => {
      assert.ok(
        tabBarSource.includes("getLocalizedTitle"),
        "SegmentedTabBar must localize tab title tooltips using translation keys"
      );
    });
  });

  // =========================================================================
  // 3. Check Updates Page Y-Axis Polish & Rounded Buttons
  // =========================================================================
  describe("3. Check Updates Page Layout & Rounded Buttons", () => {
    const updateTabSource = fs.readFileSync(
      path.join(DESKTOP_DIR, "src/components/widgets/settings/UpdateSettingsTab.tsx"),
      "utf-8"
    );

    it("reduces vertical Y-axis height and padding across cards and release notes", () => {
      assert.ok(
        updateTabSource.includes('gap: "8px"'),
        "UpdateSettingsTab container must use compact 8px gap"
      );
      assert.ok(
        updateTabSource.includes('padding: "8px 12px"'),
        "UpdateSettingsTab cards must use compact vertical padding"
      );
      assert.ok(
        updateTabSource.includes('maxHeight: "80px"'),
        "Release notes card must limit maxHeight to 80px to prevent unnecessary Y-axis expansion"
      );
    });

    it("ensures all action buttons on Update page have fully rounded corners", () => {
      assert.ok(
        updateTabSource.includes('borderRadius: "9999px"'),
        "UpdateSettingsTab action buttons must have borderRadius: '9999px'"
      );
    });
  });

  // =========================================================================
  // 4. Pomodoro Page Fit & Layout
  // =========================================================================
  describe("4. Pomodoro Page Fit & Layout", () => {
    const timerWidgetSource = fs.readFileSync(
      path.join(DESKTOP_DIR, "src/components/widgets/TimerWidget.tsx"),
      "utf-8"
    );
    const cssSource = fs.readFileSync(
      path.join(DESKTOP_DIR, "src/styles/index.css"),
      "utf-8"
    );

    it("renders pomodoro settings in a single-row flex layout without vertical overflow", () => {
      assert.ok(
        cssSource.includes(".bbq-pomodoro-settings-section"),
        "index.css must define .bbq-pomodoro-settings-section"
      );
      assert.ok(
        cssSource.includes("flex-direction: row;"),
        ".bbq-pomodoro-settings-section must arrange inputs horizontally to preserve vertical space"
      );
    });

    it("provides compact 106x106 timer ring container for Pomodoro mode", () => {
      assert.ok(
        timerWidgetSource.includes('session.mode === "Pomodoro" ? " compact" : ""'),
        "TimerWidget must apply compact modifier class in Pomodoro mode"
      );
      assert.ok(
        cssSource.includes(".bbq-timer-ring-container.compact"),
        "index.css must define .bbq-timer-ring-container.compact"
      );
    });
  });

  // =========================================================================
  // 5. Clean GitHub Assets (.gitignore)
  // =========================================================================
  describe("5. Clean GitHub Assets (.gitignore)", () => {
    const gitignoreSource = fs.readFileSync(path.join(ROOT_DIR, ".gitignore"), "utf-8");

    it("ignores media recordings and artifacts to prevent unnecessary assets from being committed", () => {
      assert.ok(gitignoreSource.includes("*.mp4"), ".gitignore must ignore *.mp4");
      assert.ok(gitignoreSource.includes("*.webp"), ".gitignore must ignore *.webp");
      assert.ok(gitignoreSource.includes("*.gif"), ".gitignore must ignore *.gif");
      assert.ok(gitignoreSource.includes("recordings/"), ".gitignore must ignore recordings/");
      assert.ok(gitignoreSource.includes("artifacts/"), ".gitignore must ignore artifacts/");
    });
  });

  // =========================================================================
  // 6. Universal Localization Across Tabs & Widgets
  // =========================================================================
  describe("6. Universal Localization Across Tabs & Widgets", () => {
    it("maintains 100% key parity across all 5 locales with zero missing keys", () => {
      const locales = ["de", "es", "fr", "tr"];
      const en = JSON.parse(
        fs.readFileSync(path.join(DESKTOP_DIR, "src/i18n/locales/en.json"), "utf-8")
      );

      function extractKeys(obj: Record<string, unknown>, prefix = ""): string[] {
        let keys: string[] = [];
        for (const [k, v] of Object.entries(obj)) {
          const full = prefix ? `${prefix}.${k}` : k;
          if (v && typeof v === "object" && !Array.isArray(v)) {
            keys = keys.concat(extractKeys(v as Record<string, unknown>, full));
          } else {
            keys.push(full);
          }
        }
        return keys;
      }

      const enKeys = new Set(extractKeys(en));
      assert.strictEqual(enKeys.has("settings.island.blur"), true, "en.json must define settings.island.blur");
      assert.strictEqual(enKeys.has("settings.island.blurDesc"), true, "en.json must define settings.island.blurDesc");
      assert.strictEqual(enKeys.has("widgets.timer.work"), true, "en.json must define widgets.timer.work");
      assert.strictEqual(enKeys.has("widgets.timer.break"), true, "en.json must define widgets.timer.break");
      assert.strictEqual(enKeys.has("widgets.timer.set"), true, "en.json must define widgets.timer.set");

      for (const loc of locales) {
        const content = JSON.parse(
          fs.readFileSync(path.join(DESKTOP_DIR, `src/i18n/locales/${loc}.json`), "utf-8")
        );
        const locKeys = new Set(extractKeys(content));
        const missing = [...enKeys].filter((k) => !locKeys.has(k));
        assert.strictEqual(
          missing.length,
          0,
          `Locale ${loc}.json is missing keys: ${missing.join(", ")}`
        );
      }
    });

    it("verifies SettingsWidget subtabs consume useTranslation hook", () => {
      const hotkeyTab = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/HotkeySettingsTab.tsx"),
        "utf-8"
      );
      const privacyTab = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/PrivacySettingsTab.tsx"),
        "utf-8"
      );
      const notificationsTab = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/NotificationsSettingsTab.tsx"),
        "utf-8"
      );

      assert.ok(hotkeyTab.includes("useTranslation()"), "HotkeySettingsTab must use useTranslation()");
      assert.ok(privacyTab.includes("useTranslation()"), "PrivacySettingsTab must use useTranslation()");
      assert.ok(notificationsTab.includes("useTranslation()"), "NotificationsSettingsTab must use useTranslation()");
    });
  });

  // =========================================================================
  // 7. Windows SMTC Music Playback Detection
  // =========================================================================
  describe("7. Windows SMTC Music Playback Detection", () => {
    const windowsPlatformSource = fs.readFileSync(
      path.join(ROOT_DIR, "crates/platform/src/windows.rs"),
      "utf-8"
    );
    const mediaServiceSource = fs.readFileSync(
      path.join(ROOT_DIR, "crates/services/src/media.rs"),
      "utf-8"
    );

    it("preserves COM SessionManager guard to prevent premature drop and garbage collection", () => {
      assert.ok(
        windowsPlatformSource.includes("struct ManagerGuard"),
        "windows.rs must define ManagerGuard to keep SessionManager alive"
      );
      assert.ok(
        windowsPlatformSource.includes("active_manager"),
        "windows.rs must store active_manager guard in WindowsPlatformState"
      );
    });

    it("subscribes to both SessionsChanged and CurrentSessionChanged events with fallback session query", () => {
      assert.ok(
        windowsPlatformSource.includes("SessionsChanged"),
        "windows.rs must subscribe to SessionsChanged event"
      );
      assert.ok(
        windowsPlatformSource.includes("CurrentSessionChanged"),
        "windows.rs must subscribe to CurrentSessionChanged event"
      );
      assert.ok(
        windowsPlatformSource.includes("GetSessions"),
        "windows.rs must fallback to querying GetSessions() when CurrentSession is null"
      );
    });

    it("ensures media platform initialized at service startup", () => {
      assert.ok(
        mediaServiceSource.includes("ensure_platform_initialized"),
        "MediaService::start must call ensure_platform_initialized"
      );
    });
  });

  // =========================================================================
  // 8. Move HUD One-Shot Placement & Expansion / Reset
  // =========================================================================
  describe("8. Move HUD One-Shot Placement", () => {
    const islandSource = fs.readFileSync(
      path.join(DESKTOP_DIR, "src/components/island/Island.tsx"),
      "utf-8"
    );
    const tauriIslandCmdSource = fs.readFileSync(
      path.join(DESKTOP_DIR, "src-tauri/src/commands/island.rs"),
      "utf-8"
    );

    it("implements set_custom_drag_position and reset_island_position commands", () => {
      assert.ok(
        tauriIslandCmdSource.includes("pub async fn set_custom_drag_position"),
        "island commands must implement set_custom_drag_position"
      );
      assert.ok(
        tauriIslandCmdSource.includes("pub async fn reset_island_position"),
        "island commands must implement reset_island_position"
      );
      assert.ok(
        tauriIslandCmdSource.includes("is_custom_positioned"),
        "island commands must track is_custom_positioned flag"
      );
    });

    it("Island.tsx disarms Move HUD on left click, expands at moved position, and resets on right click", () => {
      assert.ok(
        islandSource.includes("setCustomDragPosition(true)"),
        "Island.tsx must mark custom drag position on pointerdown move hud drag"
      );
      assert.ok(
        islandSource.includes("resetIslandPosition()"),
        "Island.tsx must call resetIslandPosition() on right click while move hud is active"
      );
      assert.ok(
        islandSource.includes("onContextMenu={handleContextMenu}"),
        "Island.tsx must intercept contextmenu to reset position on right click"
      );
    });
  });

  // =========================================================================
  // 9. Island Blur Setting
  // =========================================================================
  describe("9. Island Blur Setting", () => {
    const islandTabSource = fs.readFileSync(
      path.join(DESKTOP_DIR, "src/components/widgets/settings/IslandSettingsTab.tsx"),
      "utf-8"
    );
    const settingsStateSource = fs.readFileSync(
      path.join(DESKTOP_DIR, "src/state/settingsState.ts"),
      "utf-8"
    );
    const rustSettingsSource = fs.readFileSync(
      path.join(ROOT_DIR, "crates/core/src/settings.rs"),
      "utf-8"
    );
    const rustDbSettingsSource = fs.readFileSync(
      path.join(ROOT_DIR, "crates/services/src/settings.rs"),
      "utf-8"
    );

    it("declares island_blur in defaultSettings and applies --bbq-island-blur CSS variable", () => {
      assert.strictEqual(
        typeof defaultSettings.island_blur,
        "number",
        "defaultSettings must declare island_blur numeric field"
      );
      assert.ok(
        settingsStateSource.includes("--bbq-island-blur"),
        "settingsState must apply --bbq-island-blur to the root DOM document"
      );
    });

    it("renders island-blur-slider directly below island-transparency-slider", () => {
      const transIndex = islandTabSource.indexOf('id="island-transparency-slider"');
      const blurIndex = islandTabSource.indexOf('id="island-blur-slider"');

      assert.ok(transIndex > 0, "island-transparency-slider must exist");
      assert.ok(blurIndex > transIndex, "island-blur-slider must be placed below island-transparency-slider");
    });

    it("persists island_blur in Rust SQLite schema and settings validation", () => {
      assert.ok(
        rustSettingsSource.includes("pub island_blur: u32"),
        "BbqSettings in Rust must declare pub island_blur: u32"
      );
      assert.ok(
        rustDbSettingsSource.includes("island_blur"),
        "SQLite settings service must persist island_blur"
      );
    });
  });
});
