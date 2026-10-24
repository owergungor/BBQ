import React, { useState, useEffect, useRef } from "react";
import { useSettingsState, updateSettingsBatch, resetSettingsToDefaults } from "../../state/settingsState.ts";
import { widgetRegistry } from "../../island/widgetRegistry.ts";
import { islandRuntime } from "../../island/IslandRuntime.ts";
import { DEFAULT_COMPACT_INDICATOR_ORDER, resolveEffectiveIndicatorOrder } from "../../island/compactOrder.ts";
import { useHotkeyState } from "../../state/hotkeyState.ts";
import type { ThemePreference, AccentColor, PlatformCapabilities } from "@bbq/types";
import { bbqCommands } from "../../ipc/commands.ts";
import { Icon, type IconName } from "../common/Icon.tsx";
import {
  clampIslandWidth, clampIslandHeight, clampClipboardCapacity, clampClipboardRetention,
  validateHexColor, validateHotkeyInput, sanitizeIndicatorOrder, isHotkeySupported,
  isClipboardLiveSupported, generateSanitizedDiagnostics,
} from "./settingsModel.ts";
import {
  type SettingsTab, AppearanceSettingsTab, IslandSettingsTab, HotkeySettingsTab,
  PrivacySettingsTab, NotificationsSettingsTab, WidgetsSettingsTab, UpdateSettingsTab, AboutSettingsTab,
} from "./settings/index.ts";
import { useSettingsTabAutoHeight } from "./settingsTabHeightStore.ts";
import { useTranslation } from "../../i18n/index.ts";
import { useUpdaterState } from "../../state/updaterState.ts";

let targetSettingsTab: SettingsTab | null = null;
const tabListeners = new Set<(tab: SettingsTab) => void>();

export function setTargetSettingsTab(tab: SettingsTab) {
  targetSettingsTab = tab;
  for (const listener of tabListeners) listener(tab);
}

export const SettingsWidget: React.FC = () => {
  const { t } = useTranslation();
  const { settings, isLoading } = useSettingsState();
  const { conflictError } = useHotkeyState();
  const updaterState = useUpdaterState();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => targetSettingsTab || "appearance");

  useEffect(() => {
    const listener = (tab: SettingsTab) => setActiveTab(tab);
    tabListeners.add(listener);
    return () => { tabListeners.delete(listener); };
  }, []);

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
  const [draftBlur, setDraftBlur] = useState(settings.island_blur ?? 20);
  const [draftClipboardMax, setDraftClipboardMax] = useState(settings.clipboard_max_entries);
  const [draftRetention, setDraftRetention] = useState(settings.clipboard_retention_days);
  const [draftHotkey, setDraftHotkey] = useState(settings.global_hotkey);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);

  useEffect(() => {
    setDraftWidth(settings.island_width);
    setDraftHeight(settings.island_height);
    setDraftTransparency(settings.island_transparency ?? 0);
    setDraftBlur(settings.island_blur ?? 20);
    setDraftClipboardMax(settings.clipboard_max_entries);
    setDraftRetention(settings.clipboard_retention_days);
    setDraftHotkey(settings.global_hotkey);
  }, [settings.island_width, settings.island_height, settings.island_transparency, settings.island_blur, settings.clipboard_max_entries, settings.clipboard_retention_days, settings.global_hotkey]);

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  const showStatus = (msg: string) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMessage(msg);
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
      statusTimerRef.current = null;
    }, 2500);
  };

  const handleThemeChange = async (theme: ThemePreference) => {
    await updateSettingsBatch({ theme });
    showStatus(t("settings.status.preferenceUpdated") || `Theme set to ${theme}`);
  };

  const handleAccentColorChange = async (accentColor: AccentColor) => {
    await updateSettingsBatch({ accent_color: accentColor });
    showStatus(t("settings.status.preferenceUpdated") || `Accent color set to ${accentColor}`);
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
    showStatus(t("settings.status.diagnosticsCopied") || "Diagnostic info copied to clipboard");
  };

  const handleCustomAccentChange = async (hex: string) => {
    const validated = validateHexColor(hex);
    await updateSettingsBatch({
      accent_color: "custom",
      custom_accent_color: validated.normalized,
    });
    showStatus(
      t("settings.status.customAccentSet", { color: validated.normalized }) ||
        `Custom accent set to ${validated.normalized}`
    );
  };

  const handleToggle = async (key: string, value: any) => {
    await updateSettingsBatch({ [key]: value });
    showStatus(t("settings.status.preferenceUpdated") || "Preference updated");
  };

  const handleResetIslandPosition = async () => {
    try {
      await bbqCommands.resetIslandPosition();
      await updateSettingsBatch({ island_position: "top-center", move_hud: false });
      showStatus(t("settings.status.islandPositionReset") || "Island position reset to default");
    } catch {
      showStatus("Failed to reset position");
    }
  };

  const handleTriggerMoveHud = async () => {
    await updateSettingsBatch({ move_hud: true });
    await islandRuntime.handleEvent({ type: "USER_ESCAPE" });
  };

  const handleLanguageChange = async (lang: string) => {
    await updateSettingsBatch({ language: lang as any });
    showStatus(t("common.saved") || "Preference updated");
  };

  const commitTransparency = async (val: number) => {
    const clamped = Math.max(0, Math.min(80, Math.round(val / 10) * 10));
    if (clamped !== settings.island_transparency) {
      await updateSettingsBatch({ island_transparency: clamped });
      showStatus(t("settings.status.islandTransparency") || "Island transparency updated");
    }
  };

  const commitBlur = async (val: number) => {
    const clamped = Math.max(0, Math.min(40, Math.round(val)));
    if (clamped !== settings.island_blur) {
      await updateSettingsBatch({ island_blur: clamped });
      showStatus(t("settings.status.islandBlur") || "Island blur updated");
    }
  };

  const commitWidth = async () => {
    const clamped = clampIslandWidth(draftWidth);
    if (clamped !== settings.island_width) {
      await updateSettingsBatch({ island_width: clamped });
      showStatus(t("settings.status.islandWidth") || "Island width updated");
    }
  };

  const commitHeight = async () => {
    const clamped = clampIslandHeight(draftHeight);
    if (clamped !== settings.island_height) {
      await updateSettingsBatch({ island_height: clamped });
      showStatus(t("settings.status.islandHeight") || "Island height updated");
    }
  };

  const commitClipboardMax = async () => {
    const clamped = clampClipboardCapacity(draftClipboardMax);
    if (clamped !== settings.clipboard_max_entries) {
      await updateSettingsBatch({ clipboard_max_entries: clamped });
      showStatus(t("settings.status.clipboardCapacity") || "Clipboard capacity updated");
    }
  };

  const commitRetention = async () => {
    const clamped = clampClipboardRetention(draftRetention);
    if (clamped !== settings.clipboard_retention_days) {
      await updateSettingsBatch({ clipboard_retention_days: clamped });
      showStatus(t("settings.status.clipboardRetention") || "Clipboard retention updated");
    }
  };

  const handleSaveHotkey = async () => {
    const validation = validateHotkeyInput(draftHotkey);
    if (!validation.valid) {
      setHotkeyError(
        validation.error ||
          t("settings.hotkey.modifierHint") ||
          "Shortcut must include at least one modifier key plus a key."
      );
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
      showStatus(t("settings.status.globalHotkey") || "Global hotkey updated");
    } else {
      setHotkeyError(
        t("settings.hotkey.conflictWarning") ||
          "Failed to register hotkey with the operating system."
      );
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
    await resetSettingsToDefaults();
    showStatus(t("settings.status.resetDefaults") || "Reset to default settings");
  };

  const allRegisteredWidgets = widgetRegistry.getAll().filter((w) => w.id !== "settings");
  const disabledSet = new Set(settings.disabled_widgets);

  const toggleWidget = async (widgetId: string) => {
    const nextList = disabledSet.has(widgetId)
      ? settings.disabled_widgets.filter((id) => id !== widgetId)
      : [...settings.disabled_widgets, widgetId];
    await updateSettingsBatch({ disabled_widgets: nextList });
    const isNowEnabled = disabledSet.has(widgetId);
    showStatus(
      isNowEnabled
        ? t("settings.status.enabledWidget", { widget: widgetId }) || `Enabled ${widgetId}`
        : t("settings.status.disabledWidget", { widget: widgetId }) || `Disabled ${widgetId}`
    );
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
    showStatus(t("settings.status.widgetOrder") || "Compact widget order updated");
  };

  const resetIndicatorOrder = async () => {
    await updateSettingsBatch({
      compact_indicator_order: DEFAULT_COMPACT_INDICATOR_ORDER,
    });
    showStatus(t("settings.status.widgetOrderReset") || "Widget order reset to default");
  };

  const TAB_ICONS: Record<SettingsTab, IconName> = {
    appearance: "palette", island: "monitor", hotkey: "keyboard", privacy: "lock",
    notifications: "bell", widgets: "layout", update: "refresh", about: "info",
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "appearance", label: t("settings.tabs.appearance") },
    { id: "island", label: t("settings.tabs.island") },
    { id: "hotkey", label: t("settings.tabs.hotkey") },
    { id: "privacy", label: t("settings.tabs.privacy") },
    { id: "notifications", label: t("settings.tabs.notifications") },
    { id: "widgets", label: t("settings.tabs.widgets") },
    { id: "update", label: t("settings.tabs.update") || "Update" },
    { id: "about", label: t("settings.tabs.about") || "About" }, // { id: "about", label: "About" }
  ];

  const contentRef = useSettingsTabAutoHeight(activeTab, settings.language);

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    const btn = document.getElementById(`settings-tab-${nextTab.id}`);
    btn?.focus();
  };

  return (
    <div
      className="bbq-settings-widget"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "4px 8px 6px 8px",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Accessible Landmark Heading */}
      <h2 className="bbq-sr-only">Settings</h2>

      {/* Header status */}
      {statusMessage && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            marginBottom: "4px",
            flexShrink: 0,
          }}
        >
          <span
            style={{ fontSize: "11px", color: "var(--bbq-accent)", fontWeight: 500 }}
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div
        className="bbq-settings-tablist"
        role="tablist"
        aria-label="Settings Categories"
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "8px",
          borderBottom: "1px solid var(--bbq-border-subtle)",
          overflowX: "visible",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {tabs.map((tab, idx) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-label={tab.label}
              title={tab.label}
              aria-controls={`settings-panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={`bbq-settings-tab-btn ${isSelected ? "active" : ""}`}
            >
              <span className="bbq-settings-tab-icon" aria-hidden="true" style={{ position: "relative" }}>
                <Icon name={TAB_ICONS[tab.id]} size={15} />
                {tab.id === "update" && (updaterState.status === "update_available" || updaterState.status === "success") && (
                  <span className="bbq-update-tab-dot" aria-label={t("updater.updateAvailable") || "Update Available"} />
                )}
              </span>
              <span className="bbq-tab-tooltip" role="tooltip" aria-hidden="true">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div
        ref={contentRef}
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
          paddingBottom: "12px",
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
            language={settings.language}
            onThemeChange={handleThemeChange}
            onAccentColorChange={handleAccentColorChange}
            onCustomAccentChange={handleCustomAccentChange}
            onToggle={handleToggle}
            onLanguageChange={handleLanguageChange}
          />
        )}

        {activeTab === "island" && (
          <IslandSettingsTab
            draftWidth={draftWidth}
            draftHeight={draftHeight}
            draftTransparency={draftTransparency}
            draftBlur={draftBlur}
            blurEnabled={settings.island_blur_enabled ?? true}
            islandPosition={settings.island_position || "top-center"}
            alwaysOnTop={settings.always_on_top ?? true}
            autoExpandOnEvent={settings.auto_expand_on_event}
            onDraftWidthChange={setDraftWidth}
            onDraftHeightChange={setDraftHeight}
            onDraftTransparencyChange={setDraftTransparency}
            onDraftBlurChange={setDraftBlur}
            onCommitWidth={commitWidth}
            onCommitHeight={commitHeight}
            onCommitTransparency={commitTransparency}
            onCommitBlur={commitBlur}
            onToggle={handleToggle}
            onResetPosition={handleResetIslandPosition}
            onTriggerMoveHud={handleTriggerMoveHud}
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
            onDraftHotkeyChange={(val) => { setDraftHotkey(val); setHotkeyError(null); }}
            onStartRecording={() => { setDraftHotkey(""); setIsRecordingHotkey(true); setHotkeyError(null); setTimeout(() => hotkeyInputRef.current?.focus(), 50); }}
            onStopRecording={() => { setIsRecordingHotkey(false); setDraftHotkey(settings.global_hotkey); }}
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
            isLoading={isLoading}
            onDraftClipboardMaxChange={setDraftClipboardMax}
            onDraftRetentionChange={setDraftRetention}
            onCommitClipboardMax={commitClipboardMax}
            onCommitRetention={commitRetention}
            onToggle={handleToggle}
            onResetDefaults={handleReset}
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

        {activeTab === "update" && <UpdateSettingsTab />}

        {activeTab === "about" && (
          <AboutSettingsTab
            capabilities={capabilities}
            onCopyDiagnostics={handleCopyDiagnostics}
            onReplayTour={async () => {
              await updateSettingsBatch({ onboarding_completed: false });
              showStatus(t("settings.status.tourActivated") || "Welcome tour activated");
            }}
          />
        )}
      </div>

      {/* Footer Info */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: "6px",
          paddingBottom: "2px",
          borderTop: "1px solid var(--bbq-border)",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--bbq-text-muted)" }}>
          {t("settings.savedNotice") || "Preferences are automatically saved to SQLite"}
        </span>
      </div>
    </div>
  );
};
