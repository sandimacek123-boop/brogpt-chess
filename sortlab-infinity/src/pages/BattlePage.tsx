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
  { name: 'Stable in-place block merges', ids: ['grail', 'wiki', 'symmerge', 'merge-inplace', 'tim', 'merge'] },
  { name: 'Quicksort family', ids: ['quick-lomuto', 'quick', 'quick-dual', 'quick-3way', 'quick-bm', 'intro'] },
  { name: 'Non-comparison', ids: ['counting', 'radix-lsd-10', 'radix-msd-4', 'american-flag', 'flash', 'bucket'] },
  { name: 'Sorting networks', ids: ['bitonic', 'odd-even-merge', 'merge-exchange', 'pairwise', 'bose-nelson', 'periodic-balanced'] },
  { name: 'Shellsort gaps', ids: ['shell', 'shell-knuth', 'shell-sedgewick86', 'shell-tokuda', 'shell-ciura', 'shell-pratt', 'shell-hibbard', 'shell-lee'] },
];

function BarChart({ title, rows, unit }: { title: string; rows: { label: string; value: number; display: string }[]; unit: string }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <figure className="min-w-0">
      <figcaption className="mb-4">
        <span className="kicker">{title}</span> <span className="text-[11px] text-ink-500">· {unit}, lower is better</span>
      </figcaption>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.label} className="group grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[12px]" title={`${r.label}: ${r.display}`}>
            <span className="truncate text-ink-300">{r.label}</span>
            <span className="h-2 rounded-r-[4px] bg-white/[0.04]">
              <span
                className="block h-full rounded-r-[4px] bg-accent transition-[width] duration-700 group-hover:bg-white"
                style={{ width: `${Math.max(0.5, (r.value / max) * 100)}%` }}
              />
            </span>
            <span className="font-mono text-[11.5px] text-ink-100 tnum">{r.display}</span>
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
  const cols = ids.length <= 4 ? 'grid-cols-2' : ids.length <= 6 ? 'grid-cols-3' : 'grid-cols-4';
  const laneH = ids.length <= 2 ? 'h-[46vh]' : ids.length <= 4 ? 'h-[30vh]' : 'h-[26vh]';

  return (
    <div>
      <header className="fade-up flex items-end justify-between gap-10">
        <div>
          <div className="kicker">Battle mode</div>
          <h1 className="mt-4 font-display text-[clamp(56px,6vw,96px)] font-semibold leading-[0.92] tracking-[-0.045em] text-white">
            Same array.
            <br />
            <span className="text-ink-500">May the best sort win.</span>
          </h1>
        </div>
        <p className="mb-2 max-w-md text-[14px] leading-relaxed text-ink-400">
          Up to eight algorithms sort an identical array. Each one is computed and timed on its own in a Web Worker, then every lane starts on the same frame.
        </p>
      </header>

      <section className="panel fade-up mt-12 p-6" style={{ animationDelay: '0.1s' }}>
        <div className="flex items-center justify-between gap-4">
          <span className="kicker">Line-up · {ids.length} / 8</span>
          <div className="flex items-center gap-2">
            <div className="w-64">
              <Select ariaLabel="Algorithm to add" value={addId} onChange={setAddId} groups={algorithmGroups} />
            </div>
            <Button onClick={() => setIds([...ids, addId])} disabled={ids.length >= 8 || st.phase === 'computing'} title="Add algorithm">
              <IconPlus width={15} height={15} /> Add
            </Button>
            <div className="w-64">
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
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {ids.map((id, i) => (
            <span key={`${id}-${i}`} className="pop-in inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] pl-4 pr-1.5 text-[13px] text-white">
              <span className="font-mono text-[10px] text-ink-500">{String(i + 1).padStart(2, '0')}</span>
              {getAlgorithm(id).name}
              <button
                type="button"
                aria-label={`Remove ${getAlgorithm(id).name}`}
                disabled={ids.length <= 2 || st.phase === 'computing'}
                onClick={() => setIds(ids.filter((_, k) => k !== i))}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-500 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <IconClose width={12} height={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="hairline my-6" />
        <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] items-end gap-8">
          <Field label="Elements" right={fmtInt(n)} hint={`Max for this line-up: ${fmtInt(maxN)}`}>
            <Slider ariaLabel="Battle element count" min={3} max={14} value={Math.round(Math.log2(n))} onChange={(v) => setN(2 ** v)} />
          </Field>
          <Field label="Starting pattern">
            <Select ariaLabel="Battle pattern" value={pattern} onChange={(v) => setPattern(v as PatternId)} options={PATTERNS.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Race duration" right={`${duration} s`} hint="Playback length of the slowest lane.">
            <Slider ariaLabel="Race duration" min={3} max={120} value={duration} onChange={setDuration} />
          </Field>
          <Field label="Pacing" hint={pacing === 'ops' ? 'Finish order = operation count' : 'Finish order = measured speed'}>
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
          <div className="flex items-center gap-2 pb-6">
            {st.phase === 'computing' ? (
              <Button onClick={() => ctrl.cancel()} className="h-12 px-6">
                Cancel ({st.computed}/{ids.length})
              </Button>
            ) : (
              <Button variant="primary" onClick={() => void begin()} disabled={!canStart} className="h-12 px-6 text-[14px]">
                <IconPlay width={16} height={16} /> {st.phase === 'setup' ? 'Start battle' : 'New battle'}
              </Button>
            )}
          </div>
        </div>
        {limiting.length > 0 && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-[13px] text-amber-100">
            <IconWarn width={16} height={16} className="mt-0.5 shrink-0 text-amber-300" />
            <span>
              {limiting.map((id) => `${getAlgorithm(id).name} (max ${fmtInt(getAlgorithm(id).maxN)})`).join(', ')} cannot run with {fmtInt(n)} elements. Reduce the element count or
              remove {limiting.length > 1 ? 'them' : 'it'}.
            </span>
          </div>
        )}
        {st.message && <div className="mt-3 text-[13px] text-rose-200">{st.message}</div>}
      </section>

      {st.phase !== 'setup' && (
        <div className="mt-8 flex items-center gap-3">
          {(st.phase === 'racing' || st.phase === 'paused' || st.phase === 'ready' || st.phase === 'done') && (
            <>
              <Button onClick={() => (st.phase === 'racing' ? ctrl.pause() : ctrl.play())}>
                {st.phase === 'racing' ? <IconPause width={15} height={15} /> : <IconPlay width={15} height={15} />}
                {st.phase === 'racing' ? 'Pause' : st.phase === 'done' ? 'Replay' : 'Resume'}
              </Button>
              <Button onClick={() => ctrl.restart()}>
                <IconRestart width={15} height={15} /> Restart
              </Button>
            </>
          )}
          <span className="ml-auto font-mono text-[11.5px] text-ink-500 tnum">
            n = {fmtInt(st.n)} · seed {st.seed} · race clock <span className="text-ink-200">{st.raceTime.toFixed(1)}s</span>
          </span>
        </div>
      )}

      {winner && (
        <div className="relative mt-6 overflow-hidden rounded-3xl border border-white/[0.08] px-10 py-9" role="status">
          <div className="pointer-events-none absolute inset-0 opacity-[0.16] rainbow-line shimmer" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/80 to-transparent" />
          <div className="relative flex items-end justify-between gap-10">
            <div>
              <div className="kicker flex items-center gap-2 text-[#ffd23b]">
                <IconTrophy width={15} height={15} /> Winner
              </div>
              <div key={winner.key} className="title-swap mt-3 font-display text-[64px] font-semibold leading-none tracking-[-0.045em] text-white">
                {getAlgorithm(winner.algorithmId).name}
              </div>
            </div>
            <div className="max-w-md pb-1 text-right text-[13px] leading-relaxed text-ink-300">
              {pacing === 'ops' ? 'Fewest animated operations (comparisons + swaps + array writes).' : 'Fastest measured compute time.'}
              <br />
              Fastest measured: <span className="text-white">{fastest ? getAlgorithm(fastest.algorithmId).name : '—'}</span> · Fewest total operations:{' '}
              <span className="text-white">{fewest ? getAlgorithm(fewest.algorithmId).name : '—'}</span>
            </div>
          </div>
        </div>
      )}

      {st.lanes.length > 0 && (
        <div className={`mt-6 grid gap-3 ${cols}`}>
          {st.lanes.map((l) => {
            const algo = getAlgorithm(l.algorithmId);
            const place = finished.findIndex((f) => f.key === l.key);
            const first = place === 0 && l.sorted;
            return (
              <div
                key={l.key}
                className={`relative overflow-hidden rounded-2xl border bg-ink-950 transition duration-700 ${first ? 'border-[#ffd23b]/50 shadow-[0_0_60px_-20px_rgba(255,210,59,0.6)]' : 'border-white/[0.06]'}`}
              >
                <canvas ref={(c) => ctrl.attachCanvas(l.key, c)} className={`block w-full ${laneH}`} aria-label={`${algo.name} lane`} />
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-3">
                  <div className="min-w-0">
                    <div className="truncate font-display text-[16px] font-semibold tracking-tight text-white">{algo.name}</div>
                    <div className="truncate font-mono text-[10.5px] text-ink-400 tnum">
                      {l.result ? `${fmtInt(l.result.stats.comparisons)} cmp · ${fmtInt(l.result.stats.swaps + l.result.stats.writes)} moves · ${fmtMs(l.result.timedMs)}` : algo.average}
                    </div>
                  </div>
                  {place >= 0 && (
                    <span className={`pop-in shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${first ? 'bg-[#ffd23b] text-ink-950' : 'bg-white/10 text-white'}`}>
                      #{place + 1} {l.sorted === false ? '✗' : ''}
                    </span>
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.04]">
                  <div className="rainbow-line h-full" style={{ width: `${l.progress * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {withResults.length === st.lanes.length && withResults.length > 0 && (
        <div className="mt-10 grid grid-cols-[1.4fr_1fr] gap-4">
          <Card title="Rankings">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.16em] text-ink-500">
                  <th className="pb-3 pr-3 font-semibold">Race</th>
                  <th className="pb-3 pr-3 font-semibold">Algorithm</th>
                  <th className="pb-3 pr-3 text-right font-semibold">Compute</th>
                  <th className="pb-3 pr-3 text-right font-semibold">Compares</th>
                  <th className="pb-3 pr-3 text-right font-semibold">Swaps</th>
                  <th className="pb-3 pr-3 text-right font-semibold">Writes</th>
                  <th className="pb-3 pr-3 text-right font-semibold">Aux</th>
                  <th className="pb-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {[...st.lanes]
                  .sort((a, b) => (a.finishedAt ?? 1e9) - (b.finishedAt ?? 1e9) || (a.result!.timedMs ?? 0) - (b.result!.timedMs ?? 0))
                  .map((l) => {
                    const r = l.result!;
                    const place = finished.findIndex((f) => f.key === l.key);
                    return (
                      <tr key={l.key} className="font-mono text-[12px] text-ink-300 tnum">
                        <td className="py-2.5 pr-3 text-ink-500">{place >= 0 ? `#${place + 1}` : '—'}</td>
                        <td className="py-2.5 pr-3 font-sans text-[13px] text-white">
                          {getAlgorithm(l.algorithmId).name} {r.status !== 'sorted' && <span className="text-rose-300">({r.status})</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-white">{fmtMs(r.timedMs)}</td>
                        <td className="py-2.5 pr-3 text-right">{fmtInt(r.stats.comparisons)}</td>
                        <td className="py-2.5 pr-3 text-right">{fmtInt(r.stats.swaps)}</td>
                        <td className="py-2.5 pr-3 text-right">{fmtInt(r.stats.writes)}</td>
                        <td className="py-2.5 pr-3 text-right">{fmtInt(r.stats.auxWrites)}</td>
                        <td className="py-2.5 text-right">{fmtInt(r.operations)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <p className="mt-5 text-[11.5px] leading-relaxed text-ink-500">
              Compute time is the mean of repeated runs (≥ 60 ms in total) in the worker, with operation counting but no trace recording. Under “Equal ops/s” the race order
              follows animated operations; aux writes are counted in totals but not animated.
            </p>
          </Card>
          <Card title="Head to head">
            <div className="flex flex-col gap-8">
              <BarChart
                title="Compute time"
                unit="ms"
                rows={withResults.map((l) => ({ label: getAlgorithm(l.algorithmId).name, value: l.result!.timedMs ?? l.result!.computeMs, display: fmtMs(l.result!.timedMs ?? l.result!.computeMs) }))}
              />
              <BarChart title="Comparisons" unit="count" rows={withResults.map((l) => ({ label: getAlgorithm(l.algorithmId).name, value: l.result!.stats.comparisons, display: fmtInt(l.result!.stats.comparisons) }))} />
              <BarChart title="Total operations" unit="count" rows={withResults.map((l) => ({ label: getAlgorithm(l.algorithmId).name, value: l.result!.operations, display: fmtInt(l.result!.operations) }))} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
