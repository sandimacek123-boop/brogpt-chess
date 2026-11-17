import { Chess, Move } from 'chess.js';

/** Apply a UCI move (e2e4, e7e8q) and return the chess.js Move, or null if illegal. */
export function playUci(chess: Chess, uci: string): Move | null {
  if (uci.length < 4) return null;
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
  } catch {
    return null;
  }
}

/** Convert a UCI principal variation into SAN moves (stops at the first illegal move). */
export function pvToSan(fen: string, pv: string[], max = 12): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const m of pv.slice(0, max)) {
    const mv = playUci(c, m);
    if (!mv) break;
    out.push(mv.san);
  }
  return out;
}

/** Format SAN moves with move numbers, starting from a FEN's move number and side. */
export function numberedLine(fen: string, sans: string[]): string {
  const parts = fen.split(' ');
  let white = parts[1] !== 'b';
  let n = Number(parts[5]) || 1;
  const out: string[] = [];
  sans.forEach((s, i) => {
    if (white) out.push(`${n}. ${s}`);
    else out.push(i === 0 ? `${n}… ${s}` : s);
    if (!white) n++;
    white = !white;
  });
  return out.join(' ');
}

export function uciOf(m: Pick<Move, 'from' | 'to' | 'promotion'>): string {
  return m.from + m.to + (m.promotion ?? '');
}
