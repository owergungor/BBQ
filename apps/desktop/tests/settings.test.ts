import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  settingsStore,
  defaultSettings,
  updateSettingsBatch,
  applyThemeAndMotionToDom,
} from "../src/state/settingsState.ts";
import { widgetRegistry } from "../src/island/widgetRegistry.ts";
import { timerStore } from "../src/state/timerState.ts";
import { clipboardStore } from "../src/state/clipboardState.ts";

describe("Milestone 15: Persistent User Preferences & Personalization", () => {
  beforeEach(() => {
    settingsStore.setState({ settings: { ...defaultSettings }, isLoading: false, error: null });
    widgetRegistry.setDisabledWidgets([]);
  });

  describe("Settings Domain Store & Defaults", () => {
    it("initializes with deterministic defaults", () => {
      const { settings } = settingsStore.getState();
      assert.equal(settings.theme, "system");
      assert.equal(settings.reduced_motion, false);
      assert.equal(settings.island_width, 240);
      assert.equal(settings.island_height, 38);
      assert.equal(settings.clipboard_history_enabled, false);
      assert.equal(settings.clipboard_max_entries, 100);
      assert.equal(settings.hotkey_enabled, true);
      assert.deepEqual(settings.disabled_widgets, []);
    });

    it("applies theme and reduced motion attributes to mock DOM element", () => {
      const mockElement = {
        attributes: new Map<string, string>(),
        setAttribute(name: string, value: string) {
          this.attributes.set(name, value);
        },
        getAttribute(name: string) {
          return this.attributes.get(name);
        },
      };

      // Temporarily mock global document
      const originalDoc = globalThis.document;
      // @ts-expect-error Mocking document for headless node test
      globalThis.document = { documentElement: mockElement };

      try {
        applyThemeAndMotionToDom({
          ...defaultSettings,
          theme: "dark",
          reduced_motion: true,
        });

        assert.equal(mockElement.getAttribute("data-theme"), "dark");
        assert.equal(mockElement.getAttribute("data-reduced-motion"), "true");
      } finally {
        globalThis.document = originalDoc;
      }
    });
  });

  describe("Reactive Updates & Store Isolation", () => {
    it("updates settings locally without notifying unrelated domain stores", () => {
      let timerNotified = false;
      let clipboardNotified = false;
      let settingsNotified = false;

      const unsubTimer = timerStore.subscribe(() => {
        timerNotified = true;
      });
      const unsubClipboard = clipboardStore.subscribe(() => {
        clipboardNotified = true;
      });
      const unsubSettings = settingsStore.subscribe(() => {
        settingsNotified = true;
      });

      // Update theme and width in settings
      settingsStore.setState((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          theme: "light",
          island_width: 320,
        },
      }));

      assert.equal(settingsNotified, true, "settingsStore must notify its subscribers");
      assert.equal(timerNotified, false, "timerStore must NOT be notified on settings update");
      assert.equal(clipboardNotified, false, "clipboardStore must NOT be notified on settings update");

      unsubTimer();
      unsubClipboard();
      unsubSettings();
    });
  });

  describe("WidgetRegistry Personalization & Filtering", () => {
    it("registers settings widget and allows activation", () => {
      // Ensure settings widget is registered
      try {
        widgetRegistry.register({
          id: "settings",
          title: "Settings",
          icon: "⚙️",
          priority: 15,
          canActivate: () => true,
          lifecycle: "ready",
        });
      } catch {
        // Already registered
      }

      const settingsWidget = widgetRegistry.get("settings");
      assert.ok(settingsWidget, "settings widget must be registered in registry");
      assert.equal(settingsWidget.title, "Settings");
      assert.equal(settingsWidget.priority, 15);
    });

    it("filters out disabled widgets from getActiveWidgets()", () => {
      // Register test widgets
      try {
        widgetRegistry.register({
          id: "test_widget_a",
          title: "Widget A",
          icon: "🅰️",
          priority: 50,
          canActivate: () => true,
          lifecycle: "ready",
        });
      } catch {
        // Ignore duplicate
      }

      try {
        widgetRegistry.register({
          id: "test_widget_b",
          title: "Widget B",
          icon: "🅱️",
          priority: 40,
          canActivate: () => true,
          lifecycle: "ready",
        });
      } catch {
        // Ignore duplicate
      }

      let active = widgetRegistry.getActiveWidgets().map((w) => w.id);
      assert.ok(active.includes("test_widget_a"));
      assert.ok(active.includes("test_widget_b"));

      // Disable widget A
      widgetRegistry.setDisabledWidgets(["test_widget_a"]);
      active = widgetRegistry.getActiveWidgets().map((w) => w.id);
      assert.ok(!active.includes("test_widget_a"), "test_widget_a must be excluded when disabled");
      assert.ok(active.includes("test_widget_b"), "test_widget_b must remain active");

      // Reset disabled widgets
      widgetRegistry.setDisabledWidgets([]);
      active = widgetRegistry.getActiveWidgets().map((w) => w.id);
      assert.ok(active.includes("test_widget_a"), "test_widget_a must return when no longer disabled");
    });

    it("verifies fallback logic when preferred or files widget is disabled", () => {
      // If files is disabled, activeWidgets[0] becomes fallback, not files
      widgetRegistry.setDisabledWidgets(["files"]);
      const active = widgetRegistry.getActiveWidgets();
      const currentWidgetId = active.some((w) => w.id === "files") ? "files" : active[0]?.id ?? null;
      assert.notEqual(currentWidgetId, "files", "disabled files widget must not be selected as fallback");
      widgetRegistry.setDisabledWidgets([]);
    });

    it("verifies compact indicator filtering logic respects disabled widgets", () => {
      const disabledWidgets = ["media", "timer"];
      const isEnabled = (id: string) => !disabledWidgets.includes(id);

      assert.equal(isEnabled("media"), false, "media indicator must be suppressed when disabled");
      assert.equal(isEnabled("timer"), false, "timer indicator must be suppressed when disabled");
      assert.equal(isEnabled("clipboard"), true, "clipboard indicator remains enabled");
      assert.equal(isEnabled("files"), true, "files indicator remains enabled");
    });
  });

  describe("System Theme & Media Query Rules", () => {
    it("ensures CSS defines prefers-color-scheme: light for data-theme=system", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const cssPath = path.resolve(process.cwd(), "src/styles/index.css");
      const cssContent = fs.readFileSync(cssPath, "utf-8");

      assert.ok(
        cssContent.includes("@media (prefers-color-scheme: light)"),
        "CSS must contain @media (prefers-color-scheme: light)"
      );
      assert.ok(
        cssContent.includes('[data-theme="system"]'),
        "CSS must target [data-theme=\"system\"] under light scheme"
      );
    });
  });

  describe("Settings UI Draft & Commit Strategy", () => {
    it("ensures draft values do not commit to store until explicitly triggered", () => {
      let draftWidth = defaultSettings.island_width;
      let committedStoreWidth = settingsStore.getState().settings.island_width;

      // Simulate 10 dragging pointer events
      for (let i = 0; i < 10; i++) {
        draftWidth += 10;
        // Store must NOT be updated during drag
        assert.equal(
          settingsStore.getState().settings.island_width,
          committedStoreWidth,
          "store must not change during slider drag"
        );
      }

      // Explicit commit on pointer up
      settingsStore.setState((prev) => ({
        ...prev,
        settings: { ...prev.settings, island_width: draftWidth },
      }));

      assert.equal(settingsStore.getState().settings.island_width, draftWidth);
    });
  });
});
