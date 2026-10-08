import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isTextEntryTarget,
  isModalOrMenuOpen,
  handleHudKeyboardNavigation,
} from "../src/island/keyboardNavigation.ts";
import { getOrderedActiveWidgets } from "../src/island/compactOrder.ts";
import { defaultSettings } from "../src/state/settingsState.ts";
import type { WidgetId } from "@bbq/types";

// Extracted Settings Tabs types
import type {
  AppearanceSettingsTabProps,
  IslandSettingsTabProps,
  HotkeySettingsTabProps,
  PrivacySettingsTabProps,
  NotificationsSettingsTabProps,
  WidgetsSettingsTabProps,
  AboutSettingsTabProps,
} from "../src/components/widgets/settings/settingsTypes.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.7 — Phase 3: Keyboard Workflows, Design System Cleanup & Settings Modularization", () => {
  // =========================================================================
  // 1. HUD Keyboard Navigation
  // =========================================================================
  describe("1. HUD Keyboard Navigation", () => {
    const tabs: WidgetId[] = ["launcher", "clipboard", "timers", "media", "settings"];

    it("Ctrl+Tab navigates to the next widget and wraps around from last to first", () => {
      let switchedTo: WidgetId | null = null;
      const onSelect = (id: WidgetId) => {
        switchedTo = id;
      };

      // From launcher (0) -> clipboard (1)
      const ev1 = {
        key: "Tab",
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        target: { tagName: "DIV", isContentEditable: false } as unknown as EventTarget,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as KeyboardEvent;

      const handled1 = handleHudKeyboardNavigation(ev1, "launcher", tabs, onSelect);
      assert.equal(handled1, true);
      assert.equal(switchedTo, "clipboard");

      // From settings (last, index 4) -> wraps to launcher (0)
      const handledWrap = handleHudKeyboardNavigation(ev1, "settings", tabs, onSelect);
      assert.equal(handledWrap, true);
      assert.equal(switchedTo, "launcher");
    });

    it("Ctrl+Shift+Tab navigates to the previous widget and wraps from first to last", () => {
      let switchedTo: WidgetId | null = null;
      const onSelect = (id: WidgetId) => {
        switchedTo = id;
      };

      const evShift = {
        key: "Tab",
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        metaKey: false,
        target: { tagName: "DIV", isContentEditable: false } as unknown as EventTarget,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as KeyboardEvent;

      // From clipboard (1) -> launcher (0)
      const handled1 = handleHudKeyboardNavigation(evShift, "clipboard", tabs, onSelect);
      assert.equal(handled1, true);
      assert.equal(switchedTo, "launcher");

      // From launcher (0) -> wraps to settings (4)
      const handledWrap = handleHudKeyboardNavigation(evShift, "launcher", tabs, onSelect);
      assert.equal(handledWrap, true);
      assert.equal(switchedTo, "settings");
    });

    it("Number keys 1-9 select corresponding visible widgets", () => {
      let switchedTo: WidgetId | null = null;
      const onSelect = (id: WidgetId) => {
        switchedTo = id;
      };

      const makeNumEvent = (key: string) =>
        ({
          key,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          metaKey: false,
          target: { tagName: "DIV", isContentEditable: false } as unknown as EventTarget,
          preventDefault: () => {},
          stopPropagation: () => {},
        } as unknown as KeyboardEvent);

      // '1' selects tabs[0] -> launcher
      const handled1 = handleHudKeyboardNavigation(makeNumEvent("1"), "timers", tabs, onSelect);
      assert.equal(handled1, true);
      assert.equal(switchedTo, "launcher");

      // '3' selects tabs[2] -> timers
      const handled3 = handleHudKeyboardNavigation(makeNumEvent("3"), "launcher", tabs, onSelect);
      assert.equal(handled3, true);
      assert.equal(switchedTo, "timers");

      // '5' selects tabs[4] -> settings
      const handled5 = handleHudKeyboardNavigation(makeNumEvent("5"), "launcher", tabs, onSelect);
      assert.equal(handled5, true);
      assert.equal(switchedTo, "settings");

      // '9' out of bounds for 5 tabs -> ignored
      switchedTo = null;
      const handled9 = handleHudKeyboardNavigation(makeNumEvent("9"), "launcher", tabs, onSelect);
      assert.equal(handled9, false);
      assert.equal(switchedTo, null);
    });

    it("isTextEntryTarget identifies input, textarea, contenteditable, and hotkey recording", () => {
      // Standard input
      assert.equal(isTextEntryTarget({ tagName: "INPUT" }), true);
      assert.equal(isTextEntryTarget({ tagName: "input" }), true);

      // Textarea
      assert.equal(isTextEntryTarget({ tagName: "TEXTAREA" }), true);

      // ContentEditable
      assert.equal(isTextEntryTarget({ tagName: "DIV", isContentEditable: true }), true);
      assert.equal(isTextEntryTarget({ tagName: "DIV", isContentEditable: false }), false);

      // Hotkey input or recording container
      assert.equal(
        isTextEntryTarget({
          tagName: "DIV",
          isContentEditable: false,
          getAttribute: (attr: string) => (attr === "data-hotkey-recording" ? "true" : null),
        }),
        true
      );

      // Null or plain element
      assert.equal(isTextEntryTarget(null), false);
      assert.equal(isTextEntryTarget(undefined), false);
      assert.equal(isTextEntryTarget({ tagName: "BUTTON" }), false);
      assert.equal(isTextEntryTarget({ tagName: "SECTION" }), false);
    });

    it("Number shortcuts are strictly ignored when typing into text entry elements", () => {
      let switchedTo: WidgetId | null = null;
      const onSelect = (id: WidgetId) => {
        switchedTo = id;
      };

      const evInInput = {
        key: "2",
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        target: { tagName: "INPUT" } as unknown as EventTarget,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as KeyboardEvent;

      const handled = handleHudKeyboardNavigation(evInInput, "launcher", tabs, onSelect);
      assert.equal(handled, false);
      assert.equal(switchedTo, null);
    });

    it("isModalOrMenuOpen safely detects active modal dialogs and context menus", () => {
      const origDoc = globalThis.document;
      try {
        // When no modal exists
        globalThis.document = {
          querySelector: () => null,
        } as unknown as Document;
        assert.equal(isModalOrMenuOpen(), false);

        // When context menu is open
        globalThis.document = {
          querySelector: (sel: string) => (sel.includes(".bbq-context-menu") ? {} : null),
        } as unknown as Document;
        assert.equal(isModalOrMenuOpen(), true);

        // When aria-modal is open
        globalThis.document = {
          querySelector: (sel: string) => (sel.includes('[aria-modal="true"]') ? {} : null),
        } as unknown as Document;
        assert.equal(isModalOrMenuOpen(), true);
      } finally {
        globalThis.document = origDoc;
      }
    });

    it("Keyboard navigation is disabled when a modal or context menu is active", () => {
      const origDoc = globalThis.document;
      try {
        globalThis.document = {
          querySelector: (sel: string) => (sel.includes(".bbq-context-menu") ? {} : null),
        } as unknown as Document;

        let switchedTo: WidgetId | null = null;
        const ev = {
          key: "Tab",
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
          metaKey: false,
          target: { tagName: "DIV", isContentEditable: false } as unknown as EventTarget,
          preventDefault: () => {},
          stopPropagation: () => {},
        } as unknown as KeyboardEvent;

        const handled = handleHudKeyboardNavigation(ev, "launcher", tabs, (id) => {
          switchedTo = id;
        });
        assert.equal(handled, false);
        assert.equal(switchedTo, null);
      } finally {
        globalThis.document = origDoc;
      }
    });
  });

  // =========================================================================
  // 2. Clipboard Keyboard Workflow
  // =========================================================================
  describe("2. Clipboard Keyboard Workflow", () => {
    it("verifies ClipboardWidget contains keyboard navigation hooks and selected styling", () => {
      const clipboardSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/widgets/ClipboardWidget.tsx"),
        "utf-8"
      );

      // Verify search input ArrowDown moves focus/selection to first card
      assert.ok(
        clipboardSrc.includes('e.key === "ArrowDown"'),
        "Clipboard search must handle ArrowDown to navigate to first card"
      );

      // Verify ArrowUp returns focus to search input
      assert.ok(
        clipboardSrc.includes('e.key === "ArrowUp"'),
        "Clipboard cards must handle ArrowUp to navigate back or upwards"
      );

      // Verify Enter triggers copy
      assert.ok(
        clipboardSrc.includes('e.key === "Enter"'),
        "Clipboard card must support Enter to copy"
      );

      // Verify selected class binding
      assert.ok(
        clipboardSrc.includes('isSelected ? " selected" : ""'),
        "Active card must have semantic selected class"
      );

      // Verify search input ref
      assert.ok(
        clipboardSrc.includes("searchInputRef"),
        "Search input must have dedicated ref for focus restoration"
      );

      // Verify card refs collection
      assert.ok(
        clipboardSrc.includes("cardRefs"),
        "Card elements must maintain refs for deterministic keyboard focus"
      );
    });

    it("verifies index.css defines .bbq-clipboard-card.selected without forbidden glow/drop-shadow", () => {
      const cssSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"),
        "utf-8"
      );

      assert.ok(
        cssSrc.includes(".bbq-clipboard-card.selected"),
        "index.css must define selected state for clipboard card"
      );

      // Extract the .bbq-clipboard-card.selected block
      const match = cssSrc.match(/\.bbq-clipboard-card\.selected\s*\{([^}]+)\}/);
      assert.ok(match, ".bbq-clipboard-card.selected rule block must exist");
      const ruleBody = match[1];

      assert.ok(
        !ruleBody.includes("drop-shadow") && !ruleBody.includes("box-shadow"),
        "Clipboard selected style must not use glow, drop-shadow, or halo effects"
      );
    });
  });

  // =========================================================================
  // 3. CSS / Design System Cleanup & Bottom Anchor Geometry
  // =========================================================================
  describe("3. CSS / Design System Cleanup & Bottom Anchor Geometry", () => {
    it("ensures canonical .bbq-island-shell consolidation without duplicate base definitions", () => {
      const cssSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"),
        "utf-8"
      );

      // Count base .bbq-island-shell { declarations
      const baseMatches = cssSrc.match(/(?:^|\n)\.bbq-island-shell\s*\{/g);
      assert.equal(
        baseMatches?.length,
        1,
        `Expected exactly 1 canonical base .bbq-island-shell definition, found ${baseMatches?.length}`
      );
    });

    it("ensures anchor-aware data-anchor selectors exist for top and bottom geometries", () => {
      const cssSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"),
        "utf-8"
      );

      // Top anchors: transform-origin top, align-items flex-start
      assert.ok(
        cssSrc.includes('[data-anchor="top-center"]'),
        "Must support top-center data-anchor"
      );
      assert.ok(
        cssSrc.includes("transform-origin: center top"),
        "Top anchors must expand downward from top origin"
      );

      // Bottom anchors: transform-origin bottom, align-items flex-end
      assert.ok(
        cssSrc.includes('[data-anchor="bottom-center"]'),
        "Must support bottom-center data-anchor"
      );
      assert.ok(
        cssSrc.includes("transform-origin: center bottom"),
        "Bottom anchors must expand upward from bottom origin"
      );
      assert.ok(
        cssSrc.includes("align-items: flex-end"),
        "Bottom container must align items to flex-end"
      );
    });

    it("verifies IslandShell attaches data-anchor attribute to shell element", () => {
      const islandShellSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/island/IslandShell.tsx"),
        "utf-8"
      );

      assert.ok(
        islandShellSrc.includes('data-anchor={islandPosition}'),
        "IslandShell must forward data-anchor attribute"
      );
    });

    it("verifies inline styles in MediaWidget and ClipboardWidget were cleaned into CSS classes", () => {
      const mediaSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/widgets/MediaWidget.tsx"),
        "utf-8"
      );
      const clipboardSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/widgets/ClipboardWidget.tsx"),
        "utf-8"
      );

      // Semantic volume classes
      assert.ok(mediaSrc.includes("bbq-media-volume-control"), "Media volume must use semantic class");
      assert.ok(mediaSrc.includes("bbq-media-volume-slider"), "Media slider must use semantic class");

      // Semantic clipboard search classes
      assert.ok(clipboardSrc.includes("bbq-clipboard-search-bar"), "Clipboard search must use semantic class");
      assert.ok(clipboardSrc.includes("bbq-clipboard-search-box"), "Clipboard search box must use semantic class");
    });
  });

  // =========================================================================
  // 4. SettingsWidget Modularization
  // =========================================================================
  describe("4. SettingsWidget Modularization", () => {
    it("ensures all 7 settings tab subcomponents exist and are exported", () => {
      const tabFiles = [
        "AppearanceSettingsTab.tsx",
        "IslandSettingsTab.tsx",
        "HotkeySettingsTab.tsx",
        "PrivacySettingsTab.tsx",
        "NotificationsSettingsTab.tsx",
        "WidgetsSettingsTab.tsx",
        "AboutSettingsTab.tsx",
      ];
      for (const file of tabFiles) {
        const fullPath = path.join(ROOT_DIR, "apps/desktop/src/components/widgets/settings", file);
        assert.ok(fs.existsSync(fullPath), `Settings tab file ${file} must exist`);
        const content = fs.readFileSync(fullPath, "utf-8");
        const componentName = file.replace(".tsx", "");
        assert.ok(
          content.includes(`export const ${componentName}`),
          `Component ${componentName} must be exported in ${file}`
        );
      }
    });

    it("ensures SettingsWidget is substantially modularized and reduced in line count", () => {
      const settingsWidgetSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/widgets/SettingsWidget.tsx"),
        "utf-8"
      );
      const lineCount = settingsWidgetSrc.split("\n").length;

      // Before modularization: ~1,365 lines. Target: < 650 lines.
      assert.ok(
        lineCount < 650,
        `SettingsWidget line count should be < 650 after modularization (currently: ${lineCount})`
      );

      // Orchestrator delegates to all 7 tabs
      assert.ok(settingsWidgetSrc.includes("<AppearanceSettingsTab"));
      assert.ok(settingsWidgetSrc.includes("<IslandSettingsTab"));
      assert.ok(settingsWidgetSrc.includes("<HotkeySettingsTab"));
      assert.ok(settingsWidgetSrc.includes("<PrivacySettingsTab"));
      assert.ok(settingsWidgetSrc.includes("<NotificationsSettingsTab"));
      assert.ok(settingsWidgetSrc.includes("<WidgetsSettingsTab"));
      assert.ok(settingsWidgetSrc.includes("<AboutSettingsTab"));
    });

    it("verifies production code is clean of Turkish comments and dev markers", () => {
      const settingsWidgetSrc = fs.readFileSync(
        path.join(ROOT_DIR, "apps/desktop/src/components/widgets/SettingsWidget.tsx"),
        "utf-8"
      );

      // Legacy Turkish comments should no longer reside in SettingsWidget.tsx
      assert.doesNotMatch(
        settingsWidgetSrc,
        /\/\/\s*(?:Orta Üst|Sol Üst|Açılışta|Günlük|Haftalık)/,
        "SettingsWidget.tsx must not contain legacy Turkish developer comments"
      );
    });
  });
});
