import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const DESKTOP_DIR = path.resolve(import.meta.dirname, "..");
const ROOT_DIR = path.resolve(DESKTOP_DIR, "../..");

describe("BBQ v3.1 — UI Polish & Usability Release Verification", () => {
  // =========================================================================
  // 1. 1:1 Icon-Based Navigation in General Tabs (SegmentedTabBar.tsx)
  // =========================================================================
  describe("1. 1:1 Icon-Based Navigation in SegmentedTabBar.tsx", () => {
    const tabBarPath = path.join(DESKTOP_DIR, "src/components/island/SegmentedTabBar.tsx");
    const tabBarSource = fs.readFileSync(tabBarPath, "utf-8");

    it("renders native SVG Icon for each tab and prohibits emoji in tabs", () => {
      assert.ok(
        tabBarSource.includes('<Icon name={iconName} size={15} strokeWidth={1.75} />'),
        "Must render native SVG Icon with size 15 and strokeWidth 1.75"
      );
      // Prohibit emoji in tab rendering
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
      assert.strictEqual(
        emojiRegex.test(tabBarSource),
        false,
        "SegmentedTabBar must contain zero emoji"
      );
    });

    it("replaces visible text label with screen-reader accessible label and title tooltip", () => {
      // Must have visually hidden sr-only text label
      assert.ok(
        tabBarSource.includes('className="bbq-segmented-tab-label bbq-sr-only"'),
        "Must wrap text label in bbq-sr-only class for screen reader access without visible clutter"
      );
      assert.ok(
        !tabBarSource.includes('<span className="bbq-segmented-tab-label">{widget.title}</span>'),
        "Visible text label must be replaced"
      );
      // Accessible labels and tooltips
      assert.ok(
        tabBarSource.includes('title='),
        "Tab buttons must declare title attribute for native tooltip"
      );
      assert.ok(
        tabBarSource.includes('aria-label='),
        "Tab buttons must declare aria-label for accessibility"
      );
    });

    it("verifies ARIA tablist and tab role compliance", () => {
      assert.ok(tabBarSource.includes('role="tablist"'), "Container must have role=tablist");
      assert.ok(tabBarSource.includes('role="tab"'), "Tab buttons must have role=tab");
      assert.ok(tabBarSource.includes("aria-selected={isActive}"), "Must have dynamic aria-selected");
      assert.ok(tabBarSource.includes("tabIndex={isActive ? 0 : -1}"), "Must use roving tabIndex");
    });
  });

  // =========================================================================
  // 2. Removal of Visible Preferences Heading from Settings
  // =========================================================================
  describe("2. Settings Preferences Heading Accessibility & Layout", () => {
    const settingsPath = path.join(DESKTOP_DIR, "src/components/widgets/SettingsWidget.tsx");
    const settingsSource = fs.readFileSync(settingsPath, "utf-8");

    it("removes visible Preferences heading while preserving semantic h2 for accessibility", () => {
      assert.ok(
        !settingsSource.includes('<Icon name="settings" size={14} /> Preferences'),
        "Visible Preferences text heading must be removed from layout"
      );
      assert.ok(
        settingsSource.includes('<h2 className="bbq-sr-only">Settings</h2>'),
        "Must declare <h2 className=\"bbq-sr-only\">Settings</h2> for assistive technology landmark hierarchy"
      );
    });

    it("preserves status message rendering when settings are updated", () => {
      assert.ok(
        settingsSource.includes("statusMessage"),
        "Must retain status message indicator"
      );
      assert.ok(
        settingsSource.includes('role="status"'),
        "Status indicator must have role=status"
      );
    });
  });

  // =========================================================================
  // 3. Overflow and Bottom-Corner Rendering
  // =========================================================================
  describe("3. Overflow and Bottom-Corner Containment", () => {
    const cssPath = path.join(DESKTOP_DIR, "src/styles/index.css");
    const cssSource = fs.readFileSync(cssPath, "utf-8");
    const settingsSource = fs.readFileSync(
      path.join(DESKTOP_DIR, "src/components/widgets/SettingsWidget.tsx"),
      "utf-8"
    );
    const filesSource = fs.readFileSync(
      path.join(DESKTOP_DIR, "src/components/widgets/FileWorkspaceWidget.tsx"),
      "utf-8"
    );

    it("contains SettingsWidget within viewport with proper tab panel padding", () => {
      assert.ok(
        settingsSource.includes('padding: "4px 8px 6px 8px"'),
        "SettingsWidget container must have balanced padding avoiding overflow"
      );
      assert.ok(
        settingsSource.includes('overflow: "hidden"'),
        "SettingsWidget container must contain inner scrolling"
      );
      assert.ok(
        settingsSource.includes('paddingBottom: "12px"'),
        "Settings tab panels must have bottom padding to prevent bottom-corner collisions"
      );
    });

    it("ensures Clipboard card grid has bottom padding for 24px squircle corner clearance", () => {
      assert.ok(
        cssSource.includes(".bbq-clipboard-card-grid") &&
          cssSource.includes("padding: 2px 2px 14px 2px;"),
        "Clipboard card grid must have 14px bottom padding for corner clearance"
      );
    });

    it("ensures FileWorkspaceWidget has bottom padding for corner clearance", () => {
      assert.ok(
        filesSource.includes('paddingBottom: "12px"'),
        "File list in FileWorkspaceWidget must have 12px bottom padding"
      );
      assert.ok(
        cssSource.includes(".bbq-file-list") && cssSource.includes("padding-bottom: 12px;"),
        ".bbq-file-list CSS must declare padding-bottom: 12px"
      );
    });
  });

  // =========================================================================
  // 4. Duplicate Dropdown Resolution (ThemeSelect.tsx)
  // =========================================================================
  describe("4. ThemeSelect Container Isolation & Single Dropdown Control", () => {
    const themeSelectPath = path.join(DESKTOP_DIR, "src/components/common/ThemeSelect.tsx");
    const themeSelectSource = fs.readFileSync(themeSelectPath, "utf-8");

    it("ensures wrapper container div does not inherit props className to prevent duplicate dropdown box", () => {
      assert.ok(
        themeSelectSource.includes('className={`bbq-theme-select-container ${isOpen ? "dropdown-open" : ""}`.trim()}'),
        "Outer div must only declare bbq-theme-select-container and must NOT inherit className"
      );
      assert.ok(
        themeSelectSource.includes('className={`bbq-select bbq-dropdown-trigger ${isOpen ? "open" : ""} ${className}`.trim()}'),
        "Only the trigger button must declare bbq-select and receive className"
      );
    });

    it("verifies combobox and listbox keyboard controls", () => {
      assert.ok(themeSelectSource.includes('role="combobox"'), "Trigger button must have role=combobox");
      assert.ok(themeSelectSource.includes('role="listbox"'), "Dropdown menu must have role=listbox");
      assert.ok(themeSelectSource.includes('e.key === "ArrowDown"'), "Must handle ArrowDown key");
      assert.ok(themeSelectSource.includes('e.key === "ArrowUp"'), "Must handle ArrowUp key");
      assert.ok(themeSelectSource.includes('e.key === "Escape"'), "Must handle Escape key to close");
      assert.ok(themeSelectSource.includes('e.key === "Enter"'), "Must handle Enter key to select");
    });
  });

  // =========================================================================
  // 5. Move HUD One-Shot Interaction
  // =========================================================================
  describe("5. Move HUD One-Shot Interaction Logic", () => {
    const islandPath = path.join(DESKTOP_DIR, "src/components/island/Island.tsx");
    const islandSource = fs.readFileSync(islandPath, "utf-8");

    it("verifies clicking island while Move HUD is armed disarms positioning mode without expanding", () => {
      assert.ok(
        islandSource.includes("if (moveHud) {"),
        "Island handleToggle must check moveHud"
      );
      assert.ok(
        islandSource.includes('await updateSetting("move_hud", "false");'),
        "handleToggle must persist move_hud=false on placement click"
      );
      assert.ok(
        islandSource.includes("return;"),
        "handleToggle must return early without expanding on placement click"
      );
    });

    it("verifies keyboard trigger (Enter/Space) and Escape disarm positioning mode", () => {
      assert.ok(
        islandSource.includes('e.key === "Enter" || e.key === " "') &&
          islandSource.includes('await updateSetting("move_hud", "false");'),
        "Keyboard toggle on shell must disarm moveHud"
      );
      assert.ok(
        islandSource.includes("escapeManager.register"),
        "Must register escape coordinator to disarm moveHud on Escape"
      );
    });
  });

  // =========================================================================
  // 6. Restyled Theme-Aware Numeric Steppers (SettingsControls.tsx)
  // =========================================================================
  describe("6. Theme-Aware Numeric Input Steppers", () => {
    const controlsPath = path.join(DESKTOP_DIR, "src/components/common/SettingsControls.tsx");
    const controlsSource = fs.readFileSync(controlsPath, "utf-8");
    const cssPath = path.join(DESKTOP_DIR, "src/styles/index.css");
    const cssSource = fs.readFileSync(cssPath, "utf-8");

    it("renders custom stepper buttons with native SVG chevrons in NumberInput", () => {
      assert.ok(
        controlsSource.includes("bbq-number-input-stepper"),
        "NumberInput must render bbq-number-input-stepper container"
      );
      assert.ok(
        controlsSource.includes("bbq-number-stepper-up") &&
          controlsSource.includes('<Icon name="chevron-up" size={10} strokeWidth={2.5} />'),
        "Must render up stepper button with native SVG chevron-up"
      );
      assert.ok(
        controlsSource.includes("bbq-number-stepper-down") &&
          controlsSource.includes('<Icon name="chevron-down" size={10} strokeWidth={2.5} />'),
        "Must render down stepper button with native SVG chevron-down"
      );
    });

    it("suppresses ugly native browser spin buttons in CSS while styling theme-aware steppers with focus indicators", () => {
      assert.ok(
        cssSource.includes('input[type="number"]::-webkit-inner-spin-button') &&
          cssSource.includes("-webkit-appearance: none;"),
        "Must suppress default webkit spin button"
      );
      assert.ok(
        cssSource.includes(".bbq-number-stepper-btn"),
        "Must style custom stepper buttons"
      );
      assert.ok(
        cssSource.includes(".bbq-number-stepper-btn:hover:not(:disabled)"),
        "Must declare hover styles for stepper buttons"
      );
      assert.ok(
        cssSource.includes(".bbq-number-stepper-btn:focus-visible"),
        "Must declare focus-visible styles for keyboard accessibility"
      );
    });

    it("verifies accessible names and boundary clamping on stepper buttons", () => {
      assert.ok(
        controlsSource.includes("aria-label={`Increase ${label}`}"),
        "Up stepper button must declare accessible name"
      );
      assert.ok(
        controlsSource.includes("aria-label={`Decrease ${label}`}"),
        "Down stepper button must declare accessible name"
      );
      assert.ok(
        controlsSource.includes("disabled={disabled || Number(textValue) >= max}"),
        "Up stepper must be disabled when at max boundary"
      );
      assert.ok(
        controlsSource.includes("disabled={disabled || Number(textValue) <= min}"),
        "Down stepper must be disabled when at min boundary"
      );
    });

    it("preserves keyboard controls on numeric input", () => {
      assert.ok(
        controlsSource.includes('e.key === "ArrowUp"'),
        "Must preserve ArrowUp keyboard handling"
      );
      assert.ok(
        controlsSource.includes('e.key === "ArrowDown"'),
        "Must preserve ArrowDown keyboard handling"
      );
      assert.ok(
        controlsSource.includes('e.key === "Enter"'),
        "Must preserve Enter keyboard handling"
      );
      assert.ok(
        controlsSource.includes('e.key === "Escape"'),
        "Must preserve Escape keyboard handling"
      );
    });
  });

  // =========================================================================
  // 7. Island Readability as Transparency Increases
  // =========================================================================
  describe("7. Transparency Readability & Material Backing", () => {
    const cssPath = path.join(DESKTOP_DIR, "src/styles/index.css");
    const cssSource = fs.readFileSync(cssPath, "utf-8");

    it("implements restrained theme-aware translucent backing material via pseudo-element", () => {
      assert.ok(
        cssSource.includes(".bbq-island-shell::before"),
        "Must declare .bbq-island-shell::before translucent material layer"
      );
      assert.ok(
        cssSource.includes("var(--bbq-island-backing"),
        "Must reference theme-aware backing color token"
      );
      assert.ok(
        cssSource.includes("[data-theme=\"light\"] .bbq-island-shell::before"),
        "Must declare light-theme translucent backing token"
      );
      assert.ok(
        cssSource.includes("[data-opaque=\"true\"] .bbq-island-shell::before"),
        "Must hide backing when opaque mode is active"
      );
    });

    it("respects prefers-reduced-transparency accessibility setting", () => {
      assert.ok(
        cssSource.includes("@media (prefers-reduced-transparency: reduce)"),
        "Must support @media (prefers-reduced-transparency: reduce)"
      );
      assert.ok(
        cssSource.includes("[data-reduced-transparency=\"true\"]"),
        "Must support data-reduced-transparency attribute"
      );
    });

    it("strictly prohibits drop-shadow filters, outer glows, and heavy blur on island shell", () => {
      const shellBlock = cssSource.split(".bbq-island-shell {")[1]?.split("}")[0] || "";
      assert.strictEqual(
        shellBlock.includes("drop-shadow"),
        false,
        "Base shell must not declare drop-shadow filter"
      );
      assert.strictEqual(
        shellBlock.includes("box-shadow: 0 0"),
        false,
        "Base shell must not declare outer glows"
      );
    });
  });

  // =========================================================================
  // 8. Public Version 3.1 & Two-Component Convention
  // =========================================================================
  describe("8. BBQ v3.1 Two-Component Public Version Integrity", () => {
    it("verifies public version is strictly two-component format and internal toolchain version is normalized", () => {
      const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
      const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "package.json"), "utf-8"));
      const typesPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "packages/types/package.json"), "utf-8"));
      const tauriConf = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/tauri.conf.json"), "utf-8"));
      const desktopCargo = fs.readFileSync(path.join(DESKTOP_DIR, "src-tauri/Cargo.toml"), "utf-8");

      assert.ok(rootPkg.version === "3.7" || rootPkg.version === "3.6" || rootPkg.version === "3.5" || rootPkg.version === "3.4" || rootPkg.version === "3.3" || rootPkg.version === "3.2" || rootPkg.version === "3.1", "Root package.json version must be valid");
      assert.ok(desktopPkg.version === "3.7" || desktopPkg.version === "3.6" || desktopPkg.version === "3.5" || desktopPkg.version === "3.4" || desktopPkg.version === "3.3" || desktopPkg.version === "3.2" || desktopPkg.version === "3.1", "apps/desktop/package.json version must be valid");
      assert.ok(typesPkg.version === "3.7" || typesPkg.version === "3.6" || typesPkg.version === "3.5" || typesPkg.version === "3.4" || typesPkg.version === "3.3" || typesPkg.version === "3.2" || typesPkg.version === "3.1", "packages/types/package.json version must be valid");

      assert.ok(tauriConf.version === "3.7.0" || tauriConf.version === "3.6.0" || tauriConf.version === "3.5.0" || tauriConf.version === "3.4.0" || tauriConf.version === "3.3.0" || tauriConf.version === "3.2.0" || tauriConf.version === "3.1.0", "tauri.conf.json version must be normalized SemVer");
      assert.ok(desktopCargo.includes('version = "3.7.0"') || desktopCargo.includes('version = "3.6.0"') || desktopCargo.includes('version = "3.5.0"') || desktopCargo.includes('version = "3.4.0"') || desktopCargo.includes('version = "3.3.0"') || desktopCargo.includes('version = "3.2.0"') || desktopCargo.includes('version = "3.1.0"'), "Desktop Cargo.toml must declare SemVer");
    });
  });
});
