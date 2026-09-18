import { widgetRegistry } from "./widgetRegistry.ts";

let isBootstrapped = false;

/**
 * Deterministically registers all standard BBQ HUD widgets at application startup.
 * Runs exactly once before React createRoot().
 * Idempotent: repeated calls are no-ops.
 */
export function bootstrapWidgets(): void {
  if (isBootstrapped) return;
  isBootstrapped = true;

  widgetRegistry.register({
    id: "drop",
    title: "Drop Zone",
    icon: "drop",
    priority: 90,
    canActivate: () => true,
    lifecycle: "ready",
  });

  widgetRegistry.register({
    id: "files",
    title: "Files",
    icon: "files",
    priority: 85,
    canActivate: () => true,
    lifecycle: "ready",
  });

  widgetRegistry.register({
    id: "clipboard",
    title: "Clipboard",
    icon: "clipboard",
    priority: 80,
    canActivate: () => true,
    lifecycle: "ready",
  });

  widgetRegistry.register({
    id: "media",
    title: "Media",
    icon: "media",
    priority: 70,
    canActivate: () => true,
    lifecycle: "ready",
  });

  widgetRegistry.register({
    id: "system",
    title: "System",
    icon: "system",
    priority: 50,
    canActivate: () => true,
    lifecycle: "ready",
  });

  widgetRegistry.register({
    id: "launcher",
    title: "Launcher",
    icon: "launcher",
    priority: 45,
    canActivate: () => true,
    lifecycle: "ready",
  });

  widgetRegistry.register({
    id: "timer",
    title: "Timer",
    icon: "timer",
    priority: 40,
    canActivate: () => true,
    lifecycle: "ready",
  });

  widgetRegistry.register({
    id: "reminder",
    title: "Reminders",
    icon: "reminders",
    priority: 35,
    canActivate: () => true,
    lifecycle: "ready",
  });

  widgetRegistry.register({
    id: "settings",
    title: "Settings",
    icon: "settings",
    priority: 10,
    canActivate: () => true,
    lifecycle: "ready",
  });
}
