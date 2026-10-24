import React, { useRef, useState, useEffect, useCallback } from "react";
import { useSettingsState } from "../../state/settingsState.ts";

export interface MarqueeTitleProps {
  text: string;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}

export const MarqueeTitle: React.FC<MarqueeTitleProps> = ({
  text,
  className = "",
  title,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [overflowDistance, setOverflowDistance] = useState(0);
  const [durationSec, setDurationSec] = useState(6);

  const reducedMotionSetting = useSettingsState((s) => s.settings.reduced_motion);

  const checkOverflow = useCallback(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    // Check system prefers-reduced-motion as well as BBQ setting
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotionSetting || prefersReducedMotion) {
      setIsOverflowing(false);
      setOverflowDistance(0);
      return;
    }

    const clientW = container.clientWidth;
    const scrollW = textEl.scrollWidth;

    if (scrollW > clientW + 1) {
      const distance = scrollW - clientW;
      setOverflowDistance(distance);
      // Smooth pacing: ~24px per second plus 2.5s pause budget (minimum 4s)
      const duration = Math.max(4, Math.round(distance / 24) + 3);
      setDurationSec(duration);
      setIsOverflowing(true);
    } else {
      setIsOverflowing(false);
      setOverflowDistance(0);
    }
  }, [reducedMotionSetting]);

  useEffect(() => {
    checkOverflow();

    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      checkOverflow();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [text, checkOverflow]);

  const dynamicStyle = {
    ...style,
    "--bbq-marquee-distance": `-${overflowDistance}px`,
    "--bbq-marquee-duration": `${durationSec}s`,
  } as React.CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`bbq-marquee-container ${className}`.trim()}
      title={title || text}
      style={dynamicStyle}
    >
      <span
        ref={textEl => {
          textRef.current = textEl;
        }}
        className={`bbq-marquee-text ${isOverflowing ? "is-scrolling" : ""}`.trim()}
      >
        {text}
      </span>
    </div>
  );
};
