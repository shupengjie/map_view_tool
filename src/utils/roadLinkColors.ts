/**
 * Distinct saturated colors per road link index (golden-ratio hue on HSL wheel).
 */

function hslToRgb(h: number, s: number, l: number): readonly [number, number, number] {
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      let tt = t;
      if (tt < 0) {
        tt += 1;
      }
      if (tt > 1) {
        tt -= 1;
      }
      if (tt < 1 / 6) {
        return p + (q - p) * 6 * tt;
      }
      if (tt < 1 / 2) {
        return q;
      }
      if (tt < 2 / 3) {
        return p + (q - p) * (2 / 3 - tt) * 6;
      }
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)] as const;
}

/** Hex color for `road_links[index]` polylines (left/right share the same hue). */
export function roadLinkLineColorHex(linkIndex: number): string {
  const h = (linkIndex * 0.618033988749895) % 1;
  const [r, g, b] = hslToRgb(h, 0.78, 0.52);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
