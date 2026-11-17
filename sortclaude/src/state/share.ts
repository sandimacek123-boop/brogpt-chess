import { useApp } from './store';
import { sanitize, DEFAULT_SETTINGS, ENUMS } from './settings';

/**
 * Shareable configuration: a small, validated set of parameters in the URL query.
 * Datasets themselves are never placed in URLs — only the generator config (pattern + n + seed).
 */
const MAP: Record<string, [section: 'sorting' | 'appearance', key: string]> = {
  a: ['sorting', 'algorithm'],
  n: ['sorting', 'n'],
  p: ['sorting', 'pattern'],
  s: ['sorting', 'seed'],
  x: ['sorting', 'speed'],
  v: ['appearance', 'viz'],
  c: ['appearance', 'palette'],
  m: ['appearance', 'colorMode'],
};

export function buildShareUrl(): string {
  const st = useApp.getState().settings;
  const q = new URLSearchParams();
  for (const [k, [sec, key]] of Object.entries(MAP)) {
    const v = (st[sec] as any)[key];
    if (sec === 'sorting' && key === 'pattern' && v === 'custom') continue;
    q.set(k, String(v));
  }
  const base = typeof location !== 'undefined' && location.protocol.startsWith('http') ? `${location.origin}${location.pathname}` : 'https://sortclaude.local/';
  return `${base}?${q.toString()}#/visualizer`;
}

export function parseShareParams(search: string): Record<string, Record<string, unknown>> | null {
  const q = new URLSearchParams(search);
  const patch: Record<string, Record<string, unknown>> = {};
  let any = false;
  for (const [k, [sec, key]] of Object.entries(MAP)) {
    const raw = q.get(k);
    if (raw === null || raw.length > 64) continue;
    const enumPath = `${sec}.${key}`;
    if (ENUMS[enumPath] && !ENUMS[enumPath].includes(raw)) continue;
    (patch[sec] ??= {})[key] = raw;
    any = true;
  }
  return any ? patch : null;
}

export function applyUrlConfig() {
  try {
    const patch = parseShareParams(location.search);
    if (!patch) return;
    const cur = useApp.getState().settings;
    const merged = { ...cur, sorting: { ...cur.sorting, ...(patch.sorting ?? {}) }, appearance: { ...cur.appearance, ...(patch.appearance ?? {}) } };
    useApp.setState({ settings: sanitize(DEFAULT_SETTINGS, merged), page: 'visualizer' });
    history.replaceState(null, '', `${location.pathname}#/visualizer`);
  } catch {
    /* ignore malformed URLs */
  }
}
