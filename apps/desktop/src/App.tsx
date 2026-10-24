import React, { useEffect } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { Island } from "./components/island/Island.tsx";
import { OnboardingModal } from "./components/onboarding/OnboardingModal.tsx";
import { UpdateNotificationDialog } from "./components/updater/UpdateNotificationDialog.tsx";
import { useSettingsState, initSettingsState } from "./state/settingsState.ts";
import { mediaStore } from "./state/mediaState.ts";
import { timerStore } from "./state/timerState.ts";
import { launcherStore } from "./state/launcherState.ts";
import { islandRuntime } from "./island/IslandRuntime.ts";

if (typeof window !== "undefined" && import.meta.env.DEV) {
  (window as unknown as { __BBQ_DEV__?: unknown }).__BBQ_DEV__ = {
    mediaStore,
    timerStore,
    launcherStore,
    islandRuntime,
  };
}

export const App: React.FC = () => {
  const onboardingCompleted = useSettingsState((s) => s.settings.onboarding_completed);
  const isLoaded = useSettingsState((s) => s.isLoaded);

  useEffect(() => {
    initSettingsState();
  }, []);

  // Check if this window was opened as a dedicated update dialog window
  const isDedicatedUpdateWindow =
    typeof window !== "undefined" && window.location.search.includes("window=update");

  if (isDedicatedUpdateWindow) {
    return (
      <ErrorBoundary>
        <div className="bbq-app-root">
          <UpdateNotificationDialog
            standalone
            onClose={() => {
              if (typeof window !== "undefined" && typeof window.close === "function") {
                window.close();
              }
            }}
          />
        </div>
      </ErrorBoundary>
    );
  }

  // While awaiting settings from backend/cache, render transparent shell to avoid onboarding flash
  if (!isLoaded) {
    return <div className="bbq-app-root" style={{ background: "transparent" }} />;
  }

  return (
    <ErrorBoundary>
      <div className="bbq-app-root">
        {onboardingCompleted ? (
          <Island />
        ) : (
          <OnboardingModal />
        )}
      </div>
    </ErrorBoundary>
  );
};
