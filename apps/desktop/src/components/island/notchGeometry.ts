/**
 * Authoritative Notch Shape Geometry Generator
 * Shared mathematical model between Frontend CSS/SVG and Rust Win32 GDI polygon clipping.
 * Top-left and top-right corners curve outward (convex flare to screen edge).
 * Bottom-left and bottom-right corners curve inward (concave rounding).
 */

export function getNotchSvgPath(
  width: number,
  height: number,
  rTop: number,
  rBottom: number,
  isBottom: boolean = false
): string {
  if (width <= 0 || height <= 0) return "";

  const rt = Math.min(Math.max(2, rTop), width / 4, height / 3);
  const rb = Math.min(Math.max(2, rBottom), width / 4, height / 2);

  const w = Number(width.toFixed(1));
  const h = Number(height.toFixed(1));
  const rTopVal = Number(rt.toFixed(1));
  const rBotVal = Number(rb.toFixed(1));

  if (isBottom) {
    // Inverted vertically for bottom-anchored notch
    const p1x = (rTopVal * 0.552).toFixed(1);
    const p2y = (h - rTopVal * 0.448).toFixed(1);
    const y1 = (h - rTopVal).toFixed(1);
    const rt2 = rBotVal.toFixed(1);
    const p3y = (rBotVal * 0.448).toFixed(1);
    const p4x = (rTopVal + rBotVal * 0.448).toFixed(1);
    const x2 = (rTopVal + rBotVal).toFixed(1);
    const x3 = (w - rTopVal - rBotVal).toFixed(1);
    const p5x = (w - rTopVal - rBotVal * 0.448).toFixed(1);
    const wRt = (w - rTopVal).toFixed(1);
    const p6y = (rBotVal * 0.448).toFixed(1);
    const p7x = (w - rTopVal * 0.448).toFixed(1);

    return `M 0,${h} C ${p1x},${h} ${rTopVal},${p2y} ${rTopVal},${y1} L ${rTopVal},${rt2} C ${rTopVal},${p3y} ${p4x},0 ${x2},0 L ${x3},0 C ${p5x},0 ${wRt},${p6y} ${wRt},${rt2} L ${wRt},${y1} C ${wRt},${p2y} ${p7x},${h} ${w},${h} Z`;
  }

  // Top-anchored notch (normal)
  const p1x = (rTopVal * 0.552).toFixed(1);
  const p2y = (rTopVal * 0.448).toFixed(1);
  const hRb = (h - rBotVal).toFixed(1);
  const p3y = (h - rBotVal * 0.448).toFixed(1);
  const p4x = (rTopVal + rBotVal * 0.448).toFixed(1);
  const x2 = (rTopVal + rBotVal).toFixed(1);
  const x3 = (w - rTopVal - rBotVal).toFixed(1);
  const p5x = (w - rTopVal - rBotVal * 0.448).toFixed(1);
  const wRt = (w - rTopVal).toFixed(1);
  const p6y = (h - rBotVal * 0.448).toFixed(1);
  const p7y = (rTopVal * 0.448).toFixed(1);
  const p8x = (w - rTopVal * 0.448).toFixed(1);

  return `M 0,0 C ${p1x},0 ${rTopVal},${p2y} ${rTopVal},${rTopVal} L ${rTopVal},${hRb} C ${rTopVal},${p3y} ${p4x},${h} ${x2},${h} L ${x3},${h} C ${p5x},${h} ${wRt},${p6y} ${wRt},${hRb} L ${wRt},${rTopVal} C ${wRt},${p7y} ${p8x},0 ${w},0 Z`;
}
