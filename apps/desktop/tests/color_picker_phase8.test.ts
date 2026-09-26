import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hsvToRgb,
  rgbToHsv,
  hexToRgba,
  rgbaToHex,
  clamp,
  validateColorInput,
} from "../src/components/common/colorUtils.ts";
import { computeWcagContrast } from "../src/components/widgets/settingsModel.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ v2.1 — Phase 8: Cromia Color Picker Contracts", () => {
  const componentPath = path.resolve(
    __dirname,
    "../src/components/common/CromiaColorPicker.tsx"
  );
  const colorUtilsPath = path.resolve(
    __dirname,
    "../src/components/common/colorUtils.ts"
  );
  const cssPath = path.resolve(__dirname, "../src/styles/index.css");

  const componentSource = fs.readFileSync(componentPath, "utf-8");
  const cssSource = fs.readFileSync(cssPath, "utf-8");

  describe("8A. RGB & HSV Mathematical Invariants", () => {
    it("converts pure red, green, blue correctly between HSV and RGB", () => {
      // Red: H=0, S=1, V=1 -> (255, 0, 0)
      const redRgb = hsvToRgb(0, 1, 1);
      assert.deepEqual(redRgb, { r: 255, g: 0, b: 0 });
      const redHsv = rgbToHsv(255, 0, 0);
      assert.equal(redHsv.h, 0);
      assert.equal(redHsv.s, 1);
      assert.equal(redHsv.v, 1);

      // Green: H=120, S=1, V=1 -> (0, 255, 0)
      const greenRgb = hsvToRgb(120, 1, 1);
      assert.deepEqual(greenRgb, { r: 0, g: 255, b: 0 });
      const greenHsv = rgbToHsv(0, 255, 0);
      assert.equal(greenHsv.h, 120);
      assert.equal(greenHsv.s, 1);
      assert.equal(greenHsv.v, 1);

      // Blue: H=240, S=1, V=1 -> (0, 0, 255)
      const blueRgb = hsvToRgb(240, 1, 1);
      assert.deepEqual(blueRgb, { r: 0, g: 0, b: 255 });
      const blueHsv = rgbToHsv(0, 0, 255);
      assert.equal(blueHsv.h, 240);
      assert.equal(blueHsv.s, 1);
      assert.equal(blueHsv.v, 1);
    });

    it("clamps RGB and HSV bounds defensively", () => {
      assert.equal(clamp(-10, 0, 255), 0);
      assert.equal(clamp(300, 0, 255), 255);
      assert.equal(clamp(0.5, 0, 1), 0.5);
    });
  });

  describe("8B. HEX and Alpha Conversions", () => {
    it("parses 3-digit, 6-digit, and 8-digit HEX codes accurately", () => {
      // 3-digit
      const parsed3 = hexToRgba("#f0a");
      assert.deepEqual(parsed3, { r: 255, g: 0, b: 170, a: 1 });

      // 6-digit
      const parsed6 = hexToRgba("#0a84ff");
      assert.deepEqual(parsed6, { r: 10, g: 132, b: 255, a: 1 });

      // 8-digit with alpha
      const parsed8 = hexToRgba("#0a84ff80");
      assert.ok(parsed8 !== null);
      assert.equal(parsed8?.r, 10);
      assert.equal(parsed8?.g, 132);
      assert.equal(parsed8?.b, 255);
      assert.equal(Math.round(parsed8!.a * 100), 50);
    });

    it("formats RGBA to HEX correctly with and without alpha", () => {
      // Without alpha (a === 1)
      assert.equal(rgbaToHex(10, 132, 255, 1), "#0a84ff");

      // With alpha (a === 0.5)
      const hexAlpha = rgbaToHex(10, 132, 255, 0.5);
      assert.ok(hexAlpha.startsWith("#0a84ff"));
      assert.equal(hexAlpha.length, 9);
    });
  });

  describe("8C. Invalid Input Rejection & Graceful Fallback", () => {
    it("validates well-formed colors and rejects invalid strings without crashing", () => {
      const valid = validateColorInput("#bf5af2");
      assert.equal(valid.valid, true);
      assert.equal(valid.hex, "#bf5af2");

      const invalid1 = validateColorInput("not-a-color");
      assert.equal(invalid1.valid, false);

      const invalid2 = validateColorInput("#12345"); // 5 digits
      assert.equal(invalid2.valid, false);

      const invalid3 = validateColorInput("");
      assert.equal(invalid3.valid, false);
    });
  });

  describe("8D. UI Component Structure & Zero Third-Party Dependency Invariant", () => {
    it("verifies NO Tailwind, Radix UI, or HeroUI are imported", () => {
      assert.ok(!componentSource.includes("@radix-ui"), "Radix UI must not be used");
      assert.ok(!componentSource.includes("@heroui"), "HeroUI must not be used");
      assert.ok(!componentSource.includes("tailwind"), "Tailwind must not be used");
    });

    it("includes SV 2D Area, Hue slider, Alpha slider, and Presets", () => {
      assert.ok(componentSource.includes("bbq-cromia-sv-area"), "Must have SV 2D area");
      assert.ok(componentSource.includes("bbq-cromia-hue-slider"), "Must have Hue slider");
      assert.ok(componentSource.includes("bbq-cromia-alpha-slider"), "Must have Alpha slider");
      assert.ok(componentSource.includes("bbq-cromia-presets-row"), "Must have presets row");
      assert.ok(componentSource.includes("bbq-cromia-hex-input"), "Must have HEX input");
    });

    it("handles keyboard navigation (Arrow keys) on the SV area", () => {
      assert.ok(componentSource.includes("ArrowLeft"));
      assert.ok(componentSource.includes("ArrowRight"));
      assert.ok(componentSource.includes("ArrowUp"));
      assert.ok(componentSource.includes("ArrowDown"));
    });
  });

  describe("8E. Light/Dark Theme & WCAG Contrast Compliance", () => {
    it("computes accurate WCAG contrast for dark and light backgrounds", () => {
      // High contrast: white on dark background #121216
      const highContrast = computeWcagContrast("#ffffff", "#121216");
      assert.ok(highContrast.ratio > 10, "White on dark background should exceed 10:1 ratio");
      assert.equal(highContrast.normalTextAa, true);

      // Low contrast: dark slate on dark background
      const lowContrast = computeWcagContrast("#1a1a20", "#121216");
      assert.ok(lowContrast.ratio < 2, "Dark slate on dark background should fail contrast");
      assert.equal(lowContrast.normalTextAa, false);
    });

    it("defines CSS rules for light theme and reduced motion in index.css", () => {
      assert.ok(cssSource.includes('[data-theme="light"] .bbq-cromia-container'));
      assert.ok(cssSource.includes('[data-reduced-motion="true"] .bbq-cromia-preset-btn'));
    });
  });
});
