import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bbqCommands } from "../src/ipc/commands.ts";
import {
  settingsStore,
  initialSettingsState,
  defaultSettings,
  updateSetting,
  LOCAL_STORAGE_SETTINGS_KEY,
} from "../src/state/settingsState.ts";
import type { BbqSettings } from "@bbq/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ v1.3 — M11-A Settings State Synchronization & IPC Observability Tests", () => {
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

    // Mock IPC command for updateSetting
    bbqCommands.updateSetting = async (key: string, value: string): Promise<boolean> => {
      if (backendShouldFail) {
        return false;
      }
      (mockBackendSettings as any)[key] = value;
      return true;
    };
  });

  describe("M11-A.1: Settings State Synchronization (Single Setting Updates)", () => {
    it("1. successful theme update synchronizes settingsStore, DOM attribute, and localStorage", async () => {
      const ok = await updateSetting("theme", "dark");
      assert.strictEqual(ok, true);

      // Verify store
      const current = settingsStore.getState().settings;
      assert.strictEqual(current.theme, "dark");

      // Verify localStorage
      const stored = globalThis.localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      assert.notStrictEqual(stored, null);
      const parsed = JSON.parse(stored!);
      assert.strictEqual(parsed.theme, "dark");

      // Verify DOM
      if (typeof document !== "undefined" && document.documentElement) {
        assert.strictEqual(document.documentElement.getAttribute("data-theme"), "dark");
      }
    });

    it("2. successful reduced_motion update synchronizes store, DOM, and localStorage", async () => {
      const ok = await updateSetting("reduced_motion", "true");
      assert.strictEqual(ok, true);

      const current = settingsStore.getState().settings;
      assert.strictEqual(current.reduced_motion, true);

      const stored = globalThis.localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      assert.notStrictEqual(stored, null);
      assert.strictEqual(JSON.parse(stored!).reduced_motion, true);

      if (typeof document !== "undefined" && document.documentElement) {
        assert.strictEqual(document.documentElement.getAttribute("data-reduced-motion"), "true");
      }
    });

    it("3. successful island_width update synchronizes numeric store value and localStorage", async () => {
      const ok = await updateSetting("island_width", "360");
      assert.strictEqual(ok, true);

      const current = settingsStore.getState().settings;
      assert.strictEqual(current.island_width, 360);

      const stored = globalThis.localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      assert.notStrictEqual(stored, null);
      assert.strictEqual(JSON.parse(stored!).island_width, 360);
    });

    it("4. successful island_height update synchronizes numeric store value and localStorage", async () => {
      const ok = await updateSetting("island_height", "52");
      assert.strictEqual(ok, true);

      const current = settingsStore.getState().settings;
      assert.strictEqual(current.island_height, 52);

      const stored = globalThis.localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      assert.notStrictEqual(stored, null);
      assert.strictEqual(JSON.parse(stored!).island_height, 52);
    });

    it("5. successful accent_color update preserves existing preset functionality and custom_accent_color", async () => {
      const ok = await updateSetting("accent_color", "purple");
      assert.strictEqual(ok, true);

      const current = settingsStore.getState().settings;
      assert.strictEqual(current.accent_color, "purple");

      const stored = globalThis.localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      assert.notStrictEqual(stored, null);
      assert.strictEqual(JSON.parse(stored!).accent_color, "purple");

      if (typeof document !== "undefined" && document.documentElement) {
        assert.strictEqual(document.documentElement.getAttribute("data-accent"), "purple");
      }
    });

    it("6. backend failure does NOT mutate settingsStore or overwrite localStorage", async () => {
      // Establish initial state
      await updateSetting("theme", "light");
      const initialStored = globalThis.localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
      assert.strictEqual(settingsStore.getState().settings.theme, "light");

      // Trigger failure
      backendShouldFail = true;
      const ok = await updateSetting("theme", "dark");
      assert.strictEqual(ok, false);

      // Verify store remains unchanged
      assert.strictEqual(settingsStore.getState().settings.theme, "light");
      // Verify localStorage remains unchanged
      assert.strictEqual(globalThis.localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY), initialStored);
    });
  });

  describe("M11-A.3: IPC Error Observability & Fallback Behavior Verification", () => {
    let warnCalls: string[] = [];
    const origWarn = console.warn;

    beforeEach(() => {
      warnCalls = [];
      console.warn = (...args: any[]) => {
        warnCalls.push(args.map((a) => String(a)).join(" "));
      };
    });

    it("7. getDisplays emits structured warning and safely returns empty array upon invoke rejection", async () => {
      // Ensure global __TAURI_INTERNALS__ is present
      if (!globalThis.window) {
        // @ts-expect-error Mocking window in Node test runner
        globalThis.window = {} as any;
      }
      if (!globalThis.window.__TAURI_INTERNALS__) {
        globalThis.window.__TAURI_INTERNALS__ = {} as any;
      }
      const origInternalInvoke = globalThis.window.__TAURI_INTERNALS__.invoke;
      globalThis.window.__TAURI_INTERNALS__.invoke = async (cmd: string) => {
        if (cmd === "get_displays") {
          throw new Error("Display server connection terminated");
        }
        return [];
      };

      try {
        const displays = await bbqCommands.getDisplays();
        assert.deepStrictEqual(displays, []);
        assert.strictEqual(warnCalls.length, 1);
        assert.ok(warnCalls[0].includes("bbqCommands.getDisplays failed"));
        assert.ok(warnCalls[0].includes("Display server connection terminated"));
      } finally {
        globalThis.window.__TAURI_INTERNALS__.invoke = origInternalInvoke;
        console.warn = origWarn;
      }
    });

    it("8. clipboardGetHistory emits structured warning and safely returns empty list upon rejection", async () => {
      if (!globalThis.window) {
        // @ts-expect-error Mocking window
        globalThis.window = {} as any;
      }
      if (!globalThis.window.__TAURI_INTERNALS__) {
        globalThis.window.__TAURI_INTERNALS__ = {} as any;
      }
      const origInternalInvoke = globalThis.window.__TAURI_INTERNALS__.invoke;
      globalThis.window.__TAURI_INTERNALS__.invoke = async (cmd: string) => {
        if (cmd === "clipboard_get_history") {
          throw new Error("Clipboard format access denied");
        }
        return [];
      };

      try {
        const history = await bbqCommands.clipboardGetHistory();
        assert.deepStrictEqual(history, []);
        assert.strictEqual(warnCalls.length, 1);
        assert.ok(warnCalls[0].includes("bbqCommands.clipboardGetHistory failed"));
        assert.ok(warnCalls[0].includes("Clipboard format access denied"));
      } finally {
        globalThis.window.__TAURI_INTERNALS__.invoke = origInternalInvoke;
        console.warn = origWarn;
      }
    });

    it("9. clipboardGetStatus emits structured warning and safely returns null upon rejection", async () => {
      if (!globalThis.window) {
        // @ts-expect-error Mocking window
        globalThis.window = {} as any;
      }
      if (!globalThis.window.__TAURI_INTERNALS__) {
        globalThis.window.__TAURI_INTERNALS__ = {} as any;
      }
      const origInternalInvoke = globalThis.window.__TAURI_INTERNALS__.invoke;
      globalThis.window.__TAURI_INTERNALS__.invoke = async (cmd: string) => {
        if (cmd === "clipboard_get_status") {
          throw new Error("Clipboard service unavailable");
        }
        return null;
      };

      try {
        const status = await bbqCommands.clipboardGetStatus();
        assert.strictEqual(status, null);
        assert.strictEqual(warnCalls.length, 1);
        assert.ok(warnCalls[0].includes("bbqCommands.clipboardGetStatus failed"));
        assert.ok(warnCalls[0].includes("Clipboard service unavailable"));
      } finally {
        globalThis.window.__TAURI_INTERNALS__.invoke = origInternalInvoke;
        console.warn = origWarn;
      }
    });

    it("10. getServiceStatuses emits structured warning and safely returns empty list upon rejection", async () => {
      if (!globalThis.window) {
        // @ts-expect-error Mocking window
        globalThis.window = {} as any;
      }
      if (!globalThis.window.__TAURI_INTERNALS__) {
        globalThis.window.__TAURI_INTERNALS__ = {} as any;
      }
      const origInternalInvoke = globalThis.window.__TAURI_INTERNALS__.invoke;
      globalThis.window.__TAURI_INTERNALS__.invoke = async (cmd: string) => {
        if (cmd === "get_service_statuses") {
          throw new Error("Service registry locked during query");
        }
        return [];
      };

      try {
        const statuses = await bbqCommands.getServiceStatuses();
        assert.deepStrictEqual(statuses, []);
        assert.strictEqual(warnCalls.length, 1);
        assert.ok(warnCalls[0].includes("bbqCommands.getServiceStatuses failed"));
        assert.ok(warnCalls[0].includes("Service registry locked during query"));
      } finally {
        globalThis.window.__TAURI_INTERNALS__.invoke = origInternalInvoke;
        console.warn = origWarn;
      }
    });

    it("11. static audit: verifies no raw clipboard or sensitive payloads logged in commands.ts", () => {
      const commandsSrc = fs.readFileSync(
        path.join(__dirname, "../src/ipc/commands.ts"),
        "utf8"
      );
      assert.strictEqual(commandsSrc.includes("console.log"), false, "No console.log permitted in commands.ts");
      assert.ok(
        commandsSrc.includes('console.warn("bbqCommands.getDisplays failed, falling back to empty list:", err)'),
        "Safe error context must be logged for getDisplays"
      );
      assert.ok(
        commandsSrc.includes('console.warn("bbqCommands.clipboardGetHistory failed, falling back to empty history:", err)'),
        "Safe error context must be logged for clipboardGetHistory"
      );
      assert.ok(
        commandsSrc.includes('console.warn("bbqCommands.clipboardGetStatus failed, falling back to null:", err)'),
        "Safe error context must be logged for clipboardGetStatus"
      );
      assert.ok(
        commandsSrc.includes('console.warn("bbqCommands.getServiceStatuses failed, falling back to empty list:", err)'),
        "Safe error context must be logged for getServiceStatuses"
      );
    });
  });
});
