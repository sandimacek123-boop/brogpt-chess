// Shared types + defaults for the REAL spinning crosshair edit.
// Everything the preview UI exposes lives in EditProps, so the preview and the
// final render always evaluate exactly the same thing.

export const FPS = 60;
export const DURATION_FRAMES = 900; // exactly 15 s @ 60 fps
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const COMPOSITION_ID = 'RealCrosshair';

/** Side of the square "crosshair composition" in px (at camera scale 1).
 *  Must be > frame diagonal (2203 px) so no corner is ever exposed while spinning. */
export const COMP_SIZE = 2400;

export type Palette = {
  // inverted (blue) panels
  blue: string;
  electric: string;
  lightBlue: string;
  white: string;
  // normal (red) panels
  red: string;
  deepRed: string;
  brightRed: string;
  black: string;
};

export const DEFAULT_PALETTE: Palette = {
  blue: '#0066FF',
  electric: '#008CFF',
  lightBlue: '#5DBBFF',
  white: '#FFFFFF',
  red: '#FF0033',
  deepRed: '#B80024',
  brightRed: '#FF3658',
  black: '#050505',
};

/**
 * An art source is either
 *  - 'placeholder:<name>'  procedural placeholder artwork (swap for official REAL assets)
 *  - a file inside public/  e.g. 'assets/real-logo.png'
 *  - an absolute URL (http(s):, blob:, data:)
 */
export type ArtSource = string;

export type PanelOverrides = [ArtSource | null, ArtSource | null, ArtSource | null, ArtSource | null];

export type SceneId = 'A' | 'B' | 'C' | 'D' | 'BRAND';

export type SceneConfig = {
  id: SceneId;
  label: string;
  /** split = one artwork cut into the 4 quadrants (the trend look)
   *  quad  = the artwork is repeated inside every quadrant */
  layout: 'split' | 'quad';
  art: ArtSource;
  /** optional per-panel artwork (TL, TR, BL, BR). Overrides `art` for that panel. */
  panels: PanelOverrides;
  /** how uploaded art is fitted into the art box */
  fit: 'contain' | 'cover';
  /** art box size relative to the composition (split) or quadrant (quad) */
  artScale: number;
  artX: number; // px offset in composition space
  artY: number;
  /** normal = art covers the rays; lighten = dark parts of the art let the rays through */
  blend: 'normal' | 'lighten';
  rays: {
    count: number;
    spin: number; // deg / second (internal artwork movement)
  };
};

export type AudioSettings = {
  /** legally obtained track (e.g. Montagem Mythical) – public/ path or URL. null = silent */
  src: string | null;
  enabled: boolean;
  /** seconds into the song where the edit starts */
  startOffset: number;
  volume: number;
  /** snap impact frames to detected beats */
  beatSync: boolean;
  /** beat times in seconds (song time), from scripts/analyze-audio.ts or the preview UI */
  beats: number[] | null;
};

export type EditProps = {
  palette: Palette;
  /** 0.8 – 1.6: compresses every spin toward its impact frame (impacts stay on time) */
  spinSpeed: number;
  /** 0 – 2: shutter length multiplier (1 = 0.6 frame shutter) */
  motionBlur: number;
  /** cap for temporal supersampling sub-frames */
  maxBlurSamples: number;
  flashIntensity: number; // 0 – 1.5
  shakeIntensity: number; // 0 – 1.5
  chromaticAberration: number; // 0 – 1.5
  /** keep the frame strictly blue/red/neutral (removes purple from red↔blue blur mixing) */
  paletteGuard: boolean;
  logo: ArtSource | null;
  scenes: SceneConfig[];
  showPlaceholderLabels: boolean;
  audio: AudioSettings;
};

const noPanels: PanelOverrides = [null, null, null, null];

export const DEFAULT_SCENES: SceneConfig[] = [
  {
    id: 'A',
    label: 'Wordmark',
    layout: 'split',
    art: 'placeholder:wordmark',
    panels: noPanels,
    fit: 'contain',
    artScale: 1,
    artX: 0,
    artY: 0,
    blend: 'normal',
    rays: {count: 9, spin: 7},
  },
  {
    id: 'B',
    label: 'Executor UI',
    layout: 'split',
    art: 'placeholder:executor',
    panels: noPanels,
    fit: 'contain',
    artScale: 1,
    artX: 0,
    artY: 0,
    blend: 'normal',
    rays: {count: 7, spin: -9},
  },
  {
    id: 'C',
    label: 'Crosshair emblem',
    layout: 'split',
    art: 'placeholder:emblem',
    panels: noPanels,
    fit: 'contain',
    artScale: 1,
    artX: 0,
    artY: 0,
    blend: 'normal',
    rays: {count: 12, spin: 5},
  },
  {
    id: 'D',
    label: 'Code storm',
    layout: 'split',
    art: 'placeholder:code',
    panels: noPanels,
    fit: 'contain',
    artScale: 1,
    artX: 0,
    artY: 0,
    blend: 'normal',
    rays: {count: 8, spin: -6},
  },
  {
    id: 'BRAND',
    label: 'REAL branding (all 4 panels)',
    layout: 'quad',
    art: 'placeholder:brand',
    panels: noPanels,
    fit: 'contain',
    artScale: 1,
    artX: 0,
    artY: 0,
    blend: 'normal',
    rays: {count: 10, spin: 4},
  },
];

export const DEFAULT_PROPS: EditProps = {
  palette: DEFAULT_PALETTE,
  spinSpeed: 1,
  motionBlur: 1,
  maxBlurSamples: 64,
  flashIntensity: 1,
  shakeIntensity: 1,
  chromaticAberration: 1,
  paletteGuard: true,
  logo: null,
  scenes: DEFAULT_SCENES,
  showPlaceholderLabels: false,
  audio: {
    src: null,
    enabled: false,
    startOffset: 0,
    volume: 1,
    beatSync: true,
    beats: null,
  },
};

export const isPlaceholder = (src: ArtSource | null | undefined) =>
  typeof src === 'string' && src.startsWith('placeholder:');
