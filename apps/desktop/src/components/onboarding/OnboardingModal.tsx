import React, { useState, useEffect, useCallback } from "react";
import { updateSettingsBatch, useSettingsState } from "../../state/settingsState.ts";
import { islandRuntime } from "../../island/IslandRuntime.ts";
import type { ThemePreference } from "@bbq/types";
import { Icon, type IconName } from "../common/Icon.tsx";

interface OnboardingStep {
  badge: string;
  icon: IconName;
  title: string;
  subtitle: string;
  description: string;
  tip?: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    badge: "Welcome",
    icon: "sparkles",
    title: "Welcome to BBQ",
    subtitle: "Your Desktop Productivity Island",
    description:
      "BBQ transforms the top margin of your screen into an intelligent, hardware-accelerated command surface. It sits quietly as a compact pill and expands smoothly into productivity tools whenever you need them.",
    tip: "Tip: Hover or click the island at the top of your monitor to get started.",
  },
  {
    badge: "Architecture",
    icon: "refresh",
    title: "Dynamic Island States",
    subtitle: "Fluid, GPU-accelerated interaction",
    description:
      "In idle mode, BBQ displays glanceable compact indicators for active media, running timers, clipboard preview, and system health. Dragging files over the island instantly turns it into a Drop Zone.",
    tip: "All animations are GPU-accelerated using transform and opacity for zero layout thrashing.",
  },
  {
    badge: "Navigation",
    icon: "launcher",
    title: "Global Hotkey & Launcher",
    subtitle: "Instant access from anywhere",
    description:
      "Press Ctrl+Space (or Cmd+Space on macOS) globally to summon BBQ forward. The unified search launcher lets you open apps, files, or trigger system actions with deterministic keyboard speed.",
    tip: "You can customize the global hotkey combination anytime in Preferences.",
  },
  {
    badge: "Privacy",
    icon: "lock",
    title: "100% Local & Privacy-First",
    subtitle: "Zero telemetry, zero tracking",
    description:
      "Your data never leaves your computer. Everything is stored locally in an embedded SQLite database. Features like Clipboard History are strictly opt-in and disabled by default.",
    tip: "Disabling clipboard history immediately purges stored clips from the database.",
  },
  {
    badge: "Customization",
    icon: "settings",
    title: "Tailor Your Experience",
    subtitle: "Theme, accessibility & indicators",
    description:
      "BBQ supports System, Dark, and Light themes, along with dedicated Reduced Motion mode for accessibility. You can prioritize which compact indicators appear first in your island pill.",
    tip: "Use the theme buttons below to set your preferred appearance now:",
  },
  {
    badge: "Ready",
    icon: "check",
    title: "You're Ready to Launch!",
    subtitle: "Welcome to BBQ Production Edition",
    description:
      "You now have a fast, discreet productivity island at your command. Enjoy your streamlined desktop workflow!",
    tip: "You can replay this welcome tour anytime from the Preferences widget.",
  },
];

export interface OnboardingModalProps {
  onClose?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onClose }) => {
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

  const step = ONBOARDING_STEPS[currentStep] ?? ONBOARDING_STEPS[0];
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
            title="Skip onboarding (Esc)"
            aria-label="Skip welcome tour"
          >
            Skip Tour (Esc)
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
            <div className="bbq-onboarding-theme-group" role="group" aria-label="Theme selection">
              {(["system", "dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleThemeSelect(t)}
                  className={`bbq-onboarding-theme-btn ${settings.theme === t ? "active" : ""}`}
                  aria-label={`Select ${t} theme`}
                >
                  {t}
                </button>
              ))}
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
            aria-label="Previous step"
          >
            ← Back
          </button>

          <button
            type="button"
            className="bbq-btn bbq-btn-primary bbq-onboarding-next-btn"
            onClick={handleNext}
            aria-label={isLastStep ? "Finish onboarding" : "Next step"}
          >
            {isLastStep ? "Get Started" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
};
