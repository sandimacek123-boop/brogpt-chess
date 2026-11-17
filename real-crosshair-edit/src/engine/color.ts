// Colour treatments.
//  RED (normal)   : luminance → black → deep red → red → bright red → light highlight
//  BLUE (inverted): luminance is INVERTED first (a real negative), then remapped
//                   deep blue → primary → electric → light blue → white
// Both are gradient maps applied per pixel to the artwork itself.

import type {Palette} from '../config';

export type RGB = [number, number, number];
export type Treatment = 'red' | 'blue';

export const hexToRgb = (hex: string): RGB => {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [255, 0, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

type Stop = [number, RGB];

const sampleStops = (stops: Stop[], x: number): RGB => {
  if (x <= stops[0][0]) return stops[0][1];
  for (let k = 0; k < stops.length - 1; k++) {
    const [p0, c0] = stops[k];
    const [p1, c1] = stops[k + 1];
    if (x <= p1) return mix(c0, c1, (x - p0) / (p1 - p0));
  }
  return stops[stops.length - 1][1];
};

export type LUTs = {red: Uint8ClampedArray; blue: Uint8ClampedArray; key: string};

export const paletteKey = (p: Palette) =>
  [p.blue, p.electric, p.lightBlue, p.white, p.red, p.deepRed, p.brightRed, p.black].join('|');

export const buildLUTs = (p: Palette): LUTs => {
  const black = hexToRgb(p.black);
  const deepRed = hexToRgb(p.deepRed);
  const red = hexToRgb(p.red);
  const bright = hexToRgb(p.brightRed);
  const white = hexToRgb(p.white);
  const blue = hexToRgb(p.blue);
  const electric = hexToRgb(p.electric);
  const light = hexToRgb(p.lightBlue);

  const redStops: Stop[] = [
    [0, black],
    [0.42, deepRed],
    [0.72, red],
    [0.9, bright],
    [1, mix(bright, white, 0.4)],
  ];
  // v = 1 - luminance  (the inversion)
  const blueStops: Stop[] = [
    [0, mix(blue, [0, 0, 0], 0.35)],
    [0.25, blue],
    [0.5, electric],
    [0.75, light],
    [1, white],
  ];
  const r = new Uint8ClampedArray(256 * 3);
  const b = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const L = i / 255;
    const cr = sampleStops(redStops, L);
    const cb = sampleStops(blueStops, 1 - L);
    r.set([Math.round(cr[0]), Math.round(cr[1]), Math.round(cr[2])], i * 3);
    b.set([Math.round(cb[0]), Math.round(cb[1]), Math.round(cb[2])], i * 3);
  }
  return {red: r, blue: b, key: paletteKey(p)};
};

export const lutColor = (luts: LUTs, which: Treatment, L: number) => {
  const lut = which === 'red' ? luts.red : luts.blue;
  const i = Math.max(0, Math.min(255, Math.round(L * 255))) * 3;
  return `rgb(${lut[i]},${lut[i + 1]},${lut[i + 2]})`;
};

/** Apply a gradient map in place (RGBA, straight alpha). */
export const applyLUT = (data: Uint8ClampedArray, lut: Uint8ClampedArray) => {
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] === 0) continue;
    // Rec.709 luma
    const y = (data[p] * 54 + data[p + 1] * 183 + data[p + 2] * 19) >> 8;
    const i = y * 3;
    data[p] = lut[i];
    data[p + 1] = lut[i + 1];
    data[p + 2] = lut[i + 2];
  }
};

const hueOf = ([r, g, b]: RGB) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const c = max - min;
  if (c === 0) return null;
  let h: number;
  if (max === r) h = ((g - b) / c) * 60;
  else if (max === g) h = ((b - r) / c) * 60 + 120;
  else h = ((r - g) / c) * 60 + 240;
  return (h + 360) % 360;
};

/** 360-entry table: how much to desaturate a pixel of a given hue (0 = keep, 1 = neutral). */
export const buildGuardTable = (p: Palette) => {
  const families = [
    [p.blue, p.electric, p.lightBlue],
    [p.red, p.deepRed, p.brightRed],
  ];
  const bands: Array<[number, number]> = [];
  for (const fam of families) {
    const hues = fam.map((c) => hueOf(hexToRgb(c))).filter((h): h is number => h !== null);
    if (hues.length === 0) continue;
    // unwrap around the first hue so red (≈350°) and orange-red (≈5°) stay together
    const ref = hues[0];
    const rel = hues.map((h) => ((h - ref + 540) % 360) - 180);
    bands.push([ref + Math.min(...rel) - 14, ref + Math.max(...rel) + 14]);
  }
  const table = new Float32Array(360);
  for (let h = 0; h < 360; h++) {
    let best = 180;
    for (const [lo, hi] of bands) {
      for (const shift of [-360, 0, 360]) {
        const a = lo + shift;
        const b = hi + shift;
        const d = h < a ? a - h : h > b ? h - b : 0;
        if (d < best) best = d;
      }
    }
    table[h] = best >= 14 ? 1 : best / 14;
  }
  return table;
};

/**
 * Palette guard: hue-selective desaturation. Motion blur and chromatic
 * aberration physically mix red and blue into purple; this pulls every hue
 * outside the palette's red / blue families back to neutral so the frame stays
 * strictly blue + red + black/white (QC: no green, no purple).
 */
export const guardPalette = (data: Uint8ClampedArray, table: Float32Array) => {
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    const c = max - min;
    if (c < 10) continue;
    let h: number;
    if (max === r) h = ((g - b) / c) * 60;
    else if (max === g) h = ((b - r) / c) * 60 + 120;
    else h = ((r - g) / c) * 60 + 240;
    if (h < 0) h += 360;
    const w = table[h | 0];
    if (w === 0) continue;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    data[p] = r + (y - r) * w;
    data[p + 1] = g + (y - g) * w;
    data[p + 2] = b + (y - b) * w;
  }
};
