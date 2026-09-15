import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  settingsStore,
  defaultSettings,
  updateSettingsBatch,
} from "../src/state/settingsState.ts";
import { bbqCommands } from "../src/ipc/commands.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("BBQ — Milestone 18: Production Packaging, Onboarding & First-Run Experience", () => {
  beforeEach(() => {
    // Mock Tauri IPC command for headless node testing
    bbqCommands.updateSettings = async () => true;

    settingsStore.setState({
      settings: { ...defaultSettings },
      isLoading: false,
      error: null,
    });
  });

  describe("1. First-Run & Onboarding State Defaults", () => {
    it("initializes fresh installations with first_run_completed = false and onboarding_completed = false", () => {
      const { settings } = settingsStore.getState();
      assert.equal(settings.first_run_completed, false);
      assert.equal(settings.onboarding_completed, false);
    });

    it("persists onboarding completion when dismissed or completed", async () => {
      await updateSettingsBatch({
        first_run_completed: true,
        onboarding_completed: true,
      });

      const { settings } = settingsStore.getState();
      assert.equal(settings.first_run_completed, true);
      assert.equal(settings.onboarding_completed, true);
    });

    it("allows replaying the welcome tour from preferences", async () => {
      await updateSettingsBatch({
        first_run_completed: true,
        onboarding_completed: true,
      });

      // User triggers "Replay Welcome Tour"
      await updateSettingsBatch({ onboarding_completed: false });

      const { settings } = settingsStore.getState();
      assert.equal(settings.first_run_completed, true);
      assert.equal(settings.onboarding_completed, false);
    });
  });

  describe("2. Onboarding Modal Structure & Accessibility", () => {
    const modalPath = path.resolve(
      __dirname,
      "../src/components/onboarding/OnboardingModal.tsx"
    );
    const modalCode = fs.readFileSync(modalPath, "utf-8");

    it("defines the 6 structured onboarding tour steps", () => {
      const expectedSteps = [
        "Welcome",
        "Architecture",
        "Navigation",
        "Privacy",
        "Customization",
        "Ready",
      ];
      for (const step of expectedSteps) {
        assert.ok(
          modalCode.includes(`badge: "${step}"`),
          `OnboardingModal missing step ${step}`
        );
      }
    });

    it("implements keyboard navigation (Escape to skip, Enter/Arrows to navigate)", () => {
      assert.ok(
        modalCode.includes('e.key === "Escape"'),
        "OnboardingModal missing Escape key handler to skip"
      );
      assert.ok(
        modalCode.includes('e.key === "Enter"'),
        "OnboardingModal missing Enter key handler to advance"
      );
      assert.ok(
        modalCode.includes('e.key === "ArrowRight"'),
        "OnboardingModal missing ArrowRight key handler"
      );
      assert.ok(
        modalCode.includes('e.key === "ArrowLeft"'),
        "OnboardingModal missing ArrowLeft key handler"
      );
    });

    it("uses standard accessibility attributes for dialog overlay", () => {
      assert.ok(
        modalCode.includes('role="dialog"'),
        "OnboardingModal must define role=dialog"
      );
      assert.ok(
        modalCode.includes('aria-modal="true"'),
        "OnboardingModal must define aria-modal=true"
      );
      assert.ok(
        modalCode.includes('aria-labelledby="onboarding-title"'),
        "OnboardingModal must define aria-labelledby"
      );
      assert.ok(
        modalCode.includes('aria-describedby="onboarding-desc"'),
        "OnboardingModal must define aria-describedby"
      );
    });
  });

  describe("3. Settings Widget About & Identity", () => {
    const settingsPath = path.resolve(
      __dirname,
      "../src/components/widgets/SettingsWidget.tsx"
    );
    const settingsCode = fs.readFileSync(settingsPath, "utf-8");

    it("declares the About tab in SettingsWidget", () => {
      assert.ok(
        settingsCode.includes('{ id: "about", label: "About" }'),
        "SettingsWidget missing About tab declaration"
      );
    });

    it("displays version 1.2.0 and MIT License in About section", () => {
      assert.ok(
        settingsCode.includes("Version 1.2.0 (Production Edition)"),
        "SettingsWidget missing version 1.2.0 badge"
      );
      assert.ok(
        settingsCode.includes("MIT License (Open Source)"),
        "SettingsWidget missing MIT license description"
      );
    });

    it("provides Replay Welcome Tour action in About section", () => {
      assert.ok(
        settingsCode.includes("Replay Welcome Tour"),
        "SettingsWidget missing Replay Welcome Tour button"
      );
      assert.ok(
        settingsCode.includes("onboarding_completed: false"),
        "SettingsWidget missing onboarding_completed reset action"
      );
    });
  });
});
