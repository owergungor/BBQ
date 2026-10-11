import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.tsx";
import { escapeManager, EscapePriority } from "../../island/escapeManager.ts";

export interface ThemeSelectOption<T extends string = string> {
  value: T;
  label: string;
}

export interface ThemeSelectProps<T extends string = string> {
  id: string;
  value: T;
  options: ThemeSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function ThemeSelect<T extends string = string>({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className = "",
  style,
}: ThemeSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(() => {
    const idx = options.findIndex((opt) => opt.value === value);
    return idx >= 0 ? idx : 0;
  });
  const [openUpward, setOpenUpward] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  // Sync highlighted index when value or open state changes
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, value, options]);

  // Compute fixed screen coordinates and collision check
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedHeight = Math.min(options.length * 32 + 12, 220);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const shouldOpenUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    setOpenUpward(shouldOpenUpward);

    const safeLeft = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
    if (shouldOpenUpward) {
      setMenuPosition({
        bottom: window.innerHeight - rect.top + 4,
        left: safeLeft,
        width: rect.width,
      });
    } else {
      setMenuPosition({
        top: rect.bottom + 4,
        left: safeLeft,
        width: rect.width,
      });
    }
  }, [options.length]);

  // Track position on open, scroll and resize
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Priority Escape coordination via centralized escapeManager
  useEffect(() => {
    if (!isOpen) return;

    const unregister = escapeManager.register(() => {
      setIsOpen(false);
      triggerRef.current?.focus();
      return true; // Consumed: prevent parent island collapse
    }, EscapePriority.DROPDOWN);

    return unregister;
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", handleClickOutside);
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }, [disabled]);

  const handleSelect = useCallback(
    (val: T) => {
      onChange(val);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      if (e.key === "Escape") {
        if (isOpen) {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) => (prev + 1) % options.length);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length);
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          const highlighted = options[highlightedIndex];
          if (highlighted) {
            handleSelect(highlighted.value);
          }
        }
      } else if (e.key === "Tab") {
        if (isOpen) {
          setIsOpen(false);
        }
      }
    },
    [disabled, isOpen, options, highlightedIndex, handleSelect]
  );

  const canUsePortal = typeof document !== "undefined" && Boolean(document.body);

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: `${menuPosition.left}px`,
    width: `${menuPosition.width}px`,
    minWidth: `${menuPosition.width}px`,
    zIndex: 9999,
    ...(menuPosition.bottom !== undefined
      ? { bottom: `${menuPosition.bottom}px`, top: "auto" }
      : { top: `${menuPosition.top ?? 0}px`, bottom: "auto" }),
  };

  const menuElement = (
    <div
      ref={menuRef}
      id={`${id}-menu`}
      role="listbox"
      aria-label={ariaLabel || selectedOption?.label}
      className={`bbq-dropdown-menu ${openUpward ? "flip-up" : "open-down"}`}
      style={canUsePortal ? menuStyle : undefined}
    >
      {options.map((opt, idx) => {
        const isSelected = opt.value === value;
        const isHighlighted = idx === highlightedIndex;

        return (
          <button
            key={opt.value}
            id={`${id}-option-${opt.value}`}
            type="button"
            role="option"
            aria-selected={isSelected}
            tabIndex={-1}
            className={`bbq-dropdown-item ${isSelected ? "selected" : ""} ${
              isHighlighted ? "highlighted" : ""
            }`}
            onClick={() => handleSelect(opt.value)}
            onMouseEnter={() => setHighlightedIndex(idx)}
          >
            <span className="bbq-dropdown-item-label">{opt.label}</span>
            {isSelected && (
              <span className="bbq-dropdown-item-check" aria-hidden="true">
                <Icon name="check" size={12} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={`bbq-theme-select-container ${isOpen ? "dropdown-open" : ""} ${className}`.trim()}
      style={{
        position: "relative",
        display: "inline-block",
        zIndex: isOpen ? 50 : undefined,
        ...style,
      }}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={`${id}-menu`}
        aria-label={ariaLabel || selectedOption?.label}
        disabled={disabled}
        className={`bbq-select bbq-dropdown-trigger ${isOpen ? "open" : ""} ${className}`.trim()}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
      >
        <span className="bbq-dropdown-trigger-label">
          {selectedOption?.label}
        </span>
        <span
          className={`bbq-dropdown-trigger-chevron ${isOpen ? "open" : ""}`}
          aria-hidden="true"
        >
          <Icon name="chevron-down" size={12} />
        </span>
      </button>

      {/* Hidden native select for test and form parity */}
      <select
        id={`${id}-native`}
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 0,
          height: 0,
          margin: 0,
          padding: 0,
          border: "none",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Dropdown Menu Popover */}
      {isOpen && (canUsePortal ? createPortal(menuElement, document.body) : menuElement)}
    </div>
  );
}
