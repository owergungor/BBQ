import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { DropAction, DropBatch, DropActionResult } from "@bbq/types";
import {
  dropStore,
  initialDropDomainState,
  executeDropAction,
} from "../src/state/dropState.ts";
import { bbqCommands } from "../src/ipc/commands.ts";

describe("BBQ v2.1 — Phase 4 Drop Shelf Drag-Out Contracts", () => {
  beforeEach(() => {
    dropStore.setState(initialDropDomainState);
  });

  it("ensures 'drag_out' is recognized as a valid DropAction union member", () => {
    const action: DropAction = "drag_out";
    assert.equal(action, "drag_out");
  });

  it("executes drag_out action through bbqCommands.dropExecute without content reading", async () => {
    let executedAction: DropAction | null = null;
    let targetBatchId: string | null = null;
    let targetItemId: string | undefined = undefined;

    const originalDropExecute = bbqCommands.dropExecute;
    bbqCommands.dropExecute = async (batchId, action, targetId) => {
      targetBatchId = batchId;
      executedAction = action;
      targetItemId = targetId;
      return {
        batch_id: batchId,
        action,
        success_count: 1,
        failure_count: 0,
        errors: [],
        message: "Drag-out completed",
      };
    };

    try {
      const mockBatch: DropBatch = {
        id: "batch-101",
        items: [
          {
            id: "target-1",
            path: "C:\\projects\\sample.pdf",
            kind: "file",
            name: "sample.pdf",
            size: 1048576,
            modified_at: 1700000000,
            extension: "pdf",
            classification: "document",
          },
        ],
        created_at: 1700000000,
        count: 1,
      };

      dropStore.setState({
        currentBatch: mockBatch,
        actions: ["open", "reveal", "copy_path", "drag_out"],
        status: "ready",
      });

      const res = await executeDropAction("drag_out", "target-1");
      assert.ok(res);
      assert.equal(res?.success_count, 1);
      assert.equal(res?.failure_count, 0);
      assert.equal(executedAction, "drag_out");
      assert.equal(targetBatchId, "batch-101");
      assert.equal(targetItemId, "target-1");
      assert.equal(dropStore.getState().status, "completed");
    } finally {
      bbqCommands.dropExecute = originalDropExecute;
    }
  });

  it("handles multi-item drag-out without targetId", async () => {
    let executedAction: DropAction | null = null;
    let targetBatchId: string | null = null;

    const originalDropExecute = bbqCommands.dropExecute;
    bbqCommands.dropExecute = async (batchId, action) => {
      targetBatchId = batchId;
      executedAction = action;
      return {
        batch_id: batchId,
        action,
        success_count: 3,
        failure_count: 0,
        errors: [],
        message: "Dragged out 3 items",
      };
    };

    try {
      const mockBatch: DropBatch = {
        id: "batch-multi",
        items: [
          { id: "1", path: "C:\\f1.txt", kind: "file", name: "f1.txt", size: 10, classification: "document" },
          { id: "2", path: "C:\\f2.txt", kind: "file", name: "f2.txt", size: 20, classification: "document" },
          { id: "3", path: "C:\\f3.txt", kind: "file", name: "f3.txt", size: 30, classification: "document" },
        ],
        created_at: 1700000000,
        count: 3,
      };

      dropStore.setState({
        currentBatch: mockBatch,
        actions: ["open", "reveal", "copy_path", "drag_out"],
        status: "ready",
      });

      const res = await executeDropAction("drag_out");
      assert.ok(res);
      assert.equal(res?.success_count, 3);
      assert.equal(executedAction, "drag_out");
      assert.equal(targetBatchId, "batch-multi");
    } finally {
      bbqCommands.dropExecute = originalDropExecute;
    }
  });

  it("properly flags error status if drag-out encounters failures", async () => {
    const originalDropExecute = bbqCommands.dropExecute;
    bbqCommands.dropExecute = async (batchId, action) => {
      return {
        batch_id: batchId,
        action,
        success_count: 0,
        failure_count: 1,
        errors: ["File not found"],
        message: "Drag-out failed for 1 item",
      };
    };

    try {
      const mockBatch: DropBatch = {
        id: "batch-err",
        items: [
          { id: "1", path: "C:\\missing.txt", kind: "file", name: "missing.txt", size: 0, classification: "unknown" },
        ],
        created_at: 1700000000,
        count: 1,
      };

      dropStore.setState({
        currentBatch: mockBatch,
        actions: ["drag_out"],
        status: "ready",
      });

      const res = await executeDropAction("drag_out");
      assert.ok(res);
      assert.equal(res?.failure_count, 1);
      assert.equal(dropStore.getState().status, "error");
      assert.equal(dropStore.getState().error, "Drag-out failed for 1 item");
    } finally {
      bbqCommands.dropExecute = originalDropExecute;
    }
  });
});
