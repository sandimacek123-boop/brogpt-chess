import { describe, expect, it } from 'vitest';
import { emptyLine, fenAt, isThreefold, lineFromFen, lineFromPgn, lineToPgn, playAt, resultOf, START_FEN } from '../src/chess/line';

const OPERA = `[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

describe('game lines', () => {
  it('loads a PGN with headers and ends in checkmate', () => {
    const l = lineFromPgn(OPERA);
    expect(l.plies).toHaveLength(33);
    expect(l.headers.White).toBe('Paul Morphy');
    expect(l.plies[32].san).toBe('Rd8#');
    expect(resultOf(fenAt(l, 33))).toEqual({ result: '1-0', reason: 'Checkmate' });
    expect(fenAt(l, 0)).toBe(START_FEN);
    expect(l.plies[0].before).toBe(START_FEN);
  });
  it('round-trips through PGN export', () => {
    const l = lineFromPgn(OPERA);
    const again = lineFromPgn(lineToPgn(l));
    expect(again.plies.map((p) => p.san)).toEqual(l.plies.map((p) => p.san));
  });
  it('plays moves, truncating the future, and rejects illegal ones', () => {
    let l = emptyLine();
    l = playAt(l, 0, 'e2e4')!;
    l = playAt(l, 1, 'e7e5')!;
    expect(l.plies.map((p) => p.san)).toEqual(['e4', 'e5']);
    const branched = playAt(l, 1, 'c7c5')!;
    expect(branched.plies.map((p) => p.san)).toEqual(['e4', 'c5']);
    expect(playAt(l, 2, 'e1e3')).toBeNull();
  });
  it('handles promotion and FEN starts', () => {
    const l = playAt(lineFromFen('8/P7/8/8/8/8/8/k6K w - - 0 1'), 0, 'a7a8n')!;
    expect(l.plies[0].san).toBe('a8=N');
    expect(() => lineFromFen('not a fen')).toThrow();
    const pgn = lineToPgn(l);
    expect(pgn).toContain('[FEN "8/P7/8/8/8/8/8/k6K w - - 0 1"]');
    expect(lineFromPgn(pgn).plies[0].san).toBe('a8=N');
  });
  it('detects draws', () => {
    expect(resultOf('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toEqual({ result: '1/2-1/2', reason: 'Stalemate' });
    expect(resultOf('8/8/8/4k3/8/8/8/4K3 w - - 0 1')!.reason).toBe('Insufficient material');
    let l = emptyLine();
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
    shuffle.forEach((m, i) => (l = playAt(l, i, m)!));
    expect(isThreefold(l, 8)).toBe(true);
    expect(isThreefold(l, 4)).toBe(false);
  });
});
