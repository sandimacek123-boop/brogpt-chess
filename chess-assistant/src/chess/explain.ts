import { Chess, Color, PieceSymbol, Square } from 'chess.js';
import { formatScore, Score } from '../engine/uci';
import type { MoveClass } from './review';
import { playUci, pvToSan } from './san';

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** Material balance (White minus Black) in pawns. */
export function material(chess: Chess): number {
  let s = 0;
  for (const row of chess.board()) for (const p of row) if (p) s += (p.color === 'w' ? 1 : -1) * VALUE[p.type];
  return s;
}

/** Material change for `color` after playing up to `plies` moves of a UCI line from `fen`. */
export function materialSwing(fen: string, pv: string[], color: Color, plies = 4): number {
  const c = new Chess(fen);
  const before = material(c);
  for (const m of pv.slice(0, plies)) if (!playUci(c, m)) break;
  const diff = material(c) - before;
  return color === 'w' ? diff : -diff;
}

function describeGain(n: number): string {
  if (n >= 9) return 'wins the queen';
  if (n >= 5) return 'wins a rook';
  if (n === 2) return 'wins the exchange';
  if (n >= 3) return 'wins a piece';
  if (n >= 2) return 'wins two pawns';
  return 'wins a pawn';
}

/** Undefended mover pieces (not pawns/king) that the opponent attacks after the move. */
export function hangingPieces(chess: Chess, mover: Color): { square: Square; type: PieceSymbol }[] {
  const out: { square: Square; type: PieceSymbol }[] = [];
  const opp: Color = mover === 'w' ? 'b' : 'w';
  for (const row of chess.board())
    for (const p of row) {
      if (!p || p.color !== mover || p.type === 'k' || p.type === 'p') continue;
      if (chess.isAttacked(p.square, opp) && !chess.isAttacked(p.square, mover)) out.push({ square: p.square, type: p.type });
    }
  return out;
}

const moverScore = (s: Score, mover: Color): Score => (mover === 'w' ? s : { type: s.type, value: -s.value });

export interface ExplainInput {
  fenBefore: string;
  playedUci: string;
  cls: MoveClass;
  /** Engine's best move and line in the position before the move. */
  bestUci: string | null;
  bestPv: string[];
  /** Evaluations (White's point of view) before and after the move. */
  scoreBefore: Score;
  scoreAfter: Score;
  /** Engine's best line for the opponent after the move. */
  replyPv: string[];
}

/** Plain-language coach notes for a move, derived only from the position and engine output. */
export function explainMove(x: ExplainInput): string[] {
  const notes: string[] = [];
  const before = new Chess(x.fenBefore);
  const mover = before.turn();
  const after = new Chess(x.fenBefore);
  const mv = playUci(after, x.playedUci);
  if (!mv) return ['That move is not legal in this position.'];
  if (after.isCheckmate()) return [`${mv.san} is checkmate.`];
  if (after.isStalemate()) notes.push(`${mv.san} stalemates the opponent, so the game is drawn.`);

  const sb = moverScore(x.scoreBefore, mover);
  const sa = moverScore(x.scoreAfter, mover);
  const bestSan = x.bestUci ? pvToSan(x.fenBefore, [x.bestUci])[0] : undefined;
  const bad = x.cls === 'inaccuracy' || x.cls === 'mistake' || x.cls === 'blunder';

  // Mates
  if (sb.type === 'mate' && sb.value > 0 && !(sa.type === 'mate' && sa.value > 0)) {
    notes.push(`This misses a forced mate in ${sb.value}${bestSan ? `, starting with ${bestSan}` : ''}.`);
  } else if (sa.type === 'mate' && sa.value < 0 && !(sb.type === 'mate' && sb.value < 0)) {
    const line = pvToSan(after.fen(), x.replyPv, 6);
    notes.push(`This allows mate in ${-sa.value}${line.length ? `: ${line.join(' ')}` : ''}.`);
  } else if (sa.type === 'mate' && sa.value > 0 && x.cls !== 'book') {
    notes.push(`Forced mate in ${sa.value} is on the board.`);
  }

  // What the opponent's best reply does to material
  if (bad && x.replyPv.length) {
    const swing = materialSwing(after.fen(), x.replyPv, mover, 4);
    if (swing <= -1) {
      const reply = pvToSan(after.fen(), x.replyPv, 1)[0];
      notes.push(`It lets ${mover === 'w' ? 'Black' : 'White'} reply ${reply}, which ${describeGain(-swing)}.`);
    }
    const hanging = hangingPieces(after, mover);
    if (hanging.length && swing <= -2) {
      const h = hanging.sort((a, b) => VALUE[b.type] - VALUE[a.type])[0];
      notes.push(`Your ${NAME[h.type]} on ${h.square} is attacked and undefended.`);
    }
  }

  // What the best move would have done
  if (bad && x.bestUci && x.bestUci !== x.playedUci && bestSan) {
    const gain = materialSwing(x.fenBefore, x.bestPv.length ? x.bestPv : [x.bestUci], mover, 4);
    const line = pvToSan(x.fenBefore, x.bestPv, 4);
    let s = `Better was ${bestSan}`;
    if (gain >= 1) s += `, which ${describeGain(gain)}`;
    else if (bestSan.endsWith('+')) s += ', with check';
    if (line.length > 1) s += ` (${line.join(' ')})`;
    notes.push(s + '.');
  }

  if (mv.captured && !bad) notes.push(`${mv.san} captures a ${NAME[mv.captured as PieceSymbol]}.`);
  if (after.inCheck() && !after.isCheckmate() && !bad) notes.push(`${mv.san} gives check.`);
  if (mv.san.startsWith('O-O')) notes.push('Castling tucks the king away and connects the rooks.');

  if (x.cls === 'best') notes.push(`This is the engine's top choice.`);
  else if (x.cls === 'excellent') notes.push('Nearly as strong as the engine’s top choice.');
  else if (x.cls === 'good' && bestSan) notes.push(`A reasonable move; ${bestSan} was slightly more precise.`);
  else if (x.cls === 'book') notes.push('A well-known opening move.');
  else if (x.cls === 'forced') notes.push('The only legal move.');

  notes.push(`Evaluation: ${formatScore(x.scoreBefore)} → ${formatScore(x.scoreAfter)}.`);
  return notes;
}
