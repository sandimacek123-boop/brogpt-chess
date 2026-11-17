import { useMemo, useRef, useState } from 'react';
import { ALGORITHMS, getAlgorithm } from '../engine/registry';
import { PATTERNS, generateKeys, type PatternId } from '../engine/generators';
import { SortWorker } from '../workers/client';
import { summarize, type PerfResult } from '../battle/engine';
import { useApp } from '../state/store';
import { Icon, Select, fmt, fmtMs, saveBlob } from './components';
import { LineChart, RankBars, SERIES_COLORS, MAX_SERIES, compact, type Series } from './Charts';
import { normalizeSeed } from '../engine/rng';

interface Row extends PerfResult {
  n: number;
  pattern: PatternId;
  successRate: number;
  auxPeak: number;
}

const SIZE_OPTIONS = [100, 1000, 5000, 10000, 50000, 100000, 250000, 1000000];

export function Benchmark() {
  const toast = useApp((s) => s.toast);
  const [algos, setAlgos] = useState<string[]>(['quick-median3', 'merge', 'heap', 'timsort', 'shell-ciura', 'radix-lsd']);
  const [sizes, setSizes] = useState<number[]>([1000, 10000, 50000]);
  const [patterns, setPatterns] = useState<PatternId[]>(['random']);
  const [seed, setSeed] = useState(1234);
  const [runs, setRuns] = useState(5);
  const [warmup, setWarmup] = useState(2);
  const [mode, setMode] = useState<'parallel' | 'sequential'>('sequential');
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [logScale, setLogScale] = useState(true);
  const [chartPattern, setChartPattern] = useState<PatternId>('random');
  const workers = useRef<SortWorker[]>([]);
  const cancelled = useRef(false);

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    algos.forEach((id, i) => map.set(id, SERIES_COLORS[i % SERIES_COLORS.length]));
    return (id: string) => map.get(id) ?? '#8c8c8c';
  }, [algos]);

  const run = async () => {
    const jobs: { id: string; n: number; p: PatternId }[] = [];
    for (const p of patterns) for (const n of sizes) for (const id of algos) jobs.push({ id, n, p });
    const skipped = jobs.filter((j) => j.n > getAlgorithm(j.id).benchMaxN);
    const todo = jobs.filter((j) => j.n <= getAlgorithm(j.id).benchMaxN);
    if (skipped.length) toast(`${skipped.length} combination(s) skipped: element count above the algorithm’s benchmark limit.`, 'info');
    if (!todo.length) return;
    cancelled.current = false;
    setRows([]);
    const conc = mode === 'parallel' ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)) : 1;
    workers.current = Array.from({ length: conc }, () => new SortWorker(true));
    const results: Row[] = [];
    let next = 0;
    let done = 0;
    const worker = async (w: SortWorker) => {
      while (next < todo.length && !cancelled.current) {
        const j = todo[next++];
        setStatus(`${getAlgorithm(j.id).name} · ${j.n.toLocaleString()} · ${j.p}`);
        const keys = generateKeys({ n: j.n, pattern: j.p, seed });
        try {
          const res = await w.count(j.id, keys, seed, runs, warmup, 60_000);
          const s = summarize(j.id, res);
          results.push({ ...s, n: j.n, pattern: j.p, successRate: res.filter((r) => r.sorted && !r.error).length / Math.max(1, runs), auxPeak: res[0]?.auxPeak ?? 0 });
        } catch (e) {
          if ((e as Error).message === 'Cancelled') return;
          results.push({ algorithmId: j.id, median: NaN, mean: NaN, min: NaN, max: NaN, std: NaN, runs: 0, comparisons: 0, writes: 0, swaps: 0, error: (e as Error).message, n: j.n, pattern: j.p, successRate: 0, auxPeak: 0 });
        }
        done++;
        setProgress(done / todo.length);
        setRows([...results]);
      }
    };
    await Promise.all(workers.current.map(worker));
    workers.current.forEach((w) => w.dispose());
    workers.current = [];
    setStatus('');
    if (!cancelled.current) toast('Benchmark complete.', 'success');
  };

  const cancel = () => {
    cancelled.current = true;
    workers.current.forEach((w) => w.cancel());
    setStatus('');
  };

  const shown = algos.slice(0, MAX_SERIES);
  const series = (val: (r: Row) => number): Series[] =>
    shown.map((id) => ({ id, name: getAlgorithm(id).name, color: colorOf(id), points: rows.filter((r) => r.algorithmId === id && r.pattern === chartPattern && Number.isFinite(val(r))).map((r) => ({ x: r.n, y: val(r) })) }));
  const largest = Math.max(0, ...rows.filter((r) => r.pattern === chartPattern).map((r) => r.n));

  const exportData = async (kind: 'csv' | 'json') => {
    const meta = { format: 'sortclaude-benchmark', version: 1, date: new Date().toISOString(), seed, runs, warmup, mode, userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency };
    if (kind === 'json') await saveBlob(new Blob([JSON.stringify({ ...meta, results: rows }, null, 2)], { type: 'application/json' }), 'sortclaude-benchmark.json');
    else {
      const head = 'algorithm,n,pattern,median_ms,mean_ms,min_ms,max_ms,std_ms,runs,comparisons,swaps,writes,aux_peak,success_rate,error';
      const body = rows.map((r) => [getAlgorithm(r.algorithmId).name, r.n, r.pattern, r.median, r.mean, r.min, r.max, r.std, r.runs, r.comparisons, r.swaps, r.writes, r.auxPeak, r.successRate, r.error ?? ''].join(','));
      await saveBlob(new Blob([`${head}\n${body.join('\n')}\n`], { type: 'text/csv' }), 'sortclaude-benchmark.csv');
    }
  };

  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>Benchmark Championship</h1>
          <p>Measures algorithm execution in Web Workers with no rendering. Every algorithm gets the same seeded data. Counts (comparisons, writes) are exact; times are real measurements of this JavaScript runtime.</p>
        </div>
        <div className="row-wrap">
          <button className="btn" disabled={!rows.length} onClick={() => exportData('csv')}>{Icon.download}CSV</button>
          <button className="btn" disabled={!rows.length} onClick={() => exportData('json')}>{Icon.download}JSON</button>
        </div>
      </div>
      <div className="cols-3" style={{ marginBottom: 14 }}>
        <div className="card">
          <h3>Algorithms ({algos.length})</h3>
          <div className="algo-list" style={{ maxHeight: 230 }}>
            {ALGORITHMS.filter((a) => !a.novelty).map((a) => (
              <label key={a.id} className="algo-item" style={{ cursor: 'pointer' }}>
                <span><input type="checkbox" checked={algos.includes(a.id)} onChange={() => setAlgos(algos.includes(a.id) ? algos.filter((x) => x !== a.id) : [...algos, a.id])} /> {a.name}</span>
                <span className="cx">≤ {compact(a.benchMaxN)}</span>
              </label>
            ))}
          </div>
          {algos.length > MAX_SERIES && <div className="hint" style={{ marginTop: 8 }}>Charts show the first {MAX_SERIES}; every algorithm appears in the table.</div>}
        </div>
        <div className="card stack">
          <h3>Datasets</h3>
          <div className="field">
            <label>Element counts</label>
            <div className="row-wrap">
              {SIZE_OPTIONS.map((n) => (
                <button key={n} className={`btn ${sizes.includes(n) ? 'on' : ''}`} onClick={() => setSizes(sizes.includes(n) ? sizes.filter((x) => x !== n) : [...sizes, n].sort((a, b) => a - b))}>{compact(n)}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Input patterns</label>
            <div className="row-wrap">
              {PATTERNS.filter((p) => p.id !== 'custom').map((p) => (
                <button key={p.id} className={`btn ${patterns.includes(p.id) ? 'on' : ''}`} style={{ height: 28, fontSize: 11.5 }} onClick={() => setPatterns(patterns.includes(p.id) ? patterns.filter((x) => x !== p.id) : [...patterns, p.id])}>{p.name}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Seed</label>
            <input className="input mono" value={seed} onChange={(e) => setSeed(normalizeSeed(e.target.value || '0'))} aria-label="Benchmark seed" />
          </div>
        </div>
        <div className="card stack">
          <h3>Measurement</h3>
          <div className="cols-2">
            <div className="field"><label>Timed runs</label><input className="input mono" type="number" min={1} max={50} value={runs} onChange={(e) => setRuns(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></div>
            <div className="field"><label>Warm-up runs</label><input className="input mono" type="number" min={0} max={20} value={warmup} onChange={(e) => setWarmup(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} /></div>
          </div>
          <Select label="Concurrency" value={mode} onChange={setMode} options={[{ value: 'sequential', label: 'Sequential (1 worker — most stable timings)' }, { value: 'parallel', label: `Parallel (up to ${Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))} workers — faster, noisier)` }]} />
          <div className="hint">Measurement: wall-clock time of the count-only run (no op log, no rendering) using performance.now(). Median is reported as the headline value. Warm-up runs let the JIT optimise before timing.</div>
          <div className="row-wrap">
            {!status ? <button className="btn primary lg" onClick={run} disabled={!algos.length || !sizes.length || !patterns.length} data-testid="run-bench">{Icon.play}Run benchmark</button> : <button className="btn lg danger" onClick={cancel}>{Icon.stop}Cancel</button>}
          </div>
          {status && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="progress-bar"><div style={{ width: `${progress * 100}%` }} /></div>
              <div className="hint"><span className="spinner" /> {status} · {(progress * 100).toFixed(0)}%</div>
            </div>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="row-wrap" style={{ marginBottom: 12 }}>
            <span className="label">Charts for</span>
            <select className="select" style={{ width: 200 }} value={chartPattern} onChange={(e) => setChartPattern(e.target.value as PatternId)} aria-label="Chart pattern">
              {patterns.map((p) => <option key={p} value={p}>{PATTERNS.find((x) => x.id === p)?.name}</option>)}
            </select>
            <button className={`btn ${logScale ? 'on' : ''}`} onClick={() => setLogScale(!logScale)}>Log scales</button>
          </div>
          <div className="cols-2" style={{ marginBottom: 14 }}>
            <LineChart title="Median runtime vs element count" series={series((r) => r.median)} xLabel="elements" yLabel="ms" logX={logScale} logY={logScale} yFormat={(v) => (v < 1 ? v.toPrecision(2) : compact(v))} />
            <LineChart title="Comparisons vs element count" series={series((r) => r.comparisons)} xLabel="elements" yLabel="comparisons" logX={logScale} logY={logScale} />
            <LineChart title="Array writes vs element count" series={series((r) => r.writes)} xLabel="elements" yLabel="writes" logX={logScale} logY={logScale} />
            <LineChart title="Complexity check: comparisons ÷ (n·log₂n)" series={series((r) => (r.n > 1 ? r.comparisons / (r.n * Math.log2(r.n)) : NaN))} xLabel="elements" yLabel="ratio" logX={logScale} yFormat={(v) => v.toFixed(2)} />
          </div>
          <div className="hint" style={{ marginTop: -6, marginBottom: 14 }}>Complexity check: a flat line means the comparison count grows like n·log n; a rising line means faster growth (e.g. n²); falling toward 0 means sub-n·log n (e.g. distribution sorts with few comparisons).</div>
          <div className="cols-2" style={{ marginBottom: 14 }}>
            <RankBars title={`Ranking by median runtime · n = ${largest.toLocaleString()}`} format={fmtMs} rows={rows.filter((r) => r.n === largest && r.pattern === chartPattern).map((r) => ({ id: r.algorithmId, name: getAlgorithm(r.algorithmId).name, value: r.median, color: colorOf(r.algorithmId) }))} />
            <RankBars title={`Ranking by comparisons · n = ${largest.toLocaleString()}`} format={(v) => fmt(v)} rows={rows.filter((r) => r.n === largest && r.pattern === chartPattern).map((r) => ({ id: r.algorithmId, name: getAlgorithm(r.algorithmId).name, value: r.comparisons, color: colorOf(r.algorithmId) }))} />
          </div>
        </>
      )}

      {rows.length > 0 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <h3>All results</h3>
          <table className="tbl">
            <thead>
              <tr><th>Algorithm</th><th className="num">n</th><th>Pattern</th><th className="num">Median</th><th className="num">Mean</th><th className="num">Min</th><th className="num">Max</th><th className="num">Std dev</th><th className="num">Comparisons</th><th className="num">Swaps</th><th className="num">Writes</th><th className="num">Aux peak</th><th className="num">Success</th></tr>
            </thead>
            <tbody>
              {[...rows].sort((a, b) => a.pattern.localeCompare(b.pattern) || a.n - b.n || a.median - b.median).map((r, i) => (
                <tr key={i}>
                  <td>{getAlgorithm(r.algorithmId).name}{r.error ? <span className="chip err" style={{ marginLeft: 6 }}>{r.error.slice(0, 40)}</span> : null}</td>
                  <td className="num">{r.n.toLocaleString()}</td>
                  <td>{r.pattern}</td>
                  <td className="num">{fmtMs(r.median)}</td>
                  <td className="num">{fmtMs(r.mean)}</td>
                  <td className="num">{fmtMs(r.min)}</td>
                  <td className="num">{fmtMs(r.max)}</td>
                  <td className="num">{fmtMs(r.std)}</td>
                  <td className="num">{fmt(r.comparisons)}</td>
                  <td className="num">{fmt(r.swaps)}</td>
                  <td className="num">{fmt(r.writes)}</td>
                  <td className="num">{fmt(r.auxPeak)}</td>
                  <td className="num">{(r.successRate * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Limitations of JavaScript benchmarking</h3>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Times include the instrumentation interface every algorithm runs through (identical for all algorithms), so they are comparable to each other but not to native C/C++ library sorts.</li>
          <li>JIT compilation, garbage collection, CPU frequency scaling and thermal throttling cause run-to-run variance — look at the standard deviation and prefer the median.</li>
          <li>Browser timer resolution may be coarsened (to 0.1 ms or more) for security; very small inputs can read as 0.</li>
          <li>Results from different machines, browsers, or the desktop app vs. the website are not directly comparable.</li>
          <li>Memory is reported as auxiliary elements allocated by the algorithm (exact), not process memory, which JavaScript cannot measure precisely.</li>
        </ul>
      </div>
    </div>
  );
}
