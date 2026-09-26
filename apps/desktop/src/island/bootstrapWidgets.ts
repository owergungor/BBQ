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
    sizing: {
      compact: {
        minWidth: 220,
        preferredWidth: 240,
        maxWidth: 280,
        minHeight: 38,
        preferredHeight: 38,
        maxHeight: 44,
      },
      expanded: {
        minWidth: 460,
        preferredWidth: 500,
        maxWidth: 560,
        minHeight: 280,
        preferredHeight: 320,
        maxHeight: 400,
      },
      contentPolicy: "fixed",
    },
  });

  widgetRegistry.register({
    id: "files",
    title: "Files",
    icon: "files",
    priority: 85,
    canActivate: () => true,
    lifecycle: "ready",
    sizing: {
      compact: {
        minWidth: 220,
        preferredWidth: 240,
        maxWidth: 300,
        minHeight: 38,
        preferredHeight: 38,
        maxHeight: 44,
      },
      expanded: {
        minWidth: 500,
        preferredWidth: 540,
        maxWidth: 600,
        minHeight: 340,
        preferredHeight: 380,
        maxHeight: 480,
      },
      contentPolicy: "boundedExpansion",
    },
  });

  widgetRegistry.register({
    id: "clipboard",
    title: "Clipboard",
    icon: "clipboard",
    priority: 80,
    canActivate: () => true,
    lifecycle: "ready",
    sizing: {
      compact: {
        minWidth: 220,
        preferredWidth: 240,
        maxWidth: 300,
        minHeight: 38,
        preferredHeight: 38,
        maxHeight: 44,
      },
      expanded: {
        minWidth: 500,
        preferredWidth: 540,
        maxWidth: 600,
        minHeight: 340,
        preferredHeight: 380,
        maxHeight: 480,
      },
      contentPolicy: "boundedExpansion",
    },
  });

  widgetRegistry.register({
    id: "media",
    title: "Media",
    icon: "media",
    priority: 70,
    canActivate: () => true,
    lifecycle: "ready",
    sizing: {
      compact: {
        minWidth: 240,
        preferredWidth: 280,
        maxWidth: 380,
        minHeight: 38,
        preferredHeight: 38,
        maxHeight: 44,
      },
      expanded: {
        minWidth: 460,
        preferredWidth: 500,
        maxWidth: 540,
        minHeight: 280,
        preferredHeight: 340,
        maxHeight: 400,
      },
      contentPolicy: "boundedExpansion",
    },
  });

  widgetRegistry.register({
    id: "system",
    title: "System",
    icon: "system",
    priority: 50,
    canActivate: () => true,
    lifecycle: "ready",
    sizing: {
      compact: {
        minWidth: 200,
        preferredWidth: 220,
        maxWidth: 260,
        minHeight: 38,
        preferredHeight: 38,
        maxHeight: 44,
      },
      expanded: {
        minWidth: 480,
        preferredWidth: 520,
        maxWidth: 560,
        minHeight: 320,
        preferredHeight: 360,
        maxHeight: 420,
      },
      contentPolicy: "fixed",
    },
  });

  widgetRegistry.register({
    id: "launcher",
    title: "Launcher",
    icon: "launcher",
    priority: 45,
    canActivate: () => true,
    lifecycle: "ready",
    sizing: {
      compact: {
        minWidth: 220,
        preferredWidth: 240,
        maxWidth: 280,
        minHeight: 38,
        preferredHeight: 38,
        maxHeight: 44,
      },
      expanded: {
        minWidth: 480,
        preferredWidth: 520,
        maxWidth: 580,
        minHeight: 320,
        preferredHeight: 360,
        maxHeight: 440,
      },
      contentPolicy: "fixed",
    },
  });

  widgetRegistry.register({
    id: "timer",
    title: "Timer",
    icon: "timer",
    priority: 40,
    canActivate: () => true,
    lifecycle: "ready",
    sizing: {
      compact: {
        minWidth: 200,
        preferredWidth: 240,
        maxWidth: 280,
        minHeight: 38,
        preferredHeight: 38,
        maxHeight: 44,
      },
      expanded: {
        minWidth: 460,
        preferredWidth: 500,
        maxWidth: 540,
        minHeight: 320,
        preferredHeight: 360,
        maxHeight: 420,
      },
      contentPolicy: "fixed",
    },
  });

  widgetRegistry.register({
    id: "reminder",
    title: "Reminders",
    icon: "reminders",
    priority: 35,
    canActivate: () => true,
    lifecycle: "ready",
    sizing: {
      compact: {
        minWidth: 220,
        preferredWidth: 240,
        maxWidth: 280,
        minHeight: 38,
        preferredHeight: 38,
        maxHeight: 44,
      },
      expanded: {
        minWidth: 480,
        preferredWidth: 520,
        maxWidth: 560,
        minHeight: 320,
        preferredHeight: 360,
        maxHeight: 420,
      },
      contentPolicy: "boundedExpansion",
    },
  });

  widgetRegistry.register({
    id: "settings",
    title: "Settings",
    icon: "settings",
    priority: 10,
    canActivate: () => true,
    lifecycle: "ready",
    sizing: {
      compact: {
        minWidth: 220,
        preferredWidth: 240,
        maxWidth: 280,
        minHeight: 38,
        preferredHeight: 38,
        maxHeight: 44,
      },
      expanded: {
        minWidth: 500,
        preferredWidth: 540,
        maxWidth: 620,
        minHeight: 360,
        preferredHeight: 400,
        maxHeight: 480,
      },
      contentPolicy: "fixed",
    },
  });
}
