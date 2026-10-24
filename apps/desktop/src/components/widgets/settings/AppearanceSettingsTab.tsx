import React from "react";
import type { AccentColor, SupportedLanguage } from "@bbq/types";
import {
  ThemeSwitcher,
  Switch,
  AccentColorPicker,
} from "../../common/SettingsControls.tsx";
import { ThemeSelect } from "../../common/ThemeSelect.tsx";
import {
  SYSTEM_ACCENT_COLORS,
  type AccentPreset,
} from "../../../state/settingsState.ts";
import { computeWcagContrast } from "../settingsModel.ts";
import { useTranslation, LANGUAGE_OPTIONS } from "../../../i18n/index.ts";
import type { AppearanceSettingsTabProps } from "./settingsTypes.ts";

export const AppearanceSettingsTab: React.FC<AppearanceSettingsTabProps> = ({
  theme,
  accentColor,
  customAccentColor,
  reducedMotion,
  startAtLogin,
  language,
  onThemeChange,
  onAccentColorChange,
  onCustomAccentChange,
  onToggle,
  onLanguageChange,
}) => {
  const { t } = useTranslation();
  const activeColorHex =
    accentColor === "custom" || (accentColor && accentColor.startsWith("#"))
      ? customAccentColor || "#007aff"
      : SYSTEM_ACCENT_COLORS[accentColor as AccentPreset]?.dark || "#0a84ff";
  const bgHex = theme === "light" ? "#ffffff" : "#121216";
  const contrast = computeWcagContrast(activeColorHex, bgHex);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Language Selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <label
            htmlFor="settings-language-select"
            style={{ fontWeight: 500, fontSize: "12px", color: "var(--bbq-text)", display: "block" }}
          >
            {t("common.language")}
          </label>
          <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)", display: "block", marginTop: "2px" }}>
            {t("common.selectLanguage")}
          </span>
        </div>
        <ThemeSelect
          id="settings-language-select"
          value={language || "en"}
          options={LANGUAGE_OPTIONS}
          onChange={(newLang) => onLanguageChange?.(newLang as SupportedLanguage)}
          ariaLabel={t("common.selectLanguage")}
          style={{ width: "160px" }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <label style={{ fontWeight: 500, fontSize: "12px", color: "var(--bbq-text)", display: "block" }}>
            {t("settings.appearance.themeMode")}
          </label>
          <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)", display: "block", marginTop: "2px" }}>
            {t("settings.appearance.themeDescription")}
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
          {t("settings.appearance.accessibilityContrast")}: <strong style={{ color: "var(--bbq-text)" }}>{contrast.ratio}:1</strong>
        </span>
        <span
          style={{
            fontWeight: 600,
            color: contrast.normalTextAa ? "var(--bbq-success, #34c759)" : "var(--bbq-warning, #ff9500)",
          }}
        >
          {contrast.normalTextAaa
            ? t("settings.appearance.aaaCompliant")
            : contrast.normalTextAa
            ? t("settings.appearance.aaCompliant")
            : contrast.largeTextAa
            ? t("settings.appearance.aaLargeOnly")
            : t("settings.appearance.failsWcag")}
        </span>
      </div>

      <Switch
        id="reduced-motion-toggle"
        checked={reducedMotion}
        onChange={(checked) => onToggle("reduced_motion", checked)}
        label={t("settings.appearance.reducedMotion")}
        description={t("settings.appearance.reducedMotionDesc")}
      />
      <Switch
        id="start-at-login-toggle"
        checked={startAtLogin}
        onChange={(checked) => onToggle("start_at_login", checked)}
        label={t("settings.appearance.startAtLogin")}
        description={t("settings.appearance.startAtLoginDesc")}
      />
    </div>
  );
};
