import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ v2.1 — Phase 10: Compact Hover & Tap Contracts", () => {
  const cssPath = path.resolve(__dirname, "../src/styles/index.css");
  const pkgPath = path.resolve(__dirname, "../package.json");
  const shellComponentPath = path.resolve(
    __dirname,
    "../src/components/island/IslandShell.tsx"
  );

  const cssSource = fs.readFileSync(cssPath, "utf-8").replace(/\r\n/g, "\n");
  const pkgSource = fs.readFileSync(pkgPath, "utf-8");
  const shellSource = fs.readFileSync(shellComponentPath, "utf-8");

  describe("10A. Pure CSS Implementation & Zero Third-Party Motion Libraries", () => {
    it("ensures no framer-motion or external motion library is installed", () => {
      assert.ok(!pkgSource.includes("framer-motion"), "framer-motion must not be installed");
      assert.ok(!pkgSource.includes('"motion":'), "motion must not be installed");
      assert.ok(!shellSource.includes("framer-motion"), "IslandShell must not import motion");
    });

    it("verifies hover scale is tuned to approximately 1.02 on collapsed state", () => {
      assert.ok(
        cssSource.includes(".bbq-island-shell.state-idle:hover") ||
        cssSource.includes(".bbq-island-shell.mode-idle:hover")
      );
      assert.ok(
        cssSource.includes("transform: scale(1.02);"),
        "Hover scale must be 1.02"
      );
    });

    it("verifies active/tap scale is tuned to approximately 0.98 on collapsed state", () => {
      assert.ok(
        cssSource.includes(".bbq-island-shell.state-idle:active") ||
        cssSource.includes(".bbq-island-shell.mode-idle:active")
      );
      assert.ok(
        cssSource.includes("transform: scale(0.98);"),
        "Active tap scale must be 0.98"
      );
    });

    it("resets transform on expanded state", () => {
      assert.ok(
        cssSource.includes(".bbq-island-shell.state-expanded") &&
        cssSource.includes("transform: none;")
      );
    });
  });

  describe("10B. Prohibition of Glow, Halo, Drop-Shadow, and Continuous Animation", () => {
    it("strictly prohibits drop-shadow filters on .bbq-island-shell", () => {
      // Find the rule for bbq-island-shell and ensure zero filter: drop-shadow
      const shellBlock = cssSource.split(".bbq-island-shell")[1]?.split("/*")[0] || "";
      assert.ok(
        !shellBlock.includes("filter: drop-shadow"),
        "bbq-island-shell must not contain filter: drop-shadow"
      );
    });

    it("ensures zero infinite or continuous animations on collapsed HUD", () => {
      assert.ok(!cssSource.includes("animation: pulse infinite"));
      assert.ok(!cssSource.includes("animation: glow infinite"));
    });

    it("verifies zero requestAnimationFrame in IslandShell component", () => {
      assert.ok(
        !shellSource.includes("requestAnimationFrame"),
        "IslandShell must not use requestAnimationFrame"
      );
    });
  });

  describe("10C. Reduced Motion & Keyboard Accessibility", () => {
    it("disables transform animations when reduced motion is preferred", () => {
      assert.ok(
        cssSource.includes(
          "@media (prefers-reduced-motion: reduce) {\n  .bbq-island-shell.state-idle"
        ) && cssSource.includes("transform: none !important;")
      );
      assert.ok(
        cssSource.includes(
          '[data-reduced-motion="true"] .bbq-island-shell.state-idle'
        ) && cssSource.includes("transform: none !important;")
      );
    });

    it("provides focus-visible styling for keyboard navigation", () => {
      assert.ok(
        cssSource.includes(".bbq-island-shell:focus-visible") &&
        cssSource.includes("outline: 2px solid")
      );
    });
  });
});
