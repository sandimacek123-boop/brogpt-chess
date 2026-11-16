import { useEffect, useMemo, useRef, useState } from 'react';
import { getAlgorithm } from '../algorithms';
import { PATTERNS, PatternId } from '../core/patterns';
import { BattleController, BattleStatus, Pacing } from '../engine/battle';
import { useSettings } from '../state/SettingsContext';
import { Button, Card, Field, fmtInt, fmtMs, Segmented, Select, Slider } from '../ui/controls';
import { IconClose, IconPause, IconPlay, IconPlus, IconRestart, IconTrophy, IconWarn } from '../ui/icons';
import { algorithmGroups } from './VisualizerPage';

const PRESETS: { name: string; ids: string[] }[] = [
  { name: 'Quadratic classics', ids: ['bubble', 'insertion', 'selection', 'cocktail'] },
  { name: 'n log n heavyweights', ids: ['quick', 'merge', 'heap', 'tim'] },
  { name: 'Hybrids', ids: ['intro', 'pdq', 'tim', 'powersort'] },
  { name: 'Quicksort family', ids: ['quick-lomuto', 'quick', 'quick-dual', 'quick-3way', 'quick-bm', 'intro'] },
  { name: 'Non-comparison', ids: ['counting', 'radix-lsd-10', 'radix-msd-4', 'american-flag', 'flash', 'bucket'] },
  { name: 'Sorting networks', ids: ['bitonic', 'odd-even-merge', 'merge-exchange', 'pairwise', 'bose-nelson', 'periodic-balanced'] },
  { name: 'Shellsort gaps', ids: ['shell', 'shell-knuth', 'shell-sedgewick86', 'shell-tokuda', 'shell-ciura', 'shell-pratt', 'shell-hibbard', 'shell-lee'] },
];

function BarChart({ title, rows, unit }: { title: string; rows: { label: string; value: number; display: string }[]; unit: string }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-300">
        {title} <span className="font-normal normal-case tracking-normal text-ink-400">({unit}, lower is better)</span>
      </figcaption>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="group grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs" title={`${r.label}: ${r.display}`}>
            <span className="truncate text-ink-300">{r.label}</span>
            <span className="h-3 rounded-r-[4px] bg-white/[0.04]">
              <span
                className="block h-full rounded-r-[4px] bg-[#7b5cff] transition-[width] duration-500 group-hover:bg-[#9d85ff]"
                style={{ width: `${Math.max(0.5, (r.value / max) * 100)}%` }}
              />
            </span>
            <span className="tnum text-ink-100">{r.display}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

export default function BattlePage() {
  const { settings, audio } = useSettings();
  const ctrlRef = useRef<BattleController | null>(null);
  if (!ctrlRef.current) ctrlRef.current = new BattleController(settings, audio);
  const ctrl = ctrlRef.current;
  const [ids, setIds] = useState<string[]>(['bubble', 'insertion', 'quick', 'merge']);
  const [n, setN] = useState(128);
  const [pattern, setPattern] = useState<PatternId>('random');
  const [pacing, setPacing] = useState<Pacing>('ops');
  const [duration, setDuration] = useState(20);
  const [st, setSt] = useState<BattleStatus>(() => ctrl.status());
  const [addId, setAddId] = useState('heap');

  useEffect(() => {
    ctrl.start();
    const unsub = ctrl.subscribe(setSt);
    return () => {
      unsub();
      ctrl.dispose();
    };
  }, [ctrl]);

  useEffect(() => {
    ctrl.settings = settings;
  }, [ctrl, settings]);

  useEffect(() => {
    ctrl.setAlgorithms(ids);
  }, [ctrl, ids]);

  useEffect(() => {
    ctrl.pacing = pacing;
    ctrl.duration = duration;
    if (st.phase !== 'setup' && st.phase !== 'computing') ctrl.applyPacing();
  }, [ctrl, pacing, duration, st.phase]);

  const maxN = useMemo(() => Math.min(...ids.map((id) => getAlgorithm(id).maxN)), [ids]);
  const limiting = ids.filter((id) => getAlgorithm(id).maxN < n);
  const canStart = ids.length >= 2 && n <= maxN && st.phase !== 'computing';

  const begin = async () => {
    const seed = settings.lockSeed ? settings.seed : (Math.random() * 2 ** 31) >>> 0;
    await ctrl.prepare(n, pattern, seed);
    if (ctrl.phase === 'ready') ctrl.play();
  };

  const finished = st.lanes.filter((l) => l.finishedAt !== null).sort((a, b) => a.finishedAt! - b.finishedAt!);
  const winner = st.phase === 'done' ? finished.find((l) => l.sorted) : undefined;
  const withResults = st.lanes.filter((l) => l.result);
  const fastest = [...withResults].filter((l) => l.result!.status === 'sorted').sort((a, b) => (a.result!.timedMs ?? 1e18) - (b.result!.timedMs ?? 1e18))[0];
  const fewest = [...withResults].filter((l) => l.result!.status === 'sorted').sort((a, b) => a.result!.operations - b.result!.operations)[0];
  const cols = ids.length <= 2 ? 'sm:grid-cols-2' : ids.length <= 4 ? 'sm:grid-cols-2' : ids.length <= 6 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="flex flex-col gap-5">
      <div className="fade-up">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Algorithm <span className="text-rainbow">Battle</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-400">
          Up to eight algorithms sort the exact same array. Each one is computed and timed separately in a Web Worker, then all lanes start playback on the same frame.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          {ids.map((id, i) => (
            <span key={`${id}-${i}`} className="inline-flex h-10 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] pl-3 pr-1 text-sm text-ink-100">
              {getAlgorithm(id).name}
              <button
                type="button"
                aria-label={`Remove ${getAlgorithm(id).name}`}
                disabled={ids.length <= 2 || st.phase === 'computing'}
                onClick={() => setIds(ids.filter((_, k) => k !== i))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <IconClose width={14} height={14} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="flex gap-2">
            <Select ariaLabel="Algorithm to add" value={addId} onChange={setAddId} groups={algorithmGroups} />
            <Button onClick={() => setIds([...ids, addId])} disabled={ids.length >= 8 || st.phase === 'computing'} title="Add algorithm">
              <IconPlus /> Add
            </Button>
          </div>
          <div className="hidden md:block" />
          <Select
            ariaLabel="Preset"
            value=""
            onChange={(v) => {
              const p = PRESETS.find((x) => x.name === v);
              if (p) {
                setIds(p.ids.slice(0, 8));
                const m = Math.min(...p.ids.map((id) => getAlgorithm(id).maxN));
                if (n > m) setN(m);
              }
            }}
            options={[{ value: '', label: 'Load a preset…' }, ...PRESETS.map((p) => ({ value: p.name, label: `${p.name} (${p.ids.length})` }))]}
          />
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-4">
          <Field label="Elements" right={fmtInt(n)} hint={`Max for this line-up: ${fmtInt(maxN)}`}>
            <Slider ariaLabel="Battle element count" min={3} max={14} value={Math.round(Math.log2(n))} onChange={(v) => setN(2 ** v)} />
          </Field>
          <Field label="Starting pattern">
            <Select ariaLabel="Battle pattern" value={pattern} onChange={(v) => setPattern(v as PatternId)} options={PATTERNS.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Race duration" right={`${duration} s`} hint="Playback length of the slowest lane.">
            <Slider ariaLabel="Race duration" min={3} max={120} value={duration} onChange={setDuration} />
          </Field>
          <Field
            label="Pacing"
            hint={pacing === 'ops' ? 'Every lane plays the same number of operations per second: finish order = operation count.' : 'Lane durations are proportional to measured compute time: finish order = real speed.'}
          >
            <Segmented
              ariaLabel="Pacing"
              value={pacing}
              onChange={setPacing}
              options={[
                { value: 'ops', label: 'Equal ops/s' },
                { value: 'time', label: 'Real time' },
              ]}
            />
          </Field>
        </div>
        {limiting.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <IconWarn className="mt-0.5 shrink-0" />
            <span>
              {limiting.map((id) => `${getAlgorithm(id).name} (max ${fmtInt(getAlgorithm(id).maxN)})`).join(', ')} cannot run with {fmtInt(n)} elements. Reduce the element count or
              remove {limiting.length > 1 ? 'them' : 'it'}.
            </span>
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {st.phase === 'computing' ? (
            <Button onClick={() => ctrl.cancel()}>
              Cancel ({st.computed}/{ids.length} computed)
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void begin()} disabled={!canStart}>
              <IconPlay /> {st.phase === 'setup' ? 'Start battle' : 'New battle'}
            </Button>
          )}
          {(st.phase === 'racing' || st.phase === 'paused' || st.phase === 'ready' || st.phase === 'done') && (
            <>
              <Button onClick={() => (st.phase === 'racing' ? ctrl.pause() : ctrl.play())}>
                {st.phase === 'racing' ? <IconPause /> : <IconPlay />}
                {st.phase === 'racing' ? 'Pause' : st.phase === 'done' ? 'Replay' : 'Resume'}
              </Button>
              <Button onClick={() => ctrl.restart()}>
                <IconRestart /> Restart
              </Button>
            </>
          )}
          <span className="ml-auto text-xs text-ink-400 tnum">
            {st.phase !== 'setup' && `n = ${fmtInt(st.n)} · seed ${st.seed} · race clock ${st.raceTime.toFixed(1)} s`}
          </span>
        </div>
        {st.message && <div className="mt-3 text-sm text-rose-200">{st.message}</div>}
      </Card>

      {winner && (
        <div className="fade-up flex flex-col gap-1 rounded-2xl border border-[#ffd23b]/30 bg-gradient-to-r from-[#ffd23b]/15 via-[#ff3bd8]/10 to-[#7b5cff]/15 px-5 py-4 sm:flex-row sm:items-center sm:gap-4" role="status">
          <IconTrophy width={28} height={28} className="text-[#ffd23b]" />
          <div>
            <div className="text-lg font-bold text-white">{getAlgorithm(winner.algorithmId).name} wins the race!</div>
            <div className="text-sm text-ink-300">
              {pacing === 'ops' ? 'Fewest animated operations (comparisons + swaps + array writes).' : 'Fastest measured compute time.'} Fastest measured:{' '}
              {fastest ? getAlgorithm(fastest.algorithmId).name : '—'} · Fewest total operations incl. aux writes: {fewest ? getAlgorithm(fewest.algorithmId).name : '—'}
            </div>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-3 ${cols}`}>
        {st.lanes.map((l) => {
          const algo = getAlgorithm(l.algorithmId);
          const place = finished.findIndex((f) => f.key === l.key);
          return (
            <div key={l.key} className="card overflow-hidden p-0">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{algo.name}</div>
                  <div className="truncate text-[11px] text-ink-400 tnum">
                    {l.result ? `${fmtInt(l.result.stats.comparisons)} cmp · ${fmtInt(l.result.stats.swaps + l.result.stats.writes)} moves · ${fmtMs(l.result.timedMs)}` : algo.average}
                  </div>
                </div>
                {place >= 0 && (
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${place === 0 && l.sorted ? 'bg-[#ffd23b] text-ink-950' : 'bg-white/10 text-ink-100'}`}>
                    #{place + 1} {l.sorted === false ? '✗' : ''}
                  </span>
                )}
              </div>
              <canvas ref={(c) => ctrl.attachCanvas(l.key, c)} className="block h-44 w-full sm:h-52" aria-label={`${algo.name} lane`} />
              <div className="h-1 bg-white/[0.05]">
                <div className="rainbow-line h-full" style={{ width: `${l.progress * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {withResults.length === st.lanes.length && withResults.length > 0 && (
        <>
          <Card title="Rankings">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-ink-400">
                    <th className="py-2 pr-3">Race</th>
                    <th className="py-2 pr-3">Algorithm</th>
                    <th className="py-2 pr-3 text-right">Compute (mean)</th>
                    <th className="py-2 pr-3 text-right">Comparisons</th>
                    <th className="py-2 pr-3 text-right">Swaps</th>
                    <th className="py-2 pr-3 text-right">Writes</th>
                    <th className="py-2 pr-3 text-right">Aux writes</th>
                    <th className="py-2 pr-3 text-right">Total ops</th>
                    <th className="py-2 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {[...st.lanes]
                    .sort((a, b) => (a.finishedAt ?? 1e9) - (b.finishedAt ?? 1e9) || (a.result!.timedMs ?? 0) - (b.result!.timedMs ?? 0))
                    .map((l) => {
                      const r = l.result!;
                      const place = finished.findIndex((f) => f.key === l.key);
                      return (
                        <tr key={l.key} className="tnum">
                          <td className="py-2 pr-3 text-ink-300">{place >= 0 ? `#${place + 1}` : '—'}</td>
                          <td className="py-2 pr-3 text-ink-100">{getAlgorithm(l.algorithmId).name}</td>
                          <td className="py-2 pr-3 text-right text-ink-100">{fmtMs(r.timedMs)}</td>
                          <td className="py-2 pr-3 text-right">{fmtInt(r.stats.comparisons)}</td>
                          <td className="py-2 pr-3 text-right">{fmtInt(r.stats.swaps)}</td>
                          <td className="py-2 pr-3 text-right">{fmtInt(r.stats.writes)}</td>
                          <td className="py-2 pr-3 text-right">{fmtInt(r.stats.auxWrites)}</td>
                          <td className="py-2 pr-3 text-right">{fmtInt(r.operations)}</td>
                          <td className="py-2 text-right">{r.status === 'sorted' ? <span className="text-emerald-300">sorted</span> : <span className="text-rose-300">{r.status}</span>}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-400">
              Compute time is the mean of repeated runs (≥ 60 ms in total) in the worker, with operation counting but no trace recording. Race order under “Equal ops/s” follows
              animated operations; aux writes are counted in totals but not animated.
            </p>
          </Card>
          <Card title="Comparison charts">
            <div className="grid gap-6 lg:grid-cols-3">
              <BarChart
                title="Compute time"
                unit="ms"
                rows={withResults.map((l) => ({ label: getAlgorithm(l.algorithmId).name, value: l.result!.timedMs ?? l.result!.computeMs, display: fmtMs(l.result!.timedMs ?? l.result!.computeMs) }))}
              />
              <BarChart title="Comparisons" unit="count" rows={withResults.map((l) => ({ label: getAlgorithm(l.algorithmId).name, value: l.result!.stats.comparisons, display: fmtInt(l.result!.stats.comparisons) }))} />
              <BarChart title="Total operations" unit="count" rows={withResults.map((l) => ({ label: getAlgorithm(l.algorithmId).name, value: l.result!.operations, display: fmtInt(l.result!.operations) }))} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
