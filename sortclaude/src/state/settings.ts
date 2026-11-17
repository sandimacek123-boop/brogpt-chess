import type { GradientStop, PaletteId } from '../render/palettes';
import type { PatternId } from '../engine/generators';

export const SETTINGS_VERSION = 1;

export type Viz2D =
  | 'bars' | 'hbars' | 'wheel' | 'spiral' | 'ring' | 'sunburst' | 'scatter' | 'tiles' | 'dots'
  | 'circular-bars' | 'heatmap' | 'waterfall' | 'skyline' | 'spectrum' | 'wave' | 'ribbon'
  | 'matrix' | 'particles' | 'spikes' | 'strips';
export type Viz3D = 'towers' | 'helix' | 'galaxy' | 'torus' | 'tunnel' | 'vortex' | 'columns' | 'crystals' | 'orbit' | 'rings3d';
export type VizId = Viz2D | Viz3D;

export const VIZ_2D: { id: Viz2D; name: string; hint: string }[] = [
  { id: 'bars', name: 'Classic Bars', hint: 'Bar height = value.' },
  { id: 'hbars', name: 'Horizontal Bars', hint: 'Bar length = value.' },
  { id: 'wheel', name: 'Color Wheel', hint: 'Wedge angle = index, colour = value. Sorted = smooth hue wheel.' },
  { id: 'spiral', name: 'Spiral', hint: 'Angle = index over several turns, radius = value. Sorted = perfect spiral.' },
  { id: 'ring', name: 'Ring', hint: 'One turn; radius = value. Sorted = an expanding ring.' },
  { id: 'sunburst', name: 'Sunburst', hint: 'Contiguous radial wedges whose outer radius = value.' },
  { id: 'scatter', name: 'Scatter Plot', hint: 'x = index, y = value. Sorted = diagonal line.' },
  { id: 'tiles', name: 'Tiles', hint: 'Row-major grid of cells coloured by value.' },
  { id: 'dots', name: 'Rainbow Dots', hint: 'Dot rows; dot size and colour follow value.' },
  { id: 'circular-bars', name: 'Circular Bars', hint: 'Radial bars from an inner ring; length = value.' },
  { id: 'heatmap', name: 'Displacement Heatmap', hint: 'Grid colour = distance between each element and its final position (cold = in place).' },
  { id: 'waterfall', name: 'Waterfall', hint: 'Layered step bands cascading from the value profile.' },
  { id: 'skyline', name: 'Skyline', hint: 'Glowing city: buildings = values, lit windows.' },
  { id: 'spectrum', name: 'Spectrum', hint: 'Mirrored analyser bars around the centre line.' },
  { id: 'wave', name: 'Wave', hint: 'Smooth curve through (index, value) with a filled body.' },
  { id: 'ribbon', name: 'Ribbon', hint: 'A twisting ribbon whose width and height follow the values.' },
  { id: 'matrix', name: 'LED Matrix', hint: 'Quantised LED columns: lit cells = value.' },
  { id: 'particles', name: 'Particle Cloud', hint: 'One floating particle per element; angle = index, radius = value.' },
  { id: 'spikes', name: 'Radial Spikes', hint: 'A star polygon whose spikes = values.' },
  { id: 'strips', name: 'Gradient Strips', hint: 'Thin contiguous strips coloured by value — a colour barcode.' },
];

export const VIZ_3D: { id: Viz3D; name: string; hint: string }[] = [
  { id: 'towers', name: '3D Towers', hint: 'Instanced boxes on a line; height = value.' },
  { id: 'helix', name: '3D Helix', hint: 'Double helix; index = turn position, value = radius and colour.' },
  { id: 'galaxy', name: 'Particle Galaxy', hint: 'Spiral arms; index = arm position, value = radius.' },
  { id: 'torus', name: 'Rotating Torus', hint: 'Elements wrap around a torus; value = tube offset.' },
  { id: 'tunnel', name: 'Geometric Tunnel', hint: 'Rings along depth; value = ring radius.' },
  { id: 'vortex', name: 'Sorting Vortex', hint: 'Funnel: index = angle and depth, value = radius.' },
  { id: 'columns', name: 'Floating Columns', hint: 'A square field of columns; height = value.' },
  { id: 'crystals', name: 'Crystal Lattice', hint: 'Octahedral crystals on a lattice; size = value.' },
  { id: 'orbit', name: 'Circular Orbits', hint: 'Elements orbit at radius = value, angle = index.' },
  { id: 'rings3d', name: 'Layered Rings', hint: 'Stacked rings; value = height within the stack.' },
];

export const is3D = (v: VizId): v is Viz3D => VIZ_3D.some((x) => x.id === v);

export type ColorMode = 'value' | 'index' | 'identity' | 'fixed' | 'height' | 'rainbow-rotation';
export type BackgroundType = 'solid' | 'gradient' | 'starfield' | 'grid' | 'particles' | 'math-grid' | 'geometric' | 'image';
export type CompletionEffect = 'rainbow-sweep' | 'particle-burst' | 'completion-wave' | 'radial-pulse' | 'cascade' | 'geometric' | 'fade' | 'none';
export type Instrument = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'bell' | 'pluck' | 'piano' | 'marimba' | 'chime' | 'pad' | 'pulse';
export type ScaleId = 'chromatic' | 'major' | 'minor' | 'pentatonic' | 'blues' | 'whole-tone' | 'custom';
export type PitchMapping = 'value' | 'position' | 'pair';
export type Quality = 'low' | 'medium' | 'high' | 'ultra' | 'auto';
export type Page = 'visualizer' | 'battle' | 'lab' | 'studio' | 'benchmark' | 'settings';

export interface Settings {
  version: number;
  general: {
    uiScale: number;
    sidebarWidth: number;
    startupPage: Page;
    restoreSession: boolean;
    autosave: boolean;
    tooltips: boolean;
    keyboardHints: boolean;
    reducedMotion: boolean;
    reducedFlashing: boolean;
    language: string;
  };
  sorting: {
    algorithm: string;
    n: number;
    pattern: PatternId;
    seed: number;
    customData: string;
    speed: number;
    speedMode: 'normalized' | 'fixed';
    customOpsPerSec: number;
    useCustomRate: boolean;
    autoRestart: boolean;
    showOps: boolean;
    highlightCompare: boolean;
    highlightSwap: boolean;
    highlightPivot: boolean;
    highlightSorted: boolean;
    showComplexity: boolean;
  };
  appearance: {
    viz: VizId;
    palette: PaletteId;
    customGradient: GradientStop[];
    interpolation: 'rgb' | 'hsl';
    colorMode: ColorMode;
    fixedColor: string;
    background: BackgroundType;
    bgColor1: string;
    bgColor2: string;
    bgImage: string;
    spacing: number;
    size: number;
    scale: number;
    rotation: number;
    outline: number;
    glow: number;
    blur: number;
    opacity: number;
    pointSize: number;
    smoothing: number;
    highlightIntensity: number;
    showStats: boolean;
  };
  three: {
    autoRotate: boolean;
    rotateSpeed: number;
    ambient: number;
    pointLight: number;
    bloom: number;
    particleSize: number;
    density: number;
    trails: number;
    shadows: boolean;
    renderScale: number;
    orthographic: boolean;
    cameraPreset: 'front' | 'top' | 'iso' | 'side';
  };
  cinematic: {
    intro: number;
    outro: number;
    cameraSpeed: number;
    zoom: number;
    glow: number;
    particles: number;
    backgroundAnimation: boolean;
    trails: number;
    backgroundBlur: number;
    lightIntensity: number;
    grading: 'none' | 'teal-orange' | 'cool' | 'warm' | 'noir' | 'vivid';
    transition: 'fade' | 'zoom' | 'slide' | 'sweep';
    completion: CompletionEffect;
    textAnimation: 'fade-up' | 'typewriter' | 'tracking' | 'none';
    grain: number;
    vignette: number;
    showCounters: boolean;
    showTitle: boolean;
    cameraMotion: boolean;
  };
  audio: {
    enabled: boolean;
    volume: number;
    instrument: Instrument;
    mapping: PitchMapping;
    noteDuration: number;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    pitchMin: number;
    pitchMax: number;
    scale: ScaleId;
    customScale: string;
    rootNote: number;
    stereoWidth: number;
    polyphony: number;
    reverb: number;
    delay: number;
    lowpass: number;
    highpass: number;
    quantize: boolean;
    density: number;
    soundCompare: boolean;
    soundSwap: boolean;
    soundWrite: boolean;
    volumeByMagnitude: boolean;
  };
  performance: {
    quality: Quality;
    targetFps: number;
    maxOpsPerFrame: number;
    historyMB: number;
    adaptive: boolean;
    particleLimit: number;
    renderScale: number;
    largeDatasetMode: boolean;
    useWorkers: boolean;
  };
  export: {
    aspect: '9:16' | '16:9' | '1:1' | 'custom';
    customW: number;
    customH: number;
    resolution: 720 | 1080 | 1440 | 2160;
    fps: number;
    format: 'auto' | 'mp4' | 'webm';
    audio: boolean;
    branding: boolean;
    filename: string;
    duration: number;
    bitrateMbps: number;
  };
  shortcuts: Record<string, string>;
}

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  playPause: 'Space',
  restart: 'r',
  shuffle: 's',
  fullscreen: 'f',
  mute: 'm',
  stepBack: 'ArrowLeft',
  stepForward: 'ArrowRight',
  speedUp: '+',
  speedDown: '-',
  battle: 'b',
  cinematic: 'c',
  escape: 'Escape',
};

export const SHORTCUT_LABELS: Record<string, string> = {
  playPause: 'Play / Pause',
  restart: 'Restart',
  shuffle: 'Shuffle (new seed)',
  fullscreen: 'Fullscreen',
  mute: 'Mute',
  stepBack: 'Step backward',
  stepForward: 'Step forward',
  speedUp: 'Increase speed',
  speedDown: 'Decrease speed',
  battle: 'Open Battle Mode',
  cinematic: 'Toggle Cinematic Mode',
  escape: 'Exit fullscreen / close dialogs',
};

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  general: {
    uiScale: 1,
    sidebarWidth: 340,
    startupPage: 'visualizer',
    restoreSession: true,
    autosave: true,
    tooltips: true,
    keyboardHints: true,
    reducedMotion: false,
    reducedFlashing: false,
    language: 'en',
  },
  sorting: {
    algorithm: 'merge',
    n: 160,
    pattern: 'random',
    seed: 20251117,
    customData: '5, 3, 8, 1, 9, 2, 7, 4, 6',
    speed: 1,
    speedMode: 'normalized',
    customOpsPerSec: 600,
    useCustomRate: false,
    autoRestart: false,
    showOps: true,
    highlightCompare: true,
    highlightSwap: true,
    highlightPivot: true,
    highlightSorted: true,
    showComplexity: true,
  },
  appearance: {
    viz: 'bars',
    palette: 'classic-rainbow',
    customGradient: [
      { pos: 0, color: '#38dfff' },
      { pos: 0.5, color: '#a855f7' },
      { pos: 1, color: '#f43fbd' },
    ],
    interpolation: 'rgb',
    colorMode: 'value',
    fixedColor: '#38dfff',
    background: 'math-grid',
    bgColor1: '#050509',
    bgColor2: '#120c24',
    bgImage: '',
    spacing: 0.15,
    size: 1,
    scale: 0.92,
    rotation: 0,
    outline: 0,
    glow: 0.35,
    blur: 0,
    opacity: 1,
    pointSize: 1,
    smoothing: 0.5,
    highlightIntensity: 0.85,
    showStats: true,
  },
  three: {
    autoRotate: true,
    rotateSpeed: 0.4,
    ambient: 0.5,
    pointLight: 1.2,
    bloom: 0.8,
    particleSize: 1,
    density: 1,
    trails: 0,
    shadows: false,
    renderScale: 1,
    orthographic: false,
    cameraPreset: 'iso',
  },
  cinematic: {
    intro: 2,
    outro: 2.5,
    cameraSpeed: 0.5,
    zoom: 1.04,
    glow: 0.6,
    particles: 0.5,
    backgroundAnimation: true,
    trails: 0.2,
    backgroundBlur: 0,
    lightIntensity: 1,
    grading: 'teal-orange',
    transition: 'fade',
    completion: 'rainbow-sweep',
    textAnimation: 'fade-up',
    grain: 0.12,
    vignette: 0.45,
    showCounters: true,
    showTitle: true,
    cameraMotion: true,
  },
  audio: {
    enabled: false,
    volume: 0.5,
    instrument: 'triangle',
    mapping: 'value',
    noteDuration: 0.09,
    attack: 0.004,
    decay: 0.05,
    sustain: 0.4,
    release: 0.06,
    pitchMin: 48,
    pitchMax: 96,
    scale: 'pentatonic',
    customScale: '0 2 3 7 9',
    rootNote: 0,
    stereoWidth: 0.7,
    polyphony: 24,
    reverb: 0.25,
    delay: 0.1,
    lowpass: 9000,
    highpass: 60,
    quantize: true,
    density: 4,
    soundCompare: true,
    soundSwap: true,
    soundWrite: true,
    volumeByMagnitude: false,
  },
  performance: {
    quality: 'auto',
    targetFps: 60,
    maxOpsPerFrame: 250000,
    historyMB: 96,
    adaptive: true,
    particleLimit: 20000,
    renderScale: 1,
    largeDatasetMode: false,
    useWorkers: true,
  },
  export: {
    aspect: '9:16',
    customW: 1080,
    customH: 1080,
    resolution: 1080,
    fps: 60,
    format: 'auto',
    audio: true,
    branding: true,
    filename: 'sortclaude-{algorithm}-{n}',
    duration: 20,
    bitrateMbps: 12,
  },
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

/** Numeric ranges used to validate imported settings / presets / URL params. */
export const RANGES: Record<string, [number, number]> = {
  'general.uiScale': [0.75, 2],
  'general.sidebarWidth': [260, 520],
  'sorting.n': [0, 1_000_000],
  'sorting.seed': [0, 4294967295],
  'sorting.speed': [0.01, 100000],
  'sorting.customOpsPerSec': [0.1, 50_000_000],
  'appearance.spacing': [0, 0.9],
  'appearance.size': [0.1, 4],
  'appearance.scale': [0.2, 1.5],
  'appearance.rotation': [-180, 180],
  'appearance.outline': [0, 4],
  'appearance.glow': [0, 1],
  'appearance.blur': [0, 8],
  'appearance.opacity': [0.05, 1],
  'appearance.pointSize': [0.2, 6],
  'appearance.smoothing': [0, 1],
  'appearance.highlightIntensity': [0, 1],
  'three.rotateSpeed': [0, 3],
  'three.ambient': [0, 3],
  'three.pointLight': [0, 5],
  'three.bloom': [0, 3],
  'three.particleSize': [0.1, 5],
  'three.density': [0.1, 1],
  'three.trails': [0, 0.95],
  'three.renderScale': [0.25, 2],
  'cinematic.intro': [0, 10],
  'cinematic.outro': [0, 10],
  'cinematic.cameraSpeed': [0, 3],
  'cinematic.zoom': [1, 2],
  'cinematic.glow': [0, 1],
  'cinematic.particles': [0, 1],
  'cinematic.trails': [0, 0.95],
  'cinematic.backgroundBlur': [0, 20],
  'cinematic.lightIntensity': [0, 2],
  'cinematic.grain': [0, 1],
  'cinematic.vignette': [0, 1],
  'audio.volume': [0, 1],
  'audio.noteDuration': [0.01, 2],
  'audio.attack': [0.001, 1],
  'audio.decay': [0.001, 2],
  'audio.sustain': [0, 1],
  'audio.release': [0.005, 3],
  'audio.pitchMin': [12, 120],
  'audio.pitchMax': [12, 127],
  'audio.rootNote': [0, 11],
  'audio.stereoWidth': [0, 1],
  'audio.polyphony': [1, 64],
  'audio.reverb': [0, 1],
  'audio.delay': [0, 0.9],
  'audio.lowpass': [200, 20000],
  'audio.highpass': [20, 5000],
  'audio.density': [1, 32],
  'performance.targetFps': [15, 240],
  'performance.maxOpsPerFrame': [1, 5_000_000],
  'performance.historyMB': [16, 1024],
  'performance.particleLimit': [100, 200000],
  'performance.renderScale': [0.25, 2],
  'export.customW': [128, 4096],
  'export.customH': [128, 4096],
  'export.fps': [12, 120],
  'export.duration': [2, 600],
  'export.bitrateMbps': [1, 80],
};

/**
 * Validate an untrusted settings-like object against the defaults: unknown keys are dropped,
 * wrong types fall back to the default, numbers are clamped, enums are checked against the
 * default's option lists where known. Never throws.
 */
export function sanitize<T>(defaults: T, input: unknown, path = ''): T {
  if (input === undefined || input === null) return structuredCloneSafe(defaults);
  if (Array.isArray(defaults)) {
    if (!Array.isArray(input)) return structuredCloneSafe(defaults);
    if (path === 'appearance.customGradient') {
      const stops = (input as unknown[])
        .filter((x): x is { pos: number; color: string } => !!x && typeof (x as any).pos === 'number' && typeof (x as any).color === 'string' && /^#[0-9a-fA-F]{6}$/.test((x as any).color))
        .slice(0, 16)
        .map((x) => ({ pos: Math.max(0, Math.min(1, x.pos)), color: x.color }));
      return (stops.length >= 2 ? stops : structuredCloneSafe(defaults)) as T;
    }
    return structuredCloneSafe(defaults);
  }
  if (typeof defaults === 'object' && defaults !== null) {
    if (typeof input !== 'object' || Array.isArray(input)) return structuredCloneSafe(defaults);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(defaults as object)) {
      const sub = path ? `${path}.${key}` : key;
      out[key] = sanitize((defaults as Record<string, unknown>)[key], (input as Record<string, unknown>)[key], sub);
    }
    if (path === 'shortcuts') {
      for (const k of Object.keys(out)) if (typeof out[k] !== 'string' || (out[k] as string).length > 20) out[k] = (defaults as any)[k];
    }
    return out as T;
  }
  if (typeof defaults === 'number') {
    let v = typeof input === 'number' ? input : typeof input === 'string' && input.trim() !== '' ? Number(input) : NaN;
    if (!Number.isFinite(v)) return defaults;
    const r = RANGES[path];
    if (r) v = Math.max(r[0], Math.min(r[1], v));
    return v as T;
  }
  if (typeof defaults === 'boolean') {
    if (typeof input === 'boolean') return input as T;
    if (input === 'true' || input === '1') return true as T;
    if (input === 'false' || input === '0') return false as T;
    return defaults;
  }
  if (typeof defaults === 'string') {
    if (typeof input !== 'string') return defaults;
    const allowed = ENUMS[path];
    if (allowed && !allowed.includes(input)) return defaults;
    if (path === 'appearance.bgImage') return (input.startsWith('data:image/') ? input : '') as T;
    if (path.endsWith('Color') || path.endsWith('Color1') || path.endsWith('Color2') || path === 'appearance.fixedColor') {
      return (/^#[0-9a-fA-F]{6}$/.test(input) ? input : defaults) as T;
    }
    return input.slice(0, path === 'sorting.customData' ? 2_000_000 : 400) as T;
  }
  return defaults;
}

function structuredCloneSafe<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

/** Allowed string values for enum-like fields. Filled lazily to avoid import cycles. */
export const ENUMS: Record<string, string[]> = {};

export function registerEnum(path: string, values: string[]) {
  ENUMS[path] = values;
}
