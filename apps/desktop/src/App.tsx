import React from "react";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { Island } from "./components/island/Island.tsx";
import { OnboardingModal } from "./components/onboarding/OnboardingModal.tsx";
import { useSettingsState } from "./state/settingsState.ts";

export const App: React.FC = () => {
  const onboardingCompleted = useSettingsState((s) => s.settings.onboarding_completed);

  return (
    <ErrorBoundary>
      <Island />
      {!onboardingCompleted && <OnboardingModal />}
    </ErrorBoundary>
  );
};
