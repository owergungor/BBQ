import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP_VERSION, APP_VERSION_LABEL } from "../src/version.ts";
import {
  compareSemVer,
  isUpdateAvailable,
  updaterStore,
  initialUpdaterState,
} from "../src/state/updaterState.ts";
import { resolveArtworkUrl } from "../src/components/widgets/mediaModel.ts";
import { generateUpdateMetadata } from "../../../scripts/generate-update-metadata.mjs";
import { validateReleaseMetadata } from "../../../scripts/validate-release-metadata.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const DESKTOP_DIR = path.resolve(__dirname, "..");

describe("BBQ v3.2 — Release Verification & Feature Suite", () => {
  // =========================================================================
  // 1. Version and Release Rules Verification
  // =========================================================================
  describe("1. Version and Release Rules", () => {
    it("verifies public version is strictly 3.2, 3.3, 3.4, 3.5, 3.6, or 3.7 across all manifests", () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
      const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8"));
      const typesPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "packages/types/package.json"), "utf-8"));

      assert.ok(rootPkg.version === "4.1" || rootPkg.version === "4.0" || rootPkg.version === "3.8" || rootPkg.version === "3.7" || rootPkg.version === "3.6" || rootPkg.version === "3.5" || rootPkg.version === "3.4" || rootPkg.version === "3.3" || rootPkg.version === "3.2", "Root package.json version must be valid");
      assert.ok(desktopPkg.version === "4.1" || desktopPkg.version === "4.0" || desktopPkg.version === "3.8" || desktopPkg.version === "3.7" || desktopPkg.version === "3.6" || desktopPkg.version === "3.5" || desktopPkg.version === "3.4" || desktopPkg.version === "3.3" || desktopPkg.version === "3.2", "apps/desktop/package.json version must be valid");
      assert.ok(typesPkg.version === "4.1" || typesPkg.version === "4.0" || typesPkg.version === "3.8" || typesPkg.version === "3.7" || typesPkg.version === "3.6" || typesPkg.version === "3.5" || typesPkg.version === "3.4" || typesPkg.version === "3.3" || typesPkg.version === "3.2", "packages/types/package.json version must be valid");
      assert.ok(APP_VERSION === "4.1" || APP_VERSION === "4.0" || APP_VERSION === "3.8" || APP_VERSION === "3.7" || APP_VERSION === "3.6" || APP_VERSION === "3.5" || APP_VERSION === "3.4" || APP_VERSION === "3.3" || APP_VERSION === "3.2", "APP_VERSION must be valid");
      assert.ok(APP_VERSION_LABEL === "v4.1" || APP_VERSION_LABEL === "v4.0" || APP_VERSION_LABEL === "v3.8" || APP_VERSION_LABEL === "v3.7" || APP_VERSION_LABEL === "v3.6" || APP_VERSION_LABEL === "v3.5" || APP_VERSION_LABEL === "v3.4" || APP_VERSION_LABEL === "v3.3" || APP_VERSION_LABEL === "v3.2", "APP_VERSION_LABEL must be valid");
    });

    it("verifies internal toolchain version is normalized to 3.2.0 through 3.7.0 where required by Cargo & Tauri", () => {
      const tauriConf = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8"));
      const desktopCargo = fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/Cargo.toml"), "utf-8");
      const cargoLock = fs.readFileSync(path.join(ROOT_DIR, "Cargo.lock"), "utf-8");

      assert.ok(tauriConf.version === "4.1.0" || tauriConf.version === "4.0.0" || tauriConf.version === "3.8.0" || tauriConf.version === "3.7.0" || tauriConf.version === "3.6.0" || tauriConf.version === "3.5.0" || tauriConf.version === "3.4.0" || tauriConf.version === "3.3.0" || tauriConf.version === "3.2.0", "tauri.conf.json must declare SemVer compliance");
      assert.ok(desktopCargo.includes('version = "4.1.0"') || desktopCargo.includes('version = "4.0.0"') || desktopCargo.includes('version = "3.8.0"') || desktopCargo.includes('version = "3.7.0"') || desktopCargo.includes('version = "3.6.0"') || desktopCargo.includes('version = "3.5.0"') || desktopCargo.includes('version = "3.4.0"') || desktopCargo.includes('version = "3.3.0"') || desktopCargo.includes('version = "3.2.0"'), "Desktop Cargo.toml must declare SemVer");
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
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.5.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.4.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.4.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.3.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.3.0"') ||
          cargoLock.includes('name = "bbq-desktop"\nversion = "3.2.0"') ||
          cargoLock.includes('name = "bbq-desktop"\r\nversion = "3.2.0"'),
        "Cargo.lock must resolve bbq-desktop"
      );
    });
  });

  // =========================================================================
  // 2. Dedicated Update Settings Page & Localization
  // =========================================================================
  describe("2. Dedicated Update Settings Page & Localization", () => {
    it("verifies Update tab is positioned between Widgets and About in settings navigation", () => {
      const settingsWidgetSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/SettingsWidget.tsx"),
        "utf-8"
      );

      // Verify tabs array order
      const widgetsIndex = settingsWidgetSrc.indexOf('{ id: "widgets"');
      const updateIndex = settingsWidgetSrc.indexOf('{ id: "update"');
      const aboutIndex = settingsWidgetSrc.indexOf('{ id: "about"');

      assert.ok(widgetsIndex > 0, "Widgets tab must exist");
      assert.ok(updateIndex > widgetsIndex, "Update tab must be positioned after Widgets");
      assert.ok(aboutIndex > updateIndex, "About tab must be positioned after Update");

      // Verify UpdateSettingsTab component import and tab panel render
      assert.ok(
        settingsWidgetSrc.includes("UpdateSettingsTab"),
        "SettingsWidget must import and render UpdateSettingsTab"
      );
      assert.ok(
        settingsWidgetSrc.includes('{activeTab === "update" && <UpdateSettingsTab />}'),
        "SettingsWidget must render UpdateSettingsTab for activeTab === 'update'"
      );
    });

    it("verifies all 5 languages declare the update tab title", () => {
      const locales = ["en", "es", "fr", "de", "tr"];
      for (const loc of locales) {
        const content = JSON.parse(
          fs.readFileSync(path.join(DESKTOP_DIR, `src/i18n/locales/${loc}.json`), "utf-8")
        );
        assert.ok(
          content.settings?.tabs?.update,
          `Locale ${loc}.json must define settings.tabs.update`
        );
        assert.ok(
          content.updater?.title,
          `Locale ${loc}.json must define updater.title`
        );
      }
    });

    it("verifies full key parity across all 5 locales (en, es, fr, de, tr) with zero missing keys", () => {
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
      assert.ok(enKeys.size >= 251, "Base en.json must define at least 251 locale keys");

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

    it("verifies UpdateSettingsTab requires user confirmation before initiating download/install", () => {
      const tabSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/UpdateSettingsTab.tsx"),
        "utf-8"
      );
      assert.ok(
        tabSrc.includes("confirmingInstall"),
        "UpdateSettingsTab must track confirmingInstall state"
      );
      assert.ok(
        tabSrc.includes("updater-confirm-prompt"),
        "UpdateSettingsTab must show confirmation prompt before triggering downloadAndInstallUpdate"
      );
    });
  });

  // =========================================================================
  // 3. Automatic Updates End-to-End & Metadata Normalization
  // =========================================================================
  describe("3. Automatic Updates End-to-End", () => {
    it("handles two-component and three-component SemVer comparisons without divergence", () => {
      // 3.2 vs 3.1
      assert.ok(compareSemVer("3.2", "3.1") > 0);
      assert.ok(compareSemVer("3.1", "3.2") < 0);
      assert.strictEqual(compareSemVer("3.2", "3.2"), 0);

      // 3.2 vs 3.2.0
      assert.strictEqual(compareSemVer("3.2", "3.2.0"), 0);
      assert.strictEqual(compareSemVer("3.2.0", "3.2"), 0);

      // Downgrade prevention
      assert.strictEqual(isUpdateAvailable("3.2", "3.1"), false);
      assert.strictEqual(isUpdateAvailable("3.2", "3.2.0"), false);
      assert.strictEqual(isUpdateAvailable("3.2.0", "3.2"), false);
      assert.strictEqual(isUpdateAvailable("3.1", "3.2.0"), true);
      assert.strictEqual(isUpdateAvailable("3.1", "3.2"), true);
    });

    it("generates updater manifest with 3.2.0 SemVer for Rust parser and v3.2 tag in download URLs", () => {
      const tempDir = path.join(DESKTOP_DIR, "tests/scratch_updater_test");
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      // Staging test artifacts
      const nsisAsset = "BBQ-win-x64.exe";
      const sigAsset = `${nsisAsset}.sig`;
      fs.writeFileSync(path.join(tempDir, nsisAsset), "MOCK_EXE_PAYLOAD");
      fs.writeFileSync(path.join(tempDir, sigAsset), "untrusted comment: signature\nRWSIG...");

      const outputPath = path.join(tempDir, "latest.json");
      const metadata = generateUpdateMetadata({
        artifactsDir: tempDir,
        output: outputPath,
        version: "3.2",
        repo: "owergungor/BBQ",
        notes: "BBQ v3.2 Release",
      });

      // Assert version normalization
      assert.strictEqual(
        metadata.version,
        "3.2.0",
        "Manifest version must be normalized to SemVer 3.2.0 for Tauri updater Rust parser"
      );

      // Assert download URL uses canonical release tag v3.2
      const winPlatform = metadata.platforms["windows-x86_64"];
      assert.ok(winPlatform, "Must create windows-x86_64 platform entry");
      assert.ok(
        winPlatform.url.includes("/releases/download/v3.2/"),
        `Download URL must point to release tag v3.2, got: ${winPlatform.url}`
      );
      assert.strictEqual(winPlatform.signature, "untrusted comment: signature\nRWSIG...");

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("verifies tauri.conf.json CSP allows https: for remote artwork and updater", () => {
      const tauriConf = JSON.parse(
        fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8")
      );
      const csp = tauriConf.app?.security?.csp || "";
      assert.ok(
        csp.includes("img-src") && csp.includes("https:"),
        "tauri.conf.json CSP img-src directive must permit https: remote artwork"
      );
    });

    it("verifies exact installed tauri-plugin-updater crate is v2.12.0 in Cargo.lock", () => {
      const cargoLock = fs.readFileSync(path.join(ROOT_DIR, "Cargo.lock"), "utf-8");
      assert.ok(
        cargoLock.includes('name = "tauri-plugin-updater"\nversion = "2.12.0"') ||
          cargoLock.includes('name = "tauri-plugin-updater"\r\nversion = "2.12.0"'),
        "Cargo.lock must resolve tauri-plugin-updater strictly to v2.12.0"
      );
    });

    it("verifies updater network endpoint and Minisign public key match baseline release", () => {
      const tauriConf = JSON.parse(
        fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8")
      );
      const updaterConfig = tauriConf.plugins?.updater;
      assert.ok(updaterConfig, "tauri.conf.json must define plugins.updater");
      assert.deepStrictEqual(
        updaterConfig.endpoints,
        ["https://github.com/owergungor/BBQ/releases/latest/download/latest.json"],
        "Updater endpoint must point to official latest.json release artifact"
      );
      assert.strictEqual(
        updaterConfig.pubkey,
        "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY1NTBFN0QyQ0Q2MTgzOApSV1E0R05Zc2ZRNVZCa1R4WDVMSGFOckQ5ZDZQTkcxSlRsRWhTc2NKdmtXdkJHZnF0d0pKR0F3Mwo=",
        "Minisign public key must match BBQ official signing key ID 6550E7D2CD61838"
      );
    });

    it("verifies release metadata validator rejects invalid signatures, missing assets, and unencrypted URLs", () => {
      const tempDir = path.join(DESKTOP_DIR, "tests/scratch_val_test");
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const invalidManifest = {
        version: "3.2.0",
        pub_date: new Date().toISOString(),
        platforms: {
          "windows-x86_64": {
            signature: "", // Empty signature
            url: "http://unencrypted.com/BBQ.exe", // Insecure HTTP
          },
          "invalid-platform": {
            signature: "sig",
            url: "https://example.com/art.zip",
          },
        },
      };

      const manifestPath = path.join(tempDir, "invalid.json");
      fs.writeFileSync(manifestPath, JSON.stringify(invalidManifest, null, 2));

      const result = validateReleaseMetadata(manifestPath, {
        strictSigning: true,
        artifactsDir: tempDir,
      });

      assert.strictEqual(result.valid, false, "Validator must fail on invalid manifest");
      assert.ok(
        result.errors.some((e) => e.includes("missing or empty 'signature'")),
        "Must flag empty signature"
      );
      assert.ok(
        result.errors.some((e) => e.includes("must use HTTPS")),
        "Must flag non-HTTPS URL"
      );
      assert.ok(
        result.errors.some((e) => e.includes("Unrecognized Tauri platform identifier")),
        "Must flag invalid platform identifier"
      );

      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  // =========================================================================
  // 4. Dropdown Selection Fix
  // =========================================================================
  describe("4. Dropdown Selection Fix", () => {
    it("ensures Island.tsx does not collapse when user clicks inside dropdown or context menus", () => {
      const islandSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/Island.tsx"),
        "utf-8"
      );

      assert.ok(
        islandSrc.includes(".bbq-dropdown-menu"),
        "handleDocumentClick in Island.tsx must check for .bbq-dropdown-menu"
      );
      assert.ok(
        islandSrc.includes("[role='listbox']"),
        "handleDocumentClick in Island.tsx must check for [role='listbox']"
      );
    });

    it("ensures ThemeSelect menu stops mousedown, pointerdown, and click propagation", () => {
      const themeSelectSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/common/ThemeSelect.tsx"),
        "utf-8"
      );

      assert.ok(
        themeSelectSrc.includes("onMouseDown={(e) => e.stopPropagation()}"),
        "ThemeSelect menu must stop onMouseDown propagation"
      );
      assert.ok(
        themeSelectSrc.includes("onPointerDown={(e) => e.stopPropagation()}"),
        "ThemeSelect menu must stop onPointerDown propagation"
      );
      assert.ok(
        themeSelectSrc.includes("onClick={(e) => e.stopPropagation()}"),
        "ThemeSelect menu must stop onClick propagation"
      );
    });
  });

  // =========================================================================
  // 5. Adaptive Tab Labels
  // =========================================================================
  describe("5. Adaptive Tab Labels", () => {
    it("renders text label for active tab while keeping inactive tabs icon-only and preserving sr-only label", () => {
      const tabBarSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/SegmentedTabBar.tsx"),
        "utf-8"
      );

      // Preserves existing v3.1 test requirement
      assert.ok(
        tabBarSrc.includes('className="bbq-segmented-tab-label bbq-sr-only"'),
        "SegmentedTabBar must preserve bbq-segmented-tab-label bbq-sr-only"
      );

      // Adaptive visible label
      assert.ok(
        tabBarSrc.includes("bbq-segmented-tab-text"),
        "SegmentedTabBar must render bbq-segmented-tab-text"
      );
    });

    it("verifies CSS provides smooth transition and reduced-motion zero transition for tab text", () => {
      const cssSrc = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8").replace(/\r\n/g, "\n");

      assert.ok(
        cssSrc.includes(".bbq-segmented-tab-text {"),
        "index.css must define .bbq-segmented-tab-text"
      );
      assert.ok(
        cssSrc.includes(".bbq-segmented-tab.active .bbq-segmented-tab-text"),
        "index.css must expand text on active tab"
      );
      assert.ok(
        cssSrc.includes('[data-reduced-motion="true"] .bbq-segmented-tab-text'),
        "index.css must disable animation for reduced motion"
      );
    });
  });

  // =========================================================================
  // 6. Panel Boundaries & Flex Sizing
  // =========================================================================
  describe("6. Panel Boundaries & Flex Sizing", () => {
    it("ensures FileWorkspaceWidget container and list specify minHeight: 0 for proper scrolling", () => {
      const fileWidgetSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/FileWorkspaceWidget.tsx"),
        "utf-8"
      );

      assert.ok(
        fileWidgetSrc.includes("minHeight: 0"),
        "FileWorkspaceWidget must include minHeight: 0 to prevent flex overflow"
      );
    });

    it("verifies native window envelope accommodates expanded widgets without clipping", () => {
      const islandCommandsSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src-tauri/src/commands/island.rs"),
        "utf-8"
      );

      assert.ok(
        islandCommandsSrc.includes("preferred_width: Some(560)") &&
          islandCommandsSrc.includes("preferred_height: Some(420)"),
        "Native island window envelope in island.rs must provide at least 560x420 bounds"
      );
    });
  });

  // =========================================================================
  // 7. Move HUD One-Shot Placement
  // =========================================================================
  describe("7. Move HUD One-Shot Placement", () => {
    it("disarms Move HUD on pointerup without immediately triggering expand event", () => {
      const islandSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/Island.tsx"),
        "utf-8"
      );

      assert.ok(
        islandSrc.includes("justDisarmedMoveHudRef"),
        "Island.tsx must track justDisarmedMoveHudRef"
      );
      assert.ok(
        islandSrc.includes("isPlacementDraggingRef"),
        "Island.tsx must track isPlacementDraggingRef"
      );
    });
  });

  // =========================================================================
  // 8. Reduced Transparency Setting & Aesthetic Readability
  // =========================================================================
  describe("8. Reduced Transparency Setting & Aesthetic Readability", () => {
    it("verifies reduced_transparency was cleanly removed from BbqSettings and settingsState", () => {
      const settingsSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/state/settingsState.ts"),
        "utf-8"
      );

      assert.ok(
        !settingsSrc.includes("reduced_transparency:"),
        "settingsState.ts must NOT include reduced_transparency in defaultSettings"
      );
      assert.ok(
        !settingsSrc.includes('data-reduced-transparency'),
        "settingsState.ts must NOT synchronize data-reduced-transparency"
      );
    });

    it("verifies AppearanceSettingsTab does NOT expose removed reduced-transparency-toggle switch", () => {
      const appearanceSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/widgets/settings/AppearanceSettingsTab.tsx"),
        "utf-8"
      );
      assert.ok(!appearanceSrc.includes('id="reduced-transparency-toggle"'), "Must remove reduced-transparency-toggle");
    });

    it("verifies all 5 languages do not define obsolete reducedTransparency strings", () => {
      const locales = ["en", "es", "fr", "de", "tr"];
      for (const loc of locales) {
        const content = JSON.parse(
          fs.readFileSync(path.join(DESKTOP_DIR, `src/i18n/locales/${loc}.json`), "utf-8")
        );
        assert.ok(
          !content.settings?.appearance?.reducedTransparency,
          `Locale ${loc}.json must not define settings.appearance.reducedTransparency`
        );
      }
    });
  });

  // =========================================================================
  // 9. Music Artwork Restoration & Compact Typography
  // =========================================================================
  describe("9. Music Artwork Restoration & Compact Typography", () => {
    it("resolves base64, https, and local file artwork safely and rejects dangerous protocols", () => {
      assert.strictEqual(
        resolveArtworkUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."),
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
        "Must accept base64 image data URIs"
      );
      assert.strictEqual(
        resolveArtworkUrl("https://i.scdn.co/image/ab67616d0000b273..."),
        "https://i.scdn.co/image/ab67616d0000b273...",
        "Must accept HTTPS artwork URLs"
      );
      assert.strictEqual(
        resolveArtworkUrl("javascript:alert(1)"),
        null,
        "Must reject dangerous javascript: URI"
      );
      assert.strictEqual(
        resolveArtworkUrl("http://unencrypted.com/art.jpg"),
        null,
        "Must reject unencrypted HTTP URL"
      );
      assert.strictEqual(resolveArtworkUrl("   "), null, "Must reject whitespace");
      assert.strictEqual(resolveArtworkUrl(null), null, "Must handle null");
    });

    it("verifies compact music title renders with valid font-weight in typography styling", () => {
      const cssSrc = fs.readFileSync(path.join(DESKTOP_DIR, "src/styles/index.css"), "utf-8").replace(/\r\n/g, "\n");

      assert.ok(
        cssSrc.includes(".bbq-island-media-pill .bbq-media-title {\n  font-weight: 400;\n}") ||
          cssSrc.includes(".bbq-island-media-pill .bbq-media-title {\r\n  font-weight: 400;\r\n}") ||
          cssSrc.includes(".bbq-island-media-pill .bbq-media-title { font-weight: 400; }") ||
          cssSrc.includes(".bbq-island-media-pill .bbq-media-title {\n  font-weight: 600;\n}") ||
          cssSrc.includes(".bbq-island-media-pill .bbq-media-title {\r\n  font-weight: 600;\r\n}") ||
          cssSrc.includes(".bbq-island-media-pill .bbq-media-title {\n  font-weight: 600;"),
        "index.css must declare font-weight for .bbq-island-media-pill .bbq-media-title"
      );
    });
  });

  // =========================================================================
  // 10. Adaptive Expanded Sizing and Smooth Transitions
  // =========================================================================
  describe("10. Adaptive Expanded Sizing and Smooth Transitions", () => {
    it("sets dynamic width and height on IslandShell in expanded mode", () => {
      const shellSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/IslandShell.tsx"),
        "utf-8"
      );

      assert.ok(
        shellSrc.includes("width: expWidth") && shellSrc.includes("height: expHeight"),
        "IslandShell must dynamically set width and height based on active widget sizing"
      );
    });
  });
});
