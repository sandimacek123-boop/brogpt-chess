// Loads fonts, the official logo + product imagery, and pre-computes the panel
// colour treatments (blue inverted duotone + red duotone) for every artwork.
// Results are cached per tab: each Remotion render tab does this once and every
// frame after is pure drawing.

import type {ArtSource, EditProps, SceneConfig, SceneId} from '../config';
import {COMP_SIZE, isProcedural} from '../config';
import {drawProcedural, PROCEDURAL_NAMES, type ProceduralName} from '../art/procedural';
import {applyLUT, buildGuardTable, buildLUTs, lutColor, paletteKey, type LUTs} from './color';
import {buildLogoIcon} from './brand';

export type Treated = {red: HTMLCanvasElement; blue: HTMLCanvasElement; w: number; h: number; procedural: boolean};

export type SceneAssets = {
  config: SceneConfig;
  art: Treated | null;
  panels: Array<Treated | null>;
};

export type Assets = {
  key: string;
  luts: LUTs;
  guardTable: Float32Array;
  colors: {bg: {red: string; blue: string}; ray: {red: string; blue: string}};
  scenes: Record<SceneId, SceneAssets>;
  logoIcon: HTMLCanvasElement;
  backdrop: HTMLImageElement | null;
};

export type SrcResolver = (src: string) => string;

const MAX_ART_DIM = COMP_SIZE;
const OFFICIAL_SYMBOL = 'brand/real-symbol.svg';
const BACKDROP = 'brand/real-wave.webp';

// ---------------------------------------------------------------------------
let fontsPromise: Promise<void> | null = null;

export const ensureFonts = (resolve: SrcResolver) => {
  if (fontsPromise) return fontsPromise;
  const faces: Array<[string, string, string]> = [
    ['Montserrat', 'fonts/montserrat-latin-600-normal.woff2', '600'],
    ['Montserrat', 'fonts/montserrat-latin-700-normal.woff2', '700'],
    ['Geist', 'fonts/geist-latin-500-normal.woff2', '500'],
    ['Geist', 'fonts/geist-latin-600-normal.woff2', '600'],
    ['Geist', 'fonts/geist-latin-700-normal.woff2', '700'],
    ['Geist Mono', 'fonts/geist-mono-latin-400-normal.woff2', '400'],
    ['Geist Mono', 'fonts/geist-mono-latin-500-normal.woff2', '500'],
  ];
  fontsPromise = Promise.all(
    faces.map(async ([family, file, weight]) => {
      const face = new FontFace(family, `url("${resolve(file)}") format("woff2")`, {weight, style: 'normal'});
      await face.load();
      document.fonts.add(face);
    }),
  ).then(() => undefined);
  fontsPromise.catch(() => (fontsPromise = null));
  return fontsPromise;
};

// ---------------------------------------------------------------------------
const imageCache = new Map<string, Promise<HTMLImageElement>>();

export const loadImage = (url: string) => {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      if (!url.startsWith('data:') && !url.startsWith('blob:')) img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => rej(new Error(`Could not load image: ${url}`));
      img.src = url;
    });
    imageCache.set(url, p);
    p.catch(() => imageCache.delete(url));
  }
  return p;
};

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

const treat = (gray: HTMLCanvasElement, luts: LUTs, procedural: boolean): Treated => {
  const w = gray.width;
  const h = gray.height;
  const src = gray.getContext('2d', {willReadFrequently: true})!.getImageData(0, 0, w, h);
  const out: Partial<Treated> = {w, h, procedural};
  for (const which of ['red', 'blue'] as const) {
    const data = new ImageData(new Uint8ClampedArray(src.data), w, h);
    applyLUT(data.data, which === 'red' ? luts.red : luts.blue);
    const c = makeCanvas(w, h);
    c.getContext('2d')!.putImageData(data, 0, 0);
    out[which] = c;
  }
  return out as Treated;
};

/** Soft-edge mask so screenshots blend into the panels instead of showing hard rectangles. */
const feather = (c: HTMLCanvasElement, amount: number) => {
  const f = Math.round(Math.min(c.width, c.height) * amount);
  const mask = makeCanvas(c.width, c.height);
  const m = mask.getContext('2d')!;
  m.filter = `blur(${Math.max(1, f / 2)}px)`;
  m.fillStyle = '#fff';
  m.fillRect(f, f, c.width - 2 * f, c.height - 2 * f);
  const ctx = c.getContext('2d')!;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
};

/** Single-colour version of a mark (alpha preserved): white on red panels, navy on blue panels. */
const mono = (src: HTMLCanvasElement, luts: LUTs, procedural: boolean): Treated => {
  const out: Partial<Treated> = {w: src.width, h: src.height, procedural};
  const navy = `rgb(${luts.blue[765]},${luts.blue[766]},${luts.blue[767]})`; // darkest blue of the inverted map
  for (const [which, col] of [['red', '#ffffff'], ['blue', luts.invertBlue ? navy : '#ffffff']] as const) {
    const c = makeCanvas(src.width, src.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, c.width, c.height);
    out[which] = c;
  }
  return out as Treated;
};

// ---------------------------------------------------------------------------
const treatedCache = new Map<string, Promise<Treated>>();

const rasterize = async (src: ArtSource, treatment: SceneConfig['treatment'], luts: LUTs, resolve: SrcResolver): Promise<Treated> => {
  const key = `${src}|${treatment}|${luts.key}`;
  let p = treatedCache.get(key);
  if (p) return p;
  p = (async () => {
    let c: HTMLCanvasElement;
    if (isProcedural(src)) {
      let name = src.split(':')[1] as ProceduralName;
      if (!PROCEDURAL_NAMES.includes(name)) name = 'calibration';
      c = makeCanvas(COMP_SIZE, COMP_SIZE);
      drawProcedural(name, c.getContext('2d', {willReadFrequently: true})!);
    } else {
      const img = await loadImage(resolve(src));
      const nw = img.naturalWidth || 1024;
      const nh = img.naturalHeight || 1024;
      // vector art (SVG) rasterises at full size, bitmaps keep their native resolution
      const isSvg = /\.svg(\?|$)/i.test(src);
      const k = isSvg ? MAX_ART_DIM / 2 / Math.max(nw, nh) : Math.min(1, MAX_ART_DIM / Math.max(nw, nh));
      c = makeCanvas(nw * k, nh * k);
      const ctx = c.getContext('2d', {willReadFrequently: true})!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      if (!isSvg && treatment === 'duotone') feather(c, 0.07);
    }
    if (treatment === 'mono') return mono(c, luts, isProcedural(src));
    return treat(c, luts, isProcedural(src));
  })();
  treatedCache.set(key, p);
  p.catch(() => treatedCache.delete(key));
  return p;
};

const lutOptions = (props: EditProps) => ({
  blueIntensity: props.blueIntensity ?? 1,
  redIntensity: props.redIntensity ?? 1,
  invertBlue: props.invertBluePanels ?? false,
});

export const assetsKey = (props: EditProps) =>
  JSON.stringify([paletteKey(props.palette, lutOptions(props)), props.brand?.logo, props.brand?.logoStyle, props.scenes]);

let lastAssets: Assets | null = null;
export const getCachedAssets = (key: string) => (lastAssets && lastAssets.key === key ? lastAssets : null);

export const loadAssets = async (props: EditProps, resolve: SrcResolver): Promise<Assets> => {
  const key = assetsKey(props);
  if (lastAssets && lastAssets.key === key) return lastAssets;
  await ensureFonts(resolve);
  const luts = buildLUTs(props.palette, lutOptions(props));

  const logoSrc = props.brand.logo || OFFICIAL_SYMBOL;
  const logoImg = await loadImage(resolve(logoSrc));
  const logoIcon = buildLogoIcon(logoImg, props.brand.logoStyle, logoSrc.endsWith('real-symbol.svg'));
  const backdrop = await loadImage(resolve(BACKDROP)).catch(() => null);

  const scenes = {} as Record<SceneId, SceneAssets>;
  await Promise.all(
    props.scenes.map(async (sc) => {
      const art = sc.art ? await rasterize(sc.art, sc.treatment, luts, resolve) : null;
      const panels = await Promise.all(
        (sc.panels ?? [null, null, null, null]).map((p) => (p ? rasterize(p, sc.treatment, luts, resolve) : Promise.resolve(null))),
      );
      scenes[sc.id] = {config: sc, art, panels};
    }),
  );

  // drop treated rasters the current props no longer use (preview memory)
  const keep = new Set<string>();
  for (const sc of props.scenes) {
    for (const s of [sc.art, ...(sc.panels ?? [])]) {
      if (s) keep.add(`${s}|${sc.treatment}|${luts.key}`);
    }
  }
  for (const k of [...treatedCache.keys()]) if (!keep.has(k)) treatedCache.delete(k);

  const assets: Assets = {
    key,
    luts,
    guardTable: buildGuardTable(props.palette),
    colors: {
      bg: {red: lutColor(luts, 'red', 0), blue: lutColor(luts, 'blue', 0)},
      ray: {red: lutColor(luts, 'red', 0.74), blue: lutColor(luts, 'blue', 0.62)},
    },
    scenes,
    logoIcon,
    backdrop,
  };
  lastAssets = assets;
  return assets;
};
