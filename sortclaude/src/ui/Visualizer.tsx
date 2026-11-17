import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { player, SPEED_PRESETS, type PlayerSnapshot } from '../state/player';
import { rebuild, useSim } from '../state/simulation';
import { getAlgorithm } from '../engine/registry';
import { Stage } from './Stage';
import { Icon, fmt, fmtMs, fmtTime } from './components';
import { Sidebar } from './Panels';
import { audio } from '../audio/engine';
import { randomSeed } from '../engine/rng';
import { METRIC_DEFINITIONS } from '../engine/ops';

export function usePlayer(): PlayerSnapshot {
  const [snap, setSnap] = useState<PlayerSnapshot>(player.snapshot());
  useEffect(() => player.subscribe(setSnap), []);
  return snap;
}

/** Re-record whenever the dataset or algorithm changes (not when the visualization changes). */
export function useSimulationSync() {
  const algorithm = useApp((s) => s.settings.sorting.algorithm);
  const n = useApp((s) => s.settings.sorting.n);
  const pattern = useApp((s) => s.settings.sorting.pattern);
  const seed = useApp((s) => s.settings.sorting.seed);
  const custom = useApp((s) => (s.settings.sorting.pattern === 'custom' ? s.settings.sorting.customData : ''));
  const first = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => {
      rebuild({ autoplay: !first.current && false });
      first.current = false;
    }, first.current ? 0 : 120);
    return () => clearTimeout(t);
  }, [algorithm, n, pattern, seed, custom]);
}

export async function toggleSound() {
  const st = useApp.getState();
  const enabled = !st.settings.audio.enabled;
  if (enabled) {
    const ok = await audio.unlock();
    if (!ok) {
      st.toast(audio.error ?? 'Audio failed to initialise.', 'error');
      return;
    }
  } else audio.silence();
  st.update('audio', { enabled });
}

export function shuffleNewSeed() {
  useApp.getState().update('sorting', { seed: randomSeed() });
}

export function Visualizer() {
  useSimulationSync();
  const [sidebar, setSidebar] = useState(true);
  return (
    <div className="viz-layout" style={sidebar ? undefined : { gridTemplateColumns: 'minmax(0,1fr) 0px' }}>
      <div className="viz-main">
        <VizHeader />
        <StageArea />
        <Transport sidebar={sidebar} setSidebar={setSidebar} />
      </div>
      <div className="sidebar" style={sidebar ? undefined : { display: 'none' }}>
        <Sidebar />
      </div>
    </div>
  );
}

function VizHeader() {
  const algoId = useApp((s) => s.settings.sorting.algorithm);
  const showCx = useApp((s) => s.settings.sorting.showComplexity);
  const sim = useSim();
  const snap = usePlayer();
  const algo = getAlgorithm(algoId);
  const n = sim.initialKeys?.length ?? 0;
  const state = sim.status === 'error' ? 'Error' : sim.status !== 'ready' ? 'Preparing' : snap.done ? 'Sorted' : snap.playing ? 'Sorting' : snap.pos === 0 ? 'Ready' : 'Paused';
  const cls = state === 'Error' ? 'err' : state === 'Sorted' ? 'ok' : state === 'Sorting' ? 'live' : '';
  return (
    <div className="viz-header">
      <div className="viz-title">{algo.name}</div>
      <div className="viz-meta">
        <span><b>{fmt(n)}</b> elements</span>
        <span><b>{fmt(sim.info?.opCount ?? 0)}</b> recorded ops</span>
        <span className={`chip ${cls}`}><span className="dot" />{state}</span>
        {showCx && (
          <span className="opt chip mono" title="Average / worst time complexity, space">
            avg {algo.average} · worst {algo.worst} · space {algo.space}
          </span>
        )}
        {algo.stable && <span className="opt tag stable">stable</span>}
      </div>
    </div>
  );
}

function StageArea() {
  const sim = useSim();
  const showStats = useApp((s) => s.settings.appearance.showStats);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onFs = () => {
      if (!wrapRef.current) return;
      if (document.fullscreenElement) return;
    };
    const req = () => {
      const el = wrapRef.current;
      if (!el) return;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else el.requestFullscreen?.().catch(() => useApp.getState().toast('Fullscreen was blocked by the browser.', 'error'));
    };
    window.addEventListener('sortclaude:fullscreen', req);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('sortclaude:fullscreen', req);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);
  return (
    <div className="stage-wrap" ref={wrapRef} data-testid="stage">
      <Stage />
      {showStats && sim.status === 'ready' && <StatsOverlay />}
      {(sim.status === 'preparing' || sim.status === 'building') && (
        <div className="stage-overlay">
          <div className="stage-msg"><span className="spinner" /> &nbsp;{sim.message}</div>
        </div>
      )}
      {sim.status === 'error' && (
        <div className="stage-overlay">
          <div className="stage-msg err" role="alert">
            <b>Can’t run this configuration</b>
            <div className="muted" style={{ marginTop: 6 }}>{sim.error}</div>
          </div>
        </div>
      )}
      {sim.warning && (
        <div className="stage-corner" style={{ pointerEvents: 'auto' }}>
          <span className="chip warn" title={sim.warning}>⚠ {sim.warning.slice(0, 110)}</span>
        </div>
      )}
      <div className="stage-corner" style={{ left: 'auto', right: 14 }}>
        <div className="legend">
          <span><i style={{ background: '#fff' }} />compare</span>
          <span><i style={{ background: '#f43fbd' }} />swap / write</span>
          <span><i style={{ background: '#facc15' }} />pivot</span>
        </div>
      </div>
    </div>
  );
}

function StatsOverlay() {
  const snap = usePlayer();
  const sim = useSim();
  const tl = player.tl;
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);
  if (!tl) return null;
  const c = tl.getCounters();
  const def = (k: string) => METRIC_DEFINITIONS.find((m) => m.key === k)?.definition;
  const inPlace = tl.n <= 200000 ? tl.inPlaceFraction() : NaN;
  return (
    <div className="stage-stats" data-testid="stats">
      <div className="row" title={def('operations')}><span>Operations</span><b data-testid="stat-ops">{fmt(c.operations)}</b></div>
      <div className="row" title={def('comparisons')}><span>Comparisons</span><b data-testid="stat-cmp">{fmt(c.comparisons)}</b></div>
      <div className="row" title={def('swaps')}><span>Swaps</span><b>{fmt(c.swaps)}</b></div>
      <div className="row" title={def('writes')}><span>Writes</span><b>{fmt(c.writes)}</b></div>
      <div className="row" title={def('reads')}><span>Reads</span><b>{fmt(c.reads)}</b></div>
      <div className="row" title={def('auxWrites')}><span>Aux writes</span><b>{fmt(c.auxWrites)}</b></div>
      <div className="row" title={def('auxMemory')}><span>Aux memory</span><b>{fmt(c.auxMemory)}</b></div>
      <div className="row" title="Fraction of positions already holding their final key"><span>In final position</span><b>{Number.isFinite(inPlace) ? `${(inPlace * 100).toFixed(1)}%` : '—'}</b></div>
      <div className="row" title="Measured wall-clock time of the instrumented algorithm run in the worker (includes recording overhead). See Benchmark for clean timings."><span>Execution time</span><b>{fmtMs(sim.info?.executionMs ?? NaN)}</b></div>
      <div className="row" title="Real time spent animating this playback"><span>Playback time</span><b>{fmtTime(snap.playbackSeconds)}</b></div>
    </div>
  );
}

function Transport({ sidebar, setSidebar }: { sidebar: boolean; setSidebar: (v: boolean) => void }) {
  const snap = usePlayer();
  const sim = useSim();
  const speed = useApp((s) => s.settings.sorting.speed);
  const useCustom = useApp((s) => s.settings.sorting.useCustomRate);
  const sound = useApp((s) => s.settings.audio.enabled);
  const hints = useApp((s) => s.settings.general.keyboardHints);
  const update = useApp((s) => s.update);
  const setPage = useApp((s) => s.setPage);
  const setCinematic = useApp((s) => s.setCinematic);
  const ready = sim.status === 'ready' && !!player.tl;
  const [jump, setJump] = useState('');
  const [, setLoopTick] = useState(0);
  const kb = (k: string) => (hints ? <span className="kbd">{k}</span> : null);
  const total = snap.total;
  const progress = total ? snap.pos / total : 0;

  return (
    <div className="transport">
      <div className="timeline">
        <div className="time">
          op <b className="mono" data-testid="pos">{fmt(snap.pos)}</b> / {fmt(total)}
        </div>
        <Scrubber value={progress} onChange={(p) => player.seek(Math.round(p * total))} disabled={!ready} loopA={player.loopA / Math.max(1, total)} loopB={player.loopB / Math.max(1, total)} showLoop={player.loop} />
        <div className="time">
          {Number.isFinite(snap.opsPerSec) ? `${fmt(snap.opsPerSec)} ops/s` : 'max speed'} · {(progress * 100).toFixed(1)}%
        </div>
      </div>
      <div className="controls">
        <button className="btn icon" title="Go to beginning" aria-label="Go to beginning" disabled={!ready} onClick={() => player.seek(0)}>{Icon.toStart}</button>
        <button className="btn icon" title="Step backward (←)" aria-label="Step backward" disabled={!ready || snap.pos === 0} onClick={() => player.stepBackward()}>{Icon.stepB}</button>
        <button className="btn primary play" data-testid="play" title={snap.playing ? 'Pause (Space)' : snap.pos > 0 && !snap.done ? 'Resume (Space)' : 'Start (Space)'} aria-label={snap.playing ? 'Pause' : 'Play'} disabled={!ready} onClick={() => player.toggle()}>
          {snap.playing ? Icon.pause : Icon.play}
        </button>
        <button className="btn icon" title="Step forward (→)" aria-label="Step forward" disabled={!ready || snap.done} onClick={() => player.stepForward()}>{Icon.stepF}</button>
        <button className="btn icon" title="Go to completion" aria-label="Go to completion" disabled={!ready} onClick={() => player.seek(total)}>{Icon.toEnd}</button>
        <div className="sep" />
        <button className="btn" title="Restart with the same data (R)" disabled={!ready} onClick={() => player.restart()}>{Icon.restart}Restart{kb('R')}</button>
        <button className="btn" title="New random seed (S)" onClick={shuffleNewSeed}>{Icon.shuffle}Shuffle{kb('S')}</button>
        <div className="sep" />
        <select
          className="select"
          style={{ width: 96 }}
          aria-label="Playback speed"
          data-testid="speed"
          value={useCustom ? 'custom' : String(speed)}
          onChange={(e) => {
            if (e.target.value === 'custom') update('sorting', { useCustomRate: true });
            else update('sorting', { speed: Number(e.target.value), useCustomRate: false });
          }}
        >
          {SPEED_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
          <option value="custom">Custom</option>
        </select>
        <div className="grow" />
        <div className="input-group" style={{ width: 150 }} title="Jump to an operation number">
          <input className="input mono" placeholder="Jump to op #" value={jump} onChange={(e) => setJump(e.target.value.replace(/[^\d]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && jump && player.seek(Number(jump))} aria-label="Jump to operation" />
        </div>
        <button className={`btn icon ${player.loop ? 'on' : ''}`} title="Loop range: first click sets A, second sets B, third clears" aria-label="Loop range" disabled={!ready} onClick={() => {
          if (player.loopA < 0) player.loopA = player.tl!.pos;
          else if (player.loopB < 0) {
            player.loopB = Math.max(player.loopA + 1, player.tl!.pos);
            if (player.loopB < player.loopA) [player.loopA, player.loopB] = [player.loopB, player.loopA];
            player.loop = true;
          } else {
            player.loopA = player.loopB = -1;
            player.loop = false;
          }
          setLoopTick((x) => x + 1);
        }}>{Icon.loop}</button>
        <button className={`btn icon ${sound ? 'on' : ''}`} title="Sound (M)" aria-label="Toggle sound" data-testid="sound" onClick={toggleSound}>{sound ? Icon.sound : Icon.mute}</button>
        <button className="btn icon" title="Fullscreen (F)" aria-label="Fullscreen" onClick={() => window.dispatchEvent(new Event('sortclaude:fullscreen'))}>{Icon.full}</button>
        <button className="btn" title="Cinematic mode (C)" onClick={() => setCinematic(true)} disabled={!ready}>{Icon.film}Cinematic</button>
        <button className={`btn ${sidebar ? 'on' : ''}`} title="Show / hide the customization panel" onClick={() => setSidebar(!sidebar)}>{Icon.sliders}Customize</button>
        <button className="btn" onClick={() => setPage('studio')}>{Icon.video}Make Video</button>
      </div>
    </div>
  );
}

export function Scrubber({ value, onChange, disabled, loopA = -1, loopB = -1, showLoop }: { value: number; onChange: (p: number) => void; disabled?: boolean; loopA?: number; loopB?: number; showLoop?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  return (
    <div
      className="scrub"
      ref={ref}
      role="slider"
      aria-label="Timeline position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      data-testid="scrubber"
      style={disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
      onPointerDown={(e) => {
        drag.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onChange(at(e.clientX));
      }}
      onPointerMove={(e) => drag.current && onChange(at(e.clientX))}
      onPointerUp={() => (drag.current = false)}
      onKeyDown={(e) => {
        if (e.key === 'Home') onChange(0);
        if (e.key === 'End') onChange(1);
        if (e.key === 'PageUp') onChange(Math.min(1, value + 0.05));
        if (e.key === 'PageDown') onChange(Math.max(0, value - 0.05));
      }}
    >
      <div className="scrub-track">
        <div className="scrub-fill" style={{ width: `${value * 100}%` }} />
      </div>
      {loopA >= 0 && <div className="scrub-loop" style={{ left: `${loopA * 100}%`, width: `${Math.max(0.2, ((loopB >= 0 ? loopB : loopA + 0.002) - loopA) * 100)}%`, opacity: showLoop || loopB < 0 ? 1 : 0.5 }} />}
      <div className="scrub-thumb" style={{ left: `${value * 100}%` }} />
    </div>
  );
}
