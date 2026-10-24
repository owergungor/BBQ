import React from "react";
import { Slider, Switch, ThemeSelect } from "../../common/SettingsControls.tsx";
import { type IslandSettingsTabProps } from "./settingsTypes.ts";
import { useTranslation } from "../../../i18n/index.ts";
import { Icon } from "../../common/Icon.tsx";
import { bbqCommands } from "../../../ipc/commands.ts";

export const IslandSettingsTab: React.FC<IslandSettingsTabProps> = ({
  draftWidth,
  draftHeight,
  draftTransparency,
  draftBlur = 20,
  blurEnabled = true,
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
  onResetPosition,
  onTriggerMoveHud,
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
        min={64}
        max={480}
        step={50}
        compact={true}
        valueDisplay={`${draftWidth}px`}
        onChange={(val) => {
          let nextVal: number;
          if (val <= 64) {
            nextVal = 64;
          } else if (val >= 480) {
            nextVal = 480;
          } else {
            nextVal = Math.max(64, Math.min(480, Math.round(val / 50) * 50));
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
        min={32}
        max={64}
        step={2}
        compact={true}
        valueDisplay={`${draftHeight}px`}
        onChange={(val) => {
          const nextVal = Math.max(32, Math.min(64, Math.round(val)));
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

      <div style={{ display: "flex", gap: "8px", marginTop: "2px" }}>
        <button
          type="button"
          id="btn-move-island-hud"
          className="bbq-btn bbq-btn-secondary"
          style={{
            flex: 1,
            padding: "6px 12px",
            fontSize: "11px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            cursor: "pointer",
          }}
          onClick={onTriggerMoveHud ? onTriggerMoveHud : () => onToggle("move_hud", true)}
        >
          <Icon name="move" size={13} aria-hidden="true" />
          <span>{t("settings.island.moveHudAction") || "Move Island (HUD)"}</span>
        </button>
        <button
          type="button"
          id="btn-reset-island-position"
          className="bbq-btn bbq-btn-secondary"
          style={{
            flex: 1,
            padding: "6px 12px",
            fontSize: "11px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            cursor: "pointer",
          }}
          onClick={
            onResetPosition
              ? onResetPosition
              : async () => {
                  await bbqCommands.resetIslandPosition();
                  await onToggle("island_position", "top-center");
                  await onToggle("move_hud", false);
                }
          }
        >
          <Icon name="refresh" size={13} aria-hidden="true" />
          <span>{t("settings.island.resetPosition") || "Reset to Screen Default"}</span>
        </button>
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

      <Switch
        id="island-blur-enabled-toggle"
        checked={blurEnabled}
        onChange={(checked) => onToggle("island_blur_enabled", checked)}
        label={t("settings.island.blurEnabled") || "Island Blur"}
        description={
          t("settings.island.blurEnabledDesc") ||
          "Enable or disable backdrop blur beneath translucent island surfaces."
        }
      />

      <div
        style={{
          opacity: blurEnabled ? 1 : 0.45,
          pointerEvents: blurEnabled ? "auto" : "none",
          transition: "opacity var(--bbq-duration-fast, 150ms) ease",
        }}
      >
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
              if (nextVal === 0) {
                document.documentElement.setAttribute("data-blur-zero", "true");
              } else {
                document.documentElement.removeAttribute("data-blur-zero");
              }
            }
          }}
          onCommit={(val) => {
            const clamped = Math.max(0, Math.min(40, Math.round(val)));
            onCommitBlur?.(clamped);
          }}
        />
      </div>

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
