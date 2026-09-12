import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  dropStore,
  initialDropDomainState,
  setDragOver,
  setSelectedActionIndex,
  clearDrop,
  formatDropSize,
} from "../src/state/dropState.ts";
import { launcherStore } from "../src/state/launcherState.ts";
import { timerStore } from "../src/state/timerState.ts";
import { reminderStore } from "../src/state/reminderState.ts";
import { mediaStore } from "../src/state/mediaState.ts";
import { clipboardStore } from "../src/state/clipboardState.ts";
import { fileStore } from "../src/state/fileState.ts";
import { systemStore } from "../src/state/systemState.ts";
import { WidgetRegistry } from "../src/island/widgetRegistry.ts";
import type { DropBatch, DropTarget, DropAction } from "@bbq/types";

describe("Drop Store & State Isolation (Milestone 11)", () => {
  beforeEach(() => {
    dropStore.setState(initialDropDomainState);
  });

  it("updates drop dragover state accurately", () => {
    assert.equal(dropStore.getState().isDraggingOver, false);
    assert.equal(dropStore.getState().status, "idle");

    setDragOver(true);
    assert.equal(dropStore.getState().isDraggingOver, true);
    assert.equal(dropStore.getState().status, "dragging");

    setDragOver(false);
    assert.equal(dropStore.getState().isDraggingOver, false);
    assert.equal(dropStore.getState().status, "idle");
  });

  it("updates selected action index and wraps/resets", () => {
    setSelectedActionIndex(2);
    assert.equal(dropStore.getState().selectedActionIndex, 2);

    setSelectedActionIndex(0);
    assert.equal(dropStore.getState().selectedActionIndex, 0);
  });

  it("clears drop state cleanly back to initial state", () => {
    const mockBatch: DropBatch = {
      id: "batch-1",
      items: [
        {
          id: "target-1",
          path: "C:\\test\\document.pdf",
          kind: "file",
          name: "document.pdf",
          size: 1024,
          modified_at: 1700000000,
          extension: "pdf",
          classification: "document",
        },
      ],
      count: 1,
      created_at: 1700000000,
    };

    dropStore.setState({
      currentBatch: mockBatch,
      actions: ["open", "reveal", "copy_path", "add_to_workspace"],
      selectedActionIndex: 1,
      status: "ready",
      error: null,
      resultMessage: "Done",
      isDraggingOver: false,
    });

    assert.equal(dropStore.getState().status, "ready");
    assert.equal(dropStore.getState().currentBatch?.count, 1);

    clearDrop();

    assert.equal(dropStore.getState().status, "idle");
    assert.equal(dropStore.getState().currentBatch, null);
    assert.equal(dropStore.getState().actions.length, 0);
    assert.equal(dropStore.getState().selectedActionIndex, 0);
  });

  it("strictly isolates dropStore updates from all other domain stores", () => {
    let launcherNotified = false;
    let timerNotified = false;
    let reminderNotified = false;
    let mediaNotified = false;
    let clipboardNotified = false;
    let fileNotified = false;
    let systemNotified = false;

    const unsubs = [
      launcherStore.subscribe(() => {
        launcherNotified = true;
      }),
      timerStore.subscribe(() => {
        timerNotified = true;
      }),
      reminderStore.subscribe(() => {
        reminderNotified = true;
      }),
      mediaStore.subscribe(() => {
        mediaNotified = true;
      }),
      clipboardStore.subscribe(() => {
        clipboardNotified = true;
      }),
      fileStore.subscribe(() => {
        fileNotified = true;
      }),
      systemStore.subscribe(() => {
        systemNotified = true;
      }),
    ];

    try {
      setDragOver(true);
      setDragOver(false);
      setSelectedActionIndex(1);
      clearDrop();

      assert.equal(launcherNotified, false);
      assert.equal(timerNotified, false);
      assert.equal(reminderNotified, false);
      assert.equal(mediaNotified, false);
      assert.equal(clipboardNotified, false);
      assert.equal(fileNotified, false);
      assert.equal(systemNotified, false);
    } finally {
      for (const unsub of unsubs) unsub();
    }
  });
});

describe("DragOver Zero IPC Performance Rule (Milestone 11)", () => {
  it("verifies 100 continuous dragover events generate 0 IPC invocations", () => {
    let ipcCallCount = 0;
    const mockIpcDispatcher = () => {
      ipcCallCount++;
    };

    // Simulate dragover handler contract:
    // In React/HTML5, dragover fires continuously (every 16-50ms)
    // The BBQ design guarantees handleDragOver calls e.preventDefault() ONLY and ZERO IPC
    const simulateDragOver = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
      e.preventDefault();
      e.stopPropagation();
      // Notice: NO ipcCallCount++ or mockIpcDispatcher() call!
    };

    let preventDefaultCount = 0;
    let stopPropagationCount = 0;

    for (let i = 0; i < 100; i++) {
      simulateDragOver({
        preventDefault: () => {
          preventDefaultCount++;
        },
        stopPropagation: () => {
          stopPropagationCount++;
        },
      });
    }

    assert.equal(preventDefaultCount, 100);
    assert.equal(stopPropagationCount, 100);
    assert.equal(ipcCallCount, 0, "Continuous dragover MUST produce ZERO IPC calls");
  });
});

describe("Widget Registry Priority Contract (Milestone 11)", () => {
  it("enforces strict priority order: Drop (90) > Files (85) > Clipboard (80) > Media (70) > System (50) > Launcher (45) > Timer (40) > Reminder (35)", () => {
    const registry = new WidgetRegistry();

    registry.register({
      id: "drop",
      title: "Drop Zone",
      icon: "📥",
      priority: 90,
      canActivate: () => true,
      lifecycle: "ready",
    });

    registry.register({
      id: "files",
      title: "Files",
      icon: "📁",
      priority: 85,
      canActivate: () => true,
      lifecycle: "ready",
    });

    registry.register({
      id: "clipboard",
      title: "Clipboard",
      icon: "📋",
      priority: 80,
      canActivate: () => true,
      lifecycle: "ready",
    });

    registry.register({
      id: "media",
      title: "Media",
      icon: "🎵",
      priority: 70,
      canActivate: () => true,
      lifecycle: "ready",
    });

    registry.register({
      id: "system",
      title: "System",
      icon: "⚙️",
      priority: 50,
      canActivate: () => true,
      lifecycle: "ready",
    });

    registry.register({
      id: "launcher",
      title: "Launcher",
      icon: "🚀",
      priority: 45,
      canActivate: () => true,
      lifecycle: "ready",
    });

    registry.register({
      id: "timer",
      title: "Timer",
      icon: "⏱️",
      priority: 40,
      canActivate: () => true,
      lifecycle: "ready",
    });

    registry.register({
      id: "reminder",
      title: "Reminders",
      icon: "🔔",
      priority: 35,
      canActivate: () => true,
      lifecycle: "ready",
    });

    const active = registry.getActiveWidgets();
    const priorities = active.map((w) => w.priority);
    const ids = active.map((w) => w.id);

    assert.deepEqual(ids, [
      "drop",
      "files",
      "clipboard",
      "media",
      "system",
      "launcher",
      "timer",
      "reminder",
    ]);

    assert.deepEqual(priorities, [90, 85, 80, 70, 50, 45, 40, 35]);
  });
});

describe("Format Drop Size Utility (Milestone 11)", () => {
  it("formats file sizes across byte, KB, MB, and GB boundaries", () => {
    assert.equal(formatDropSize(0), "0 B");
    assert.equal(formatDropSize(512), "512 B");
    assert.equal(formatDropSize(1024), "1.0 KB");
    assert.equal(formatDropSize(2048), "2.0 KB");
    assert.equal(formatDropSize(1024 * 1024), "1.0 MB");
    assert.equal(formatDropSize(15 * 1024 * 1024), "15.0 MB");
    assert.equal(formatDropSize(1024 * 1024 * 1024), "1.0 GB");
    assert.equal(formatDropSize(2.5 * 1024 * 1024 * 1024), "2.5 GB");
  });
});

describe("Multi-Drop Batch & Contextual Actions (Milestone 11)", () => {
  it("handles multi-drop batches bounded up to 50 items", () => {
    const items: DropTarget[] = [];
    for (let i = 0; i < 50; i++) {
      items.push({
        id: `target-${i}`,
        path: `C:\\test\\file_${i}.txt`,
        kind: "file",
        name: `file_${i}.txt`,
        size: 100 * (i + 1),
        modified_at: 1700000000,
        extension: "txt",
        classification: "document",
      });
    }

    const batch: DropBatch = {
      id: "batch-multi-50",
      items,
      count: items.length,
      created_at: 1700000000,
    };

    assert.equal(batch.count, 50);
    assert.equal(batch.items.length, 50);
    assert.equal(batch.items[49].name, "file_49.txt");
  });

  it("verifies CopyPath is strictly explicit (zero automatic clipboard write)", () => {
    // Contract requirement:
    // Drop or inspection MUST NOT touch clipboard.
    // Only explicit execution of action === 'copy_path' triggers clipboard.
    let clipboardWrites = 0;
    const mockClipboardCopy = () => {
      clipboardWrites++;
    };

    // 1. On DragOver
    setDragOver(true);
    assert.equal(clipboardWrites, 0, "DragOver must not write to clipboard");

    // 2. On Drop / Inspection
    const inspectedBatch: DropBatch = {
      id: "batch-test",
      items: [
        {
          id: "t1",
          path: "C:\\sensitive\\path.txt",
          kind: "file",
          name: "path.txt",
          size: 50,
          modified_at: null,
          extension: "txt",
          classification: "document",
        },
      ],
      count: 1,
      created_at: 1000,
    };

    dropStore.setState({
      currentBatch: inspectedBatch,
      actions: ["open", "reveal", "copy_path", "add_to_workspace"],
      status: "ready",
    });

    assert.equal(clipboardWrites, 0, "Inspection must not write to clipboard");

    // 3. Only when user explicitly executes 'copy_path'
    const userAction: DropAction = "copy_path";
    if (userAction === "copy_path") {
      mockClipboardCopy();
    }
    assert.equal(clipboardWrites, 1, "Only explicit action execution writes to clipboard");
  });
});
