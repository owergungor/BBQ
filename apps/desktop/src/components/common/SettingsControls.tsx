import React, { useState, useEffect } from "react";
import type { ThemePreference, AccentColor } from "@bbq/types";
import { CromiaColorPicker } from "./CromiaColorPicker.tsx";

/* ==========================================================================
   1. Theme Switcher / Theme Tabs (Inspired by 21st.dev / theme-tabs)
   ========================================================================== */
export { ThemeTabs, ThemeSwitcher } from "./ThemeTabs.tsx";

/* ==========================================================================
   2. Apple-Style Switch (Human Interface Guidelines compliant)
   ========================================================================== */
export { AppleSwitch, type AppleSwitchProps } from "./AppleSwitch.tsx";
import { AppleSwitch, type AppleSwitchProps } from "./AppleSwitch.tsx";

export type SwitchProps = AppleSwitchProps;
export const Switch = AppleSwitch;

/* ==========================================================================
   3. Modern Slider (Inspired by 21st.dev HeroUI Slider)
   ========================================================================== */
interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  valueDisplay?: string;
  onChange: (val: number) => void;
  onCommit?: (val: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export const Slider: React.FC<SliderProps> = ({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  valueDisplay,
  onChange,
  onCommit,
  disabled = false,
  ariaLabel,
}) => {
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <div
      className="bbq-slider-container"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        width: "100%",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label
          htmlFor={id}
          style={{
            fontWeight: 500,
            fontSize: "12px",
            color: "var(--bbq-text)",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {label}
        </label>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--bbq-text-muted)",
            background: "rgba(255, 255, 255, 0.06)",
            padding: "1px 6px",
            borderRadius: "4px",
            border: "1px solid var(--bbq-border-subtle)",
          }}
        >
          {valueDisplay || value}
        </span>
      </div>

      <div
        className="bbq-slider-track-wrapper"
        style={{
          position: "relative",
          width: "100%",
          height: "20px",
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* Custom Track */}
        <div
          className="bbq-slider-track"
          style={{
            position: "relative",
            width: "100%",
            height: "5px",
            borderRadius: "9999px",
            background: "rgba(255, 255, 255, 0.12)",
            overflow: "hidden",
          }}
        >
          {/* Custom Fill */}
          <div
            className="bbq-slider-fill"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${percentage}%`,
              background: "var(--bbq-accent)",
              borderRadius: "9999px",
            }}
          />
        </div>

        {/* Custom Thumb */}
        <div
          className="bbq-slider-thumb"
          style={{
            position: "absolute",
            left: `${percentage}%`,
            top: "50%",
            width: "14px",
            height: "14px",
            borderRadius: "50%",
            background: "#ffffff",
            border: "2px solid var(--bbq-accent)",
            transform: "translate(-50%, -50%)",
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.45)",
            pointerEvents: "none",
            transition: "transform 100ms ease",
          }}
        />

        {/* Interactive native input overlay for keyboard, drag, and tests */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              let nextVal: number;
              if (value < min) {
                nextVal = min;
              } else if (value >= max) {
                nextVal = max;
              } else {
                const rem = value % step;
                if (rem === 0) {
                  nextVal = Math.min(max, value + step);
                } else {
                  nextVal = Math.min(max, Math.ceil(value / step) * step);
                }
              }
              onChange(nextVal);
              onCommit?.(nextVal);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              let nextVal: number;
              if (value <= min) {
                nextVal = min;
              } else if (value > max) {
                nextVal = max;
              } else {
                const rem = value % step;
                if (rem === 0) {
                  nextVal = Math.max(min, value - step);
                } else {
                  nextVal = Math.max(min, Math.floor(value / step) * step);
                }
              }
              onChange(nextVal);
              onCommit?.(nextVal);
            }
          }}
          onPointerUp={() => onCommit && onCommit(value)}
          onKeyUp={() => onCommit && onCommit(value)}
          aria-label={ariaLabel || label}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: disabled ? "not-allowed" : "pointer",
            margin: 0,
            padding: 0,
          }}
        />
      </div>
    </div>
  );
};

/* ==========================================================================
   4. Accent Color Picker (11 Presets + Custom Color Picker)
   ========================================================================== */
export const ACCENT_PRESETS: {
  id: AccentColor;
  label: string;
  light: string;
  dark: string;
}[] = [
  { id: "blue", label: "Blue", light: "#007AFF", dark: "#0A84FF" },
  { id: "red", label: "Red", light: "#FF3B30", dark: "#FF453A" },
  { id: "green", label: "Green", light: "#34C759", dark: "#30D158" },
  { id: "orange", label: "Orange", light: "#FF9500", dark: "#FF9F0A" },
  { id: "yellow", label: "Yellow", light: "#FFCC00", dark: "#FFD60A" },
  { id: "pink", label: "Pink", light: "#FF2D55", dark: "#FF375F" },
  { id: "purple", label: "Purple", light: "#5856D6", dark: "#BF5AF2" },
  { id: "indigo", label: "Indigo", light: "#5856D6", dark: "#5E5CE6" },
  { id: "teal", label: "Teal", light: "#30B0C7", dark: "#40C8E0" },
  { id: "mint", label: "Mint", light: "#00C7BE", dark: "#63E6E2" },
  { id: "cyan", label: "Cyan", light: "#32ADE6", dark: "#64D2FF" },
];

interface AccentColorPickerProps {
  currentAccent: AccentColor;
  customAccentColor: string | null;
  theme?: ThemePreference;
  onChangePreset: (color: AccentColor) => void;
  onChangeCustom: (hex: string) => void;
}

export const AccentColorPicker: React.FC<AccentColorPickerProps> = ({
  currentAccent,
  customAccentColor,
  theme = "system",
  onChangePreset,
  onChangeCustom,
}) => {
  const isLight =
    theme === "light" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);

  const isCustomActive =
    currentAccent === "custom" ||
    (typeof currentAccent === "string" && currentAccent.startsWith("#"));

  const defaultCustomColor = isLight ? "#007AFF" : "#0A84FF";
  const [isCustomOpen, setIsCustomOpen] = useState(isCustomActive);
  const [customHexInput, setCustomHexInput] = useState(customAccentColor || defaultCustomColor);

  useEffect(() => {
    if (customAccentColor) {
      setCustomHexInput(customAccentColor);
    }
  }, [customAccentColor]);

  const handleHexChange = (val: string) => {
    setCustomHexInput(val);
    const clean = val.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(clean) || /^#[0-9a-fA-F]{3}$/.test(clean)) {
      onChangeCustom(clean);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ fontWeight: 500, fontSize: "12px", color: "var(--bbq-text)" }}>
          Accent Color
        </label>
        <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
          {isCustomActive ? `Custom (${customHexInput})` : currentAccent}
        </span>
      </div>

      {/* Swatches Row: 11 Presets + 1 Custom Button */}
      <div
        role="radiogroup"
        aria-label="Accent color presets"
        style={{
          display: "flex",
          gap: "6px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {ACCENT_PRESETS.map((preset) => {
          const isSelected = !isCustomActive && currentAccent === preset.id;
          const previewColor = isLight ? preset.light : preset.dark;
          return (
            <button
              key={preset.id}
              id={`accent-color-${preset.id}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => {
                onChangePreset(preset.id);
                setIsCustomOpen(false);
              }}
              title={preset.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 8px",
                borderRadius: "6px",
                border: isSelected
                  ? "2px solid var(--bbq-accent)"
                  : "1px solid var(--bbq-border)",
                background: isSelected
                  ? "var(--bbq-accent-subtle)"
                  : "var(--bbq-surface-elevated)",
                color: "var(--bbq-text)",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: isSelected ? 600 : 400,
                transition: "all 120ms ease",
              }}
            >
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: previewColor,
                  display: "inline-block",
                  boxShadow: isSelected ? `0 0 6px ${previewColor}` : "none",
                }}
              />
              <span>{preset.label}</span>
            </button>
          );
        })}

        {/* Custom Color Button */}
        <button
          id="accent-color-custom"
          type="button"
          role="radio"
          aria-checked={isCustomActive}
          onClick={() => {
            setIsCustomOpen(true);
            onChangeCustom(customHexInput);
          }}
          title="Custom Accent Color"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "4px 8px",
            borderRadius: "6px",
            border: isCustomActive
              ? "2px solid var(--bbq-accent)"
              : "1px solid var(--bbq-border)",
            background: isCustomActive
              ? "var(--bbq-accent-subtle)"
              : "var(--bbq-surface-elevated)",
            color: "var(--bbq-text)",
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: isCustomActive ? 600 : 400,
            transition: "all 120ms ease",
          }}
        >
          <span
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: isCustomActive
                ? customHexInput
                : "linear-gradient(135deg, #ff007a, #7928ca, #0070f3)",
              display: "inline-block",
              boxShadow: isCustomActive ? `0 0 6px ${customHexInput}` : "none",
            }}
          />
          <span>Custom</span>
        </button>
      </div>

      {/* Expandable Custom Color Picker Panel */}
      {isCustomOpen && (
        <div id="bbq-custom-color-panel" style={{ marginTop: "6px" }}>
          <CromiaColorPicker
            value={customHexInput}
            theme={isLight ? "light" : "dark"}
            onChange={(hex) => handleHexChange(hex)}
          />
        </div>
      )}
    </div>
  );
};
