import { Chess } from 'chess.js';
import { playUci } from './san';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface Ply {
  san: string;
  uci: string;
  from: string;
  to: string;
  /** Position after this move. */
  fen: string;
  /** Position before this move. */
  before: string;
}

/** A linear game: start position plus moves. positions[i] = position after i plies. */
export interface Line {
  startFen: string;
  plies: Ply[];
  headers: Record<string, string>;
}

export function emptyLine(fen = START_FEN): Line {
  return { startFen: fen, plies: [], headers: {} };
}

export function fenAt(line: Line, ply: number): string {
  return ply <= 0 ? line.startFen : line.plies[ply - 1].fen;
}

/** Append a UCI move after ply `at` (dropping any later moves). Returns null if illegal. */
export function playAt(line: Line, at: number, uci: string): Line | null {
  const c = new Chess(fenAt(line, at));
  const before = c.fen();
  const m = playUci(c, uci);
  if (!m) return null;
  const ply: Ply = { san: m.san, uci: m.from + m.to + (m.promotion ?? ''), from: m.from, to: m.to, fen: c.fen(), before };
  return { ...line, plies: [...line.plies.slice(0, at), ply] };
}

export function lineFromPgn(pgn: string): Line {
  const c = new Chess();
  c.loadPgn(pgn.trim());
  const headers = c.getHeaders() as Record<string, string>;
  const startFen = headers.FEN && headers.SetUp !== '0' ? headers.FEN : START_FEN;
  const plies: Ply[] = c.history({ verbose: true }).map((m) => ({
    san: m.san,
    uci: m.from + m.to + (m.promotion ?? ''),
    from: m.from,
    to: m.to,
    fen: m.after,
    before: m.before,
  }));
  return { startFen, plies, headers };
}

export function lineFromFen(fen: string): Line {
  const c = new Chess(fen); // throws on invalid FEN
  return emptyLine(c.fen());
}

export function lineToPgn(line: Line, extraHeaders: Record<string, string> = {}): string {
  const c = new Chess(line.startFen);
  const headers = { ...line.headers, ...extraHeaders };
  for (const [k, v] of Object.entries(headers)) c.setHeader(k, v);
  if (line.startFen !== START_FEN) {
    c.setHeader('SetUp', '1');
    c.setHeader('FEN', line.startFen);
  }
  for (const p of line.plies) c.move(p.san);
  return c.pgn();
}

/** Game result string for a position, or null if the game is not over. */
export function resultOf(fen: string): { result: '1-0' | '0-1' | '1/2-1/2'; reason: string } | null {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { result: c.turn() === 'w' ? '0-1' : '1-0', reason: 'Checkmate' };
  if (c.isStalemate()) return { result: '1/2-1/2', reason: 'Stalemate' };
  if (c.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'Insufficient material' };
  if (c.isDrawByFiftyMoves()) return { result: '1/2-1/2', reason: 'Fifty-move rule' };
  return null;
}

/** Threefold repetition across a line (needs history, so it is checked on the line). */
export function isThreefold(line: Line, ply: number): boolean {
  const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
  const target = key(fenAt(line, ply));
  let count = 0;
  for (let i = 0; i <= ply; i++) if (key(fenAt(line, i)) === target) count++;
  return count >= 3;
}
