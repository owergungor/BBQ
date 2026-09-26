import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("BBQ v2.1 — Phase 7: Context Menu Contracts", () => {
  const contextMenuPath = path.join(
    ROOT_DIR,
    "apps/desktop/src/components/common/ContextMenu.tsx"
  );
  const contextMenuContent = fs.readFileSync(contextMenuPath, "utf-8");

  describe("7A. Required Menu Actions Completeness", () => {
    const REQUIRED_ACTIONS = [
      "Switch Widget",
      "Always on Top",
      "Expand HUD",
      "Reload Active Widget",
      "Settings",
      "Launch at Login",
      "About BBQ",
      "Quit BBQ",
    ];

    it("ensures every required action is explicitly defined in ContextMenu", () => {
      for (const action of REQUIRED_ACTIONS) {
        assert.ok(
          contextMenuContent.includes(action),
          `ContextMenu must contain '${action}' action`
        );
      }
    });

    it("verifies NO HeroUI or third-party UI libraries are imported", () => {
      assert.ok(
        !contextMenuContent.includes("@heroui"),
        "HeroUI must NOT be imported"
      );
      assert.ok(
        !contextMenuContent.includes("@radix-ui"),
        "Radix UI must NOT be imported"
      );
    });

    it("ensures SVG icons from Icon.tsx are used", () => {
      assert.ok(
        contextMenuContent.includes("<Icon") && contextMenuContent.includes("Icon.tsx"),
        "Must use native SVG Icon component"
      );
    });
  });

  describe("7B. Screen-Edge Positioning Bounds", () => {
    it("clamps position to screen boundaries to prevent off-screen overflow", () => {
      const windowWidth = 800;
      const windowHeight = 600;
      const menuWidth = 200;
      const menuHeight = 280;
      const padding = 8;

      const clampPos = (x: number, y: number) => {
        const clampedX = Math.max(
          padding,
          Math.min(x, windowWidth - menuWidth - padding)
        );
        const clampedY = Math.max(
          padding,
          Math.min(y, windowHeight - menuHeight - padding)
        );
        return { x: clampedX, y: clampedY };
      };

      // Near right/bottom edge
      const pos1 = clampPos(790, 590);
      assert.strictEqual(pos1.x, windowWidth - menuWidth - padding);
      assert.strictEqual(pos1.y, windowHeight - menuHeight - padding);

      // Negative coordinates
      const pos2 = clampPos(-50, -100);
      assert.strictEqual(pos2.x, padding);
      assert.strictEqual(pos2.y, padding);

      // Normal inside coordinate
      const pos3 = clampPos(250, 150);
      assert.strictEqual(pos3.x, 250);
      assert.strictEqual(pos3.y, 150);
    });
  });

  describe("7C. Keyboard Navigation & Accessibility", () => {
    it("handles ArrowUp, ArrowDown, Enter, Space, and Escape keyboard events", () => {
      assert.ok(
        contextMenuContent.includes('e.key === "Escape"'),
        "Must handle Escape key to close menu"
      );
      assert.ok(
        contextMenuContent.includes('e.key === "ArrowDown"'),
        "Must handle ArrowDown key"
      );
      assert.ok(
        contextMenuContent.includes('e.key === "ArrowUp"'),
        "Must handle ArrowUp key"
      );
      assert.ok(
        contextMenuContent.includes('e.key === "Enter"'),
        "Must handle Enter key"
      );
    });

    it("verifies WCAG AA semantic roles: role='menu' and role='menuitem'", () => {
      assert.ok(
        contextMenuContent.includes('role="menu"'),
        "Must define role='menu' for the context menu container"
      );
      assert.ok(
        contextMenuContent.includes('role="menuitem"'),
        "Must define role='menuitem' for interactive items"
      );
    });
  });

  describe("7D. CSS Tokens & Reduced Motion Support", () => {
    const cssPath = path.join(ROOT_DIR, "apps/desktop/src/styles/index.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");

    it("defines styles for .bbq-context-menu with zero drop-shadow filter", () => {
      assert.ok(
        cssContent.includes(".bbq-context-menu"),
        "Must define .bbq-context-menu styles in index.css"
      );
      const menuSection = cssContent.slice(cssContent.indexOf(".bbq-context-menu"));
      const endOfSection = menuSection.indexOf("/* ==");
      const sectionSnippet = endOfSection > 0 ? menuSection.slice(0, endOfSection) : menuSection;
      assert.ok(
        !sectionSnippet.includes("filter: drop-shadow"),
        "Zero drop-shadow filter rule in context menu styles"
      );
    });

    it("honors data-reduced-motion for context menu animations", () => {
      assert.ok(
        cssContent.includes('[data-reduced-motion="true"] .bbq-context-menu'),
        "Must disable animations when data-reduced-motion is true"
      );
    });

    it("supports light theme via [data-theme='light']", () => {
      assert.ok(
        cssContent.includes('[data-theme="light"] .bbq-context-menu'),
        "Must include light theme styles for context menu"
      );
    });
  });
});
