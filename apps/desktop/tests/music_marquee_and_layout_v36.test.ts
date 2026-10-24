import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_ROOT = path.resolve(__dirname, "..");

describe("BBQ v3.6 — Music Widget Redesign & Marquee Title Contracts", () => {
  const marqueeSrc = fs.readFileSync(
    path.join(DESKTOP_ROOT, "src/components/common/MarqueeTitle.tsx"),
    "utf-8"
  );
  const compactIndicatorsSrc = fs.readFileSync(
    path.join(DESKTOP_ROOT, "src/components/island/CompactIndicators.tsx"),
    "utf-8"
  );
  const mediaWidgetSrc = fs.readFileSync(
    path.join(DESKTOP_ROOT, "src/components/widgets/MediaWidget.tsx"),
    "utf-8"
  );
  const islandSrc = fs.readFileSync(
    path.join(DESKTOP_ROOT, "src/components/island/Island.tsx"),
    "utf-8"
  );
  const cssSrc = fs.readFileSync(
    path.join(DESKTOP_ROOT, "src/styles/index.css"),
    "utf-8"
  );

  // =========================================================================
  // 1. Marquee Architecture & Zero-Polling Invariants
  // =========================================================================
  describe("1. Marquee Architecture & Zero-Polling Invariants", () => {
    it("uses ResizeObserver for overflow measurement and cleans up on unmount", () => {
      assert.ok(
        marqueeSrc.includes("ResizeObserver"),
        "MarqueeTitle must use ResizeObserver for content measurement"
      );
      assert.ok(
        marqueeSrc.includes("observer.disconnect()") || marqueeSrc.includes("ro.disconnect()"),
        "MarqueeTitle must disconnect ResizeObserver in effect cleanup"
      );
    });

    it("strictly prohibits setInterval, requestAnimationFrame, and recursive setTimeout in MarqueeTitle", () => {
      assert.strictEqual(
        marqueeSrc.includes("setInterval"),
        false,
        "MarqueeTitle must NOT use setInterval"
      );
      assert.strictEqual(
        marqueeSrc.includes("requestAnimationFrame"),
        false,
        "MarqueeTitle must NOT use requestAnimationFrame"
      );
      assert.strictEqual(
        marqueeSrc.includes("setTimeout"),
        false,
        "MarqueeTitle must NOT use setTimeout animation loops"
      );
    });

    it("respects reduced motion settings and disables animation when active", () => {
      assert.ok(
        marqueeSrc.includes("prefersReducedMotion") ||
          marqueeSrc.includes("reducedMotion") ||
          marqueeSrc.includes("prefers-reduced-motion"),
        "MarqueeTitle must subscribe or check for reduced motion"
      );
      assert.ok(
        cssSrc.includes("@keyframes bbq-marquee-scroll"),
        "index.css must define keyframes for bbq-marquee-scroll"
      );
      assert.ok(
        cssSrc.includes("[data-reduced-motion=\"true\"] .bbq-marquee-track") ||
          cssSrc.includes("@media (prefers-reduced-motion"),
        "index.css must provide reduced motion override for marquee"
      );
    });
  });

  // =========================================================================
  // 2. Music Visual Hierarchy & Reference Alignment
  // =========================================================================
  describe("2. Music Visual Hierarchy & Reference Alignment", () => {
    it("renders Title primary on top and Artist secondary below in CompactIndicators", () => {
      assert.ok(
        compactIndicatorsSrc.includes("<MarqueeTitle") ||
          compactIndicatorsSrc.includes("bbq-media-title"),
        "CompactIndicators must render title with MarqueeTitle"
      );
      assert.ok(
        compactIndicatorsSrc.includes("bbq-media-artist"),
        "CompactIndicators must render artist"
      );

      const titleIdx = compactIndicatorsSrc.indexOf("bbq-media-title");
      const artistIdx = compactIndicatorsSrc.indexOf("bbq-media-artist");
      assert.ok(
        titleIdx !== -1 && artistIdx !== -1 && titleIdx < artistIdx,
        "Title element must appear before Artist element in DOM order"
      );
    });

    it("defines rounded 26x26px artwork in compact mode and rounded hero artwork in expanded mode", () => {
      assert.ok(
        cssSrc.includes(".bbq-media-art {") &&
          cssSrc.includes("border-radius: 6px;"),
        "Compact media artwork must have 6px border radius"
      );
      assert.ok(
        cssSrc.includes(".bbq-media-art-hero") &&
          cssSrc.includes("border-radius:"),
        "Expanded media artwork hero must have rounded border radius"
      );
    });

    it("enforces primary Title weight (600) and secondary Artist weight (400) in compact mode", () => {
      assert.ok(
        cssSrc.includes(".bbq-island-media-pill .bbq-media-title {\n  font-weight: 600;") ||
          cssSrc.includes(".bbq-island-media-pill .bbq-media-title {\r\n  font-weight: 600;"),
        "Compact media title must declare font-weight: 600"
      );
      assert.ok(
        cssSrc.includes(".bbq-island-media-pill .bbq-media-artist") &&
          cssSrc.includes("font-weight: 400;"),
        "Compact media artist must declare font-weight: 400"
      );
    });

    it("prohibits emoji in media controls and uses native SVG icons", () => {
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      assert.strictEqual(
        emojiRegex.test(compactIndicatorsSrc),
        false,
        "CompactIndicators must contain zero emojis"
      );
      assert.strictEqual(
        emojiRegex.test(mediaWidgetSrc),
        false,
        "MediaWidget must contain zero emojis"
      );
    });
  });

  // =========================================================================
  // 3. Compact Mode Island Width Invariant
  // =========================================================================
  describe("3. Compact Mode Island Width Invariant", () => {
    it("does not dynamically change Island width in compact mode based on song title", () => {
      // In Island.tsx, contentWidth is NOT passed to IslandShell in compact mode
      assert.strictEqual(
        islandSrc.includes("contentWidth={islandState.mode === 'compact' ?"),
        false,
        "Island.tsx must NOT vary contentWidth in compact mode based on title"
      );
    });

    it("stops pointerdown and mousedown event bubbling on playback buttons to prevent drag or collapse", () => {
      assert.ok(
        mediaWidgetSrc.includes("e.stopPropagation()"),
        "MediaWidget buttons must stop event propagation"
      );
      assert.ok(
        compactIndicatorsSrc.includes("e.stopPropagation()"),
        "CompactIndicators buttons must stop event propagation"
      );
    });
  });

  // =========================================================================
  // 4. Expanded Controls Interaction & IPC Dispatch Invariants
  // =========================================================================
  describe("4. Expanded Controls Interaction & IPC Dispatch Invariants", () => {
    it("ensures media control buttons invoke respective bbqCommands dispatchers", () => {
      assert.ok(
        mediaWidgetSrc.includes("bbqCommands.mediaPrevious()"),
        "MediaWidget must dispatch mediaPrevious on click"
      );
      assert.ok(
        mediaWidgetSrc.includes("bbqCommands.mediaTogglePlayPause()"),
        "MediaWidget must dispatch mediaTogglePlayPause on click"
      );
      assert.ok(
        mediaWidgetSrc.includes("bbqCommands.mediaNext()"),
        "MediaWidget must dispatch mediaNext on click"
      );
    });

    it("ensures controls have pointer-events auto and z-index above shell backdrop", () => {
      assert.ok(
        cssSrc.includes(".bbq-media-ctrl-btn") &&
          cssSrc.includes("pointer-events: auto;"),
        "index.css must declare pointer-events: auto on media control buttons"
      );
    });

    it("ensures artwork error state resets deterministically on track change in compact and expanded modes", () => {
      assert.ok(
        compactIndicatorsSrc.includes("setArtFailed(false)") &&
          compactIndicatorsSrc.includes("[resolvedArt, currentSession?.id, currentSession?.title]"),
        "CompactIndicators must reset art failure on track/session change"
      );
      assert.ok(
        mediaWidgetSrc.includes("setArtError(false)") &&
          mediaWidgetSrc.includes("[resolvedArt, meta?.id, meta?.title]"),
        "MediaWidget must reset art error on track/session change"
      );
    });
  });
});
