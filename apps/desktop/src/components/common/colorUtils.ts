/**
 * BBQ v2.1 — Color Utilities for Cromia Color Picker
 * Zero external dependencies. Pure math for HSV, RGB, HEX, and Alpha.
 */

export interface RGBA {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
  a: number; // 0..1
}

export interface HSVA {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
  a: number; // 0..1
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Converts HSV (0..360, 0..1, 0..1) to RGB (0..255, 0..255, 0..255).
 */
export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const normH = ((h % 360) + 360) % 360;
  const normS = clamp(s, 0, 1);
  const normV = clamp(v, 0, 1);

  const c = normV * normS;
  const x = c * (1 - Math.abs(((normH / 60) % 2) - 1));
  const m = normV - c;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (normH < 60) {
    rPrime = c;
    gPrime = x;
  } else if (normH < 120) {
    rPrime = x;
    gPrime = c;
  } else if (normH < 180) {
    gPrime = c;
    bPrime = x;
  } else if (normH < 240) {
    gPrime = x;
    bPrime = c;
  } else if (normH < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
}

/**
 * Converts RGB (0..255) to HSV (0..360, 0..1, 0..1).
 */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const normR = clamp(r, 0, 255) / 255;
  const normG = clamp(g, 0, 255) / 255;
  const normB = clamp(b, 0, 255) / 255;

  const max = Math.max(normR, normG, normB);
  const min = Math.min(normR, normG, normB);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === normR) {
      h = ((normG - normB) / delta) % 6;
    } else if (max === normG) {
      h = (normB - normR) / delta + 2;
    } else {
      h = (normR - normG) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

/**
 * Parses HEX string (#RGB, #RRGGBB, #RGBA, #RRGGBBAA) into RGBA.
 */
export function hexToRgba(hex: string): RGBA | null {
  if (!hex || typeof hex !== "string") return null;
  const clean = hex.trim().replace(/^#/, "");

  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return { r, g, b, a: 1 };
  }

  if (/^[0-9a-fA-F]{4}$/.test(clean)) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    const a = parseInt(clean[3] + clean[3], 16) / 255;
    return { r, g, b, a: Math.round(a * 100) / 100 };
  }

  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return { r, g, b, a: 1 };
  }

  if (/^[0-9a-fA-F]{8}$/.test(clean)) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    const a = parseInt(clean.substring(6, 8), 16) / 255;
    return { r, g, b, a: Math.round(a * 100) / 100 };
  }

  return null;
}

/**
 * Formats RGBA to HEX string.
 * Omits alpha if a === 1.
 */
export function rgbaToHex(r: number, g: number, b: number, a: number = 1): string {
  const rHex = clamp(Math.round(r), 0, 255).toString(16).padStart(2, "0");
  const gHex = clamp(Math.round(g), 0, 255).toString(16).padStart(2, "0");
  const bHex = clamp(Math.round(b), 0, 255).toString(16).padStart(2, "0");

  const clampedA = clamp(a, 0, 1);
  if (clampedA >= 1) {
    return `#${rHex}${gHex}${bHex}`.toLowerCase();
  }

  const aHex = Math.round(clampedA * 255).toString(16).padStart(2, "0");
  return `#${rHex}${gHex}${bHex}${aHex}`.toLowerCase();
}

/**
 * Validates any arbitrary color input (HEX, RGB, or invalid).
 */
export function validateColorInput(input: string): {
  valid: boolean;
  hex: string;
  rgba: RGBA | null;
} {
  const trimmed = (input || "").trim();
  const parsed = hexToRgba(trimmed);
  if (parsed) {
    return {
      valid: true,
      hex: rgbaToHex(parsed.r, parsed.g, parsed.b, parsed.a),
      rgba: parsed,
    };
  }

  // Check rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(
    /^rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;

    if (r <= 255 && g <= 255 && b <= 255 && a >= 0 && a <= 1) {
      const rgba: RGBA = { r, g, b, a };
      return {
        valid: true,
        hex: rgbaToHex(r, g, b, a),
        rgba,
      };
    }
  }

  return {
    valid: false,
    hex: "#000000",
    rgba: null,
  };
}
