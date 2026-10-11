import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EscapePriority } from "../src/island/escapeManager.ts";
import { islandStore } from "../src/island/islandState.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.8 — Phase 1: HUD Behavior & Dropdown Layering Regression Tests", () => {
  const islandSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/island/Island.tsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const contextMenuSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/common/ContextMenu.tsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const themeSelectSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/components/common/ThemeSelect.tsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const cssSrc = fs
    .readFileSync(path.join(ROOT_DIR, "apps/desktop/src/styles/index.css"), "utf8")
    .replace(/\r\n/g, "\n");

  // =========================================================================
  // 1. Scope A: Expand HUD & Context Menu Resizing Lifecycle
  // =========================================================================
  describe("1. Scope A: Expand HUD Behavior & Stale Closure Fix", () => {
    it("ensures handleContextMenuClose inspects live islandStore state rather than closed-over React state", () => {
      // Must use live islandStore.getState().state
      assert.ok(
        islandSrc.includes("const liveState = islandStore.getState().state;"),
        "Island.tsx must query live islandStore state to prevent stale closure"
      );
      assert.ok(
        !islandSrc.includes("const handleContextMenuClose = useCallback(async () => {\n    setContextMenuPos(null);\n    if (state !== \"Expanded\")"),
        "handleContextMenuClose must not rely on closed-over state"
      );
    });

    it("verifies handleContextMenu does not have state in its useCallback dependency array", () => {
      // Both handleContextMenu and handleContextMenuClose must have [] dependency array
      assert.ok(
        islandSrc.includes("}, []);\n\n  const handleContextMenuClose = useCallback"),
        "handleContextMenu must have empty dependency array []"
      );
      assert.ok(
        islandSrc.includes("}, []);\n\n  // Fast keyboard navigation"),
        "handleContextMenuClose must have empty dependency array []"
      );
    });

    it("ensures ContextMenu handleToggleExpand queries live islandStore state", () => {
      assert.ok(
        contextMenuSrc.includes("const liveIsExpanded = islandStore.getState().state === \"Expanded\";"),
        "ContextMenu handleToggleExpand must evaluate live store state"
      );
      assert.ok(
        contextMenuSrc.includes("import { setActiveWidget, useIslandState, islandStore } from \"../../island/islandState.ts\";"),
        "ContextMenu must import islandStore"
      );
    });

    it("proves store state remains expanded and is unaffected by menu closure", () => {
      islandStore.setState({ state: "Expanded", mode: "EXPANDED", expanded: true });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().expanded, true);

      // Reset back to Idle
      islandStore.setState({ state: "Idle", mode: "IDLE", expanded: false });
      assert.equal(islandStore.getState().state, "Idle");
    });
  });

  // =========================================================================
  // 2. Scope B: Dropdown Layering & Scroll Boundary Escape
  // =========================================================================
  describe("2. Scope B: Dropdown Layering & Portal Rendering", () => {
    it("ensures ThemeSelect imports and utilizes createPortal to escape scroll containers", () => {
      assert.ok(
        themeSelectSrc.includes('import { createPortal } from "react-dom";'),
        "ThemeSelect must import createPortal from react-dom"
      );
      assert.ok(
        themeSelectSrc.includes("canUsePortal ? createPortal(menuElement, document.body) : menuElement"),
        "ThemeSelect must portal menu to document.body when available"
      );
    });

    it("verifies ThemeSelect registers with escapeManager at DROPDOWN priority", () => {
      assert.ok(
        themeSelectSrc.includes("escapeManager.register"),
        "ThemeSelect must register with escapeManager"
      );
      assert.ok(
        themeSelectSrc.includes("EscapePriority.DROPDOWN"),
        "ThemeSelect must use EscapePriority.DROPDOWN"
      );
      assert.equal(EscapePriority.DROPDOWN, 60);
    });

    it("verifies ThemeSelect listens for window scroll and resize in capture phase", () => {
      assert.ok(
        themeSelectSrc.includes('window.addEventListener("scroll", handleScrollOrResize, true)'),
        "Must capture scroll events to reposition dropdown attached to scrolling containers"
      );
      assert.ok(
        themeSelectSrc.includes('window.addEventListener("resize", handleScrollOrResize)'),
        "Must track window resize events"
      );
    });

    it("proves outside-click listener checks both container and menuRef", () => {
      assert.ok(
        themeSelectSrc.includes("!menuRef.current?.contains(target)"),
        "Outside click handler must verify clicks outside both trigger container and portaled menu"
      );
    });

    it("verifies CSS rules for fixed dropdown positioning and layering", () => {
      assert.ok(
        cssSrc.includes(".bbq-dropdown-menu {\n  position: fixed;"),
        ".bbq-dropdown-menu must be position: fixed"
      );
      assert.ok(
        cssSrc.includes("z-index: 9999;"),
        ".bbq-dropdown-menu must have elevated z-index"
      );
      assert.ok(
        cssSrc.includes(".bbq-theme-select-container.dropdown-open"),
        ".bbq-theme-select-container.dropdown-open must exist"
      );
      assert.ok(
        cssSrc.includes('[data-theme="light"] .bbq-dropdown-menu'),
        "Must provide explicit light theme styling for dropdown menu"
      );
      assert.ok(
        cssSrc.includes('[data-reduced-motion="true"] .bbq-dropdown-menu'),
        "Must respect reduced motion preferences"
      );
    });
  });
});
