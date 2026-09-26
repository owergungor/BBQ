import React, { useEffect, useRef, useState, useCallback } from "react";
import { Icon } from "./Icon.tsx";
import { widgetRegistry } from "../../island/widgetRegistry.ts";
import { setActiveWidget, useIslandState } from "../../island/islandState.ts";
import { islandRuntime } from "../../island/IslandRuntime.ts";
import { useSettingsState, updateSetting } from "../../state/settingsState.ts";
import { refreshSystemState } from "../../state/systemState.ts";

export interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose }) => {
  const { state: islandLayoutState, activeWidgetId } = useIslandState();
  const { settings } = useSettingsState();
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showSwitchSubmenu, setShowSwitchSubmenu] = useState<boolean>(false);
  const [showAboutModal, setShowAboutModal] = useState<boolean>(false);
  const [isPinned, setIsPinned] = useState<boolean>(true);
  const menuRef = useRef<HTMLDivElement>(null);

  // Compute screen-edge clamped position
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number }>({ x, y });

  useEffect(() => {
    const menuWidth = 200;
    const menuHeight = 280;
    const padding = 8;

    const clampedX = Math.max(
      padding,
      Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 800) - menuWidth - padding)
    );
    const clampedY = Math.max(
      padding,
      Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 600) - menuHeight - padding)
    );

    setAdjustedPos({ x: clampedX, y: clampedY });
  }, [x, y]);

  const isExpanded = islandLayoutState === "Expanded";
  const startAtLogin = Boolean(settings.start_at_login);

  // Active widgets for Switch Widget submenu
  const activeWidgets = Array.from(widgetRegistry.getAll().values());

  const handleToggleExpand = useCallback(async () => {
    if (isExpanded) {
      await islandRuntime.handleEvent({ type: "USER_ESCAPE" });
    } else {
      await islandRuntime.transitionTo("Expanded", "mouse");
    }
    onClose();
  }, [isExpanded, onClose]);

  const handleTogglePin = useCallback(() => {
    setIsPinned((prev) => !prev);
    // In Tauri webview or native window, setAlwaysOnTop can be applied
    if (typeof window !== "undefined" && (window as any).__TAURI__) {
      try {
        const { getCurrentWindow } = (window as any).__TAURI__.window;
        getCurrentWindow().setAlwaysOnTop(!isPinned).catch(() => {});
      } catch {
        // Fallback
      }
    }
    onClose();
  }, [isPinned, onClose]);

  const handleReloadWidget = useCallback(async () => {
    if (activeWidgetId === "system") {
      await refreshSystemState();
    }
    // Also signal runtime reload
    await islandRuntime.handleEvent({ type: "WIDGET_SELECT", widgetId: activeWidgetId ?? "system" });
    onClose();
  }, [activeWidgetId, onClose]);

  const handleOpenSettings = useCallback(async () => {
    setActiveWidget("settings");
    await islandRuntime.transitionTo("Expanded", "mouse");
    onClose();
  }, [onClose]);

  const handleToggleLogin = useCallback(async () => {
    await updateSetting("start_at_login", (!startAtLogin).toString());
    onClose();
  }, [startAtLogin, onClose]);

  const handleQuit = useCallback(() => {
    onClose();
    if (typeof window !== "undefined") {
      if ((window as any).__TAURI__) {
        try {
          const { getCurrentWindow } = (window as any).__TAURI__.window;
          getCurrentWindow().close().catch(() => window.close());
        } catch {
          window.close();
        }
      } else {
        window.close();
      }
    }
  }, [onClose]);

  // Main menu items definition
  const menuItems = [
    {
      id: "switch",
      label: "Switch Widget",
      icon: "launcher" as const,
      hasSubmenu: true,
      action: () => setShowSwitchSubmenu((prev) => !prev),
    },
    {
      id: "pin",
      label: isPinned ? "Always on Top ✓" : "Always on Top",
      icon: "pin" as const,
      action: handleTogglePin,
    },
    {
      id: "expand",
      label: isExpanded ? "Collapse HUD" : "Expand HUD",
      icon: isExpanded ? ("chevron-up" as const) : ("chevron-down" as const),
      action: handleToggleExpand,
    },
    {
      id: "reload",
      label: "Reload Active Widget",
      icon: "refresh" as const,
      action: handleReloadWidget,
    },
    {
      id: "settings",
      label: "Settings",
      icon: "settings" as const,
      action: handleOpenSettings,
    },
    {
      id: "autostart",
      label: startAtLogin ? "Launch at Login ✓" : "Launch at Login",
      icon: "power" as const,
      action: handleToggleLogin,
    },
    {
      id: "about",
      label: "About BBQ",
      icon: "sparkles" as const,
      action: () => setShowAboutModal(true),
    },
    {
      id: "quit",
      label: "Quit BBQ",
      icon: "close" as const,
      danger: true,
      action: handleQuit,
    },
  ];

  // Outside click listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [onClose]);

  // Keyboard navigation: ArrowDown, ArrowUp, Enter, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % menuItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        menuItems[selectedIndex]?.action();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, menuItems, onClose]);

  return (
    <>
      <div
        id="bbq-context-menu"
        ref={menuRef}
        role="menu"
        aria-label="BBQ Quick Actions Context Menu"
        className="bbq-context-menu"
        style={{
          left: `${adjustedPos.x}px`,
          top: `${adjustedPos.y}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bbq-context-menu-header">
          <span className="bbq-context-menu-title">BBQ Island</span>
          <span className="bbq-context-menu-badge">v2.1</span>
        </div>

        <div className="bbq-context-menu-divider" role="separator" />

        <div className="bbq-context-menu-items">
          {menuItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={item.id}
                id={`context-item-${item.id}`}
                role="menuitem"
                tabIndex={isSelected ? 0 : -1}
                className={
                  "bbq-context-menu-item" +
                  (isSelected ? " selected" : "") +
                  (item.danger ? " danger" : "")
                }
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="bbq-context-item-icon">
                  <Icon name={item.icon} size={13} aria-hidden="true" />
                </span>
                <span className="bbq-context-item-label">{item.label}</span>
                {item.hasSubmenu && (
                  <span className="bbq-context-item-arrow" aria-hidden="true">
                    ›
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Switch Widget Submenu Popover */}
        {showSwitchSubmenu && (
          <div
            id="bbq-context-submenu"
            className="bbq-context-submenu"
            role="menu"
            aria-label="Switch Widget Submenu"
          >
            {activeWidgets.map((w) => (
              <button
                key={w.id}
                id={`context-subitem-${w.id}`}
                role="menuitem"
                className={
                  "bbq-context-submenu-item" +
                  (w.id === activeWidgetId ? " active" : "")
                }
                onClick={async () => {
                  setActiveWidget(w.id);
                  await islandRuntime.transitionTo("Expanded", "mouse");
                  onClose();
                }}
              >
                <span className="bbq-context-subitem-icon">{w.icon}</span>
                <span className="bbq-context-subitem-name">{w.title}</span>
                {w.id === activeWidgetId && <span className="bbq-context-check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* About Modal Dialog */}
      {showAboutModal && (
        <div
          id="bbq-about-dialog-backdrop"
          className="bbq-about-backdrop"
          onClick={() => {
            setShowAboutModal(false);
            onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="About BBQ"
        >
          <div
            className="bbq-about-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bbq-about-header">
              <span className="bbq-about-brand">BBQ Desktop Island</span>
              <span className="bbq-about-version">v2.1.0</span>
            </div>
            <p className="bbq-about-desc">
              Lightweight, responsive cross-platform productivity island. Zero-polling native telemetry, media controller, and productivity shelf.
            </p>
            <div className="bbq-about-footer">
              <button
                type="button"
                id="about-close-btn"
                className="bbq-btn bbq-btn-secondary"
                onClick={() => {
                  setShowAboutModal(false);
                  onClose();
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
