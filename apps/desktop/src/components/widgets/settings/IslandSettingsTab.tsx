import React from "react";
import { Slider, Switch, ThemeSelect } from "../../common/SettingsControls.tsx";
import { POSITION_OPTIONS, type IslandSettingsTabProps } from "./settingsTypes.ts";

export const IslandSettingsTab: React.FC<IslandSettingsTabProps> = ({
  draftWidth,
  draftHeight,
  draftTransparency,
  islandPosition,
  alwaysOnTop,
  autoExpandOnEvent,
  onDraftWidthChange,
  onDraftHeightChange,
  onDraftTransparencyChange,
  onCommitWidth,
  onCommitHeight,
  onCommitTransparency,
  onToggle,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Slider
        id="island-width-slider"
        label="Compact Width"
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
        label="Compact Height"
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
            Island Position
          </label>
          <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)", display: "block", marginTop: "2px" }}>
            Physical screen placement of the island.
          </span>
        </div>
        <ThemeSelect
          id="island-position-select"
          className="bbq-select"
          value={islandPosition || "top-center"}
          options={POSITION_OPTIONS}
          onChange={(val) => onToggle("island_position", val)}
        />
      </div>

      <Slider
        id="island-transparency-slider"
        label="Island Transparency"
        value={draftTransparency}
        min={0}
        max={80}
        step={5}
        compact={true}
        valueDisplay={draftTransparency === 0 ? "0% (Opaque)" : `${draftTransparency}%`}
        onChange={(val) => {
          const nextVal = Math.max(0, Math.min(80, Math.round(val)));
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
        onCommit={() => onCommitTransparency(draftTransparency)}
      />

      <Switch
        id="always-on-top-toggle"
        checked={alwaysOnTop}
        onChange={(checked) => onToggle("always_on_top", checked)}
        label="Always on Top"
        description="Keep BBQ above other windows on the screen."
      />

      <Switch
        id="auto-expand-toggle"
        checked={autoExpandOnEvent}
        onChange={(checked) => onToggle("auto_expand_on_event", checked)}
        label="Auto-Expand on Incoming Event"
        description="Expand the island when timers fire, media changes, or drop events occur."
      />
    </div>
  );
};
