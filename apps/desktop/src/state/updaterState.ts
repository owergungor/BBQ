import { createDomainStore } from "./createStore.ts";
import { APP_VERSION } from "../version.ts";
import { bbqCommands } from "../ipc/commands.ts";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "up_to_date"
  | "update_available"
  | "downloading"
  | "installing"
  | "success"
  | "error";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export interface UpdateProgress {
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
}

export interface UpdaterDomainState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  progress: UpdateProgress | null;
  error: string | null;
  lastCheckedAt: number | null;
  isModalOpen: boolean;
  isNotificationOpen: boolean;
}

export const initialUpdaterState: UpdaterDomainState = {
  status: "idle",
  currentVersion: APP_VERSION,
  availableVersion: null,
  releaseNotes: null,
  releaseDate: null,
  progress: null,
  error: null,
  lastCheckedAt: null,
  isModalOpen: false,
  isNotificationOpen: false,
};

export const updaterStore = createDomainStore<UpdaterDomainState>(initialUpdaterState);
export const useUpdaterState = updaterStore.useStore;

/**
 * Robust SemVer comparator.
 * Returns:
 *   > 0 if v1 > v2
 *   < 0 if v1 < v2
 *   0 if v1 === v2
 * Handles optional leading 'v', build metadata, and pre-release identifiers.
 */
export function compareSemVer(v1: string, v2: string): number {
  const clean1 = (v1 || "").trim().replace(/^v/i, "");
  const clean2 = (v2 || "").trim().replace(/^v/i, "");

  const [core1, pre1] = clean1.split("-");
  const [core2, pre2] = clean2.split("-");

  const parts1 = core1.split(".").map((p) => parseInt(p, 10) || 0);
  const parts2 = core2.split(".").map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  // If core SemVer numbers are equal, check pre-release
  // A version with pre-release is lower than one without (e.g. 3.0.0-rc1 < 3.0.0)
  if (pre1 && !pre2) return -1;
  if (!pre1 && pre2) return 1;
  if (pre1 && pre2) {
    if (pre1 > pre2) return 1;
    if (pre1 < pre2) return -1;
  }

  return 0;
}

/**
 * Returns true strictly if remoteVersion is higher than currentVersion.
 * Downgrades are never considered valid available updates.
 */
export function isUpdateAvailable(currentVersion: string, remoteVersion: string): boolean {
  return compareSemVer(remoteVersion, currentVersion) > 0;
}

// In-flight concurrency guard & active update handle
let isOperationActive = false;
// Note on Tauri Update Resource:
// @tauri-apps/plugin-updater returns an Update resource holding an allocated backend RID in Rust.
// Retaining it prevents duplicate network round-trips between check and download/install.
let pendingUpdateResource: any = null;

// Simulated updater adapter for testing and non-production environments
export interface UpdaterSimulatorOptions {
  mockAvailableVersion?: string | null;
  mockReleaseNotes?: string | null;
  mockReleaseDate?: string | null;
  simulateFailure?: "network" | "signature" | "timeout" | "malformed" | null;
  downloadDurationMs?: number;
}

let simulatedAdapter: UpdaterSimulatorOptions | null = null;

export function setSimulatedUpdater(options: UpdaterSimulatorOptions | null): void {
  simulatedAdapter = options;
}

export function getSimulatedUpdater(): UpdaterSimulatorOptions | null {
  return simulatedAdapter;
}

/**
 * Strips secrets, auth tokens, passwords, and sensitive paths from error messages.
 */
export function sanitizeUpdateErrorMessage(err: unknown): string {
  if (!err) return "An unexpected update error occurred.";
  const raw = err instanceof Error ? err.message : String(err);

  // Redact potential tokens, keys, URLs with credentials, passwords, and user paths
  return raw
    .replace(/(https?:\/\/[^:@]+:[^:@]+@)/gi, "https://[REDACTED]@")
    .replace(/(ghp_[a-zA-Z0-9]{20,})/gi, "[REDACTED_TOKEN]")
    .replace(/(bearer\s+[a-zA-Z0-9_\-.]+)/gi, "Bearer [REDACTED]")
    .replace(/(password=[^\s&]+)/gi, "password=[REDACTED]")
    .replace(/(tauri_signing_[a-zA-Z0-9_]+=[^\s]+)/gi, "[REDACTED_CREDENTIAL]")
    .replace(/([A-Za-z]:\\Users\\[^\\]+)/gi, "[USER_DIR]")
    .replace(/(\/(home|Users)\/[^/\s]+)/gi, "[USER_DIR]")
    .trim();
}

export const sanitizeErrorMessage = sanitizeUpdateErrorMessage;

/**
 * Checks for updates on demand.
 * Guaranteed:
 * - Never offers a downgrade.
 * - Prevents duplicate concurrent checks.
 * - Zero background polling.
 */
export async function checkForUpdates(forceCheck = false): Promise<boolean> {
  if (isOperationActive && !forceCheck) {
    return false;
  }

  const current = updaterStore.getState();
  if (current.status === "downloading" || current.status === "installing") {
    return false;
  }

  isOperationActive = true;
  updaterStore.setState({
    status: "checking",
    error: null,
    progress: null,
  });

  try {
    // Release previous pending update resource if any
    if (pendingUpdateResource && typeof pendingUpdateResource.close === "function") {
      try {
        await pendingUpdateResource.close();
      } catch {
        // Ignored
      }
      pendingUpdateResource = null;
    }

    // 1. Simulation adapter branch
    if (simulatedAdapter) {
      if (simulatedAdapter.simulateFailure === "timeout") {
        throw new Error("Update check timed out while connecting to release server.");
      }
      if (simulatedAdapter.simulateFailure === "network") {
        throw new Error("Network connection unavailable. Please check your internet connection.");
      }
      if (simulatedAdapter.simulateFailure === "signature") {
        throw new Error("Signature verification failed: release artifact untrusted or key mismatch.");
      }
      if (simulatedAdapter.simulateFailure === "malformed") {
        throw new Error("Malformed release metadata: unexpected schema format.");
      }

      const availableVer = simulatedAdapter.mockAvailableVersion;
      if (availableVer && isUpdateAvailable(APP_VERSION, availableVer)) {
        updaterStore.setState({
          status: "update_available",
          availableVersion: availableVer,
          releaseNotes: simulatedAdapter.mockReleaseNotes || "Bug fixes and performance improvements.",
          releaseDate: simulatedAdapter.mockReleaseDate || new Date().toISOString(),
          lastCheckedAt: Date.now(),
          error: null,
          isNotificationOpen: true,
        });
        return true;
      } else {
        updaterStore.setState({
          status: "up_to_date",
          availableVersion: null,
          releaseNotes: null,
          releaseDate: null,
          lastCheckedAt: Date.now(),
          error: null,
        });
        return false;
      }
    }

    // 2. Real Tauri Desktop environment
    let tauriUpdater: typeof import("@tauri-apps/plugin-updater");
    try {
      tauriUpdater = await import("@tauri-apps/plugin-updater");
    } catch {
      // In web browser test environments without Tauri runtime
      updaterStore.setState({
        status: "up_to_date",
        lastCheckedAt: Date.now(),
        error: null,
      });
      return false;
    }

    const update = await tauriUpdater.check();
    if (update && update.available) {
      if (isUpdateAvailable(APP_VERSION, update.version)) {
        pendingUpdateResource = update;
        updaterStore.setState({
          status: "update_available",
          availableVersion: update.version,
          releaseNotes: update.body || null,
          releaseDate: update.date || null,
          lastCheckedAt: Date.now(),
          error: null,
          isNotificationOpen: true,
        });
        return true;
      } else {
        // Remote version is <= current version (downgrade prevention)
        if (typeof update.close === "function") {
          try {
            await update.close();
          } catch {
            // Ignored
          }
        }
        updaterStore.setState({
          status: "up_to_date",
          availableVersion: null,
          releaseNotes: null,
          releaseDate: null,
          lastCheckedAt: Date.now(),
          error: null,
        });
        return false;
      }
    } else {
      updaterStore.setState({
        status: "up_to_date",
        availableVersion: null,
        releaseNotes: null,
        releaseDate: null,
        lastCheckedAt: Date.now(),
        error: null,
      });
      return false;
    }
  } catch (err) {
    const sanitized = sanitizeUpdateErrorMessage(err);
    updaterStore.setState({
      status: "error",
      error: sanitized,
      lastCheckedAt: Date.now(),
    });
    return false;
  } finally {
    isOperationActive = false;
  }
}

/**
 * Downloads and installs the pending update.
 * Requires explicit user confirmation by design.
 *
 * NOTE ON CANCELLATION:
 * The official Tauri v2 @tauri-apps/plugin-updater API downloads and installs
 * the update asynchronously in Rust without providing an AbortSignal or cancellation
 * handle. Once initiated, interrupting or discarding the JavaScript callback does
 * not stop Rust file I/O and could leave partially written files. Therefore, in-flight
 * cancellation is intentionally not supported to ensure update atomicity and integrity.
 */
export async function downloadAndInstallUpdate(): Promise<boolean> {
  const state = updaterStore.getState();
  if (state.status !== "update_available" || !state.availableVersion) {
    return false;
  }

  if (isOperationActive) {
    return false;
  }

  isOperationActive = true;

  updaterStore.setState({
    status: "downloading",
    progress: { downloadedBytes: 0, totalBytes: 0, percentage: 0 },
    error: null,
  });

  try {
    // 1. Simulation adapter branch
    if (simulatedAdapter) {
      const duration = simulatedAdapter.downloadDurationMs || 100;
      const steps = 4;
      const stepDuration = duration / steps;
      const totalBytes = 25_000_000;

      for (let i = 1; i <= steps; i++) {
        await new Promise((res) => setTimeout(res, stepDuration));
        const downloaded = Math.round((totalBytes / steps) * i);
        const percentage = Math.round((i / steps) * 100);

        updaterStore.setState({
          progress: {
            downloadedBytes: downloaded,
            totalBytes,
            percentage,
          },
        });
      }

      updaterStore.setState({
        status: "installing",
        progress: { downloadedBytes: totalBytes, totalBytes, percentage: 100 },
      });

      await new Promise((res) => setTimeout(res, 50));

      updaterStore.setState({
        status: "success",
        progress: null,
        error: null,
      });
      return true;
    }

    // 2. Real Tauri Desktop environment
    let updateToInstall = pendingUpdateResource;
    if (!updateToInstall) {
      const tauriUpdater = await import("@tauri-apps/plugin-updater");
      updateToInstall = await tauriUpdater.check();
    }

    if (!updateToInstall || !updateToInstall.available) {
      throw new Error("Update is no longer available.");
    }

    let totalLength = 0;
    let downloadedLength = 0;

    await updateToInstall.downloadAndInstall((event: any) => {
      if (event.event === "Started") {
        totalLength = event.data?.contentLength || 0;
        updaterStore.setState({
          status: "downloading",
          progress: {
            downloadedBytes: 0,
            totalBytes: totalLength,
            percentage: 0,
          },
        });
      } else if (event.event === "Progress") {
        downloadedLength += event.data?.chunkLength || 0;
        const pct = totalLength > 0 ? Math.min(100, Math.round((downloadedLength / totalLength) * 100)) : 0;
        updaterStore.setState({
          progress: {
            downloadedBytes: downloadedLength,
            totalBytes: totalLength,
            percentage: pct,
          },
        });
      } else if (event.event === "Finished") {
        updaterStore.setState({
          status: "installing",
        });
      }
    });

    pendingUpdateResource = null;

    updaterStore.setState({
      status: "success",
      progress: null,
      error: null,
    });
    return true;
  } catch (err) {
    const sanitized = sanitizeUpdateErrorMessage(err);
    updaterStore.setState({
      status: "error",
      error: sanitized,
      progress: null,
    });
    return false;
  } finally {
    isOperationActive = false;
  }
}

/**
 * Explains cancellation limitation honestly.
 * Tauri v2 updater does not support aborting an active download in Rust.
 * Returns false to indicate active downloads cannot be cancelled once started.
 */
export function cancelUpdate(): boolean {
  // Honest non-cancellation: Tauri v2 update downloads cannot be cancelled mid-stream.
  return false;
}

/**
 * Triggers application restart after successful installation.
 */
export async function restartApp(): Promise<void> {
  try {
    await bbqCommands.appRelaunch();
  } catch (err) {
    console.error("Failed to restart app:", err);
  }
}

/**
 * Opens the custom BBQ update modal.
 */
export function openUpdateModal(): void {
  updaterStore.setState({ isModalOpen: true });
}

/**
 * Closes the custom BBQ update modal if no in-flight download/install is active.
 */
export function closeUpdateModal(): boolean {
  const current = updaterStore.getState();
  if (current.status === "downloading" || current.status === "installing") {
    return false;
  }
  updaterStore.setState({ isModalOpen: false });
  return true;
}

/**
 * Opens the separate BBQ update notification window/dialog.
 */
export function openUpdateNotification(): void {
  updaterStore.setState({ isNotificationOpen: true });
}

/**
 * Closes the separate BBQ update notification window/dialog if no in-flight download/install is active.
 */
export function closeUpdateNotification(): boolean {
  const current = updaterStore.getState();
  if (current.status === "downloading" || current.status === "installing") {
    return false;
  }
  updaterStore.setState({ isNotificationOpen: false });
  return true;
}

/**
 * Resets updater state to idle.
 */
export function resetUpdaterState(): void {
  if (pendingUpdateResource && typeof pendingUpdateResource.close === "function") {
    try {
      pendingUpdateResource.close().catch(() => {});
    } catch {
      // Ignored
    }
    pendingUpdateResource = null;
  }

  updaterStore.setState({
    ...initialUpdaterState,
    currentVersion: APP_VERSION,
    isModalOpen: false,
    isNotificationOpen: false,
  });
}
