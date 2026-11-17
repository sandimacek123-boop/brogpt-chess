import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { formatScore, parseBestMove, parseInfo, scoreToCp } from '../src/engine/uci';
import { classify, gameAccuracy, moveAccuracy, winPercent } from '../src/chess/review';
import { findOpening, isBookPly, OPENINGS } from '../src/chess/openings';
import { numberedLine, pvToSan } from '../src/chess/san';
import { explainMove, hangingPieces, material, materialSwing } from '../src/chess/explain';

describe('UCI parsing', () => {
  it('parses scores, multipv and pv, converting to White POV', () => {
    const l = 'info depth 18 seldepth 25 multipv 2 score cp -35 nodes 1000 nps 50000 hashfull 3 tbhits 0 time 20 pv e7e5 g1f3 b8c6';
    const w = parseInfo(l, true)!;
    expect(w).toMatchObject({ depth: 18, multipv: 2, score: { type: 'cp', value: -35 }, pv: ['e7e5', 'g1f3', 'b8c6'] });
    const b = parseInfo(l, false)!;
    expect(b.score).toEqual({ type: 'cp', value: 35 });
    expect(b.raw).toEqual({ type: 'cp', value: -35 });
  });
  it('handles mate scores and bounds and ignores non-score lines', () => {
    expect(parseInfo('info depth 5 score mate 3 pv h5f7', true)!.score).toEqual({ type: 'mate', value: 3 });
    expect(parseInfo('info depth 5 score mate 3 pv h5f7', false)!.score).toEqual({ type: 'mate', value: -3 });
    expect(parseInfo('info depth 9 score cp 20 lowerbound pv e2e4', true)!.bound).toBe('lower');
    expect(parseInfo('info string NNUE evaluation using nn.nnue', true)).toBeNull();
    expect(parseInfo('info depth 10 currmove e2e4 currmovenumber 1', true)).toBeNull();
  });
  it('parses bestmove', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ best: 'e2e4', ponder: 'e7e5' });
    expect(parseBestMove('bestmove (none)')).toEqual({ best: null, ponder: undefined });
    expect(parseBestMove('info depth 1')).toBeNull();
  });
  it('formats scores', () => {
    expect(formatScore({ type: 'cp', value: 123 })).toBe('+1.23');
    expect(formatScore({ type: 'cp', value: -50 })).toBe('−0.50');
    expect(formatScore({ type: 'cp', value: 0 })).toBe('0.00');
    expect(formatScore({ type: 'mate', value: 2 })).toBe('M2');
    expect(formatScore({ type: 'mate', value: -4 })).toBe('−M4');
    expect(scoreToCp({ type: 'mate', value: 1 })).toBeGreaterThan(scoreToCp({ type: 'mate', value: 5 }));
    expect(scoreToCp({ type: 'mate', value: -1 })).toBeLessThan(scoreToCp({ type: 'cp', value: -900 }));
  });
});

describe('review maths', () => {
  it('maps evaluations to win probability', () => {
    expect(winPercent({ type: 'cp', value: 0 })).toBeCloseTo(50, 6);
    expect(winPercent({ type: 'cp', value: 300 })).toBeGreaterThan(70);
    expect(winPercent({ type: 'cp', value: -300 })).toBeLessThan(30);
    expect(winPercent({ type: 'mate', value: 3 })).toBe(100);
    expect(winPercent({ type: 'mate', value: -3 })).toBe(0);
    expect(winPercent({ type: 'cp', value: 5000 })).toBe(winPercent({ type: 'cp', value: 1000 }));
  });
  it('per-move accuracy is 100 for no loss and falls with larger drops', () => {
    expect(moveAccuracy(60, 60)).toBe(100);
    expect(moveAccuracy(60, 70)).toBe(100);
    expect(moveAccuracy(60, 50)).toBeLessThan(moveAccuracy(60, 55));
    expect(moveAccuracy(100, 0)).toBe(0);
  });
  it('classifies by win% drop', () => {
    const base = { playedIsBest: false, legalMoves: 20, isBook: false };
    expect(classify({ ...base, moverWinBefore: 50, moverWinAfter: 50, playedIsBest: true })).toBe('best');
    expect(classify({ ...base, moverWinBefore: 50, moverWinAfter: 49 })).toBe('excellent');
    expect(classify({ ...base, moverWinBefore: 50, moverWinAfter: 47 })).toBe('good');
    expect(classify({ ...base, moverWinBefore: 50, moverWinAfter: 44 })).toBe('inaccuracy');
    expect(classify({ ...base, moverWinBefore: 50, moverWinAfter: 38 })).toBe('mistake');
    expect(classify({ ...base, moverWinBefore: 50, moverWinAfter: 20 })).toBe('blunder');
    expect(classify({ ...base, moverWinBefore: 50, moverWinAfter: 20, legalMoves: 1 })).toBe('forced');
    expect(classify({ ...base, moverWinBefore: 50, moverWinAfter: 20, isBook: true })).toBe('book');
  });
  it('applies the mate-created / mate-lost rules', () => {
    const base = { playedIsBest: false, legalMoves: 20, isBook: false };
    // walking into mate from a merely worse position is a blunder even if win% barely moves
    expect(classify({ ...base, moverWinBefore: 7, moverWinAfter: 0, moverBefore: { type: 'cp', value: -640 }, moverAfter: { type: 'mate', value: -2 } })).toBe('blunder');
    expect(classify({ ...base, moverWinBefore: 3, moverWinAfter: 0, moverBefore: { type: 'cp', value: -800 }, moverAfter: { type: 'mate', value: -2 } })).toBe('mistake');
    expect(classify({ ...base, moverWinBefore: 1, moverWinAfter: 0, moverBefore: { type: 'cp', value: -1500 }, moverAfter: { type: 'mate', value: -5 } })).toBe('inaccuracy');
    // letting a forced mate go but staying totally winning is only an inaccuracy
    expect(classify({ ...base, moverWinBefore: 100, moverWinAfter: 98, moverBefore: { type: 'mate', value: 3 }, moverAfter: { type: 'cp', value: 1200 } })).toBe('inaccuracy');
    expect(classify({ ...base, moverWinBefore: 100, moverWinAfter: 60, moverBefore: { type: 'mate', value: 3 }, moverAfter: { type: 'cp', value: 100 } })).toBe('blunder');
    // the engine's best move is never penalised
    expect(classify({ ...base, playedIsBest: true, moverWinBefore: 7, moverWinAfter: 0, moverBefore: { type: 'cp', value: -640 }, moverAfter: { type: 'mate', value: -2 } })).toBe('best');
  });
  it('game accuracy punishes blunders', () => {
    expect(gameAccuracy([])).toBeNull();
    expect(gameAccuracy([100, 100, 100])).toBeCloseTo(100, 6);
    expect(gameAccuracy([100, 100, 5])!).toBeLessThan(70);
  });
});

describe('opening book', () => {
  it('every line is legal from the start position', () => {
    for (const o of OPENINGS) {
      const c = new Chess();
      for (const m of o.moves) expect(() => c.move(m), `${o.name}: ${m}`).not.toThrow();
      // SAN must round-trip exactly (including + and capture marks)
      const replay = new Chess();
      const sans = o.moves.map((m) => replay.move(m).san);
      expect(sans, o.name).toEqual(o.moves);
    }
  });
  it('finds the most specific match and book plies', () => {
    expect(findOpening(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3'])!.name).toBe('Sicilian Defense: Najdorf Variation');
    expect(findOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'])!.name).toBe('Ruy Lopez');
    expect(findOpening(['h4'])).toBeNull();
    const h = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'h6'];
    expect(isBookPly(h, 5)).toBe(true);
    expect(isBookPly(h, 6)).toBe(false);
  });
});

describe('SAN helpers', () => {
  it('converts UCI lines and numbers them', () => {
    const start = new Chess().fen();
    expect(pvToSan(start, ['e2e4', 'e7e5', 'g1f3', 'zzzz', 'b8c6'])).toEqual(['e4', 'e5', 'Nf3']);
    expect(numberedLine(start, ['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3');
    const black = new Chess();
    black.move('e4');
    expect(numberedLine(black.fen(), ['c5', 'Nf3'])).toBe('1… c5 2. Nf3');
    const promo = '8/P7/8/8/8/8/8/k6K w - - 0 1';
    expect(pvToSan(promo, ['a7a8q'])).toEqual(['a8=Q+']);
  });
});

describe('coach explanations', () => {
  it('measures material and swings', () => {
    expect(material(new Chess())).toBe(0);
    // 1.e4 d5 2.exd5 wins a pawn for White
    expect(materialSwing('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', ['e4d5'], 'w')).toBe(1);
  });
  it('detects an undefended attacked piece', () => {
    // White knight on e5 attacked by black queen on e7, not defended
    const c = new Chess('4k3/4q3/8/4N3/8/8/8/4K3 w - - 0 1');
    expect(hangingPieces(c, 'w')).toEqual([{ square: 'e5', type: 'n' }]);
  });
  it('recognises checkmate', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 2 4';
    const notes = explainMove({
      fenBefore: fen.replace('2n5/4p2Q', '2n2n2/4p2Q').replace('r1bqkbnr', 'r1bqkb1r'),
      playedUci: 'h5f7',
      cls: 'best',
      bestUci: 'h5f7',
      bestPv: ['h5f7'],
      scoreBefore: { type: 'mate', value: 1 },
      scoreAfter: { type: 'mate', value: 0 },
      replyPv: [],
    });
    expect(notes).toEqual(['Qxf7# is checkmate.']);
  });
  it('explains a blunder that hangs the queen', () => {
    // White plays Qh5?? into ...Nxh5? Construct: white queen to g4 where black bishop on c8 attacks g4
    const fenBefore = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const notes = explainMove({
      fenBefore,
      playedUci: 'd1g4',
      cls: 'blunder',
      bestUci: 'g1f3',
      bestPv: ['g1f3', 'b8c6'],
      scoreBefore: { type: 'cp', value: 30 },
      scoreAfter: { type: 'cp', value: -850 },
      replyPv: ['d7d5', 'g4g3', 'c8g4'],
    });
    expect(notes.some((n) => n.startsWith('Better was Nf3'))).toBe(true);
    expect(notes[notes.length - 1]).toBe('Evaluation: +0.30 → −8.50.');
  });
  it('explains a missed mate', () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    const notes = explainMove({
      fenBefore: fen,
      playedUci: 'd2d3',
      cls: 'blunder',
      bestUci: 'h5f7',
      bestPv: ['h5f7'],
      scoreBefore: { type: 'mate', value: 1 },
      scoreAfter: { type: 'cp', value: -300 },
      replyPv: ['f6h5'],
    });
    expect(notes[0]).toBe('This misses a forced mate in 1, starting with Qxf7#.');
    expect(notes.some((n) => n.includes('reply Nxh5') && n.includes('wins the queen'))).toBe(true);
  });
});
