/**
 * BBQ v2.1 — Theme Tabs (Phase 9)
 * Reference: https://21st.dev/@designali-in/components/theme-tabs
 *
 * Requirements:
 * - System / Light / Dark modes
 * - VISIBLE TEXT: NONE (pure SVG icons)
 * - Icons: monitor, sun, moon
 * - Accessible labels: aria-label and tooltips
 * - Keyboard navigation: ArrowLeft, ArrowRight, Enter/Space
 * - Reduced motion support
 * - Zero external UI libraries
 */

import React, { useCallback } from "react";
import type { ThemePreference } from "@bbq/types";
import { Icon } from "./Icon.tsx";
import { THEME_OPTIONS, type ThemeOption } from "./themeTabsModel.ts";

export { THEME_OPTIONS, type ThemeOption };

export interface ThemeTabsProps {
  theme: ThemePreference;
  onChange: (theme: ThemePreference) => void;
  className?: string;
}

export const ThemeTabs: React.FC<ThemeTabsProps> = ({
  theme,
  onChange,
  className = "",
}) => {
  const currentIndex = THEME_OPTIONS.findIndex((opt) => opt.id === theme);
  const activeIndex = currentIndex !== -1 ? currentIndex : 0;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let nextIndex = activeIndex;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nextIndex = (activeIndex - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
        onChange(THEME_OPTIONS[nextIndex].id);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextIndex = (activeIndex + 1) % THEME_OPTIONS.length;
        onChange(THEME_OPTIONS[nextIndex].id);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onChange(THEME_OPTIONS[activeIndex].id);
      }
    },
    [activeIndex, onChange]
  );

  return (
    <div
      id="bbq-theme-tabs"
      role="radiogroup"
      aria-label="Theme mode switcher"
      tabIndex={0}
      className={`bbq-theme-tabs ${className}`.trim()}
      onKeyDown={handleKeyDown}
    >
      {/* Sliding active pill indicator */}
      <div
        className="bbq-theme-tab-indicator"
        style={{
          transform: `translateX(${activeIndex * 100}%)`,
        }}
        aria-hidden="true"
      />

      {THEME_OPTIONS.map((opt) => {
        const isSelected = theme === opt.id;
        return (
          <button
            key={opt.id}
            id={`theme-btn-${opt.id}`}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${opt.label} theme`}
            title={`${opt.label} theme`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(opt.id)}
            className={`bbq-theme-tab-btn${isSelected ? " active" : ""}`}
          >
            <span className="bbq-theme-tab-icon" aria-hidden="true">
              <Icon name={opt.icon} size={14} />
            </span>
            {/* STRICT REQUIREMENT: VISIBLE TEXT: NONE */}
          </button>
        );
      })}
    </div>
  );
};

// Re-export as ThemeSwitcher for full backwards compatibility
export const ThemeSwitcher = ThemeTabs;
