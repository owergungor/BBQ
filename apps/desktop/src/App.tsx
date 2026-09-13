import React from "react";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { Island } from "./components/island/Island.tsx";
import { OnboardingModal } from "./components/onboarding/OnboardingModal.tsx";
import { useSettingsState } from "./state/settingsState.ts";
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
