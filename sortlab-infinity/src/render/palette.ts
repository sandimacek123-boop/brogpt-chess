export type ColorScheme = 'rainbow' | 'custom' | 'heat' | 'ocean' | 'neon' | 'mono';

export const COLOR_SCHEMES: { id: ColorScheme; name: string }[] = [
  { id: 'rainbow', name: 'Rainbow' },
  { id: 'neon', name: 'Neon' },
  { id: 'heat', name: 'Heat' },
  { id: 'ocean', name: 'Ocean' },
  { id: 'mono', name: 'Monochrome' },
  { id: 'custom', name: 'Custom gradient' },
];

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function gradient(stops: string[], t: number): string {
  const rgb = stops.map(hexToRgb);
  const x = Math.min(0.999999, Math.max(0, t)) * (rgb.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = rgb[i];
  const b = rgb[Math.min(rgb.length - 1, i + 1)];
  return `rgb(${Math.round(lerp(a[0], b[0], f))},${Math.round(lerp(a[1], b[1], f))},${Math.round(lerp(a[2], b[2], f))})`;
}

/** Colour for a normalised value t ∈ [0, 1]. */
export function colorFor(scheme: ColorScheme, t: number, customFrom: string, customTo: string): string {
  switch (scheme) {
    case 'rainbow':
      return `hsl(${Math.round(t * 330)}, 92%, 58%)`;
    case 'neon':
      return gradient(['#00f0ff', '#7b5cff', '#ff2bd6', '#ffe14d'], t);
    case 'heat':
      return gradient(['#2b0a3d', '#8a1538', '#e8452c', '#ffb02e', '#fff6c2'], t);
    case 'ocean':
      return gradient(['#062a4d', '#0a6ea8', '#17c3b2', '#c8ffef'], t);
    case 'mono':
      return gradient(['#3a3f4b', '#f4f6fb'], t);
    case 'custom':
    default:
      return gradient([customFrom, customTo], t);
  }
}

const cache = new Map<string, string[]>();

/** Lookup table: palette[v] for integer values 0..maxValue. */
export function buildPalette(scheme: ColorScheme, maxValue: number, minValue: number, from: string, to: string): string[] {
  const key = `${scheme}|${maxValue}|${minValue}|${from}|${to}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const lut = new Array<string>(maxValue + 1);
  const span = Math.max(1, maxValue - minValue);
  for (let v = 0; v <= maxValue; v++) lut[v] = colorFor(scheme, Math.max(0, (v - minValue) / span), from, to);
  if (cache.size > 24) cache.clear();
  cache.set(key, lut);
  return lut;
}
