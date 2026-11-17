import type { Score } from '../engine/uci';

/**
 * Win probability (0–100) for White from an evaluation, using the logistic model
 * lichess uses for its accuracy metric: 50 + 50 · (2 / (1 + e^(−0.00368208·cp)) − 1).
 * Centipawns are clamped to ±1000; forced mates count as 100 / 0.
 */
export function winPercent(s: Score): number {
  if (s.type === 'mate') {
    if (s.value === 0) return 50;
    return s.value > 0 ? 100 : 0;
  }
  if (Math.abs(s.value) >= 100000) return s.value > 0 ? 100 : 0; // checkmate on the board
  const cp = Math.max(-1000, Math.min(1000, s.value));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Per-move accuracy (0–100) from the mover's win% before and after (lichess formula). */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669 + 1; // +1 uncertainty bonus, as on lichess
  return Math.max(0, Math.min(100, acc));
}

export type MoveClass = 'book' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced';

export const CLASS_INFO: Record<MoveClass, { label: string; symbol: string; color: string }> = {
  book: { label: 'Book', symbol: '📖', color: '#b39b7a' },
  forced: { label: 'Forced', symbol: '□', color: '#9a9ab0' },
  best: { label: 'Best', symbol: '★', color: '#5fd38d' },
  excellent: { label: 'Excellent', symbol: '!', color: '#78c88a' },
  good: { label: 'Good', symbol: '✓', color: '#9fb7a6' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f2c94c' },
  mistake: { label: 'Mistake', symbol: '?', color: '#f2994a' },
  blunder: { label: 'Blunder', symbol: '??', color: '#eb5757' },
};

/**
 * Classify a move by how much it lowered the mover's winning chances (in win%
 * points). Thresholds follow lichess's advice levels (0.1 / 0.2 / 0.3 in
 * winning-chance units = 5 / 10 / 15 win% points).
 */
export function classify(opts: {
  moverWinBefore: number;
  moverWinAfter: number;
  playedIsBest: boolean;
  legalMoves: number;
  isBook: boolean;
  /** Evaluations from the mover's point of view (enable the mate rules). */
  moverBefore?: Score;
  moverAfter?: Score;
}): MoveClass {
  if (opts.isBook) return 'book';
  if (opts.legalMoves === 1) return 'forced';
  const drop = opts.moverWinBefore - opts.moverWinAfter;
  if (opts.playedIsBest || drop <= 0.5) return 'best';
  const b = opts.moverBefore;
  const a = opts.moverAfter;
  if (b && a) {
    const mated = (s: Score) => (s.type === 'mate' && s.value < 0) || (s.type === 'cp' && s.value <= -100000);
    const mating = (s: Score) => (s.type === 'mate' && s.value > 0) || (s.type === 'cp' && s.value >= 100000);
    // Lichess "mate created": walking into a forced mate, graded by how lost it already was.
    if (mated(a) && !mated(b) && b.type === 'cp') {
      if (b.value < -999) return worst('inaccuracy', drop);
      if (b.value < -700) return worst('mistake', drop);
      return 'blunder';
    }
    // Lichess "mate lost": having a forced mate and letting it go.
    if (mating(b) && !mating(a) && a.type === 'cp') {
      if (a.value > 999) return worst('inaccuracy', drop);
      if (a.value > 700) return worst('mistake', drop);
      return 'blunder';
    }
  }
  return byDrop(drop);
}

const SEVERITY: MoveClass[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];

function byDrop(drop: number): MoveClass {
  if (drop <= 0.5) return 'best';
  if (drop >= 15) return 'blunder';
  if (drop >= 10) return 'mistake';
  if (drop >= 5) return 'inaccuracy';
  if (drop < 2) return 'excellent';
  return 'good';
}

/** The more severe of a floor class and the class implied by the win% drop. */
function worst(floor: MoveClass, drop: number): MoveClass {
  const d = byDrop(drop);
  return SEVERITY.indexOf(d) > SEVERITY.indexOf(floor) ? d : floor;
}

/**
 * Game accuracy for one side: the average of the arithmetic and harmonic means of its
 * per-move accuracies (the harmonic mean makes a few blunders count heavily).
 */
export function gameAccuracy(moveAccs: number[]): number | null {
  if (moveAccs.length === 0) return null;
  const mean = moveAccs.reduce((a, b) => a + b, 0) / moveAccs.length;
  const harmonic = moveAccs.length / moveAccs.reduce((a, b) => a + 1 / Math.max(1, b), 0);
  return (mean + harmonic) / 2;
}
