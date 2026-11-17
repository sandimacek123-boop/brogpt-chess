// Loads fonts + artwork and pre-computes the two colour treatments for every
// artwork (red duotone + inverted blue). Results are cached per tab, so each
// Remotion render tab does this once and every frame after is just drawing.

import type {ArtSource, EditProps, SceneConfig, SceneId} from '../config';
import {COMP_SIZE, isPlaceholder} from '../config';
import {drawPlaceholder, placeholderSize, PLACEHOLDER_NAMES, type PlaceholderName} from '../art/placeholders';
import {applyLUT, buildGuardTable, buildLUTs, lutColor, paletteKey, type LUTs} from './color';

export type Treated = {red: HTMLCanvasElement; blue: HTMLCanvasElement; w: number; h: number; placeholder: boolean};

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
};

export type SrcResolver = (src: string) => string;

const MAX_ART_DIM = COMP_SIZE;

// ---------------------------------------------------------------------------
let fontsPromise: Promise<void> | null = null;

export const ensureFonts = (resolve: SrcResolver) => {
  if (fontsPromise) return fontsPromise;
  const faces: Array<[string, string, string]> = [
    ['Anton', 'fonts/anton-latin-400-normal.woff2', '400'],
    ['JetBrains Mono', 'fonts/jetbrains-mono-latin-400-normal.woff2', '400'],
    ['JetBrains Mono', 'fonts/jetbrains-mono-latin-700-normal.woff2', '700'],
    ['JetBrains Mono', 'fonts/jetbrains-mono-latin-800-normal.woff2', '800'],
  ];
  fontsPromise = Promise.all(
    faces.map(async ([family, file, weight]) => {
      const face = new FontFace(family, `url("${resolve(file)}") format("woff2")`, {weight, style: 'normal'});
      await face.load();
      document.fonts.add(face);
    }),
  ).then(() => undefined);
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

const treat = (gray: HTMLCanvasElement, luts: LUTs, placeholder: boolean): Treated => {
  const w = gray.width;
  const h = gray.height;
  const src = gray.getContext('2d', {willReadFrequently: true})!.getImageData(0, 0, w, h);
  const out: Partial<Treated> = {w, h, placeholder};
  for (const which of ['red', 'blue'] as const) {
    const data = new ImageData(new Uint8ClampedArray(src.data), w, h);
    applyLUT(data.data, which === 'red' ? luts.red : luts.blue);
    const c = makeCanvas(w, h);
    c.getContext('2d')!.putImageData(data, 0, 0);
    out[which] = c;
  }
  return out as Treated;
};

// ---------------------------------------------------------------------------
const treatedCache = new Map<string, Promise<Treated>>();

type LogoInfo = {img: HTMLImageElement | null; aspect: number; src: string | null};

const rasterize = async (
  src: ArtSource,
  luts: LUTs,
  resolve: SrcResolver,
  logo: LogoInfo,
  labels: boolean,
  panel: boolean,
): Promise<Treated> => {
  const key = isPlaceholder(src)
    ? `${src}|${luts.key}|${logo.src ?? ''}|${labels}|${panel}`
    : `${src}|${luts.key}`;
  let p = treatedCache.get(key);
  if (p) return p;
  p = (async () => {
    if (isPlaceholder(src)) {
      const name = src.slice('placeholder:'.length) as PlaceholderName;
      if (!PLACEHOLDER_NAMES.includes(name)) throw new Error(`Unknown placeholder ${src}`);
      const size = placeholderSize(name);
      const c = makeCanvas(size, size);
      const ctx = c.getContext('2d', {willReadFrequently: true})!;
      drawPlaceholder(name, ctx, {logo: logo.img, logoAspect: logo.aspect, labels});
      return treat(c, luts, true);
    }
    const img = await loadImage(resolve(src));
    const k = Math.min(1, MAX_ART_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    const c = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
    const ctx = c.getContext('2d', {willReadFrequently: true})!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return treat(c, luts, false);
  })();
  treatedCache.set(key, p);
  p.catch(() => treatedCache.delete(key));
  return p;
};

export const assetsKey = (props: EditProps) =>
  JSON.stringify([paletteKey(props.palette), props.logo, props.showPlaceholderLabels, props.scenes]);

let lastAssets: Assets | null = null;
export const getCachedAssets = (key: string) => (lastAssets && lastAssets.key === key ? lastAssets : null);

export const loadAssets = async (props: EditProps, resolve: SrcResolver): Promise<Assets> => {
  const key = assetsKey(props);
  if (lastAssets && lastAssets.key === key) return lastAssets;
  await ensureFonts(resolve);
  const luts = buildLUTs(props.palette);

  const logo: LogoInfo = {img: null, aspect: 1, src: props.logo};
  if (props.logo) {
    const img = await loadImage(resolve(props.logo));
    logo.img = img;
    logo.aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  }

  const scenes = {} as Record<SceneId, SceneAssets>;
  await Promise.all(
    props.scenes.map(async (sc) => {
      const art = sc.art ? await rasterize(sc.art, luts, resolve, logo, props.showPlaceholderLabels, false) : null;
      const panels = await Promise.all(
        (sc.panels ?? [null, null, null, null]).map((p) =>
          p ? rasterize(p, luts, resolve, logo, props.showPlaceholderLabels, true) : Promise.resolve(null),
        ),
      );
      scenes[sc.id] = {config: sc, art, panels};
    }),
  );

  // drop treated rasters that the current props no longer use (preview memory)
  const used = new Set<string>();
  for (const k of treatedCache.keys()) {
    for (const sc of props.scenes) {
      for (const s of [sc.art, ...(sc.panels ?? [])]) if (s && k.startsWith(`${s}|${luts.key}`)) used.add(k);
    }
  }
  for (const k of [...treatedCache.keys()]) if (!used.has(k)) treatedCache.delete(k);

  const assets: Assets = {
    key,
    luts,
    guardTable: buildGuardTable(props.palette),
    colors: {
      bg: {red: lutColor(luts, 'red', 0), blue: lutColor(luts, 'blue', 0)},
      ray: {red: lutColor(luts, 'red', 0.8), blue: lutColor(luts, 'blue', 0.8)},
    },
    scenes,
  };
  lastAssets = assets;
  return assets;
};
