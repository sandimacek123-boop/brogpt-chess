// Shared types + defaults for the REAL spinning crosshair edit.
// Everything the preview editor exposes lives in EditProps, so the preview and
// the final render always evaluate exactly the same thing.

export const FPS = 60;
export const DURATION_FRAMES = 900; // exactly 15 s @ 60 fps
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const COMPOSITION_ID = 'RealCrosshair';
export const EXPORT_FILENAME = 'REAL_Spinning_Crosshair_Final.mp4';

/** Side of the square 4-panel composition in px (at camera zoom 1).
 *  Must be > frame diagonal (2203 px) so no corner is ever exposed while spinning. */
export const COMP_SIZE = 2400;

export type Palette = {
  electric: string; // electric blue
  cyan: string; // cyan blue
  deepBlue: string;
  red: string; // impact red
  white: string;
  nearBlack: string;
  graphite: string;
};

export const DEFAULT_PALETTE: Palette = {
  electric: '#0866FF',
  cyan: '#39C6FF',
  deepBlue: '#063DAB',
  red: '#FF1849',
  white: '#FFFFFF',
  nearBlack: '#080B12',
  graphite: '#141821',
};

/** Official app-icon lockup colours (sampled from the official REAL lockup). Never recoloured. */
export const LOGO_GRADIENT = {top: '#A8AEF8', bottom: '#4463F0'};

/**
 * An art source is either
 *  - 'procedural:<name>'  original abstract geometry drawn in code (no fake UI / logos)
 *  - a file inside public/  e.g. 'brand/real-editor.webp'
 *  - an absolute URL (http(s):, blob:, data:) or a server path ('/uploads/x.png')
 */
export type ArtSource = string;

export type PanelOverrides = [ArtSource | null, ArtSource | null, ArtSource | null, ArtSource | null];

export type SceneId = 'A' | 'B' | 'C' | 'D' | 'BRAND';

export type SceneConfig = {
  id: SceneId;
  label: string;
  /** split = one artwork cut into the 4 quadrants · quad = repeated inside every quadrant */
  layout: 'split' | 'quad';
  art: ArtSource;
  /** optional per-panel artwork (TL, TR, BL, BR). Overrides `art` for that panel. */
  panels: PanelOverrides;
  fit: 'contain' | 'cover';
  /** art box size relative to the composition (split) or tile (quad) */
  artScale: number;
  artX: number; // px offset in composition space
  artY: number;
  /** 0..1 – keeps product imagery a purposeful detail instead of overwhelming the geometry */
  artOpacity: number;
  /** duotone = blue/red panel treatment · mono = single-colour mark (how the site uses the symbol: white / navy) */
  treatment: 'duotone' | 'mono';
  blend: 'normal' | 'screen';
  rays: {count: number; spin: number}; // panel light rays · spin in deg / second
};

export type AudioSettings = {
  /** legally obtained / licensed track – public/ path or URL. null = silent */
  src: string | null;
  enabled: boolean;
  startOffset: number; // seconds into the song where the edit starts
  volume: number;
  beatSync: boolean; // snap impact frames to detected beats
  beats: number[] | null; // beat times in seconds (song time)
};

export type BrandSettings = {
  /** official REAL symbol (SVG/PNG). The default is the official vector from projectreal.gg */
  logo: ArtSource;
  /** app-icon = white rounded square + gradient symbol (official lockup) · symbol = white symbol only */
  logoStyle: 'app-icon' | 'symbol';
  logoScale: number;
  logoX: number;
  logoY: number;
  wordmark: string; // official wordmark is "Real"
  wordmarkSize: number; // multiplier
  showSecondary: boolean; // EXECUTOR
  showProjectReal: boolean; // PROJECT REAL
  showWebsite: boolean; // projectreal.gg
  showDiscord: boolean; // discord.gg/projectreal
};

export type EditProps = {
  palette: Palette;
  // --- motion
  spinSpeed: number; // 0.8–1.6 compresses each spin toward its impact
  spinDirection: 1 | -1;
  acceleration: number; // 0.5–1.5 sharpness of speed-ups
  deceleration: number; // 0.5–1.5 sharpness of slow-downs
  motionBlur: number; // 0–2 shutter multiplier (1 = 0.6 frame)
  maxBlurSamples: number; // temporal supersampling cap
  ringSpeed: number;
  innerRingSpeed: number;
  outerRingSpeed: number;
  cameraZoom: number; // 0–1.5 multiplier on zoom moves / punches
  impactStrength: number; // 0–1.5 master for flash / punch / shake / CA / bursts
  // --- visual
  blueIntensity: number;
  redIntensity: number;
  invertBluePanels: boolean; // trend look: blue panels are a real negative
  glow: number;
  ringThickness: number;
  ringDensity: number;
  tickDensity: number;
  contrast: number;
  brightness: number;
  chromaticAberration: number;
  backgroundOpacity: number;
  flashIntensity: number;
  reducedFlash: boolean;
  shakeIntensity: number;
  paletteGuard: boolean;
  // --- brand + content
  brand: BrandSettings;
  scenes: SceneConfig[];
  audio: AudioSettings;
};

const noPanels: PanelOverrides = [null, null, null, null];

const scene = (s: Partial<SceneConfig> & Pick<SceneConfig, 'id' | 'label' | 'art'>): SceneConfig => ({
  layout: 'split',
  panels: noPanels,
  fit: 'cover',
  artScale: 1,
  artX: 0,
  artY: 0,
  artOpacity: 0.9,
  treatment: 'duotone',
  blend: 'normal',
  rays: {count: 8, spin: 6},
  ...s,
});

export const DEFAULT_SCENES: SceneConfig[] = [
  scene({id: 'A', label: 'Official editor', art: 'brand/real-editor.webp', fit: 'contain', artScale: 0.72, artY: -40, artOpacity: 0.6, rays: {count: 7, spin: 6}}),
  scene({id: 'B', label: 'Calibration geometry', art: 'procedural:calibration', fit: 'contain', artOpacity: 1, rays: {count: 12, spin: -5}}),
  scene({id: 'C', label: 'Official editor hero', art: 'brand/real-hero-editor.webp', fit: 'contain', artScale: 0.82, artOpacity: 0.65, rays: {count: 9, spin: 7}}),
  scene({id: 'D', label: 'Official wave', art: 'brand/real-wave.webp', artScale: 1.25, artOpacity: 1, blend: 'screen', rays: {count: 6, spin: -4}}),
  scene({
    id: 'BRAND',
    label: 'REAL symbol (all 4 panels)',
    art: 'brand/real-symbol.svg',
    layout: 'quad',
    fit: 'contain',
    artScale: 0.3,
    artOpacity: 0.95,
    treatment: 'mono',
    rays: {count: 10, spin: 4},
  }),
];

export const DEFAULT_BRAND: BrandSettings = {
  logo: 'brand/real-symbol.svg',
  logoStyle: 'app-icon',
  logoScale: 1,
  logoX: 0,
  logoY: 0,
  wordmark: 'Real',
  wordmarkSize: 1,
  showSecondary: true,
  showProjectReal: true,
  showWebsite: true,
  showDiscord: true,
};

export const DEFAULT_PROPS: EditProps = {
  palette: DEFAULT_PALETTE,
  spinSpeed: 1,
  spinDirection: 1,
  acceleration: 1,
  deceleration: 1,
  motionBlur: 1,
  maxBlurSamples: 64,
  ringSpeed: 1,
  innerRingSpeed: 1,
  outerRingSpeed: 1,
  cameraZoom: 1,
  impactStrength: 1,
  blueIntensity: 1,
  redIntensity: 1,
  invertBluePanels: false,
  glow: 1,
  ringThickness: 1,
  ringDensity: 1,
  tickDensity: 1,
  contrast: 1,
  brightness: 1,
  chromaticAberration: 1,
  backgroundOpacity: 1,
  flashIntensity: 1,
  reducedFlash: false,
  shakeIntensity: 1,
  paletteGuard: true,
  brand: DEFAULT_BRAND,
  scenes: DEFAULT_SCENES,
  audio: {src: null, enabled: false, startOffset: 0, volume: 1, beatSync: true, beats: null},
};

export const isProcedural = (src: ArtSource | null | undefined) =>
  typeof src === 'string' && (src.startsWith('procedural:') || src.startsWith('placeholder:'));

/** Built-in artwork offered by the editor's artwork selector. */
export const BUILTIN_ART: Array<{src: ArtSource; label: string}> = [
  {src: 'brand/real-editor.webp', label: 'Official · editor window'},
  {src: 'brand/real-hero-editor.webp', label: 'Official · editor hero'},
  {src: 'brand/real-script-hub.webp', label: 'Official · ScriptHub'},
  {src: 'brand/real-wave.webp', label: 'Official · wave texture'},
  {src: 'brand/real-symbol.svg', label: 'Official · REAL symbol'},
  {src: 'procedural:calibration', label: 'Original · calibration geometry'},
  {src: 'procedural:grid', label: 'Original · technical grid'},
];

/** Merge (possibly partial / older) props with defaults. */
export const mergeProps = (p?: Partial<EditProps> | null): EditProps => {
  const src = (p ?? {}) as Partial<EditProps>;
  const scenes = Array.isArray(src.scenes) && src.scenes.length === DEFAULT_SCENES.length
    ? src.scenes.map((s, i) => ({...DEFAULT_SCENES[i], ...s, rays: {...DEFAULT_SCENES[i].rays, ...(s.rays ?? {})}}))
    : DEFAULT_SCENES;
  return {
    ...DEFAULT_PROPS,
    ...src,
    palette: {...DEFAULT_PALETTE, ...(src.palette ?? {})},
    brand: {...DEFAULT_BRAND, ...(src.brand ?? {})},
    audio: {...DEFAULT_PROPS.audio, ...(src.audio ?? {})},
    scenes,
  };
};
