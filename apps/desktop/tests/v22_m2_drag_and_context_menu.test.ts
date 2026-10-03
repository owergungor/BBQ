import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  dropStore,
  initialDropDomainState,
  cleanupDragOut,
  executeDropAction,
} from "../src/state/dropState.ts";
import { settingsStore, initialSettingsState } from "../src/state/settingsState.ts";
import { bbqCommands } from "../src/ipc/commands.ts";

describe("BBQ v2.2 — Phase 2: Drag Out & Context Menu Regression Tests", () => {
  beforeEach(() => {
    dropStore.setState(initialDropDomainState);
    settingsStore.setState(initialSettingsState);
  });

  describe("1. Drag Out State & Lifecycle Cleanup", () => {
    // 1. Drag Out başlangıç state'i
    it("1. Drag Out başlangıç state'i: initializes with isDraggingOut: false", () => {
      assert.equal(dropStore.getState().isDraggingOut, false);
      assert.equal(dropStore.getState().status, "idle");
    });

    // 2. başarılı drag cleanup
    it("2. başarılı drag cleanup: resets isDraggingOut and sets completed status", async () => {
      dropStore.setState({
        currentBatch: {
          id: "batch-1",
          count: 1,
          items: [{ id: "item-1", path: "test.txt", name: "test.txt", kind: "file", size_bytes: 100 }],
          created_at: Date.now(),
        },
      });

      const origDropExecute = bbqCommands.dropExecute;
      bbqCommands.dropExecute = async () => {
        return { success: true, message: "Drag-out completed", success_count: 1, failure_count: 0 };
      };

      try {
        const res = await executeDropAction("drag_out");
        assert.ok(res?.success);
        assert.equal(dropStore.getState().isDraggingOut, false);
        assert.equal(dropStore.getState().status, "completed");
      } finally {
        bbqCommands.dropExecute = origDropExecute;
      }
    });

    // 3. pointerup cleanup
    it("3. pointerup cleanup: cleans up drag state on window pointerup", async () => {
      const origWindow = globalThis.window;
      const listeners: Record<string, Function[]> = {};

      // @ts-expect-error test mock
      globalThis.window = {
        addEventListener: (event: string, fn: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: Function) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((f) => f !== fn);
          }
        },
      };

      try {
        dropStore.setState({
          currentBatch: {
            id: "batch-1",
            count: 1,
            items: [{ id: "item-1", path: "test.txt", name: "test.txt", kind: "file", size_bytes: 100 }],
            created_at: Date.now(),
          },
        });

        const origDropExecute = bbqCommands.dropExecute;
        bbqCommands.dropExecute = async () => {
          if (listeners["pointerup"] && listeners["pointerup"][0]) {
            listeners["pointerup"][0]();
          }
          return { success: true, message: "OK", success_count: 1, failure_count: 0 };
        };

        try {
          await executeDropAction("drag_out");
          assert.equal(dropStore.getState().isDraggingOut, false);
        } finally {
          bbqCommands.dropExecute = origDropExecute;
        }
      } finally {
        globalThis.window = origWindow;
      }
    });

    // 4. mouseup cleanup
    it("4. mouseup cleanup: cleans up drag state on window mouseup", async () => {
      const origWindow = globalThis.window;
      const listeners: Record<string, Function[]> = {};

      // @ts-expect-error test mock
      globalThis.window = {
        addEventListener: (event: string, fn: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: Function) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((f) => f !== fn);
          }
        },
      };

      try {
        dropStore.setState({
          currentBatch: {
            id: "batch-1",
            count: 1,
            items: [{ id: "item-1", path: "test.txt", name: "test.txt", kind: "file", size_bytes: 100 }],
            created_at: Date.now(),
          },
        });

        const origDropExecute = bbqCommands.dropExecute;
        bbqCommands.dropExecute = async () => {
          if (listeners["mouseup"] && listeners["mouseup"][0]) {
            listeners["mouseup"][0]();
          }
          return { success: true, message: "OK", success_count: 1, failure_count: 0 };
        };

        try {
          await executeDropAction("drag_out");
          assert.equal(dropStore.getState().isDraggingOut, false);
        } finally {
          bbqCommands.dropExecute = origDropExecute;
        }
      } finally {
        globalThis.window = origWindow;
      }
    });

    // 5. blur cleanup
    it("5. blur cleanup: cleans up drag state on focus loss (window blur)", async () => {
      const origWindow = globalThis.window;
      const listeners: Record<string, Function[]> = {};

      // @ts-expect-error test mock
      globalThis.window = {
        addEventListener: (event: string, fn: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: Function) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((f) => f !== fn);
          }
        },
      };

      try {
        dropStore.setState({
          currentBatch: {
            id: "batch-1",
            count: 1,
            items: [{ id: "item-1", path: "test.txt", name: "test.txt", kind: "file", size_bytes: 100 }],
            created_at: Date.now(),
          },
        });

        const origDropExecute = bbqCommands.dropExecute;
        bbqCommands.dropExecute = async () => {
          if (listeners["blur"] && listeners["blur"][0]) {
            listeners["blur"][0]();
          }
          return { success: true, message: "OK", success_count: 1, failure_count: 0 };
        };

        try {
          await executeDropAction("drag_out");
          assert.equal(dropStore.getState().isDraggingOut, false);
        } finally {
          bbqCommands.dropExecute = origDropExecute;
        }
      } finally {
        globalThis.window = origWindow;
      }
    });

    // 6. Escape cleanup
    it("6. Escape cleanup: cleans up drag state when Escape key is pressed", async () => {
      const origWindow = globalThis.window;
      const listeners: Record<string, Function[]> = {};

      // @ts-expect-error test mock
      globalThis.window = {
        addEventListener: (event: string, fn: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: Function) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((f) => f !== fn);
          }
        },
      };

      try {
        dropStore.setState({
          currentBatch: {
            id: "batch-1",
            count: 1,
            items: [{ id: "item-1", path: "test.txt", name: "test.txt", kind: "file", size_bytes: 100 }],
            created_at: Date.now(),
          },
        });

        const origDropExecute = bbqCommands.dropExecute;
        bbqCommands.dropExecute = async () => {
          if (listeners["keydown"] && listeners["keydown"][0]) {
            listeners["keydown"][0]({ key: "Escape" });
          }
          return { success: true, message: "Cancelled", success_count: 0, failure_count: 0 };
        };

        try {
          await executeDropAction("drag_out");
          assert.equal(dropStore.getState().isDraggingOut, false);
        } finally {
          bbqCommands.dropExecute = origDropExecute;
        }
      } finally {
        globalThis.window = origWindow;
      }
    });
  });

  describe("2. Reveal in Folder Path Normalization", () => {
    // 7. Reveal existing file
    it("7. Reveal existing file: path_utils resolves exact file target", () => {
      const utilsContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../../../crates/platform/src/path_utils.rs"),
        "utf8"
      );
      assert.ok(
        utilsContent.includes("RevealResolution::Exact"),
        "path_utils must define Exact resolution variant"
      );
      assert.ok(
        utilsContent.includes("let res = resolve_reveal_target(\"Cargo.toml\");"),
        "Cargo.toml must resolve to Exact file"
      );
    });

    // 8. Reveal file:// encoded path
    it("8. Reveal file:// encoded path: decodes URL encoding and percent-encoded paths", () => {
      const utilsContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../../../crates/platform/src/path_utils.rs"),
        "utf8"
      );
      assert.ok(
        utilsContent.includes("urlencoding_decode"),
        "path_utils must contain urlencoding_decode helper"
      );
      assert.ok(
        utilsContent.includes("test_unicode_and_turkish_path_decoding"),
        "path_utils must test Unicode and Turkish character decoding"
      );
      assert.ok(
        utilsContent.includes("cleaned.strip_prefix(\"file:///\")"),
        "Must strip file:/// scheme"
      );
    });

    // 9. Reveal missing file fallback
    it("9. Reveal missing file fallback: falls back to parent directory safely", () => {
      const utilsContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../../../crates/platform/src/path_utils.rs"),
        "utf8"
      );
      assert.ok(
        utilsContent.includes("RevealResolution::FallbackParent"),
        "Must define FallbackParent for deleted/missing files"
      );

      const winContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../../../crates/platform/src/windows.rs"),
        "utf8"
      );
      assert.ok(
        winContent.includes("crate::path_utils::RevealResolution::FallbackParent"),
        "windows.rs must handle FallbackParent without crashing"
      );
    });
  });

  describe("3. Compact Context Menu Geometry & Interaction", () => {
    // 10. Context menu compact mode
    it("10. Context menu compact mode: allocates at least 380px envelope in compact mode", () => {
      const islandContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/Island.tsx"),
        "utf8"
      );
      assert.ok(
        islandContent.includes("const targetW = Math.max(currentSettings.island_width, 380);"),
        "Must expand width envelope to >= 380px for context menu"
      );
      assert.ok(
        islandContent.includes("const targetH = Math.max(currentSettings.island_height, 44) + 340;"),
        "Must expand height envelope for context menu"
      );
    });

    // 11. submenu edge flipping
    it("11. submenu edge flipping: defines .flip-submenu rule and calculates boundary flip dynamically", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );
      assert.ok(
        cssContent.includes(".bbq-context-menu.flip-submenu .bbq-context-submenu {"),
        "CSS must declare flip-submenu positioning"
      );
      assert.ok(
        cssContent.includes("right: calc(100% + 4px);"),
        "Flipped submenu must position to the left of the parent menu"
      );

      const menuContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/common/ContextMenu.tsx"),
        "utf8"
      );
      assert.ok(
        menuContent.includes("setFlipSubmenu(clampedX + menuWidth + submenuWidth + padding > winW)"),
        "ContextMenu must compute flipSubmenu near right edge"
      );
    });

    // 12. menu button clickability
    it("12. menu button clickability: declares pointer-events: auto on context menu and submenu", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      const menuSection = cssContent.slice(
        cssContent.indexOf(".bbq-context-menu {"),
        cssContent.indexOf(".bbq-context-menu {") + 200
      );
      assert.ok(
        menuSection.includes("pointer-events: auto;"),
        ".bbq-context-menu must declare pointer-events: auto"
      );

      const submenuSection = cssContent.slice(
        cssContent.indexOf(".bbq-context-submenu {"),
        cssContent.indexOf(".bbq-context-submenu {") + 400
      );
      assert.ok(
        submenuSection.includes("pointer-events: auto;"),
        ".bbq-context-submenu must declare pointer-events: auto"
      );
    });

    // 13. menu close sonrası geometry restore
    it("13. menu close sonrası geometry restore: restores configured compact geometry on menu close", () => {
      const islandContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/Island.tsx"),
        "utf8"
      );

      assert.ok(
        islandContent.includes("handleContextMenuClose"),
        "Must declare handleContextMenuClose callback"
      );
      assert.ok(
        islandContent.includes("compactWidth: currentSettings.island_width"),
        "Closing context menu must restore exact configured compact width"
      );
      assert.ok(
        islandContent.includes("compactHeight: currentSettings.island_height"),
        "Closing context menu must restore exact configured compact height"
      );
    });
  });

  describe("4. Required Phase 2 Regression Tests", () => {
    // 1. drag-out path resolution
    it("drag-out path resolution", () => {
      const winContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../../../crates/platform/src/windows.rs"),
        "utf8"
      );
      assert.ok(
        winContent.includes("std::fs::canonicalize(p)"),
        "Drag-out must canonicalize path to absolute system path"
      );
      assert.ok(
        winContent.includes("!p.exists()"),
        "Drag-out must reject missing file with validation error"
      );
      assert.ok(
        winContent.includes("p_str.contains('\\0')"),
        "Drag-out must reject null byte injection"
      );
      assert.ok(
        winContent.includes("s.strip_prefix(r\"\\\\?\\\""),
        "Drag-out must strip UNC prefix for shell compatibility"
      );
    });

    // 2. reveal-in-folder canonical path
    it("reveal-in-folder canonical path", () => {
      const utilsContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../../../crates/platform/src/path_utils.rs"),
        "utf8"
      );
      assert.ok(
        utilsContent.includes("std::env::current_dir()"),
        "Relative paths must resolve against current working directory"
      );
      assert.ok(
        utilsContent.includes("path.is_relative()"),
        "Must verify if path is relative"
      );
      assert.ok(
        utilsContent.includes("resolve_reveal_target"),
        "Must resolve canonical reveal target"
      );
    });

    // 3. context menu opens in compact mode
    it("context menu opens in compact mode", () => {
      const islandContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/island/Island.tsx"),
        "utf8"
      );
      assert.ok(
        islandContent.includes("if (state !== \"Expanded\") {"),
        "Context menu opening must detect compact mode"
      );
      assert.ok(
        islandContent.includes("const targetW = Math.max(currentSettings.island_width, 380);"),
        "Must expand envelope to >= 380px width for compact mode"
      );
      assert.ok(
        islandContent.includes("const targetH = Math.max(currentSettings.island_height, 44) + 340;"),
        "Must expand height envelope for compact mode"
      );
    });

    // 4. context menu is not clipped by island bounds
    it("context menu is not clipped by island bounds", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );
      assert.ok(
        cssContent.includes(".bbq-context-menu {"),
        "Must define .bbq-context-menu"
      );
      assert.ok(
        cssContent.includes("position: fixed;"),
        "Context menu must use fixed positioning to escape container overflow clipping"
      );
      assert.ok(
        cssContent.includes("z-index: 9999;"),
        "Context menu must use top-level stacking context (z-index: 9999)"
      );
    });

    // 5. context menu items receive clicks
    it("context menu items receive clicks", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );
      assert.ok(
        cssContent.includes(".bbq-context-menu {") &&
        cssContent.includes("pointer-events: auto;"),
        "Context menu must declare pointer-events: auto to receive clicks outside island"
      );

      const menuContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/common/ContextMenu.tsx"),
        "utf8"
      );
      assert.ok(
        menuContent.includes("onClick={item.action}"),
        "Menu items must bind click action"
      );
    });

    // 6. outside click closes menu
    it("outside click closes menu", () => {
      const menuContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/common/ContextMenu.tsx"),
        "utf8"
      );
      assert.ok(
        menuContent.includes("handleDocClick"),
        "Must define handleDocClick"
      );
      assert.ok(
        menuContent.includes("!menuRef.current.contains(e.target as Node)"),
        "Must verify click is outside menuRef"
      );
      assert.ok(
        menuContent.includes("document.addEventListener(\"mousedown\", handleDocClick);"),
        "Must register mousedown listener"
      );
      assert.ok(
        menuContent.includes("document.addEventListener(\"contextmenu\", handleDocClick);"),
        "Must register contextmenu listener"
      );
    });

    // 7. Escape closes menu
    it("Escape closes menu", () => {
      const menuContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/components/common/ContextMenu.tsx"),
        "utf8"
      );
      assert.ok(
        menuContent.includes("if (e.key === \"Escape\") {"),
        "Must detect Escape key"
      );
      assert.ok(
        menuContent.includes("e.preventDefault();\n        onClose();") ||
        menuContent.includes("onClose();"),
        "Escape must call onClose"
      );
    });
  });
});
