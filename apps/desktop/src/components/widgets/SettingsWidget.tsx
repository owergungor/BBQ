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
import type { ThemePreference, AccentColor, PlatformCapabilities } from "@bbq/types";
import { bbqCommands } from "../../ipc/commands.ts";
import { Icon } from "../common/Icon.tsx";
import {
  clampIslandWidth,
  clampIslandHeight,
  clampClipboardCapacity,
  clampClipboardRetention,
  validateHexColor,
  validateHotkeyInput,
  sanitizeIndicatorOrder,
  isHotkeySupported,
  isClipboardLiveSupported,
  generateSanitizedDiagnostics,
} from "./settingsModel.ts";
import {
  type SettingsTab,
  AppearanceSettingsTab,
  IslandSettingsTab,
  HotkeySettingsTab,
  PrivacySettingsTab,
  NotificationsSettingsTab,
  WidgetsSettingsTab,
  AboutSettingsTab,
} from "./settings/index.ts";

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
  const [draftTransparency, setDraftTransparency] = useState(settings.island_transparency ?? 0);
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
    setDraftTransparency(settings.island_transparency ?? 0);
  }, [settings.island_transparency]);

  useEffect(() => {
    setDraftClipboardMax(settings.clipboard_max_entries);
  }, [settings.clipboard_max_entries]);

  useEffect(() => {
    setDraftRetention(settings.clipboard_retention_days);
  }, [settings.clipboard_retention_days]);

  useEffect(() => {
    setDraftHotkey(settings.global_hotkey);
  }, [settings.global_hotkey]);

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  const showStatus = (msg: string) => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
    }
    setStatusMessage(msg);
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
      statusTimerRef.current = null;
    }, 2500);
  };

  const handleThemeChange = async (theme: ThemePreference) => {
    await updateSettingsBatch({ theme });
    showStatus(`Theme set to ${theme}`);
  };

  const handleAccentColorChange = async (accentColor: AccentColor) => {
    await updateSettingsBatch({ accent_color: accentColor });
    showStatus(`Accent color set to ${accentColor}`);
  };

  const handleCopyDiagnostics = async () => {
    const diag = generateSanitizedDiagnostics(settings, capabilities);
    const json = JSON.stringify(diag, null, 2);
    let copied = await bbqCommands.clipboardWriteText(json);
    if (!copied && typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(json);
        copied = true;
      } catch {
        // Fallback
      }
    }
    showStatus("Diagnostic info copied to clipboard");
  };

  const handleCustomAccentChange = async (hex: string) => {
    const validated = validateHexColor(hex);
    await updateSettingsBatch({
      accent_color: "custom",
      custom_accent_color: validated.normalized,
    });
    showStatus(`Custom accent set to ${validated.normalized}`);
  };

  const handleToggle = async (key: string, value: any) => {
    await updateSettingsBatch({ [key]: value });
    showStatus("Preference updated");
  };

  const commitTransparency = async (val: number) => {
    const clamped = Math.max(0, Math.min(80, Math.round(val)));
    if (clamped !== settings.island_transparency) {
      await updateSettingsBatch({ island_transparency: clamped });
      showStatus("Island transparency updated");
    }
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

    const reordered = [...currentIndicatorOrder];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const sanitized = sanitizeIndicatorOrder(reordered, DEFAULT_COMPACT_INDICATOR_ORDER);
    await updateSettingsBatch({ compact_indicator_order: sanitized });
    showStatus("Compact widget order updated");
  };

  const resetIndicatorOrder = async () => {
    await updateSettingsBatch({
      compact_indicator_order: DEFAULT_COMPACT_INDICATOR_ORDER,
    });
    showStatus("Widget order reset to default");
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
      className="bbq-settings-widget"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "8px 12px",
        boxSizing: "border-box",
      }}
      onClick={(e) => e.stopPropagation()}
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
        tabIndex={0}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          fontSize: "12px",
          paddingRight: "6px",
          scrollbarWidth: "thin",
          scrollbarGutter: "stable",
        }}
      >
        {activeTab === "appearance" && (
          <AppearanceSettingsTab
            theme={settings.theme}
            accentColor={settings.accent_color || "blue"}
            customAccentColor={settings.custom_accent_color || null}
            reducedMotion={settings.reduced_motion}
            startAtLogin={settings.start_at_login}
            onThemeChange={handleThemeChange}
            onAccentColorChange={handleAccentColorChange}
            onCustomAccentChange={handleCustomAccentChange}
            onToggle={handleToggle}
          />
        )}

        {activeTab === "island" && (
          <IslandSettingsTab
            draftWidth={draftWidth}
            draftHeight={draftHeight}
            draftTransparency={draftTransparency}
            islandPosition={settings.island_position || "top-center"}
            alwaysOnTop={settings.always_on_top ?? true}
            autoExpandOnEvent={settings.auto_expand_on_event}
            onDraftWidthChange={setDraftWidth}
            onDraftHeightChange={setDraftHeight}
            onDraftTransparencyChange={setDraftTransparency}
            onCommitWidth={commitWidth}
            onCommitHeight={commitHeight}
            onCommitTransparency={commitTransparency}
            onToggle={handleToggle}
          />
        )}

        {activeTab === "hotkey" && (
          <HotkeySettingsTab
            globalHotkey={settings.global_hotkey}
            hotkeyEnabled={settings.hotkey_enabled}
            draftHotkey={draftHotkey}
            isRecordingHotkey={isRecordingHotkey}
            hotkeyError={hotkeyError}
            conflictError={conflictError}
            hotkeySupported={hotkeySupported}
            capabilities={capabilities}
            hotkeyInputRef={hotkeyInputRef}
            onDraftHotkeyChange={(val) => {
              setDraftHotkey(val);
              setHotkeyError(null);
            }}
            onStartRecording={() => {
              setDraftHotkey("");
              setIsRecordingHotkey(true);
              setHotkeyError(null);
              setTimeout(() => hotkeyInputRef.current?.focus(), 50);
            }}
            onStopRecording={() => {
              setIsRecordingHotkey(false);
              setDraftHotkey(settings.global_hotkey);
            }}
            onSaveHotkey={handleSaveHotkey}
            onCancelHotkey={handleCancelHotkey}
            onHotkeyKeyDown={handleHotkeyKeyDown}
            onToggle={handleToggle}
          />
        )}

        {activeTab === "privacy" && (
          <PrivacySettingsTab
            clipboardHistoryEnabled={settings.clipboard_history_enabled}
            draftClipboardMax={draftClipboardMax}
            draftRetention={draftRetention}
            clipboardLiveSupported={clipboardLiveSupported}
            capabilities={capabilities}
            onDraftClipboardMaxChange={setDraftClipboardMax}
            onDraftRetentionChange={setDraftRetention}
            onCommitClipboardMax={commitClipboardMax}
            onCommitRetention={commitRetention}
            onToggle={handleToggle}
          />
        )}

        {activeTab === "notifications" && (
          <NotificationsSettingsTab
            notificationsEnabled={settings.notifications_enabled}
            timerSoundEnabled={settings.timer_sound_enabled}
            reminderSoundEnabled={settings.reminder_sound_enabled}
            onToggle={handleToggle}
          />
        )}

        {activeTab === "widgets" && (
          <WidgetsSettingsTab
            allRegisteredWidgets={allRegisteredWidgets}
            currentIndicatorOrder={currentIndicatorOrder}
            disabledWidgets={settings.disabled_widgets}
            onToggleWidget={toggleWidget}
            onMoveIndicator={moveIndicator}
            onResetIndicatorOrder={resetIndicatorOrder}
          />
        )}

        {activeTab === "about" && (
          <AboutSettingsTab
            capabilities={capabilities}
            onCopyDiagnostics={handleCopyDiagnostics}
            onReplayTour={async () => {
              await updateSettingsBatch({ onboarding_completed: false });
              showStatus("Welcome tour activated");
            }}
          />
        )}
      </div>

      {/* Footer Actions */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: "12px",
          borderTop: "1px solid var(--bbq-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
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
