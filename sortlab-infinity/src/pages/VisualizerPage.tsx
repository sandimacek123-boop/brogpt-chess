import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ALGORITHMS, CATEGORIES, getAlgorithm } from '../algorithms';
import { PATTERNS, PatternId } from '../core/patterns';
import { VISUAL_MODES } from '../render/modes';
import type { VisualizerController, VisualizerStatus } from '../engine/visualizer';
import { useSettings } from '../state/SettingsContext';
import { effectiveSpeed, MAX_N, N_STEPS, prefersReducedMotion } from '../state/settings';
import { fmtInt, fmtMs, fmtSpeed, logScale, Segmented, Slider } from '../ui/controls';
import {
  IconBars,
  IconClose,
  IconEyeOff,
  IconFullscreen,
  IconInfo,
  IconLayers,
  IconPause,
  IconPlay,
  IconRecord,
  IconRestart,
  IconSearch,
  IconShuffle,
  IconSkip,
  IconStep,
  IconStepBack,
  IconWarn,
  IconWave,
  IconSpeed,
} from '../ui/icons';
import RecordingPanel from '../ui/RecordingPanel';
import Timeline from '../ui/stage/Timeline';
import CommandPalette from '../ui/stage/CommandPalette';
import ModeGallery from '../ui/stage/ModeGallery';

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

type Overlay = null | 'palette' | 'modes' | 'pattern' | 'size' | 'speed' | 'info' | 'record';

/* ------------------------------------------------------------------ bits */

function IconButton({
  onClick,
  label,
  kbd,
  children,
  disabled,
  active,
}: {
  onClick: () => void;
  label: string;
  kbd?: string;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={kbd ? `${label} (${kbd})` : label}
      className={`group relative inline-flex h-10 w-10 items-center justify-center rounded-full transition duration-300 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
        active ? 'bg-white/[0.12] text-white' : 'text-ink-300 hover:bg-white/[0.07] hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function Chip({
  icon,
  label,
  value,
  onClick,
  active,
  kbd,
  wide,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  active?: boolean;
  kbd?: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      aria-label={`${label}: ${value}`}
      className={`flex h-12 w-full min-w-0 items-center gap-2.5 rounded-2xl border px-3.5 text-left transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
        wide ? 'max-w-[340px]' : 'max-w-[230px]'
      } ${active ? 'border-white/30 bg-white/[0.1]' : 'border-white/[0.07] bg-white/[0.025] hover:border-white/[0.16] hover:bg-white/[0.05]'}`}
    >
      <span className="shrink-0 text-ink-300">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">{label}</span>
        <span className="block truncate text-[13px] font-medium leading-tight text-white">{value}</span>
      </span>
      {kbd && <kbd className="shrink-0">{kbd}</kbd>}
    </button>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="min-w-[120px] text-right">
      <div className="flex items-center justify-end gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-ink-400">
        {color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />}
        {label}
      </div>
      <div className="mt-1 font-mono text-[26px] font-medium leading-none tracking-[-0.02em] text-white tnum">{value}</div>
      {sub && <div className="mt-1 font-mono text-[10.5px] text-ink-500 tnum">{sub}</div>}
    </div>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60]" role="presentation" onMouseDown={onClose}>
      <aside
        className="glass-strong absolute bottom-6 right-6 top-24 flex w-[460px] flex-col overflow-hidden rounded-3xl !bg-ink-900/[0.97]"
        style={{ animation: 'pop-in .45s cubic-bezier(.22,1,.36,1) both' }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-7 py-5">
          <h2 className="font-display text-[17px] font-semibold tracking-tight text-white">{title}</h2>
          <IconButton label="Close" kbd="Esc" onClick={onClose}>
            <IconClose width={16} height={16} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-7 py-6">{children}</div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function VisualizerPage({ controller }: { controller: VisualizerController }) {
  const { settings, update } = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<HTMLDivElement>(null);
  const st = useStatus(controller);
  const algo = getAlgorithm(settings.algorithmId);
  const tooBig = settings.n > algo.maxN;
  const speed = effectiveSpeed(settings);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [idleHidden, setIdleHidden] = useState(false);
  const [manualHidden, setManualHidden] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [nInput, setNInput] = useState(String(settings.n));
  const mode = VISUAL_MODES.find((m) => m.id === settings.mode) ?? VISUAL_MODES[0];
  const playing = st.phase === 'playing';
  const uiHidden = (idleHidden || manualHidden) && overlay === null;

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

  // ---- layout: keep the visualization clear of the floating UI, and reframe smoothly when it hides
  const measure = useCallback(() => {
    if (uiHidden) {
      controller.insetTarget = { top: 64, right: 40, bottom: 64, left: 40 };
      return;
    }
    const tb = titleRef.current?.getBoundingClientRect();
    const tr = transportRef.current?.getBoundingClientRect();
    const top = tb ? Math.round(tb.bottom + 28) : 220;
    const bottom = tr ? Math.round(window.innerHeight - tr.top + 22) : 200;
    controller.insetTarget = { top, right: 64, bottom, left: 64 };
  }, [controller, uiHidden]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (titleRef.current) ro.observe(titleRef.current);
    if (transportRef.current) ro.observe(transportRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  // ---- cinematic auto-hide while playing
  useEffect(() => {
    let timer = 0;
    const wake = () => {
      setIdleHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (controller.phase === 'playing' && settings.autoHideUI) setIdleHidden(true);
      }, 2400);
    };
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('mousedown', wake);
    window.addEventListener('wheel', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('mousedown', wake);
      window.removeEventListener('wheel', wake);
    };
  }, [controller, settings.autoHideUI, st.phase]);

  useEffect(() => {
    document.body.classList.toggle('ui-hidden', uiHidden);
    return () => document.body.classList.remove('ui-hidden');
  }, [uiHidden]);

  // ---- completion toast
  const prevSorted = useRef<boolean | null>(null);
  useEffect(() => {
    if (st.sorted !== null && prevSorted.current === null && st.result) {
      setToast(
        st.sorted
          ? `Sorted · ${fmtInt(st.result.stats.comparisons)} comparisons · ${fmtInt(st.result.operations)} operations`
          : 'Run ended before the array was sorted',
      );
      const t = window.setTimeout(() => setToast(null), 4200);
      prevSorted.current = st.sorted;
      return () => window.clearTimeout(t);
    }
    prevSorted.current = st.sorted;
  }, [st.sorted, st.result]);

  // ---- outside click closes popovers
  useEffect(() => {
    if (overlay !== 'pattern' && overlay !== 'size' && overlay !== 'modes' && overlay !== 'speed') return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-popover]')) setOverlay(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [overlay]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOverlay((o) => (o === 'palette' ? null : 'palette'));
        return;
      }
      if (e.key === 'Escape') {
        setOverlay(null);
        setManualHidden(false);
        return;
      }
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (overlay === 'palette') return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') {
        e.preventDefault();
        controller.togglePlay();
      } else if (k === 'r') controller.restart();
      else if (k === 'n') controller.regenerate();
      else if (e.key === 'ArrowRight') void controller.step();
      else if (e.key === 'ArrowLeft') controller.stepBack();
      else if (k === 'f') toggleFullscreen();
      else if (k === 'k' || e.key === '/') {
        e.preventDefault();
        setOverlay('palette');
      } else if (k === 'v') setOverlay((o) => (o === 'modes' ? null : 'modes'));
      else if (k === 'i') setOverlay((o) => (o === 'info' ? null : 'info'));
      else if (k === 'h') setManualHidden((h) => !h);
      else if (k === 'e') controller.skipToEnd();
      else if (e.key === ']') update({ speed: Math.min(SPEED_MAX, Math.round(settings.speed * 1.5 * 10) / 10) });
      else if (e.key === '[') update({ speed: Math.max(SPEED_MIN, Math.round((settings.speed / 1.5) * 10) / 10) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const nIndex = useMemo(() => {
    let best = 0;
    N_STEPS.forEach((v, i) => {
      if (Math.abs(Math.log(v) - Math.log(settings.n)) < Math.abs(Math.log(N_STEPS[best]) - Math.log(settings.n))) best = i;
    });
    return best;
  }, [settings.n]);

  const final = st.result?.stats;
  const n = st.n;
  const nlogn = n > 1 ? n * Math.log2(n) : 0;
  const pattern = PATTERNS.find((p) => p.id === settings.pattern) ?? PATTERNS[0];
  const message = tooBig
    ? `${algo.name} is limited to ${fmtInt(algo.maxN)} elements (worst case ${algo.worst}).`
    : st.message ?? (algo.slow ? `${algo.name} is extremely slow (${algo.average}); capped at ${algo.maxN} elements.` : null);
  const reduced = prefersReducedMotion(settings);
  const elapsed = st.playbackMs / 1000;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-ink-950">
      {/* ---------------- stage */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        role="img"
        aria-label={`${algo.name} visualization of ${n} elements, ${Math.round(st.progress * 100)}% complete`}
        onClick={() => {
          if (overlay) setOverlay(null);
          else controller.togglePlay();
        }}
      />
      <div className="vignette pointer-events-none absolute inset-0" />
      {settings.grain && !reduced && <div className="grain pointer-events-none absolute -inset-[10%]" />}

      {/* ---------------- title card */}
      <div ref={titleRef} className="ui-layer slide-down pointer-events-none absolute left-16 top-[104px]" style={{ maxWidth: 'max(420px, calc(100vw - 820px))' }}>
        <div className="kicker flex items-center gap-2.5">
          <span>{algo.category}</span>
          <span className="h-px w-5 bg-white/20" />
          <span>{algo.stable ? 'Stable' : 'Unstable'}</span>
          <span className="h-px w-5 bg-white/20" />
          <span>{algo.inPlace ? 'In-place' : 'Out-of-place'}</span>
        </div>
        <h1
          key={algo.id}
          className="title-swap mt-3 font-display font-semibold leading-[0.95] tracking-[-0.045em] text-white"
          style={{ fontSize: `calc(clamp(42px, min(5.2vw, 7.4vh), 92px) * ${algo.name.length > 26 ? 0.62 : algo.name.length > 18 ? 0.78 : 1})` }}
        >
          {algo.name}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[12px] text-ink-400">
          <span>
            avg <span className="text-ink-100">{algo.average}</span>
          </span>
          <span>
            worst <span className="text-ink-100">{algo.worst}</span>
          </span>
          <span>
            space <span className="text-ink-100">{algo.space}</span>
          </span>
        </div>
      </div>

      {/* ---------------- HUD */}
      <div className="ui-layer slide-down pointer-events-none absolute right-16 top-[108px] flex flex-col items-end gap-5">
        <div className="flex gap-9">
          <Metric label="Comparisons" color={settings.compareColor} value={fmtInt(st.played.comparisons)} sub={final ? `/ ${fmtInt(final.comparisons)}` : '—'} />
          <Metric label="Swaps" color={settings.swapColor} value={fmtInt(st.played.swaps)} sub={final ? `/ ${fmtInt(final.swaps)}` : '—'} />
          <Metric label="Writes" color={settings.writeColor} value={fmtInt(st.played.writes)} sub={final ? `/ ${fmtInt(final.writes)}` : '—'} />
          <Metric
            label="Progress"
            value={`${(st.progress * 100).toFixed(1)}%`}
            sub={st.sorted === null ? (st.phase === 'computing' ? 'computing…' : st.phase) : st.sorted ? 'verified ✓' : 'not sorted ✗'}
          />
        </div>
        <div className="flex gap-6 font-mono text-[11px] text-ink-500 tnum">
          <span>
            aux <span className="text-ink-300">{final ? fmtInt(final.auxWrites) : '—'}</span>
          </span>
          <span>
            compute <span className="text-ink-300">{fmtMs(st.result?.timedMs)}</span>
          </span>
          <span>
            n <span className="text-ink-300">{fmtInt(n)}</span>
          </span>
          <span>
            <span className="text-ink-300">{Math.round(st.fps)}</span> fps
          </span>
        </div>
      </div>

      {/* ---------------- centre states */}
      {st.phase === 'computing' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="glass pop-in pointer-events-auto flex items-center gap-4 rounded-2xl px-6 py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white" />
            <span className="text-[13px] text-ink-200">Computing {algo.name} in a Web Worker…</span>
            <button type="button" className="text-[12px] text-ink-400 underline-offset-4 hover:text-white hover:underline" onClick={() => controller.cancelCompute()}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {!message && !toast && st.phase === 'idle' && overlay === null && (
        <div className="ui-layer slide-up pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: (controller.insetTarget.bottom || 200) + 8 }}>
          <div className="fade-up flex items-center gap-2.5 rounded-full bg-black/30 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-ink-300 backdrop-blur" style={{ animationDelay: '1.6s' }}>
            Press <kbd className="tracking-normal">Space</kbd> to sort · <kbd className="tracking-normal">⌘K</kbd> for algorithms
          </div>
        </div>
      )}
      {(message || toast) && (
        <div className="ui-layer slide-up pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: (controller.insetTarget.bottom || 200) + 8 }}>
          <div
            key={message ?? toast ?? ''}
            className={`glass pop-in pointer-events-auto flex items-center gap-3 rounded-full py-2 pl-4 pr-2 text-[12.5px] ${message ? 'text-amber-100' : 'text-ink-100'}`}
            role="status"
          >
            {message ? <IconWarn width={15} height={15} className="text-amber-300" /> : <span className="h-1.5 w-1.5 rounded-full bg-[#3dffa2] shadow-[0_0_10px_#3dffa2]" />}
            <span className="pr-2">{message ?? toast}</span>
            {tooBig && (
              <button type="button" onClick={() => update({ n: algo.maxN })} className="rounded-full bg-white px-3 py-1 text-[11.5px] font-semibold text-ink-950">
                Use {fmtInt(algo.maxN)}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------------- transport */}
      <div ref={transportRef} className="ui-layer slide-up absolute bottom-7 left-1/2 w-[min(1480px,calc(100vw-96px))] -translate-x-1/2" data-popover>
        <div className="glass rounded-[28px] px-6 pb-5 pt-4">
          <div className="mb-2 flex items-center justify-between font-mono text-[10.5px] text-ink-500 tnum">
            <span>
              op <span className="text-ink-200">{fmtInt(st.playedOps)}</span> / {fmtInt(st.totalOps)}
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm rainbow-line" /> moves
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-white/40" /> comparisons
              </span>
            </span>
            <span>
              <span className="text-ink-200">{elapsed.toFixed(1)}s</span> · {fmtSpeed(speed)}
            </span>
          </div>
          <Timeline controller={controller} traceVersion={st.traceVersion} />
          <div className="mt-4 flex items-center gap-3">
            {/* transport buttons */}
            <div className="flex items-center gap-1">
              <IconButton label="Step back" kbd="←" onClick={() => controller.stepBack()} disabled={!st.result || st.playedOps === 0}>
                <IconStepBack width={16} height={16} />
              </IconButton>
              <button
                type="button"
                onClick={() => controller.togglePlay()}
                disabled={tooBig || st.phase === 'computing'}
                aria-label={playing ? 'Pause' : 'Play'}
                title={playing ? 'Pause (Space)' : 'Play (Space)'}
                className="mx-1 inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink-950 shadow-[0_0_40px_-6px_rgba(255,255,255,0.65)] transition duration-300 hover:scale-[1.06] active:scale-95 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/50"
              >
                {playing ? <IconPause width={20} height={20} /> : <IconPlay width={20} height={20} className="translate-x-[1px]" />}
              </button>
              <IconButton label="Step forward" kbd="→" onClick={() => void controller.step()} disabled={tooBig || st.phase === 'done'}>
                <IconStep width={16} height={16} />
              </IconButton>
              <IconButton label="Restart" kbd="R" onClick={() => controller.restart()}>
                <IconRestart width={16} height={16} />
              </IconButton>
              <IconButton label="New array" kbd="N" onClick={() => controller.regenerate()}>
                <IconShuffle width={16} height={16} />
              </IconButton>
              <IconButton label="Skip to end" kbd="E" onClick={() => controller.skipToEnd()} disabled={!st.result || st.phase === 'done'}>
                <IconSkip width={16} height={16} />
              </IconButton>
            </div>

            <div className="mx-1 h-9 w-px bg-white/[0.08]" />

            {/* pickers */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0 flex-[1.5]"><Chip wide icon={<IconSearch width={16} height={16} />} label="Algorithm" value={algo.name} kbd="⌘K" onClick={() => setOverlay('palette')} active={overlay === 'palette'} /></div>
              <div className="relative min-w-0 flex-1">
                <Chip icon={<IconLayers width={16} height={16} />} label="Visual" value={mode.name} onClick={() => setOverlay(overlay === 'modes' ? null : 'modes')} active={overlay === 'modes'} />
                {overlay === 'modes' && (
                  <div className="glass-strong pop-in absolute bottom-full left-0 mb-4 rounded-3xl">
                    <ModeGallery
                      current={settings.mode}
                      onPick={(m) => {
                        update({ mode: m });
                        setOverlay(null);
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="relative min-w-0 flex-1">
                <Chip icon={<IconWave width={16} height={16} />} label="Input" value={pattern.name} onClick={() => setOverlay(overlay === 'pattern' ? null : 'pattern')} active={overlay === 'pattern'} />
                {overlay === 'pattern' && (
                  <div className="glass-strong pop-in absolute bottom-full left-0 mb-4 w-[320px] rounded-3xl p-2" role="listbox" aria-label="Starting pattern">
                    {PATTERNS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={p.id === settings.pattern}
                        onClick={() => {
                          update({ pattern: p.id as PatternId });
                          setOverlay(null);
                        }}
                        className={`flex w-full flex-col rounded-xl px-3.5 py-2.5 text-left transition-colors ${p.id === settings.pattern ? 'bg-white/[0.1]' : 'hover:bg-white/[0.05]'}`}
                      >
                        <span className="text-[13px] font-medium text-white">{p.name}</span>
                        <span className="text-[11.5px] text-ink-400">{p.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative min-w-0 flex-1">
                <Chip icon={<IconBars width={16} height={16} />} label="Elements" value={fmtInt(settings.n)} onClick={() => setOverlay(overlay === 'size' ? null : 'size')} active={overlay === 'size'} />
                {overlay === 'size' && (
                  <div className="glass-strong pop-in absolute bottom-full left-0 mb-4 w-[380px] rounded-3xl p-6">
                    <div className="flex items-baseline justify-between">
                      <span className="kicker">Elements</span>
                      <input
                        aria-label="Element count"
                        inputMode="numeric"
                        className="w-24 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-right font-mono text-[13px] text-white outline-none focus:border-accent"
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
                    </div>
                    <div className="mt-4">
                      <Slider ariaLabel="Element count slider" min={0} max={N_STEPS.length - 1} value={nIndex} onChange={(i) => update({ n: N_STEPS[i] })} />
                    </div>
                    <div className="mt-3 grid grid-cols-6 gap-1.5">
                      {[64, 256, 512, 1024, 4096, 16384].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => update({ n: v })}
                          disabled={v > algo.maxN}
                          className={`rounded-lg py-1.5 font-mono text-[11px] transition disabled:opacity-25 ${settings.n === v ? 'bg-white text-ink-950' : 'bg-white/[0.04] text-ink-300 hover:bg-white/[0.08] hover:text-white'}`}
                        >
                          {v >= 1024 ? `${v / 1024}k` : v}
                        </button>
                      ))}
                    </div>
                    <p className="mt-4 text-[11.5px] text-ink-500">
                      {algo.name} supports up to {fmtInt(algo.maxN)} elements.
                    </p>
                  </div>
                )}
              </div>
              <div className="relative min-w-0 flex-1">
                <Chip icon={<IconSpeed width={16} height={16} />} label="Speed" value={fmtSpeed(speed).replace(' ops/s', '/s')} onClick={() => setOverlay(overlay === 'speed' ? null : 'speed')} active={overlay === 'speed'} />
                {overlay === 'speed' && (
                  <div className="glass-strong pop-in absolute bottom-full right-0 mb-4 w-[360px] rounded-3xl p-6">
                    <div className="flex items-baseline justify-between">
                      <span className="kicker">Speed</span>
                      <span className="font-mono text-[13px] text-white tnum">{fmtSpeed(speed)}</span>
                    </div>
                    <div className="mt-4">
                      <Slider
                        ariaLabel="Sorting speed"
                        min={0}
                        max={1000}
                        value={Math.round(logScale.toSlider(settings.speed, SPEED_MIN, SPEED_MAX) * 1000)}
                        onChange={(t) => update({ speed: Math.round(logScale.fromSlider(t / 1000, SPEED_MIN, SPEED_MAX) * 10) / 10 })}
                      />
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <Segmented
                        ariaLabel="Speed mode"
                        value={settings.speedMode}
                        onChange={(v) => update({ speedMode: v })}
                        options={[
                          { value: 'slow', label: 'Slow-mo 0.1×' },
                          { value: 'normal', label: '1×' },
                          { value: 'turbo', label: 'Turbo 20×' },
                        ]}
                      />
                    </div>
                    <p className="mt-4 text-[11.5px] text-ink-500">
                      <kbd>[</kbd> <kbd>]</kbd> slower / faster. Speed only changes the animation, never the algorithm.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mx-1 h-9 w-px bg-white/[0.08]" />

            <div className="flex items-center gap-1">
              <IconButton label="Algorithm details" kbd="I" onClick={() => setOverlay(overlay === 'info' ? null : 'info')} active={overlay === 'info'}>
                <IconInfo width={17} height={17} />
              </IconButton>
              <IconButton label="Record video" onClick={() => setOverlay(overlay === 'record' ? null : 'record')} active={overlay === 'record'}>
                <IconRecord width={14} height={14} className="text-[#ff2e63]" />
              </IconButton>
              <IconButton label="Hide interface" kbd="H" onClick={() => setManualHidden(true)}>
                <IconEyeOff width={17} height={17} />
              </IconButton>
              <IconButton label="Fullscreen" kbd="F" onClick={toggleFullscreen}>
                <IconFullscreen width={16} height={16} />
              </IconButton>
            </div>
          </div>
        </div>
      </div>

      {manualHidden && (
        <button
          type="button"
          onClick={() => setManualHidden(false)}
          className="fade-up absolute bottom-6 right-6 rounded-full bg-white/[0.06] px-4 py-2 text-[11px] text-ink-400 backdrop-blur transition hover:text-white"
        >
          Show interface <kbd className="ml-1">H</kbd>
        </button>
      )}

      {/* ---------------- overlays */}
      {overlay === 'palette' && (
        <CommandPalette
          current={settings.algorithmId}
          onClose={() => setOverlay(null)}
          onPick={(id) => {
            update({ algorithmId: id });
            setOverlay(null);
          }}
        />
      )}

      {overlay === 'info' && (
        <Drawer title="About this algorithm" onClose={() => setOverlay(null)}>
          <div className="kicker">{algo.category}</div>
          <h3 className="mt-2 font-display text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-white">{algo.name}</h3>
          <p className="mt-4 text-[14px] leading-[1.7] text-ink-300">{algo.description}</p>
          {algo.notes && <p className="mt-3 text-[12.5px] leading-relaxed text-ink-500">{algo.notes}</p>}
          <div className="hairline my-7" />
          <div className="kicker mb-3">Complexity</div>
          <dl className="grid grid-cols-2 gap-3">
            {[
              ['Best', algo.best],
              ['Average', algo.average],
              ['Worst', algo.worst],
              ['Space', algo.space],
              ['Stable', algo.stable ? 'Yes' : 'No'],
              ['In-place', algo.inPlace ? 'Yes' : 'No'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                <dt className="text-[10.5px] uppercase tracking-[0.15em] text-ink-500">{k}</dt>
                <dd className="mt-0.5 truncate font-mono text-[13px] text-white" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <div className="hairline my-7" />
          <div className="kicker mb-3">This run · n = {fmtInt(n)}</div>
          {final ? (
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-white/[0.05]">
                {[
                  ['Comparisons', fmtInt(final.comparisons)],
                  ['Lower bound ⌈log₂ n!⌉', fmtInt(Math.ceil(log2Factorial(n)))],
                  ['n · log₂ n', fmtInt(nlogn)],
                  ['n(n−1)/2', fmtInt((n * (n - 1)) / 2)],
                  ['Comparisons ÷ n log₂ n', nlogn ? (final.comparisons / nlogn).toFixed(3) : '—'],
                  ['Swaps · writes · aux writes', `${fmtInt(final.swaps)} · ${fmtInt(final.writes)} · ${fmtInt(final.auxWrites)}`],
                  ['Compute (mean, no trace)', fmtMs(st.result?.timedMs)],
                  ['Recorded run', fmtMs(st.result?.computeMs)],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-2.5 text-ink-400">{k}</td>
                    <td className="py-2.5 text-right font-mono text-white">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[13px] text-ink-400">Play the sort to measure it against the theoretical bounds.</p>
          )}
          <p className="mt-5 text-[11.5px] leading-relaxed text-ink-500">
            Compute time is measured in a Web Worker; playback speed is only the animation and says nothing about algorithm performance.
          </p>
          <div className="hairline my-7" />
          <div className="kicker mb-3">Shortcuts</div>
          <div className="grid grid-cols-2 gap-y-2 text-[12.5px] text-ink-300">
            {[
              ['Space', 'Play / pause'],
              ['← →', 'Step'],
              ['⌘K', 'Algorithms'],
              ['V', 'Visuals'],
              ['R', 'Restart'],
              ['N', 'New array'],
              ['E', 'Skip to end'],
              ['H', 'Hide interface'],
              ['F', 'Fullscreen'],
              ['[ ]', 'Speed'],
              ['I', 'This panel'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-3">
                <kbd className="min-w-[44px] text-center">{k}</kbd>
                {v}
              </div>
            ))}
          </div>
        </Drawer>
      )}

      {overlay === 'record' && (
        <Drawer title="Record video" onClose={() => setOverlay(null)}>
          <RecordingPanel controller={controller} status={st} bare />
        </Drawer>
      )}
    </div>
  );
}
