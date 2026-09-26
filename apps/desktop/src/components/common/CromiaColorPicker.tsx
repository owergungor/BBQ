/**
 * BBQ v2.1 — Cromia-Inspired Color Picker Component
 *
 * Implements:
 * - 2D Saturation-Value (SV) gradient area with interactive mouse/touch and keyboard navigation
 * - 1D Hue slider (0°..360°)
 * - 1D Alpha slider (0%..100%)
 * - HEX and RGB input modes with bidirectional sync & invalid input protection
 * - Curated preset swatches
 * - Live WCAG contrast indicator against active theme
 * - Zero external UI libraries (No Tailwind, No Radix, No HeroUI)
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  hsvToRgb,
  rgbToHsv,
  hexToRgba,
  rgbaToHex,
  clamp,
  validateColorInput,
  type HSVA,
} from "./colorUtils.ts";
import { computeWcagContrast } from "../widgets/settingsModel.ts";

export interface ColorPreset {
  id: string;
  label: string;
  hex: string;
}

export const CROMIA_PRESETS: ColorPreset[] = [
  { id: "blue", label: "Blue", hex: "#0a84ff" },
  { id: "purple", label: "Purple", hex: "#bf5af2" },
  { id: "pink", label: "Pink", hex: "#ff375f" },
  { id: "red", label: "Red", hex: "#ff453a" },
  { id: "orange", label: "Orange", hex: "#ff9f0a" },
  { id: "amber", label: "Amber", hex: "#ffd60a" },
  { id: "green", label: "Green", hex: "#32d74b" },
  { id: "emerald", label: "Emerald", hex: "#30d158" },
  { id: "teal", label: "Teal", hex: "#64d2ff" },
  { id: "cyan", label: "Cyan", hex: "#70d7ff" },
  { id: "slate", label: "Slate", hex: "#8e8e93" },
  { id: "white", label: "White", hex: "#ffffff" },
];

export interface CromiaColorPickerProps {
  value: string; // HEX or RGBA string
  onChange: (hex: string) => void;
  theme?: "dark" | "light" | "system";
  presets?: ColorPreset[];
  showAlpha?: boolean;
}

export const CromiaColorPicker: React.FC<CromiaColorPickerProps> = ({
  value,
  onChange,
  theme = "dark",
  presets = CROMIA_PRESETS,
  showAlpha = true,
}) => {
  // Parse initial color into HSVA and RGBA
  const initialRgba = hexToRgba(value) || { r: 10, g: 132, b: 255, a: 1 };
  const initialHsv = rgbToHsv(initialRgba.r, initialRgba.g, initialRgba.b);

  const [hsva, setHsva] = useState<HSVA>({
    h: initialHsv.h,
    s: initialHsv.s,
    v: initialHsv.v,
    a: initialRgba.a,
  });

  const [hexInput, setHexInput] = useState<string>(value);
  const [rgbMode, setRgbMode] = useState<boolean>(false);

  const svAreaRef = useRef<HTMLDivElement>(null);

  // Sync state if external value changes
  useEffect(() => {
    const parsed = hexToRgba(value);
    if (parsed) {
      const hsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
      setHsva({ h: hsv.h, s: hsv.s, v: hsv.v, a: parsed.a });
      setHexInput(value);
    }
  }, [value]);

  // Current RGB representation
  const rgb = hsvToRgb(hsva.h, hsva.s, hsva.v);
  const currentHex = rgbaToHex(rgb.r, rgb.g, rgb.b, hsva.a);

  // Emit change to parent
  const commitColor = useCallback(
    (newHsva: HSVA) => {
      setHsva(newHsva);
      const newRgb = hsvToRgb(newHsva.h, newHsva.s, newHsva.v);
      const newHex = rgbaToHex(newRgb.r, newRgb.g, newRgb.b, newHsva.a);
      setHexInput(newHex);
      onChange(newHex);
    },
    [onChange]
  );

  // SV Area Pointer Interaction
  const handleSvPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!svAreaRef.current) return;
      const rect = svAreaRef.current.getBoundingClientRect();
      const x = clamp(clientX - rect.left, 0, rect.width);
      const y = clamp(clientY - rect.top, 0, rect.height);

      const s = rect.width > 0 ? x / rect.width : 0;
      const v = rect.height > 0 ? 1 - y / rect.height : 1;

      commitColor({ ...hsva, s, v });
    },
    [hsva, commitColor]
  );

  const onSvMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleSvPointer(e.clientX, e.clientY);

    const onMouseMove = (moveEvent: MouseEvent) => {
      handleSvPointer(moveEvent.clientX, moveEvent.clientY);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // SV Area Keyboard Navigation
  const handleSvKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    let nextS = hsva.s;
    let nextV = hsva.v;
    let handled = false;

    switch (e.key) {
      case "ArrowLeft":
        nextS = clamp(hsva.s - step, 0, 1);
        handled = true;
        break;
      case "ArrowRight":
        nextS = clamp(hsva.s + step, 0, 1);
        handled = true;
        break;
      case "ArrowUp":
        nextV = clamp(hsva.v + step, 0, 1);
        handled = true;
        break;
      case "ArrowDown":
        nextV = clamp(hsva.v - step, 0, 1);
        handled = true;
        break;
    }

    if (handled) {
      e.preventDefault();
      commitColor({ ...hsva, s: nextS, v: nextV });
    }
  };

  // Hue slider change
  const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextH = parseFloat(e.target.value);
    commitColor({ ...hsva, h: nextH });
  };

  // Alpha slider change
  const handleAlphaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextA = parseFloat(e.target.value) / 100;
    commitColor({ ...hsva, a: nextA });
  };

  // HEX Input change & validation
  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexInput(val);

    const validated = validateColorInput(val);
    if (validated.valid && validated.rgba) {
      const hsv = rgbToHsv(validated.rgba.r, validated.rgba.g, validated.rgba.b);
      setHsva({
        h: hsv.h,
        s: hsv.s,
        v: hsv.v,
        a: validated.rgba.a,
      });
      onChange(validated.hex);
    }
  };

  // RGB Individual Inputs change
  const handleRgbChannelChange = (channel: "r" | "g" | "b", valStr: string) => {
    const num = parseInt(valStr, 10);
    if (isNaN(num)) return;
    const clamped = clamp(num, 0, 255);
    const nextRgb = { ...rgb, [channel]: clamped };
    const nextHsv = rgbToHsv(nextRgb.r, nextRgb.g, nextRgb.b);
    commitColor({ ...hsva, h: nextHsv.h, s: nextHsv.s, v: nextHsv.v });
  };

  // WCAG Contrast calculation
  const bgHex = theme === "light" ? "#ffffff" : "#121216";
  const contrast = computeWcagContrast(currentHex, bgHex);

  return (
    <div
      id="bbq-cromia-color-picker"
      className="bbq-cromia-container"
      role="region"
      aria-label="Cromia Color Picker"
    >
      {/* 2D SV Gradient Area */}
      <div
        ref={svAreaRef}
        id="bbq-cromia-sv-area"
        className="bbq-cromia-sv-area"
        tabIndex={0}
        role="slider"
        aria-label="Saturation and Value area"
        aria-valuetext={`Saturation ${Math.round(hsva.s * 100)}%, Value ${Math.round(hsva.v * 100)}%`}
        style={{
          backgroundColor: `hsl(${hsva.h}, 100%, 50%)`,
        }}
        onMouseDown={onSvMouseDown}
        onKeyDown={handleSvKeyDown}
      >
        <div className="bbq-cromia-sv-white" />
        <div className="bbq-cromia-sv-black" />
        <div
          id="bbq-cromia-sv-thumb"
          className="bbq-cromia-sv-thumb"
          style={{
            left: `${hsva.s * 100}%`,
            top: `${(1 - hsva.v) * 100}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>

      {/* Sliders Container (Hue & Alpha) */}
      <div className="bbq-cromia-sliders">
        <div className="bbq-cromia-slider-row">
          <input
            id="bbq-cromia-hue-slider"
            type="range"
            min="0"
            max="360"
            step="1"
            value={hsva.h}
            onChange={handleHueChange}
            className="bbq-cromia-slider bbq-cromia-hue-slider"
            aria-label="Hue Slider"
          />
        </div>

        {showAlpha && (
          <div className="bbq-cromia-slider-row">
            <input
              id="bbq-cromia-alpha-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(hsva.a * 100)}
              onChange={handleAlphaChange}
              className="bbq-cromia-slider bbq-cromia-alpha-slider"
              style={
                {
                  "--cromia-rgb": `${rgb.r}, ${rgb.g}, ${rgb.b}`,
                } as React.CSSProperties
              }
              aria-label="Opacity Alpha Slider"
            />
          </div>
        )}
      </div>

      {/* Input Fields & Mode Switcher */}
      <div className="bbq-cromia-inputs-section">
        {/* Color Preview Swatch */}
        <div
          id="bbq-cromia-preview-swatch"
          className="bbq-cromia-preview-swatch"
          style={{ backgroundColor: currentHex }}
          title={`Active color: ${currentHex}`}
        />

        {!rgbMode ? (
          /* HEX Mode */
          <div className="bbq-cromia-hex-group">
            <span className="bbq-cromia-input-label">HEX</span>
            <input
              id="bbq-cromia-hex-input"
              type="text"
              value={hexInput}
              onChange={handleHexInputChange}
              maxLength={9}
              className="bbq-cromia-text-input bbq-cromia-hex-input"
              aria-label="Hex color value"
            />
          </div>
        ) : (
          /* RGB Mode */
          <div className="bbq-cromia-rgb-group">
            <div className="bbq-cromia-rgb-field">
              <span className="bbq-cromia-input-label">R</span>
              <input
                id="bbq-cromia-r-input"
                type="number"
                min="0"
                max="255"
                value={rgb.r}
                onChange={(e) => handleRgbChannelChange("r", e.target.value)}
                className="bbq-cromia-text-input bbq-cromia-rgb-input"
                aria-label="Red channel"
              />
            </div>
            <div className="bbq-cromia-rgb-field">
              <span className="bbq-cromia-input-label">G</span>
              <input
                id="bbq-cromia-g-input"
                type="number"
                min="0"
                max="255"
                value={rgb.g}
                onChange={(e) => handleRgbChannelChange("g", e.target.value)}
                className="bbq-cromia-text-input bbq-cromia-rgb-input"
                aria-label="Green channel"
              />
            </div>
            <div className="bbq-cromia-rgb-field">
              <span className="bbq-cromia-input-label">B</span>
              <input
                id="bbq-cromia-b-input"
                type="number"
                min="0"
                max="255"
                value={rgb.b}
                onChange={(e) => handleRgbChannelChange("b", e.target.value)}
                className="bbq-cromia-text-input bbq-cromia-rgb-input"
                aria-label="Blue channel"
              />
            </div>
          </div>
        )}

        {/* Toggle Mode Button */}
        <button
          id="bbq-cromia-mode-toggle"
          type="button"
          className="bbq-cromia-mode-btn"
          onClick={() => setRgbMode((prev) => !prev)}
          title={`Switch to ${rgbMode ? "HEX" : "RGB"} mode`}
          aria-label={`Switch color mode to ${rgbMode ? "HEX" : "RGB"}`}
        >
          {rgbMode ? "HEX" : "RGB"}
        </button>
      </div>

      {/* Preset Swatches */}
      {presets && presets.length > 0 && (
        <div
          id="bbq-cromia-presets-row"
          className="bbq-cromia-presets-row"
          role="radiogroup"
          aria-label="Color presets"
        >
          {presets.map((preset) => {
            const isSelected = currentHex.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.id}
                id={`bbq-cromia-preset-${preset.id}`}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={
                  "bbq-cromia-preset-btn" + (isSelected ? " selected" : "")
                }
                style={{ backgroundColor: preset.hex }}
                onClick={() => {
                  const validated = validateColorInput(preset.hex);
                  if (validated.valid && validated.rgba) {
                    const hsv = rgbToHsv(validated.rgba.r, validated.rgba.g, validated.rgba.b);
                    commitColor({
                      h: hsv.h,
                      s: hsv.s,
                      v: hsv.v,
                      a: validated.rgba.a,
                    });
                  }
                }}
                title={preset.label}
                aria-label={preset.label}
              />
            );
          })}
        </div>
      )}

      {/* WCAG Contrast Status */}
      <div id="bbq-cromia-wcag-badge" className="bbq-cromia-wcag-badge">
        <span className="bbq-cromia-wcag-label">
          Contrast: <strong>{contrast.ratio}:1</strong>
        </span>
        <span
          className={
            "bbq-cromia-wcag-tag" +
            (contrast.normalTextAa ? " pass" : " warn")
          }
        >
          {contrast.normalTextAa ? "WCAG AA Pass" : "Low Contrast"}
        </span>
      </div>
    </div>
  );
};
