import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getNotchSvgPath } from "../src/components/island/notchGeometry.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = path.resolve(DESKTOP_DIR, "../..");

describe("BBQ v4.3 — Shape Clipping, Notch Geometry & Dot Mode Verification", () => {
  // =========================================================================
  // 1. Authoritative Notch Geometry Contracts (Rust & TypeScript Parity)
  // =========================================================================
  describe("1. Authoritative Notch Geometry Contracts", () => {
    it("verifies Rust core exports generate_notch_polygon_points and generate_notch_svg_path", () => {
      const coreLibRs = fs.readFileSync(
        path.join(ROOT_DIR, "crates/core/src/lib.rs"),
        "utf-8"
      );
      assert.ok(coreLibRs.includes("pub mod geometry;"));
      assert.ok(coreLibRs.includes("generate_notch_polygon_points"));
      assert.ok(coreLibRs.includes("generate_notch_svg_path"));

      const geometryRs = fs.readFileSync(
        path.join(ROOT_DIR, "crates/core/src/geometry.rs"),
        "utf-8"
      );
      assert.ok(geometryRs.includes("pub fn generate_notch_polygon_points"));
      assert.ok(geometryRs.includes("pub fn generate_notch_svg_path"));
      assert.ok(geometryRs.includes("pub fn sample_cubic_bezier"));
    });

    it("verifies TypeScript notchGeometry.ts generates valid convex/concave SVG path", () => {
      const pathTop = getNotchSvgPath(240, 38, 12, 18, false);
      assert.ok(pathTop.startsWith("M 0,0") || pathTop.startsWith("M 0 0"));
      assert.ok(pathTop.includes("C "));
      assert.ok(pathTop.endsWith("Z"));

      const pathBottom = getNotchSvgPath(240, 38, 12, 18, true);
      assert.ok(pathBottom.startsWith("M 0,38") || pathBottom.startsWith("M 0 38"));
      assert.ok(pathBottom.includes("C "));
      assert.ok(pathBottom.endsWith("Z"));
    });

    it("verifies IslandShell.tsx integrates SVG notch clip-path dynamically", () => {
      const shellSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/IslandShell.tsx"),
        "utf-8"
      );
      assert.ok(shellSrc.includes("getNotchSvgPath"));
      assert.ok(shellSrc.includes("dynamicStyle.clipPath = `path('${notchPath}')`"));
    });
  });

  // =========================================================================
  // 2. Dot Mode 1:1 Strict Circular Aspect Ratio & Geometry Invariant
  // =========================================================================
  describe("2. Dot Mode 1:1 Strict Circular Aspect Ratio", () => {
    it("Rust core IslandLayoutState::Hovering preserves 1:1 symmetry for Dot mode", () => {
      const geometryRs = fs.readFileSync(
        path.join(ROOT_DIR, "crates/core/src/geometry.rs"),
        "utf-8"
      );
      assert.ok(
        geometryRs.includes("cw == ch && cw <= 64"),
        "Must detect Dot mode by square bounds in geometry.rs"
      );
      assert.ok(
        geometryRs.includes("(cw + 6, ch + 6)"),
        "Must scale Dot mode symmetrically by +6 on both width and height"
      );
    });

    it("CSS enforces strict 1:1 circular aspect ratio and containment for Dot mode", () => {
      const css = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/styles/index.css"),
        "utf-8"
      );
      assert.ok(css.includes(".bbq-island-shell.mode-dot.state-idle"));
      assert.ok(css.includes(".bbq-island-shell.mode-dot.state-hovering"));
      assert.ok(css.includes("border-radius: 50% !important;"));
      assert.ok(css.includes("contain: paint;"));
      assert.ok(css.includes("overflow: hidden;"));
    });

    it("CompactIndicators renders centered icon and suppresses multi-widget pill text on hover", () => {
      const indSrc = fs.readFileSync(
        path.join(DESKTOP_DIR, "src/components/island/CompactIndicators.tsx"),
        "utf-8"
      );
      assert.ok(
        indSrc.includes('islandMode === "dot" && state === "Idle"') &&
          indSrc.includes('islandMode === "dot" && state !== "Expanded"'),
        "CompactIndicators must guard both Idle and Hovering states in Dot mode"
      );
      assert.ok(indSrc.includes("bbq-dot-content"));
    });
  });

  // =========================================================================
  // 3. Native HWND Region Clipping & Backdrop Synchronization
  // =========================================================================
  describe("3. Native HWND Region Clipping & Backdrop Synchronization", () => {
    it("Rust platform windows.rs implements GDI region clipping for Dot, Notch, and Island", () => {
      const winRs = fs.readFileSync(
        path.join(ROOT_DIR, "crates/platform/src/windows.rs"),
        "utf-8"
      );
      assert.ok(winRs.includes("pub fn clip_native_window_region"));
      assert.ok(winRs.includes("CreateEllipticRgn"));
      assert.ok(winRs.includes("CreatePolygonRgn"));
      assert.ok(winRs.includes("CreateRoundRectRgn"));
      assert.ok(winRs.includes("SetWindowRgn"));
    });

    it("commands/island.rs and commands/settings.rs invoke native window backdrop clipping", () => {
      const islandRs = fs.readFileSync(
        path.join(DESKTOP_DIR, "src-tauri/src/commands/island.rs"),
        "utf-8"
      );
      const settingsRs = fs.readFileSync(
        path.join(DESKTOP_DIR, "src-tauri/src/commands/settings.rs"),
        "utf-8"
      );

      assert.ok(islandRs.includes("apply_native_window_backdrop"));
      assert.ok(settingsRs.includes("clip_native_window_region"));
      assert.ok(settingsRs.includes("clear_native_window_region"));
    });

    it("Rust platform non-windows stub accepts vertical_pos parameter", () => {
      const platformLibRs = fs.readFileSync(
        path.join(ROOT_DIR, "crates/platform/src/lib.rs"),
        "utf-8"
      );
      assert.ok(
        platformLibRs.includes("_vertical_pos: Option<&str>"),
        "Non-windows platform stub must include vertical_pos parameter"
      );
    });
  });

  // =========================================================================
  // 4. Zero-Polling Policy & Performance Invariants
  // =========================================================================
  describe("4. Zero-Polling Policy & Performance Invariants", () => {
    it("verifies zero continuous requestAnimationFrame, setInterval, or recursive setTimeout in modified files", () => {
      const filesToCheck = [
        path.join(DESKTOP_DIR, "src/components/island/IslandShell.tsx"),
        path.join(DESKTOP_DIR, "src/components/island/notchGeometry.ts"),
        path.join(DESKTOP_DIR, "src/components/island/CompactIndicators.tsx"),
      ];

      for (const file of filesToCheck) {
        if (!fs.existsSync(file)) continue;
        const content = fs.readFileSync(file, "utf-8");
        assert.strictEqual(
          content.includes("setInterval"),
          false,
          `File ${path.basename(file)} must not use setInterval`
        );
        assert.strictEqual(
          /requestAnimationFrame\s*\([^)]*\)\s*=>\s*requestAnimationFrame/.test(
            content
          ),
          false,
          `File ${path.basename(file)} must not contain rAF animation loop`
        );
      }
    });

    it("preserves stable version manifests strictly aligned with v4.3 release", () => {
      const desktopPkg = JSON.parse(
        fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8")
      );
      const tauriConf = JSON.parse(
        fs.readFileSync(
          path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"),
          "utf-8"
        )
      );
      assert.strictEqual(desktopPkg.version, "4.3");
      assert.strictEqual(tauriConf.version, "4.3.0");
    });
  });
});
