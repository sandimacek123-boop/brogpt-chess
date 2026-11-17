import { create } from 'zustand';
import { DEFAULT_SETTINGS, registerEnum, sanitize, SETTINGS_VERSION, VIZ_2D, VIZ_3D, type Page, type Settings } from './settings';
import { ALGORITHMS } from '../engine/registry';
import { PATTERNS } from '../engine/generators';
import { PALETTES } from '../render/palettes';

// enum registration for validation of imported data
registerEnum('sorting.algorithm', ALGORITHMS.map((a) => a.id));
registerEnum('sorting.pattern', PATTERNS.map((p) => p.id));
registerEnum('sorting.speedMode', ['normalized', 'fixed']);
registerEnum('appearance.viz', [...VIZ_2D.map((v) => v.id), ...VIZ_3D.map((v) => v.id)]);
registerEnum('appearance.palette', PALETTES.map((p) => p.id));
registerEnum('appearance.interpolation', ['rgb', 'hsl']);
registerEnum('appearance.colorMode', ['value', 'index', 'identity', 'fixed', 'height', 'rainbow-rotation']);
registerEnum('appearance.background', ['solid', 'gradient', 'starfield', 'grid', 'particles', 'math-grid', 'geometric', 'image']);
registerEnum('general.startupPage', ['visualizer', 'battle', 'lab', 'studio', 'benchmark', 'settings']);
registerEnum('three.cameraPreset', ['front', 'top', 'iso', 'side']);
registerEnum('cinematic.grading', ['none', 'teal-orange', 'cool', 'warm', 'noir', 'vivid']);
registerEnum('cinematic.transition', ['fade', 'zoom', 'slide', 'sweep']);
registerEnum('cinematic.completion', ['rainbow-sweep', 'particle-burst', 'completion-wave', 'radial-pulse', 'cascade', 'geometric', 'fade', 'none']);
registerEnum('cinematic.textAnimation', ['fade-up', 'typewriter', 'tracking', 'none']);
registerEnum('audio.instrument', ['sine', 'triangle', 'square', 'sawtooth', 'bell', 'pluck', 'piano', 'marimba', 'chime', 'pad', 'pulse']);
registerEnum('audio.mapping', ['value', 'position', 'pair']);
registerEnum('audio.scale', ['chromatic', 'major', 'minor', 'pentatonic', 'blues', 'whole-tone', 'custom']);
registerEnum('performance.quality', ['low', 'medium', 'high', 'ultra', 'auto']);
registerEnum('export.aspect', ['9:16', '16:9', '1:1', 'custom']);
registerEnum('export.format', ['auto', 'mp4', 'webm']);

const STORAGE_KEY = 'sortclaude.settings.v1';
const PRESETS_KEY = 'sortclaude.presets.v1';
const SESSION_KEY = 'sortclaude.session.v1';

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function loadSettings(): Settings {
  const raw = safeGet(STORAGE_KEY);
  if (!raw) return sanitize(DEFAULT_SETTINGS, {});
  try {
    const parsed = JSON.parse(raw);
    return sanitize(DEFAULT_SETTINGS, migrate(parsed));
  } catch {
    return sanitize(DEFAULT_SETTINGS, {});
  }
}

/** Versioned migration hook. v1 is the first format; future versions transform here. */
export function migrate(input: any): any {
  if (!input || typeof input !== 'object') return {};
  if (typeof input.version !== 'number') input.version = SETTINGS_VERSION;
  return input;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends any[] ? T[K] : DeepPartial<T[K]>) : T[K] };

export interface UserPreset {
  id: string;
  name: string;
  created: number;
  builtin?: boolean;
  description?: string;
  /** Visual configuration subset. */
  data: DeepPartial<Settings>;
}

interface AppState {
  settings: Settings;
  page: Page;
  presets: UserPreset[];
  cinematic: boolean;
  toasts: { id: number; text: string; kind: 'info' | 'error' | 'success' }[];
  setPage: (p: Page) => void;
  update: <K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) => void;
  replaceSettings: (s: unknown) => void;
  resetSettings: () => void;
  setCinematic: (v: boolean) => void;
  toast: (text: string, kind?: 'info' | 'error' | 'success') => void;
  dismissToast: (id: number) => void;
  savePreset: (p: UserPreset) => void;
  deletePreset: (id: string) => void;
  renamePreset: (id: string, name: string) => void;
  applyPreset: (p: UserPreset) => void;
}

function loadPresets(): UserPreset[] {
  try {
    const raw = safeGet(PRESETS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.data === 'object')
      .map((p) => ({ id: p.id, name: String(p.name).slice(0, 80), created: Number(p.created) || Date.now(), description: p.description ? String(p.description).slice(0, 200) : undefined, data: p.data }));
  } catch {
    return [];
  }
}

let toastId = 1;
const initial = loadSettings();

export const useApp = create<AppState>((set, get) => ({
  settings: initial,
  page: readPageFromHash() ?? initial.general.startupPage,
  presets: loadPresets(),
  cinematic: false,
  toasts: [],
  setPage: (page) => {
    set({ page });
    try {
      history.replaceState(null, '', `#/${page}${location.search ? '' : ''}`);
    } catch {
      /* ignore */
    }
  },
  update: (section, patch) => {
    const settings = { ...get().settings, [section]: { ...(get().settings[section] as object), ...patch } };
    set({ settings });
  },
  replaceSettings: (s) => set({ settings: sanitize(DEFAULT_SETTINGS, migrate(s)) }),
  resetSettings: () => set({ settings: sanitize(DEFAULT_SETTINGS, {}) }),
  setCinematic: (cinematic) => set({ cinematic }),
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, kind }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  savePreset: (p) => {
    const presets = [...get().presets.filter((x) => x.id !== p.id), p];
    set({ presets });
    safeSet(PRESETS_KEY, JSON.stringify(presets));
  },
  deletePreset: (id) => {
    const presets = get().presets.filter((x) => x.id !== id);
    set({ presets });
    safeSet(PRESETS_KEY, JSON.stringify(presets));
  },
  renamePreset: (id, name) => {
    const presets = get().presets.map((x) => (x.id === id ? { ...x, name: name.slice(0, 80) } : x));
    set({ presets });
    safeSet(PRESETS_KEY, JSON.stringify(presets));
  },
  applyPreset: (p) => {
    const cur = get().settings;
    const merged = deepMerge(cur, p.data);
    set({ settings: sanitize(DEFAULT_SETTINGS, merged) });
  },
}));

function readPageFromHash(): Page | null {
  try {
    const m = location.hash.match(/^#\/(\w+)/);
    const p = m?.[1] as Page | undefined;
    return p && ['visualizer', 'battle', 'lab', 'studio', 'benchmark', 'settings'].includes(p) ? p : null;
  } catch {
    return null;
  }
}

export function deepMerge<T>(base: T, patch: any): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch === undefined ? base : (patch as T);
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(patch)) {
    const bv = (base as any)?.[k];
    out[k] = bv && typeof bv === 'object' && !Array.isArray(bv) ? deepMerge(bv, patch[k]) : patch[k];
  }
  return out;
}

// ---- persistence (debounced) --------------------------------------------------
let saveTimer: ReturnType<typeof setTimeout> | null = null;
useApp.subscribe((state, prev) => {
  if (state.settings === prev.settings) return;
  if (!state.settings.general.autosave) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const ok = safeSet(STORAGE_KEY, JSON.stringify(state.settings));
    if (!ok) useApp.getState().toast('Could not save preferences (storage full or blocked). Large background images use a lot of space.', 'error');
  }, 400);
});

export function saveSettingsNow() {
  safeSet(STORAGE_KEY, JSON.stringify(useApp.getState().settings));
}

export function saveSessionPosition(data: { pos: number }) {
  safeSet(SESSION_KEY, JSON.stringify(data));
}
export function loadSessionPosition(): { pos: number } | null {
  try {
    const raw = safeGet(SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.pos === 'number' ? { pos: v.pos } : null;
  } catch {
    return null;
  }
}

export const settings = () => useApp.getState().settings;
