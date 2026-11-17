import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import Board, { Arrow, Orientation } from '../ui/Board';
import EvalBar from '../ui/EvalBar';
import EngineLines from '../ui/EngineLines';
import MoveList from '../ui/MoveList';
import { Button, Panel, Segmented, Toggle } from '../ui/controls';
import { engine } from '../engine/instance';
import { EngineCancelled } from '../engine/engine';
import type { PvLine } from '../engine/uci';
import { emptyLine, fenAt, isThreefold, Line, lineFromFen, lineFromPgn, lineToPgn, playAt, resultOf } from '../chess/line';
import { findOpening } from '../chess/openings';
import { soundFor } from '../sound';
import { navigate, useStore } from '../state/store';

export default function AnalyzePage() {
  const store = useStore();
  const [line, setLine] = useState<Line>(() => emptyLine());
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>('white');
  const [engineOn, setEngineOn] = useState(true);
  const [multipv, setMultipv] = useState(3);
  const [lines, setLines] = useState<PvLine[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fen = fenAt(line, ply);
  const over = resultOf(fen) ?? (isThreefold(line, ply) ? { result: '1/2-1/2' as const, reason: 'Threefold repetition' } : null);
  const opening = useMemo(() => findOpening(line.plies.slice(0, ply).map((p) => p.san)), [line, ply]);
  const isOver = over !== null;
  const sideToMove = new Chess(fen).turn() === 'w' ? 'White' : 'Black';

  // Input handed over from Play / Review
  useEffect(() => {
    const x = store.analyzeInput;
    if (!x) return;
    try {
      const l = x.pgn ? lineFromPgn(x.pgn) : x.fen ? lineFromFen(x.fen) : emptyLine();
      setLine(l);
      setPly(Math.min(x.ply ?? l.plies.length, l.plies.length));
    } catch {
      /* ignore invalid hand-over */
    }
    store.setAnalyzeInput(null);
  }, [store]);

  // Engine analysis of the current position
  useEffect(() => {
    setLines([]);
    if (!engineOn || isOver) {
      engine.stop();
      return;
    }
    let alive = true;
    engine
      .search({ fen, multipv, depth: 24, onInfo: (l) => alive && setLines(l) })
      .then((r) => alive && setLines(r.lines))
      .catch((e) => {
        if (!(e instanceof EngineCancelled) && alive) setEngineError(engine.failed ?? (e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [fen, engineOn, multipv, isOver]);

  useEffect(() => () => engine.stop(), []);

  const move = useCallback(
    (uci: string) => {
      const next = playAt(line, ply, uci);
      if (!next) return;
      // Reuse the existing continuation if the same move is played again
      const existing = line.plies[ply];
      if (existing && existing.uci === next.plies[ply].uci) {
        setPly(ply + 1);
      } else {
        setLine(next);
        setPly(ply + 1);
      }
      soundFor(next.plies[ply].san, !!resultOf(next.plies[ply].fen));
    },
    [line, ply],
  );

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
      else if (e.key === 'ArrowRight') setPly((p) => Math.min(line.plies.length, p + 1));
      else if (e.key === 'ArrowUp' || e.key === 'Home') setPly(0);
      else if (e.key === 'ArrowDown' || e.key === 'End') setPly(line.plies.length);
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [line.plies.length]);

  const arrows: Arrow[] = [];
  if (engineOn && !over) {
    const brushes = ['best', 'alt', 'alt2'];
    lines.slice(0, 3).forEach((l, i) => {
      const u = l.pv[0];
      if (u) arrows.unshift({ from: u.slice(0, 2), to: u.slice(2, 4), brush: brushes[i] });
    });
  }
  const last = ply > 0 ? line.plies[ply - 1] : null;
  const best = lines[0];

  const doImport = () => {
    const t = importText.trim();
    if (!t) return;
    try {
      const l = /^[rnbqkpRNBQKP1-8]+(\/[rnbqkpRNBQKP1-8]+){7}\s/.test(t) ? lineFromFen(t) : lineFromPgn(t);
      setLine(l);
      setPly(l.plies.length);
      setImportError(null);
      setImportText('');
    } catch (e) {
      setImportError(`Could not read that as PGN or FEN: ${(e as Error).message}`);
    }
  };

  const copy = (what: 'FEN' | 'PGN') => {
    const text = what === 'FEN' ? fen : lineToPgn(line);
    navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(what))
      .catch(() => setCopied(null));
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="grid grid-cols-[auto_minmax(380px,1fr)] gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <div className="min-w-0">
            <div className="kicker">{opening ? opening.eco : 'Analysis board'}</div>
            <h1 className="mt-1 truncate font-display text-[26px] font-semibold tracking-tight text-white">{opening ? opening.name : 'Free analysis'}</h1>
          </div>
          <div className="text-right text-[12.5px] text-ink-400">{over ? `${over.reason} · ${over.result}` : `${sideToMove} to move`}</div>
        </div>
        <div className="flex gap-3" style={{ height: 'min(calc(100vh - 230px), 760px)' }}>
          <EvalBar score={engineOn && best ? best.score : null} orientation={orientation} result={over?.result ?? null} />
          <div style={{ width: 'min(calc(100vh - 230px), 760px)' }}>
            <Board fen={fen} orientation={orientation} movable="both" lastMove={last ? [last.from, last.to] : null} arrows={arrows} onMove={move} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setPly(0)} title="First move (Home)">⏮</Button>
          <Button onClick={() => setPly(Math.max(0, ply - 1))} title="Previous move (←)">◀</Button>
          <Button onClick={() => setPly(Math.min(line.plies.length, ply + 1))} title="Next move (→)">▶</Button>
          <Button onClick={() => setPly(line.plies.length)} title="Last move (End)">⏭</Button>
          <Button onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')} title="Flip board (F)">⇅ Flip</Button>
          <div className="ml-auto flex gap-2">
            <Button
              onClick={() => {
                setLine(emptyLine());
                setPly(0);
              }}
            >
              New board
            </Button>
            <Button
              variant="soft"
              disabled={line.plies.length === 0}
              onClick={() => {
                store.setReviewPgn(lineToPgn(line));
                navigate('review');
              }}
            >
              Review game
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4" style={{ height: 'min(calc(100vh - 140px), 870px)' }}>
        <Panel
          title={
            <span className="flex items-center gap-2">
              Engine {best && engineOn && <span className="font-mono text-[10.5px] normal-case tracking-normal text-ink-500">depth {best.depth}</span>}
            </span>
          }
          right={
            <div className="flex items-center gap-3">
              <Segmented label="Lines" value={multipv} onChange={setMultipv} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
              <Toggle checked={engineOn} onChange={setEngineOn} label="On" />
            </div>
          }
        >
          {engineError ? (
            <p className="text-[13px] text-[#ffb3b3]">The engine could not start: {engineError}</p>
          ) : !engineOn ? (
            <p className="py-2 text-[13px] text-ink-400">Engine is off.</p>
          ) : over ? (
            <p className="py-2 text-[13px] text-ink-300">
              {over.reason}. Result {over.result}.
            </p>
          ) : (
            <EngineLines fen={fen} lines={lines} onPlay={move} />
          )}
          <p className="mt-2 font-mono text-[10.5px] text-ink-500">{engine.name} · single-threaded WASM, runs in your browser</p>
        </Panel>

        <Panel title="Moves" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <MoveList line={line} current={ply} onSelect={setPly} />
          </div>
        </Panel>

        <Panel
          title="Import / export"
          right={
            <div className="flex gap-2">
              <Button onClick={() => copy('FEN')}>{copied === 'FEN' ? 'Copied ✓' : 'Copy FEN'}</Button>
              <Button onClick={() => copy('PGN')}>{copied === 'PGN' ? 'Copied ✓' : 'Copy PGN'}</Button>
            </div>
          }
        >
          <div className="flex gap-2">
            <textarea
              id="import-text"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste a PGN or a FEN…"
              rows={2}
              className="min-w-0 flex-1 resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 font-mono text-[12px] text-white outline-none placeholder:text-ink-500 focus:border-accent/60"
            />
            <Button variant="primary" onClick={doImport} disabled={!importText.trim()} className="h-auto">
              Load
            </Button>
          </div>
          {importError && <p className="mt-2 text-[12px] text-[#ffb3b3]">{importError}</p>}
        </Panel>
      </div>
    </div>
  );
}
