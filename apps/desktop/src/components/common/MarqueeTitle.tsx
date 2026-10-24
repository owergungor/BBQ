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
  const [durationSec, setDurationSec] = useState(8);

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
      return;
    }

    const clientW = container.clientWidth;
    const scrollW = textEl.scrollWidth;

    if (scrollW > clientW + 1) {
      // 24px per second continuous smooth pace
      const duration = Math.max(6, Math.round(scrollW / 24));
      setDurationSec(duration);
      setIsOverflowing(true);
    } else {
      setIsOverflowing(false);
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
    "--bbq-marquee-duration": `${durationSec}s`,
  } as React.CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`bbq-marquee-container ${className}`.trim()}
      title={title || text}
      style={dynamicStyle}
    >
      <div className={`bbq-marquee-track ${isOverflowing ? "is-scrolling" : ""}`.trim()}>
        <span
          ref={textRef}
          className={`bbq-marquee-text ${isOverflowing ? "is-scrolling" : ""}`.trim()}
        >
          {text}
        </span>
        {isOverflowing && (
          <>
            <span
              className="bbq-marquee-spacer"
              aria-hidden="true"
              style={{ width: "36px", display: "inline-block", flexShrink: 0 }}
            />
            <span
              className="bbq-marquee-text is-scrolling"
              aria-hidden="true"
            >
              {text}
            </span>
          </>
        )}
      </div>
    </div>
  );
};
