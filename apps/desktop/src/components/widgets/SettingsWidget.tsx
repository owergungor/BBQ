import React, { useState, useEffect, useRef } from "react";
import {
  useSettingsState,
  updateSettingsBatch,
  resetSettingsToDefaults,
  SYSTEM_ACCENT_COLORS,
  type AccentPreset,
} from "../../state/settingsState.ts";
import { widgetRegistry } from "../../island/widgetRegistry.ts";
import {
  DEFAULT_COMPACT_INDICATOR_ORDER,
  resolveEffectiveIndicatorOrder,
} from "../../island/compactOrder.ts";
import { useHotkeyState } from "../../state/hotkeyState.ts";
import type { ThemePreference, AccentColor, PlatformCapabilities } from "@bbq/types";
import { bbqCommands } from "../../ipc/commands.ts";
import {
  ThemeSwitcher,
  Switch,
  Slider,
  AccentColorPicker,
} from "../common/SettingsControls.tsx";
import { Icon, type IconName } from "../common/Icon.tsx";
import {
  clampIslandWidth,
  clampIslandHeight,
  clampClipboardCapacity,
  clampClipboardRetention,
  computeWcagContrast,
  validateHexColor,
  validateHotkeyInput,
  sanitizeIndicatorOrder,
  formatCapabilityStatus,
  isHotkeySupported,
  isClipboardLiveSupported,
} from "./settingsModel.ts";

type SettingsTab = "appearance" | "island" | "hotkey" | "privacy" | "notifications" | "widgets" | "about";

export const SettingsWidget: React.FC = () => {
  const { settings, isLoading } = useSettingsState();
  const { conflictError } = useHotkeyState();
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(null);

  useEffect(() => {
    let active = true;
    bbqCommands.getPlatformCapabilities().then((caps) => {
      if (active && caps) {
        setCapabilities(caps);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const hotkeySupported = isHotkeySupported(capabilities);
  const clipboardLiveSupported = isClipboardLiveSupported(capabilities);

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

  const handleCustomAccentChange = async (hex: string) => {
    const validated = validateHexColor(hex);
    await updateSettingsBatch({
      accent_color: "custom",
      custom_accent_color: validated.normalized,
    });
    showStatus(`Custom accent set to ${validated.normalized}`);
  };

  const handleToggle = async (key: keyof typeof settings, value: boolean) => {
    await updateSettingsBatch({ [key]: value });
    showStatus("Preference updated");
  };

  const commitWidth = async () => {
    const clamped = clampIslandWidth(draftWidth);
    if (clamped !== settings.island_width) {
      await updateSettingsBatch({ island_width: clamped });
      showStatus("Island width updated");
    }
  };

  const commitHeight = async () => {
    const clamped = clampIslandHeight(draftHeight);
    if (clamped !== settings.island_height) {
      await updateSettingsBatch({ island_height: clamped });
      showStatus("Island height updated");
    }
  };

  const commitClipboardMax = async () => {
    const clamped = clampClipboardCapacity(draftClipboardMax);
    if (clamped !== settings.clipboard_max_entries) {
      await updateSettingsBatch({ clipboard_max_entries: clamped });
      showStatus("Clipboard capacity updated");
    }
  };

  const commitRetention = async () => {
    const clamped = clampClipboardRetention(draftRetention);
    if (clamped !== settings.clipboard_retention_days) {
      await updateSettingsBatch({ clipboard_retention_days: clamped });
      showStatus("Clipboard retention updated");
    }
  };

  const handleSaveHotkey = async () => {
    const validation = validateHotkeyInput(draftHotkey);
    if (!validation.valid) {
      setHotkeyError(validation.error || "Shortcut must include at least one modifier key plus a key.");
      return;
    }
    setHotkeyError(null);
    setIsRecordingHotkey(false);
    if (validation.normalized === settings.global_hotkey) {
      return;
    }
    const ok = await updateSettingsBatch({ global_hotkey: validation.normalized });
    if (ok) {
      setDraftHotkey(validation.normalized);
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

    const sanitized = sanitizeIndicatorOrder(
      newOrder,
      allRegisteredWidgets.map((w) => w.id)
    );

    await updateSettingsBatch({ compact_indicator_order: sanitized });
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
        <h2 style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, margin: 0 }}>
          <Icon name="settings" size={14} /> Preferences
        </h2>
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
              <ThemeSwitcher theme={settings.theme} onChange={handleThemeChange} />
            </div>

            <AccentColorPicker
              currentAccent={(settings.accent_color || "blue") as AccentColor}
              customAccentColor={settings.custom_accent_color || null}
              theme={settings.theme}
              onChangePreset={handleAccentColorChange}
              onChangeCustom={handleCustomAccentChange}
            />

            {(() => {
              const activeColorHex =
                settings.accent_color === "custom" || (settings.accent_color && settings.accent_color.startsWith("#"))
                  ? settings.custom_accent_color || "#007aff"
                  : SYSTEM_ACCENT_COLORS[settings.accent_color as AccentPreset]?.dark || "#0a84ff";
              const bgHex = settings.theme === "light" ? "#ffffff" : "#121216";
              const contrast = computeWcagContrast(activeColorHex, bgHex);
              return (
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
              );
            })()}

            <Switch
              id="reduced-motion-toggle"
              checked={settings.reduced_motion}
              onChange={(checked) => handleToggle("reduced_motion", checked)}
              label="Reduced Motion"
              description="Disables non-essential scale transitions and floating animations for accessibility."
            />

            <Switch
              id="start-at-login-toggle"
              checked={settings.start_at_login}
              onChange={(checked) => handleToggle("start_at_login", checked)}
              label="Launch at Login"
              description="Start BBQ automatically on system startup."
            />
          </div>
        )}

        {/* ISLAND */}
        {activeTab === "island" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <Slider
              id="island-width-slider"
              label="Compact Width"
              value={draftWidth}
              min={180}
              max={480}
              step={10}
              valueDisplay={`${draftWidth}px`}
              onChange={(val) => {
                setDraftWidth(val);
                if (typeof document !== "undefined") {
                  document.documentElement.style.setProperty("--bbq-compact-width", `${val}px`);
                }
              }}
              onCommit={commitWidth}
            />

            <Slider
              id="island-height-slider"
              label="Compact Height"
              value={draftHeight}
              min={36}
              max={54}
              step={2}
              valueDisplay={`${draftHeight}px`}
              onChange={(val) => {
                setDraftHeight(val);
                if (typeof document !== "undefined") {
                  document.documentElement.style.setProperty("--bbq-compact-height", `${val}px`);
                }
              }}
              onCommit={commitHeight}
            />

            <Switch
              id="auto-expand-toggle"
              checked={settings.auto_expand_on_event}
              onChange={(checked) => handleToggle("auto_expand_on_event", checked)}
              label="Auto-Expand on Incoming Event"
              description="Expand the island when timers fire, media changes, or drop events occur."
            />
          </div>
        )}

        {/* HOTKEY */}
        {activeTab === "hotkey" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {!hotkeySupported && capabilities && (
              <div
                id="hotkey-platform-warning"
                role="status"
                style={{
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "rgba(245, 158, 11, 0.12)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  color: "#f59e0b",
                  fontSize: "12px",
                  lineHeight: 1.4,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Icon name="globe" size={13} aria-hidden="true" />
                <span>
                  Global shortcut registration is {capabilities.globalHotkey} on {capabilities.platform}. The island can be opened via tray icon or CLI.
                </span>
              </div>
            )}

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
                  disabled={!hotkeySupported}
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
                    opacity: !hotkeySupported ? 0.5 : 1,
                    cursor: !hotkeySupported ? "not-allowed" : "text",
                  }}
                  aria-label="Global hotkey combination"
                />
                <button
                  type="button"
                  id="record-hotkey-btn"
                  disabled={!hotkeySupported}
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
                    cursor: !hotkeySupported ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                    opacity: !hotkeySupported ? 0.5 : 1,
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
                  disabled={
                    !hotkeySupported ||
                    draftHotkey.trim() === settings.global_hotkey ||
                    !draftHotkey.trim()
                  }
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
                  id="hotkey-conflict-error"
                  role="alert"
                  style={{
                    marginTop: "8px",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#f87171",
                    fontSize: "12px",
                    lineHeight: 1.4,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Icon name="close" size={13} aria-hidden="true" />
                  <span>{hotkeyError || conflictError}</span>
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

            <div style={{ paddingTop: "6px", borderTop: "1px solid var(--bbq-border)" }}>
              <Switch
                id="hotkey-enable-toggle"
                checked={settings.hotkey_enabled}
                disabled={!hotkeySupported}
                onChange={(checked) => handleToggle("hotkey_enabled", checked)}
                label="Hotkey Trigger Enabled"
                description={
                  !hotkeySupported && capabilities
                    ? `Global shortcuts are ${capabilities.globalHotkey} on ${capabilities.platform}.`
                    : "Toggle whether the global shortcut is actively registered with the OS."
                }
              />
            </div>
          </div>
        )}

        {/* PRIVACY */}
        {activeTab === "privacy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {!clipboardLiveSupported && capabilities && (
              <div
                id="clipboard-platform-notice"
                role="status"
                style={{
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "rgba(59, 130, 246, 0.12)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  color: "#60a5fa",
                  fontSize: "12px",
                  lineHeight: 1.4,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Icon name="globe" size={13} aria-hidden="true" />
                <span>
                  Clipboard live events are {capabilities.clipboardLiveEvents} on {capabilities.platform}. Clips are captured on-demand upon interaction.
                </span>
              </div>
            )}
            <Switch
              id="clipboard-history-toggle"
              checked={settings.clipboard_history_enabled}
              onChange={(checked) => handleToggle("clipboard_history_enabled", checked)}
              label="Clipboard History"
              description="Stores copied text clips in local SQLite. Disabling immediately purges all stored items."
            />

            <Slider
              id="clipboard-max-slider"
              label="Max Entries"
              value={draftClipboardMax}
              min={10}
              max={100}
              step={10}
              valueDisplay={`${draftClipboardMax} items`}
              onChange={(val) => setDraftClipboardMax(val)}
              onCommit={commitClipboardMax}
            />

            <Slider
              id="clipboard-retention-slider"
              label="Retention Period"
              value={draftRetention}
              min={1}
              max={90}
              step={1}
              valueDisplay={`${draftRetention} days`}
              onChange={(val) => setDraftRetention(val)}
              onCommit={commitRetention}
            />
          </div>
        )}

        {/* NOTIFICATIONS */}
        {activeTab === "notifications" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <Switch
              id="notifications-enable-toggle"
              checked={settings.notifications_enabled}
              onChange={(checked) => handleToggle("notifications_enabled", checked)}
              label="Desktop Notifications"
              description="Receive OS desktop banner alerts for timer completions and reminders."
            />

            <Switch
              id="timer-sound-toggle"
              checked={settings.timer_sound_enabled}
              onChange={(checked) => handleToggle("timer_sound_enabled", checked)}
              label="Timer Sound"
              description="Play an auditory chime when timers and Pomodoro phases expire."
            />

            <Switch
              id="reminder-sound-toggle"
              checked={settings.reminder_sound_enabled}
              onChange={(checked) => handleToggle("reminder_sound_enabled", checked)}
              label="Reminder Sound"
              description="Play an auditory notification when a scheduled reminder is due."
            />
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
                  const iconName = (w?.icon as IconName) || "settings";

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
                        <span aria-hidden="true" style={{ display: "flex", alignItems: "center" }}>
                          <Icon name={iconName} size={13} />
                        </span>
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
                              display: "flex",
                              alignItems: "center",
                            }}
                            aria-label={`Move ${title} up`}
                          >
                            <Icon name="chevron-up" size={10} />
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
                              display: "flex",
                              alignItems: "center",
                            }}
                            aria-label={`Move ${title} down`}
                          >
                            <Icon name="chevron-down" size={10} />
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
                          <span aria-hidden="true" style={{ display: "flex", alignItems: "center" }}>
                            <Icon name={(w?.icon as IconName) || "settings"} size={13} />
                          </span>
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
              <span style={{ display: "flex", alignItems: "center", color: "var(--bbq-accent)" }} aria-hidden="true">
                <Icon name="palm" size={28} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>BBQ Desktop</h3>
                <span style={{ fontSize: "12px", color: "var(--bbq-accent)", fontWeight: 600 }}>
                  Version 1.2.0 (Production Edition)
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

            {capabilities && (
              <div style={{ paddingTop: "8px", borderTop: "1px solid var(--bbq-border)" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--bbq-text)", display: "block", marginBottom: "8px" }}>
                  Platform Capabilities ({capabilities.platform})
                </span>
                <div id="platform-capabilities-list" style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
                  {[
                    { label: "Global Hotkey", status: capabilities.globalHotkey },
                    { label: "Clipboard Live Events", status: capabilities.clipboardLiveEvents },
                    { label: "Clipboard History", status: capabilities.clipboardHistory },
                    { label: "Media Control", status: capabilities.mediaControl },
                    { label: "Media Events", status: capabilities.mediaEvents },
                    { label: "Notifications", status: capabilities.notifications },
                    { label: "Display Change Events", status: capabilities.displayChangeEvents },
                    { label: "Window Positioning", status: capabilities.windowAbsolutePositioning },
                  ].map(({ label, status }) => {
                    const formatted = formatCapabilityStatus(status);
                    return (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "var(--bbq-text-muted)" }}>{label}:</span>
                        <span
                          className="bbq-capability-badge"
                          data-status={status}
                        >
                          {formatted.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
