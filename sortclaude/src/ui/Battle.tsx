import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { battle, type RaceMetric, type PerfResult } from '../battle/engine';
import { Tournament, type TourFormat, type TourMetric } from '../battle/tournament';
import { useApp } from '../state/store';
import { ALGORITHMS, getAlgorithm } from '../engine/registry';
import { ELEMENT_PRESETS, PATTERNS, generateKeys, type PatternId } from '../engine/generators';
import { VIZ_2D, type Viz2D } from '../state/settings';
import { Renderer2D } from '../render/renderer2d';
import { Icon, Modal, Segmented, Select, Slider, fmt, fmtMs, saveBlob } from './components';
import { randomSeed, normalizeSeed } from '../engine/rng';
import { renderOptions } from './Stage';
import { Scrubber } from './Visualizer';

type Layout = '1v1' | '2v2' | '4' | '8' | '16';
const LAYOUT_COUNT: Record<Layout, number> = { '1v1': 2, '2v2': 4, '4': 4, '8': 8, '16': 16 };
const DEFAULT_LINEUP = ['quick', 'bubble', 'merge', 'heap', 'shell-ciura', 'insertion', 'radix-lsd', 'timsort', 'quick-dual', 'selection', 'comb', 'cocktail', 'smooth', 'introsort', 'counting', 'gnome'];

function useBattleTick() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    const off = battle.subscribe(force);
    return () => void off();
  }, []);
}

export function Battle() {
  const [tab, setTab] = useState<'race' | 'tournament'>('race');
  return (
    <div className="battle-layout">
      <div className="battle-side">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'race', label: 'Battle race' }, { value: 'tournament', label: 'Tournament' }]} />
        {tab === 'race' ? <RaceSetup /> : <TournamentSetup />}
      </div>
      {tab === 'race' ? <RaceArena /> : <TournamentView />}
    </div>
  );
}

// ------------------------------------------------------------------ race
interface RaceCfg {
  layout: Layout;
  ids: string[];
  n: number;
  pattern: PatternId;
  seed: number;
  viz: Viz2D;
  metric: RaceMetric;
}

let raceCfg: RaceCfg = { layout: '1v1', ids: ['quick', 'bubble'], n: 160, pattern: 'random', seed: 42, viz: 'bars', metric: 'operations' };
const cfgListeners = new Set<() => void>();
function setRaceCfg(p: Partial<RaceCfg>) {
  raceCfg = { ...raceCfg, ...p };
  cfgListeners.forEach((f) => f());
}
function useRaceCfg() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    cfgListeners.add(force);
    return () => void cfgListeners.delete(force);
  }, []);
  return raceCfg;
}

let preparing = false;
async function prepareRace(toast: (t: string, k?: 'error' | 'success' | 'info') => void, onProgress?: (s: string) => void) {
  const cfg = raceCfg;
  const ids = cfg.ids.slice(0, LAYOUT_COUNT[cfg.layout]);
  const tooBig = ids.map(getAlgorithm).filter((a) => cfg.n > a.maxN);
  if (tooBig.length) {
    toast(`${tooBig.map((a) => a.name).join(', ')} cannot run ${cfg.n.toLocaleString()} elements visually (limit ${Math.min(...tooBig.map((a) => a.maxN)).toLocaleString()}).`, 'error');
    return false;
  }
  preparing = true;
  battle.metric = cfg.metric;
  // ONE seeded dataset, cloned for each contestant
  const keys = generateKeys({ n: cfg.n, pattern: cfg.pattern, seed: cfg.seed });
  const teams = cfg.layout === '2v2' ? [0, 0, 1, 1] : undefined;
  await battle.prepare(ids, keys, cfg.seed, teams, (i) => onProgress?.(`Recording ${getAlgorithm(ids[i]).name} (${i + 1}/${ids.length})…`));
  preparing = false;
  onProgress?.('');
  return true;
}

function RaceSetup() {
  const cfg = useRaceCfg();
  const toast = useApp((s) => s.toast);
  const [status, setStatus] = useState('');
  const [seedText, setSeedText] = useState(String(cfg.seed));
  const count = LAYOUT_COUNT[cfg.layout];
  useEffect(() => {
    if (cfg.ids.length < 16) setRaceCfg({ ids: [...cfg.ids, ...DEFAULT_LINEUP.filter((x) => !cfg.ids.includes(x))].slice(0, 16) });
  }, []);
  return (
    <>
      <Select label="Battle type" value={cfg.layout} onChange={(v) => setRaceCfg({ layout: v })} options={[{ value: '1v1', label: '1 versus 1' }, { value: '2v2', label: '2 versus 2 (team totals)' }, { value: '4', label: 'Four-algorithm battle' }, { value: '8', label: 'Eight-algorithm battle' }, { value: '16', label: 'Sixteen-algorithm battle' }]} />
      <div className="field">
        <label>Contestants</label>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="input-group" style={{ alignItems: 'center' }}>
            {cfg.layout === '2v2' && <span className="tag" style={{ width: 52, textAlign: 'center' }}>Team {i < 2 ? 'A' : 'B'}</span>}
            <select className="select" aria-label={`Contestant ${i + 1}`} data-testid={`contestant-${i}`} value={cfg.ids[i]} onChange={(e) => setRaceCfg({ ids: cfg.ids.map((x, j) => (j === i ? e.target.value : x)) })}>
              {ALGORITHMS.map((a) => (
                <option key={a.id} value={a.id} disabled={cfg.n > a.maxN}>{a.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="field">
        <label>Elements (identical for all)</label>
        <select className="select" value={cfg.n} onChange={(e) => setRaceCfg({ n: Number(e.target.value) })} aria-label="Battle element count">
          {ELEMENT_PRESETS.filter((n) => n <= 10000).map((n) => (
            <option key={n} value={n}>{n.toLocaleString()}</option>
          ))}
        </select>
      </div>
      <Select label="Input order" value={cfg.pattern} onChange={(v) => setRaceCfg({ pattern: v })} options={PATTERNS.filter((p) => p.id !== 'custom').map((p) => ({ value: p.id, label: p.name }))} />
      <div className="field">
        <label>Seed (one dataset, cloned to every contestant)</label>
        <div className="input-group">
          <input className="input mono" value={seedText} onChange={(e) => setSeedText(e.target.value)} onBlur={() => setRaceCfg({ seed: normalizeSeed(seedText) })} aria-label="Battle seed" />
          <button className="btn icon" aria-label="New seed" onClick={() => { const s = randomSeed(); setSeedText(String(s)); setRaceCfg({ seed: s }); }}>{Icon.dice}</button>
        </div>
      </div>
      <Select label="Visualization (all contestants)" value={cfg.viz} onChange={(v) => setRaceCfg({ viz: v })} options={VIZ_2D.map((v) => ({ value: v.id, label: v.name }))} />
      <Select label="Race metric" value={cfg.metric} onChange={(v) => { setRaceCfg({ metric: v }); battle.metric = v; battle.computeRanks(); }} options={[{ value: 'operations', label: 'Operations (all data ops)' }, { value: 'comparisons', label: 'Comparisons' }, { value: 'writes', label: 'Array writes' }]} />
      <div className="hint">Visualization race: a shared clock advances in units of the selected metric. Every contestant replays its own recording until its counter reaches the clock, so finishing order = fewest {cfg.metric}. It does not measure speed in milliseconds — use the performance race for that.</div>
      <button className="btn primary lg" data-testid="prepare-battle" disabled={preparing} onClick={async () => {
        const ok = await prepareRace(toast, setStatus);
        if (ok) toast('Battle ready — same data for every contestant.', 'success');
      }}>{Icon.sparkle}Prepare battle</button>
      {status && <div className="hint"><span className="spinner" /> {status}</div>}
    </>
  );
}

function ContestantView({ index, viz }: { index: number; viz: Viz2D }) {
  useBattleTick();
  const c = battle.contestants[index];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const r = new Renderer2D(canvas);
    const off = battle.onFrame((views) => {
      const v = views[index];
      const host = hostRef.current;
      if (!host) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(host.clientWidth * dpr));
      const h = Math.max(1, Math.round(host.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      if (!v) return;
      const st = useApp.getState().settings;
      const opts = renderOptions(st, battle.contestants.length > 8 ? 0.5 : 0.75, false);
      opts.viz = viz;
      opts.appearance = { ...opts.appearance, viz, glow: battle.contestants.length > 4 ? 0 : opts.appearance.glow * 0.7 };
      r.render(v, opts);
    });
    return () => void off();
  }, [index, viz]);
  if (!c) return null;
  const a = getAlgorithm(c.algorithmId);
  const counters = c.tl?.getCounters();
  const progress = c.tl ? c.tl.pos / Math.max(1, c.tl.total) : 0;
  const winner = c.finished && c.rank === 1;
  return (
    <div className={`contestant ${c.finished ? 'finished' : ''} ${winner ? 'winner' : ''}`} data-testid="contestant">
      <div className="c-head">
        <span className="c-name" title={a.name}>{a.name}</span>
        <span className="row-wrap" style={{ gap: 6 }}>
          {c.team !== index && battle.contestants.length === 4 && <span className="tag">Team {c.team === 0 ? 'A' : 'B'}</span>}
          {c.finished && <span className={`c-rank ${c.rank === 1 ? 'gold' : ''}`}>#{c.rank}</span>}
          {c.finished ? <span className="chip ok"><span className="dot" />done</span> : c.error ? <span className="chip err">error</span> : null}
        </span>
      </div>
      <div className="c-canvas" ref={hostRef}>
        <canvas ref={canvasRef} />
        {c.error && <div className="stage-overlay"><div className="stage-msg err small">{c.error}</div></div>}
      </div>
      <div className="c-stats">
        <span>ops <b>{fmt(counters?.operations ?? 0)}</b></span>
        <span>cmp <b>{fmt(counters?.comparisons ?? 0)}</b></span>
        <span>swaps <b>{fmt(counters?.swaps ?? 0)}</b></span>
        <span>writes <b>{fmt(counters?.writes ?? 0)}</b></span>
        <span>{(progress * 100).toFixed(0)}%</span>
      </div>
      <div className="c-progress"><div style={{ width: `${progress * 100}%` }} /></div>
    </div>
  );
}

function RaceArena() {
  useBattleTick();
  const cfg = useRaceCfg();
  const toast = useApp((s) => s.toast);
  const [results, setResults] = useState(false);
  const [perf, setPerf] = useState<PerfResult[] | null>(null);
  const [perfStatus, setPerfStatus] = useState('');
  const [speed, setSpeed] = useState(1);
  const n = battle.contestants.length;
  const cols = n <= 2 ? n || 1 : n <= 4 ? 2 : 4;
  const rows = Math.ceil(n / cols) || 1;
  const allDone = n > 0 && battle.contestants.every((c) => !c.tl || c.finished);
  const ready = n > 0 && battle.contestants.some((c) => c.tl);
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (wasPlaying.current && allDone) setResults(true);
    wasPlaying.current = battle.playing;
  });
  useEffect(() => {
    battle.speed = speed;
  }, [speed]);
  const progress = battle.clock / Math.max(1, battle.maxTotal());

  const exportStats = async (kind: 'json' | 'csv') => {
    const rows = battle.results();
    const meta = { format: 'sortclaude-battle', version: 1, metric: battle.metric, n: battle.keys.length, pattern: cfg.pattern, seed: battle.seed, date: new Date().toISOString(), performance: perf };
    if (kind === 'json') await saveBlob(new Blob([JSON.stringify({ ...meta, results: rows }, null, 2)], { type: 'application/json' }), `sortclaude-battle-${battle.seed}.json`);
    else {
      const header = Object.keys(rows[0] ?? {}).join(',');
      const body = rows.map((r) => Object.values(r).map((v) => (typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v ?? '')).join(',')).join('\n');
      await saveBlob(new Blob([`${header}\n${body}\n`], { type: 'text/csv' }), `sortclaude-battle-${battle.seed}.csv`);
    }
    toast('Battle statistics exported.', 'success');
  };

  return (
    <div className="battle-main">
      <div className="viz-header">
        <div className="viz-title">Battle</div>
        <div className="viz-meta">
          <span><b>{fmt(battle.keys.length)}</b> elements</span>
          <span>seed <b>{battle.seed}</b></span>
          <span>metric <b>{battle.metric}</b></span>
          {ready && <span className={`chip ${allDone ? 'ok' : battle.playing ? 'live' : ''}`}><span className="dot" />{allDone ? 'Finished' : battle.playing ? 'Racing' : 'Paused'}</span>}
        </div>
      </div>
      {n === 0 ? (
        <div className="empty">
          <div>
            <h2 style={{ fontFamily: 'var(--display)', color: 'var(--text-1)' }}>Choose contestants and press “Prepare battle”</h2>
            <p>Every algorithm receives an identical copy of one seeded dataset.</p>
          </div>
        </div>
      ) : (
        <div className="arena" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
          {battle.contestants.map((_, i) => (
            <ContestantView key={`${i}-${battle.contestants[i].algorithmId}-${battle.seed}`} index={i} viz={cfg.viz} />
          ))}
        </div>
      )}
      <div className="transport">
        <div className="timeline">
          <div className="time">clock <b className="mono">{fmt(battle.clock)}</b> {battle.metric}</div>
          <Scrubber value={Math.min(1, progress)} disabled={!ready} onChange={(p) => {
            battle.clock = p * battle.maxTotal();
            const slot = { operations: 6, comparisons: 0, writes: 2 }[battle.metric];
            for (const c of battle.contestants) {
              if (!c.tl) continue;
              c.tl.seek(0);
              c.tl.advanceToMetric(slot, battle.clock);
              c.finished = c.tl.done;
            }
          }} />
          <div className="time">{(Math.min(1, progress) * 100).toFixed(1)}%</div>
        </div>
        <div className="controls">
          <button className="btn primary play" data-testid="battle-play" disabled={!ready} onClick={() => (battle.playing ? battle.pause() : battle.play())} aria-label={battle.playing ? 'Pause all' : 'Start race'}>{battle.playing ? Icon.pause : Icon.play}</button>
          <button className="btn" disabled={!ready} onClick={() => battle.restart()}>{Icon.restart}Replay</button>
          <button className="btn" disabled={!ready} onClick={() => battle.finishAll()}>{Icon.toEnd}Finish</button>
          <div className="sep" />
          <div style={{ width: 200 }}>
            <Slider label="Race speed" value={speed} min={0.1} max={8} step={0.1} onChange={setSpeed} format={(v) => `${v.toFixed(1)}×`} />
          </div>
          <div className="grow" />
          <button className="btn" disabled={!ready || !!perfStatus} onClick={async () => {
            setPerfStatus('Running…');
            const r = await battle.performanceRace(7, 2, (i) => setPerfStatus(`Timing ${getAlgorithm(battle.contestants[i].algorithmId).name}…`));
            setPerf(r);
            setPerfStatus('');
            setResults(true);
          }}>{perfStatus ? <span className="spinner" /> : Icon.sparkle}{perfStatus || 'Performance race'}</button>
          <button className="btn" disabled={!ready} onClick={() => setResults(true)}>Results</button>
          <button className="btn" disabled={!ready} onClick={() => exportStats('json')}>{Icon.download}JSON</button>
          <button className="btn" disabled={!ready} onClick={() => exportStats('csv')}>{Icon.download}CSV</button>
        </div>
      </div>
      {results && <ResultsModal perf={perf} onClose={() => setResults(false)} />}
    </div>
  );
}

function ResultsModal({ perf, onClose }: { perf: PerfResult[] | null; onClose: () => void }) {
  battle.computeRanks();
  const rows = battle.results();
  const sorted = [...rows].sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const teams = battle.contestants.length === 4 && battle.contestants.some((c) => c.team !== battle.contestants.indexOf(c));
  const metric = battle.metric;
  const teamTotals = teams ? [0, 1].map((t) => rows.filter((r) => r.team === t).reduce((s, r) => s + ((r as any)[metric] ?? 0), 0)) : null;
  const perfSorted = perf ? [...perf].sort((a, b) => a.median - b.median) : null;
  return (
    <Modal title="Battle results" onClose={onClose} wide>
      <div className="stack">
        <div className="hint">Visualization race metric: <b>{metric}</b> (fewer is better). All contestants sorted the same {fmt(battle.keys.length)}-element dataset (seed {battle.seed}). Every final array was verified sorted.</div>
        {sorted[0] && <div className="chip ok" style={{ justifySelf: 'start', fontSize: 13 }}>🏆 Winner: {sorted[0].algorithm} — {fmt((sorted[0] as any)[metric] ?? 0)} {metric}</div>}
        {teamTotals && <div className="chip">Team A total {fmt(teamTotals[0])} · Team B total {fmt(teamTotals[1])} → {teamTotals[0] === teamTotals[1] ? 'draw' : teamTotals[0] < teamTotals[1] ? 'Team A wins' : 'Team B wins'}</div>}
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr><th>#</th><th>Algorithm</th><th className="num">Operations</th><th className="num">Comparisons</th><th className="num">Swaps</th><th className="num">Writes</th><th className="num">Recorded run</th><th className="num">Simulated playback</th><th>Complexity</th><th>Verified</th></tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id + r.team}>
                  <td>{r.rank || '—'}</td>
                  <td>{r.algorithm}</td>
                  <td className="num">{fmt(r.operations ?? NaN)}</td>
                  <td className="num">{fmt(r.comparisons ?? NaN)}</td>
                  <td className="num">{fmt(r.swaps ?? NaN)}</td>
                  <td className="num">{fmt(r.writes ?? NaN)}</td>
                  <td className="num">{fmtMs(r.executionMs ?? NaN)}</td>
                  <td className="num">{r.simulatedSeconds != null ? `${(r.simulatedSeconds as number).toFixed(1)} s` : '—'}</td>
                  <td className="mono small">{r.averageComplexity}</td>
                  <td>{r.error ? <span className="chip err">{r.error.slice(0, 40)}</span> : r.verifiedSorted ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hint">“Recorded run” is the wall-clock time of the instrumented run that produced the animation (includes recording overhead). Run the performance race for clean timings.</div>
        {perfSorted && (
          <>
            <h3 style={{ margin: '6px 0 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-2)' }}>Performance race (measured, no rendering)</h3>
            <table className="tbl">
              <thead><tr><th>#</th><th>Algorithm</th><th className="num">Median</th><th className="num">Mean</th><th className="num">Min</th><th className="num">Max</th><th className="num">Std dev</th><th className="num">Runs</th></tr></thead>
              <tbody>
                {perfSorted.map((p, i) => (
                  <tr key={p.algorithmId + i}><td>{i + 1}</td><td>{getAlgorithm(p.algorithmId).name}</td><td className="num">{fmtMs(p.median)}</td><td className="num">{fmtMs(p.mean)}</td><td className="num">{fmtMs(p.min)}</td><td className="num">{fmtMs(p.max)}</td><td className="num">{fmtMs(p.std)}</td><td className="num">{p.runs}{p.error ? ' ⚠' : ''}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="hint">7 timed runs after 2 warm-up runs each, in a Web Worker, on the identical dataset. JavaScript timings vary with JIT state, GC and power management; compare runs from the same machine and session only.</div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ tournament
let tour: Tournament | null = null;
const tourListeners = new Set<() => void>();
const notifyTour = () => tourListeners.forEach((f) => f());

function TournamentSetup() {
  const toast = useApp((s) => s.toast);
  const [format, setFormat] = useState<TourFormat>('elimination');
  const [metric, setMetric] = useState<TourMetric>('comparisons');
  const [picked, setPicked] = useState<string[]>(DEFAULT_LINEUP.slice(0, 8));
  const [sizes, setSizes] = useState<number[]>([256]);
  const [patterns, setPatterns] = useState<PatternId[]>(['random']);
  const [seed, setSeed] = useState(2025);
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    tourListeners.add(force);
    return () => void tourListeners.delete(force);
  }, []);
  const eligible = ALGORITHMS.filter((a) => !a.novelty);
  const maxSize = Math.max(...sizes);
  const start = () => {
    const bad = picked.filter((id) => getAlgorithm(id).benchMaxN < maxSize);
    if (picked.length < 2) return toast('Pick at least two competitors.', 'error');
    if (bad.length) return toast(`${bad.map((b) => getAlgorithm(b).name).join(', ')} cannot handle ${maxSize.toLocaleString()} elements.`, 'error');
    tour?.dispose();
    tour = new Tournament({ format, competitors: picked, metric, sizes, patterns, seed }, notifyTour);
    notifyTour();
    tour.run().catch((e) => toast(`Tournament error: ${(e as Error).message}`, 'error'));
  };
  return (
    <>
      <Select label="Format" value={format} onChange={setFormat} options={[{ value: 'elimination', label: 'Elimination bracket' }, { value: 'round-robin', label: 'Round robin' }, { value: 'championship', label: 'Championship (round robin × every size & pattern)' }]} />
      <Select label="Judged by" value={metric} onChange={setMetric} options={[{ value: 'comparisons', label: 'Comparisons' }, { value: 'operations', label: 'Operations' }, { value: 'writes', label: 'Writes' }, { value: 'runtime', label: 'Measured runtime (median of 3)' }]} />
      <div className="field">
        <label>Dataset sizes</label>
        <div className="row-wrap">
          {[64, 256, 1024, 5000, 20000].map((n) => (
            <button key={n} className={`btn ${sizes.includes(n) ? 'on' : ''}`} onClick={() => setSizes(sizes.includes(n) ? (sizes.length > 1 ? sizes.filter((x) => x !== n) : sizes) : [...sizes, n].sort((a, b) => a - b))}>{n.toLocaleString()}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Distributions</label>
        <div className="row-wrap">
          {(['random', 'reversed', 'nearly-sorted', 'few-unique', 'sorted'] as PatternId[]).map((p) => (
            <button key={p} className={`btn ${patterns.includes(p) ? 'on' : ''}`} onClick={() => setPatterns(patterns.includes(p) ? (patterns.length > 1 ? patterns.filter((x) => x !== p) : patterns) : [...patterns, p])}>{PATTERNS.find((x) => x.id === p)!.name}</button>
          ))}
        </div>
        <div className="hint">Elimination rounds cycle through sizes/patterns; each match uses one seeded dataset for both sides.</div>
      </div>
      <div className="field">
        <label>Base seed</label>
        <input className="input mono" value={seed} onChange={(e) => setSeed(normalizeSeed(e.target.value || '0'))} aria-label="Tournament seed" />
      </div>
      <div className="field">
        <label>Competitors ({picked.length})</label>
        <div className="algo-list" style={{ maxHeight: 220 }}>
          {eligible.map((a) => (
            <label key={a.id} className="algo-item" style={{ cursor: 'pointer' }}>
              <span><input type="checkbox" checked={picked.includes(a.id)} onChange={() => setPicked(picked.includes(a.id) ? picked.filter((x) => x !== a.id) : [...picked, a.id])} /> {a.name}</span>
              <span className="cx">{a.average.length > 14 ? '' : a.average}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="row-wrap">
        <button className="btn primary" onClick={start} disabled={!!tour?.running}>{Icon.play}Start tournament</button>
        {tour?.running && (tour.paused ? <button className="btn" onClick={() => tour!.resume()}>Resume</button> : <button className="btn" onClick={() => tour!.pause()}>{Icon.pause}Pause</button>)}
        {tour?.running && <button className="btn danger" onClick={() => tour!.cancel()}>{Icon.stop}Stop</button>}
      </div>
    </>
  );
}

function TournamentView() {
  const [, force] = useReducer((x) => x + 1, 0);
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    tourListeners.add(force);
    return () => void tourListeners.delete(force);
  }, []);
  const standings = useMemo(() => tour?.standings() ?? [], [tour?.matches.filter((m) => m.done).length]);
  if (!tour) return <div className="empty">Configure a tournament and press Start. Matches run in a background worker on repeatable seeded datasets.</div>;
  const t = tour;
  const done = t.matches.filter((m) => m.done).length;
  const champion = t.champion();
  const fmtScore = (v: number | null) => (v === null ? '' : !Number.isFinite(v) ? 'DNF' : t.cfg.metric === 'runtime' ? fmtMs(v) : fmt(v));
  const watch = (m: (typeof t.matches)[number]) => {
    if (!m.a || !m.b) return;
    setRaceCfg({ layout: '1v1', ids: [m.a, m.b, ...raceCfg.ids.slice(2)], n: Math.min(m.n, 5000), pattern: m.pattern, seed: m.seed, metric: t.cfg.metric === 'runtime' ? 'operations' : t.cfg.metric });
    toast('Match loaded into the battle race — switch to “Battle race” and press Prepare.', 'info');
  };
  const exportRes = async (kind: 'json' | 'csv') => {
    if (kind === 'json') await saveBlob(new Blob([JSON.stringify({ format: 'sortclaude-tournament', version: 1, config: t.cfg, matches: t.matches, standings, champion }, null, 2)], { type: 'application/json' }), 'sortclaude-tournament.json');
    else await saveBlob(new Blob(['round,a,b,n,pattern,seed,scoreA,scoreB,winner,note\n' + t.matches.map((m) => [m.round, m.a, m.b, m.n, m.pattern, m.seed, m.scoreA, m.scoreB, m.winner, m.note ?? ''].join(',')).join('\n')], { type: 'text/csv' }), 'sortclaude-tournament.csv');
  };
  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>{t.cfg.format === 'elimination' ? 'Elimination bracket' : t.cfg.format === 'round-robin' ? 'Round robin' : 'Championship'}</h1>
          <p>Judged by {t.cfg.metric === 'runtime' ? 'measured runtime (median of 3 runs after warm-up)' : `${t.cfg.metric} (exact counts)`} · {done}/{t.matches.length} matches {t.paused ? '· paused' : t.running ? '· running' : ''}</p>
        </div>
        <div className="row-wrap">
          {champion && <span className="chip ok" style={{ fontSize: 13 }}>🏆 Champion: {getAlgorithm(champion).name}</span>}
          <button className="btn" onClick={() => exportRes('json')}>{Icon.download}JSON</button>
          <button className="btn" onClick={() => exportRes('csv')}>{Icon.download}CSV</button>
        </div>
      </div>
      <div className="progress-bar" style={{ marginBottom: 16 }}><div style={{ width: `${(done / Math.max(1, t.matches.length)) * 100}%` }} /></div>
      {t.cfg.format === 'elimination' ? (
        <div className="bracket">
          {Array.from({ length: t.rounds }, (_, r) => (
            <div className="round" key={r}>
              <div className="label">{r === t.rounds - 1 ? 'Final' : r === t.rounds - 2 ? 'Semifinal' : `Round ${r + 1}`} · {t.matches.find((m) => m.round === r)?.n.toLocaleString()} {t.matches.find((m) => m.round === r)?.pattern}</div>
              {t.matches.filter((m) => m.round === r).map((m) => (
                <div className="match" key={m.id} onClick={() => watch(m)} title="Click to load this match into the visual battle">
                  {[['a', m.a, m.scoreA], ['b', m.b, m.scoreB]].map(([k, id, sc]) => (
                    <div key={k as string} className={`side ${m.done && m.winner === id ? 'win' : m.done ? 'lose' : ''}`}>
                      <span>{id ? getAlgorithm(id as string).name : m.done ? 'bye' : '…'}</span>
                      <span className="mono">{fmtScore(sc as number | null)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="cols-2">
          <div className="card">
            <h3>Standings (3 pts win, 1 draw)</h3>
            <table className="tbl">
              <thead><tr><th>#</th><th>Algorithm</th><th className="num">Pts</th><th className="num">W</th><th className="num">D</th><th className="num">L</th><th className="num">Total {t.cfg.metric}</th></tr></thead>
              <tbody>{standings.map((s, i) => <tr key={s.id}><td>{i + 1}</td><td>{getAlgorithm(s.id).name}</td><td className="num">{s.points}</td><td className="num">{s.wins}</td><td className="num">{s.draws}</td><td className="num">{s.losses}</td><td className="num">{fmtScore(s.total)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="card" style={{ maxHeight: 560, overflow: 'auto' }}>
            <h3>Matches</h3>
            <table className="tbl">
              <thead><tr><th>Rd</th><th>Match</th><th className="num">Score</th><th>Dataset</th></tr></thead>
              <tbody>{t.matches.map((m) => (
                <tr key={m.id} onClick={() => watch(m)} style={{ cursor: 'pointer' }}>
                  <td>{m.round + 1}</td>
                  <td>{m.a && getAlgorithm(m.a).name} <span className="dim">vs</span> {m.b && getAlgorithm(m.b).name}</td>
                  <td className="num">{m.done ? `${fmtScore(m.scoreA)} : ${fmtScore(m.scoreB)}` : '…'}</td>
                  <td className="small muted">{m.n.toLocaleString()} {m.pattern}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
