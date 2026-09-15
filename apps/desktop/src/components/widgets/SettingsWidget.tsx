import React, { useState, useEffect, useRef } from "react";
import {
  useSettingsState,
  updateSettingsBatch,
  resetSettingsToDefaults,
} from "../../state/settingsState.ts";
import { widgetRegistry } from "../../island/widgetRegistry.ts";
import {
  DEFAULT_COMPACT_INDICATOR_ORDER,
  resolveEffectiveIndicatorOrder,
} from "../../island/compactOrder.ts";
import { useHotkeyState } from "../../state/hotkeyState.ts";
import type { ThemePreference, AccentColor } from "@bbq/types";

const ACCENT_COLOR_OPTIONS: { id: AccentColor; label: string; preview: string }[] = [
  { id: "orange", label: "Orange", preview: "#f97316" },
  { id: "blue", label: "Blue", preview: "#3b82f6" },
  { id: "purple", label: "Purple", preview: "#a855f7" },
  { id: "green", label: "Green", preview: "#22c55e" },
  { id: "red", label: "Red", preview: "#ef4444" },
  { id: "pink", label: "Pink", preview: "#ec4899" },
  { id: "cyan", label: "Cyan", preview: "#06b6d4" },
];

type SettingsTab = "appearance" | "island" | "hotkey" | "privacy" | "notifications" | "widgets" | "about";

export const SettingsWidget: React.FC = () => {
  const { settings, isLoading } = useSettingsState();
  const { conflictError } = useHotkeyState();
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Local draft states for sliders and text inputs to prevent IPC write storms
  const [draftWidth, setDraftWidth] = useState(settings.island_width);
  const [draftHeight, setDraftHeight] = useState(settings.island_height);
  const [draftClipboardMax, setDraftClipboardMax] = useState(settings.clipboard_max_entries);
  const [draftRetention, setDraftRetention] = useState(settings.clipboard_retention_days);
  const [draftHotkey, setDraftHotkey] = useState(settings.global_hotkey);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);

  useEffect(() => {
    setDraftWidth(settings.island_width);
  }, [settings.island_width]);

  useEffect(() => {
    setDraftHeight(settings.island_height);
  }, [settings.island_height]);

  useEffect(() => {
    setDraftClipboardMax(settings.clipboard_max_entries);
  }, [settings.clipboard_max_entries]);

  useEffect(() => {
    setDraftRetention(settings.clipboard_retention_days);
  }, [settings.clipboard_retention_days]);

  useEffect(() => {
    setDraftHotkey(settings.global_hotkey);
  }, [settings.global_hotkey]);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleThemeChange = async (theme: ThemePreference) => {
    await updateSettingsBatch({ theme });
    showStatus(`Theme set to ${theme}`);
  };

  const handleAccentColorChange = async (accentColor: AccentColor) => {
    await updateSettingsBatch({ accent_color: accentColor });
    showStatus(`Accent color set to ${accentColor}`);
  };

  const handleToggle = async (key: keyof typeof settings, value: boolean) => {
    await updateSettingsBatch({ [key]: value });
    showStatus("Preference updated");
  };

  const commitWidth = async () => {
    if (draftWidth !== settings.island_width) {
      await updateSettingsBatch({ island_width: draftWidth });
      showStatus("Island width updated");
    }
  };

  const commitHeight = async () => {
    if (draftHeight !== settings.island_height) {
      await updateSettingsBatch({ island_height: draftHeight });
      showStatus("Island height updated");
    }
  };

  const commitClipboardMax = async () => {
    if (draftClipboardMax !== settings.clipboard_max_entries) {
      await updateSettingsBatch({ clipboard_max_entries: draftClipboardMax });
      showStatus("Clipboard capacity updated");
    }
  };

  const commitRetention = async () => {
    if (draftRetention !== settings.clipboard_retention_days) {
      await updateSettingsBatch({ clipboard_retention_days: draftRetention });
      showStatus("Clipboard retention updated");
    }
  };

  const handleSaveHotkey = async () => {
    const trimmed = draftHotkey.trim();
    if (!trimmed) {
      setHotkeyError("Hotkey combination cannot be empty.");
      return;
    }
    const parts = trimmed.split("+").map((s) => s.trim().toLowerCase());
    const hasMod = parts.some((p) =>
      ["ctrl", "control", "alt", "option", "shift", "win", "cmd", "meta"].includes(p)
    );
    if (!hasMod || parts.length < 2) {
      setHotkeyError(
        "Shortcut must include at least one modifier key (Ctrl, Alt, Shift, or Win) plus a key."
      );
      return;
    }
    setHotkeyError(null);
    setIsRecordingHotkey(false);
    if (trimmed === settings.global_hotkey) {
      return;
    }
    const ok = await updateSettingsBatch({ global_hotkey: trimmed });
    if (ok) {
      showStatus("Global hotkey updated");
    } else {
      setHotkeyError("Failed to register hotkey with the operating system.");
    }
  };

  const hotkeyInputRef = useRef<HTMLInputElement>(null);

  const handleCancelHotkey = () => {
    setDraftHotkey(settings.global_hotkey);
    setHotkeyError(null);
    setIsRecordingHotkey(false);
  };

  useEffect(() => {
    if (!isRecordingHotkey) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setIsRecordingHotkey(false);
        setDraftHotkey(settings.global_hotkey);
        setHotkeyError(null);
        return;
      }

      const modifiers: string[] = [];
      if (e.ctrlKey) modifiers.push("Ctrl");
      if (e.altKey) modifiers.push("Alt");
      if (e.shiftKey) modifiers.push("Shift");
      if (e.metaKey) modifiers.push("Win");

      const isModifierOnly = ["Control", "Alt", "Shift", "Meta"].includes(e.key);
      if (isModifierOnly) {
        if (modifiers.length > 0) {
          setDraftHotkey(modifiers.join("+") + "+");
        }
        return;
      }

      let key = e.key;
      if (e.code === "Space" || key === " " || key.toLowerCase() === "space") {
        key = "Space";
      } else if (e.code.startsWith("Key") && e.code.length === 4) {
        key = e.code.slice(3).toUpperCase();
      } else if (e.code.startsWith("Digit") && e.code.length === 6) {
        key = e.code.slice(5);
      } else if (/^F\d{1,2}$/i.test(key)) {
        key = key.toUpperCase();
      } else if (key.length === 1) {
        key = key.toUpperCase();
      }

      if (modifiers.length === 0) {
        setHotkeyError("Shortcut must include at least one modifier key (Ctrl, Alt, Shift, or Win)");
        return;
      }

      const combo = [...modifiers, key].join("+");
      setDraftHotkey(combo);
      setIsRecordingHotkey(false);
      setHotkeyError(null);
    };

    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true);
    };
  }, [isRecordingHotkey, settings.global_hotkey]);

  const handleHotkeyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isRecordingHotkey) {
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveHotkey();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancelHotkey();
      return;
    }
  };

  const handleReset = async () => {
    if (window.confirm("Are you sure you want to reset all preferences to default values?")) {
      await resetSettingsToDefaults();
      showStatus("Reset to default settings");
    }
  };

  const allRegisteredWidgets = widgetRegistry.getAll().filter((w) => w.id !== "settings");
  const disabledSet = new Set(settings.disabled_widgets);

  const toggleWidget = async (widgetId: string) => {
    const nextList = disabledSet.has(widgetId)
      ? settings.disabled_widgets.filter((id) => id !== widgetId)
      : [...settings.disabled_widgets, widgetId];
    await updateSettingsBatch({ disabled_widgets: nextList });
    showStatus(disabledSet.has(widgetId) ? `Enabled ${widgetId}` : `Disabled ${widgetId}`);
  };

  // Compact Indicator Ordering Logic
  const currentIndicatorOrder = resolveEffectiveIndicatorOrder(
    settings.compact_indicator_order,
    settings.disabled_widgets
  );

  const moveIndicator = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentIndicatorOrder.length) return;

    const newOrder = [...currentIndicatorOrder];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    await updateSettingsBatch({ compact_indicator_order: newOrder });
    showStatus("Indicator priority updated");
  };

  const resetIndicatorOrder = async () => {
    await updateSettingsBatch({ compact_indicator_order: DEFAULT_COMPACT_INDICATOR_ORDER });
    showStatus("Indicator priority reset to defaults");
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "appearance", label: "Appearance" },
    { id: "island", label: "Island" },
    { id: "hotkey", label: "Hotkey" },
    { id: "privacy", label: "Privacy" },
    { id: "notifications", label: "Notifications" },
    { id: "widgets", label: "Widgets" },
    { id: "about", label: "About" },
  ];

  return (
    <div
      className="bbq-settings-container"
      style={{
        padding: "6px 10px",
        color: "var(--bbq-text)",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6px",
          flexShrink: 0,
        }}
      >
        <h2 style={{ fontSize: "13px", fontWeight: 600, margin: 0 }}>⚙️ Preferences</h2>
        {statusMessage && (
          <span
            style={{ fontSize: "11px", color: "var(--bbq-accent)", fontWeight: 500 }}
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div
        className="bbq-settings-tablist"
        role="tablist"
        aria-label="Settings Categories"
        style={{
          display: "flex",
          gap: "2px",
          marginBottom: "8px",
          borderBottom: "1px solid var(--bbq-border-subtle)",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`settings-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "3px 8px",
                background: isSelected ? "rgba(255, 255, 255, 0.08)" : "transparent",
                border: "none",
                borderBottom: isSelected ? "2px solid var(--bbq-accent)" : "2px solid transparent",
                color: isSelected ? "var(--bbq-text)" : "var(--bbq-text-muted)",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: isSelected ? 600 : 400,
                borderRadius: "4px 4px 0 0",
                whiteSpace: "nowrap",
                transition: "all 120ms ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div
        id={`settings-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", fontSize: "12px" }}
      >
        {/* APPEARANCE */}
        {activeTab === "appearance" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 500 }}>
                Theme Mode
              </label>
              <div style={{ display: "flex", gap: "8px" }} role="radiogroup" aria-label="Theme selection">
                {(["system", "dark", "light"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={settings.theme === t}
                    onClick={() => handleThemeChange(t)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      border: "1px solid var(--bbq-border)",
                      background:
                        settings.theme === t ? "var(--bbq-accent)" : "var(--bbq-surface-elevated)",
                      color: settings.theme === t ? "#ffffff" : "var(--bbq-text)",
                      cursor: "pointer",
                      fontSize: "12px",
                      textTransform: "capitalize",
                      fontWeight: 500,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 500 }}>
                Accent Color
              </label>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
                role="radiogroup"
                aria-label="Accent color selection"
              >
                {ACCENT_COLOR_OPTIONS.map((opt) => {
                  const isSelected = (settings.accent_color || "orange") === opt.id;
                  return (
                    <button
                      key={opt.id}
                      id={`accent-color-${opt.id}`}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleAccentColorChange(opt.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: isSelected
                          ? "2px solid var(--bbq-accent)"
                          : "1px solid var(--bbq-border)",
                        background: isSelected
                          ? "var(--bbq-accent-subtle)"
                          : "var(--bbq-surface-elevated)",
                        color: "var(--bbq-text)",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: isSelected ? 600 : 400,
                        transition: "all 120ms ease",
                      }}
                    >
                      <span
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          background: opt.preview,
                          display: "inline-block",
                          boxShadow: isSelected ? `0 0 6px ${opt.preview}` : "none",
                        }}
                      />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <label htmlFor="reduced-motion-toggle" style={{ fontWeight: 500, display: "block" }}>
                  Reduced Motion
                </label>
                <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
                  Disables non-essential scale transitions and floating animations for accessibility.
                </span>
              </div>
              <input
                id="reduced-motion-toggle"
                type="checkbox"
                checked={settings.reduced_motion}
                onChange={(e) => handleToggle("reduced_motion", e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
                aria-label="Reduced Motion"
              />
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <label htmlFor="start-at-login-toggle" style={{ fontWeight: 500, display: "block" }}>
                  Launch at Login
                </label>
                <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
                  Start BBQ automatically on system startup.
                </span>
              </div>
              <input
                id="start-at-login-toggle"
                type="checkbox"
                checked={settings.start_at_login}
                onChange={(e) => handleToggle("start_at_login", e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
                aria-label="Launch at Login"
              />
            </div>
          </div>
        )}

        {/* ISLAND */}
        {activeTab === "island" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label htmlFor="island-width-slider" style={{ fontWeight: 500 }}>Compact Width</label>
                <span style={{ color: "var(--bbq-text-muted)" }}>{draftWidth}px</span>
              </div>
              <input
                id="island-width-slider"
                type="range"
                min={180}
                max={480}
                step={10}
                value={draftWidth}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDraftWidth(val);
                  if (typeof document !== "undefined") {
                    document.documentElement.style.setProperty("--bbq-compact-width", `${val}px`);
                  }
                }}
                onPointerUp={commitWidth}
                onKeyUp={commitWidth}
                style={{ width: "100%", cursor: "pointer" }}
                aria-label="Island compact width in pixels"
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label htmlFor="island-height-slider" style={{ fontWeight: 500 }}>Compact Height</label>
                <span style={{ color: "var(--bbq-text-muted)" }}>{draftHeight}px</span>
              </div>
              <input
                id="island-height-slider"
                type="range"
                min={36}
                max={54}
                step={2}
                value={draftHeight}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDraftHeight(val);
                  if (typeof document !== "undefined") {
                    document.documentElement.style.setProperty("--bbq-compact-height", `${val}px`);
                  }
                }}
                onPointerUp={commitHeight}
                onKeyUp={commitHeight}
                style={{ width: "100%", cursor: "pointer" }}
                aria-label="Island compact height in pixels"
              />
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <label htmlFor="auto-expand-toggle" style={{ fontWeight: 500, display: "block" }}>
                  Auto-Expand on Incoming Event
                </label>
                <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
                  Expand the island when timers fire, media changes, or drop events occur.
                </span>
              </div>
              <input
                id="auto-expand-toggle"
                type="checkbox"
                checked={settings.auto_expand_on_event}
                onChange={(e) => handleToggle("auto_expand_on_event", e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
                aria-label="Auto expand island on event"
              />
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <label htmlFor="start-login-toggle" style={{ fontWeight: 500, display: "block" }}>
                  Start at Login
                </label>
                <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
                  Launch BBQ automatically in background when system boots.
                </span>
              </div>
              <input
                id="start-login-toggle"
                type="checkbox"
                checked={settings.start_at_login}
                onChange={(e) => handleToggle("start_at_login", e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
                aria-label="Start at system login"
              />
            </div>
          </div>
        )}

        {/* HOTKEY */}
        {activeTab === "hotkey" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <label htmlFor="global-hotkey-input" style={{ fontWeight: 500, fontSize: "13px" }}>
                  Global Shortcut Combination
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>Current:</span>
                  <span
                    style={{
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid var(--bbq-border)",
                      borderRadius: "4px",
                      padding: "1px 6px",
                      fontSize: "11px",
                      fontFamily: "monospace",
                      fontWeight: 600,
                      color: settings.hotkey_enabled ? "var(--bbq-accent, #60a5fa)" : "var(--bbq-text-muted)",
                    }}
                  >
                    {settings.global_hotkey || "None"}
                  </span>
                  {!settings.hotkey_enabled && (
                    <span style={{ fontSize: "10px", color: "#f59e0b" }}>(Disabled)</span>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  ref={hotkeyInputRef}
                  id="global-hotkey-input"
                  type="text"
                  value={
                    isRecordingHotkey
                      ? draftHotkey
                        ? `${draftHotkey}...`
                        : "Press key combination..."
                      : draftHotkey
                  }
                  onChange={(e) => {
                    if (!isRecordingHotkey) {
                      setDraftHotkey(e.target.value);
                      setHotkeyError(null);
                    }
                  }}
                  onKeyDown={handleHotkeyKeyDown}
                  placeholder={isRecordingHotkey ? "Press key combination..." : "e.g. Ctrl+Shift+B"}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: isRecordingHotkey
                      ? "1px solid var(--bbq-accent)"
                      : "1px solid var(--bbq-border)",
                    background: isRecordingHotkey
                      ? "var(--bbq-accent-subtle, rgba(255, 107, 53, 0.15))"
                      : "var(--bbq-surface)",
                    color: "var(--bbq-text)",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                  aria-label="Global hotkey combination"
                />
                <button
                  type="button"
                  id="record-hotkey-btn"
                  onClick={() => {
                    if (!isRecordingHotkey) {
                      setDraftHotkey("");
                      setIsRecordingHotkey(true);
                      setHotkeyError(null);
                      setTimeout(() => hotkeyInputRef.current?.focus(), 50);
                    } else {
                      setIsRecordingHotkey(false);
                      setDraftHotkey(settings.global_hotkey);
                    }
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--bbq-border)",
                    background: isRecordingHotkey
                      ? "var(--bbq-accent)"
                      : "rgba(255, 255, 255, 0.06)",
                    color: isRecordingHotkey ? "#fff" : "var(--bbq-text)",
                    fontSize: "12px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isRecordingHotkey ? "Stop Recording" : "Record Keys"}
                </button>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button
                  type="button"
                  id="save-hotkey-btn"
                  onClick={handleSaveHotkey}
                  disabled={draftHotkey.trim() === settings.global_hotkey || !draftHotkey.trim()}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    background:
                      draftHotkey.trim() === settings.global_hotkey || !draftHotkey.trim()
                        ? "rgba(255, 255, 255, 0.08)"
                        : "var(--bbq-accent, #3b82f6)",
                    color:
                      draftHotkey.trim() === settings.global_hotkey || !draftHotkey.trim()
                        ? "var(--bbq-text-muted)"
                        : "#fff",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor:
                      draftHotkey.trim() === settings.global_hotkey || !draftHotkey.trim()
                        ? "default"
                        : "pointer",
                  }}
                >
                  Save Hotkey
                </button>
                <button
                  type="button"
                  id="cancel-hotkey-btn"
                  onClick={handleCancelHotkey}
                  disabled={draftHotkey === settings.global_hotkey && !isRecordingHotkey}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid var(--bbq-border)",
                    background: "transparent",
                    color: "var(--bbq-text)",
                    fontSize: "12px",
                    cursor:
                      draftHotkey === settings.global_hotkey && !isRecordingHotkey
                        ? "default"
                        : "pointer",
                    opacity:
                      draftHotkey === settings.global_hotkey && !isRecordingHotkey
                        ? 0.5
                        : 1,
                  }}
                >
                  Cancel
                </button>
              </div>

              {(hotkeyError || conflictError) && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#f87171",
                    fontSize: "12px",
                    lineHeight: 1.4,
                  }}
                >
                  ⚠️ {hotkeyError || conflictError}
                </div>
              )}

              <span
                style={{
                  fontSize: "11px",
                  color: "var(--bbq-text-muted)",
                  display: "block",
                  marginTop: "6px",
                }}
              >
                Pressing this shortcut globally expands BBQ to front and focuses the Launcher search.
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
                paddingTop: "6px",
                borderTop: "1px solid var(--bbq-border)",
              }}
            >
              <div>
                <label
                  htmlFor="hotkey-enable-toggle"
                  style={{ fontWeight: 500, display: "block" }}
                >
                  Hotkey Trigger Enabled
                </label>
                <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
                  Toggle whether the global shortcut is actively registered with the OS.
                </span>
              </div>
              <input
                id="hotkey-enable-toggle"
                type="checkbox"
                checked={settings.hotkey_enabled}
                onChange={(e) => handleToggle("hotkey_enabled", e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
                aria-label="Enable global hotkey"
              />
            </div>
          </div>
        )}

        {/* PRIVACY */}
        {activeTab === "privacy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <label htmlFor="clipboard-history-toggle" style={{ fontWeight: 500, display: "block" }}>
                  Clipboard History
                </label>
                <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
                  Stores copied text clips in local SQLite. Disabling immediately purges all stored items.
                </span>
              </div>
              <input
                id="clipboard-history-toggle"
                type="checkbox"
                checked={settings.clipboard_history_enabled}
                onChange={(e) => handleToggle("clipboard_history_enabled", e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
                aria-label="Enable clipboard history"
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label htmlFor="clipboard-max-slider" style={{ fontWeight: 500 }}>Max Entries</label>
                <span style={{ color: "var(--bbq-text-muted)" }}>{draftClipboardMax} items</span>
              </div>
              <input
                id="clipboard-max-slider"
                type="range"
                min={10}
                max={100}
                step={10}
                value={draftClipboardMax}
                onChange={(e) => setDraftClipboardMax(Number(e.target.value))}
                onPointerUp={commitClipboardMax}
                onKeyUp={commitClipboardMax}
                style={{ width: "100%", cursor: "pointer" }}
                aria-label="Maximum clipboard history entries"
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label htmlFor="clipboard-retention-slider" style={{ fontWeight: 500 }}>Retention Period</label>
                <span style={{ color: "var(--bbq-text-muted)" }}>{draftRetention} days</span>
              </div>
              <input
                id="clipboard-retention-slider"
                type="range"
                min={1}
                max={90}
                step={1}
                value={draftRetention}
                onChange={(e) => setDraftRetention(Number(e.target.value))}
                onPointerUp={commitRetention}
                onKeyUp={commitRetention}
                style={{ width: "100%", cursor: "pointer" }}
                aria-label="Clipboard history retention days"
              />
            </div>
          </div>
        )}

        {/* NOTIFICATIONS */}
        {activeTab === "notifications" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <label htmlFor="notifications-enable-toggle" style={{ fontWeight: 500, display: "block" }}>
                  Desktop Notifications
                </label>
                <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
                  Receive OS desktop banner alerts for timer completions and reminders.
                </span>
              </div>
              <input
                id="notifications-enable-toggle"
                type="checkbox"
                checked={settings.notifications_enabled}
                onChange={(e) => handleToggle("notifications_enabled", e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
                aria-label="Enable system notifications"
              />
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <label htmlFor="timer-sound-toggle" style={{ fontWeight: 500, display: "block" }}>
                  Timer Sound
                </label>
                <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
                  Play an auditory chime when timers and Pomodoro phases expire.
                </span>
              </div>
              <input
                id="timer-sound-toggle"
                type="checkbox"
                checked={settings.timer_sound_enabled}
                onChange={(e) => handleToggle("timer_sound_enabled", e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
                aria-label="Enable timer sound"
              />
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <label htmlFor="reminder-sound-toggle" style={{ fontWeight: 500, display: "block" }}>
                  Reminder Sound
                </label>
                <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
                  Play an auditory notification when a scheduled reminder is due.
                </span>
              </div>
              <input
                id="reminder-sound-toggle"
                type="checkbox"
                checked={settings.reminder_sound_enabled}
                onChange={(e) => handleToggle("reminder_sound_enabled", e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
                aria-label="Enable reminder sound"
              />
            </div>
          </div>
        )}

        {/* WIDGETS */}
        {/* WIDGETS */}
        {activeTab === "widgets" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Active Island Widgets - Reorderable */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--bbq-text-muted)" }}>
                  Active Island Widgets (Sıralama):
                </span>
                <button
                  id="reset-widgets-order-btn"
                  type="button"
                  onClick={resetIndicatorOrder}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--bbq-accent)",
                    fontSize: "11px",
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                  aria-label="Reset widget order to defaults"
                >
                  Reset Order
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {currentIndicatorOrder.map((widgetId, idx) => {
                  const w = allRegisteredWidgets.find((item) => item.id === widgetId);
                  const title = w?.title ?? widgetId;
                  const icon = w?.icon ?? "⚙️";

                  return (
                    <div
                      key={widgetId}
                      id={`widget-order-item-${widgetId}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 8px",
                        borderRadius: "6px",
                        background: "var(--bbq-surface-elevated)",
                        border: "1px solid var(--bbq-border)",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                        <span style={{ color: "var(--bbq-text-muted)", fontSize: "11px", width: "16px" }}>
                          {idx + 1}.
                        </span>
                        <span aria-hidden="true">{icon}</span>
                        <span style={{ fontWeight: 500 }}>{title}</span>
                      </span>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ display: "flex", gap: "2px" }}>
                          <button
                            id={`widget-move-up-${widgetId}`}
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveIndicator(idx, "up")}
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              border: "1px solid var(--bbq-border)",
                              background: "var(--bbq-surface)",
                              color: "var(--bbq-text)",
                              cursor: idx === 0 ? "not-allowed" : "pointer",
                              opacity: idx === 0 ? 0.35 : 1,
                              fontSize: "10px",
                            }}
                            aria-label={`Move ${title} up`}
                          >
                            ▲
                          </button>
                          <button
                            id={`widget-move-down-${widgetId}`}
                            type="button"
                            disabled={idx === currentIndicatorOrder.length - 1}
                            onClick={() => moveIndicator(idx, "down")}
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              border: "1px solid var(--bbq-border)",
                              background: "var(--bbq-surface)",
                              color: "var(--bbq-text)",
                              cursor: idx === currentIndicatorOrder.length - 1 ? "not-allowed" : "pointer",
                              opacity: idx === currentIndicatorOrder.length - 1 ? 0.35 : 1,
                              fontSize: "10px",
                            }}
                            aria-label={`Move ${title} down`}
                          >
                            ▼
                          </button>
                        </div>

                        <input
                          id={`widget-toggle-${widgetId}`}
                          type="checkbox"
                          checked={true}
                          onChange={() => toggleWidget(widgetId)}
                          style={{ cursor: "pointer", width: "16px", height: "16px" }}
                          aria-label={`Disable ${title} widget`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Disabled Widgets (if any) */}
            {settings.disabled_widgets.length > 0 && (
              <div>
                <span style={{ fontSize: "12px", color: "var(--bbq-text-muted)", display: "block", marginBottom: "6px" }}>
                  Disabled Widgets:
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {allRegisteredWidgets
                    .filter((w) => disabledSet.has(w.id))
                    .map((w) => (
                      <div
                        key={w.id}
                        id={`disabled-widget-item-${w.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          background: "rgba(255, 255, 255, 0.02)",
                          border: "1px dashed var(--bbq-border)",
                          opacity: 0.7,
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                          <span aria-hidden="true">{w.icon}</span>
                          <span>{w.title}</span>
                        </span>
                        <input
                          id={`widget-enable-toggle-${w.id}`}
                          type="checkbox"
                          checked={false}
                          onChange={() => toggleWidget(w.id)}
                          style={{ cursor: "pointer", width: "16px", height: "16px" }}
                          aria-label={`Enable ${w.title} widget`}
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABOUT */}
        {activeTab === "about" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div
              style={{
                padding: "12px",
                background: "var(--bbq-surface-elevated)",
                borderRadius: "8px",
                border: "1px solid var(--bbq-border)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <span style={{ fontSize: "32px" }} aria-hidden="true">🏝️</span>
              <div>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>BBQ Desktop</h3>
                <span style={{ fontSize: "12px", color: "var(--bbq-accent)", fontWeight: 600 }}>
                  Version 1.0.0 (Production Edition)
                </span>
                <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "var(--bbq-text-muted)" }}>
                  Lightweight, hardware-accelerated desktop productivity island.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--bbq-text-muted)" }}>License:</span>
                <span style={{ fontWeight: 500 }}>MIT License (Open Source)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--bbq-text-muted)" }}>Architecture:</span>
                <span style={{ fontWeight: 500 }}>Tauri 2 + Rust Core + React 19</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--bbq-text-muted)" }}>Telemetry & Tracking:</span>
                <span style={{ fontWeight: 500, color: "var(--bbq-success)" }}>None (100% Local-First)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--bbq-text-muted)" }}>Local Database:</span>
                <span style={{ fontWeight: 500 }}>SQLite 3 (WAL Mode)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--bbq-text-muted)" }}>Safe Uninstall:</span>
                <span style={{ fontWeight: 500 }}>Non-destructive (Preferences preserved)</span>
              </div>
            </div>

            <div style={{ paddingTop: "8px", borderTop: "1px solid var(--bbq-border)" }}>
              <button
                type="button"
                onClick={async () => {
                  await updateSettingsBatch({ onboarding_completed: false });
                  showStatus("Welcome tour activated");
                }}
                style={{
                  width: "100%",
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: "1px solid var(--bbq-accent)",
                  background: "rgba(59, 130, 246, 0.1)",
                  color: "var(--bbq-accent)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                aria-label="Replay welcome onboarding tour"
              >
                Replay Welcome Tour
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div
        style={{
          marginTop: "16px",
          paddingTop: "12px",
          borderTop: "1px solid var(--bbq-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={handleReset}
          disabled={isLoading}
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            border: "1px solid var(--bbq-danger)",
            background: "rgba(239, 68, 68, 0.1)",
            color: "var(--bbq-danger)",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 500,
          }}
          aria-label="Reset all preferences to defaults"
        >
          Reset to Defaults
        </button>
        <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
          Preferences are automatically saved to SQLite
        </span>
      </div>
    </div>
  );
};
