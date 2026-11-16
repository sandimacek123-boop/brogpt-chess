import { useEffect, useMemo, useRef, useState } from 'react';
import { ALGORITHMS, CATEGORIES, getAlgorithm } from '../algorithms';
import { PATTERNS, PatternId } from '../core/patterns';
import { VISUAL_MODES, VisualMode } from '../render/modes';
import type { VisualizerController, VisualizerStatus } from '../engine/visualizer';
import { useSettings } from '../state/SettingsContext';
import { effectiveSpeed, MAX_N, N_STEPS } from '../state/settings';
import { Button, Card, Field, fmtInt, fmtMs, fmtSpeed, logScale, Segmented, Select, Slider, Stat } from '../ui/controls';
import { IconFullscreen, IconPause, IconPlay, IconRestart, IconShuffle, IconSkip, IconStep, IconWarn } from '../ui/icons';
import RecordingPanel from '../ui/RecordingPanel';

const SPEED_MIN = 1;
const SPEED_MAX = 500_000;

export const algorithmGroups = CATEGORIES.map((c) => ({
  label: c,
  options: ALGORITHMS.filter((a) => a.category === c).map((a) => ({ value: a.id, label: a.name })),
})).filter((g) => g.options.length);

export function useStatus(controller: VisualizerController) {
  const [st, setSt] = useState<VisualizerStatus>(() => controller.status());
  useEffect(() => {
    const unsub = controller.subscribe(setSt);
    return () => {
      unsub();
    };
  }, [controller]);
  return st;
}

function log2Factorial(n: number) {
  let s = 0;
  for (let k = 2; k <= n; k++) s += Math.log2(k);
  return s;
}

export default function VisualizerPage({ controller }: { controller: VisualizerController }) {
  const { settings, update } = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const st = useStatus(controller);
  const algo = getAlgorithm(settings.algorithmId);
  const tooBig = settings.n > algo.maxN;
  const speed = effectiveSpeed(settings);
  const [nInput, setNInput] = useState(String(settings.n));

  useEffect(() => setNInput(String(settings.n)), [settings.n]);

  useEffect(() => {
    if (canvasRef.current) controller.attach(canvasRef.current);
    return () => controller.detach();
  }, [controller]);

  useEffect(() => {
    const onVis = () => controller.setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [controller]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        controller.togglePlay();
      } else if (e.key === 'r' || e.key === 'R') controller.restart();
      else if (e.key === 'n' || e.key === 'N') controller.regenerate();
      else if (e.key === 'ArrowRight' || e.key === '.') void controller.step();
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  const nIndex = useMemo(() => {
    let best = 0;
    N_STEPS.forEach((v, i) => {
      if (Math.abs(Math.log(v) - Math.log(settings.n)) < Math.abs(Math.log(N_STEPS[best]) - Math.log(settings.n))) best = i;
    });
    return best;
  }, [settings.n]);

  const playing = st.phase === 'playing';
  const final = st.result?.stats;
  const n = st.n;
  const totalPlayed = st.played.comparisons + st.played.swaps + st.played.writes;
  const nlogn = n > 1 ? n * Math.log2(n) : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Title */}
      <div className="fade-up flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
            <span>{algo.category}</span>
            <span className="text-ink-600">•</span>
            <span>{algo.stable ? 'Stable' : 'Unstable'}</span>
            <span className="text-ink-600">•</span>
            <span>{algo.inPlace ? 'In-place' : 'Out-of-place'}</span>
          </div>
          <h1 className="truncate text-3xl font-bold tracking-tight text-white sm:text-5xl">{algo.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ['Best', algo.best],
            ['Average', algo.average],
            ['Worst', algo.worst],
            ['Space', algo.space],
          ].map(([k, v]) => (
            <span key={k} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-ink-300">
              {k} <span className="font-mono text-ink-100">{v}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-950 shadow-[0_30px_80px_-30px_rgba(123,92,255,0.25)]">
        <canvas
          ref={canvasRef}
          className="block h-[46vh] min-h-[260px] w-full sm:h-[56vh] [:fullscreen_&]:h-screen"
          role="img"
          aria-label={`${algo.name} visualization of ${n} elements, ${Math.round(st.progress * 100)}% complete`}
          onClick={() => controller.togglePlay()}
        />
        <div className="absolute left-0 right-0 top-0 h-[3px] bg-white/[0.04]">
          <div className="rainbow-line h-full transition-[width] duration-100" style={{ width: `${st.progress * 100}%` }} />
        </div>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
          title="Fullscreen (F)"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-black/40 text-ink-300 backdrop-blur transition hover:text-white"
        >
          <IconFullscreen />
        </button>
        {st.phase === 'computing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-ink-900/90 px-6 py-5">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <div className="text-sm text-ink-100">Computing in Web Worker…</div>
              <Button onClick={() => controller.cancelCompute()}>Cancel</Button>
            </div>
          </div>
        )}
        {st.phase === 'idle' && !tooBig && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs text-ink-300 backdrop-blur">Press Start or Space to sort</span>
          </div>
        )}
      </div>

      {/* Warnings */}
      {(tooBig || algo.slow || st.message) && (
        <div className="flex flex-col gap-2">
          {tooBig && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2">
                <IconWarn className="mt-0.5 shrink-0" />
                {algo.name} is limited to {fmtInt(algo.maxN)} elements here (worst case {algo.worst}); {fmtInt(settings.n)} would be impractical to compute or watch.
              </span>
              <Button variant="soft" onClick={() => update({ n: algo.maxN })}>
                Use {fmtInt(algo.maxN)} elements
              </Button>
            </div>
          )}
          {algo.slow && !tooBig && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              <IconWarn className="mt-0.5 shrink-0" />
              <span>
                {algo.name} is extremely slow ({algo.average}). It is capped at {algo.maxN} elements and the run stops at the operation limit ({fmtInt(settings.opLimit)}).
              </span>
            </div>
          )}
          {st.message && (
            <div className="flex items-start gap-2 rounded-xl border border-[#ff2e63]/30 bg-[#ff2e63]/10 px-4 py-3 text-sm text-rose-100" role="status">
              <IconWarn className="mt-0.5 shrink-0" />
              <span>{st.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-live="off">
        <Stat label="Comparisons" accent={settings.compareColor} value={fmtInt(st.played.comparisons)} sub={final ? `of ${fmtInt(final.comparisons)}` : '—'} />
        <Stat label="Swaps" accent={settings.swapColor} value={fmtInt(st.played.swaps)} sub={final ? `of ${fmtInt(final.swaps)}` : '—'} />
        <Stat label="Array writes" accent={settings.writeColor} value={fmtInt(st.played.writes)} sub={final ? `of ${fmtInt(final.writes)}` : '—'} />
        <Stat label="Aux writes" value={final ? fmtInt(final.auxWrites) : '—'} sub="whole run (not animated)" />
        <Stat label="Total ops" value={fmtInt(totalPlayed)} sub={final ? `of ${fmtInt(st.totalOps)} visual` : '—'} />
        <Stat label="Progress" value={`${(st.progress * 100).toFixed(1)}%`} sub={st.sorted === null ? st.phase : st.sorted ? 'verified sorted ✓' : 'NOT sorted ✗'} />
        <Stat label="Playback" value={fmtMs(st.playbackMs)} sub={`${fmtSpeed(speed)} · ${Math.round(st.fps)} fps · draw ${st.drawMs.toFixed(1)} ms${st.quality ? ' · reduced quality' : ''}`} />
        <Stat
          label="Compute time"
          value={fmtMs(st.result?.timedMs ?? st.result?.computeMs)}
          sub={st.result ? `recorded run ${fmtMs(st.result.computeMs)}` : `n = ${fmtInt(n)} · seed ${st.seed}`}
        />
      </div>

      {/* Controls */}
      <Card>
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
          <Field label="Algorithm" right={`${ALGORITHMS.length} available`}>
            <Select ariaLabel="Algorithm" value={settings.algorithmId} onChange={(v) => update({ algorithmId: v })} groups={algorithmGroups} />
          </Field>
          <Field label="Visualization">
            <Select
              ariaLabel="Visualization shape"
              value={settings.mode}
              onChange={(v) => update({ mode: v as VisualMode })}
              options={VISUAL_MODES.map((m, i) => ({ value: m.id, label: `${i + 1}. ${m.name}` }))}
            />
          </Field>
          <Field label="Starting pattern">
            <Select ariaLabel="Starting pattern" value={settings.pattern} onChange={(v) => update({ pattern: v as PatternId })} options={PATTERNS.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => controller.togglePlay()} disabled={tooBig || st.phase === 'computing'} className="min-w-[120px]" ariaLabel={playing ? 'Pause' : 'Start'}>
            {playing ? <IconPause /> : <IconPlay />}
            {playing ? 'Pause' : st.phase === 'paused' ? 'Resume' : st.phase === 'done' ? 'Replay' : 'Start'}
          </Button>
          <Button onClick={() => void controller.step()} disabled={tooBig || st.phase === 'computing' || st.phase === 'done'} title="Single step (→)">
            <IconStep />
            <span className="hidden sm:inline">Step</span>
          </Button>
          <Button onClick={() => controller.restart()} disabled={st.phase === 'computing'} title="Restart run (R)">
            <IconRestart />
            <span className="hidden sm:inline">Restart</span>
          </Button>
          <Button onClick={() => controller.regenerate()} title="New array (N)">
            <IconShuffle />
            <span className="hidden sm:inline">New array</span>
          </Button>
          <Button onClick={() => controller.skipToEnd()} disabled={!st.result || st.phase === 'done'} title="Skip to the end">
            <IconSkip />
            <span className="hidden sm:inline">Finish</span>
          </Button>
          <div className="ml-auto">
            <Segmented
              ariaLabel="Speed mode"
              value={settings.speedMode}
              onChange={(v) => update({ speedMode: v })}
              options={[
                { value: 'slow', label: 'Slow-mo', title: '0.1× speed' },
                { value: 'normal', label: '1×' },
                { value: 'turbo', label: 'Turbo', title: '20× speed' },
              ]}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Speed" right={fmtSpeed(speed)}>
            <Slider
              ariaLabel="Sorting speed"
              min={0}
              max={1000}
              value={Math.round(logScale.toSlider(settings.speed, SPEED_MIN, SPEED_MAX) * 1000)}
              onChange={(t) => update({ speed: Math.round(logScale.fromSlider(t / 1000, SPEED_MIN, SPEED_MAX) * 10) / 10 })}
            />
          </Field>
          <Field
            label="Elements"
            right={
              <input
                aria-label="Element count"
                inputMode="numeric"
                className="w-20 rounded-md border border-white/10 bg-ink-800 px-2 py-0.5 text-right text-xs text-ink-100 outline-none focus:border-[#7b5cff]"
                value={nInput}
                onChange={(e) => setNInput(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => {
                  const v = Math.max(1, Math.min(MAX_N, parseInt(nInput || '1', 10)));
                  update({ n: v });
                  setNInput(String(v));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            }
            hint={`Max for ${algo.name}: ${fmtInt(algo.maxN)}`}
          >
            <Slider ariaLabel="Element count slider" min={0} max={N_STEPS.length - 1} value={nIndex} onChange={(i) => update({ n: N_STEPS[i] })} />
          </Field>
        </div>
        <div className="mt-3 text-xs text-ink-400">
          Shortcuts: <kbd className="text-ink-300">Space</kbd> play/pause · <kbd className="text-ink-300">→</kbd> step · <kbd className="text-ink-300">R</kbd> restart ·{' '}
          <kbd className="text-ink-300">N</kbd> new array · <kbd className="text-ink-300">F</kbd> fullscreen
        </div>
      </Card>

      {/* Bottom section */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="How it works">
          <p className="text-sm leading-relaxed text-ink-300">{algo.description}</p>
          {algo.notes && <p className="mt-3 text-xs leading-relaxed text-ink-400">{algo.notes}</p>}
        </Card>
        <Card title="Complexity">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-white/[0.06]">
              {[
                ['Best case', algo.best],
                ['Average case', algo.average],
                ['Worst case', algo.worst],
                ['Extra space', algo.space],
                ['Stable', algo.stable ? 'Yes' : 'No'],
                ['In-place', algo.inPlace ? 'Yes' : 'No'],
                ['Element limit here', fmtInt(algo.maxN)],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-2 text-ink-400">{k}</td>
                  <td className="py-2 text-right font-mono text-ink-100">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Comparison statistics">
          {final ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/[0.06]">
                <tr>
                  <td className="py-2 text-ink-400">Comparisons performed</td>
                  <td className="py-2 text-right font-mono text-ink-100">{fmtInt(final.comparisons)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-ink-400">Lower bound ⌈log₂ n!⌉</td>
                  <td className="py-2 text-right font-mono text-ink-100">{fmtInt(Math.ceil(log2Factorial(n)))}</td>
                </tr>
                <tr>
                  <td className="py-2 text-ink-400">n · log₂ n</td>
                  <td className="py-2 text-right font-mono text-ink-100">{fmtInt(nlogn)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-ink-400">n(n−1)/2</td>
                  <td className="py-2 text-right font-mono text-ink-100">{fmtInt((n * (n - 1)) / 2)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-ink-400">Comparisons ÷ n log₂ n</td>
                  <td className="py-2 text-right font-mono text-ink-100">{nlogn ? (final.comparisons / nlogn).toFixed(3) : '—'}</td>
                </tr>
                <tr>
                  <td className="py-2 text-ink-400">Swaps · writes · aux writes</td>
                  <td className="py-2 text-right font-mono text-ink-100">
                    {fmtInt(final.swaps)} · {fmtInt(final.writes)} · {fmtInt(final.auxWrites)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-ink-400">Compute (mean, no trace) / recorded run</td>
                  <td className="py-2 text-right font-mono text-ink-100">
                    {fmtMs(st.result?.timedMs)} / {fmtMs(st.result?.computeMs)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-400">Run the algorithm to see its measured comparison count next to the theoretical bounds for n = {fmtInt(n)}.</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-400">
            Compute time is measured in the Web Worker with operation counting enabled; playback time only reflects the chosen animation speed and says nothing about
            algorithm performance.
          </p>
        </Card>
        <RecordingPanel controller={controller} status={st} />
      </div>
    </div>
  );
}
