/**
 * Compact Indicator Ordering & Resolution Logic
 *
 * Deterministically merges persisted user preference with default indicators
 * and filters out disabled widgets.
 */

export const DEFAULT_COMPACT_INDICATOR_ORDER: string[] = [
  "drop",
  "media",
  "timer",
  "reminder",
  "files",
  "clipboard",
  "launcher",
  "system",
];

export function resolveEffectiveIndicatorOrder(
  persistedOrder: string[] = [],
  disabledWidgets: string[] = []
): string[] {
  const disabledSet = new Set(disabledWidgets);
  const result: string[] = [];
  const seen = new Set<string>();

  // 1. Filter and apply persisted order
  for (const item of persistedOrder) {
    if (!disabledSet.has(item) && DEFAULT_COMPACT_INDICATOR_ORDER.includes(item) && !seen.has(item)) {
      result.push(item);
      seen.add(item);
    }
  }

  // 2. Append unlisted default indicators that are not disabled
  for (const item of DEFAULT_COMPACT_INDICATOR_ORDER) {
    if (!disabledSet.has(item) && !seen.has(item)) {
      result.push(item);
      seen.add(item);
    }
  }

  return result;
}

export function getOrderedActiveWidgets<T extends { id: string }>(
  widgets: T[],
  persistedOrder: string[] = [],
  disabledWidgets: string[] = []
): T[] {
  const effectiveOrder = resolveEffectiveIndicatorOrder(persistedOrder, disabledWidgets);
  const orderMap = new Map(effectiveOrder.map((id, index) => [id, index]));
  return [...widgets].sort((a, b) => {
    const orderA = orderMap.has(a.id) ? (orderMap.get(a.id) as number) : 999;
    const orderB = orderMap.has(b.id) ? (orderMap.get(b.id) as number) : 999;
    return orderA - orderB;
  });
}
