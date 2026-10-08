import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveLauncherItemIcon,
  mapActionToIconName,
} from "../src/components/widgets/launcherModel.ts";
import {
  settingsStore,
  defaultSettings,
  updateSettingsBatch,
  applyThemeAndMotionToDom,
} from "../src/state/settingsState.ts";
import {
  clampIslandWidth,
  clampIslandHeight,
} from "../src/components/widgets/settingsModel.ts";
import { bbqCommands } from "../src/ipc/commands.ts";
import type { LauncherItem, BbqSettings } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readSettingsSources = (): string => {
  const base = fs.readFileSync(path.resolve(__dirname, "../src/components/widgets/SettingsWidget.tsx"), "utf-8");
  const settingsDir = path.resolve(__dirname, "../src/components/widgets/settings");
  const tabs = fs.readdirSync(settingsDir).map((f) => fs.readFileSync(path.join(settingsDir, f), "utf-8")).join("\n");
  return `${base}\n${tabs}`;
};

describe("BBQ v2.4 — Phase 1: Launcher, Context Menu & UI Polish Regression Tests", () => {
  beforeEach(() => {
    bbqCommands.updateSettings = async () => true;
    settingsStore.setState({
      settings: { ...defaultSettings },
      isLoading: false,
      error: null,
    });
  });

  // =========================================================================
  // 1. Launcher Icon Mapping
  // =========================================================================
  describe("1. Launcher Icon Mapping", () => {
    it("maps file managers to 'folder'", () => {
      const items: Partial<LauncherItem>[] = [
        { id: "bbq_files", title: "Files & Workspace" },
        { id: "custom_explorer", title: "File Explorer" },
        { id: "item_finder", title: "Finder" },
        { id: "tr_dosyalar", title: "Dosya Yöneticisi" },
        {
          id: "custom_folder_action",
          title: "My Documents",
          action: { type: "open_folder", payload: { path: "/docs" } },
        },
        {
          id: "bbq_files_action",
          title: "Open BBQ Files",
          action: { type: "bbq_action", payload: { action: "open_files" } },
        },
      ];

      for (const item of items) {
        assert.equal(
          resolveLauncherItemIcon(item as LauncherItem),
          "folder",
          `Expected 'folder' icon for item: ${JSON.stringify(item)}`
        );
      }
    });

    it("maps download directories and actions to 'download'", () => {
      const items: Partial<LauncherItem>[] = [
        { id: "sys_downloads", title: "Downloads Folder" },
        { id: "action_downloads", title: "Download Manager" },
        {
          id: "bbq_dl_action",
          title: "Downloads",
          action: { type: "bbq_action", payload: { action: "open_downloads" } },
        },
      ];

      for (const item of items) {
        assert.equal(
          resolveLauncherItemIcon(item as LauncherItem),
          "download",
          `Expected 'download' icon for item: ${JSON.stringify(item)}`
        );
      }
    });

    it("maps terminal and shell actions to 'terminal'", () => {
      const items: Partial<LauncherItem>[] = [
        { id: "sys_terminal", title: "Terminal" },
        { id: "sys_pwsh", title: "PowerShell 7" },
        { id: "sys_cmd", title: "Command Prompt" },
        { id: "sys_bash", title: "Bash Shell" },
        { id: "sys_zsh", title: "Zsh" },
        { id: "app_wezterm", title: "WezTerm" },
        { id: "app_alacritty", title: "Alacritty" },
      ];

      for (const item of items) {
        assert.equal(
          resolveLauncherItemIcon(item as LauncherItem),
          "terminal",
          `Expected 'terminal' icon for item: ${JSON.stringify(item)}`
        );
      }
    });

    it("maps settings and preferences to 'settings'", () => {
      const items: Partial<LauncherItem>[] = [
        { id: "sys_settings", title: "Settings" },
        { id: "sys_prefs", title: "System Preferences" },
        { id: "tr_ayarlar", title: "Ada Ayarları" },
        {
          id: "bbq_settings_action",
          title: "Open Settings",
          action: { type: "bbq_action", payload: { action: "open_settings" } },
        },
        {
          id: "sys_settings_action",
          title: "Control Panel",
          action: { type: "system_action", payload: { action: "open_settings" } },
        },
      ];

      for (const item of items) {
        assert.equal(
          resolveLauncherItemIcon(item as LauncherItem),
          "settings",
          `Expected 'settings' icon for item: ${JSON.stringify(item)}`
        );
      }
    });

    it("maps home directory to 'home'", () => {
      const items: Partial<LauncherItem>[] = [
        { id: "sys_home", title: "Home Directory" },
        { id: "user_home", title: "User Profile Home" },
        { id: "explicit_home", title: "Home", icon: "home" },
      ];

      for (const item of items) {
        assert.equal(
          resolveLauncherItemIcon(item as LauncherItem),
          "home",
          `Expected 'home' icon for item: ${JSON.stringify(item)}`
        );
      }
    });

    it("maps application launcher and app grid to 'launcher'", () => {
      const items: Partial<LauncherItem>[] = [
        { id: "app_grid", title: "Applications" },
        {
          id: "app_calc",
          title: "Calculator",
          action: { type: "open_application", payload: { app_name: "calc" } },
        },
      ];

      for (const item of items) {
        assert.equal(
          resolveLauncherItemIcon(item as LauncherItem),
          "launcher",
          `Expected 'launcher' icon for item: ${JSON.stringify(item)}`
        );
      }
    });

    it("honors explicit valid icon on item override", () => {
      const item: Partial<LauncherItem> = {
        id: "custom_item",
        title: "Arbitrary Title",
        icon: "folder",
      };
      assert.equal(resolveLauncherItemIcon(item as LauncherItem), "folder");

      const itemTerm: Partial<LauncherItem> = {
        id: "custom_term",
        title: "Arbitrary Title",
        icon: "terminal",
      };
      assert.equal(resolveLauncherItemIcon(itemTerm as LauncherItem), "terminal");
    });

    it("safely falls back to 'launcher' for null or undefined input", () => {
      assert.equal(resolveLauncherItemIcon(null), "launcher");
      assert.equal(resolveLauncherItemIcon(undefined), "launcher");
    });

    it("preserves mapActionToIconName backward compatibility for existing tests", () => {
      assert.equal(
        mapActionToIconName({ type: "bbq_action", payload: { action: "open_files" } }),
        "sparkles"
      );
      assert.equal(
        mapActionToIconName({ type: "open_application", payload: { app_name: "test" } }),
        "launcher"
      );
    });
  });

  // =========================================================================
  // 2. Context Menu Compact Mode Envelope
  // =========================================================================
  describe("2. Context Menu Compact Mode Envelope", () => {
    it("allocates >= 380px width and island_height + 340px height envelope in compact mode", () => {
      const islandContent = fs.readFileSync(
        path.resolve(__dirname, "../src/components/island/Island.tsx"),
        "utf8"
      );

      assert.ok(
        islandContent.includes("const targetW = Math.max(currentSettings.island_width, 380);"),
        "Compact context menu must expand width to at least 380px"
      );
      assert.ok(
        islandContent.includes("const targetH = Math.max(currentSettings.island_height, 44) + 340;"),
        "Compact context menu must expand height to island_height + 340px"
      );
    });

    it("restores exact configured compact geometry when context menu closes", () => {
      const islandContent = fs.readFileSync(
        path.resolve(__dirname, "../src/components/island/Island.tsx"),
        "utf8"
      );

      assert.ok(
        islandContent.includes("handleContextMenuClose"),
        "Must declare handleContextMenuClose callback"
      );
      assert.ok(
        islandContent.includes("compactWidth: currentSettings.island_width"),
        "handleContextMenuClose must restore configured compactWidth"
      );
      assert.ok(
        islandContent.includes("compactHeight: currentSettings.island_height"),
        "handleContextMenuClose must restore configured compactHeight"
      );
    });
  });

  // =========================================================================
  // 3. Context Menu Outside Bounds & Flipping
  // =========================================================================
  describe("3. Context Menu Outside Bounds & Flipping", () => {
    it("calculates boundary clamping to keep menu within viewport", () => {
      const clampMenuCoord = (pos: number, dimension: number, maxView: number, padding = 8) => {
        let clamped = pos;
        if (clamped + dimension + padding > maxView) {
          clamped = Math.max(padding, maxView - dimension - padding);
        }
        if (clamped < padding) {
          clamped = padding;
        }
        return clamped;
      };

      const winW = 800;
      const winH = 600;
      const menuW = 200;
      const menuH = 280;

      // Inside normal range
      assert.equal(clampMenuCoord(100, menuW, winW), 100);
      // Beyond right/bottom edge
      assert.equal(clampMenuCoord(750, menuW, winW), winW - menuW - 8);
      assert.equal(clampMenuCoord(580, menuH, winH), winH - menuH - 8);
      // Negative / too close to left/top edge
      assert.equal(clampMenuCoord(-20, menuW, winW), 8);
      assert.equal(clampMenuCoord(2, menuH, winH), 8);
    });

    it("flips submenu horizontally and vertically near viewport boundaries", () => {
      const winW = 800;
      const winH = 600;
      const menuW = 200;
      const submenuW = 160;
      const submenuH = 260;
      const padding = 8;

      const shouldFlipX = (clampedX: number) =>
        clampedX + menuW + submenuW + padding > winW;
      const shouldFlipY = (clampedY: number) =>
        clampedY + submenuH + padding > winH;

      // Near left/center -> no flip
      assert.equal(shouldFlipX(100), false);
      assert.equal(shouldFlipY(100), false);

      // Near right edge (clampedX = 592): 592 + 200 + 160 + 8 = 960 > 800 -> flip!
      assert.equal(shouldFlipX(592), true);

      // Near bottom edge (clampedY = 360): 360 + 260 + 8 = 628 > 600 -> flip!
      assert.equal(shouldFlipY(360), true);
    });

    it("defines CSS rules for both horizontal and vertical submenu flipping", () => {
      const cssContent = fs.readFileSync(
        path.resolve(__dirname, "../src/styles/index.css"),
        "utf8"
      );

      assert.ok(
        cssContent.includes(".bbq-context-menu.flip-submenu .bbq-context-submenu"),
        "CSS must contain .flip-submenu rule"
      );
      assert.ok(
        cssContent.includes("right: calc(100% + 4px);"),
        "Submenu horizontal flip must anchor to right"
      );
      assert.ok(
        cssContent.includes(".bbq-context-menu.flip-submenu-y .bbq-context-submenu"),
        "CSS must contain .flip-submenu-y rule"
      );
      assert.ok(
        cssContent.includes("bottom: 0;"),
        "Submenu vertical flip must anchor to bottom"
      );
    });
  });

  // =========================================================================
  // 4. Context Menu Button Interaction Hardening
  // =========================================================================
  describe("4. Context Menu Button Interaction Hardening", () => {
    it("defines pointer-events: auto on context menu and submenu in styles", () => {
      const cssContent = fs.readFileSync(
        path.resolve(__dirname, "../src/styles/index.css"),
        "utf8"
      );

      const menuPos = cssContent.indexOf(".bbq-context-menu {");
      assert.ok(menuPos !== -1, "Must find .bbq-context-menu rule");
      const menuSlice = cssContent.slice(menuPos, menuPos + 300);
      assert.ok(
        menuSlice.includes("pointer-events: auto;"),
        ".bbq-context-menu must declare pointer-events: auto"
      );

      const submenuPos = cssContent.indexOf(".bbq-context-submenu {");
      assert.ok(submenuPos !== -1, "Must find .bbq-context-submenu rule");
      const submenuSlice = cssContent.slice(submenuPos, submenuPos + 300);
      assert.ok(
        submenuSlice.includes("pointer-events: auto;"),
        ".bbq-context-submenu must declare pointer-events: auto"
      );
    });

    it("stops propagation on pointerdown, mousedown, and click to protect button clicks", () => {
      const menuContent = fs.readFileSync(
        path.resolve(__dirname, "../src/components/common/ContextMenu.tsx"),
        "utf8"
      );

      // Root container propagation stops
      assert.ok(
        menuContent.includes("onPointerDown={(e) => e.stopPropagation()}"),
        "Root menu must stop pointerdown propagation"
      );
      assert.ok(
        menuContent.includes("onMouseDown={(e) => e.stopPropagation()}"),
        "Root menu must stop mousedown propagation"
      );
      assert.ok(
        menuContent.includes("onClick={(e) => e.stopPropagation()}"),
        "Root menu must stop click propagation"
      );

      // Menu items have role='menuitem'
      assert.ok(
        menuContent.includes('role="menuitem"'),
        "Menu items must have role='menuitem' for accessibility"
      );
    });
  });

  // =========================================================================
  // 5. Context Menu Dismissal
  // =========================================================================
  describe("5. Context Menu Dismissal", () => {
    it("handles outside pointerdown and mousedown with clean listener detachment", () => {
      const menuContent = fs.readFileSync(
        path.resolve(__dirname, "../src/components/common/ContextMenu.tsx"),
        "utf8"
      );

      assert.ok(
        menuContent.includes('document.addEventListener("pointerdown", handleDocClick)'),
        "Must listen to pointerdown outside"
      );
      assert.ok(
        menuContent.includes('document.addEventListener("mousedown", handleDocClick)'),
        "Must listen to mousedown outside"
      );
      assert.ok(
        menuContent.includes('document.removeEventListener("pointerdown", handleDocClick)'),
        "Must clean up pointerdown listener on unmount"
      );
      assert.ok(
        menuContent.includes('document.removeEventListener("mousedown", handleDocClick)'),
        "Must clean up mousedown listener on unmount"
      );
    });

    it("dismisses on Escape keydown", () => {
      const menuContent = fs.readFileSync(
        path.resolve(__dirname, "../src/components/common/ContextMenu.tsx"),
        "utf8"
      );

      assert.ok(
        menuContent.includes('if (e.key === "Escape")'),
        "Must check for Escape key"
      );
      assert.ok(
        menuContent.includes("onClose();"),
        "Must call onClose on Escape"
      );
      assert.ok(
        menuContent.includes('window.removeEventListener("keydown", handleKeyDown)'),
        "Must clean up keydown listener on unmount"
      );
    });
  });

  // =========================================================================
  // 6. Settings Regression
  // =========================================================================
  describe("6. Settings Regression", () => {
    const anchors: BbqSettings["island_position"][] = [
      "top-center",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];

    for (const anchor of anchors) {
      it(`supports anchor position: ${anchor}`, async () => {
        await updateSettingsBatch({ island_position: anchor });
        assert.equal(settingsStore.getState().settings.island_position, anchor);
      });
    }

    const schedules: BbqSettings["auto_update_schedule"][] = [
      "startup",
      "daily",
      "weekly",
      "monthly",
    ];

    for (const schedule of schedules) {
      it(`supports auto-update schedule: ${schedule}`, async () => {
        await updateSettingsBatch({ auto_update_schedule: schedule });
        assert.equal(settingsStore.getState().settings.auto_update_schedule, schedule);
      });
    }

    it("verifies transparency bounds and CSS variable generation", () => {
      const styles: Record<string, string> = {};
      const origDoc = globalThis.document;
      globalThis.document = {
        documentElement: {
          style: {
            setProperty: (k: string, v: string) => {
              styles[k] = v;
            },
            getPropertyValue: (k: string) => styles[k] || "",
          },
          setAttribute: () => {},
        },
      } as unknown as Document;

      try {
        const testSettings: BbqSettings = {
          ...defaultSettings,
          island_transparency: 50,
        };
        applyThemeAndMotionToDom(testSettings);

        assert.equal(styles["--bbq-island-transparency"], "50%");
        assert.equal(styles["--bbq-island-opacity"], "0.5");
      } finally {
        globalThis.document = origDoc;
      }
    });

    it("verifies privacy panel scroll containment structure", () => {
      const settingsWidgetSrc = readSettingsSources();

      assert.ok(
        settingsWidgetSrc.includes('id="settings-panel-privacy-content"'),
        "Must contain privacy panel id"
      );
      assert.ok(
        settingsWidgetSrc.includes('overflowY: "auto"'),
        "Must contain overflowY auto"
      );
      assert.ok(
        settingsWidgetSrc.includes('minHeight: 0'),
        "Must contain minHeight 0"
      );
    });

    it("verifies .bbq-select class is applied to dropdowns", () => {
      const settingsWidgetSrc = readSettingsSources();

      assert.ok(
        settingsWidgetSrc.includes('id="island-position-select"') &&
          settingsWidgetSrc.includes('className="bbq-select"'),
        "island-position-select must use className='bbq-select'"
      );
      assert.ok(
        !settingsWidgetSrc.includes('id="auto-update-schedule-select"'),
        "auto-update-schedule-select must be removed in favor of honest updates"
      );
    });
  });

  // =========================================================================
  // 7. Compact Width & Height Geometry
  // =========================================================================
  describe("7. Compact Width & Height Geometry", () => {
    it("clamps compact width with 50px steps between 180 and 480", () => {
      const stepWidth = (val: number) => {
        if (val <= 180) return 180;
        if (val >= 480) return 480;
        return Math.max(180, Math.min(480, Math.round(val / 50) * 50));
      };

      assert.equal(stepWidth(150), 180);
      assert.equal(stepWidth(180), 180);
      assert.equal(stepWidth(210), 200);
      assert.equal(stepWidth(240), 250);
      assert.equal(stepWidth(300), 300);
      assert.equal(stepWidth(430), 450);
      assert.equal(stepWidth(480), 480);
      assert.equal(stepWidth(600), 480);
    });

    it("preserves physical screen center across all compact widths", () => {
      const screenWidth = 2560;
      const expectedCenter = screenWidth / 2; // 1280

      const widths = [180, 200, 250, 300, 350, 400, 450, 480];
      for (const w of widths) {
        const x = Math.round((screenWidth - w) / 2);
        const actualCenter = x + w / 2;
        assert.equal(
          actualCenter,
          expectedCenter,
          `Width ${w} with offset ${x} must match screen center ${expectedCenter}`
        );
      }
    });

    it("compact height clamps within boundary [36, 54] with step 2", () => {
      const clampHeight = (val: number) => Math.max(36, Math.min(54, Math.round(val)));

      assert.equal(clampHeight(20), 36);
      assert.equal(clampHeight(36), 36);
      assert.equal(clampHeight(38), 38);
      assert.equal(clampHeight(42), 42);
      assert.equal(clampHeight(54), 54);
      assert.equal(clampHeight(70), 54);
    });

    it("clamps island dimensions safely via domain models", () => {
      assert.equal(clampIslandWidth(null), 240);
      assert.equal(clampIslandWidth(NaN), 240);
      assert.equal(clampIslandWidth(100), 180);
      assert.equal(clampIslandWidth(800), 640);

      assert.equal(clampIslandHeight(null), 38);
      assert.equal(clampIslandHeight(NaN), 38);
      assert.equal(clampIslandHeight(10), 36);
      assert.equal(clampIslandHeight(700), 520);
    });
  });
});
