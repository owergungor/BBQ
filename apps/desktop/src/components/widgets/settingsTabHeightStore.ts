import { useEffect, useRef } from "react";
import { createDomainStore } from "../../state/createStore.ts";

export const MIN_SETTINGS_HEIGHT = 200;
export const MAX_SETTINGS_HEIGHT = 480;

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
      // Measure natural content height
      const contentH = el.scrollHeight;

      // Calculate vertical chrome (island frame, tablist, footer, paddings)
      let chromeH = 116;
      if (typeof window !== "undefined") {
        const shell = el.closest(".bbq-island-shell");
        if (shell) {
          const shellH = shell.getBoundingClientRect().height;
          const panelH = el.getBoundingClientRect().height;
          if (shellH > 0 && panelH > 0 && shellH > panelH) {
            const diff = Math.round(shellH - panelH);
            if (diff >= 60 && diff <= 180) {
              chromeH = diff;
            }
          }
        }
      }

      const totalH = Math.max(MIN_SETTINGS_HEIGHT, Math.min(MAX_SETTINGS_HEIGHT, contentH + chromeH));
      setSettingsTabHeight(totalH);
    };

    measureAndSet();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        measureAndSet();
      });
      ro.observe(el);
      return () => {
        ro.disconnect();
      };
    }
  }, [activeTab, language]);

  return contentRef;
}
