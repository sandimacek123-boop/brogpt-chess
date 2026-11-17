import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, PieceSymbol } from 'chess.js';
import Board, { Arrow, Orientation } from '../ui/Board';
import MoveList from '../ui/MoveList';
import { Button, Panel, Segmented } from '../ui/controls';
import { engine } from '../engine/instance';
import { EngineCancelled } from '../engine/engine';
import { emptyLine, fenAt, isThreefold, Line, lineToPgn, playAt, resultOf } from '../chess/line';
import { findOpening } from '../chess/openings';
import { pvToSan } from '../chess/san';
import { soundFor } from '../sound';
import { load, navigate, save, useStore } from '../state/store';

/** Bot levels: Stockfish "Skill Level" plus a thinking-time budget. */
export const LEVELS = [
  { name: 'Beginner', skill: 0, movetime: 60 },
  { name: 'Novice', skill: 2, movetime: 100 },
  { name: 'Casual', skill: 5, movetime: 150 },
  { name: 'Club', skill: 8, movetime: 250 },
  { name: 'Strong', skill: 11, movetime: 400 },
  { name: 'Expert', skill: 14, movetime: 600 },
  { name: 'Master', skill: 17, movetime: 900 },
  { name: 'Maximum', skill: 20, movetime: 1500 },
];

type Side = 'white' | 'black' | 'random';
interface Ended {
  result: '1-0' | '0-1' | '1/2-1/2';
  reason: string;
}

const PIECE_ORDER: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];
const GLYPH: Record<string, string> = { wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' };
const VAL: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Pieces each side has captured, and the material difference. */
function captured(fen: string) {
  const start: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };
  for (const row of new Chess(fen).board()) for (const p of row) if (p) have[p.color][p.type]++;
  const lost = (c: 'w' | 'b') => PIECE_ORDER.flatMap((t) => Array(Math.max(0, start[t] - have[c][t])).fill(c + t) as string[]);
  const mat = (c: 'w' | 'b') => PIECE_ORDER.reduce((s, t) => s + have[c][t] * VAL[t], 0);
  return { byWhite: lost('b'), byBlack: lost('w'), diff: mat('w') - mat('b') };
}

export default function PlayPage() {
  const store = useStore();
  const [level, setLevel] = useState<number>(() => load('brogpt-chess:level', 3));
  const [side, setSide] = useState<Side>(() => load('brogpt-chess:side', 'white'));
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [line, setLine] = useState<Line>(() => emptyLine());
  const [started, setStarted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [ended, setEnded] = useState<Ended | null>(null);
  const [hint, setHint] = useState<Arrow | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [view, setView] = useState<number | null>(null); // ply being viewed (null = live)
  const [error, setError] = useState<string | null>(null);
  const gameId = useRef(0);

  useEffect(() => save('brogpt-chess:level', level), [level]);
  useEffect(() => save('brogpt-chess:side', side), [side]);
  useEffect(() => () => engine.stop(), []);

  const livePly = line.plies.length;
  const ply = view ?? livePly;
  const fen = fenAt(line, ply);
  const liveFen = fenAt(line, livePly);
  const opening = useMemo(() => findOpening(line.plies.map((p) => p.san)), [line]);
  const cap = captured(fen);
  const botColor = playerColor === 'white' ? 'b' : 'w';

  const checkEnd = (l: Line): Ended | null => {
    const f = fenAt(l, l.plies.length);
    const r = resultOf(f);
    if (r) return r;
    if (isThreefold(l, l.plies.length)) return { result: '1/2-1/2', reason: 'Threefold repetition' };
    return null;
  };

  const botMove = useCallback(
    async (l: Line, id: number) => {
      setThinking(true);
      const t0 = performance.now();
      try {
        const lv = LEVELS[level - 1];
        const res = await engine.search({ fen: fenAt(l, l.plies.length), skill: lv.skill, movetime: lv.movetime });
        if (id !== gameId.current || !res.best) return;
        const wait = Math.max(0, 350 - (performance.now() - t0));
        await new Promise((r) => setTimeout(r, wait));
        if (id !== gameId.current) return;
        const next = playAt(l, l.plies.length, res.best);
        if (!next) return;
        setLine(next);
        soundFor(next.plies[next.plies.length - 1].san, !!checkEnd(next));
        const e = checkEnd(next);
        if (e) setEnded(e);
      } catch (e) {
        if (!(e instanceof EngineCancelled)) setError(engine.failed ?? (e as Error).message);
      } finally {
        if (id === gameId.current) setThinking(false);
      }
    },
    [level],
  );

  const newGame = () => {
    engine.newGame();
    const id = ++gameId.current;
    const color = side === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : side;
    const l = emptyLine();
    setPlayerColor(color);
    setLine(l);
    setEnded(null);
    setHint(null);
    setHintText(null);
    setView(null);
    setStarted(true);
    setThinking(false);
    if (color === 'black') void botMove(l, id);
  };

  const onMove = (uci: string) => {
    if (!started || ended || thinking || view !== null) return;
    const next = playAt(line, livePly, uci);
    if (!next) return;
    setLine(next);
    setHint(null);
    setHintText(null);
    const e = checkEnd(next);
    soundFor(next.plies[next.plies.length - 1].san, !!e);
    if (e) setEnded(e);
    else void botMove(next, gameId.current);
  };

  const takeBack = () => {
    if (!started || livePly === 0) return;
    engine.stop();
    gameId.current++;
    setThinking(false);
    // remove the bot's reply and the player's move (if it's the player's turn)
    const turn = new Chess(liveFen).turn();
    const playerTurn = (turn === 'w') === (playerColor === 'white');
    let n = playerTurn ? 2 : 1;
    if (livePly - n < 0) n = livePly;
    // if the player is Black and only the bot's first move remains, keep it
    const keep = livePly - n;
    if (playerColor === 'black' && keep === 0 && livePly > 0) n = livePly - 1;
    setLine({ ...line, plies: line.plies.slice(0, livePly - n) });
    setEnded(null);
    setHint(null);
    setHintText(null);
    setView(null);
  };

  const showHint = async () => {
    if (!started || ended || thinking) return;
    setHintText('Thinking…');
    try {
      const res = await engine.search({ fen: liveFen, depth: 16, multipv: 1 });
      if (!res.best) return;
      setHint({ from: res.best.slice(0, 2), to: res.best.slice(2, 4), brush: 'hint' });
      const san = pvToSan(liveFen, [res.best])[0];
      setHintText(`Try ${san}.`);
    } catch {
      setHintText(null);
    }
  };

  const resign = () => {
    if (!started || ended) return;
    engine.stop();
    gameId.current++;
    setThinking(false);
    setEnded({ result: playerColor === 'white' ? '0-1' : '1-0', reason: 'Resignation' });
  };

  const pgn = () =>
    lineToPgn(line, {
      Event: 'BroGPT Chess',
      Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      White: playerColor === 'white' ? 'You' : `Stockfish (${LEVELS[level - 1].name})`,
      Black: playerColor === 'black' ? 'You' : `Stockfish (${LEVELS[level - 1].name})`,
      Result: ended?.result ?? '*',
    });

  // Keyboard: browse moves
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') setView((v) => Math.max(0, (v ?? livePly) - 1));
      else if (e.key === 'ArrowRight') setView((v) => (v === null || v + 1 >= livePly ? null : v + 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [livePly]);

  const last = ply > 0 ? line.plies[ply - 1] : null;
  const won = ended && ((ended.result === '1-0' && playerColor === 'white') || (ended.result === '0-1' && playerColor === 'black'));
  const lost = ended && ended.result !== '1/2-1/2' && !won;
  const diffFor = (c: 'w' | 'b') => (c === 'w' ? cap.diff : -cap.diff);

  const PlayerRow = ({ color }: { color: 'w' | 'b' }) => {
    const isBot = color === botColor;
    const caps = color === 'w' ? cap.byWhite : cap.byBlack;
    const d = diffFor(color);
    return (
      <div className="flex h-9 items-center gap-3">
        <span className={`h-3 w-3 rounded-full ${color === 'w' ? 'bg-[#efedf7]' : 'border border-white/30 bg-[#1b1a26]'}`} />
        <span className="text-[14px] font-medium text-white">{isBot ? `Stockfish · ${LEVELS[level - 1].name}` : 'You'}</span>
        {isBot && thinking && <span className="animate-pulse text-[12px] text-ink-400">thinking…</span>}
        <span className="ml-auto flex items-center gap-1 text-[15px] leading-none text-ink-300" aria-label="Captured pieces">
          {caps.map((g, i) => (
            <span key={i}>{GLYPH[g]}</span>
          ))}
          {d > 0 && <span className="ml-1 font-mono text-[12px] text-ink-400">+{d}</span>}
        </span>
      </div>
    );
  };

  const top = playerColor === 'white' ? 'b' : 'w';
  const bottom = playerColor === 'white' ? 'w' : 'b';

  return (
    <div className="grid grid-cols-[auto_minmax(380px,1fr)] gap-8">
      <div className="flex flex-col gap-2">
        <PlayerRow color={top} />
        <div className="relative" style={{ width: 'min(calc(100vh - 230px), 760px)' }}>
          <Board
            fen={fen}
            orientation={playerColor as Orientation}
            movable={started && !ended && !thinking && view === null ? playerColor : 'none'}
            lastMove={last ? [last.from, last.to] : null}
            arrows={hint && view === null ? [hint] : []}
            onMove={onMove}
          />
          {!started && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[10px] bg-black/55 backdrop-blur-[3px]">
              <div className="fade-up text-center">
                <div className="kicker">Play</div>
                <div className="mt-2 font-display text-[44px] font-semibold tracking-[-0.03em] text-white">Ready when you are.</div>
                <p className="mt-2 text-[14px] text-ink-300">Pick a side and a level on the right, then start.</p>
                <Button variant="primary" onClick={newGame} className="mt-6 h-12 px-7 text-[15px]">
                  Start game
                </Button>
              </div>
            </div>
          )}
          {ended && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="pop-in pointer-events-auto rounded-3xl border border-white/10 bg-[#0d0c14]/90 px-10 py-8 text-center shadow-2xl backdrop-blur-xl">
                <div className="kicker">{ended.reason}</div>
                <div className={`mt-2 font-display text-[46px] font-semibold tracking-[-0.03em] ${won ? 'text-[#4fd18b]' : lost ? 'text-[#ff8a8a]' : 'text-white'}`}>
                  {won ? 'You won' : lost ? 'You lost' : 'Draw'}
                </div>
                <div className="font-mono text-[14px] text-ink-400">{ended.result}</div>
                <div className="mt-6 flex justify-center gap-2">
                  <Button
                    variant="primary"
                    onClick={() => {
                      store.setReviewPgn(pgn());
                      navigate('review');
                    }}
                  >
                    Review game
                  </Button>
                  <Button onClick={newGame}>Play again</Button>
                </div>
              </div>
            </div>
          )}
        </div>
        <PlayerRow color={bottom} />
      </div>

      <div className="flex min-w-0 flex-col gap-4" style={{ height: 'min(calc(100vh - 140px), 870px)' }}>
        <Panel title="New game">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-ink-300">Play as</span>
              <Segmented
                label="Play as"
                value={side}
                onChange={setSide}
                options={[
                  { value: 'white', label: 'White' },
                  { value: 'random', label: 'Random' },
                  { value: 'black', label: 'Black' },
                ]}
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-ink-300">Bot strength</span>
                <span className="text-[13px] font-medium text-white">
                  {level}. {LEVELS[level - 1].name}
                </span>
              </div>
              <input
                id="level"
                type="range"
                min={1}
                max={8}
                value={level}
                aria-label="Bot strength"
                onChange={(e) => setLevel(Number(e.target.value))}
                style={{ ['--fill' as string]: `${((level - 1) / 7) * 100}%` }}
              />
            </div>
            <Button variant="primary" onClick={newGame}>
              {started ? 'Restart with these settings' : 'Start game'}
            </Button>
          </div>
        </Panel>

        <Panel title={opening ? `${opening.eco} · ${opening.name}` : 'Moves'} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <MoveList line={line} current={ply} onSelect={(p) => setView(p >= livePly ? null : p)} />
          </div>
          {view !== null && (
            <button type="button" onClick={() => setView(null)} className="mt-2 rounded-lg bg-accent/15 py-1.5 text-[12px] text-[#d4ccff] hover:bg-accent/25">
              Viewing move {view} — back to the game
            </button>
          )}
        </Panel>

        <Panel title="Assist">
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" onClick={() => void showHint()} disabled={!started || !!ended || thinking}>
              💡 Hint
            </Button>
            <Button onClick={takeBack} disabled={!started || livePly === 0 || (playerColor === 'black' && livePly <= 1)}>
              ↶ Take back
            </Button>
            <Button
              onClick={() => {
                store.setAnalyzeInput({ pgn: pgn() });
                navigate('analyze');
              }}
              disabled={livePly === 0}
            >
              Analyze position
            </Button>
            <Button variant="danger" onClick={resign} disabled={!started || !!ended}>
              Resign
            </Button>
          </div>
          {hintText && <p className="mt-3 text-[13px] text-[#ffe28a]">{hintText}</p>}
          {error && <p className="mt-3 text-[13px] text-[#ffb3b3]">The engine could not start: {error}</p>}
        </Panel>
      </div>
    </div>
  );
}
