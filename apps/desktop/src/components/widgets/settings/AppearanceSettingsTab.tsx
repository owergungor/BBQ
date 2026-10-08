import React from "react";
import type { AccentColor } from "@bbq/types";
import {
  ThemeSwitcher,
  Switch,
  AccentColorPicker,
} from "../../common/SettingsControls.tsx";
import {
  SYSTEM_ACCENT_COLORS,
  type AccentPreset,
} from "../../../state/settingsState.ts";
import { computeWcagContrast } from "../settingsModel.ts";
import type { AppearanceSettingsTabProps } from "./settingsTypes.ts";

export const AppearanceSettingsTab: React.FC<AppearanceSettingsTabProps> = ({
  theme,
  accentColor,
  customAccentColor,
  reducedMotion,
  startAtLogin,
  onThemeChange,
  onAccentColorChange,
  onCustomAccentChange,
  onToggle,
}) => {
  const activeColorHex =
    accentColor === "custom" || (accentColor && accentColor.startsWith("#"))
      ? customAccentColor || "#007aff"
      : SYSTEM_ACCENT_COLORS[accentColor as AccentPreset]?.dark || "#0a84ff";
  const bgHex = theme === "light" ? "#ffffff" : "#121216";
  const contrast = computeWcagContrast(activeColorHex, bgHex);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <label style={{ fontWeight: 500, fontSize: "12px", color: "var(--bbq-text)", display: "block" }}>
            Theme Mode
          </label>
          <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)", display: "block", marginTop: "2px" }}>
            Select interface color scheme or match operating system.
          </span>
        </div>
        <ThemeSwitcher theme={theme} onChange={onThemeChange} />
      </div>

      <AccentColorPicker
        currentAccent={(accentColor || "blue") as AccentColor}
        customAccentColor={customAccentColor}
        theme={theme}
        onChangePreset={onAccentColorChange}
        onChangeCustom={onCustomAccentChange}
      />

      <div
        id="wcag-contrast-status"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderRadius: "6px",
          background: "var(--bbq-surface-elevated)",
          border: "1px solid var(--bbq-border)",
          fontSize: "11px",
        }}
      >
        <span style={{ color: "var(--bbq-text-muted)" }}>
          Accessibility Contrast: <strong style={{ color: "var(--bbq-text)" }}>{contrast.ratio}:1</strong>
        </span>
        <span
          style={{
            fontWeight: 600,
            color: contrast.normalTextAa ? "var(--bbq-success, #34c759)" : "var(--bbq-warning, #ff9500)",
          }}
        >
          {contrast.normalTextAaa
            ? "AAA Compliant"
            : contrast.normalTextAa
            ? "AA Compliant"
            : contrast.largeTextAa
            ? "AA Large Only"
            : "Fails WCAG AA"}
        </span>
      </div>

      <Switch
        id="reduced-motion-toggle"
        checked={reducedMotion}
        onChange={(checked) => onToggle("reduced_motion", checked)}
        label="Reduced Motion"
        description="Disables non-essential scale transitions and floating animations for accessibility."
      />

      <Switch
        id="start-at-login-toggle"
        checked={startAtLogin}
        onChange={(checked) => onToggle("start_at_login", checked)}
        label="Launch at Login"
        description="Start BBQ automatically on system startup."
      />
    </div>
  );
};
