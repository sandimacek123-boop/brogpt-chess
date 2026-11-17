import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { Composer, projectDuration, recordingKey, LAYOUT_PANELS, type Clip, type ClipLayout, type Transition, type VideoProject, type TextStyle } from '../export/composer';
import { exportVideo, exportRealtime, probeCapabilities, verifyPlayable, type Capabilities, type ExportProgress, type ExportResult } from '../export/encoder';
import type { Recording } from '../engine/runner';
import { SortWorker } from '../workers/client';
import { ALGORITHMS, getAlgorithm } from '../engine/registry';
import { PATTERNS, type PatternId } from '../engine/generators';
import { VIZ_2D, VIZ_3D, is3D, type Settings, type VizId, type CompletionEffect } from '../state/settings';
import { PALETTES } from '../render/palettes';
import { Icon, Select, Slider, Toggle, Segmented, ColorInput, fmtTime, saveBlob } from './components';
import { Scrubber } from './Visualizer';
import { randomSeed } from '../engine/rng';
import { AudioControls } from './Panels';

type Aspect = '9:16' | '16:9' | '1:1' | 'custom';

interface StudioState {
  aspect: Aspect;
  resolution: number;
  customW: number;
  customH: number;
  fps: number;
  intro: number;
  outro: number;
  clips: Clip[];
  text: TextStyle;
  appearance: Settings['appearance'];
  cinematic: Settings['cinematic'];
  three: Settings['three'];
  audioEnabled: boolean;
  branding: boolean;
  completion: CompletionEffect;
  filename: string;
  bitrate: number;
  format: 'auto' | 'mp4' | 'webm';
}

let uid = 1;
const newClip = (p: Partial<Clip> = {}): Clip => ({ id: `c${Date.now()}-${uid++}`, algorithms: ['merge', 'quick', 'heap', 'shell-ciura', 'insertion', 'radix-lsd', 'timsort', 'bubble', 'selection', 'cocktail', 'comb', 'smooth', 'introsort', 'quick-dual', 'odd-even-merge', 'gnome'], viz: 'bars', n: 160, pattern: 'random', seed: 20251117, duration: 12, layout: 'single', transition: 'crossfade', title: '', audio: 1, ...p });

const DEFAULT_TEXT: TextStyle = { showTitle: true, showCounters: true, showSize: true, showComplexity: true, showWinner: true, titleSize: 1, position: 'top', color: '#f5f5fa', animation: 'fade-up' };

interface Preset {
  name: string;
  description: string;
  apply: (s: StudioState) => StudioState;
}

const PRESETS: Preset[] = [
  {
    name: 'TikTok Rainbow Sort',
    description: 'Vertical, vibrant rainbow bars, clean labels.',
    apply: (s) => ({ ...s, aspect: '9:16', resolution: 1080, clips: [newClip({ viz: 'bars', algorithms: ['merge', ...s.clips[0].algorithms.slice(1)], duration: 15 })], appearance: { ...s.appearance, palette: 'classic-rainbow', background: 'solid', bgColor1: '#050509', glow: 0.4, colorMode: 'value' }, cinematic: { ...s.cinematic, grain: 0.05, vignette: 0.3, cameraMotion: false, grading: 'vivid' }, text: { ...DEFAULT_TEXT, position: 'top', titleSize: 1.15 }, completion: 'rainbow-sweep' }),
  },
  {
    name: 'Mathematical Cinema',
    description: 'Elegant type, dark grid, subtle particles, slow camera.',
    apply: (s) => ({ ...s, aspect: '16:9', resolution: 1080, clips: [newClip({ viz: 'ring', algorithms: ['heap', ...s.clips[0].algorithms.slice(1)], n: 512, duration: 18 })], appearance: { ...s.appearance, palette: 'aurora', background: 'math-grid', glow: 0.55, pointSize: 1.2 }, cinematic: { ...s.cinematic, cameraMotion: true, cameraSpeed: 0.4, zoom: 1.05, grain: 0.15, vignette: 0.5, grading: 'teal-orange', particles: 0.6 }, text: { ...DEFAULT_TEXT, animation: 'tracking', position: 'bottom', titleSize: 0.9 }, completion: 'radial-pulse' }),
  },
  {
    name: 'Neon Spiral',
    description: 'Spiral in neon colors with synchronized synth audio.',
    apply: (s) => ({ ...s, aspect: '9:16', resolution: 1080, audioEnabled: true, clips: [newClip({ viz: 'spiral', algorithms: ['quick', ...s.clips[0].algorithms.slice(1)], n: 1024, duration: 16 })], appearance: { ...s.appearance, palette: 'neon-rainbow', background: 'starfield', glow: 0.7, pointSize: 1.4 }, cinematic: { ...s.cinematic, grading: 'vivid', cameraMotion: true, zoom: 1.02 }, text: { ...DEFAULT_TEXT, animation: 'fade-up' }, completion: 'particle-burst' }),
  },
  {
    name: 'Algorithm Battle',
    description: 'Four algorithms race on identical data, split screen.',
    apply: (s) => ({ ...s, aspect: '16:9', resolution: 1080, clips: [newClip({ viz: 'bars', layout: 'grid4', algorithms: ['quick', 'merge', 'heap', 'shell-ciura', ...s.clips[0].algorithms.slice(4)], n: 256, duration: 16 })], appearance: { ...s.appearance, palette: 'cyberpunk', background: 'grid', glow: 0.3 }, cinematic: { ...s.cinematic, cameraMotion: false, grain: 0.05, vignette: 0.25 }, text: { ...DEFAULT_TEXT, showWinner: true, position: 'top', titleSize: 0.8 }, completion: 'completion-wave' }),
  },
  {
    name: 'Minimalist Science',
    description: 'Precise counters, plain background, educational.',
    apply: (s) => ({ ...s, aspect: '16:9', resolution: 1080, clips: [newClip({ viz: 'scatter', algorithms: ['insertion', ...s.clips[0].algorithms.slice(1)], n: 128, duration: 14 })], appearance: { ...s.appearance, palette: 'monochrome', background: 'solid', bgColor1: '#0b0b12', glow: 0, pointSize: 1.6 }, cinematic: { ...s.cinematic, grain: 0, vignette: 0, grading: 'none', cameraMotion: false, zoom: 1 }, text: { ...DEFAULT_TEXT, animation: 'none', position: 'top', titleSize: 0.8, showCounters: true }, completion: 'fade' }),
  },
  {
    name: 'Galaxy Sort',
    description: '3D particle galaxy with cinematic orbit.',
    apply: (s) => ({ ...s, aspect: '16:9', resolution: 1080, clips: [newClip({ viz: 'galaxy', algorithms: ['merge', ...s.clips[0].algorithms.slice(1)], n: 2048, duration: 16 })], appearance: { ...s.appearance, palette: 'galaxy', bgColor1: '#030308', glow: 0.8 }, three: { ...s.three, bloom: 1.2, autoRotate: true, rotateSpeed: 0.6, cameraPreset: 'iso' }, cinematic: { ...s.cinematic, cameraMotion: true, grain: 0.1, vignette: 0.5 }, text: { ...DEFAULT_TEXT, animation: 'tracking' }, completion: 'radial-pulse' }),
  },
];

function initialState(st: Settings): StudioState {
  return {
    aspect: st.export.aspect,
    resolution: st.export.resolution,
    customW: st.export.customW,
    customH: st.export.customH,
    fps: st.export.fps,
    intro: st.cinematic.intro,
    outro: st.cinematic.outro,
    clips: [newClip({ algorithms: [st.sorting.algorithm, 'quick', 'heap', 'shell-ciura', 'insertion', 'radix-lsd', 'timsort', 'bubble', 'selection', 'cocktail', 'comb', 'smooth', 'introsort', 'quick-dual', 'odd-even-merge', 'gnome'], viz: st.appearance.viz, n: Math.min(st.sorting.n, getAlgorithm(st.sorting.algorithm).maxN), pattern: st.sorting.pattern === 'custom' ? 'random' : st.sorting.pattern, seed: st.sorting.seed, duration: st.export.duration })],
    text: { ...DEFAULT_TEXT },
    appearance: { ...st.appearance },
    cinematic: { ...st.cinematic },
    three: { ...st.three },
    audioEnabled: st.export.audio,
    branding: st.export.branding,
    completion: st.cinematic.completion,
    filename: st.export.filename,
    bitrate: st.export.bitrateMbps,
    format: st.export.format,
  };
}

export function dims(s: Pick<StudioState, 'aspect' | 'resolution' | 'customW' | 'customH'>): { w: number; h: number } {
  const r = s.resolution;
  const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);
  if (s.aspect === '9:16') return { w: even(r), h: even((r * 16) / 9) };
  if (s.aspect === '16:9') return { w: even((r * 16) / 9), h: r };
  if (s.aspect === '1:1') return { w: r, h: r };
  return { w: even(s.customW), h: even(s.customH) };
}

const recordingCache = new Map<string, Recording>();
const studioWorker = new SortWorker(true);

async function ensureRecordings(clips: Clip[], onStatus: (s: string) => void): Promise<string | null> {
  for (const c of clips) {
    for (const a of c.algorithms.slice(0, LAYOUT_PANELS[c.layout])) {
      const key = recordingKey(a, c);
      if (recordingCache.has(key)) continue;
      const algo = getAlgorithm(a);
      if (c.n > algo.maxN) return `${algo.name} supports at most ${algo.maxN.toLocaleString()} elements.`;
      onStatus(`Calculating ${algo.name} on ${c.n.toLocaleString()} elements…`);
      const { generateKeys } = await import('../engine/generators');
      const rec = await studioWorker.record(a, generateKeys({ n: c.n, pattern: c.pattern, seed: c.seed }), c.seed, 16_000_000, 25_000);
      if (rec.error && !rec.truncated) return rec.error;
      recordingCache.set(key, rec);
    }
  }
  onStatus('');
  return null;
}

let persisted: StudioState | null = null;

/** Largest box with the given aspect ratio that fits the available space. */
function FitBox({ aspect, children }: { aspect: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const w = Math.min(r.width, r.height * aspect);
      setSize({ w, h: w / aspect });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);
  return (
    <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ width: size.w, height: size.h }}>{children}</div>
    </div>
  );
}

export function Studio() {
  const st = useApp((s) => s.settings);
  const toast = useApp((s) => s.toast);
  const [s, setS] = useState<StudioState>(() => persisted ?? initialState(st));
  const [sel, setSel] = useState(0);
  const [status, setStatus] = useState('');
  const [ready, setReady] = useState(false);
  const [composerVersion, setComposerVersion] = useState(0);
  const [time, setTime] = useState(() => (persisted ?? initialState(useApp.getState().settings)).intro + 3);
  const [playing, setPlaying] = useState(false);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<(ExportResult & { verify?: Awaited<ReturnType<typeof verifyPlayable>>; savedTo?: string | null }) | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const cancelled = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const composerRef = useRef<Composer | null>(null);
  const threeMod = useRef<typeof import('../render/three/renderer3d') | undefined>(undefined);
  const up = (p: Partial<StudioState>) => setS((cur) => ({ ...cur, ...p }));
  const upClip = (i: number, p: Partial<Clip>) => setS((cur) => ({ ...cur, clips: cur.clips.map((c, j) => (j === i ? { ...c, ...p } : c)) }));
  useEffect(() => {
    persisted = s;
  }, [s]);

  const { w, h } = dims(s);
  const project: VideoProject = useMemo(
    () => ({ width: w, height: h, fps: s.fps, intro: s.intro, outro: s.outro, clips: s.clips, text: s.text, appearance: s.appearance, three: s.three, cinematic: s.cinematic, audio: st.audio, audioEnabled: s.audioEnabled, branding: s.branding, completion: s.completion }),
    [w, h, s, st.audio],
  );
  const duration = projectDuration(project);
  const needs3D = s.clips.some((c) => is3D(c.viz));

  // recordings + preview composer
  useEffect(() => {
    let alive = true;
    setReady(false);
    (async () => {
      if (needs3D && !threeMod.current) threeMod.current = await import('../render/three/renderer3d');
      const err = await ensureRecordings(s.clips, (m) => alive && setStatus(m));
      if (!alive) return;
      if (err) {
        setStatus(err);
        return;
      }
      const pw = Math.min(720, w);
      const scale = pw / w;
      const previewProject = { ...project, width: Math.round(w * scale), height: Math.round(h * scale) };
      composerRef.current?.dispose();
      composerRef.current = new Composer(previewProject, recordingCache, canvasRef.current!, threeMod.current);
      setComposerVersion((v) => v + 1);
      setReady(true);
    })().catch((e) => setStatus(`Error: ${(e as Error).message}`));
    return () => {
      alive = false;
    };
  }, [project]);

  useEffect(() => {
    if (!ready || !composerRef.current) return;
    composerRef.current.drawFrame(Math.min(time, duration - 1e-3));
  }, [time, ready, duration, composerVersion]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setTime((t) => {
        const nt = t + (now - last) / 1000;
        if (nt >= duration) {
          setPlaying(false);
          return duration;
        }
        return nt;
      });
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  useEffect(() => {
    probeCapabilities(w, h, s.fps, s.bitrate * 1e6).then(setCaps);
  }, [w, h, s.fps, s.bitrate]);

  const choice = caps?.options.find((o) => s.format === 'auto' || o.container === s.format) ?? null;

  const doExport = async () => {
    setResult(null);
    cancelled.current = false;
    const err = await ensureRecordings(s.clips, setStatus);
    if (err) return toast(err, 'error');
    if (needs3D && !threeMod.current) threeMod.current = await import('../render/three/renderer3d');
    try {
      let res: ExportResult;
      if (choice) res = await exportVideo(project, recordingCache, choice, s.bitrate * 1e6, setProgress, () => cancelled.current, threeMod.current);
      else if (typeof MediaRecorder !== 'undefined') res = await exportRealtime(project, recordingCache, setProgress, () => cancelled.current);
      else throw new Error('This runtime has neither WebCodecs nor MediaRecorder — video export is unavailable. Use the desktop app or a current Chrome/Edge.');
      const name = s.filename.replace('{algorithm}', getAlgorithm(s.clips[0].algorithms[0]).id).replace('{n}', String(s.clips[0].n)).replace(/[^\w.-]+/g, '_') + '.' + res.extension;
      const verify = await verifyPlayable(res.blob);
      const bridge = (window as any).sortclaude;
      let savedTo: string | null;
      if (bridge?.saveFileTo && folder) savedTo = (await bridge.saveFileTo(folder, name, new Uint8Array(await res.blob.arrayBuffer())))?.path ?? null;
      else savedTo = await saveBlob(res.blob, name);
      setResult({ ...res, verify, savedTo });
      toast(savedTo ? `Video saved: ${savedTo}` : 'Export finished (save cancelled).', savedTo ? 'success' : 'info');
    } catch (e) {
      const msg = (e as Error).message;
      toast(msg === 'Cancelled' ? 'Export cancelled.' : `Export failed: ${msg}`, msg === 'Cancelled' ? 'info' : 'error');
    } finally {
      setProgress(null);
      setStatus('');
    }
  };

  const clip = s.clips[Math.min(sel, s.clips.length - 1)];
  const exporting = !!progress;

  return (
    <div className="studio-layout">
      <div className="sidebar" style={{ borderLeft: 0, borderRight: '1px solid var(--line)' }}>
        <div className="section-body" style={{ paddingTop: 14 }}>
          <div className="label">Production presets</div>
          <div className="grid-picker" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {PRESETS.map((p) => (
              <button key={p.name} className="pick" style={{ textAlign: 'left', justifyItems: 'start', padding: 9 }} title={p.description} onClick={() => { setS((cur) => p.apply(cur)); setSel(0); setTime(s.intro + 3); }} data-preset={p.name}>
                <b style={{ color: 'var(--text-1)', fontSize: 12 }}>{p.name}</b>
                <span className="hint" style={{ fontSize: 10.5 }}>{p.description}</span>
              </button>
            ))}
          </div>
          <Segmented label="Format" value={s.aspect} onChange={(v) => up({ aspect: v })} options={[{ value: '9:16', label: '9:16' }, { value: '16:9', label: '16:9' }, { value: '1:1', label: '1:1' }, { value: 'custom', label: 'Custom' }]} />
          {s.aspect === 'custom' ? (
            <div className="input-group">
              <input className="input mono" value={s.customW} onChange={(e) => up({ customW: Math.max(128, Math.min(4096, Number(e.target.value) || 0)) })} aria-label="Width" />
              <input className="input mono" value={s.customH} onChange={(e) => up({ customH: Math.max(128, Math.min(4096, Number(e.target.value) || 0)) })} aria-label="Height" />
            </div>
          ) : (
            <Segmented label="Resolution" value={s.resolution} onChange={(v) => up({ resolution: v })} options={[{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }, { value: 1440, label: '1440p' }, { value: 2160, label: '4K' }]} />
          )}
          <Segmented label="Frame rate" value={s.fps} onChange={(v) => up({ fps: v })} options={[{ value: 24, label: '24' }, { value: 30, label: '30' }, { value: 60, label: '60' }]} />
          <div className="hint mono">{w} × {h} · {s.fps} FPS · {fmtTime(duration)}</div>
          <div className="field-row"><span className="label">Timeline</span><button className="btn" onClick={() => { up({ clips: [...s.clips, newClip({ seed: randomSeed(), transition: 'crossfade' })] }); setSel(s.clips.length); }}>{Icon.plus}Add clip</button></div>
          <div className="stack" style={{ gap: 6 }}>
            {s.clips.map((c, i) => (
              <div key={c.id} className={`clip ${i === sel ? 'active' : ''}`} onClick={() => setSel(i)}>
                <span className="idx">{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title || c.algorithms.slice(0, LAYOUT_PANELS[c.layout]).map((a) => getAlgorithm(a).name).join(' vs ')}</div>
                  <div className="hint">{[...VIZ_2D, ...VIZ_3D].find((v) => v.id === c.viz)?.name} · {c.n} · {c.duration}s{i > 0 ? ` · ${c.transition}` : ''}</div>
                </div>
                <div className="row-wrap" style={{ gap: 2 }}>
                  <button className="btn ghost icon" aria-label="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); const cl = [...s.clips]; [cl[i - 1], cl[i]] = [cl[i], cl[i - 1]]; up({ clips: cl }); setSel(i - 1); }}>↑</button>
                  <button className="btn ghost icon" aria-label="Duplicate" onClick={(e) => { e.stopPropagation(); const cl = [...s.clips]; cl.splice(i + 1, 0, { ...c, id: `c${Date.now()}-${uid++}` }); up({ clips: cl }); }}>{Icon.copy}</button>
                  <button className="btn ghost icon" aria-label="Delete" disabled={s.clips.length === 1} onClick={(e) => { e.stopPropagation(); up({ clips: s.clips.filter((_, j) => j !== i) }); setSel(Math.max(0, i - 1)); }}>{Icon.trash}</button>
                </div>
              </div>
            ))}
          </div>
          <Slider label="Intro" value={s.intro} min={0} max={6} step={0.1} onChange={(v) => up({ intro: v })} format={(v) => `${v.toFixed(1)} s`} />
          <Slider label="Outro" value={s.outro} min={0} max={6} step={0.1} onChange={(v) => up({ outro: v })} format={(v) => `${v.toFixed(1)} s`} />
        </div>
      </div>

      <div className="studio-preview">
        <div style={{ display: 'grid', gap: 12, width: '100%', height: '100%', gridTemplateRows: 'minmax(0,1fr) auto', justifyItems: 'center', minHeight: 0 }}>
          <FitBox aspect={w / h}>
            <div className="preview-frame" style={{ width: '100%', height: '100%' }}>
              <canvas ref={canvasRef} data-testid="studio-preview" />
              {!ready && <div className="stage-overlay"><div className="stage-msg small">{status ? <><span className="spinner" /> {status}</> : <span className="spinner" />}</div></div>}
            </div>
          </FitBox>
          <div style={{ width: '100%', maxWidth: 720 }} className="stack">
            <div className="timeline">
              <button className="btn primary icon" aria-label={playing ? 'Pause preview' : 'Play preview'} onClick={() => { if (time >= duration) setTime(0); setPlaying(!playing); }} disabled={!ready}>{playing ? Icon.pause : Icon.play}</button>
              <Scrubber value={time / Math.max(0.001, duration)} onChange={(p) => { setPlaying(false); setTime(p * duration); }} disabled={!ready} />
              <span className="time mono" style={{ minWidth: 90 }}>{fmtTime(time)} / {fmtTime(duration)}</span>
            </div>
            <div className="hint" style={{ textAlign: 'center' }}>Preview renders the exact frames that will be exported (at reduced resolution). Audio is rendered offline during export.</div>
          </div>
        </div>
      </div>

      <div className="sidebar">
        <div className="section-body" style={{ paddingTop: 14 }}>
          <div className="label">Clip {sel + 1}</div>
          <Select label="Layout" value={clip.layout} onChange={(v: ClipLayout) => upClip(sel, { layout: v })} options={[{ value: 'single', label: 'One large visualization' }, { value: 'stack2', label: 'Two stacked' }, { value: 'side2', label: 'Two side by side' }, { value: 'grid4', label: 'Four-grid' }, { value: 'grid8', label: 'Eight-grid' }, { value: 'grid16', label: 'Sixteen-grid' }]} />
          {Array.from({ length: LAYOUT_PANELS[clip.layout] }, (_, k) => (
            <select key={k} className="select" value={clip.algorithms[k]} aria-label={`Panel ${k + 1} algorithm`} onChange={(e) => upClip(sel, { algorithms: clip.algorithms.map((a, j) => (j === k ? e.target.value : a)) })}>
              {ALGORITHMS.map((a) => <option key={a.id} value={a.id} disabled={clip.n > a.maxN}>{a.name}</option>)}
            </select>
          ))}
          {LAYOUT_PANELS[clip.layout] > 1 && <div className="hint">All panels sort the same seeded dataset; a shared clock in operations paces them, so faster algorithms finish first.</div>}
          <Select label="Visualization" value={clip.viz} onChange={(v: VizId) => upClip(sel, { viz: v })} options={[...VIZ_2D.map((v) => ({ value: v.id as VizId, label: v.name, group: '2D' })), ...VIZ_3D.map((v) => ({ value: v.id as VizId, label: v.name, group: '3D (single layout only)' }))]} />
          {is3D(clip.viz) && clip.layout !== 'single' && <div className="chip warn">3D views export one panel; use a single layout.</div>}
          <div className="cols-2" style={{ gap: 8 }}>
            <div className="field"><label>Elements</label><input className="input mono" value={clip.n} onChange={(e) => upClip(sel, { n: Math.max(2, Math.min(100000, Number(e.target.value.replace(/\D/g, '')) || 2)) })} aria-label="Clip elements" /></div>
            <div className="field"><label>Seed</label><input className="input mono" value={clip.seed} onChange={(e) => upClip(sel, { seed: Number(e.target.value.replace(/\D/g, '')) || 0 })} aria-label="Clip seed" /></div>
          </div>
          <Select label="Input order" value={clip.pattern} onChange={(v: PatternId) => upClip(sel, { pattern: v })} options={PATTERNS.filter((p) => p.id !== 'custom').map((p) => ({ value: p.id, label: p.name }))} />
          <Slider label="Clip duration" value={clip.duration} min={3} max={60} step={0.5} onChange={(v) => upClip(sel, { duration: v })} format={(v) => `${v} s`} />
          {sel > 0 && <Select label="Transition in" value={clip.transition} onChange={(v: Transition) => upClip(sel, { transition: v })} options={[{ value: 'none', label: 'Cut' }, { value: 'crossfade', label: 'Crossfade' }, { value: 'fade-black', label: 'Fade to black' }, { value: 'zoom', label: 'Zoom' }, { value: 'slide', label: 'Slide' }, { value: 'color-sweep', label: 'Color sweep' }, { value: 'spiral', label: 'Spiral' }, { value: 'wipe', label: 'Geometric wipe' }]} />}
          <div className="field"><label>Title override</label><input className="input" value={clip.title} placeholder="(algorithm name)" onChange={(e) => upClip(sel, { title: e.target.value.slice(0, 80) })} /></div>
          <Slider label="Clip audio level" value={clip.audio} min={0} max={1} onChange={(v) => upClip(sel, { audio: v })} format={(v) => `${Math.round(v * 100)}%`} />

          <div className="label" style={{ marginTop: 8 }}>Look</div>
          <Select label="Palette" value={s.appearance.palette} onChange={(v) => up({ appearance: { ...s.appearance, palette: v } })} options={PALETTES.map((p) => ({ value: p.id, label: p.name }))} />
          <Select label="Background" value={s.appearance.background} onChange={(v) => up({ appearance: { ...s.appearance, background: v } })} options={[{ value: 'math-grid', label: 'Mathematical grid' }, { value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }, { value: 'starfield', label: 'Starfield' }, { value: 'grid', label: 'Subtle grid' }, { value: 'particles', label: 'Particles' }, { value: 'geometric', label: 'Geometric' }]} />
          <Slider label="Glow" value={s.appearance.glow} min={0} max={1} onChange={(v) => up({ appearance: { ...s.appearance, glow: v } })} />
          <Select label="Completion effect" value={s.completion} onChange={(v) => up({ completion: v })} options={[{ value: 'rainbow-sweep', label: 'Rainbow sweep' }, { value: 'particle-burst', label: 'Gentle particle burst' }, { value: 'completion-wave', label: 'Glowing completion wave' }, { value: 'radial-pulse', label: 'Radial pulse' }, { value: 'cascade', label: 'Cascading color' }, { value: 'geometric', label: 'Soft geometric explosion' }, { value: 'fade', label: 'Fade to result' }, { value: 'none', label: 'None' }]} />
          <Select label="Color grading" value={s.cinematic.grading} onChange={(v) => up({ cinematic: { ...s.cinematic, grading: v } })} options={[{ value: 'none', label: 'None' }, { value: 'teal-orange', label: 'Teal & orange' }, { value: 'cool', label: 'Cool' }, { value: 'warm', label: 'Warm' }, { value: 'noir', label: 'Noir' }, { value: 'vivid', label: 'Vivid' }]} />
          <Toggle label="Camera movement" value={s.cinematic.cameraMotion} onChange={(v) => up({ cinematic: { ...s.cinematic, cameraMotion: v } })} />
          <Slider label="Vignette" value={s.cinematic.vignette} min={0} max={1} onChange={(v) => up({ cinematic: { ...s.cinematic, vignette: v } })} />
          <Slider label="Film grain" value={s.cinematic.grain} min={0} max={1} onChange={(v) => up({ cinematic: { ...s.cinematic, grain: v } })} />

          <div className="label" style={{ marginTop: 8 }}>Titles</div>
          <Toggle label="Algorithm title" value={s.text.showTitle} onChange={(v) => up({ text: { ...s.text, showTitle: v } })} />
          <Toggle label="Operation counter" value={s.text.showCounters} onChange={(v) => up({ text: { ...s.text, showCounters: v } })} />
          <Toggle label="Array size" value={s.text.showSize} onChange={(v) => up({ text: { ...s.text, showSize: v } })} />
          <Toggle label="Complexity" value={s.text.showComplexity} onChange={(v) => up({ text: { ...s.text, showComplexity: v } })} />
          <Toggle label="Round winner (multi-panel)" value={s.text.showWinner} onChange={(v) => up({ text: { ...s.text, showWinner: v } })} />
          <Slider label="Title size" value={s.text.titleSize} min={0.4} max={2} onChange={(v) => up({ text: { ...s.text, titleSize: v } })} />
          <Segmented label="Title position" value={s.text.position} onChange={(v) => up({ text: { ...s.text, position: v } })} options={[{ value: 'top', label: 'Top' }, { value: 'center', label: 'Center' }, { value: 'bottom', label: 'Bottom' }]} />
          <Select label="Text animation" value={s.text.animation} onChange={(v) => up({ text: { ...s.text, animation: v } })} options={[{ value: 'fade-up', label: 'Fade up' }, { value: 'typewriter', label: 'Typewriter' }, { value: 'tracking', label: 'Tracking in' }, { value: 'none', label: 'None' }]} />
          <ColorInput label="Title color" value={s.text.color} onChange={(v) => up({ text: { ...s.text, color: v } })} />
          <Toggle label="SortClaude branding" value={s.branding} onChange={(v) => up({ branding: v })} />

          <div className="label" style={{ marginTop: 8 }}>Audio</div>
          <Toggle label="Include synthesized sorting audio" value={s.audioEnabled} onChange={(v) => up({ audioEnabled: v })} />
          {s.audioEnabled && <details><summary className="label" style={{ cursor: 'pointer' }}>Instrument & mix (shared with live audio)</summary><div className="stack" style={{ marginTop: 8 }}><AudioControls /></div></details>}

          <div className="label" style={{ marginTop: 8 }}>Export</div>
          <Select label="Container" value={s.format} onChange={(v) => up({ format: v })} options={[{ value: 'auto', label: 'Best available' }, { value: 'mp4', label: 'MP4 (H.264)' }, { value: 'webm', label: 'WebM (VP9/VP8)' }]} />
          <Slider label="Bitrate" value={s.bitrate} min={2} max={60} step={1} onChange={(v) => up({ bitrate: v })} format={(v) => `${v} Mbps`} />
          <div className="field"><label>Filename ({'{algorithm}'}, {'{n}'})</label><input className="input mono" value={s.filename} onChange={(e) => up({ filename: e.target.value.slice(0, 120) })} /></div>
          {(window as any).sortclaude?.chooseFolder && (
            <div className="field-row">
              <span className="hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder ?? 'Ask where to save'}</span>
              <button className="btn" onClick={async () => setFolder((await (window as any).sortclaude.chooseFolder()) ?? folder)}>{Icon.open}Output folder</button>
            </div>
          )}
          <div className="card" style={{ padding: 10 }} data-testid="capabilities">
            {!caps ? <span className="hint"><span className="spinner" /> Probing encoders…</span> : (
              <div className="stack" style={{ gap: 6 }}>
                <div className="small">{choice ? <>Encoder: <b>{choice.label}</b></> : caps.webcodecs ? <span style={{ color: 'var(--red)' }}>No encoder for this configuration</span> : 'Real-time WebM fallback (no audio)'}</div>
                {caps.options.length > 0 && <div className="hint">Available here: {caps.options.map((o) => o.label).join(' · ')}</div>}
                {caps.notes.map((n) => <div key={n} className="hint" style={{ color: 'var(--amber)' }}>{n}</div>)}
              </div>
            )}
          </div>
          {!exporting ? (
            <button className="btn primary lg" data-testid="export" disabled={!ready || (caps?.webcodecs && !choice)} onClick={doExport}>{Icon.video}Render video</button>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <div className="progress-bar"><div style={{ width: `${(progress!.frame / progress!.totalFrames) * 100}%` }} /></div>
              <div className="hint mono" data-testid="export-progress">
                {progress!.phase === 'audio' ? 'Rendering audio…' : progress!.phase === 'preparing' ? 'Preparing…' : progress!.phase === 'finalizing' ? 'Finalizing…' : `Frame ${progress!.frame} / ${progress!.totalFrames} · ${((progress!.frame / progress!.totalFrames) * 100).toFixed(1)}%${progress!.etaSeconds != null ? ` · ~${Math.ceil(progress!.etaSeconds)} s left` : ''}`}
              </div>
              <button className="btn danger" onClick={() => (cancelled.current = true)}>{Icon.stop}Cancel export</button>
            </div>
          )}
          {result && (
            <div className="card stack" style={{ padding: 12 }} data-testid="export-result">
              <span className="chip ok">✓ Export complete</span>
              <div className="small mono">{result.width}×{result.height} · {result.fps} FPS · {result.frames} frames · {result.duration.toFixed(2)} s · {(result.blob.size / 1e6).toFixed(2)} MB</div>
              <div className="small">{result.codec}{result.hasAudio ? ' · with audio' : ' · silent'}</div>
              <div className="small muted">Saved: {result.savedTo ?? '—'}</div>
              {result.verify && (result.verify.ok ? <div className="small" style={{ color: 'var(--green)' }}>Verified playable: {result.verify.width}×{result.verify.height}, {Number.isFinite(result.verify.duration) ? `${result.verify.duration.toFixed(2)} s` : 'duration n/a'}</div> : <div className="small" style={{ color: 'var(--amber)' }}>Verification: {result.verify.error}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

