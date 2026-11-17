export interface GradientStop {
  pos: number; // 0..1
  color: string; // #rrggbb
}

export type PaletteId =
  | 'classic-rainbow' | 'neon-rainbow' | 'sunset' | 'ocean' | 'aurora' | 'candy' | 'fire' | 'ice'
  | 'forest' | 'monochrome' | 'vaporwave' | 'cyberpunk' | 'galaxy' | 'golden' | 'pastel'
  | 'electric-blue' | 'pink-purple' | 'black-white' | 'custom';

const s = (...colors: string[]): GradientStop[] => colors.map((c, i) => ({ pos: i / (colors.length - 1), color: c }));

export const PALETTES: { id: PaletteId; name: string; stops: GradientStop[]; hsl?: boolean }[] = [
  { id: 'classic-rainbow', name: 'Classic Rainbow', stops: s('#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'), hsl: true },
  { id: 'neon-rainbow', name: 'Neon Rainbow', stops: s('#ff2a6d', '#ff9f1c', '#f9f871', '#05ffa1', '#01cdfe', '#b967ff', '#ff2a6d') },
  { id: 'sunset', name: 'Sunset', stops: s('#2d0b59', '#7b1fa2', '#e91e63', '#ff6f3c', '#ffc045', '#fff2b2') },
  { id: 'ocean', name: 'Ocean', stops: s('#03045e', '#023e8a', '#0077b6', '#00b4d8', '#90e0ef', '#e0fbfc') },
  { id: 'aurora', name: 'Aurora', stops: s('#0b132b', '#1c7c54', '#38dfa0', '#73fbd3', '#7f5af0', '#f43fbd') },
  { id: 'candy', name: 'Candy', stops: s('#ff8fab', '#ffc6ff', '#bdb2ff', '#a0c4ff', '#9bf6ff', '#caffbf', '#fdffb6') },
  { id: 'fire', name: 'Fire', stops: s('#1a0000', '#6a040f', '#d00000', '#f48c06', '#ffba08', '#fff3b0') },
  { id: 'ice', name: 'Ice', stops: s('#0a1128', '#1b3b6f', '#4d9de0', '#a3d5ff', '#e8f6ff', '#ffffff') },
  { id: 'forest', name: 'Forest', stops: s('#081c15', '#1b4332', '#2d6a4f', '#52b788', '#95d5b2', '#d8f3dc') },
  { id: 'monochrome', name: 'Monochrome', stops: s('#1d1d2c', '#4a4a6a', '#8a8ab2', '#c8c8e6', '#f5f5fa') },
  { id: 'vaporwave', name: 'Vaporwave', stops: s('#ff71ce', '#b967ff', '#01cdfe', '#05ffa1', '#fffb96') },
  { id: 'cyberpunk', name: 'Cyberpunk', stops: s('#0d0221', '#650d89', '#f706cf', '#fd1d53', '#f9c80e', '#2de2e6') },
  { id: 'galaxy', name: 'Galaxy', stops: s('#0b0033', '#370078', '#7b2cbf', '#c77dff', '#38dfff', '#ffffff') },
  { id: 'golden', name: 'Golden', stops: s('#2b1700', '#7a4a00', '#c98b00', '#f2c94c', '#fff1b8') },
  { id: 'pastel', name: 'Pastel', stops: s('#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff') },
  { id: 'electric-blue', name: 'Electric Blue', stops: s('#020024', '#090979', '#0057ff', '#00d4ff', '#c4f5ff') },
  { id: 'pink-purple', name: 'Pink and Purple', stops: s('#2a0845', '#6a3093', '#a855f7', '#f43fbd', '#ffc2e2') },
  { id: 'black-white', name: 'Black and White', stops: s('#000000', '#ffffff') },
  { id: 'custom', name: 'Custom Gradient', stops: s('#38dfff', '#a855f7', '#f43fbd') },
];

export function paletteStops(id: PaletteId, custom: GradientStop[]): GradientStop[] {
  if (id === 'custom') return custom.length >= 2 ? custom : PALETTES[PALETTES.length - 1].stops;
  return (PALETTES.find((p) => p.id === id) ?? PALETTES[0]).stops;
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(v)) return [255, 255, 255];
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function isValidHex(s: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim());
}

/** A sampled palette: `size` entries as packed RGB and as CSS strings. */
export class ColorLUT {
  readonly size: number;
  readonly r: Uint8ClampedArray;
  readonly g: Uint8ClampedArray;
  readonly b: Uint8ClampedArray;
  readonly css: string[];

  constructor(stops: GradientStop[], size = 256, interpolation: 'rgb' | 'hsl' = 'rgb') {
    this.size = size;
    this.r = new Uint8ClampedArray(size);
    this.g = new Uint8ClampedArray(size);
    this.b = new Uint8ClampedArray(size);
    this.css = new Array(size);
    const sorted = [...stops].sort((a, b) => a.pos - b.pos);
    for (let i = 0; i < size; i++) {
      const t = size === 1 ? 0 : i / (size - 1);
      const [r, g, b] = sampleStops(sorted, t, interpolation);
      this.r[i] = r;
      this.g[i] = g;
      this.b[i] = b;
      this.css[i] = `rgb(${r | 0},${g | 0},${b | 0})`;
    }
  }

  index(t: number): number {
    if (!(t >= 0)) t = 0;
    if (t > 1) t = 1;
    return Math.round(t * (this.size - 1));
  }
}

function sampleStops(stops: GradientStop[], t: number, mode: 'rgb' | 'hsl'): [number, number, number] {
  if (stops.length === 0) return [255, 255, 255];
  if (t <= stops[0].pos) return hexToRgb(stops[0].color);
  if (t >= stops[stops.length - 1].pos) return hexToRgb(stops[stops.length - 1].color);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].pos) {
      const a = stops[i - 1];
      const b = stops[i];
      const u = (t - a.pos) / Math.max(1e-9, b.pos - a.pos);
      const ca = hexToRgb(a.color);
      const cb = hexToRgb(b.color);
      if (mode === 'hsl') {
        const ha = rgbToHsl(...ca);
        const hb = rgbToHsl(...cb);
        let dh = hb[0] - ha[0];
        if (dh > 0.5) dh -= 1;
        if (dh < -0.5) dh += 1;
        return hslToRgb((ha[0] + dh * u + 1) % 1, ha[1] + (hb[1] - ha[1]) * u, ha[2] + (hb[2] - ha[2]) * u);
      }
      return [ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u];
    }
  }
  return hexToRgb(stops[stops.length - 1].color);
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, sat, l];
}

export function hslToRgb(h: number, sat: number, l: number): [number, number, number] {
  if (sat === 0) return [l * 255, l * 255, l * 255];
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

export function cssGradient(stops: GradientStop[], angle = 90): string {
  return `linear-gradient(${angle}deg, ${[...stops].sort((a, b) => a.pos - b.pos).map((st) => `${st.color} ${(st.pos * 100).toFixed(1)}%`).join(', ')})`;
}
