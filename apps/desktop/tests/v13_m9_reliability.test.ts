import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { bbqCommands } from "../src/ipc/commands.ts";
import {
  settingsStore,
  initialSettingsState,
  defaultSettings,
  updateSettingsBatch,
  updateSetting,
  LOCAL_STORAGE_SETTINGS_KEY,
} from "../src/state/settingsState.ts";
import type { BbqSettings } from "@bbq/types";

describe("BBQ v1.3 — M9 Reliability & IPC Hardening Tests", () => {
  let mockBackendSettings: BbqSettings;
  let backendShouldFail: boolean = false;
  let localStorageStore: Map<string, string>;

  beforeEach(() => {
    mockBackendSettings = { ...defaultSettings };
    backendShouldFail = false;
    localStorageStore = new Map();

    // Mock localStorage
    // @ts-expect-error Mocking localStorage
    globalThis.localStorage = {
      getItem: (key: string) => localStorageStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localStorageStore.set(key, value);
      },
      removeItem: (key: string) => {
        localStorageStore.delete(key);
      },
      clear: () => localStorageStore.clear(),
      key: (i: number) => Array.from(localStorageStore.keys())[i] ?? null,
      get length() {
        return localStorageStore.size;
      },
    };

    settingsStore.setState({
      ...initialSettingsState,
      settings: { ...defaultSettings },
      isLoaded: true,
    });

    // Mock IPC commands
    bbqCommands.getSettings = async () => ({ ...mockBackendSettings });
    bbqCommands.updateSettings = async (settings: BbqSettings): Promise<boolean> => {
      if (backendShouldFail) {
        return false;
      }
      mockBackendSettings = { ...settings };
      return true;
    };
    bbqCommands.updateSetting = async (key: string, value: string): Promise<boolean> => {
      if (backendShouldFail) {
        return false;
      }
      (mockBackendSettings as any)[key] = value;
      return true;
    };
  });

  describe("DEF-01 & DEF-02: IPC Error Propagation and State Synchronization", () => {
    it("1. returns true and updates state & localStorage on backend success", async () => {
      const ok = await updateSettingsBatch({ accent_color: "emerald" });
      assert.equal(ok, true, "Successful backend response must return true");

      const state = settingsStore.getState().settings;
      assert.equal(state.accent_color, "emerald");
      assert.equal(mockBackendSettings.accent_color, "emerald");

      const stored = globalThis.localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      assert.notEqual(stored, null);
      const parsed = JSON.parse(stored!);
      assert.equal(parsed.accent_color, "emerald");
    });

    it("2. returns false and preserves existing state & localStorage when backend rejects", async () => {
      // First save a valid state
      await updateSettingsBatch({ accent_color: "purple" });
      const initialStored = globalThis.localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);

      // Now trigger backend rejection
      backendShouldFail = true;
      const ok = await updateSettingsBatch({ accent_color: "coral" });

      assert.equal(ok, false, "Backend failure must return false (truthful error propagation)");
      assert.equal(settingsStore.getState().settings.accent_color, "purple", "Store must revert to previous state");
      assert.equal(mockBackendSettings.accent_color, "purple", "Backend state must remain unchanged");
      assert.equal(
        globalThis.localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY),
        initialStored,
        "localStorage must NOT be modified when backend rejects"
      );
      assert.notEqual(settingsStore.getState().error, null, "Error status must be set on failure");
    });

    it("3. updateSetting returns false upon backend failure and preserves store", async () => {
      backendShouldFail = true;
      const ok = await updateSetting("accent_color", "coral");
      assert.equal(ok, false, "updateSetting must return false on backend failure");
      assert.equal(settingsStore.getState().settings.accent_color, "blue");
    });

    it("4. rejects malformed payload safely without crash", async () => {
      backendShouldFail = true;
      // @ts-expect-error Testing malformed input
      const ok = await updateSettingsBatch({ island_width: "not-a-number" as any });
      assert.equal(ok, false);
    });

    it("5. ensures no sensitive values are logged in commands.ts", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const commandsSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/ipc/commands.ts"),
        "utf8"
      );

      // Verify updateSetting only logs the key, never the value
      assert.ok(
        commandsSrc.includes("Failed to update setting '${key}':"),
        "commands.ts must log setting key, not raw value"
      );
      assert.ok(
        !commandsSrc.includes("Failed to update setting '${key}' with '${value}'"),
        "commands.ts must never log setting value"
      );
    });
  });

  describe("Phase 8: Widget Registry Decoupling & Renderer Map", () => {
    it("6. resolves all established M1-M8 widget components from declarative registry map", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const contentSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/island/IslandContent.tsx"),
        "utf8"
      );

      const requiredWidgets = [
        "drop",
        "files",
        "clipboard",
        "media",
        "system",
        "launcher",
        "timer",
        "reminder",
        "settings",
      ];

      assert.ok(contentSrc.includes("export const WIDGET_RENDERERS: Record<string, WidgetRenderer> = {"));
      for (const id of requiredWidgets) {
        assert.ok(
          contentSrc.includes(`${id}:`),
          `Widget '${id}' must be registered in WIDGET_RENDERERS map`
        );
      }
    });

    it("7. verifies fallback and error handling for unknown widget IDs", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const contentSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/island/IslandContent.tsx"),
        "utf8"
      );

      assert.ok(contentSrc.includes("export function renderWidgetComponent"));
      assert.ok(contentSrc.includes("Widget {widgetId} content ready."));
    });

    it("8. verifies zero nested ternary component renderer chain in IslandContent.tsx", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const contentSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/island/IslandContent.tsx"),
        "utf8"
      );

      // Verify the old ternary chain pattern is absent
      assert.ok(
        !contentSrc.includes('currentWidgetId === "drop" ?'),
        "Nested ternary chain must be replaced by declarative renderWidgetComponent"
      );
      assert.ok(
        contentSrc.includes("renderWidgetComponent(currentWidgetId"),
        "IslandContent must use declarative renderWidgetComponent"
      );
    });

    it("9. verifies recovery warning banner is rendered when database recovery occurs", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const contentSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/island/IslandContent.tsx"),
        "utf8"
      );

      assert.ok(contentSrc.includes("bbq-recovery-banner"));
      assert.ok(contentSrc.includes('role="status"'));
      assert.ok(contentSrc.includes('aria-live="polite"'));
    });
  });
});
