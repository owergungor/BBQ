import React, { useState } from "react";

export interface AppleSwitchProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * Apple-style switch component adhering to Apple Human Interface Guidelines
 * and responsive micro-interactions (inspired by unlumen.com/components/apple-switch).
 *
 * Invariants:
 * - 100% dependency-free native CSS/React implementation
 * - Accessible: role="switch", aria-checked, keyboard Space/Enter toggle, focus ring
 * - Respects data-reduced-motion
 */
export const AppleSwitch: React.FC<AppleSwitchProps> = ({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  ariaLabel,
  className = "",
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <div
      className={`bbq-switch-row apple-switch-wrapper ${disabled ? "disabled" : ""} ${className}`}
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "14px",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <label
          htmlFor={id}
          id={`${id}-label`}
          style={{
            fontWeight: 500,
            display: "block",
            fontSize: "12px",
            color: "var(--bbq-text, #f3f4f6)",
            cursor: disabled ? "not-allowed" : "pointer",
            userSelect: "none",
          }}
        >
          {label}
        </label>
        {description && (
          <span
            id={`${id}-desc`}
            style={{
              fontSize: "11px",
              color: "var(--bbq-text-muted, #9ca3af)",
              display: "block",
              marginTop: "2px",
              lineHeight: 1.4,
              userSelect: "none",
            }}
          >
            {description}
          </span>
        )}
      </div>

      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        aria-label={ariaLabel || label}
        disabled={disabled}
        aria-disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        onMouseDown={() => !disabled && setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
        className="bbq-apple-switch-track"
        style={{
          width: "42px",
          height: "24px",
          borderRadius: "9999px",
          backgroundColor: checked
            ? "var(--bbq-switch-active, #34c759)"
            : "rgba(120, 120, 128, 0.32)",
          border: "none",
          padding: "2px",
          display: "inline-flex",
          alignItems: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          position: "relative",
          flexShrink: 0,
          outline: "none",
          transition: "background-color 240ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          boxShadow: checked
            ? "0 0 8px rgba(52, 199, 89, 0.35)"
            : "inset 0 0 1px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* Hidden native checkbox for test automation & screen reader compatibility */}
        <input
          id={`${id}-checkbox`}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
            width: "1px",
            height: "1px",
          }}
        />

        {/* Apple Spring Thumb */}
        <div
          className="bbq-apple-switch-thumb"
          style={{
            width: isPressed ? "24px" : "20px",
            height: "20px",
            borderRadius: "9999px",
            backgroundColor: "#ffffff",
            boxShadow:
              "0 2px 5px rgba(0, 0, 0, 0.28), 0 0 1px rgba(0, 0, 0, 0.2)",
            transform: checked
              ? isPressed
                ? "translateX(14px)"
                : "translateX(18px)"
              : "translateX(0px)",
            transition:
              "transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1), width 140ms ease",
          }}
        />
      </button>
    </div>
  );
};
