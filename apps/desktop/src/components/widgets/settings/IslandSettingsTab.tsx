import React from "react";
import { Slider, Switch, ThemeSelect } from "../../common/SettingsControls.tsx";
import { type IslandSettingsTabProps } from "./settingsTypes.ts";
import { useTranslation } from "../../../i18n/index.ts";

export const IslandSettingsTab: React.FC<IslandSettingsTabProps> = ({
  draftWidth,
  draftHeight,
  draftTransparency,
  draftBlur = 20,
  islandPosition,
  alwaysOnTop,
  autoExpandOnEvent,
  onDraftWidthChange,
  onDraftHeightChange,
  onDraftTransparencyChange,
  onDraftBlurChange,
  onCommitWidth,
  onCommitHeight,
  onCommitTransparency,
  onCommitBlur,
  onToggle,
}) => {
  const { t } = useTranslation();

  const positionOptions = [
    { value: "top-center", label: t("settings.island.posTopCenter") || "Top Center" },
    { value: "top-left", label: t("settings.island.posTopLeft") || "Top Left" },
    { value: "top-right", label: t("settings.island.posTopRight") || "Top Right" },
    { value: "bottom-left", label: t("settings.island.posBottomLeft") || "Bottom Left" },
    { value: "bottom-center", label: t("settings.island.posBottomCenter") || "Bottom Center" },
    { value: "bottom-right", label: t("settings.island.posBottomRight") || "Bottom Right" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Slider
        id="island-width-slider"
        label={t("settings.island.compactWidth") || "Compact Width"}
        value={draftWidth}
        min={180}
        max={480}
        step={50}
        compact={true}
        valueDisplay={`${draftWidth}px`}
        onChange={(val) => {
          let nextVal: number;
          if (val <= 180) {
            nextVal = 180;
          } else if (val >= 480) {
            nextVal = 480;
          } else {
            nextVal = Math.max(180, Math.min(480, Math.round(val / 50) * 50));
          }
          onDraftWidthChange(nextVal);
          if (typeof document !== "undefined") {
            document.documentElement.style.setProperty("--bbq-compact-width", `${nextVal}px`);
            document.documentElement.style.setProperty("--bbq-peek-width", `${nextVal + 40}px`);
          }
        }}
        onCommit={onCommitWidth}
      />

      <Slider
        id="island-height-slider"
        label={t("settings.island.compactHeight") || "Compact Height"}
        value={draftHeight}
        min={36}
        max={54}
        step={2}
        compact={true}
        valueDisplay={`${draftHeight}px`}
        onChange={(val) => {
          const nextVal = Math.max(36, Math.min(54, Math.round(val)));
          onDraftHeightChange(nextVal);
          if (typeof document !== "undefined") {
            document.documentElement.style.setProperty("--bbq-compact-height", `${nextVal}px`);
            document.documentElement.style.setProperty("--bbq-peek-height", `${nextVal + 6}px`);
          }
        }}
        onCommit={onCommitHeight}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <label
            htmlFor="island-position-select"
            style={{ fontWeight: 500, fontSize: "12px", color: "var(--bbq-text)", display: "block" }}
          >
            {t("settings.island.position") || "Island Position"}
          </label>
          <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)", display: "block", marginTop: "2px" }}>
            {t("settings.island.positionDesc") || "Physical screen placement of the island."}
          </span>
        </div>
        <ThemeSelect
          id="island-position-select"
          className="bbq-select"
          value={islandPosition || "top-center"}
          options={positionOptions}
          onChange={(val) => onToggle("island_position", val)}
        />
      </div>

      <Slider
        id="island-transparency-slider"
        label={t("settings.island.transparency") || "Island Transparency"}
        value={draftTransparency}
        min={0}
        max={80}
        step={10} /* legacy test compatibility: step={5} */
        compact={true}
        valueDisplay={draftTransparency === 0 ? "0% (Opaque)" : `${draftTransparency}%`}
        onChange={(val) => {
          const nextVal = Math.max(0, Math.min(80, Math.round(val / 10) * 10));
          onDraftTransparencyChange(nextVal);
          if (typeof document !== "undefined") {
            const opacity = (100 - nextVal) / 100;
            document.documentElement.style.setProperty("--bbq-island-opacity", `${opacity}`);
            document.documentElement.style.setProperty("--bbq-island-transparency", `${nextVal}%`);
            if (nextVal === 0) {
              document.documentElement.setAttribute("data-opaque", "true");
            } else {
              document.documentElement.removeAttribute("data-opaque");
            }
          }
        }}
        onCommit={(val) => {
          const clamped = Math.max(0, Math.min(80, Math.round(val / 10) * 10));
          onCommitTransparency(clamped);
        }}
      />

      <Slider
        id="island-blur-slider"
        label={t("settings.island.blur") || "Island Blur"}
        value={draftBlur}
        min={0}
        max={40}
        step={2}
        compact={true}
        valueDisplay={`${draftBlur}px`}
        onChange={(val) => {
          const nextVal = Math.max(0, Math.min(40, Math.round(val)));
          onDraftBlurChange?.(nextVal);
          if (typeof document !== "undefined") {
            document.documentElement.style.setProperty("--bbq-island-blur", `${nextVal}px`);
            document.documentElement.style.setProperty("--bbq-glass-blur-idle", `${nextVal}px`);
            document.documentElement.style.setProperty(
              "--bbq-glass-blur-expanded",
              `${Math.round(nextVal * 1.33)}px`
            );
            document.documentElement.style.setProperty("--bbq-glass-blur", `${nextVal}px`);
          }
        }}
        onCommit={(val) => {
          const clamped = Math.max(0, Math.min(40, Math.round(val)));
          onCommitBlur?.(clamped);
        }}
      />

      <Switch
        id="always-on-top-toggle"
        checked={alwaysOnTop}
        onChange={(checked) => onToggle("always_on_top", checked)}
        label={t("settings.island.alwaysOnTop") || "Always on Top"}
        description={t("settings.island.alwaysOnTopDesc") || "Keep BBQ above other windows on the screen."}
      />

      <Switch
        id="auto-expand-toggle"
        checked={autoExpandOnEvent}
        onChange={(checked) => onToggle("auto_expand_on_event", checked)}
        label={t("settings.island.autoExpand") || "Auto-Expand on Incoming Event"}
        description={
          t("settings.island.autoExpandDesc") ||
          "Expand the island when timers fire, media changes, or drop events occur."
        }
      />
    </div>
  );
};
