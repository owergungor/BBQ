import React, { useState, useEffect, useCallback } from "react";
import { updateSettingsBatch, useSettingsState } from "../../state/settingsState.ts";
import type { ThemePreference } from "@bbq/types";

interface OnboardingStep {
  badge: string;
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  tip?: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    badge: "Welcome",
    icon: "🏝️",
    title: "Welcome to BBQ",
    subtitle: "Your Desktop Productivity Island",
    description:
      "BBQ transforms the top margin of your screen into an intelligent, hardware-accelerated command surface. It sits quietly as a compact pill and expands smoothly into productivity tools whenever you need them.",
    tip: "Tip: Hover or click the island at the top of your monitor to get started.",
  },
  {
    badge: "Architecture",
    icon: "✨",
    title: "Dynamic Island States",
    subtitle: "Fluid, GPU-accelerated interaction",
    description:
      "In idle mode, BBQ displays glanceable compact indicators for active media, running timers, clipboard preview, and system health. Dragging files over the island instantly turns it into a Drop Zone.",
    tip: "All animations are GPU-accelerated using transform and opacity for zero layout thrashing.",
  },
  {
    badge: "Navigation",
    icon: "🚀",
    title: "Global Hotkey & Launcher",
    subtitle: "Instant access from anywhere",
    description:
      "Press Ctrl+Space (or Cmd+Space on macOS) globally to summon BBQ forward. The unified search launcher lets you open apps, files, or trigger system actions with deterministic keyboard speed.",
    tip: "You can customize the global hotkey combination anytime in Preferences.",
  },
  {
    badge: "Privacy",
    icon: "🛡️",
    title: "100% Local & Privacy-First",
    subtitle: "Zero telemetry, zero tracking",
    description:
      "Your data never leaves your computer. Everything is stored locally in an embedded SQLite database. Features like Clipboard History are strictly opt-in and disabled by default.",
    tip: "Disabling clipboard history immediately purges stored clips from the database.",
  },
  {
    badge: "Customization",
    icon: "🎨",
    title: "Tailor Your Experience",
    subtitle: "Theme, accessibility & indicators",
    description:
      "BBQ supports System, Dark, and Light themes, along with dedicated Reduced Motion mode for accessibility. You can prioritize which compact indicators appear first in your island pill.",
    tip: "Use the theme buttons below to set your preferred appearance now:",
  },
  {
    badge: "Ready",
    icon: "🎉",
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

  const handleFinish = useCallback(async () => {
    await updateSettingsBatch({
      first_run_completed: true,
      onboarding_completed: true,
    });
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
    <div
      className="bbq-onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-desc"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="bbq-onboarding-card"
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "var(--bbq-surface)",
          border: "1px solid var(--bbq-border)",
          borderRadius: "14px",
          padding: "24px",
          color: "var(--bbq-text)",
          boxShadow: "var(--bbq-shadow)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        {/* Step Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--bbq-accent)",
              background: "var(--bbq-surface-elevated)",
              padding: "3px 8px",
              borderRadius: "6px",
              border: "1px solid var(--bbq-border)",
            }}
          >
            {step.badge} • {currentStep + 1} / {ONBOARDING_STEPS.length}
          </span>
          <button
            type="button"
            onClick={handleFinish}
            style={{
              background: "none",
              border: "none",
              color: "var(--bbq-text-muted)",
              fontSize: "12px",
              cursor: "pointer",
              padding: "4px",
            }}
            title="Skip onboarding (Esc)"
            aria-label="Skip welcome tour"
          >
            Skip Tour (Esc)
          </button>
        </div>

        {/* Step Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "28px" }} aria-hidden="true">
              {step.icon}
            </span>
            <div>
              <h2
                id="onboarding-title"
                style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "var(--bbq-text)" }}
              >
                {step.title}
              </h2>
              <span style={{ fontSize: "12px", color: "var(--bbq-text-muted)" }}>
                {step.subtitle}
              </span>
            </div>
          </div>

          <p
            id="onboarding-desc"
            style={{
              fontSize: "13px",
              lineHeight: 1.5,
              color: "var(--bbq-text)",
              margin: "6px 0 0 0",
            }}
          >
            {step.description}
          </p>

          {/* Interactive Personalization controls on step 4 */}
          {currentStep === 4 && (
            <div
              style={{
                display: "flex",
                gap: "8px",
                marginTop: "8px",
                padding: "8px",
                background: "var(--bbq-surface-elevated)",
                borderRadius: "8px",
                border: "1px solid var(--bbq-border)",
              }}
            >
              {(["system", "dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleThemeSelect(t)}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--bbq-border)",
                    background:
                      settings.theme === t ? "var(--bbq-accent)" : "transparent",
                    color: settings.theme === t ? "#ffffff" : "var(--bbq-text)",
                    fontSize: "11px",
                    fontWeight: 500,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                  aria-label={`Select ${t} theme`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {step.tip && (
            <div
              style={{
                marginTop: "6px",
                padding: "8px 10px",
                borderRadius: "6px",
                background: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                fontSize: "11px",
                color: "var(--bbq-accent)",
              }}
            >
              {step.tip}
            </div>
          )}
        </div>

        {/* Step Progress Dots */}
        <div
          style={{ display: "flex", justifyContent: "center", gap: "6px", margin: "4px 0" }}
          aria-hidden="true"
        >
          {ONBOARDING_STEPS.map((_, idx) => (
            <div
              key={idx}
              style={{
                width: idx === currentStep ? "18px" : "6px",
                height: "6px",
                borderRadius: "3px",
                background:
                  idx === currentStep ? "var(--bbq-accent)" : "var(--bbq-surface-elevated)",
                border: "1px solid var(--bbq-border)",
                transition: "width 0.2s ease, background 0.2s ease",
              }}
            />
          ))}
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "12px",
            borderTop: "1px solid var(--bbq-border)",
          }}
        >
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 0}
            style={{
              padding: "8px 14px",
              borderRadius: "6px",
              border: "1px solid var(--bbq-border)",
              background: "var(--bbq-surface-elevated)",
              color: "var(--bbq-text)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: currentStep === 0 ? "not-allowed" : "pointer",
              opacity: currentStep === 0 ? 0.4 : 1,
            }}
            aria-label="Previous step"
          >
            ← Back
          </button>

          <button
            type="button"
            onClick={handleNext}
            style={{
              padding: "8px 18px",
              borderRadius: "6px",
              border: "none",
              background: "var(--bbq-accent)",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
            }}
            aria-label={isLastStep ? "Finish onboarding" : "Next step"}
          >
            {isLastStep ? "Get Started 🚀" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
};
