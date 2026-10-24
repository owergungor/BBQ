import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  settingsTabHeightStore,
  setSettingsTabHeight,
  MIN_SETTINGS_HEIGHT,
  MAX_SETTINGS_HEIGHT,
} from "../src/components/widgets/settingsTabHeightStore.ts";
import { bootstrapWidgets } from "../src/island/bootstrapWidgets.ts";
import { widgetRegistry } from "../src/island/widgetRegistry.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("BBQ v3.6 — Step 1: Settings Tab-Specific Natural Vertical Sizing", () => {
  beforeEach(() => {
    bootstrapWidgets();
    settingsTabHeightStore.setState({ height: 360 });
  });

  describe("1. Settings Tab Height Store & Boundary Clamping", () => {
    it("exports MIN_SETTINGS_HEIGHT=200 and MAX_SETTINGS_HEIGHT=480", () => {
      assert.equal(MIN_SETTINGS_HEIGHT, 200);
      assert.equal(MAX_SETTINGS_HEIGHT, 480);
    });

    it("clamps values below MIN_SETTINGS_HEIGHT to 200", () => {
      setSettingsTabHeight(120);
      assert.equal(settingsTabHeightStore.getState().height, 200);
    });

    it("clamps values above MAX_SETTINGS_HEIGHT to 480", () => {
      setSettingsTabHeight(650);
      assert.equal(settingsTabHeightStore.getState().height, 480);
    });

    it("accepts valid intermediate heights within [200, 480]", () => {
      setSettingsTabHeight(320);
      assert.equal(settingsTabHeightStore.getState().height, 320);

      setSettingsTabHeight(245);
      assert.equal(settingsTabHeightStore.getState().height, 245);
    });

    it("suppresses micro-oscillations smaller than 4px", () => {
      setSettingsTabHeight(300);
      assert.equal(settingsTabHeightStore.getState().height, 300);

      // Delta of 2px should not change store state
      setSettingsTabHeight(302);
      assert.equal(settingsTabHeightStore.getState().height, 300);

      // Delta of 5px should update store state
      setSettingsTabHeight(305);
      assert.equal(settingsTabHeightStore.getState().height, 305);
    });
  });

  describe("2. Settings Widget Definition Contract", () => {
    it("configures settings widget sizing with boundedExpansion policy and [200, 480] range", () => {
      const settingsWidget = widgetRegistry.get("settings");
      assert.ok(settingsWidget, "Settings widget must be registered");
      assert.ok(settingsWidget.sizing, "Settings widget must have sizing contract");

      const { expanded, contentPolicy } = settingsWidget.sizing;
      assert.equal(contentPolicy, "boundedExpansion");
      assert.equal(expanded.minHeight, 200);
      assert.equal(expanded.maxHeight, 480);
      assert.ok(expanded.preferredHeight >= 200 && expanded.preferredHeight <= 480);
    });
  });

  describe("3. SettingsWidget & Island Sizing Integration", () => {
    const settingsWidgetPath = path.resolve(__dirname, "../src/components/widgets/SettingsWidget.tsx");
    const islandShellPath = path.resolve(__dirname, "../src/components/island/IslandShell.tsx");
    const islandPath = path.resolve(__dirname, "../src/components/island/Island.tsx");
    const islandCommandsPath = path.resolve(__dirname, "../src-tauri/src/commands/island.rs");

    it("verifies SettingsWidget.tsx line count is strictly below 650 lines", () => {
      const content = fs.readFileSync(settingsWidgetPath, "utf-8");
      const lineCount = content.split(/\r?\n/).length;
      assert.ok(
        lineCount < 650,
        `SettingsWidget.tsx line count (${lineCount}) must remain < 650 lines for modularity`
      );
    });

    it("verifies SettingsWidget attaches contentRef from useSettingsTabAutoHeight to tabpanel", () => {
      const content = fs.readFileSync(settingsWidgetPath, "utf-8");
      assert.ok(
        content.includes("useSettingsTabAutoHeight"),
        "SettingsWidget must import and invoke useSettingsTabAutoHeight"
      );
      assert.ok(
        content.includes("ref={contentRef}"),
        "SettingsWidget tabpanel must attach contentRef"
      );
    });

    it("verifies IslandShell.tsx supports dynamic expandedHeight override", () => {
      const content = fs.readFileSync(islandShellPath, "utf-8");
      assert.ok(
        content.includes("expandedHeight?: number"),
        "IslandShellProps must accept expandedHeight"
      );
      assert.ok(
        content.includes("expandedHeight") && content.includes("${expandedHeight}px"),
        "IslandShell must prioritize expandedHeight when provided"
      );
    });

    it("verifies Island.tsx passes dynamic settingsTabHeight and syncs window bounds", () => {
      const content = fs.readFileSync(islandPath, "utf-8");
      assert.ok(
        content.includes("settingsTabHeightStore"),
        "Island.tsx must import settingsTabHeightStore"
      );
      assert.ok(
        content.includes("expandedHeight={activeWidgetId === \"settings\" ? settingsTabHeight : undefined}"),
        "Island.tsx must pass settingsTabHeight to IslandShell when activeWidgetId is settings"
      );
      assert.ok(
        content.includes("resizeIsland(\"expanded\""),
        "Island.tsx must synchronize window geometry on height change"
      );
    });

    it("verifies apply_island_geometry in island.rs honors custom placement", () => {
      const content = fs.readFileSync(islandCommandsPath, "utf-8");
      assert.ok(
        content.includes("apply_island_geometry") && content.includes("is_custom_positioned"),
        "apply_island_geometry must check is_custom_positioned to preserve custom position"
      );
    });
  });
});
