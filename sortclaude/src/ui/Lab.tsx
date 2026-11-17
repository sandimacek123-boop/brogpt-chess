import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ALGORITHMS, CATEGORIES, getAlgorithm } from '../engine/registry';
import { recordRun, countRun, type Recording } from '../engine/runner';
import { Timeline } from '../engine/timeline';
import { Op, OP_NAMES } from '../engine/ops';
import { generateKeys, PATTERNS, type PatternId } from '../engine/generators';
import { Rng, randomSeed } from '../engine/rng';
import { Renderer2D } from '../render/renderer2d';
import { buildViewCache, makeView, type ViewCache } from '../render/view';
import { useApp, safeGet, safeSet } from '../state/store';
import { Icon, Segmented, fmt, fmtMs, saveBlob, pickFile } from './components';
import { renderOptions } from './Stage';
import { Scrubber } from './Visualizer';
import { runSandboxed, EXAMPLES, CUSTOM_API_DOC, type SandboxResult } from '../custom/sandbox';

export function Lab() {
  const [algoId, setAlgoId] = useState('quick');
  const [tab, setTab] = useState<'learn' | 'challenges' | 'custom'>('learn');
  const [q, setQ] = useState('');
  return (
    <div className="lab-layout">
      <div className="lab-list">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'learn', label: 'Learn' }, { value: 'challenges', label: 'Challenges' }, { value: 'custom', label: 'Creator' }]} />
        {tab === 'learn' && (
          <>
            <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search algorithms" />
            {CATEGORIES.map((c) => {
              const items = ALGORITHMS.filter((a) => a.category === c && a.name.toLowerCase().includes(q.toLowerCase()));
              if (!items.length) return null;
              return (
                <div key={c}>
                  <div className="algo-group" style={{ background: 'transparent', position: 'static' }}>{c}</div>
                  {items.map((a) => (
                    <button key={a.id} className={`algo-item ${a.id === algoId ? 'active' : ''}`} onClick={() => setAlgoId(a.id)}>{a.name}</button>
                  ))}
                </div>
              );
            })}
          </>
        )}
        {tab === 'challenges' && <div className="hint">Six challenge types built from real recorded runs. Each question is generated from a fresh seed; explanations come from the actual operation log.</div>}
        {tab === 'custom' && <CustomDocs />}
      </div>
      <div className="page-scroll">
        {tab === 'learn' && <Learn key={algoId} algoId={algoId} />}
        {tab === 'challenges' && <Challenges />}
        {tab === 'custom' && <CustomEditor />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ learn
function Learn({ algoId }: { algoId: string }) {
  const a = getAlgorithm(algoId);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{a.name}</h1>
          <p>{a.description}</p>
        </div>
        <div className="row-wrap">
          <span className="tag">{a.category}</span>
          <span className={`tag ${a.stable ? 'stable' : ''}`}>{a.stable ? 'Stable' : 'Not stable'}</span>
          <span className="tag">{a.inPlace ? 'In place' : 'Out of place'}</span>
          <span className="tag">{a.comparison ? 'Comparison-based' : 'Non-comparison'}</span>
        </div>
      </div>
      <div className="cols-3">
        <div className="card">
          <h3>Complexity</h3>
          <div className="cx-grid">
            <div><span>Best</span><b>{a.best}</b></div>
            <div><span>Average</span><b>{a.average}</b></div>
            <div><span>Worst</span><b>{a.worst}</b></div>
            <div><span>Space</span><b>{a.space}</b></div>
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>{a.notes}</p>
        </div>
        <div className="card">
          <h3>Strengths / weaknesses</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {a.strengths.map((s) => <li key={s} style={{ color: 'var(--green)' }}><span style={{ color: 'var(--text-1)' }}>{s}</span></li>)}
            {a.weaknesses.map((s) => <li key={s} style={{ color: 'var(--red)' }}><span style={{ color: 'var(--text-1)' }}>{s}</span></li>)}
          </ul>
        </div>
        <div className="card">
          <h3>Use cases & observation</h3>
          <p style={{ marginTop: 0 }}>{a.useCases}</p>
          <p className="muted" style={{ marginBottom: 0 }}>💡 {a.observation}</p>
          {a.maxKeySpan !== undefined && <p className="hint">Input constraint: integer keys with span ≤ {a.maxKeySpan.toLocaleString()}.</p>}
          {a.novelty && <p className="hint" style={{ color: 'var(--amber)' }}>Novelty algorithm: expected work is enormous or unbounded; limited to {a.maxN} elements.</p>}
        </div>
      </div>
      <div className="cols-2">
        <div className="card">
          <h3>Pseudocode</h3>
          <div className="code">{a.pseudocode}</div>
          <p className="hint" style={{ marginBottom: 0 }}>Line-level highlighting is not shown: operations are instrumented at the array-primitive level, not per source line, so a line mapping would be guesswork.</p>
        </div>
        <Stepper algoId={algoId} />
      </div>
    </div>
  );
}

function describeOp(tl: Timeline, k: number, prev?: [number, number, number, number]): string {
  if (k < 0) return 'Initial array. Press → to execute the first operation.';
  const [t, a, b, c] = tl.opAt(k);
  // tl is positioned AFTER op k, so values shown are post-op
  const v = (i: number) => (i >= 0 && i < tl.n ? tl.keys[tl.ids[i]] : '?');
  switch (t) {
    case Op.COMPARE:
      return `Compare a[${a}] = ${v(a)} with a[${b}] = ${v(b)} → ${c < 0 ? `${v(a)} < ${v(b)}` : c > 0 ? `${v(a)} > ${v(b)}` : 'equal'}.`;
    case Op.COMPARE_HELD:
      return `Compare the held value with a[${a}] = ${v(a)} → held is ${c < 0 ? 'smaller' : c > 0 ? 'larger' : 'equal'}.`;
    case Op.COMPARE_AUX:
      return `Compare two values held in auxiliary memory${a >= 0 ? ` (near index ${a}${b >= 0 ? ` and ${b}` : ''})` : ''} → ${c < 0 ? 'first is smaller' : c > 0 ? 'first is larger' : 'equal'}.`;
    case Op.SWAP: {
      const why = prev && prev[0] === Op.COMPARE && ((prev[1] === a && prev[2] === b) || (prev[1] === b && prev[2] === a)) && prev[3] !== 0 ? ' because the previous comparison found them out of order' : '';
      return `Swap a[${a}] and a[${b}]${why}. Now a[${a}] = ${v(a)}, a[${b}] = ${v(b)}.`;
    }
    case Op.WRITE:
      return `Write ${tl.keys[b]} into a[${a}] (it held ${tl.keys[c]}).`;
    case Op.MOVE:
      return `Move: copy the value ${tl.keys[b]} into a[${a}] (shifting).`;
    case Op.READ:
      return `Read a[${a}] = ${v(a)} into a register.`;
    case Op.TO_AUX:
      return `Copy a[${a}] = ${v(a)} into auxiliary memory.`;
    case Op.AUX_STORE:
      return `Store a held value into auxiliary memory.`;
    case Op.PIVOT:
      return `Pivot is now a[${a}] = ${v(a)}.`;
    case Op.RANGE:
      return `Working on the sub-array a[${a}..${b}].`;
    case Op.SORTED:
      return `a[${a}] = ${v(a)} is now in its final position.`;
    case Op.ALLOC:
      return `Allocate ${a} elements of auxiliary memory.`;
    case Op.FREE:
      return `Release ${a} elements of auxiliary memory.`;
    default:
      return OP_NAMES[t] ?? 'Operation';
  }
}

function Stepper({ algoId }: { algoId: string }) {
  const a = getAlgorithm(algoId);
  const [n, setN] = useState(Math.min(10, a.maxN));
  const [seed, setSeed] = useState(7);
  const [pattern, setPattern] = useState<PatternId>('random');
  const [, force] = useReducer((x) => x + 1, 0);
  const tl = useMemo(() => {
    const keys = generateKeys({ n, pattern, seed });
    const rec = recordRun(algoId, keys, { seed, skipValidation: a.novelty ? false : true, opLimit: 200000 });
    return new Timeline(rec);
  }, [algoId, n, seed, pattern]);
  const k = tl.pos - 1;
  const op = k >= 0 ? tl.opAt(k) : null;
  const prev = k >= 1 ? tl.opAt(k - 1) : undefined;
  const cmp = new Set<number>();
  const wr = new Set<number>();
  if (op) {
    if (op[0] === Op.COMPARE) [op[1], op[2]].forEach((i) => cmp.add(i));
    if (op[0] === Op.COMPARE_HELD || op[0] === Op.READ || op[0] === Op.TO_AUX) cmp.add(op[1]);
    if (op[0] === Op.COMPARE_AUX) [op[1], op[2]].filter((i) => i >= 0).forEach((i) => cmp.add(i));
    if (op[0] === Op.SWAP) [op[1], op[2]].forEach((i) => wr.add(i));
    if (op[0] === Op.WRITE || op[0] === Op.MOVE) wr.add(op[1]);
  }
  const c = tl.getCounters();
  const recent: string[] = [];
  for (let j = Math.max(0, tl.pos - 6); j < tl.pos; j++) {
    const o = tl.opAt(j);
    if (o[0] === Op.TO_AUX || o[0] === Op.AUX_STORE || o[0] === Op.ALLOC || o[0] === Op.FREE) recent.push(`#${j + 1} ${OP_NAMES[o[0]]}${o[0] === Op.TO_AUX ? ` a[${o[1]}]` : o[0] === Op.ALLOC || o[0] === Op.FREE ? ` ${o[1]}` : ''}`);
  }
  return (
    <div className="card stack">
      <h3>Interactive step-through</h3>
      <div className="row-wrap">
        <select className="select" style={{ width: 90 }} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Array size">
          {[4, 6, 8, 10, 12, 16].filter((x) => x <= a.maxN).map((x) => <option key={x} value={x}>{x} items</option>)}
        </select>
        <select className="select" style={{ width: 170 }} value={pattern} onChange={(e) => setPattern(e.target.value as PatternId)} aria-label="Pattern">
          {PATTERNS.filter((p) => p.id !== 'custom').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn" onClick={() => setSeed(randomSeed())}>{Icon.dice}New array</button>
      </div>
      <div className="array-cells" style={{ paddingBottom: 14 }}>
        {Array.from({ length: tl.n }, (_, i) => (
          <div key={i} className={`cell ${cmp.has(i) ? 'cmp' : ''} ${wr.has(i) ? 'wr' : ''} ${tl.pivot === i ? 'pv' : ''} ${tl.sorted[i] ? 'done' : ''}`}>
            {tl.key(i)}
            <span className="ix">{i}</span>
          </div>
        ))}
      </div>
      <div className="explain" aria-live="polite">{describeOp(tl, k, prev)}</div>
      <div className="controls">
        <button className="btn icon" aria-label="Back to start" onClick={() => { tl.seek(0); force(); }}>{Icon.toStart}</button>
        <button className="btn icon" aria-label="Previous operation" disabled={tl.pos === 0} onClick={() => { tl.stepBackward(); force(); }}>{Icon.stepB}</button>
        <button className="btn icon" aria-label="Next operation" disabled={tl.done} onClick={() => { tl.stepForward(); force(); }}>{Icon.stepF}</button>
        <button className="btn" disabled={tl.done} onClick={() => { do tl.stepForward(); while (!tl.done && ![Op.SWAP, Op.WRITE, Op.MOVE].includes(tl.opAt(tl.pos - 1)[0] as Op)); force(); }}>Next write/swap</button>
        <span className="muted small">op {tl.pos}/{tl.total}</span>
      </div>
      <div className="row-wrap small muted">
        <span>comparisons <b className="mono">{c.comparisons}</b></span>
        <span>swaps <b className="mono">{c.swaps}</b></span>
        <span>writes <b className="mono">{c.writes}</b></span>
        <span>aux memory <b className="mono">{c.auxMemory}</b></span>
      </div>
      {(c.auxMemory > 0 || recent.length > 0) && <div className="hint">Temporary storage: {c.auxMemory} element(s) allocated. Recent aux events: {recent.join(' · ') || '—'}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ mini player (shared)
export function MiniPlayer({ rec, title }: { rec: Recording; title?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const state = useRef<{ tl: Timeline; cache: ViewCache; playing: boolean; acc: number } | null>(null);
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    const tl = new Timeline(rec, 32 * 1024 * 1024);
    state.current = { tl, cache: buildViewCache(tl), playing: false, acc: 0 };
    const r = new Renderer2D(canvasRef.current!);
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const scratch = { compare: [] as number[], write: [] as number[] };
    let tick = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = state.current!;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (s.playing) {
        s.acc += (Math.max(60, s.tl.total / 10)) * dt;
        const k = Math.floor(s.acc);
        s.acc -= k;
        s.tl.stepForward(k);
        if (s.tl.done) s.playing = false;
        if (++tick % 6 === 0 || !s.playing) force();
      }
      const host = hostRef.current;
      const c = canvasRef.current;
      if (!host || !c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(host.clientWidth * dpr);
      const h = Math.round(host.clientHeight * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const st = useApp.getState().settings;
      const opts = renderOptions(st, 0.75, false);
      if (opts.viz === 'heatmap') opts.viz = 'bars';
      r.render(makeView(s.tl, s.cache, s.playing ? 4 : 1, (now - t0) / 1000, -1, scratch), opts);
    };
    raf = requestAnimationFrame(loop);
    force();
    return () => cancelAnimationFrame(raf);
  }, [rec]);
  const s = state.current;
  return (
    <div className="card stack">
      {title && <h3>{title}</h3>}
      <div ref={hostRef} style={{ position: 'relative', height: 220, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      </div>
      {s && (
        <>
          <Scrubber value={s.tl.pos / Math.max(1, s.tl.total)} onChange={(p) => { s.tl.seek(Math.round(p * s.tl.total)); force(); }} />
          <div className="controls">
            <button className="btn icon" aria-label="Step back" onClick={() => { s.playing = false; s.tl.stepBackward(); force(); }}>{Icon.stepB}</button>
            <button className="btn primary icon" aria-label="Play or pause" onClick={() => { if (s.tl.done) s.tl.seek(0); s.playing = !s.playing; force(); }}>{s.playing ? Icon.pause : Icon.play}</button>
            <button className="btn icon" aria-label="Step forward" onClick={() => { s.playing = false; s.tl.stepForward(); force(); }}>{Icon.stepF}</button>
            <span className="small muted">op {fmt(s.tl.pos)} / {fmt(s.tl.total)} · cmp {fmt(s.tl.getCounters().comparisons)} · swaps {fmt(s.tl.getCounters().swaps)} · writes {fmt(s.tl.getCounters().writes)}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ challenges
type Challenge = { kind: string; prompt: string; options: string[]; answer: number; explain: string; rec?: Recording; cells?: number[]; numeric?: boolean };

function makeChallenge(kind: string, rng: Rng): Challenge {
  const pick = <T,>(arr: T[]) => arr[rng.int(arr.length)];
  const shuffle = <T,>(arr: T[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const seed = rng.nextU32();
  if (kind === 'swap') {
    const algo = pick(['bubble', 'selection', 'gnome', 'cocktail', 'quick', 'heap']);
    const keys = generateKeys({ n: 7, pattern: 'random', seed });
    const tl = new Timeline(recordRun(algo, keys, { seed }));
    const swaps: number[] = [];
    for (let k = 0; k < tl.total; k++) if (tl.opAt(k)[0] === Op.SWAP) swaps.push(k);
    const k = swaps[Math.min(swaps.length - 1, rng.int(Math.max(1, Math.ceil(swaps.length / 2))))];
    tl.seek(k);
    const [, a, b] = tl.opAt(k);
    const right = `a[${Math.min(a, b)}] ↔ a[${Math.max(a, b)}]`;
    const opts = new Set([right]);
    while (opts.size < 4) {
      const i = rng.int(7);
      const j = rng.int(7);
      if (i !== j) opts.add(`a[${Math.min(i, j)}] ↔ a[${Math.max(i, j)}]`);
    }
    const list = shuffle([...opts]);
    return { kind, prompt: `${getAlgorithm(algo).name} is running on this array. Which pair will it swap next?`, options: list, answer: list.indexOf(right), cells: Array.from({ length: 7 }, (_, i) => tl.key(i)), explain: `The next swap in the recorded run exchanges a[${a}] = ${tl.key(a)} and a[${b}] = ${tl.key(b)}. ${getAlgorithm(algo).description}` };
  }
  if (kind === 'pivot') {
    const algo = pick(['quick', 'quick-hoare', 'quick-median3']);
    const keys = generateKeys({ n: 8, pattern: 'random', seed });
    const tl = new Timeline(recordRun(algo, keys, { seed }));
    let k = 0;
    while (k < tl.total && tl.opAt(k)[0] !== Op.PIVOT) k++;
    tl.seek(k);
    const cells = Array.from({ length: 8 }, (_, i) => tl.key(i));
    const pv = tl.opAt(k)[1];
    const right = String(cells[pv]);
    const opts = shuffle(Array.from(new Set([right, ...shuffle(cells.map(String)).slice(0, 5)])).slice(0, 4));
    if (!opts.includes(right)) opts[0] = right;
    const rule = algo === 'quick' ? 'Lomuto partitioning uses the LAST element of the range' : algo === 'quick-hoare' ? 'this Hoare variant uses the MIDDLE element (index ⌊(lo+hi)/2⌋)' : 'median-of-three first orders a[lo], a[mid], a[hi] and uses the median, which ends up in the middle';
    return { kind, prompt: `${getAlgorithm(algo).name} is about to partition this array${algo === 'quick-median3' ? ' (after median-of-three ordering)' : ''}. Which value is the pivot?`, options: opts, answer: opts.indexOf(right), cells, explain: `The pivot is ${right}: ${rule}.` };
  }
  if (kind === 'complexity') {
    const algo = pick(ALGORITHMS.filter((a) => !a.novelty && ['O(n²)', 'O(n log n)'].includes(a.average)));
    const right = algo.average;
    const opts = shuffle(['O(n)', 'O(n log n)', 'O(n²)', 'O(n log² n)']);
    return { kind, prompt: `What is the average-case time complexity of ${algo.name}?`, options: opts, answer: opts.indexOf(right), explain: `${algo.name}: best ${algo.best}, average ${algo.average}, worst ${algo.worst}. ${algo.description}` };
  }
  if (kind === 'guess') {
    const choices = shuffle(['bubble', 'selection', 'insertion', 'merge', 'quick', 'heap', 'radix-lsd', 'shell-ciura', 'cocktail', 'odd-even-merge']).slice(0, 4);
    const right = choices[rng.int(4)];
    const keys = generateKeys({ n: 48, pattern: 'random', seed });
    return { kind, prompt: 'Watch the animation. Which algorithm is this?', options: choices.map((c) => getAlgorithm(c).name), answer: choices.indexOf(right), rec: recordRun(right, keys, { seed }), explain: `It was ${getAlgorithm(right).name}. Tell-tale behaviour: ${getAlgorithm(right).description}` };
  }
  if (kind === 'fastest') {
    const pattern = pick<PatternId>(['sorted', 'reversed', 'nearly-sorted', 'few-unique', 'random']);
    const choices = shuffle(['insertion', 'quick', 'merge', 'heap', 'selection', 'timsort', 'quick-3way', 'bubble-opt']).slice(0, 4);
    const keys = generateKeys({ n: 1000, pattern, seed });
    const res = choices.map((c) => ({ c, v: countRun(c, keys, { seed }).comparisons }));
    const best = res.reduce((a, b) => (b.v < a.v ? b : a));
    return { kind, prompt: `On 1,000 elements with “${PATTERNS.find((p) => p.id === pattern)!.name}” input, which algorithm performs the FEWEST comparisons?`, options: choices.map((c) => getAlgorithm(c).name), answer: choices.indexOf(best.c), explain: `Measured on that exact dataset: ${res.sort((a, b) => a.v - b.v).map((r) => `${getAlgorithm(r.c).name} ${r.v.toLocaleString()}`).join(' · ')}.` };
  }
  // count comparisons
  const algo = pick(['bubble', 'selection', 'insertion', 'exchange']);
  const n = 5 + rng.int(2);
  const keys = generateKeys({ n, pattern: 'random', seed });
  const cnt = countRun(algo, keys, { seed }).comparisons;
  const why = algo === 'bubble' || algo === 'selection' || algo === 'exchange' ? `${getAlgorithm(algo).name} always performs n(n−1)/2 = ${(n * (n - 1)) / 2} comparisons regardless of input.` : `Insertion sort performs one comparison per shift plus one stopping comparison for each element that does not reach the front: n − 1 + (number of inversions) − (elements that reach index 0).`;
  return { kind, prompt: `How many comparisons does ${getAlgorithm(algo).name} make on this array?`, options: [], answer: cnt, numeric: true, cells: Array.from(keys), explain: `Exactly ${cnt}. ${why}` };
}

const KINDS = [
  { id: 'swap', name: 'Predict the next swap' },
  { id: 'pivot', name: 'Identify the pivot' },
  { id: 'complexity', name: 'Estimate complexity' },
  { id: 'guess', name: 'Guess the algorithm' },
  { id: 'fastest', name: 'Fewest comparisons for a pattern' },
  { id: 'count', name: 'Count the comparisons' },
];

function Challenges() {
  const [kind, setKind] = useState('swap');
  const [seed, setSeed] = useState(() => randomSeed());
  const ch = useMemo(() => makeChallenge(kind, new Rng(seed)), [kind, seed]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [num, setNum] = useState('');
  const [score, setScore] = useState({ right: 0, total: 0 });
  useEffect(() => {
    setChosen(null);
    setNum('');
  }, [ch]);
  const answer = (i: number) => {
    if (chosen !== null) return;
    setChosen(i);
    setScore((s) => ({ right: s.right + (i === ch.answer ? 1 : 0), total: s.total + 1 }));
  };
  const correct = chosen !== null && chosen === ch.answer;
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Challenges</h1>
          <p>Questions are generated from real recorded runs. Score: {score.right}/{score.total}</p>
        </div>
      </div>
      <div className="row-wrap">
        {KINDS.map((k) => <button key={k.id} className={`btn ${kind === k.id ? 'on' : ''}`} onClick={() => { setKind(k.id); setSeed(randomSeed()); }}>{k.name}</button>)}
      </div>
      <div className="card stack">
        <h2>{ch.prompt}</h2>
        {ch.cells && (
          <div className="array-cells" style={{ paddingBottom: 14 }}>
            {ch.cells.map((v, i) => <div key={i} className="cell">{v}<span className="ix">{i}</span></div>)}
          </div>
        )}
        {ch.rec && <MiniPlayer rec={ch.rec} />}
        {ch.numeric ? (
          <div className="row-wrap">
            <input className="input mono" style={{ width: 140 }} value={num} onChange={(e) => setNum(e.target.value.replace(/[^\d]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && num && answer(Number(num) === ch.answer ? ch.answer : -1)} aria-label="Your answer" disabled={chosen !== null} />
            <button className="btn primary" disabled={!num || chosen !== null} onClick={() => answer(Number(num) === ch.answer ? ch.answer : -1)}>Check</button>
          </div>
        ) : (
          <div>
            {ch.options.map((o, i) => (
              <button key={o + i} className={`choice ${chosen !== null && i === ch.answer ? 'right' : ''} ${chosen === i && i !== ch.answer ? 'wrong' : ''}`} onClick={() => answer(i)}>{o}</button>
            ))}
          </div>
        )}
        {chosen !== null && (
          <div className="explain" style={{ borderColor: correct ? 'rgba(52,211,153,0.4)' : 'rgba(251,113,133,0.4)', background: correct ? 'rgba(52,211,153,0.06)' : 'rgba(251,113,133,0.06)' }}>
            <b>{correct ? 'Correct!' : 'Not quite.'}</b> {ch.explain}
          </div>
        )}
        <div><button className="btn" onClick={() => setSeed(randomSeed())}>Next question →</button></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ custom algorithm creator
const CUSTOM_KEY = 'sortclaude.custom.v1';
interface SavedAlgo {
  name: string;
  code: string;
  description: string;
}
function loadSaved(): SavedAlgo[] {
  try {
    const v = JSON.parse(safeGet(CUSTOM_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x?.name === 'string' && typeof x?.code === 'string') : [];
  } catch {
    return [];
  }
}

function CustomDocs() {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="label">Restricted API</div>
      {CUSTOM_API_DOC.map(([f, d]) => (
        <div key={f}>
          <code className="mono" style={{ color: 'var(--cyan)' }}>{f}</code>
          <div className="hint">{d}</div>
        </div>
      ))}
      <div className="hint">Define <code>function sort(n)</code>. Code runs in an isolated Web Worker with no DOM, network, storage or desktop APIs, limited to 2,000,000 operations and 8 seconds. Plain JS variables (temporary storage) are allowed but are not counted as operations.</div>
    </div>
  );
}

function CustomEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState('My Sort');
  const [desc, setDesc] = useState('');
  const [n, setN] = useState(64);
  const [pattern, setPattern] = useState<PatternId>('random');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [saved, setSaved] = useState<SavedAlgo[]>(loadSaved);
  const cancelRef = useRef<{ cancel?: () => void }>({});

  useEffect(() => {
    let destroyed = false;
    (async () => {
      const [{ EditorView, basicSetup }, { javascript, javascriptLanguage }, { oneDark }, { completeFromList }] = await Promise.all([import('codemirror'), import('@codemirror/lang-javascript'), import('@codemirror/theme-one-dark'), import('@codemirror/autocomplete')]);
      if (destroyed || !hostRef.current) return;
      const apiCompletions = javascriptLanguage.data.of({
        autocomplete: completeFromList(CUSTOM_API_DOC.map(([f, d]) => ({ label: f.split('(')[0], type: 'function', detail: f.slice(f.indexOf('(')), info: d }))),
      });
      viewRef.current = new EditorView({ doc: EXAMPLES[0].code, extensions: [basicSetup, javascript(), oneDark, apiCompletions, EditorView.theme({ '&': { backgroundColor: '#07070d' }, '.cm-gutters': { backgroundColor: '#07070d' } })], parent: hostRef.current });
    })();
    return () => {
      destroyed = true;
      viewRef.current?.destroy();
    };
  }, []);

  const code = () => viewRef.current?.state.doc.toString() ?? '';
  const setCode = (c: string) => viewRef.current?.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: c } });

  const run = async () => {
    setRunning(true);
    setResult(null);
    const keys = generateKeys({ n, pattern, seed: 99 });
    const r = await runSandboxed(code(), keys, { opLimit: 2_000_000, timeLimitMs: 8000, seed: 99 }, cancelRef.current);
    setResult(r);
    setRunning(false);
  };

  const save = () => {
    const list = [...saved.filter((s) => s.name !== name), { name: name.slice(0, 60), code: code(), description: desc.slice(0, 300) }];
    setSaved(list);
    safeSet(CUSTOM_KEY, JSON.stringify(list));
    toast('Saved locally.', 'success');
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Custom Algorithm Creator</h1>
          <p>Write a sorting algorithm against the instrumented API. It is executed in a sandbox and its real operations are recorded, verified and visualized.</p>
        </div>
      </div>
      <div className="cols-2">
        <div className="stack">
          <div className="row-wrap">
            <input className="input" style={{ width: 180 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Algorithm name" />
            <select className="select" style={{ width: 200 }} value="" onChange={(e) => { const ex = EXAMPLES.find((x) => x.name === e.target.value) ?? saved.find((x) => x.name === e.target.value); if (ex) { setCode(ex.code); setName(ex.name); } }} aria-label="Load example">
              <option value="">Load example / saved…</option>
              <optgroup label="Examples">{EXAMPLES.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</optgroup>
              {saved.length > 0 && <optgroup label="Saved">{saved.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</optgroup>}
            </select>
          </div>
          <input className="input" placeholder="Short description (metadata)" value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Description" />
          <div className="editor-host" ref={hostRef} data-testid="editor" />
          <div className="row-wrap">
            <select className="select" style={{ width: 110 }} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Test size">{[8, 16, 32, 64, 128, 256, 512].map((x) => <option key={x} value={x}>{x} items</option>)}</select>
            <select className="select" style={{ width: 170 }} value={pattern} onChange={(e) => setPattern(e.target.value as PatternId)} aria-label="Test pattern">{PATTERNS.filter((p) => p.id !== 'custom').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            {!running ? <button className="btn primary" onClick={run} data-testid="run-custom">{Icon.play}Run</button> : <button className="btn danger" onClick={() => cancelRef.current.cancel?.()}>{Icon.stop}Stop</button>}
            <button className="btn" onClick={save}>{Icon.save}Save</button>
            <button className="btn" onClick={() => saveBlob(new Blob([JSON.stringify({ format: 'sortclaude-algorithm', version: 1, name, description: desc, code: code() }, null, 2)], { type: 'application/json' }), `${name.replace(/[^\w-]+/g, '_')}.sortclaude.json`)}>{Icon.download}Export</button>
            <button className="btn" onClick={async () => {
              const f = await pickFile('.json,application/json');
              if (!f) return;
              if (f.size > 200_000) return toast('File too large (max 200 KB).', 'error');
              try {
                const d = JSON.parse(await f.text());
                if (d?.format !== 'sortclaude-algorithm' || typeof d.code !== 'string' || typeof d.name !== 'string') throw new Error('not a SortClaude algorithm file');
                setCode(d.code);
                setName(String(d.name).slice(0, 60));
                setDesc(String(d.description ?? '').slice(0, 300));
                toast('Imported. Code is only executed inside the sandbox when you press Run.', 'success');
              } catch (e) {
                toast(`Import failed: ${(e as Error).message}`, 'error');
              }
            }}>{Icon.open}Import</button>
          </div>
        </div>
        <div className="stack">
          {running && <div className="card"><span className="spinner" /> Running in sandbox…</div>}
          {result && (
            <div className="card stack" data-testid="custom-result">
              <h3>Verification</h3>
              {result.error && <div className="chip err" style={{ whiteSpace: 'normal' }}>{result.error}{result.errorLine ? ` (line ${result.errorLine})` : ''}</div>}
              <div className="row-wrap">
                <span className={`chip ${result.sorted ? 'ok' : 'err'}`}>{result.sorted ? '✓ Output is sorted' : '✗ Output is NOT sorted'}</span>
                <span className={`chip ${result.multisetOk ? 'ok' : 'err'}`}>{result.multisetOk ? '✓ No elements lost or inserted' : '✗ Elements were lost or duplicated'}</span>
              </div>
              {result.counts && (
                <div className="row-wrap small muted">
                  <span>operations <b className="mono">{fmt(result.counts.operations)}</b></span>
                  <span>comparisons <b className="mono">{fmt(result.counts.comparisons)}</b></span>
                  <span>swaps <b className="mono">{fmt(result.counts.swaps)}</b></span>
                  <span>writes <b className="mono">{fmt(result.counts.writes)}</b></span>
                  <span>reads <b className="mono">{fmt(result.counts.reads)}</b></span>
                  <span>time <b className="mono">{fmtMs(result.rec?.executionMs ?? NaN)}</b></span>
                </div>
              )}
              {result.logs.length > 0 && <div className="code" style={{ maxHeight: 140, overflow: 'auto' }}>{result.logs.join('\n')}</div>}
            </div>
          )}
          {result?.rec && result.rec.opCount > 0 && <MiniPlayer rec={result.rec} title={`${name} — recorded operations`} />}
        </div>
      </div>
    </div>
  );
}
