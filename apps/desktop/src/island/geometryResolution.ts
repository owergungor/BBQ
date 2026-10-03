import type { WidgetSizingContract } from "@bbq/types";

export interface CompactResolutionInput {
  /** Minimum width required by the rendered content so buttons/text aren't clipped */
  contentMinWidth?: number;
  /** User-configured compact width from settings (e.g. 240, 300, 350...) */
  userCompactWidth: number;
  /** Active widget's sizing contract if available */
  widgetSizing?: WidgetSizingContract;
  /** Platform minimal boundary in logical pixels (default: 180) */
  platformMinWidth?: number;
  /** Platform maximal boundary in logical pixels (default: 640) */
  platformMaxWidth?: number;
}

/**
 * Resolves effective compact width following the strict priority order:
 * 1. Content minimum width (ensures content is not clipped, buttons accessible, no overflow)
 * 2. User configured compact width
 * 3. Widget preferred width (from widget sizing contract compact constraints)
 * 4. Platform/window limits [180, 640]
 */
export function resolveEffectiveCompactWidth(input: CompactResolutionInput): number {
  const platformMin = input.platformMinWidth ?? 180;
  const platformMax = input.platformMaxWidth ?? 640;

  const widgetCompact = input.widgetSizing?.compact;
  const widgetMin = widgetCompact?.minWidth ?? platformMin;
  const widgetMax = widgetCompact?.maxWidth ? Math.min(widgetCompact.maxWidth, platformMax) : platformMax;

  // Step 2 & 3: Start from user compact width, or fallback to widget preferred width if user is 0/undefined
  let resolved = input.userCompactWidth || widgetCompact?.preferredWidth || 240;

  // Step 1: Content minimum width takes precedence if larger than user width, preventing clipping
  if (input.contentMinWidth !== undefined && input.contentMinWidth > 0) {
    resolved = Math.max(resolved, input.contentMinWidth);
  }

  // Ensure widget minimum is satisfied
  resolved = Math.max(resolved, widgetMin);

  // Step 4: Clamp to widget max and platform bounds
  return Math.min(widgetMax, Math.max(platformMin, resolved));
}
