import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board, { Arrow, Orientation } from '../ui/Board';
import EvalBar from '../ui/EvalBar';
import EvalGraph from '../ui/EvalGraph';
import MoveList from '../ui/MoveList';
import { Button, Panel, Segmented } from '../ui/controls';
import { engine } from '../engine/instance';
import { EngineCancelled } from '../engine/engine';
import { formatScore, Score } from '../engine/uci';
import { fenAt, Line, lineFromPgn, resultOf } from '../chess/line';
import { CLASS_INFO, classify, gameAccuracy, MoveClass, moveAccuracy, winPercent } from '../chess/review';
import { findOpening, isBookPly } from '../chess/openings';
import { explainMove } from '../chess/explain';
import { pvToSan } from '../chess/san';
import { navigate, useStore } from '../state/store';

export const SAMPLE_PGN = `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

interface PosEval {
  score: Score;
  best: string | null;
  pv: string[];
}

interface MoveReview {
  cls: MoveClass;
  accuracy: number;
  notes: string[];
}

/** Score for a finished position (no engine search possible). */
function terminalScore(fen: string): Score | null {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { type: 'cp', value: c.turn() === 'w' ? -100000 : 100000 };
  if (c.isStalemate() || c.isInsufficientMaterial()) return { type: 'cp', value: 0 };
  return null;
}

const negate = (s: Score): Score => ({ type: s.type, value: -s.value });

function label(s: Score): string {
  if (s.type === 'cp' && Math.abs(s.value) >= 100000) return '#';
  return formatScore(s);
}

const SUMMARY_CLASSES: MoveClass[] = ['best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder'];

export default function ReviewPage() {
  const store = useStore();
  const [pgnText, setPgnText] = useState('');
  const [line, setLine] = useState<Line | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depth, setDepth] = useState(14);
  const [evals, setEvals] = useState<(PosEval | null)[]>([]);
  const [running, setRunning] = useState(false);
  const [refining, setRefining] = useState(false);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>('white');
  const runId = useRef(0);
  const startedAt = useRef(0);

  const start = (text: string, d = depth) => {
    let l: Line;
    try {
      l = lineFromPgn(text);
    } catch (e) {
      setError(`That PGN could not be read: ${(e as Error).message}`);
      return;
    }
    if (l.plies.length === 0) {
      setError('That PGN has no moves.');
      return;
    }
    setError(null);
    setLine(l);
    setPly(0);
    setEvals(Array(l.plies.length + 1).fill(null));
    void analyse(l, d);
  };

  const analyse = async (l: Line, d: number) => {
    const id = ++runId.current;
    setRunning(true);
    startedAt.current = performance.now();
    engine.newGame();
    const out: (PosEval | null)[] = Array(l.plies.length + 1).fill(null);
    const evalAt = async (i: number, searchDepth: number): Promise<PosEval> => {
      const fen = fenAt(l, i);
      const t = terminalScore(fen);
      if (t) return { score: t, best: null, pv: [] };
      const r = await engine.search({ fen, depth: searchDepth, multipv: 1 });
      const top = r.lines[0];
      return { score: top ? top.score : { type: 'cp', value: 0 }, best: r.best, pv: top ? top.pv : r.best ? [r.best] : [] };
    };
    try {
      // 1) Last position first: later refutations (e.g. a sacrificial mate) are then already
      //    in the engine's hash table when it searches the earlier positions.
      for (let i = l.plies.length; i >= 0; i--) {
        out[i] = await evalAt(i, d);
        if (id !== runId.current) return;
        setEvals([...out]);
      }
      // 2) Consistency pass: if the engine's own best move turns out to lose a lot, or a
      //    played move gains a lot, the earlier search missed something; search deeper.
      setRefining(true);
      let budget = 16;
      for (let i = l.plies.length - 1; i >= 0 && budget > 0; i--) {
        const a = out[i]!;
        const b = out[i + 1]!;
        const whiteMoved = fenAt(l, i).split(' ')[1] === 'w';
        const before = whiteMoved ? winPercent(a.score) : 100 - winPercent(a.score);
        const after = whiteMoved ? winPercent(b.score) : 100 - winPercent(b.score);
        const playedBest = a.best === l.plies[i].uci;
        if ((playedBest && before - after > 8) || after - before > 8) {
          budget--;
          out[i] = await evalAt(i, d + 6);
          if (id !== runId.current) return;
          setEvals([...out]);
        }
      }
    } catch (e) {
      if (!(e instanceof EngineCancelled)) setError(engine.failed ?? (e as Error).message);
    } finally {
      if (id === runId.current) {
        setRunning(false);
        setRefining(false);
      }
    }
  };

  // PGN handed over from Play / Analyze
  useEffect(() => {
    if (store.reviewPgn) {
      setPgnText(store.reviewPgn);
      start(store.reviewPgn);
      store.setReviewPgn(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.reviewPgn]);

  useEffect(
    () => () => {
      runId.current++;
      engine.stop();
    },
    [],
  );

  // Per-move review once both surrounding positions are evaluated
  const reviews: (MoveReview | undefined)[] = useMemo(() => {
    if (!line) return [];
    const sans = line.plies.map((p) => p.san);
    return line.plies.map((p, i) => {
      const a = evals[i];
      const b = evals[i + 1];
      if (!a || !b) return undefined;
      const mover = new Chess(p.before).turn();
      const wb = winPercent(a.score);
      const wa = winPercent(b.score);
      const moverBefore = mover === 'w' ? wb : 100 - wb;
      const moverAfter = mover === 'w' ? wa : 100 - wa;
      const cls = classify({
        moverWinBefore: moverBefore,
        moverWinAfter: moverAfter,
        playedIsBest: a.best === p.uci,
        legalMoves: new Chess(p.before).moves().length,
        isBook: isBookPly(sans, i + 1),
        moverBefore: mover === 'w' ? a.score : negate(a.score),
        moverAfter: mover === 'w' ? b.score : negate(b.score),
      });
      const notes = explainMove({
        fenBefore: p.before,
        playedUci: p.uci,
        cls,
        bestUci: a.best,
        bestPv: a.pv,
        scoreBefore: a.score,
        scoreAfter: b.score,
        replyPv: b.pv,
      }).map((n) => n.replace(/[+−]?100000\.00|[+−]1000\.00/g, '#'));
      return { cls, accuracy: moveAccuracy(moverBefore, moverAfter), notes };
    });
  }, [line, evals]);

  const done = evals.length > 0 && evals.every(Boolean) && !running;
  const analysed = evals.filter(Boolean).length;
  const elapsed = (performance.now() - startedAt.current) / 1000;
  const eta = analysed > 1 && running ? Math.round((elapsed / analysed) * (evals.length - analysed)) : null;

  const sideStats = (color: 'w' | 'b') => {
    if (!line) return null;
    const accs: number[] = [];
    const counts: Partial<Record<MoveClass, number>> = {};
    line.plies.forEach((p, i) => {
      const r = reviews[i];
      if (!r || new Chess(p.before).turn() !== color) return;
      accs.push(r.accuracy);
      counts[r.cls] = (counts[r.cls] ?? 0) + 1;
    });
    return { accuracy: gameAccuracy(accs), counts };
  };

  // Keyboard
  useEffect(() => {
    if (!line) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
      else if (e.key === 'ArrowRight') setPly((p) => Math.min(line.plies.length, p + 1));
      else if (e.key === 'Home') setPly(0);
      else if (e.key === 'End') setPly(line.plies.length);
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [line]);

  /* ---------------------------------------------------------- input screen */
  if (!line) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="fade-up">
          <div className="kicker">Game review</div>
          <h1 className="mt-3 font-display text-[64px] font-semibold leading-[0.95] tracking-[-0.045em] text-white">
            Where did it
            <br />
            <span className="text-ink-500">go wrong?</span>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-300">
            Paste a game in PGN. Stockfish checks every position, marks inaccuracies, mistakes and blunders, scores each side’s accuracy and explains what the better move
            was.
          </p>
        </div>
        <div className="panel fade-up mt-10 p-6" style={{ animationDelay: '0.1s' }}>
          <textarea
            id="pgn-input"
            value={pgnText}
            onChange={(e) => setPgnText(e.target.value)}
            rows={9}
            placeholder={'[White "…"]\n[Black "…"]\n\n1. e4 e5 2. Nf3 Nc6 …'}
            className="w-full resize-y rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-mono text-[12.5px] leading-relaxed text-white outline-none placeholder:text-ink-500 focus:border-accent/60"
          />
          {error && <p className="mt-3 text-[13px] text-[#ffb3b3]">{error}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => start(pgnText)} disabled={!pgnText.trim()} className="h-11 px-6">
              Review game
            </Button>
            <Button
              onClick={() => {
                setPgnText(SAMPLE_PGN);
                start(SAMPLE_PGN);
              }}
            >
              Try Morphy’s Opera Game (1858)
            </Button>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12.5px] text-ink-400">Depth</span>
              <Segmented label="Analysis depth" value={depth} onChange={setDepth} options={[10, 12, 14, 16, 18].map((d) => ({ value: d, label: String(d), title: d >= 16 ? 'Slower, more accurate' : undefined }))} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------- review screen */
  const fen = fenAt(line, ply);
  const cur = ply > 0 ? line.plies[ply - 1] : null;
  const curReview = ply > 0 ? reviews[ply - 1] : undefined;
  const before = ply > 0 ? evals[ply - 1] : null;
  const posEval = evals[ply];
  const over = resultOf(fen);
  const arrows: Arrow[] = [];
  if (cur && curReview) {
    const info = CLASS_INFO[curReview.cls];
    const bad = curReview.cls === 'inaccuracy' || curReview.cls === 'mistake' || curReview.cls === 'blunder';
    if (before?.best && before.best !== cur.uci && bad) arrows.push({ from: before.best.slice(0, 2), to: before.best.slice(2, 4), brush: 'best' });
    arrows.push({ from: cur.to, to: cur.to, brush: bad ? 'bad' : 'best', label: { text: info.symbol === '📖' ? 'B' : info.symbol, fill: info.color } });
  } else if (ply === 0 && posEval?.best) {
    arrows.push({ from: posEval.best.slice(0, 2), to: posEval.best.slice(2, 4), brush: 'best' });
  }
  const white = line.headers.White ?? 'White';
  const black = line.headers.Black ?? 'Black';
  const ws = sideStats('w')!;
  const bs = sideStats('b')!;
  const opening = findOpening(line.plies.map((p) => p.san));
  const wins = evals.map((e) => (e ? winPercent(e.score) : null));
  const classes = reviews.map((r) => r?.cls);
  const mistakes = line.plies.map((_, i) => i + 1).filter((p) => {
    const c = reviews[p - 1]?.cls;
    return c === 'mistake' || c === 'blunder';
  });
  const nextMistake = mistakes.find((p) => p > ply);

  return (
    <div className="grid grid-cols-[auto_minmax(400px,1fr)] gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="kicker">{opening ? `${opening.eco} · ${opening.name}` : 'Game review'}</div>
            <h1 className="mt-1 truncate font-display text-[26px] font-semibold tracking-tight text-white">
              {white} <span className="text-ink-500">vs</span> {black}
            </h1>
          </div>
          <div className="shrink-0 font-mono text-[12.5px] text-ink-400">{line.headers.Result ?? ''}</div>
        </div>
        <div className="flex gap-3" style={{ height: 'min(calc(100vh - 230px), 760px)' }}>
          <EvalBar score={posEval?.score && !(posEval.score.type === 'cp' && Math.abs(posEval.score.value) >= 100000) ? posEval.score : null} orientation={orientation} result={over?.result ?? null} />
          <div style={{ width: 'min(calc(100vh - 230px), 760px)' }}>
            <Board fen={fen} orientation={orientation} movable="none" lastMove={cur ? [cur.from, cur.to] : null} arrows={arrows} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setPly(0)} title="Start (Home)">⏮</Button>
          <Button onClick={() => setPly(Math.max(0, ply - 1))} title="Previous (←)">◀</Button>
          <Button onClick={() => setPly(Math.min(line.plies.length, ply + 1))} title="Next (→)">▶</Button>
          <Button onClick={() => setPly(line.plies.length)} title="End (End)">⏭</Button>
          <Button onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')} title="Flip (F)">⇅ Flip</Button>
          <Button variant="soft" disabled={nextMistake === undefined} onClick={() => nextMistake !== undefined && setPly(nextMistake)}>
            Next mistake →
          </Button>
          <div className="ml-auto flex gap-2">
            <Button
              onClick={() => {
                store.setAnalyzeInput({ pgn: pgnText || undefined, ply });
                navigate('analyze');
              }}
            >
              Explore in Analyze
            </Button>
            <Button
              onClick={() => {
                runId.current++;
                engine.stop();
                setLine(null);
                setEvals([]);
              }}
            >
              New review
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4" style={{ height: 'min(calc(100vh - 140px), 870px)' }}>
        <Panel
          title={done ? 'Summary' : refining ? 'Double-checking critical moves' : `Analysing · depth ${depth}`}
          right={running && !refining && <span className="font-mono text-[11px] text-ink-400 tnum">{analysed}/{evals.length}{eta !== null ? ` · ~${eta}s left` : ''}</span>}
        >
          {!done && (
            <div className="mb-4 h-1 overflow-hidden rounded bg-white/[0.06]">
              <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${(analysed / Math.max(1, evals.length)) * 100}%` }} />
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-1.5">
            <span />
            <span className="w-24 truncate text-right text-[12px] font-medium text-white" title={white}>
              {white}
            </span>
            <span className="w-24 truncate text-right text-[12px] font-medium text-white" title={black}>
              {black}
            </span>
            <span className="text-[13px] text-ink-300">Accuracy</span>
            <span className="text-right font-display text-[26px] font-semibold tabular-nums text-white">{ws.accuracy !== null ? ws.accuracy.toFixed(1) : '—'}</span>
            <span className="text-right font-display text-[26px] font-semibold tabular-nums text-white">{bs.accuracy !== null ? bs.accuracy.toFixed(1) : '—'}</span>
            {SUMMARY_CLASSES.map((c) => (
              <div key={c} className="contents">
                <span className="flex items-center gap-2 text-[12.5px] text-ink-300">
                  <span className="w-5 text-center text-[11px] font-bold" style={{ color: CLASS_INFO[c].color }}>
                    {CLASS_INFO[c].symbol}
                  </span>
                  {CLASS_INFO[c].label}
                </span>
                <span className="text-right font-mono text-[13px] text-ink-100">{ws.counts[c] ?? 0}</span>
                <span className="text-right font-mono text-[13px] text-ink-100">{bs.counts[c] ?? 0}</span>
              </div>
            ))}
          </div>
          {error && <p className="mt-3 text-[13px] text-[#ffb3b3]">{error}</p>}
        </Panel>

        <EvalGraph wins={wins} classes={classes} current={ply} onSelect={setPly} />

        <Panel title="Coach" className="min-h-[150px]">
          {ply === 0 ? (
            <p className="text-[13.5px] leading-relaxed text-ink-300">
              Step through the game with <kbd>←</kbd> <kbd>→</kbd> or click any move. Coloured dots on the graph mark inaccuracies, mistakes and blunders.
            </p>
          ) : !curReview ? (
            <p className="text-[13.5px] text-ink-400">Analysing this move…</p>
          ) : (
            <div key={ply} className="fade-up">
              <div className="flex items-center gap-3">
                <span className="rounded-lg px-2.5 py-1 text-[12px] font-bold text-ink-950" style={{ background: CLASS_INFO[curReview.cls].color }}>
                  {CLASS_INFO[curReview.cls].symbol} {CLASS_INFO[curReview.cls].label}
                </span>
                <span className="font-mono text-[14px] text-white">
                  {cur!.before.split(' ')[5]}
                  {cur!.before.split(' ')[1] === 'w' ? '.' : '…'} {cur!.san}
                </span>
                <span className="ml-auto font-mono text-[12px] text-ink-400">
                  {before && evals[ply] ? `${label(before.score)} → ${label(evals[ply]!.score)}` : ''}
                </span>
              </div>
              <ul className="mt-3 flex flex-col gap-1.5">
                {curReview.notes.slice(0, -1).map((n, i) => (
                  <li key={i} className="text-[13.5px] leading-relaxed text-ink-200">
                    {n}
                  </li>
                ))}
              </ul>
              {before?.pv && before.best !== cur!.uci && before.pv.length > 0 && (
                <p className="mt-3 font-mono text-[11.5px] text-ink-500">Engine line: {pvToSan(cur!.before, before.pv, 6).join(' ')}</p>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Moves" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <MoveList line={line} current={ply} onSelect={setPly} classes={classes} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
