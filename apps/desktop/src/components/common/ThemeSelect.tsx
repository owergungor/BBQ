import React, { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "./Icon.tsx";

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

  // Screen collision check to open upward near screen/window edge
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const estimatedHeight = Math.min(options.length * 32 + 12, 220);
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen, options.length]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
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

  return (
    <div
      ref={containerRef}
      className="bbq-theme-select-container"
      style={{
        position: "relative",
        display: "inline-block",
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
      {isOpen && (
        <div
          ref={menuRef}
          id={`${id}-menu`}
          role="listbox"
          aria-label={ariaLabel || selectedOption?.label}
          className={`bbq-dropdown-menu ${openUpward ? "flip-up" : "open-down"}`}
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
      )}
    </div>
  );
}
