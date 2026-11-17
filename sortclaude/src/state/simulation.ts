import { create } from 'zustand';
import { generateKeys, parseCustomData } from '../engine/generators';
import { getAlgorithm, validateRun } from '../engine/registry';
import { SortWorker } from '../workers/client';
import { player } from './player';
import { useApp } from './store';
import type { Recording } from '../engine/runner';

export interface SimState {
  status: 'idle' | 'preparing' | 'building' | 'ready' | 'error';
  message: string;
  error: string | null;
  warning: string | null;
  info: { executionMs: number; opCount: number; truncated: boolean; auxPeak: number; sorted: boolean; algorithmId: string; n: number; seed: number } | null;
  initialKeys: Int32Array | null;
}

export const useSim = create<SimState>(() => ({
  status: 'idle',
  message: '',
  error: null,
  warning: null,
  info: null,
  initialKeys: null,
}));

let worker: SortWorker | null = null;
let seq = 0;

function getWorker() {
  const use = useApp.getState().settings.performance.useWorkers;
  if (!worker) worker = new SortWorker(use);
  return worker;
}

/** Build the dataset described by the current settings. */
export function currentKeys(): { keys: Int32Array; error?: string } {
  const s = useApp.getState().settings.sorting;
  if (s.pattern === 'custom') {
    const parsed = parseCustomData(s.customData);
    if ('error' in parsed) return { keys: new Int32Array(0), error: parsed.error };
    return { keys: generateKeys({ n: parsed.keys.length, pattern: 'custom', seed: s.seed, custom: parsed.keys }) };
  }
  return { keys: generateKeys({ n: s.n, pattern: s.pattern, seed: s.seed }) };
}

/**
 * Regenerate the dataset and record the selected algorithm. The previous recording keeps
 * playing until the new one is ready; a newer request supersedes an older one.
 */
export async function rebuild(opts: { autoplay?: boolean; keepPosition?: number } = {}): Promise<void> {
  const my = ++seq;
  const st = useApp.getState().settings;
  const algo = getAlgorithm(st.sorting.algorithm);
  const { keys, error } = currentKeys();
  if (error) {
    useSim.setState({ status: 'error', error, message: '' });
    return;
  }
  const invalid = validateRun(algo, keys, 'record');
  if (invalid) {
    useSim.setState({ status: 'error', error: invalid, message: '', initialKeys: keys });
    player.clear();
    return;
  }
  useSim.setState({ status: 'preparing', message: `Calculating ${algo.name} operations…`, error: null, warning: null, initialKeys: keys });
  let rec: Recording;
  try {
    rec = await getWorker().record(algo.id, keys, st.sorting.seed, 16_000_000, 25_000);
  } catch (e) {
    if (my !== seq) return;
    const msg = (e as Error).message;
    if (msg === 'Cancelled') return;
    useSim.setState({ status: 'error', error: `Could not calculate the sort: ${msg}`, message: '' });
    return;
  }
  if (my !== seq) return;
  if (rec.error && !rec.truncated) {
    useSim.setState({ status: 'error', error: rec.error, message: '' });
    return;
  }
  useSim.setState({ status: 'building', message: `Building timeline checkpoints (${rec.opCount.toLocaleString()} ops)…` });
  await new Promise((r) => setTimeout(r, 0));
  if (my !== seq) return;
  try {
    player.load(rec, st.performance.historyMB);
  } catch (e) {
    useSim.setState({ status: 'error', error: `Not enough memory to build the timeline: ${(e as Error).message}`, message: '' });
    return;
  }
  if (opts.keepPosition !== undefined) player.seek(opts.keepPosition);
  useSim.setState({
    status: 'ready',
    message: '',
    error: null,
    warning: rec.truncated ? rec.error ?? 'Recording truncated.' : null,
    info: { executionMs: rec.executionMs, opCount: rec.opCount, truncated: rec.truncated, auxPeak: rec.auxPeak, sorted: rec.sorted, algorithmId: algo.id, n: keys.length, seed: st.sorting.seed },
  });
  if (opts.autoplay) player.play();
}

export function cancelBuild() {
  seq++;
  worker?.cancel();
  useSim.setState({ status: 'idle', message: '' });
}
