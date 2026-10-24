import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, "..");

describe("BBQ v3.6 — Step 3: True Opaque Transparency & Background Blur Contracts", () => {
  const cssPath = path.join(DESKTOP_DIR, "src/styles/index.css");
  const settingsStatePath = path.join(DESKTOP_DIR, "src/state/settingsState.ts");
  const islandShellPath = path.join(DESKTOP_DIR, "src/components/island/IslandShell.tsx");
  const islandSettingsTabPath = path.join(
    DESKTOP_DIR,
    "src/components/widgets/settings/IslandSettingsTab.tsx"
  );
  const backendSettingsCmdPath = path.join(
    DESKTOP_DIR,
    "src-tauri/src/commands/settings.rs"
  );
  const backendLibPath = path.join(DESKTOP_DIR, "src-tauri/src/lib.rs");

  const cssContent = fs.readFileSync(cssPath, "utf-8");
  const settingsStateContent = fs.readFileSync(settingsStatePath, "utf-8");
  const islandShellContent = fs.readFileSync(islandShellPath, "utf-8");
  const islandSettingsTabContent = fs.readFileSync(islandSettingsTabPath, "utf-8");
  const backendSettingsCmdContent = fs.readFileSync(backendSettingsCmdPath, "utf-8");
  const backendLibContent = fs.readFileSync(backendLibPath, "utf-8");

  // =========================================================================
  // 1. True Opaque Mode
  // =========================================================================
  describe("1. True Opaque Mode Invariants", () => {
    it("verifies [data-opaque='true'] maps to fully solid opaque colors (alpha=1)", () => {
      // Must use solid tokens var(--bbq-bg-idle) and var(--bbq-bg-expanded), NOT translucent glass tokens
      assert.ok(
        cssContent.includes('[data-opaque="true"] .bbq-island-shell.state-idle') &&
          cssContent.includes("background: var(--bbq-bg-idle) !important;"),
        "data-opaque idle state must use solid --bbq-bg-idle"
      );
      assert.ok(
        cssContent.includes('[data-opaque="true"] .bbq-island-shell.state-expanded') &&
          cssContent.includes("background: var(--bbq-bg-expanded) !important;"),
        "data-opaque expanded state must use solid --bbq-bg-expanded"
      );
      assert.strictEqual(
        cssContent.includes('[data-opaque="true"] .bbq-island-shell.state-idle,\n:root[data-opaque="true"] .bbq-island-shell.state-idle,\n[data-opaque="true"] .bbq-island-shell.state-hovering,\n:root[data-opaque="true"] .bbq-island-shell.state-hovering {\n  background: var(--bbq-surface-glass-idle);'),
        false,
        "data-opaque must NOT use translucent --bbq-surface-glass-idle"
      );
    });

    it("verifies [data-opaque='true'] hides the pseudo-element backing layer", () => {
      assert.ok(
        cssContent.includes('[data-opaque="true"] .bbq-island-shell::before {\n  display: none;\n}'),
        "data-opaque must hide ::before backing layer to prevent any alpha bleed-through"
      );
    });

    it("verifies settingsState.ts sets data-opaque strictly when island_transparency is 0", () => {
      assert.ok(
        settingsStateContent.includes('if (clamped === 0) {') &&
          settingsStateContent.includes('document.documentElement.setAttribute("data-opaque", "true");'),
        "settingsState must activate data-opaque attribute at 0% transparency"
      );
      assert.ok(
        settingsStateContent.includes('document.documentElement.removeAttribute?.("data-opaque");'),
        "settingsState must remove data-opaque when transparency > 0"
      );
    });
  });

  // =========================================================================
  // 2. Translucent State
  // =========================================================================
  describe("2. Translucent State & CSS Backdrop Invariants", () => {
    it("verifies translucent state applies color-mix with --bbq-island-opacity", () => {
      assert.ok(
        cssContent.includes("color-mix(in srgb, var(--bbq-surface-glass-idle) calc(var(--bbq-island-opacity, 1) * 100%), transparent)"),
        "Translucent state must modulate opacity via color-mix"
      );
      assert.ok(
        cssContent.includes("color-mix(in srgb, var(--bbq-surface-glass-expanded) calc(var(--bbq-island-opacity, 1) * 100%), transparent)"),
        "Expanded translucent state must modulate opacity via color-mix"
      );
    });

    it("ensures data-opaque does not strip backdrop-filter", () => {
      assert.strictEqual(
        cssContent.includes('[data-opaque="true"] .bbq-island-shell {\n  backdrop-filter: none !important;'),
        false,
        "data-opaque must preserve backdrop-filter capability"
      );
    });
  });

  // =========================================================================
  // 3. Reduced Transparency Accessibility Fallback
  // =========================================================================
  describe("3. System Reduced Transparency Accessibility Fallback", () => {
    it("verifies system reduced transparency forces solid opaque surface and disables blur", () => {
      assert.ok(
        cssContent.includes("@media (prefers-reduced-transparency: reduce)") &&
          cssContent.includes("background: var(--bbq-bg-idle) !important;"),
        "System reduced transparency must force solid background"
      );
      assert.ok(
        cssContent.includes("@media (prefers-reduced-transparency: reduce)") &&
          cssContent.includes("backdrop-filter: none !important;"),
        "System reduced transparency must disable backdrop blur"
      );
    });
  });

  // =========================================================================
  // 4. Blur Slider Range & Clamping
  // =========================================================================
  describe("4. Blur Slider Range & Clamping Invariants", () => {
    it("verifies blur slider UI is bounded to 0..=40 with default 20", () => {
      assert.ok(
        islandSettingsTabContent.includes('id="island-blur-slider"'),
        "Must declare island-blur-slider"
      );
      assert.ok(
        islandSettingsTabContent.includes("min={0}"),
        "Slider min must be 0"
      );
      assert.ok(
        islandSettingsTabContent.includes("max={40}"),
        "Slider max must be 40"
      );
      assert.ok(
        islandSettingsTabContent.includes("valueDisplay={`${draftBlur}px`}"),
        "Slider unit display must be px"
      );
    });

    it("verifies blur value 0 activates data-blur-zero attribute", () => {
      assert.ok(
        settingsStateContent.includes('if (blur === 0) {') &&
          settingsStateContent.includes('document.documentElement.setAttribute("data-blur-zero", "true");'),
        "settingsState must set data-blur-zero when blur is 0"
      );
      assert.ok(
        cssContent.includes('[data-blur-zero="true"] .bbq-island-shell') &&
          cssContent.includes("backdrop-filter: none !important;"),
        "CSS must disable backdrop-filter when data-blur-zero is active"
      );
    });
  });

  // =========================================================================
  // 5. Native Compositor Window Backdrop Integration
  // =========================================================================
  describe("5. Native Compositor Window Backdrop Integration", () => {
    it("verifies backend exposes apply_native_window_backdrop synchronized with settings", () => {
      assert.ok(
        backendSettingsCmdContent.includes("pub fn apply_native_window_backdrop"),
        "Backend must export apply_native_window_backdrop"
      );
      assert.ok(
        backendSettingsCmdContent.includes("should_enable_native_blur") &&
                    backendSettingsCmdContent.includes("settings.island_transparency > 0") &&
          backendSettingsCmdContent.includes("settings.island_blur > 0"),
        "Backdrop must only be active when translucent and blur > 0"
      );
      assert.ok(
        backendSettingsCmdContent.includes("window.set_effects("),
        "Backend must use Tauri official window.set_effects API"
      );
      assert.ok(
        backendSettingsCmdContent.includes("window.set_effects(None)"),
        "Backend must clear window effects when blur is disabled or opaque"
      );
    });

    it("verifies startup setup initializes native backdrop from stored SQLite settings", () => {
      assert.ok(
        backendLibContent.includes("commands::settings::apply_native_window_backdrop(&window, &initial_settings);"),
        "lib.rs setup must initialize window backdrop from initial stored settings"
      );
    });

    it("verifies runtime settings synchronization updates native backdrop on blur/transparency changes", () => {
      assert.ok(
        backendSettingsCmdContent.includes("let blur_changed =") &&
          backendSettingsCmdContent.includes("prev.map(|p| p.island_blur) != Some(current.island_blur)"),
        "sync_runtime_services_with_settings must track blur_changed"
      );
      assert.ok(
        backendSettingsCmdContent.includes("let transparency_changed =") &&
          backendSettingsCmdContent.includes("prev.map(|p| p.island_transparency) != Some(current.island_transparency)"),
        "sync_runtime_services_with_settings must track transparency_changed"
      );
    });
  });

  // =========================================================================
  // 6. Content Protection & Non-Regression
  // =========================================================================
  describe("6. Content Protection & Non-Regression Invariants", () => {
    it("verifies filter: blur() is NEVER applied to the island container or its children", () => {
      // Must not apply filter: blur to .bbq-island-shell or #bbq-island-container
      const hasFilterBlurOnShell = /\.bbq-island-shell\s*\{[^}]*filter:\s*blur/i.test(cssContent);
      const hasFilterBlurOnContainer = /#bbq-island-container\s*\{[^}]*filter:\s*blur/i.test(cssContent);
      assert.strictEqual(hasFilterBlurOnShell, false, "Must never apply filter: blur to .bbq-island-shell");
      assert.strictEqual(hasFilterBlurOnContainer, false, "Must never apply filter: blur to #bbq-island-container");
    });

    it("verifies Step 1 natural settings sizing and Step 2 modal integration remain intact", () => {
      const settingsWidgetPath = path.join(DESKTOP_DIR, "src/components/widgets/SettingsWidget.tsx");
      const settingsWidgetContent = fs.readFileSync(settingsWidgetPath, "utf-8");
      const updateModalPath = path.join(DESKTOP_DIR, "src/components/updater/UpdateModal.tsx");
      const updateModalContent = fs.readFileSync(updateModalPath, "utf-8");

      assert.ok(
        settingsWidgetContent.includes("settingsTabHeightStore"),
        "Step 1 settingsTabHeightStore must be intact"
      );
      assert.ok(
        updateModalContent.includes('role="dialog"') &&
          updateModalContent.includes('id="updater-modal-close-btn"'),
        "Step 2 UpdateModal must be intact"
      );
    });
  });
});
