import React from "react";

export type WidgetLifecycle =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "unavailable";

export interface WidgetDefinition {
  id: string;
  title: string;
  icon: string;
  priority: number;
  canActivate: () => boolean;
  render?: () => React.ReactNode;
  lifecycle: WidgetLifecycle;
  isDeclaredOnly?: boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
}

export class WidgetRegistry {
  private widgets: Map<string, WidgetDefinition> = new Map();
  private listeners: Set<() => void> = new Set();
  private activeWidgetId: string | null = null;
  private disabledWidgetIds: Set<string> = new Set();

  constructor() {
    this.registerDeclaredWidgets();
  }

  private registerDeclaredWidgets(): void {
    // Declared future widgets per Milestone 6 contract
    const declared = [
      { id: "drop", title: "Drop Zone", icon: "📥", priority: 90 },
      { id: "launcher", title: "Launcher", icon: "🚀", priority: 45 },
      { id: "timer", title: "Timer", icon: "⏱️", priority: 40 },
      { id: "reminder", title: "Reminders", icon: "🔔", priority: 35 },
      { id: "notes", title: "Notes", icon: "📝", priority: 30 },
      { id: "bookmarks", title: "Bookmarks", icon: "🔖", priority: 25 },
      { id: "network", title: "Network", icon: "🌐", priority: 20 },
      { id: "settings", title: "Settings", icon: "⚙️", priority: 15 },
    ];

    for (const item of declared) {
      this.widgets.set(item.id, {
        id: item.id,
        title: item.title,
        icon: item.icon,
        priority: item.priority,
        canActivate: () => false,
        lifecycle: "unavailable",
        isDeclaredOnly: true,
      });
    }
  }

  public register(widget: WidgetDefinition): void {
    const existing = this.widgets.get(widget.id);
    if (existing && !existing.isDeclaredOnly) {
      throw new Error(`Duplicate widget registration attempted for id: ${widget.id}`);
    }
    this.widgets.set(widget.id, { ...widget, isDeclaredOnly: false });
    this.notify();
  }

  public get(id: string): WidgetDefinition | undefined {
    return this.widgets.get(id);
  }

  public getAll(): WidgetDefinition[] {
    return Array.from(this.widgets.values()).sort(
      (a, b) => b.priority - a.priority
    );
  }

  public setDisabledWidgets(disabledIds: string[]): void {
    this.disabledWidgetIds = new Set(disabledIds);
    this.notify();
  }

  public getActiveWidgets(): WidgetDefinition[] {
    return Array.from(this.widgets.values())
      .filter((w) => !w.isDeclaredOnly && w.lifecycle !== "unavailable" && !this.disabledWidgetIds.has(w.id))
      .sort((a, b) => b.priority - a.priority);
  }

  public setLifecycle(id: string, lifecycle: WidgetLifecycle): void {
    const w = this.widgets.get(id);
    if (w) {
      w.lifecycle = lifecycle;
      this.notify();
    }
  }

  public activate(id: string): void {
    if (this.activeWidgetId === id) return;

    if (this.activeWidgetId) {
      const prev = this.widgets.get(this.activeWidgetId);
      if (prev?.onDeactivate) {
        try {
          prev.onDeactivate();
        } catch (err) {
          console.error(`Error deactivating widget ${this.activeWidgetId}:`, err);
        }
      }
    }

    this.activeWidgetId = id;
    const current = this.widgets.get(id);
    if (current) {
      if (current.lifecycle === "idle") {
        current.lifecycle = "ready";
      }
      if (current.onActivate) {
        try {
          current.onActivate();
        } catch (err) {
          console.error(`Error activating widget ${id}:`, err);
          current.lifecycle = "error";
        }
      }
    }

    this.notify();
  }

  public deactivate(id: string): void {
    if (this.activeWidgetId !== id) return;

    const current = this.widgets.get(id);
    if (current?.onDeactivate) {
      try {
        current.onDeactivate();
      } catch (err) {
        console.error(`Error deactivating widget ${id}:`, err);
      }
    }
    this.activeWidgetId = null;
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}

export const widgetRegistry = new WidgetRegistry();
