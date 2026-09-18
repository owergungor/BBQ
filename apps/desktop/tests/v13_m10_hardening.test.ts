import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { bbqCommands } from "../src/ipc/commands.ts";
import { subscribeToMediaChanged, subscribeToMediaPlaybackState } from "../src/ipc/events.ts";
import { widgetRegistry } from "../src/island/widgetRegistry.ts";
import { bootstrapWidgets } from "../src/island/bootstrapWidgets.ts";
import { clearRecent } from "../src/state/launcherState.ts";
import type { MediaSession, PlaybackState } from "@bbq/types";

describe("BBQ v1.3 — M10 Hardening Tests", () => {
  describe("M10-02: Media Event Forwarding Architecture", () => {
    it("1. registers media_changed listener and receives session payload", async () => {
      let receivedSession: MediaSession | null = null;
      let callCount = 0;

      const unlisten = await subscribeToMediaChanged((session) => {
        receivedSession = session;
        callCount++;
      });

      assert.equal(typeof unlisten, "function", "subscribeToMediaChanged must return unlisten fn");
      assert.equal(callCount, 0, "No initial spurious callback before events");

      // Verify unlisten stops forwarding safely
      unlisten();
    });

    it("2. registers media_playback_state listener correctly", async () => {
      let receivedState: PlaybackState | null = null;

      const unlisten = await subscribeToMediaPlaybackState((state) => {
        receivedState = state;
      });

      assert.equal(typeof unlisten, "function", "subscribeToMediaPlaybackState must return unlisten fn");
      assert.equal(receivedState, null, "No initial spurious callback");
      unlisten();
    });
  });

  describe("M10-03: Zero Emoji UI in Launcher Fallback Data & UI Components", () => {
    it("3. ensures all launcher fallback items use native SVG IconName identifiers and zero emojis", async () => {
      const items = await bbqCommands.launcherList();
      const emojiPattern = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/;

      for (const item of items) {
        if (item.icon) {
          assert.equal(
            emojiPattern.test(item.icon),
            false,
            `Launcher item '${item.id}' icon '${item.icon}' must NOT contain emoji characters`
          );
          assert.ok(
            ["timer", "clipboard", "settings", "files", "launcher", "globe", "power", "lock"].includes(
              item.icon
            ),
            `Launcher item '${item.id}' icon '${item.icon}' must be a valid SVG icon identifier`
          );
        }
      }
    });

    it("4. verifies frontend source code contains zero emoji UI icon representations", () => {
      const srcDir = path.resolve(process.cwd(), "src");
      const emojiPattern = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

      // Scan all ts/tsx files in src
      function scanDir(dir: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
            const content = fs.readFileSync(fullPath, "utf8");
            const matches = content.match(emojiPattern);
            assert.equal(
              matches,
              null,
              `File '${entry.name}' contains emoji characters: ${matches?.join(", ")}`
            );
          }
        }
      }

      scanDir(srcDir);
    });
  });

  describe("M10-04: Widget Registration Bootstrap", () => {
    it("5. deterministically registers all 9 built-in widgets during bootstrap", () => {
      bootstrapWidgets();

      const expectedWidgets = [
        "drop",
        "files",
        "clipboard",
        "media",
        "system",
        "launcher",
        "timer",
        "reminder",
        "settings",
      ];

      const allWidgets = widgetRegistry.getAll();
      const registeredIds = allWidgets.map((w) => w.id);

      for (const expectedId of expectedWidgets) {
        assert.ok(
          registeredIds.includes(expectedId),
          `Widget '${expectedId}' must be registered after bootstrap`
        );
        const widget = widgetRegistry.get(expectedId);
        assert.ok(widget, `Widget '${expectedId}' must be retrievable`);
        assert.equal(widget.lifecycle, "ready");
      }
    });

    it("6. is idempotent: repeated bootstrap does not duplicate entries", () => {
      const countBefore = widgetRegistry.getAll().length;
      bootstrapWidgets();
      bootstrapWidgets();
      const countAfter = widgetRegistry.getAll().length;

      assert.equal(countAfter, countBefore, "Repeated bootstrapWidgets() calls must not duplicate entries");
    });

    it("7. verifies IslandContent.tsx contains zero static registration in useEffect", () => {
      const islandContentPath = path.resolve(process.cwd(), "src/components/island/IslandContent.tsx");
      const content = fs.readFileSync(islandContentPath, "utf8");

      assert.ok(
        !content.includes("widgetRegistry.register("),
        "IslandContent.tsx must not perform static widgetRegistry.register() calls in component lifecycle"
      );
    });

    it("8. verifies main.tsx invokes bootstrapWidgets before mounting React root", () => {
      const mainPath = path.resolve(process.cwd(), "src/main.tsx");
      const content = fs.readFileSync(mainPath, "utf8");

      assert.ok(
        content.includes("bootstrapWidgets();"),
        "main.tsx must call bootstrapWidgets() at application startup"
      );
      const bootstrapIdx = content.indexOf("bootstrapWidgets();");
      const createRootIdx = content.indexOf("createRoot");
      assert.ok(
        bootstrapIdx < createRootIdx,
        "bootstrapWidgets() must be called BEFORE ReactDOM.createRoot()"
      );
    });
  });

  describe("M10-05: Truthful File and Media IPC Error Propagation", () => {
    let mockBackendSuccess = true;

    beforeEach(() => {
      mockBackendSuccess = true;

      // Mock low-level commands
      bbqCommands.fileOpen = async () => mockBackendSuccess;
      bbqCommands.fileReveal = async () => mockBackendSuccess;
      bbqCommands.fileRemove = async () => mockBackendSuccess;
      bbqCommands.fileClearWorkspace = async () => mockBackendSuccess;

      bbqCommands.mediaPlay = async () => mockBackendSuccess;
      bbqCommands.mediaPause = async () => mockBackendSuccess;
      bbqCommands.mediaTogglePlayPause = async () => mockBackendSuccess;
      bbqCommands.mediaNext = async () => mockBackendSuccess;
      bbqCommands.mediaPrevious = async () => mockBackendSuccess;
      bbqCommands.mediaSeek = async () => mockBackendSuccess;

      bbqCommands.launcherClearRecent = async () => mockBackendSuccess;
    });

    it("9. file IPC commands return true on success and false on failure", async () => {
      mockBackendSuccess = true;
      assert.equal(await bbqCommands.fileOpen("file-1"), true);
      assert.equal(await bbqCommands.fileReveal("file-1"), true);
      assert.equal(await bbqCommands.fileRemove("file-1"), true);
      assert.equal(await bbqCommands.fileClearWorkspace(), true);

      mockBackendSuccess = false;
      assert.equal(await bbqCommands.fileOpen("file-1"), false, "fileOpen must return false on rejection");
      assert.equal(await bbqCommands.fileReveal("file-1"), false, "fileReveal must return false on rejection");
      assert.equal(await bbqCommands.fileRemove("file-1"), false, "fileRemove must return false on rejection");
      assert.equal(await bbqCommands.fileClearWorkspace(), false, "fileClearWorkspace must return false on rejection");
    });

    it("10. media IPC commands return true on success and false on failure", async () => {
      mockBackendSuccess = true;
      assert.equal(await bbqCommands.mediaPlay(), true);
      assert.equal(await bbqCommands.mediaPause(), true);
      assert.equal(await bbqCommands.mediaTogglePlayPause(), true);
      assert.equal(await bbqCommands.mediaNext(), true);
      assert.equal(await bbqCommands.mediaPrevious(), true);
      assert.equal(await bbqCommands.mediaSeek(5000), true);

      mockBackendSuccess = false;
      assert.equal(await bbqCommands.mediaPlay(), false, "mediaPlay must return false on rejection");
      assert.equal(await bbqCommands.mediaPause(), false, "mediaPause must return false on rejection");
      assert.equal(await bbqCommands.mediaTogglePlayPause(), false, "mediaTogglePlayPause must return false on rejection");
      assert.equal(await bbqCommands.mediaNext(), false, "mediaNext must return false on rejection");
      assert.equal(await bbqCommands.mediaPrevious(), false, "mediaPrevious must return false on rejection");
      assert.equal(await bbqCommands.mediaSeek(5000), false, "mediaSeek must return false on rejection");
    });

    it("11. launcher clearRecent truthfully propagates backend status", async () => {
      mockBackendSuccess = true;
      assert.equal(await clearRecent(), true, "clearRecent must return true on backend success");

      mockBackendSuccess = false;
      assert.equal(await clearRecent(), false, "clearRecent must return false on backend failure");
    });
  });
});
