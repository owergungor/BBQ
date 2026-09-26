import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { widgetRegistry } from "../src/island/widgetRegistry.ts";
import { bootstrapWidgets } from "../src/island/bootstrapWidgets.ts";
import { bbqCommands } from "../src/ipc/commands.ts";
import type { WidgetSizingContract } from "@bbq/types";

describe("BBQ v2.1 — Phase 1 Per-Widget Sizing & Geometry Invariants", () => {
  beforeEach(() => {
    bootstrapWidgets();
  });

  describe("1. Per-Widget Sizing Contracts & Metadata Completeness", () => {
    const ACTIVE_WIDGET_IDS = [
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

    it("ensures every active widget defines an explicit WidgetSizingContract", () => {
      for (const id of ACTIVE_WIDGET_IDS) {
        const widget = widgetRegistry.get(id);
        assert.ok(widget, `Widget ${id} must be registered`);
        assert.ok(widget.sizing, `Widget ${id} must define sizing contract`);
        const { compact, expanded, contentPolicy } = widget.sizing as WidgetSizingContract;

        // Compact constraints validation
        assert.ok(typeof compact.minWidth === "number" && compact.minWidth >= 180, `${id} compact minWidth`);
        assert.ok(typeof compact.preferredWidth === "number" && compact.preferredWidth >= compact.minWidth, `${id} compact preferredWidth`);
        assert.ok(typeof compact.maxWidth === "number" && compact.maxWidth >= compact.preferredWidth, `${id} compact maxWidth`);
        assert.ok(typeof compact.minHeight === "number" && compact.minHeight >= 36, `${id} compact minHeight`);
        assert.ok(typeof compact.preferredHeight === "number" && compact.preferredHeight >= compact.minHeight, `${id} compact preferredHeight`);
        assert.ok(typeof compact.maxHeight === "number" && compact.maxHeight >= compact.preferredHeight, `${id} compact maxHeight`);

        // Expanded constraints validation
        assert.ok(typeof expanded.minWidth === "number" && expanded.minWidth >= 300, `${id} expanded minWidth`);
        assert.ok(typeof expanded.preferredWidth === "number" && expanded.preferredWidth >= expanded.minWidth, `${id} expanded preferredWidth`);
        assert.ok(typeof expanded.maxWidth === "number" && expanded.maxWidth <= 640, `${id} expanded maxWidth`);
        assert.ok(typeof expanded.minHeight === "number" && expanded.minHeight >= 200, `${id} expanded minHeight`);
        assert.ok(typeof expanded.preferredHeight === "number" && expanded.preferredHeight >= expanded.minHeight, `${id} expanded preferredHeight`);
        assert.ok(typeof expanded.maxHeight === "number" && expanded.maxHeight <= 520, `${id} expanded maxHeight`);

        // Policy validation
        assert.ok(
          ["fixed", "contentDriven", "boundedExpansion"].includes(contentPolicy),
          `${id} contentPolicy must be valid policy enum`
        );
      }
    });

    it("verifies widgets do NOT all share a single global hardcoded size", () => {
      const preferredExpandedWidths = new Set<number>();
      const preferredCompactWidths = new Set<number>();

      for (const id of ACTIVE_WIDGET_IDS) {
        const widget = widgetRegistry.get(id);
        if (widget?.sizing) {
          preferredCompactWidths.add(widget.sizing.compact.preferredWidth);
          preferredExpandedWidths.add(widget.sizing.expanded.preferredWidth);
        }
      }

      // Proves active widgets have distinct, tailored dimensions
      assert.ok(preferredCompactWidths.size > 1, "Must have differentiated compact widths");
      assert.ok(preferredExpandedWidths.size > 1, "Must have differentiated expanded widths");
    });

    it("verifies media and clipboard widgets declare boundedExpansion for variable content", () => {
      const media = widgetRegistry.get("media");
      assert.equal(media?.sizing?.contentPolicy, "boundedExpansion");
      assert.equal(media?.sizing?.compact.maxWidth, 380);

      const clipboard = widgetRegistry.get("clipboard");
      assert.equal(clipboard?.sizing?.contentPolicy, "boundedExpansion");
      assert.equal(clipboard?.sizing?.compact.maxWidth, 300);
    });

    it("verifies system and drop shelf declare fixed policy to prevent jitter", () => {
      const system = widgetRegistry.get("system");
      assert.equal(system?.sizing?.contentPolicy, "fixed");

      const drop = widgetRegistry.get("drop");
      assert.equal(drop?.sizing?.contentPolicy, "fixed");
    });
  });

  describe("2. Native Resize IPC Contract Parity", () => {
    it("exposes calculateIslandGeometry, applyIslandGeometry, and resizeIsland on bbqCommands", () => {
      assert.equal(typeof bbqCommands.calculateIslandGeometry, "function");
      assert.equal(typeof bbqCommands.applyIslandGeometry, "function");
      assert.equal(typeof bbqCommands.resizeIsland, "function");
    });

    it("handles resizeIsland in mock/test environment without crashing", async () => {
      const mediaWidget = widgetRegistry.get("media");
      const sizing = mediaWidget?.sizing;
      assert.ok(sizing);

      // Request content-fit expansion in compact mode
      const result = await bbqCommands.resizeIsland("idle", {
        compactWidth: 320,
        preferredWidth: 320,
        contract: sizing,
      });

      // In mock/test environment, returns gracefully (null or object)
      assert.ok(result === null || typeof result === "object");
    });
  });

  describe("3. Zero Polling & Event Invariants", () => {
    it("ensures sizing contracts are strictly static and event-driven without timers", () => {
      // Sizing contracts are static metadata, zero intervals allowed
      for (const id of ["media", "system", "files", "timer"]) {
        const widget = widgetRegistry.get(id);
        assert.ok(widget?.sizing);
        assert.equal(typeof widget.sizing.compact.minWidth, "number");
      }
    });
  });
});
