import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { IslandRuntime } from "../src/island/IslandRuntime.ts";
import { islandStore, initialIslandState } from "../src/island/islandState.ts";

describe("BBQ v1.3 — M2 Geometry & Island Shell Invariants", () => {
  let runtime: IslandRuntime;

  beforeEach(() => {
    runtime = new IslandRuntime();
    islandStore.setState(initialIslandState);
  });

  describe("1. Central Geometry & Token Specifications in CSS", () => {
    it("declares exact Atoll parity geometry tokens in index.css", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      // Dimensions
      assert.ok(cssContent.includes("--bbq-compact-width: 240px;"), "Must declare compact width 240px");
      assert.ok(cssContent.includes("--bbq-compact-height: 38px;"), "Must declare compact height 38px");
      assert.ok(cssContent.includes("--bbq-peek-width: 280px;"), "Must declare peek width 280px");
      assert.ok(cssContent.includes("--bbq-peek-height: 44px;"), "Must declare peek height 44px");
      assert.ok(cssContent.includes("--bbq-expanded-width: 520px;"), "Must declare expanded width 520px");
      assert.ok(cssContent.includes("--bbq-expanded-height: 360px;"), "Must declare expanded height 360px");
      assert.ok(cssContent.includes("--bbq-top-margin: 8px;"), "Must declare top margin 8px");

      // Squircle Curvatures
      assert.ok(cssContent.includes("--bbq-radius-compact: 20px;"), "Must declare compact radius 20px");
      assert.ok(cssContent.includes("--bbq-radius-peek: 22px;"), "Must declare peek radius 22px");
      assert.ok(cssContent.includes("--bbq-radius-expanded: 24px;"), "Must declare expanded radius 24px");
      assert.ok(cssContent.includes("--bbq-radius-squircle: 24px;"), "Must declare squircle radius 24px");
    });

    it("verifies state modifiers strictly map to geometry and glass tokens", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      // Idle state
      assert.ok(cssContent.includes("max-width: var(--bbq-compact-width, 240px);"));
      assert.ok(cssContent.includes("max-height: var(--bbq-compact-height, 38px);"));
      assert.ok(cssContent.includes("border-radius: var(--bbq-radius-compact, 20px);"));

      // Hovering/Peek state
      assert.ok(cssContent.includes("max-width: var(--bbq-peek-width, 280px);"));
      assert.ok(cssContent.includes("max-height: var(--bbq-peek-height, 44px);"));
      assert.ok(cssContent.includes("border-radius: var(--bbq-radius-peek, 22px);"));

      // Expanded HUD state
      assert.ok(cssContent.includes("max-width: var(--bbq-expanded-width, 520px);"));
      assert.ok(cssContent.includes("max-height: var(--bbq-expanded-height, 360px);"));
      assert.ok(cssContent.includes("border-radius: var(--bbq-radius-expanded, 24px);"));
    });

    it("strictly preserves zero-halo outer shadow invariant", () => {
      const cssContent = fs.readFileSync(
        path.resolve(import.meta.dirname, "../src/styles/index.css"),
        "utf8"
      );

      assert.ok(cssContent.includes("--bbq-shadow-idle: none;"));
      assert.ok(cssContent.includes("--bbq-shadow-expanded: none;"));
      assert.ok(cssContent.includes("--bbq-shadow: none;"));
      assert.ok(!cssContent.includes("drop-shadow"), "No drop-shadow filter allowed");
    });
  });

  describe("2. Island State Machine Transitions & Mode Invariants", () => {
    it("transitions Idle -> Hovering (Peek) -> Expanded (520x360) -> Idle", async () => {
      assert.equal(islandStore.getState().state, "Idle");
      assert.equal(islandStore.getState().mode, "IDLE");
      assert.equal(islandStore.getState().expanded, false);

      // Hover triggers peek
      await runtime.handleEvent({ type: "USER_HOVER" });
      assert.equal(islandStore.getState().state, "Hovering");
      assert.equal(islandStore.getState().mode, "ACTIVE");
      assert.equal(islandStore.getState().isHovered, true);

      // Click triggers expanded HUD
      await runtime.handleEvent({ type: "USER_CLICK" });
      assert.equal(islandStore.getState().state, "Expanded");
      assert.equal(islandStore.getState().mode, "EXPANDED");
      assert.equal(islandStore.getState().expanded, true);

      // Escape triggers collapse to Hovering while hovered, then unhover returns to Idle
      await runtime.handleEvent({ type: "USER_ESCAPE" });
      assert.equal(islandStore.getState().state, "Hovering");

      await runtime.transitionTo("Idle", "mouse");
      assert.equal(islandStore.getState().state, "Idle");
      assert.equal(islandStore.getState().mode, "IDLE");
      assert.equal(islandStore.getState().expanded, false);
    });
  });
});
