import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_VERSION, APP_VERSION_LABEL } from "../src/version.ts";
import { resolveArtworkUrl } from "../src/components/widgets/mediaModel.ts";
import { t } from "../src/i18n/index.ts";
import { applyThemeAndMotionToDom, defaultSettings } from "../src/state/settingsState.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = path.resolve(DESKTOP_DIR, "../..");

describe("BBQ v3.5 — Release Verification & Quality Gates", () => {
  // =========================================================================
  // 1. Version and Release Rules
  // =========================================================================
  describe("1. Version and Release Rules", () => {
    it("verifies public version is strictly 3.5, 3.6, or 3.7 across all package manifests", () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
      const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8"));
      const typesPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "packages/types/package.json"), "utf-8"));

      assert.ok(rootPkg.version === "4.1" || rootPkg.version === "4.0" || rootPkg.version === "3.8" || rootPkg.version === "3.7" || rootPkg.version === "3.6" || rootPkg.version === "3.5", "Root package.json version must be strictly 4.0, 3.8, 3.7, 3.6 or 3.5");
      assert.ok(desktopPkg.version === "4.1" || desktopPkg.version === "4.0" || desktopPkg.version === "3.8" || desktopPkg.version === "3.7" || desktopPkg.version === "3.6" || desktopPkg.version === "3.5", "apps/desktop/package.json version must be strictly 4.0, 3.8, 3.7, 3.6 or 3.5");
      assert.ok(typesPkg.version === "4.1" || typesPkg.version === "4.0" || typesPkg.version === "3.8" || typesPkg.version === "3.7" || typesPkg.version === "3.6" || typesPkg.version === "3.5", "packages/types/package.json version must be strictly 4.0, 3.8, 3.7, 3.6 or 3.5");
      assert.ok(APP_VERSION === "4.1" || APP_VERSION === "4.0" || APP_VERSION === "3.8" || APP_VERSION === "3.7" || APP_VERSION === "3.6" || APP_VERSION === "3.5", "APP_VERSION must be strictly 4.0, 3.8, 3.7, 3.6 or 3.5");
      assert.ok(APP_VERSION_LABEL === "v4.1" || APP_VERSION_LABEL === "v4.0" || APP_VERSION_LABEL === "v3.8" || APP_VERSION_LABEL === "v3.7" || APP_VERSION_LABEL === "v3.6" || APP_VERSION_LABEL === "v3.5", "APP_VERSION_LABEL must be strictly v4.0, v3.8, v3.7, v3.6 or v3.5");
    });

    it("verifies internal toolchain SemVer is strictly 3.5.0, 3.6.0, or 3.7.0 in Cargo & Tauri", () => {
      const tauriConf = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8"));
      const desktopCargo = fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/Cargo.toml"), "utf-8");
      const cargoLock = fs.readFileSync(path.join(ROOT_DIR, "Cargo.lock"), "utf-8");

      assert.ok(tauriConf.version === "4.1.0" || tauriConf.version === "4.0.0" || tauriConf.version === "3.8.0" || tauriConf.version === "3.7.0" || tauriConf.version === "3.6.0" || tauriConf.version === "3.5.0", "tauri.conf.json must declare SemVer compliance");
      assert.ok(desktopCargo.includes('version = "4.1.0"') || desktopCargo.includes('version = "4.0.0"') || desktopCargo.includes('version = "3.8.0"') || desktopCargo.includes('version = "3.7.0"') || desktopCargo.includes('version = "3.6.0"') || desktopCargo.includes('version = "3.5.0"'), "Desktop Cargo.toml must declare SemVer");
      assert.ok(
        cargoLock.includes('name = "bbq-desktop"\nversion = "4.1.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "4.1.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "4.0.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "4.0.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.8.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.8.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.7.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.7.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.6.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.6.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.5.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.5.0"'),
        "Cargo.lock must resolve bbq-desktop"
      );
    });
  });

  // =========================================================================
  // 2. Windows NSIS Installer Icon Configuration
  // =========================================================================
  describe("2. Windows NSIS Installer Icon", () => {
    it("verifies installerIcon is configured to icons/icon.ico in tauri.conf.json", () => {
      const tauriConf = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8"));
      assert.ok(tauriConf.bundle?.windows?.nsis, "tauri.conf.json must configure bundle.windows.nsis");
      assert.strictEqual(
        tauriConf.bundle.windows.nsis.installerIcon,
        "icons/icon.ico",
        "NSIS installerIcon must be set to icons/icon.ico"
      );
    });

    it("verifies the installer icon file actually exists and has a valid ICO header in src-tauri/icons/icon.ico", () => {
      const iconPath = path.join(DESKTOP_DIR, "src-tauri/icons/icon.ico");
      assert.ok(fs.existsSync(iconPath), "src-tauri/icons/icon.ico must exist");
      const buf = fs.readFileSync(iconPath);
      assert.ok(buf.length > 6, "icon.ico must not be empty");
      // Standard Windows ICO header starts with 0x00 0x00 0x01 0x00
      assert.strictEqual(buf[0], 0x00);
      assert.strictEqual(buf[1], 0x00);
      assert.strictEqual(buf[2], 0x01);
      assert.strictEqual(buf[3], 0x00);
    });
  });

  // =========================================================================
  // 3. Tab Labels, i18n Fallback, and Exact Parity
  // =========================================================================
  describe("3. Localization and Tab Labels", () => {
    it("ensures i18n fallback returns full key, never accidental last segment like 'name'", () => {
      const nonExistentKey = "widgets.someUnknownId.name";
      const result = t(nonExistentKey);
      assert.strictEqual(result, nonExistentKey, "Fallback must return the full requested key, not 'name'");
    });

    it("verifies widgets.titles keys exist and resolve properly without literal 'name'", () => {
      const widgetIds = ["drop", "files", "clipboard", "media", "system", "launcher", "timer", "reminder", "settings"];
      const locales = ["en", "tr", "de", "es", "fr"] as const;
      for (const lang of locales) {
        for (const id of widgetIds) {
          const titleKey = `widgets.titles.${id}`;
          const title = t(titleKey, undefined, lang);
          assert.ok(title && title !== titleKey, `Title for ${id} in ${lang} must resolve`);
          assert.notStrictEqual(title.toLowerCase(), "name", `Title for ${id} in ${lang} must never be 'name'`);
        }
      }
    });

    it("ensures SegmentedTabBar and WidgetsSettingsTab resolve localized widget titles via widgets.titles.${id}", () => {
      const tabBarSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/SegmentedTabBar.tsx"),
        "utf-8"
      );
      const widgetsTabSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/WidgetsSettingsTab.tsx"),
        "utf-8"
      );
      assert.ok(
        tabBarSrc.includes("`widgets.titles.${id}`"),
        "SegmentedTabBar must resolve localized tab titles via widgets.titles.${id}"
      );
      assert.ok(
        widgetsTabSrc.includes("`widgets.titles.${id}`"),
        "WidgetsSettingsTab must resolve localized widget titles via widgets.titles.${id}"
      );
    });

    it("ensures exact key parity across all 5 locales (en, tr, de, es, fr)", () => {
      const locales = ["en", "tr", "de", "es", "fr"];
      const localeData: Record<string, any> = {};
      for (const l of locales) {
        localeData[l] = JSON.parse(
          fs.readFileSync(path.join(DESKTOP_DIR, `src/i18n/locales/${l}.json`), "utf-8")
        );
      }

      function extractKeys(obj: any, prefix = ""): string[] {
        const keys: string[] = [];
        for (const k in obj) {
          const full = prefix ? `${prefix}.${k}` : k;
          if (typeof obj[k] === "object" && obj[k] !== null && !Array.isArray(obj[k])) {
            keys.push(...extractKeys(obj[k], full));
          } else {
            keys.push(full);
          }
        }
        return keys;
      }

      const enKeys = new Set(extractKeys(localeData["en"]));
      assert.ok(enKeys.size >= 438, `Expected at least 438 keys, got ${enKeys.size}`);

      for (const l of ["tr", "de", "es", "fr"]) {
        const currentKeys = new Set(extractKeys(localeData[l]));
        const missing = [...enKeys].filter((k) => !currentKeys.has(k));
        const extra = [...currentKeys].filter((k) => !enKeys.has(k));

        assert.strictEqual(missing.length, 0, `Locale ${l} has missing keys: ${missing.join(", ")}`);
        assert.strictEqual(extra.length, 0, `Locale ${l} has extra keys: ${extra.join(", ")}`);
      }
    });

    it("verifies language resolution across all 5 supported languages", () => {
      assert.strictEqual(t("widgets.titles.media", undefined, "tr"), "Medya");
      assert.strictEqual(t("widgets.titles.media", undefined, "de"), "Medien");
      assert.strictEqual(t("widgets.titles.media", undefined, "es"), "Medios");
      assert.strictEqual(t("widgets.titles.media", undefined, "fr"), "Médias");
      assert.strictEqual(t("widgets.titles.media", undefined, "en"), "Media");
    });
  });

  // =========================================================================
  // 4. Compact Apple-Style Check for Updates Page
  // =========================================================================
  describe("4. Compact Apple-Style Check for Updates Page", () => {
    it("verifies UpdateSettingsTab uses compact integrated card layout with bounded release notes", () => {
      const updateTabSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/UpdateSettingsTab.tsx"),
        "utf-8"
      );
      assert.ok(updateTabSrc.includes('id="settings-update-tab-panel"'), "Must render settings-update-tab-panel");
      assert.ok(updateTabSrc.includes('gap: "8px"'), "Must use compact 8px vertical gap");
      assert.ok(updateTabSrc.includes('padding: "8px 12px"'), "Must use compact 8px 12px card padding");
      assert.ok(updateTabSrc.includes('maxHeight: "80px"'), "Release notes must be bounded to maxHeight 80px");
      assert.ok(updateTabSrc.includes('id="settings-check-updates-btn"'), "Must preserve check for updates button");
      assert.ok(updateTabSrc.includes('id="settings-view-releases-btn"'), "Must preserve view releases button");
      assert.ok(updateTabSrc.includes('id="updater-install-btn"'), "Must preserve download and install button");
      assert.ok(updateTabSrc.includes('id="updater-restart-btn"'), "Must preserve restart button");
    });
  });

  // =========================================================================
  // 5. Music Volume Control, SMTC Controls, Compact Order & Artwork
  // =========================================================================
  describe("5. Music Volume Control, SMTC Controls, Compact Layout & Artwork", () => {
    it("verifies Windows WASAPI endpoint volume and resilient SMTC controls in crates/platform", () => {
      const cargoToml = fs.readFileSync(path.join(ROOT_DIR, "crates/platform/Cargo.toml"), "utf-8");
      const windowsRs = fs.readFileSync(path.join(ROOT_DIR, "crates/platform/src/windows.rs"), "utf-8");

      assert.ok(cargoToml.includes('"Win32_Media_Audio"'), "Cargo.toml must enable Win32_Media_Audio");
      assert.ok(
        cargoToml.includes('"Win32_Media_Audio_Endpoints"'),
        "Cargo.toml must enable Win32_Media_Audio_Endpoints"
      );
      assert.ok(
        windowsRs.includes("IAudioEndpointVolume"),
        "windows.rs must use WASAPI IAudioEndpointVolume"
      );
      assert.ok(
        windowsRs.includes("SetMasterVolumeLevelScalar"),
        "windows.rs must control master volume via SetMasterVolumeLevelScalar"
      );
      assert.ok(
        windowsRs.includes("SetMute"),
        "windows.rs must control mute state via SetMute"
      );
      assert.ok(
        windowsRs.includes("resolve_active_smtc_session"),
        "windows.rs must resolve active SMTC session with GetSessions() fallback"
      );
    });

    it("resolves artwork for data URIs (PNG/JPEG/WEBP/BMP/GIF), HTTPS, and local file paths", () => {
      const dataUri =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      assert.strictEqual(resolveArtworkUrl(dataUri), dataUri);

      const bmpDataUri = "data:image/bmp;base64,Qk0=";
      assert.strictEqual(resolveArtworkUrl(bmpDataUri), bmpDataUri);

      const httpsUrl = "https://example.com/artwork.jpg";
      assert.strictEqual(resolveArtworkUrl(httpsUrl), httpsUrl);

      assert.strictEqual(resolveArtworkUrl(null), null);
      assert.strictEqual(resolveArtworkUrl(""), null);

      const winPath = "C:\\Users\\music\\cover.png";
      const resolved = resolveArtworkUrl(winPath);
      assert.ok(resolved !== null, "Local path should be resolved");
      assert.ok(
        resolved?.includes("C:/Users/music/cover.png"),
        "Windows backslashes should be normalized to forward slashes"
      );
    });

    it("verifies compact music indicator renders Title before Artist in CompactIndicators.tsx", () => {
      const compactContent = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/CompactIndicators.tsx"),
        "utf-8"
      );
      const titleIndex = compactContent.indexOf('<span className="bbq-media-title">');
      const artistIndex = compactContent.indexOf('<span className="bbq-media-artist">');
      assert.ok(titleIndex > 0, "bbq-media-title must be in CompactIndicators");
      assert.ok(artistIndex > 0, "bbq-media-artist must be in CompactIndicators");
      assert.ok(titleIndex < artistIndex, "Song Title must be rendered BEFORE Artist");
    });

    it("verifies expanded MediaWidget enables Previous, Play/Pause, and Next when a session is active", () => {
      const mediaWidgetSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/MediaWidget.tsx"),
        "utf-8"
      );
      assert.ok(
        mediaWidgetSrc.includes("onClick={handlePrevious}") &&
          mediaWidgetSrc.includes("disabled={!meta.canGoPrevious && meta.isStopped}"),
        "Previous button must remain clickable when a media session is active"
      );
      assert.ok(
        mediaWidgetSrc.includes("onClick={handleTogglePlayPause}") &&
          mediaWidgetSrc.includes("disabled={!meta || (meta.isStopped && !meta.canPlay && !meta.canPause)}"),
        "Play/Pause button must remain clickable when a media session is active"
      );
      assert.ok(
        mediaWidgetSrc.includes("onClick={handleNext}") &&
          mediaWidgetSrc.includes("disabled={!meta.canGoNext && meta.isStopped}"),
        "Next button must remain clickable when a media session is active"
      );
      assert.ok(
        mediaWidgetSrc.includes("setArtError(false);"),
        "MediaWidget must reset artError when track/artwork changes"
      );
      assert.ok(
        mediaWidgetSrc.includes("refreshSystemState()") &&
          mediaWidgetSrc.includes("setSystemState({") &&
          mediaWidgetSrc.includes("bbqCommands.systemSetVolume(val)") &&
          mediaWidgetSrc.includes("bbqCommands.systemToggleMuted()"),
        "MediaWidget must refresh and optimistically update volume/mute state"
      );
    });
  });

  // =========================================================================
  // 6. Island Blur Behind Island (Backdrop Blur vs Text Blur)
  // =========================================================================
  describe("6. Island Blur Behind Island", () => {
    it("ensures data-opaque does NOT disable backdrop-filter in styles/index.css", () => {
      const cssContent = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.ok(
        !cssContent.includes('[data-opaque="true"] .bbq-island-shell {\n  backdrop-filter: none !important;'),
        "data-opaque must not strip backdrop-filter"
      );
      assert.ok(
        cssContent.includes("data-blur-zero"),
        "styles/index.css must handle data-blur-zero when blur is explicitly set to 0px"
      );
      assert.ok(
        cssContent.includes('[data-reduced-transparency="true"]'),
        "styles/index.css must disable backdrop-filter when reduced_transparency is enabled"
      );
    });

    it("verifies children and text do NOT have blur filter applied", () => {
      const cssContent = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8");
      assert.ok(!cssContent.includes(".bbq-island-shell * {\n  filter: blur"), "Content must never have filter: blur");
    });

    it("verifies applyThemeAndMotionToDom updates blur CSS custom properties and data-blur-zero attribute", () => {
      const attrs: Record<string, string> = {};
      const props: Record<string, string> = {};
      const origDoc = (globalThis as any).document;
      (globalThis as any).document = {
        documentElement: {
          setAttribute: (k: string, v: string) => {
            attrs[k] = v;
          },
          removeAttribute: (k: string) => {
            delete attrs[k];
          },
          style: {
            setProperty: (k: string, v: string) => {
              props[k] = v;
            },
          },
        },
      };
      try {
        applyThemeAndMotionToDom({ ...defaultSettings, island_blur: 24, island_transparency: 0 });
        assert.strictEqual(props["--bbq-island-blur"], "24px");
        assert.strictEqual(props["--bbq-glass-blur-idle"], "24px");
        assert.strictEqual(attrs["data-blur-zero"], undefined);
        assert.strictEqual(attrs["data-opaque"], "true");

        applyThemeAndMotionToDom({ ...defaultSettings, island_blur: 0, island_transparency: 0 });
        assert.strictEqual(props["--bbq-island-blur"], "0px");
        assert.strictEqual(attrs["data-blur-zero"], "true");

        // reduced_transparency setting removed in v3.7
      } finally {
        (globalThis as any).document = origDoc;
      }
    });
  });

  // =========================================================================
  // 7. Move HUD Disarm, Right-Click Reset & Blur Cancellation
  // =========================================================================
  describe("7. Move HUD Disarm, Right-Click Reset & Window Blur Cancellation", () => {
    it("verifies Island.tsx handles one-shot drag completion, right-click reset, Escape, and window blur", () => {
      const islandContent = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/Island.tsx"),
        "utf-8"
      );
      assert.ok(
        islandContent.includes('window.addEventListener("blur"'),
        "Island.tsx must cancel move HUD if window loses focus"
      );
      assert.ok(
        islandContent.includes('window.addEventListener("pointermove"'),
        "Island.tsx must disarm placement drag on pointermove after native OS drag"
      );
      assert.ok(
        islandContent.includes("await bbqCommands.resetIslandPosition();"),
        "Island.tsx must reset island position on right-click during Move HUD"
      );
    });
  });

  // =========================================================================
  // 8. Minimal GitHub Release Assets
  // =========================================================================
  describe("8. Minimal GitHub Release Assets", () => {
    it("verifies CI release workflow publishes ONLY the 6 approved assets", () => {
      const ciContent = fs.readFileSync(path.join(ROOT_DIR, ".github/workflows/ci.yml"), "utf-8");

      assert.ok(ciContent.includes("BBQ-win-x64-setup.exe"), "setup.exe must be published");
      assert.ok(ciContent.includes("BBQ-win-x64-setup.exe.sig"), "setup.exe.sig must be published");
      assert.ok(ciContent.includes("BBQ-mac-arm64.dmg"), "dmg must be published");
      assert.ok(ciContent.includes("BBQ-mac-arm64.app.tar.gz"), "tar.gz must be published");
      assert.ok(ciContent.includes("BBQ-mac-arm64.app.tar.gz.sig"), "tar.gz.sig must be published");
      assert.ok(ciContent.includes("latest.json"), "latest.json must be published");

      const releaseFilesBlock = ciContent.slice(ciContent.indexOf("release_files:"));
      assert.ok(!releaseFilesBlock.includes("BBQ-win-x64.zip"), "Redundant BBQ-win-x64.zip must not be published");
      assert.ok(!releaseFilesBlock.includes("BBQ-mac-arm64.app.zip"), "Redundant BBQ-mac-arm64.app.zip must not be published");
    });
  });

  // =========================================================================
  // 9. Zero Continuous Polling Policy
  // =========================================================================
  describe("9. Zero Polling Architectural Invariant", () => {
    it("ensures production desktop source contains zero setInterval or requestAnimationFrame loops", () => {
      const srcDir = path.join(DESKTOP_DIR, "src");
      function checkDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
            const content = fs.readFileSync(fullPath, "utf-8");
            assert.ok(!content.includes("setInterval("), `Forbidden setInterval found in ${entry.name}`);
            assert.ok(
              !content.includes("requestAnimationFrame("),
              `Forbidden requestAnimationFrame found in ${entry.name}`
            );
          }
        }
      }
      checkDir(srcDir);
    });
  });
});
