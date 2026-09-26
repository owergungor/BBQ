import React from "react";

export type IconName =
  | "media"
  | "stats"
  | "timer"
  | "stopwatch"
  | "clipboard"
  | "files"
  | "file-text"
  | "file-image"
  | "file-audio"
  | "file-video"
  | "file-archive"
  | "file-code"
  | "coffee"
  | "palm"
  | "lock"
  | "launcher"
  | "reminders"
  | "bell"
  | "calendar"
  | "globe"
  | "power"
  | "settings"
  | "drop"
  | "play"
  | "pause"
  | "skip-next"
  | "skip-back"
  | "volume"
  | "volume-mute"
  | "shuffle"
  | "repeat"
  | "cpu"
  | "ram"
  | "gpu"
  | "battery"
  | "battery-charging"
  | "network"
  | "search"
  | "chevron-down"
  | "chevron-up"
  | "close"
  | "check"
  | "copy"
  | "pin"
  | "trash"
  | "external-link"
  | "sparkles"
  | "refresh"
  | "sun"
  | "moon"
  | "monitor";

interface IconProps {
  name: IconName;
  size?: number | string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 16,
  strokeWidth = 1.75,
  className = "",
  style,
  "aria-hidden": ariaHidden = true,
}) => {
  const commonProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `bbq-icon bbq-icon-${name} ${className}`.trim(),
    style,
    "aria-hidden": ariaHidden,
  };

  switch (name) {
    case "media":
      return (
        <svg {...commonProps}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );

    case "stats":
      return (
        <svg {...commonProps}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      );

    case "timer":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );

    case "clipboard":
      return (
        <svg {...commonProps}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        </svg>
      );

    case "files":
      return (
        <svg {...commonProps}>
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </svg>
      );

    case "launcher":
    case "search":
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );

    case "bell":
    case "reminders":
      return (
        <svg {...commonProps}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );

    case "calendar":
      return (
        <svg {...commonProps}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );

    case "globe":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );

    case "power":
      return (
        <svg {...commonProps}>
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
          <line x1="12" y1="2" x2="12" y2="12" />
        </svg>
      );

    case "settings":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );

    case "drop":
      return (
        <svg {...commonProps}>
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        </svg>
      );

    case "play":
      return (
        <svg {...commonProps}>
          <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
        </svg>
      );

    case "pause":
      return (
        <svg {...commonProps}>
          <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
          <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
        </svg>
      );

    case "skip-next":
      return (
        <svg {...commonProps}>
          <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
          <line x1="19" y1="5" x2="19" y2="19" strokeWidth={2.5} />
        </svg>
      );

    case "skip-back":
      return (
        <svg {...commonProps}>
          <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" />
          <line x1="5" y1="19" x2="5" y2="5" strokeWidth={2.5} />
        </svg>
      );

    case "volume":
      return (
        <svg {...commonProps}>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      );

    case "volume-mute":
      return (
        <svg {...commonProps}>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      );

    case "shuffle":
      return (
        <svg {...commonProps}>
          <polyline points="16 3 21 3 21 8" />
          <line x1="4" y1="20" x2="21" y2="3" />
          <polyline points="21 16 21 21 16 21" />
          <line x1="15" y1="15" x2="21" y2="21" />
          <line x1="4" y1="4" x2="9" y2="9" />
        </svg>
      );

    case "repeat":
      return (
        <svg {...commonProps}>
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      );

    case "cpu":
      return (
        <svg {...commonProps}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" />
          <line x1="20" y1="15" x2="23" y2="15" />
          <line x1="1" y1="9" x2="4" y2="9" />
          <line x1="1" y1="15" x2="4" y2="15" />
        </svg>
      );

    case "ram":
      return (
        <svg {...commonProps}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="6" y1="5" x2="6" y2="10" />
          <line x1="10" y1="5" x2="10" y2="10" />
          <line x1="14" y1="5" x2="14" y2="10" />
          <line x1="18" y1="5" x2="18" y2="10" />
          <line x1="6" y1="14" x2="6" y2="19" />
          <line x1="10" y1="14" x2="10" y2="19" />
          <line x1="14" y1="14" x2="14" y2="19" />
          <line x1="18" y1="14" x2="18" y2="19" />
        </svg>
      );

    case "gpu":
      return (
        <svg {...commonProps}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <circle cx="8" cy="10" r="3" />
          <circle cx="16" cy="10" r="3" />
          <line x1="6" y1="17" x2="6" y2="21" />
          <line x1="18" y1="17" x2="18" y2="21" />
        </svg>
      );

    case "battery":
      return (
        <svg {...commonProps}>
          <rect x="1" y="6" width="18" height="12" rx="2" ry="2" />
          <line x1="23" y1="11" x2="23" y2="13" />
        </svg>
      );

    case "battery-charging":
      return (
        <svg {...commonProps}>
          <rect x="1" y="6" width="18" height="12" rx="2" ry="2" />
          <line x1="23" y1="11" x2="23" y2="13" />
          <polyline points="11 7 8 12 12 12 9 17" />
        </svg>
      );

    case "network":
      return (
        <svg {...commonProps}>
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth={2.5} />
        </svg>
      );

    case "chevron-down":
      return (
        <svg {...commonProps}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      );

    case "chevron-up":
      return (
        <svg {...commonProps}>
          <polyline points="18 15 12 9 6 15" />
        </svg>
      );

    case "close":
      return (
        <svg {...commonProps}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );

    case "check":
      return (
        <svg {...commonProps}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );

    case "copy":
      return (
        <svg {...commonProps}>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );

    case "pin":
      return (
        <svg {...commonProps}>
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
      );

    case "trash":
      return (
        <svg {...commonProps}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );

    case "external-link":
      return (
        <svg {...commonProps}>
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      );

    case "sparkles":
      return (
        <svg {...commonProps}>
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
        </svg>
      );

    case "refresh":
      return (
        <svg {...commonProps}>
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      );

    case "stopwatch":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="14" r="8" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="14" x2="15" y2="11" />
        </svg>
      );

    case "file-text":
      return (
        <svg {...commonProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );

    case "file-image":
      return (
        <svg {...commonProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <circle cx="10" cy="13" r="2" />
          <path d="m20 17-3.5-3.5a2 2 0 0 0-2.8 0L9 18" />
        </svg>
      );

    case "file-audio":
      return (
        <svg {...commonProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M9 18V13l6-1.5V16" />
          <circle cx="8" cy="18" r="1.5" />
          <circle cx="14" cy="16" r="1.5" />
        </svg>
      );

    case "file-video":
      return (
        <svg {...commonProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <polygon points="10 11 15 14 10 17 10 11" fill="currentColor" />
        </svg>
      );

    case "file-archive":
      return (
        <svg {...commonProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="10" y1="12" x2="10" y2="12.01" strokeWidth={2.5} />
          <line x1="10" y1="15" x2="10" y2="15.01" strokeWidth={2.5} />
          <rect x="8" y="18" width="4" height="2" />
        </svg>
      );

    case "file-code":
      return (
        <svg {...commonProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <polyline points="10 13 8 15 10 17" />
          <polyline points="14 13 16 15 14 17" />
        </svg>
      );

    case "coffee":
      return (
        <svg {...commonProps}>
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
      );

    case "palm":
      return (
        <svg {...commonProps}>
          <path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h11z" />
          <path d="M13 7.14A5.82 5.82 0 0 1 17.5 5c2.76 0 5 2.24 5 5h-10" />
          <path d="M12 12v9" strokeWidth={2} />
          <path d="M9 21h6" />
        </svg>
      );

    case "lock":
      return (
        <svg {...commonProps}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );

    case "sun":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      );

    case "moon":
      return (
        <svg {...commonProps}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );

    case "monitor":
      return (
        <svg {...commonProps}>
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );

    default:
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
};
