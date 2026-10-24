import { useEffect, useRef } from "react";
import { createDomainStore } from "../../state/createStore.ts";

export const MIN_SETTINGS_HEIGHT = 200;
export const MAX_SETTINGS_HEIGHT = 480;
export const SETTINGS_CHROME_HEIGHT = 72; // Tab navigation bar + internal container padding

export interface SettingsTabHeightState {
  height: number;
}

export const settingsTabHeightStore = createDomainStore<SettingsTabHeightState>({ height: 360 });

export function setSettingsTabHeight(rawHeight: number): void {
  const clamped = Math.max(MIN_SETTINGS_HEIGHT, Math.min(MAX_SETTINGS_HEIGHT, Math.round(rawHeight)));
  const current = settingsTabHeightStore.getState().height;
  if (Math.abs(current - clamped) >= 4) {
    settingsTabHeightStore.setState({ height: clamped });
  }
}

export function useSettingsTabAutoHeight(activeTab: string, language?: string) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measureAndSet = () => {
      // Measure natural child tab content height, avoiding stale flex parent height
      const child = el.firstElementChild as HTMLElement | null;
      const contentH = child ? child.scrollHeight : el.scrollHeight;

      const totalH = Math.max(
        MIN_SETTINGS_HEIGHT,
        Math.min(MAX_SETTINGS_HEIGHT, contentH + SETTINGS_CHROME_HEIGHT)
      );
      setSettingsTabHeight(totalH);
    };

    measureAndSet();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        measureAndSet();
      });
      ro.observe(el);
      const child = el.firstElementChild;
      if (child) {
        ro.observe(child);
      }
      return () => {
        ro.disconnect();
      };
    }
  }, [activeTab, language]);

  return contentRef;
}
