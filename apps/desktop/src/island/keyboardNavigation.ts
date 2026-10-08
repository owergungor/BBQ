import type { WidgetDefinition } from "./widgetRegistry.ts";
import { isTabSelectable } from "../components/island/segmentedTabBarModel.ts";

/**
 * Checks whether an event target is a text-entry control.
 * Prevents number shortcut keys (1-9) from hijacking normal typing
 * in text inputs, textareas, contenteditable elements, search boxes,
 * and hotkey recording inputs.
 */
export function isTextEntryTarget(target: EventTarget | null | undefined): boolean {
  if (!target) return false;

  const el = target as {
    tagName?: string;
    type?: string;
    isContentEditable?: boolean;
    getAttribute?: (attr: string) => string | null;
    closest?: (selector: string) => Element | null;
  };

  const tagName = el.tagName?.toLowerCase();
  if (tagName === "textarea") return true;

  if (tagName === "input") {
    const inputType = el.type?.toLowerCase();
    if (
      inputType === "checkbox" ||
      inputType === "radio" ||
      inputType === "button" ||
      inputType === "submit" ||
      inputType === "reset" ||
      inputType === "range"
    ) {
      return false;
    }
    return true;
  }

  if (el.isContentEditable) return true;

  if (typeof el.getAttribute === "function") {
    const ceAttr = el.getAttribute("contenteditable");
    if (ceAttr === "true" || ceAttr === "") return true;
    if (el.getAttribute("data-hotkey-recording") === "true") return true;
  }

  // Hotkey recording controls, textboxes, or searchboxes
  if (typeof el.closest === "function") {
    if (
      el.closest(
        '[data-hotkey-recording="true"], [role="textbox"], [role="searchbox"], [contenteditable="true"]'
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether a modal dialog, context menu, or active dropdown is open.
 * When open, HUD keyboard navigation must not switch tabs.
 */
export function isModalOrMenuOpen(): boolean {
  if (typeof document === "undefined") return false;

  const selector =
    '.bbq-context-menu, .bbq-about-backdrop, .bbq-onboarding-modal, [aria-modal="true"], [role="dialog"], .bbq-modal-backdrop, [data-menu-open="true"], .bbq-dropdown-menu:not([hidden])';

  if (typeof document.querySelectorAll === "function") {
    const openElements = document.querySelectorAll(selector);
    if (openElements && openElements.length > 0) return true;
  } else if (typeof document.querySelector === "function") {
    const el = document.querySelector(selector);
    if (el) return true;
  }

  return false;
}

export type HudNavWidget = WidgetDefinition | { id: string } | string;

export interface HudKeyboardNavigationOptions {
  event: KeyboardEvent;
  currentWidgetId: string | null;
  activeWidgets: HudNavWidget[];
  onSelectWidget: (widgetId: string) => void;
}

/**
 * Centralized keyboard navigation coordinator for the expanded HUD Island.
 * Handles:
 * - Ctrl+Tab: Next selectable widget (wraps last -> first)
 * - Ctrl+Shift+Tab: Previous selectable widget (wraps first -> last)
 * - Number keys 1-9: Selects corresponding visible widget (1-indexed)
 *
 * Supports both options object and positional arguments:
 * (options) OR (event, currentWidgetId, activeWidgets, onSelectWidget)
 *
 * Returns true if the event was handled and consumed, false otherwise.
 */
export function handleHudKeyboardNavigation(
  optionsOrEvent: HudKeyboardNavigationOptions | KeyboardEvent,
  maybeCurrentId?: string | null,
  maybeActiveWidgets?: HudNavWidget[],
  maybeOnSelect?: (widgetId: string) => void
): boolean {
  let event: KeyboardEvent;
  let currentWidgetId: string | null;
  let rawWidgets: HudNavWidget[];
  let onSelectWidget: (widgetId: string) => void;

  if ("key" in optionsOrEvent) {
    event = optionsOrEvent;
    currentWidgetId = maybeCurrentId ?? null;
    rawWidgets = maybeActiveWidgets || [];
    onSelectWidget = maybeOnSelect || (() => {});
  } else {
    event = optionsOrEvent.event;
    currentWidgetId = optionsOrEvent.currentWidgetId;
    rawWidgets = optionsOrEvent.activeWidgets || [];
    onSelectWidget = optionsOrEvent.onSelectWidget;
  }

  // If a modal, context menu, or dropdown is active, do not navigate
  if (isModalOrMenuOpen()) {
    return false;
  }

  const selectableWidgets = rawWidgets
    .map((w) => (typeof w === "string" ? { id: w } : w))
    .filter((w) => {
      // If it's a full WidgetDefinition, check isTabSelectable
      if ("declaredOnly" in w || "isCustom" in w) {
        return isTabSelectable(w as unknown as WidgetDefinition);
      }
      return true;
    });

  if (selectableWidgets.length === 0) {
    return false;
  }

  // A. Ctrl+Tab / Ctrl+Shift+Tab
  if (event.ctrlKey && event.key === "Tab") {
    event.preventDefault();
    event.stopPropagation();

    const currentIndex = selectableWidgets.findIndex((w) => w.id === currentWidgetId);
    const count = selectableWidgets.length;

    let nextIndex: number;
    if (event.shiftKey) {
      // Previous with wrap-around
      nextIndex = currentIndex <= 0 ? count - 1 : currentIndex - 1;
    } else {
      // Next with wrap-around
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % count;
    }

    const targetWidget = selectableWidgets[nextIndex];
    if (targetWidget) {
      onSelectWidget(targetWidget.id);
      return true;
    }
    return false;
  }

  // B. Number shortcuts 1-9 (only without modifier keys and not in a text entry target)
  if (
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    /^[1-9]$/.test(event.key)
  ) {
    if (isTextEntryTarget(event.target)) {
      return false;
    }

    const targetIndex = parseInt(event.key, 10) - 1;
    if (targetIndex >= 0 && targetIndex < selectableWidgets.length) {
      event.preventDefault();
      event.stopPropagation();
      onSelectWidget(selectableWidgets[targetIndex].id);
      return true;
    }
  }

  return false;
}
