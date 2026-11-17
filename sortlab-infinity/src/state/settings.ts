import type { PatternId } from '../core/patterns';
import type { VisualMode } from '../render/modes';
import type { ColorScheme } from '../render/palette';
import type { ScaleId } from '../audio/scales';

export interface Settings {
  // sorting
  algorithmId: string;
  n: number;
  pattern: PatternId;
  seed: number;
  lockSeed: boolean;
  /** Playback speed in trace operations per second (before slow-mo / turbo multipliers). */
  speed: number;
  speedMode: 'normal' | 'slow' | 'turbo';
  opLimit: number;
  autoVerify: boolean;
  // visual
  mode: VisualMode;
  colorScheme: ColorScheme;
  customFrom: string;
  customTo: string;
  background: string;
  barWidth: number;
  barSpacing: number;
  glow: number;
  smoothing: number;
  showHighlights: boolean;
  compareColor: string;
  swapColor: string;
  writeColor: string;
  migraineIntensity: number;
  motion: 'system' | 'reduce' | 'full';
  reflection: boolean;
  ambient: boolean;
  grain: boolean;
  autoHideUI: boolean;
  // audio
  soundEnabled: boolean;
  volume: number;
  waveform: OscillatorType;
  scale: ScaleId;
  pitchMin: number;
  pitchMax: number;
  soundCompare: boolean;
  soundSwap: boolean;
  soundWrite: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  algorithmId: 'quick',
  n: 512,
  pattern: 'random',
  seed: 1337,
  lockSeed: false,
  speed: 1200,
  speedMode: 'normal',
  opLimit: 4_000_000,
  autoVerify: true,
  mode: 'bars',
  colorScheme: 'rainbow',
  customFrom: '#00e1ff',
  customTo: '#ff3cac',
  background: '#050507',
  barWidth: 0.78,
  barSpacing: 0,
  glow: 0.45,
  smoothing: 0.6,
  showHighlights: true,
  compareColor: '#ffffff',
  swapColor: '#ff2e63',
  writeColor: '#35f2a0',
  migraineIntensity: 0.4,
  motion: 'system',
  reflection: true,
  ambient: true,
  grain: true,
  autoHideUI: true,
  soundEnabled: false,
  volume: 0.45,
  waveform: 'triangle',
  scale: 'pentatonic',
  pitchMin: 180,
  pitchMax: 1400,
  soundCompare: true,
  soundSwap: true,
  soundWrite: true,
};

const KEY = 'sortlab-infinity:settings:v2';

export const N_STEPS = [8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384];
export const MAX_N = 16384;
export const OP_LIMITS = [250_000, 1_000_000, 4_000_000, 10_000_000, 20_000_000];

export function sanitize(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const def = DEFAULT_SETTINGS[k];
    const v = r[k];
    if (v === undefined || typeof v !== typeof def) continue;
    if (typeof def === 'number' && !Number.isFinite(v as number)) continue;
    (s as unknown as Record<string, unknown>)[k] = v;
  }
  s.n = Math.max(1, Math.min(MAX_N, Math.round(s.n)));
  s.speed = Math.max(0.5, Math.min(5_000_000, s.speed));
  s.opLimit = Math.max(1000, Math.min(20_000_000, Math.round(s.opLimit)));
  s.barWidth = Math.max(0.1, Math.min(1, s.barWidth));
  s.smoothing = Math.max(0, Math.min(0.95, s.smoothing));
  s.glow = Math.max(0, Math.min(1, s.glow));
  s.volume = Math.max(0, Math.min(1, s.volume));
  s.migraineIntensity = Math.max(0, Math.min(1, s.migraineIntensity));
  return s;
}

export function loadSettings(): Settings {
  try {
    const txt = localStorage.getItem(KEY);
    if (!txt) return { ...DEFAULT_SETTINGS };
    return sanitize(JSON.parse(txt));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) – preferences simply won't persist */
  }
}

export function effectiveSpeed(s: Pick<Settings, 'speed' | 'speedMode'>) {
  return s.speed * (s.speedMode === 'slow' ? 0.1 : s.speedMode === 'turbo' ? 20 : 1);
}

export function prefersReducedMotion(s: Pick<Settings, 'motion'>): boolean {
  if (s.motion === 'reduce') return true;
  if (s.motion === 'full') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
