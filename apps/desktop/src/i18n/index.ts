import type { SupportedLanguage } from "@bbq/types";
import { useSettingsState } from "../state/settingsState.ts";

import enLocale from "./locales/en.json" with { type: "json" };
import esLocale from "./locales/es.json" with { type: "json" };
import frLocale from "./locales/fr.json" with { type: "json" };
import deLocale from "./locales/de.json" with { type: "json" };
import trLocale from "./locales/tr.json" with { type: "json" };

export type { SupportedLanguage };

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["en", "es", "fr", "de", "tr"];

export const LOCALES: Record<SupportedLanguage, typeof enLocale> = {
  en: enLocale,
  es: esLocale as typeof enLocale,
  fr: frLocale as typeof enLocale,
  de: deLocale as typeof enLocale,
  tr: trLocale as typeof enLocale,
};

/**
 * Standard accessible language dropdown options with national flag and localized language label.
 * Sourced dynamically from locale dictionaries to preserve zero hardcoded non-ASCII tokens in TypeScript.
 */
export const LANGUAGE_OPTIONS: Array<{ value: SupportedLanguage; label: string }> = [
  { value: "en", label: enLocale.languages.en },
  { value: "es", label: enLocale.languages.es },
  { value: "fr", label: enLocale.languages.fr },
  { value: "de", label: enLocale.languages.de },
  { value: "tr", label: enLocale.languages.tr },
];

/**
 * Resolves a nested translation key (e.g. "settings.appearance.themeMode") with English fallback.
 */
function resolveNestedKey(obj: unknown, path: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let curr: unknown = obj;
  for (const part of parts) {
    if (curr && typeof curr === "object" && part in curr) {
      curr = (curr as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof curr === "string" ? curr : undefined;
}

/**
 * Interpolates variables formatted as {{key}} or {key}.
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}|\{\s*(\w+)\s*\}/g, (_, k1, k2) => {
    const key = k1 || k2;
    return key in params ? String(params[key]) : "";
  });
}

/**
 * Global pure translation lookup function.
 * Automatically falls back to English when a translation key is missing.
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
  langOverride?: SupportedLanguage
): string {
  const lang: SupportedLanguage =
    langOverride && SUPPORTED_LANGUAGES.includes(langOverride) ? langOverride : "en";
  const dict = LOCALES[lang] || enLocale;

  let text = resolveNestedKey(dict, key);
  if (!text && lang !== "en") {
    text = resolveNestedKey(enLocale, key);
  }

  // Graceful fallback to the last segment of the key if entirely missing
  if (!text) {
    const fallback = key.split(".").pop() || key;
    return interpolate(fallback, params);
  }

  return interpolate(text, params);
}

/**
 * React Hook for component translation with automatic re-rendering on language change.
 */
export function useTranslation() {
  const { settings } = useSettingsState();
  const currentLang = (
    settings.language && SUPPORTED_LANGUAGES.includes(settings.language)
      ? settings.language
      : "en"
  ) as SupportedLanguage;

  return {
    t: (key: string, params?: Record<string, string | number>) => t(key, params, currentLang),
    currentLanguage: currentLang,
    languageOptions: LANGUAGE_OPTIONS,
  };
}

/**
 * Formats a date or timestamp according to the selected locale.
 */
export function formatLocaleDate(
  dateInput: number | Date | string,
  lang: SupportedLanguage = "en",
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    const d = typeof dateInput === "object" && dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return new Intl.DateTimeFormat(lang, options || { dateStyle: "medium" }).format(d);
  } catch {
    return String(dateInput);
  }
}

/**
 * Formats a number according to the selected locale.
 */
export function formatLocaleNumber(
  num: number,
  lang: SupportedLanguage = "en",
  options?: Intl.NumberFormatOptions
): string {
  try {
    return new Intl.NumberFormat(lang, options).format(num);
  } catch {
    return String(num);
  }
}

/**
 * Formats bytes into a human-readable string (KB, MB, GB).
 */
export function formatBytes(bytes: number, lang: SupportedLanguage = "en"): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, i);
  const formatted = formatLocaleNumber(Math.round(val * 10) / 10, lang, {
    minimumFractionDigits: i === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
  return `${formatted} ${units[i]}`;
}
