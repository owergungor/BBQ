import React, { useState, useEffect, useCallback } from "react";
import { updateSettingsBatch, useSettingsState } from "../../state/settingsState.ts";
import { islandRuntime } from "../../island/IslandRuntime.ts";
import { escapeManager, EscapePriority } from "../../island/escapeManager.ts";
import type { ThemePreference } from "@bbq/types";
import { Icon, type IconName } from "../common/Icon.tsx";
import { useTranslation } from "../../i18n/index.ts";

const ONBOARDING_STEPS = [
  {
    key: "step1",
    badge: "Welcome",
    icon: "sparkles" as IconName,
    fallbackTitle: "Welcome to BBQ",
    fallbackSubtitle: "Your Desktop Productivity Island",
    fallbackDescription: "BBQ transforms the top margin of your screen into an intelligent command surface.",
  },
  {
    key: "step2",
    badge: "Architecture",
    icon: "refresh" as IconName,
    fallbackTitle: "Atoll Architecture",
    fallbackSubtitle: "Fluid, GPU-accelerated interaction",
    fallbackDescription: "In idle mode, BBQ displays glanceable compact indicators for active media, running timers, clipboard preview, and system health.",
    fallbackTip: "All animations are GPU-accelerated using transform and opacity for zero layout thrashing.",
  },
  {
    key: "step3",
    badge: "Navigation",
    icon: "launcher" as IconName,
    fallbackTitle: "Global Hotkey & Launcher",
    fallbackSubtitle: "Instant access from anywhere",
    fallbackDescription: "Press Ctrl+Space (or Cmd+Space on macOS) globally to summon BBQ forward.",
    fallbackTip: "You can customize the global hotkey combination anytime in Preferences.",
  },
  {
    key: "step4",
    badge: "Privacy",
    icon: "lock" as IconName,
    fallbackTitle: "100% Local & Privacy-First",
    fallbackSubtitle: "Zero telemetry, zero tracking",
    fallbackDescription: "Your data never leaves your computer. Everything is stored locally in an embedded SQLite database.",
    fallbackTip: "Disabling clipboard history immediately purges stored clips from the database.",
  },
  {
    key: "step5",
    badge: "Customization",
    icon: "settings" as IconName,
    fallbackTitle: "Tailor Your Experience",
    fallbackSubtitle: "Theme, accessibility & indicators",
    fallbackDescription: "BBQ supports System, Dark, and Light themes, along with dedicated Reduced Motion mode for accessibility.",
    fallbackTip: "Use the theme buttons below to set your preferred appearance now:",
  },
  {
    key: "step6",
    badge: "Ready",
    icon: "check" as IconName,
    fallbackTitle: "You're Ready to Launch!",
    fallbackSubtitle: "Welcome to BBQ Production Edition",
    fallbackDescription: "You now have a fast, discreet productivity island at your command. Enjoy your streamlined desktop workflow!",
    fallbackTip: "You can replay this welcome tour anytime from the Preferences widget.",
  },
] as const;

export interface OnboardingModalProps {
  onClose?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const { settings } = useSettingsState();

  useEffect(() => {
    islandRuntime.transitionTo("Expanded", "event");
  }, []);

  const handleFinish = useCallback(async () => {
    await updateSettingsBatch({
      first_run_completed: true,
      onboarding_completed: true,
    });
    await islandRuntime.transitionTo("Idle", "event");
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  const handleNext = useCallback(async () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      await handleFinish();
    }
  }, [currentStep, handleFinish]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  // Escape handling: skips/finishes onboarding with modal priority
  useEffect(() => {
    const unregister = escapeManager.register(() => {
      handleFinish();
      return true; // Consumed: prevent parent island collapse
    }, EscapePriority.MODAL);

    return unregister;
  }, [handleFinish]);

  // Keyboard navigation: Escape skips, Enter/Space advances, ArrowLeft/Right steps
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleFinish();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleBack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handleBack, handleFinish]);

  const currentStepDef = ONBOARDING_STEPS[currentStep] || ONBOARDING_STEPS[0];
  const step = {
    badge: t(`onboarding.tour.${currentStepDef.key}.badge`) || currentStepDef.badge,
    icon: currentStepDef.icon,
    title: t(`onboarding.tour.${currentStepDef.key}.title`) || currentStepDef.fallbackTitle,
    subtitle: t(`onboarding.tour.${currentStepDef.key}.subtitle`) || currentStepDef.fallbackSubtitle,
    description:
      t(`onboarding.tour.${currentStepDef.key}.description`) ||
      currentStepDef.fallbackDescription,
    tip: t(`onboarding.tour.${currentStepDef.key}.tip`) || ("fallbackTip" in currentStepDef ? currentStepDef.fallbackTip : undefined),
  };

  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  const handleThemeSelect = async (theme: ThemePreference) => {
    await updateSettingsBatch({ theme });
  };

  return (
    <div className="bbq-onboarding-wrapper" role="presentation">
      <div
        className="bbq-onboarding-island"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-desc"
      >
        {/* Step Top Bar */}
        <div className="bbq-onboarding-top-bar">
          <div className="bbq-onboarding-badge-group">
            <span className="bbq-onboarding-icon" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center" }}>
              <Icon name={step.icon} size={14} />
            </span>
            <span className="bbq-onboarding-badge">
              {step.badge} • {currentStep + 1} / {ONBOARDING_STEPS.length}
            </span>
          </div>
          <button
            type="button"
            className="bbq-onboarding-skip-btn"
            onClick={handleFinish}
            title={t("onboarding.skipTour") || "Skip Tour (Esc)"}
            aria-label={t("onboarding.skipTour") || "Skip welcome tour"}
          >
            {t("onboarding.skipTour") || "Skip Tour (Esc)"}
          </button>
        </div>

        {/* Step Content */}
        <div className="bbq-onboarding-body">
          <div className="bbq-onboarding-headings">
            <h2 id="onboarding-title" className="bbq-onboarding-title">
              {step.title}
            </h2>
            <span className="bbq-onboarding-subtitle">{step.subtitle}</span>
          </div>

          <p id="onboarding-desc" className="bbq-onboarding-desc">
            {step.description}
          </p>

          {/* Interactive Personalization controls on step 4 */}
          {currentStep === 4 && (
            <div className="bbq-onboarding-theme-group" role="group" aria-label={t("settings.appearance.themeMode") || "Theme selection"}>
              {(["system", "dark", "light"] as const).map((th) => {
                const label =
                  th === "system"
                    ? t("settings.appearance.themeSystem") || "System"
                    : th === "dark"
                    ? t("settings.appearance.themeDark") || "Dark"
                    : t("settings.appearance.themeLight") || "Light";
                return (
                  <button
                    key={th}
                    type="button"
                    onClick={() => handleThemeSelect(th)}
                    className={`bbq-onboarding-theme-btn ${settings.theme === th ? "active" : ""}`}
                    aria-label={label}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {step.tip && (
            <div className="bbq-onboarding-tip">
              {step.tip}
            </div>
          )}
        </div>

        {/* Step Progress Dots */}
        <div className="bbq-onboarding-dots" aria-hidden="true">
          {ONBOARDING_STEPS.map((_, idx) => (
            <div
              key={idx}
              className={`bbq-onboarding-dot ${idx === currentStep ? "active" : ""}`}
            />
          ))}
        </div>

        {/* Action Footer */}
        <div className="bbq-onboarding-footer">
          <button
            type="button"
            className="bbq-btn bbq-onboarding-back-btn"
            onClick={handleBack}
            disabled={currentStep === 0}
            aria-label={t("onboarding.back") || "Previous step"}
          >
            {t("onboarding.back") || "← Back"}
          </button>

          <button
            type="button"
            className="bbq-btn bbq-btn-primary bbq-onboarding-next-btn"
            onClick={handleNext}
            aria-label={isLastStep ? (t("onboarding.getStarted") || "Finish onboarding") : (t("onboarding.next") || "Next step")}
          >
            {isLastStep ? (t("onboarding.getStarted") || "Get Started") : (t("onboarding.next") || "Next →")}
          </button>
        </div>
      </div>
    </div>
  );
};
