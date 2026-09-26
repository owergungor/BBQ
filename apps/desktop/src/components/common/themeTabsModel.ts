/**
 * BBQ v2.1 — Theme Tabs Model & Contracts (Phase 9)
 */

import type { ThemePreference } from "@bbq/types";

export type ThemeIconName = "monitor" | "sun" | "moon";

export interface ThemeOption {
  id: ThemePreference;
  label: string;
  icon: ThemeIconName;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "system", label: "System", icon: "monitor" },
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
];
