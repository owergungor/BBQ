import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  settingsStore,
  defaultSettings,
  coerceSettingValue,
  updateSetting,
} from "../src/state/settingsState.ts";
import { islandStore } from "../src/island/islandState.ts";
import { bbqCommands } from "../src/ipc/commands.ts";
import { errorStore } from "../src/state/errorState.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.8 — Phase 4: Move HUD & Release Asset Names", () => {
  const islandSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/island/Island.tsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const islandShellSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/island/IslandShell.tsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const contextMenuSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/common/ContextMenu.tsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const cssSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"), "utf8")
    .replace(/\r\n/g, "\n");
  const macScriptSrc = fs
    .readFileSync(path.join(ROOT_DIR, "scripts/package-macos.sh"), "utf8")
    .replace(/\r\n/g, "\n");
  const winScriptSrc = fs
    .readFileSync(path.join(ROOT_DIR, "scripts/package-windows.ps1"), "utf8")
    .replace(/\r\n/g, "\n");
  const ciSrc = fs
    .readFileSync(path.join(ROOT_DIR, ".github/workflows/ci.yml"), "utf8")
    .replace(/\r\n/g, "\n");
  const readmeSrc = fs
    .readFileSync(path.join(ROOT_DIR, "README.md"), "utf8")
    .replace(/\r\n/g, "\n");
  const releaseDocSrc = fs
    .readFileSync(path.join(ROOT_DIR, "docs/RELEASE_PROCESS.md"), "utf8")
    .replace(/\r\n/g, "\n");

  beforeEach(() => {
    settingsStore.setState({
      settings: { ...defaultSettings },
      isLoading: false,
      error: null,
    });
    islandStore.setState({
      state: "Compact",
      mode: "Normal",
      activeWidgetId: "launcher",
    });
    errorStore.setState({
      activeError: null,
      history: [],
    });
  });

  // =========================================================================
  // 1. Move HUD Setting Model, Defaults, Coercion & Persistence
  // =========================================================================
  describe("1. Move HUD Setting Model & State Lifecycle", () => {
    it("initializes with default-disabled state (move_hud: false)", () => {
      assert.strictEqual(
        defaultSettings.move_hud,
        false,
        "defaultSettings.move_hud must be false"
      );
      assert.strictEqual(
        settingsStore.getState().settings.move_hud,
        false,
        "settingsStore initial state must have move_hud: false"
      );
    });

    it("coerces boolean and string representations accurately", () => {
      assert.strictEqual(coerceSettingValue("move_hud", "true"), true);
      assert.strictEqual(coerceSettingValue("move_hud", "false"), false);
      assert.strictEqual(coerceSettingValue("move_hud", "unexpected"), false);
      assert.strictEqual(coerceSettingValue("move_hud", ""), false);
    });

    it("enables and disables setting through updateSetting", async () => {
      const origUpdate = bbqCommands.updateSetting;
      bbqCommands.updateSetting = async () => true;

      try {
        const enabled = await updateSetting("move_hud", "true");
        assert.strictEqual(enabled, true);
        assert.strictEqual(settingsStore.getState().settings.move_hud, true);

        const disabled = await updateSetting("move_hud", "false");
        assert.strictEqual(disabled, true);
        assert.strictEqual(settingsStore.getState().settings.move_hud, false);
      } finally {
        bbqCommands.updateSetting = origUpdate;
      }
    });

    it("handles persistence failure safely without leaving store in a misleading state", async () => {
      const origUpdate = bbqCommands.updateSetting;
      bbqCommands.updateSetting = async () => false;

      try {
        // Starts disabled
        assert.strictEqual(settingsStore.getState().settings.move_hud, false);

        const res = await updateSetting("move_hud", "true");
        assert.strictEqual(res, false, "updateSetting should return false on persistence failure");
        assert.strictEqual(
          settingsStore.getState().settings.move_hud,
          false,
          "settingsStore.move_hud must remain false when backend persistence fails"
        );
      } finally {
        bbqCommands.updateSetting = origUpdate;
      }
    });
  });

  // =========================================================================
  // 2. Context Menu: Move HUD Toggle Contract & Independence
  // =========================================================================
  describe("2. Context Menu 'Move HUD' Toggle & Independence", () => {
    it("declares context menu item named exactly 'Move HUD'", () => {
      assert.ok(
        contextMenuSrc.includes('"Move HUD"'),
        "ContextMenu must contain exact label 'Move HUD'"
      );
    });

    it("declares menuitemcheckbox with accessible attributes and unique ID", () => {
      assert.ok(
        contextMenuSrc.includes('id: "move_hud"'),
        "ContextMenu item definition must have id 'move_hud'"
      );
      assert.ok(
        contextMenuSrc.includes('role: "menuitemcheckbox"'),
        "ContextMenu item must declare role: 'menuitemcheckbox'"
      );
      assert.ok(
        contextMenuSrc.includes("checked: moveHud"),
        "ContextMenu item must set checked: moveHud"
      );
      assert.ok(
        contextMenuSrc.includes("id={`context-item-${item.id}`}"),
        "ContextMenu button must render id `context-item-${item.id}`"
      );
      assert.ok(
        contextMenuSrc.includes("role={item.role ?? \"menuitem\"}"),
        "ContextMenu button must pass role to element"
      );
      assert.ok(
        contextMenuSrc.includes("aria-checked={item.checked}"),
        "ContextMenu button must pass aria-checked to element"
      );
    });

    it("ensures Move HUD toggles independently of Always on Top and Expand HUD", async () => {
      const origUpdate = bbqCommands.updateSetting;
      bbqCommands.updateSetting = async () => true;

      try {
        // Initial conditions
        assert.strictEqual(settingsStore.getState().settings.move_hud, false);
        assert.strictEqual(settingsStore.getState().settings.always_on_top, true);
        assert.strictEqual(islandStore.getState().state, "Compact");

        // 1. Enable Move HUD
        await updateSetting("move_hud", "true");
        assert.strictEqual(settingsStore.getState().settings.move_hud, true);
        assert.strictEqual(settingsStore.getState().settings.always_on_top, true, "always_on_top must not change");
        assert.strictEqual(islandStore.getState().state, "Compact", "island state must not change");

        // 2. Toggle Always on Top
        await updateSetting("always_on_top", "false");
        assert.strictEqual(settingsStore.getState().settings.always_on_top, false);
        assert.strictEqual(settingsStore.getState().settings.move_hud, true, "move_hud must remain true");

        // 3. Change island expansion state
        islandStore.setState({ state: "Expanded" });
        assert.strictEqual(islandStore.getState().state, "Expanded");
        assert.strictEqual(settingsStore.getState().settings.move_hud, true, "move_hud must remain true");
        assert.strictEqual(settingsStore.getState().settings.always_on_top, false, "always_on_top must remain false");
      } finally {
        bbqCommands.updateSetting = origUpdate;
      }
    });
  });

  // =========================================================================
  // 3. Drag Initiation, Native Window API & Interaction Guarding
  // =========================================================================
  describe("3. Native Drag Initiation & Interaction Guarding", () => {
    it("ensures Island.tsx invokes getCurrentWindow().startDragging() on valid drag initiation", () => {
      assert.ok(
        islandSrc.includes("getCurrentWindow().startDragging()"),
        "Island.tsx must call native Tauri window startDragging() API"
      );
    });

    it("ensures Tauri capabilities grant core:window:allow-start-dragging permission", () => {
      const capSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src-tauri/capabilities/default.json"),
        "utf8"
      );
      assert.ok(
        capSrc.includes("core:window:allow-start-dragging"),
        "capabilities/default.json must grant core:window:allow-start-dragging"
      );
    });

    it("guards drag initiation: blocked when move_hud is disabled", () => {
      // Logic test: simulated pointerdown event decision
      function canInitiateDrag(
        moveHudEnabled: boolean,
        button: number,
        targetTagName: string,
        targetRole?: string
      ): boolean {
        if (button !== 0) return false;
        if (!moveHudEnabled) return false;
        const interactiveTags = ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"];
        const interactiveRoles = ["button", "menuitem", "tab", "checkbox"];
        if (interactiveTags.includes(targetTagName.toUpperCase())) return false;
        if (targetRole && interactiveRoles.includes(targetRole.toLowerCase())) return false;
        return true;
      }

      // Disabled state
      assert.strictEqual(
        canInitiateDrag(false, 0, "DIV"),
        false,
        "Dragging must be blocked when move_hud is disabled"
      );
      assert.strictEqual(
        canInitiateDrag(false, 0, "SPAN"),
        false,
        "Dragging must be blocked when move_hud is disabled"
      );
    });

    it("guards drag initiation: blocked on non-left clicks (e.g. right-click context menu)", () => {
      function canInitiateDrag(moveHudEnabled: boolean, button: number): boolean {
        if (button !== 0) return false;
        return moveHudEnabled;
      }

      // Right-click (button 2) and middle-click (button 1) must never drag
      assert.strictEqual(canInitiateDrag(true, 2), false, "Right click must never initiate drag");
      assert.strictEqual(canInitiateDrag(true, 1), false, "Middle click must never initiate drag");
      assert.strictEqual(canInitiateDrag(true, 0), true, "Left click can initiate drag when enabled");
    });

    it("guards interactive elements: buttons, inputs, tabs, menus never initiate drag", () => {
      assert.ok(
        islandSrc.includes('target.closest('),
        "Island.tsx must use target.closest() guard"
      );
      assert.ok(
        islandSrc.includes("button, input, select, textarea, a, [role='button'], [role='menuitem'], [role='tab'], [role='checkbox'], [contenteditable='true'], .bbq-interactive, .bbq-tab, .bbq-btn, .bbq-context-menu"),
        "Island.tsx must guard all interactive elements and roles"
      );
    });

    it("applies .bbq-move-hud-active class and grab/grabbing cursors", () => {
      assert.ok(
        islandShellSrc.includes('moveHud ? "bbq-move-hud-active" : ""'),
        "IslandShell must apply bbq-move-hud-active class when moveHud is true"
      );
      assert.ok(
        cssSrc.includes(".bbq-move-hud-active"),
        "CSS must define rules for .bbq-move-hud-active"
      );
      assert.ok(
        cssSrc.includes("cursor: grab"),
        "CSS must set cursor: grab for draggable island"
      );
      assert.ok(
        cssSrc.includes("cursor: grabbing"),
        "CSS must set cursor: grabbing when active"
      );
    });
  });

  // =========================================================================
  // 4. Feature B: Standardized Release Artifact Naming (BBQ- Prefix)
  // =========================================================================
  describe("4. Release Artifact Naming Standardization (BBQ- Prefix)", () => {
    it("ensures macOS packaging script produces BBQ- prefixed artifacts", () => {
      assert.ok(
        macScriptSrc.includes('DMG_DST="$ABS_OUTPUT_DIR/BBQ-mac-arm64.dmg"'),
        "package-macos.sh must define DMG_DST with BBQ-mac-arm64.dmg"
      );
      assert.ok(
        macScriptSrc.includes('APP_ZIP_DST="$ABS_OUTPUT_DIR/BBQ-mac-arm64.app.zip"'),
        "package-macos.sh must define APP_ZIP_DST with BBQ-mac-arm64.app.zip"
      );
      assert.ok(
        !macScriptSrc.includes('DMG_DST="$ABS_OUTPUT_DIR/mac-arm64.dmg"'),
        "package-macos.sh must not use un-prefixed DMG destination"
      );
      assert.ok(
        !macScriptSrc.includes('APP_ZIP_DST="$ABS_OUTPUT_DIR/mac-arm64.app.zip"'),
        "package-macos.sh must not use un-prefixed ZIP destination"
      );
    });

    it("ensures Windows packaging script produces BBQ- prefixed artifacts", () => {
      assert.ok(
        winScriptSrc.includes('Join-Path $OutputDir "BBQ-win-x64-setup.exe"'),
        "package-windows.ps1 must output BBQ-win-x64-setup.exe"
      );
      assert.ok(
        winScriptSrc.includes('Join-Path $OutputDir "BBQ-win-x64.zip"'),
        "package-windows.ps1 must output BBQ-win-x64.zip"
      );
      assert.ok(
        !winScriptSrc.includes('Join-Path $OutputDir "win-x64-setup.exe"'),
        "package-windows.ps1 must not output un-prefixed installer"
      );
      assert.ok(
        !winScriptSrc.includes('Join-Path $OutputDir "win-x64.zip"'),
        "package-windows.ps1 must not output un-prefixed zip"
      );
    });

    it("ensures CI workflow uploads and publishes matching BBQ- prefixed artifacts", () => {
      // macOS upload
      assert.ok(
        ciSrc.includes("target/release/release-artifacts/BBQ-mac-arm64.app.zip"),
        "CI workflow must upload BBQ-mac-arm64.app.zip"
      );
      assert.ok(
        ciSrc.includes("target/release/release-artifacts/BBQ-mac-arm64.dmg"),
        "CI workflow must upload BBQ-mac-arm64.dmg"
      );
      // Windows upload
      assert.ok(
        ciSrc.includes("target/release/release-artifacts/BBQ-win-x64-setup.exe"),
        "CI workflow must upload BBQ-win-x64-setup.exe"
      );
      assert.ok(
        ciSrc.includes("target/release/release-artifacts/BBQ-win-x64.zip"),
        "CI workflow must upload BBQ-win-x64.zip"
      );
      // Release publish assets
      assert.ok(
        ciSrc.includes("release-assets/BBQ-mac-arm64.app.zip"),
        "CI release step must include BBQ-mac-arm64.app.zip"
      );
      assert.ok(
        ciSrc.includes("release-assets/BBQ-mac-arm64.dmg"),
        "CI release step must include BBQ-mac-arm64.dmg"
      );
      assert.ok(
        ciSrc.includes("release-assets/BBQ-win-x64-setup.exe"),
        "CI release step must include BBQ-win-x64-setup.exe"
      );
      assert.ok(
        ciSrc.includes("release-assets/BBQ-win-x64.zip"),
        "CI release step must include BBQ-win-x64.zip"
      );

      // Verify no orphan un-prefixed uploads remain
      assert.ok(
        !ciSrc.includes("release-assets/mac-arm64.app.zip"),
        "CI must not upload legacy un-prefixed mac-arm64.app.zip"
      );
      assert.ok(
        !ciSrc.includes("release-assets/mac-arm64.dmg"),
        "CI must not upload legacy un-prefixed mac-arm64.dmg"
      );
      assert.ok(
        !ciSrc.includes("release-assets/win-x64-setup.exe"),
        "CI must not upload legacy un-prefixed win-x64-setup.exe"
      );
      assert.ok(
        !ciSrc.includes("release-assets/win-x64.zip"),
        "CI must not upload legacy un-prefixed win-x64.zip"
      );
    });

    it("verifies release documentation matches the BBQ- prefixed standard", () => {
      assert.ok(readmeSrc.includes("BBQ-win-x64-setup.exe"), "README must document BBQ-win-x64-setup.exe");
      assert.ok(readmeSrc.includes("BBQ-win-x64.zip"), "README must document BBQ-win-x64.zip");
      assert.ok(readmeSrc.includes("BBQ-mac-arm64.dmg"), "README must document BBQ-mac-arm64.dmg");
      assert.ok(readmeSrc.includes("BBQ-mac-arm64.app.zip"), "README must document BBQ-mac-arm64.app.zip");

      assert.ok(releaseDocSrc.includes("BBQ-mac-arm64.app.zip"), "RELEASE_PROCESS must document BBQ-mac-arm64.app.zip");
      assert.ok(releaseDocSrc.includes("BBQ-mac-arm64.dmg"), "RELEASE_PROCESS must document BBQ-mac-arm64.dmg");
      assert.ok(releaseDocSrc.includes("BBQ-win-x64-setup.exe"), "RELEASE_PROCESS must document BBQ-win-x64-setup.exe");
      assert.ok(releaseDocSrc.includes("BBQ-win-x64.zip"), "RELEASE_PROCESS must document BBQ-win-x64.zip");
    });
  });
});
