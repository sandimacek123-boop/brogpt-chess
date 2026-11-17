import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Player, type PlayerRef} from '@remotion/player';
import {CrosshairEdit} from '../src/CrosshairEdit';
import {
  BUILTIN_ART,
  DEFAULT_BRAND,
  DEFAULT_PALETTE,
  DEFAULT_PROPS,
  DURATION_FRAMES,
  EXPORT_FILENAME,
  FPS,
  HEIGHT,
  WIDTH,
  isProcedural,
  mergeProps,
  type BrandSettings,
  type EditProps,
  type Palette,
  type SceneConfig,
} from '../src/config';
import {SECTIONS} from '../src/engine/timeline';
import type {FrameInfo} from '../src/engine/render';
import {analyzeInBrowser} from '../src/audio/beats';

const STORAGE_KEY = 'real-crosshair-project-v2';
const PANEL_NAMES = ['Top left · blue', 'Top right · red', 'Bottom left · red', 'Bottom right · blue'];
const PALETTE_LABELS: Record<keyof Palette, string> = {
  electric: 'Electric blue',
  cyan: 'Cyan blue',
  deepBlue: 'Deep blue',
  red: 'Impact red',
  white: 'White',
  nearBlack: 'Near-black',
  graphite: 'Dark graphite',
};

const stripBlobs = (p: EditProps): EditProps => {
  // blob: URLs die with the tab – fall back to defaults for those
  const fix = (s: string | null, d: string | null) => (s && s.startsWith('blob:') ? d : s);
  return {
    ...p,
    brand: {...p.brand, logo: fix(p.brand.logo, DEFAULT_BRAND.logo) as string},
    audio: p.audio.src?.startsWith('blob:') ? {...p.audio, src: null, enabled: false} : p.audio,
    scenes: p.scenes.map((s, i) => ({
      ...s,
      art: fix(s.art, DEFAULT_PROPS.scenes[i].art) as string,
      panels: s.panels.map((x) => fix(x, null)) as SceneConfig['panels'],
    })),
  };
};

const loadSaved = (): EditProps => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? stripBlobs(mergeProps(JSON.parse(raw))) : DEFAULT_PROPS;
  } catch {
    return DEFAULT_PROPS;
  }
};

type Upload = {url: string; serverSide: boolean};

const uploadFile = async (file: File): Promise<Upload> => {
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: {'x-filename': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream'},
      body: file,
    });
    if (!res.ok) throw new Error(await res.text());
    const {url} = (await res.json()) as {url: string};
    return {url, serverSide: true};
  } catch {
    return {url: URL.createObjectURL(file), serverSide: false}; // preview-only fallback
  }
};

// ---------------------------------------------------------------------------
const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}> = ({label, value, min, max, step, onChange, fmt}) => (
  <label className="row">
    <span className="lbl">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    <span className="val">{fmt ? fmt(value) : value.toFixed(2)}</span>
  </label>
);

const Toggle: React.FC<{label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean}> = ({label, checked, onChange, disabled}) => (
  <label className={`row toggle ${disabled ? 'disabled' : ''}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>
);

const Select: React.FC<{label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void}> = ({label, value, options, onChange}) => (
  <label className="row">
    <span className="lbl">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  </label>
);

const FilePick: React.FC<{label: string; accept: string; onFile: (f: File) => void; small?: boolean}> = ({label, accept, onFile, small}) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={small ? 'btn small' : 'btn'} onClick={() => ref.current?.click()}>
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
};

const Section: React.FC<{title: string; children: React.ReactNode; open?: boolean}> = ({title, children, open = false}) => (
  <details className="section" open={open}>
    <summary>{title}</summary>
    <div className="section-body">{children}</div>
  </details>
);

const srcLabel = (src: string | null) => {
  if (!src) return 'none';
  const builtin = BUILTIN_ART.find((b) => b.src === src);
  if (builtin) return builtin.label;
  if (isProcedural(src)) return src;
  return `Uploaded · ${decodeURIComponent(src.split('/').pop() ?? src)}`;
};

type Job = {id: string; mode: 'silent' | 'music'; stage: string; progress: number; renderedFrames?: number; url?: string; error?: string};

const fmtX = (v: number) => `${v.toFixed(2)}×`;

// ---------------------------------------------------------------------------
export const App: React.FC = () => {
  const [props, setProps] = useState<EditProps>(loadSaved);
  const [quality, setQuality] = useState<'full' | 'draft' | 'fast'>('draft');
  const [loop, setLoop] = useState(true);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sceneTab, setSceneTab] = useState(0);
  const [audioInfo, setAudioInfo] = useState('');
  const [localOnly, setLocalOnly] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [serverUp, setServerUp] = useState<boolean | null>(null);
  const [fileName, setFileName] = useState(EXPORT_FILENAME);
  const [crf, setCrf] = useState(16);
  const playerRef = useRef<PlayerRef>(null);
  const infoRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(props));
    } catch {
      /* storage unavailable */
    }
  }, [props]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => setServerUp(r.ok))
      .catch(() => setServerUp(false));
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: {detail: {frame: number}}) => setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener('frameupdate', onFrame);
    p.addEventListener('seeked', onFrame);
    p.addEventListener('play', onPlay);
    p.addEventListener('pause', onPause);
    return () => {
      p.removeEventListener('frameupdate', onFrame);
      p.removeEventListener('seeked', onFrame);
      p.removeEventListener('play', onPlay);
      p.removeEventListener('pause', onPause);
    };
  }, []);

  const step = useCallback((d: number) => {
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    p.seekTo(Math.min(DURATION_FRAMES - 1, Math.max(0, p.getCurrentFrame() + d)));
  }, []);

  // keyboard: space play/pause, ←/→ frame step (shift = 10), R restart
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if ((el?.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range') || el?.tagName === 'SELECT') return;
      const p = playerRef.current;
      if (!p) return;
      if (e.code === 'Space') {
        e.preventDefault();
        p.toggle();
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault();
        step((e.code === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1));
      } else if (e.code === 'KeyR') {
        p.seekTo(0);
        p.play();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const onFrameInfo = useCallback((info: FrameInfo) => {
    const el = infoRef.current;
    if (el) {
      const st = info.state;
      el.textContent = `panels ${st.camera.angle.toFixed(1)}° · ω ${(st.omega * FPS).toFixed(0)}°/s · zoom ${st.camera.scale.toFixed(3)} · blur ${info.samples} sub-frames · rings ×${info.ringCopies}${info.ca ? ' · CA' : ''}${st.flash > 0.01 ? ` · flash ${st.flash.toFixed(2)}` : ''} · art ${st.scene}`;
    }
  }, []);

  const inputProps = useMemo(
    () => ({...props, previewMaxSamples: quality === 'full' ? undefined : quality === 'draft' ? 8 : 2, onFrameInfo}),
    [props, quality, onFrameInfo],
  );

  const set = <K extends keyof EditProps>(k: K, v: EditProps[K]) => setProps((p) => ({...p, [k]: v}));
  const setPalette = (k: keyof Palette, v: string) => setProps((p) => ({...p, palette: {...p.palette, [k]: v}}));
  const setBrand = (patch: Partial<BrandSettings>) => setProps((p) => ({...p, brand: {...p.brand, ...patch}}));
  const setAudio = (patch: Partial<EditProps['audio']>) => setProps((p) => ({...p, audio: {...p.audio, ...patch}}));
  const setScene = (idx: number, patch: Partial<SceneConfig>) =>
    setProps((p) => ({...p, scenes: p.scenes.map((s, i) => (i === idx ? {...s, ...patch} : s))}));

  const doUpload = async (file: File, apply: (url: string) => void) => {
    const up = await uploadFile(file);
    if (!up.serverSide) setLocalOnly(true);
    apply(up.url);
  };

  const onAudio = async (file: File) => {
    setAudioInfo('analysing beats…');
    const [up, analysis] = await Promise.all([uploadFile(file), file.arrayBuffer().then(analyzeInBrowser).catch(() => null)]);
    if (!up.serverSide) setLocalOnly(true);
    setAudio({src: up.url, enabled: true, beats: analysis?.beats ?? null});
    setAudioInfo(
      analysis
        ? `${file.name}: ${analysis.duration.toFixed(1)} s · ~${analysis.bpm.toFixed(1)} BPM · ${analysis.beats.length} beats`
        : `${file.name}: loaded (beat analysis failed – sync disabled)`,
    );
  };

  const startExport = async (mode: 'silent' | 'music') => {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({mode, props, fileName, crf}),
    });
    if (!res.ok) {
      alert(`Export failed: ${await res.text()}`);
      return;
    }
    const {id} = (await res.json()) as {id: string};
    setJobs((j) => [{id, mode, stage: 'queued', progress: 0}, ...j]);
    const es = new EventSource(`/api/render/${id}/events`);
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as Partial<Job>;
      setJobs((all) => all.map((x) => (x.id === id ? {...x, ...data} : x)));
      if (data.stage === 'done' || data.stage === 'error' || data.stage === 'cancelled') es.close();
    };
    es.onerror = () => es.close();
  };

  const saveProject = () => {
    const blob = new Blob([JSON.stringify({type: 'real-crosshair-project', version: 2, props}, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'real-crosshair-project.json';
    a.click();
  };

  const loadProject = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      setProps(stripBlobs(mergeProps(json.props ?? json)));
    } catch (e) {
      alert(`Could not load project: ${e instanceof Error ? e.message : e}`);
    }
  };

  const scene = props.scenes[sceneTab];
  const audioReady = Boolean(props.audio.src) && props.audio.enabled;
  const exportBlocked = serverUp === false || localOnly;

  return (
    <div className="app">
      <header>
        <div className="brand">
          <img src="/brand/real-symbol.svg" alt="" className="hdr-logo" />
          <b>Real</b> spinning crosshair editor
        </div>
        <div className="hdr-actions">
          <button className="btn small" onClick={saveProject}>
            Save project
          </button>
          <FilePick small label="Load project" accept="application/json,.json" onFile={loadProject} />
          <button
            className="btn small"
            onClick={() => {
              if (confirm('Reset every control to the defaults?')) setProps(DEFAULT_PROPS);
            }}
          >
            Reset controls
          </button>
        </div>
      </header>

      <main>
        <section className="stage">
          <div className="player-wrap">
            <Player
              ref={playerRef}
              component={CrosshairEdit}
              inputProps={inputProps}
              durationInFrames={DURATION_FRAMES}
              fps={FPS}
              compositionWidth={WIDTH}
              compositionHeight={HEIGHT}
              loop={loop}
              controls={false}
              clickToPlay
              acknowledgeRemotionLicense
              style={{width: '100%', height: '100%'}}
            />
          </div>

          <div className="transport">
            <button
              className="btn icon"
              title="Restart (R)"
              onClick={() => {
                playerRef.current?.seekTo(0);
                playerRef.current?.play();
              }}
            >
              ↺
            </button>
            <button className="btn icon" title="Back 1 frame (←)" onClick={() => step(-1)}>
              ◀︎
            </button>
            <button className="btn icon play" title="Play / pause (space)" onClick={() => playerRef.current?.toggle()}>
              {playing ? '❚❚' : '▶'}
            </button>
            <button className="btn icon" title="Forward 1 frame (→)" onClick={() => step(1)}>
              ▶︎
            </button>
            <button className="btn icon" title="Last frame" onClick={() => playerRef.current?.seekTo(DURATION_FRAMES - 1)}>
              ⏭
            </button>
            <span className="tc">
              f {String(frame).padStart(3, '0')} / {DURATION_FRAMES - 1} · {(frame / FPS).toFixed(2)}s
            </span>
            <Toggle label="loop" checked={loop} onChange={setLoop} />
            <select className="quality" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)} title="Preview quality">
              <option value="full">Preview: full</option>
              <option value="draft">Preview: draft</option>
              <option value="fast">Preview: fast</option>
            </select>
          </div>
          <div className="scrubber">
            <input
              type="range"
              min={0}
              max={DURATION_FRAMES - 1}
              step={1}
              value={frame}
              onChange={(e) => {
                playerRef.current?.pause();
                playerRef.current?.seekTo(Number(e.target.value));
              }}
            />
            <div className="marks">
              {SECTIONS.map((s) => (
                <button
                  key={s.f}
                  className="mark"
                  style={{left: `${(s.f / (DURATION_FRAMES - 1)) * 100}%`}}
                  onClick={() => playerRef.current?.seekTo(s.f)}
                  title={`${s.label} · ${(s.f / FPS).toFixed(2)} s`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="info">
            <span ref={infoRef} />
          </div>
          {quality !== 'full' ? <div className="note">Preview caps motion-blur sub-frames for smooth playback. Exports always render at full quality.</div> : null}
        </section>

        <aside className="panel">
          <Section title="Motion" open>
            <Slider label="Spin speed" value={props.spinSpeed} min={0.8} max={1.6} step={0.05} onChange={(v) => set('spinSpeed', v)} fmt={fmtX} />
            <Select
              label="Spin direction"
              value={String(props.spinDirection)}
              options={[
                ['1', 'Clockwise first'],
                ['-1', 'Counter-clockwise first'],
              ]}
              onChange={(v) => set('spinDirection', v === '-1' ? -1 : 1)}
            />
            <Slider label="Acceleration ease" value={props.acceleration} min={0.5} max={1.5} step={0.05} onChange={(v) => set('acceleration', v)} fmt={fmtX} />
            <Slider label="Deceleration ease" value={props.deceleration} min={0.5} max={1.5} step={0.05} onChange={(v) => set('deceleration', v)} fmt={fmtX} />
            <Slider label="Motion blur" value={props.motionBlur} min={0} max={2} step={0.05} onChange={(v) => set('motionBlur', v)} fmt={fmtX} />
            <Slider label="Blur samples (max)" value={props.maxBlurSamples} min={4} max={64} step={1} onChange={(v) => set('maxBlurSamples', v)} fmt={(v) => String(v)} />
            <Slider label="Ring speed" value={props.ringSpeed} min={0} max={2} step={0.05} onChange={(v) => set('ringSpeed', v)} fmt={fmtX} />
            <Slider label="Inner ring speed" value={props.innerRingSpeed} min={0} max={2} step={0.05} onChange={(v) => set('innerRingSpeed', v)} fmt={fmtX} />
            <Slider label="Outer ring speed" value={props.outerRingSpeed} min={0} max={2} step={0.05} onChange={(v) => set('outerRingSpeed', v)} fmt={fmtX} />
            <Slider label="Camera zoom" value={props.cameraZoom} min={0} max={1.5} step={0.05} onChange={(v) => set('cameraZoom', v)} fmt={fmtX} />
            <Slider label="Impact strength" value={props.impactStrength} min={0} max={1.5} step={0.05} onChange={(v) => set('impactStrength', v)} fmt={fmtX} />
            <p className="hint">Spin speed compresses every spin toward its impact frame, so impacts stay on time and rotations stay aligned. Rings always lock to their rest pose at 11.57 s.</p>
          </Section>

          <Section title="Visual">
            <Slider label="Blue intensity" value={props.blueIntensity} min={0} max={1.5} step={0.05} onChange={(v) => set('blueIntensity', v)} fmt={fmtX} />
            <Slider label="Red intensity" value={props.redIntensity} min={0} max={1.5} step={0.05} onChange={(v) => set('redIntensity', v)} fmt={fmtX} />
            <Toggle label="Inverted blue panels (classic trend negative)" checked={props.invertBluePanels} onChange={(v) => set('invertBluePanels', v)} />
            <Slider label="Glow" value={props.glow} min={0} max={2} step={0.05} onChange={(v) => set('glow', v)} fmt={fmtX} />
            <Slider label="Ring thickness" value={props.ringThickness} min={0.4} max={2.5} step={0.05} onChange={(v) => set('ringThickness', v)} fmt={fmtX} />
            <Slider label="Ring density" value={props.ringDensity} min={0.4} max={1} step={0.05} onChange={(v) => set('ringDensity', v)} fmt={fmtX} />
            <Slider label="Tick density" value={props.tickDensity} min={0.5} max={2} step={0.05} onChange={(v) => set('tickDensity', v)} fmt={fmtX} />
            <Slider label="Contrast" value={props.contrast} min={0.6} max={1.5} step={0.01} onChange={(v) => set('contrast', v)} fmt={fmtX} />
            <Slider label="Brightness" value={props.brightness} min={0.6} max={1.5} step={0.01} onChange={(v) => set('brightness', v)} fmt={fmtX} />
            <Slider label="Chromatic aberration" value={props.chromaticAberration} min={0} max={1.5} step={0.05} onChange={(v) => set('chromaticAberration', v)} fmt={fmtX} />
            <Slider label="Background opacity" value={props.backgroundOpacity} min={0} max={1} step={0.01} onChange={(v) => set('backgroundOpacity', v)} />
            <Slider label="Impact flashes" value={props.flashIntensity} min={0} max={1.5} step={0.05} onChange={(v) => set('flashIntensity', v)} fmt={fmtX} />
            <Toggle label="Reduced flashes (photosensitivity)" checked={props.reducedFlash} onChange={(v) => set('reducedFlash', v)} />
            <Slider label="Camera shake" value={props.shakeIntensity} min={0} max={1.5} step={0.05} onChange={(v) => set('shakeIntensity', v)} fmt={fmtX} />
            <Toggle label="Palette guard (no purple from red↔blue blur)" checked={props.paletteGuard} onChange={(v) => set('paletteGuard', v)} />
          </Section>

          <Section title="Colours">
            <div className="swatches">
              {(Object.keys(PALETTE_LABELS) as Array<keyof Palette>).map((k) => (
                <label key={k} className="swatch">
                  <input type="color" value={props.palette[k]} onChange={(e) => setPalette(k, e.target.value)} />
                  <span>{PALETTE_LABELS[k]}</span>
                  <code>{props.palette[k].toUpperCase()}</code>
                </label>
              ))}
            </div>
            <p className="hint">The official logo keeps its own colours — the palette only drives the panels, rings and effects.</p>
            <button className="btn small" onClick={() => set('palette', DEFAULT_PALETTE)}>
              Reset colours
            </button>
          </Section>

          <Section title="REAL branding">
            <div className="row">
              <span className="lbl">Logo</span>
              <span className="src">{props.brand.logo === DEFAULT_BRAND.logo ? 'Official REAL symbol (projectreal.gg)' : srcLabel(props.brand.logo)}</span>
            </div>
            <div className="btns">
              <FilePick label="Upload official logo file" accept="image/png,image/svg+xml,image/webp" onFile={(f) => doUpload(f, (u) => setBrand({logo: u}))} />
              {props.brand.logo !== DEFAULT_BRAND.logo ? (
                <button className="btn" onClick={() => setBrand({logo: DEFAULT_BRAND.logo})}>
                  Use built-in official symbol
                </button>
              ) : null}
            </div>
            <Select
              label="Logo style"
              value={props.brand.logoStyle}
              options={[
                ['app-icon', 'App icon (official lockup)'],
                ['symbol', 'White symbol'],
              ]}
              onChange={(v) => setBrand({logoStyle: v as BrandSettings['logoStyle']})}
            />
            <Slider label="Logo scale" value={props.brand.logoScale} min={0.7} max={1.3} step={0.01} onChange={(v) => setBrand({logoScale: v})} fmt={fmtX} />
            <Slider label="Logo X" value={props.brand.logoX} min={-200} max={200} step={1} onChange={(v) => setBrand({logoX: v})} fmt={(v) => `${v}px`} />
            <Slider label="Logo Y" value={props.brand.logoY} min={-400} max={400} step={1} onChange={(v) => setBrand({logoY: v})} fmt={(v) => `${v}px`} />
            <label className="row">
              <span className="lbl">Wordmark</span>
              <input className="text" value={props.brand.wordmark} maxLength={16} onChange={(e) => setBrand({wordmark: e.target.value})} />
            </label>
            <Slider label="Wordmark size" value={props.brand.wordmarkSize} min={0.7} max={1.3} step={0.01} onChange={(v) => setBrand({wordmarkSize: v})} fmt={fmtX} />
            <Toggle label='Show "EXECUTOR"' checked={props.brand.showSecondary} onChange={(v) => setBrand({showSecondary: v})} />
            <Toggle label='Show "PROJECT REAL"' checked={props.brand.showProjectReal} onChange={(v) => setBrand({showProjectReal: v})} />
            <Toggle label="Show projectreal.gg" checked={props.brand.showWebsite} onChange={(v) => setBrand({showWebsite: v})} />
            <Toggle label="Show discord.gg/projectreal" checked={props.brand.showDiscord} onChange={(v) => setBrand({showDiscord: v})} />
          </Section>

          <Section title="Artwork (4-panel)">
            <div className="tabs">
              {props.scenes.map((s, i) => (
                <button key={s.id} className={`tab ${i === sceneTab ? 'on' : ''}`} onClick={() => setSceneTab(i)} title={s.label}>
                  {s.id}
                </button>
              ))}
            </div>
            <div className="scene">
              <div className="row">
                <span className="lbl">{scene.label}</span>
              </div>
              <Select
                label="Artwork"
                value={BUILTIN_ART.some((b) => b.src === scene.art) ? scene.art : '__custom'}
                options={[...BUILTIN_ART.map((b) => [b.src, b.label] as [string, string]), ...(BUILTIN_ART.some((b) => b.src === scene.art) ? [] : ([['__custom', srcLabel(scene.art)]] as Array<[string, string]>))]}
                onChange={(v) => v !== '__custom' && setScene(sceneTab, {art: v})}
              />
              <div className="btns">
                <FilePick label="Upload artwork" accept="image/*" onFile={(f) => doUpload(f, (u) => setScene(sceneTab, {art: u}))} />
                <button className="btn" onClick={() => setScene(sceneTab, DEFAULT_PROPS.scenes[sceneTab])}>
                  Reset scene
                </button>
              </div>
              <Select
                label="Layout"
                value={scene.layout}
                options={[
                  ['split', 'Split across the 4 panels'],
                  ['quad', 'Repeat in every panel'],
                ]}
                onChange={(v) => setScene(sceneTab, {layout: v as SceneConfig['layout']})}
              />
              <Select
                label="Treatment"
                value={scene.treatment}
                options={[
                  ['duotone', 'Blue / red duotone'],
                  ['mono', 'Single-colour mark'],
                ]}
                onChange={(v) => setScene(sceneTab, {treatment: v as SceneConfig['treatment']})}
              />
              <Select
                label="Fit"
                value={scene.fit}
                options={[
                  ['contain', 'Contain'],
                  ['cover', 'Cover'],
                ]}
                onChange={(v) => setScene(sceneTab, {fit: v as SceneConfig['fit']})}
              />
              <Select
                label="Blend"
                value={scene.blend}
                options={[
                  ['normal', 'Normal'],
                  ['screen', 'Screen (light only)'],
                ]}
                onChange={(v) => setScene(sceneTab, {blend: v as SceneConfig['blend']})}
              />
              <Slider label="Opacity" value={scene.artOpacity} min={0} max={1} step={0.01} onChange={(v) => setScene(sceneTab, {artOpacity: v})} />
              <Slider label="Scale" value={scene.artScale} min={0.2} max={2} step={0.01} onChange={(v) => setScene(sceneTab, {artScale: v})} fmt={fmtX} />
              <Slider label="Offset X" value={scene.artX} min={-600} max={600} step={1} onChange={(v) => setScene(sceneTab, {artX: v})} fmt={(v) => `${v}px`} />
              <Slider label="Offset Y" value={scene.artY} min={-600} max={600} step={1} onChange={(v) => setScene(sceneTab, {artY: v})} fmt={(v) => `${v}px`} />
              <Slider label="Light rays" value={scene.rays.count} min={0} max={24} step={1} onChange={(v) => setScene(sceneTab, {rays: {...scene.rays, count: v}})} fmt={(v) => String(v)} />
              <Slider label="Ray spin" value={scene.rays.spin} min={-30} max={30} step={1} onChange={(v) => setScene(sceneTab, {rays: {...scene.rays, spin: v}})} fmt={(v) => `${v}°/s`} />
              <h4>Per-panel artwork</h4>
              {scene.panels.map((p, q) => (
                <div className="row panel-slot" key={q}>
                  <span className="lbl">{PANEL_NAMES[q]}</span>
                  <span className="src">{p ? srcLabel(p) : '—'}</span>
                  <FilePick
                    small
                    label="Upload"
                    accept="image/*"
                    onFile={(f) =>
                      doUpload(f, (u) => {
                        const panels = [...scene.panels] as SceneConfig['panels'];
                        panels[q] = u;
                        setScene(sceneTab, {panels});
                      })
                    }
                  />
                  {p ? (
                    <button
                      className="btn small"
                      onClick={() => {
                        const panels = [...scene.panels] as SceneConfig['panels'];
                        panels[q] = null;
                        setScene(sceneTab, {panels});
                      }}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Audio (optional)">
            <p className="hint">
              Silent by default. Import music you own or have licensed (MP3 / WAV / M4A). Beats are detected and impacts snap to them.
            </p>
            <div className="btns">
              <FilePick label="Import audio" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a" onFile={onAudio} />
              {props.audio.src ? (
                <button
                  className="btn"
                  onClick={() => {
                    setAudio({src: null, enabled: false, beats: null});
                    setAudioInfo('');
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>
            {audioInfo ? <div className="hint">{audioInfo}</div> : props.audio.src ? <div className="hint">{srcLabel(props.audio.src)}</div> : null}
            <Toggle label="Audio enabled" checked={props.audio.enabled} disabled={!props.audio.src} onChange={(v) => setAudio({enabled: v})} />
            <Toggle label="Beat-sync impacts" checked={props.audio.beatSync} disabled={!props.audio.src || !props.audio.beats} onChange={(v) => setAudio({beatSync: v})} />
            <Slider label="Song start (s)" value={props.audio.startOffset} min={0} max={180} step={0.05} onChange={(v) => setAudio({startOffset: v})} fmt={(v) => `${v.toFixed(2)} s`} />
            <Slider label="Volume" value={props.audio.volume} min={0} max={1} step={0.01} onChange={(v) => setAudio({volume: v})} />
          </Section>

          <Section title="Export MP4" open>
            {serverUp === false ? (
              <p className="warn">
                Export needs the render server: run <code>npm run preview</code> and open the URL it prints.
              </p>
            ) : null}
            {localOnly ? <p className="warn">Some files were loaded locally only (server upload failed) — they preview fine but can't be exported.</p> : null}
            <label className="row">
              <span className="lbl">File name</span>
              <input className="text" value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </label>
            <Select
              label="Quality (CRF)"
              value={String(crf)}
              options={[
                ['12', '12 · near-lossless (large)'],
                ['16', '16 · high (default)'],
                ['20', '20 · smaller file'],
              ]}
              onChange={(v) => setCrf(Number(v))}
            />
            <p className="hint">1080×1920 · 60 fps · 900 frames · H.264 yuv420p · rendered offline frame-by-frame.</p>
            <div className="btns">
              <button className="btn primary" disabled={exportBlocked} onClick={() => startExport('silent')}>
                Render MP4 (no audio)
              </button>
              <button className="btn primary" disabled={exportBlocked || !audioReady} onClick={() => startExport('music')} title={audioReady ? '' : 'Import + enable an audio track first'}>
                Render MP4 with music
              </button>
            </div>
            {jobs.map((j) => (
              <div className="job" key={j.id}>
                <div className="job-head">
                  <b>{j.mode === 'music' ? 'With music' : 'No audio'}</b>
                  <span>
                    {j.stage}
                    {j.renderedFrames !== undefined && j.stage === 'rendering' ? ` · ${j.renderedFrames}/${DURATION_FRAMES} frames` : ''}
                  </span>
                  {!['done', 'error', 'cancelled'].includes(j.stage) ? (
                    <button className="btn small" onClick={() => fetch(`/api/render/${j.id}/cancel`, {method: 'POST'})}>
                      cancel
                    </button>
                  ) : null}
                </div>
                <div className="bar">
                  <div style={{width: `${Math.round(j.progress * 100)}%`}} />
                </div>
                {j.url ? (
                  <a className="btn small" href={`${j.url}?download=1`}>
                    Download {decodeURIComponent(j.url.split('/').pop() ?? '')}
                  </a>
                ) : null}
                {j.error ? <div className="warn">{j.error}</div> : null}
              </div>
            ))}
          </Section>
        </aside>
      </main>
    </div>
  );
};
