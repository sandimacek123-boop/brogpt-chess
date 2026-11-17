/** Engine evaluation from White's point of view. */
export type Score = { type: 'cp'; value: number } | { type: 'mate'; value: number };

export interface PvLine {
  multipv: number;
  depth: number;
  seldepth?: number;
  nodes?: number;
  nps?: number;
  /** Score from the side-to-move's point of view, exactly as reported by the engine. */
  raw: Score;
  /** Score from White's point of view. */
  score: Score;
  bound?: 'lower' | 'upper';
  pv: string[];
}

/**
 * Parse a UCI `info` line. Returns null for info lines without a score and pv
 * (e.g. `info string …` or `info currmove …`).
 */
export function parseInfo(line: string, whiteToMove: boolean): PvLine | null {
  if (!line.startsWith('info ')) return null;
  const t = line.split(/\s+/);
  let depth = -1;
  let seldepth: number | undefined;
  let multipv = 1;
  let nodes: number | undefined;
  let nps: number | undefined;
  let raw: Score | null = null;
  let bound: 'lower' | 'upper' | undefined;
  let pv: string[] = [];
  for (let i = 1; i < t.length; i++) {
    const k = t[i];
    if (k === 'depth') depth = Number(t[++i]);
    else if (k === 'seldepth') seldepth = Number(t[++i]);
    else if (k === 'multipv') multipv = Number(t[++i]);
    else if (k === 'nodes') nodes = Number(t[++i]);
    else if (k === 'nps') nps = Number(t[++i]);
    else if (k === 'score') {
      const kind = t[++i];
      const v = Number(t[++i]);
      if (kind === 'cp' || kind === 'mate') raw = { type: kind, value: v };
      if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') bound = t[++i] === 'lowerbound' ? 'lower' : 'upper';
    } else if (k === 'pv') {
      pv = t.slice(i + 1).filter(Boolean);
      break;
    } else if (k === 'string') return null;
  }
  if (!raw || depth < 0 || pv.length === 0) return null;
  const score: Score = whiteToMove ? raw : { type: raw.type, value: -raw.value };
  return { multipv, depth, seldepth, nodes, nps, raw, score, bound, pv };
}

export function parseBestMove(line: string): { best: string | null; ponder?: string } | null {
  if (!line.startsWith('bestmove')) return null;
  const t = line.split(/\s+/);
  const best = t[1] && t[1] !== '(none)' ? t[1] : null;
  const pi = t.indexOf('ponder');
  return { best, ponder: pi > 0 ? t[pi + 1] : undefined };
}

/** Centipawn-equivalent for sorting / charts (mate = ±10000 minus distance). */
export function scoreToCp(s: Score): number {
  if (s.type === 'cp') return s.value;
  if (s.value === 0) return 0;
  return s.value > 0 ? 10000 - s.value * 10 : -10000 - s.value * 10;
}

export function formatScore(s: Score): string {
  if (s.type === 'mate') {
    if (s.value === 0) return '#';
    return s.value > 0 ? `M${s.value}` : `−M${-s.value}`;
  }
  const v = s.value / 100;
  if (Math.abs(v) < 0.005) return '0.00';
  return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2);
}
