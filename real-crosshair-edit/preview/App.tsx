import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Player, type PlayerRef} from '@remotion/player';
import {CrosshairEdit} from '../src/CrosshairEdit';
import {
  DEFAULT_PALETTE,
  DEFAULT_PROPS,
  DURATION_FRAMES,
  FPS,
  HEIGHT,
  WIDTH,
  isPlaceholder,
  type EditProps,
  type Palette,
  type SceneConfig,
} from '../src/config';
import {SECTIONS} from '../src/engine/timeline';
import type {FrameInfo} from '../src/engine/render';
import {analyzeInBrowser} from '../src/audio/beats';

const STORAGE_KEY = 'real-crosshair-props-v1';
const PANEL_NAMES = ['Top left (blue)', 'Top right (red)', 'Bottom left (red)', 'Bottom right (blue)'];

const loadSaved = (): EditProps => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROPS;
    const p = JSON.parse(raw) as Partial<EditProps>;
    return {
      ...DEFAULT_PROPS,
      ...p,
      palette: {...DEFAULT_PALETTE, ...(p.palette ?? {})},
      audio: {...DEFAULT_PROPS.audio, ...(p.audio ?? {})},
      // blob: URLs die with the tab – fall back to defaults for those
      scenes: (p.scenes ?? DEFAULT_PROPS.scenes).map((s) => ({
        ...s,
        art: s.art.startsWith('blob:') ? DEFAULT_PROPS.scenes.find((d) => d.id === s.id)!.art : s.art,
        panels: s.panels.map((x) => (x && x.startsWith('blob:') ? null : x)) as SceneConfig['panels'],
      })),
    };
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
    // preview-only fallback (export needs the render server)
    return {url: URL.createObjectURL(file), serverSide: false};
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

const Toggle: React.FC<{label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean}> = ({
  label,
  checked,
  onChange,
  disabled,
}) => (
  <label className={`row toggle ${disabled ? 'disabled' : ''}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
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

const Section: React.FC<{title: string; children: React.ReactNode; open?: boolean}> = ({title, children, open = true}) => (
  <details className="section" open={open}>
    <summary>{title}</summary>
    <div className="section-body">{children}</div>
  </details>
);

const srcLabel = (src: string | null) => {
  if (!src) return 'none';
  if (isPlaceholder(src)) return `${src} (PLACEHOLDER)`;
  return decodeURIComponent(src.split('/').pop() ?? src);
};

type Job = {
  id: string;
  mode: 'silent' | 'music';
  stage: string;
  progress: number;
  renderedFrames?: number;
  url?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
export const App: React.FC = () => {
  const [props, setProps] = useState<EditProps>(loadSaved);
  const [draft, setDraft] = useState(false);
  const [loop, setLoop] = useState(true);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sceneTab, setSceneTab] = useState(0);
  const [audioInfo, setAudioInfo] = useState<string>('');
  const [localOnly, setLocalOnly] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [serverUp, setServerUp] = useState<boolean | null>(null);
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

  // player events
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

  // keyboard: space play/pause, ←/→ frame step (shift = 10)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
      const p = playerRef.current;
      if (!p) return;
      if (e.code === 'Space') {
        e.preventDefault();
        p.toggle();
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault();
        const d = (e.code === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1);
        p.pause();
        p.seekTo(Math.min(DURATION_FRAMES - 1, Math.max(0, p.getCurrentFrame() + d)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onFrameInfo = useCallback((info: FrameInfo) => {
    const el = infoRef.current;
    if (el) {
      const st = info.state;
      el.textContent = `angle ${st.camera.angle.toFixed(1)}° · ω ${(st.omega * FPS).toFixed(0)}°/s · zoom ${st.camera.scale.toFixed(3)} · blur sub-frames ${info.samples}${info.ca ? ' · CA' : ''}${st.flash > 0.01 ? ` · flash ${st.flash.toFixed(2)}` : ''} · scene ${st.scene}`;
    }
  }, []);

  const inputProps = useMemo(
    () => ({...props, previewMaxSamples: draft ? 6 : undefined, onFrameInfo}),
    [props, draft, onFrameInfo],
  );

  const set = <K extends keyof EditProps>(k: K, v: EditProps[K]) => setProps((p) => ({...p, [k]: v}));
  const setPalette = (k: keyof Palette, v: string) => setProps((p) => ({...p, palette: {...p.palette, [k]: v}}));
  const setAudio = (patch: Partial<EditProps['audio']>) => setProps((p) => ({...p, audio: {...p.audio, ...patch}}));
  const setScene = (idx: number, patch: Partial<SceneConfig>) =>
    setProps((p) => ({...p, scenes: p.scenes.map((s, i) => (i === idx ? {...s, ...patch} : s))}));

  const step = (d: number) => {
    const p = playerRef.current;
    if (!p) return;
    p.pause();
    p.seekTo(Math.min(DURATION_FRAMES - 1, Math.max(0, p.getCurrentFrame() + d)));
  };

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
        ? `${file.name}: ${analysis.duration.toFixed(1)} s · ~${analysis.bpm.toFixed(1)} BPM · ${analysis.beats.length} beats detected`
        : `${file.name}: loaded (beat analysis failed – sync disabled)`,
    );
  };

  const startExport = async (mode: 'silent' | 'music') => {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({mode, props}),
    });
    if (!res.ok) {
      alert(`Export failed: ${await res.text()}`);
      return;
    }
    const {id} = (await res.json()) as {id: string};
    const job: Job = {id, mode, stage: 'queued', progress: 0};
    setJobs((j) => [job, ...j]);
    const es = new EventSource(`/api/render/${id}/events`);
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as Partial<Job>;
      setJobs((all) => all.map((x) => (x.id === id ? {...x, ...data} : x)));
      if (data.stage === 'done' || data.stage === 'error' || data.stage === 'cancelled') es.close();
    };
    es.onerror = () => es.close();
  };

  const cancelJob = (id: string) => fetch(`/api/render/${id}/cancel`, {method: 'POST'});

  const downloadProps = () => {
    const blob = new Blob([JSON.stringify(props, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'real-crosshair-props.json';
    a.click();
  };

  const scene = props.scenes[sceneTab];
  const time = (frame / FPS).toFixed(2);
  const audioReady = Boolean(props.audio.src) && props.audio.enabled;
  const exportBlocked = serverUp === false || localOnly;

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="dot blue" />
          <span className="dot red" />
          <b>REAL</b> spinning crosshair edit
        </div>
        <div className="meta">
          {WIDTH}×{HEIGHT} · {FPS} fps · {DURATION_FRAMES} frames · H.264
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
            <button className="btn icon" title="Start" onClick={() => playerRef.current?.seekTo(0)}>
              ⏮
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
            <button className="btn icon" title="End" onClick={() => playerRef.current?.seekTo(DURATION_FRAMES - 1)}>
              ⏭
            </button>
            <span className="tc">
              f {String(frame).padStart(3, '0')} / {DURATION_FRAMES - 1} · {time}s
            </span>
            <Toggle label="loop" checked={loop} onChange={setLoop} />
            <Toggle label="draft blur" checked={draft} onChange={setDraft} />
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
          {draft ? <div className="note">Draft blur caps motion blur at 6 sub-frames for smooth playback. Exports always use full quality.</div> : null}
        </section>

        <aside className="panel">
          <Section title="Motion">
            <Slider label="Spin speed" value={props.spinSpeed} min={0.8} max={1.6} step={0.05} onChange={(v) => set('spinSpeed', v)} fmt={(v) => `${v.toFixed(2)}×`} />
            <Slider label="Motion blur" value={props.motionBlur} min={0} max={2} step={0.05} onChange={(v) => set('motionBlur', v)} />
            <Slider label="Max blur sub-frames" value={props.maxBlurSamples} min={4} max={64} step={1} onChange={(v) => set('maxBlurSamples', v)} fmt={(v) => String(v)} />
            <p className="hint">Spin speed compresses every spin toward its impact frame — impacts stay on time, rotations stay perfectly aligned.</p>
          </Section>

          <Section title="Effects">
            <Slider label="Impact flashes" value={props.flashIntensity} min={0} max={1.5} step={0.05} onChange={(v) => set('flashIntensity', v)} />
            <Slider label="Camera shake" value={props.shakeIntensity} min={0} max={1.5} step={0.05} onChange={(v) => set('shakeIntensity', v)} />
            <Slider label="Chromatic aberration" value={props.chromaticAberration} min={0} max={1.5} step={0.05} onChange={(v) => set('chromaticAberration', v)} />
            <Toggle label="Palette guard (keep blur strictly blue/red, no purple)" checked={props.paletteGuard} onChange={(v) => set('paletteGuard', v)} />
          </Section>

          <Section title="Colours">
            <div className="swatches">
              <div>
                <h4>Blue · inverted panels</h4>
                {(['blue', 'electric', 'lightBlue', 'white'] as const).map((k) => (
                  <label key={k} className="swatch">
                    <input type="color" value={props.palette[k]} onChange={(e) => setPalette(k, e.target.value)} />
                    <span>{k}</span>
                    <code>{props.palette[k].toUpperCase()}</code>
                  </label>
                ))}
              </div>
              <div>
                <h4>Red · normal panels</h4>
                {(['red', 'deepRed', 'brightRed', 'black'] as const).map((k) => (
                  <label key={k} className="swatch">
                    <input type="color" value={props.palette[k]} onChange={(e) => setPalette(k, e.target.value)} />
                    <span>{k}</span>
                    <code>{props.palette[k].toUpperCase()}</code>
                  </label>
                ))}
              </div>
            </div>
            <button className="btn small" onClick={() => set('palette', DEFAULT_PALETTE)}>
              Reset colours
            </button>
          </Section>

          <Section title="REAL branding">
            <div className="row">
              <span className="lbl">Logo</span>
              <span className="src">{props.logo ? srcLabel(props.logo) : 'none (wordmark text only)'}</span>
            </div>
            <div className="btns">
              <FilePick label="Upload REAL logo" accept="image/png,image/svg+xml,image/webp,image/jpeg" onFile={(f) => doUpload(f, (u) => set('logo', u))} />
              {props.logo ? (
                <button className="btn" onClick={() => set('logo', null)}>
                  Remove
                </button>
              ) : null}
            </div>
            <Toggle label="Show 'placeholder art' labels in the video" checked={props.showPlaceholderLabels} onChange={(v) => set('showPlaceholderLabels', v)} />
            <p className="hint">The built-in artwork is placeholder art made for this project — swap it for official REAL logos / screenshots below.</p>
          </Section>

          <Section title="Artwork (4-panel)">
            <div className="tabs">
              {props.scenes.map((s, i) => (
                <button key={s.id} className={`tab ${i === sceneTab ? 'on' : ''}`} onClick={() => setSceneTab(i)}>
                  {s.id}
                </button>
              ))}
            </div>
            <div className="scene">
              <div className="row">
                <span className="lbl">{scene.label}</span>
                <span className={`badge ${isPlaceholder(scene.art) ? 'ph' : 'ok'}`}>{isPlaceholder(scene.art) ? 'placeholder' : 'custom'}</span>
              </div>
              <div className="row">
                <span className="lbl">Art</span>
                <span className="src">{srcLabel(scene.art)}</span>
              </div>
              <div className="btns">
                <FilePick label="Replace artwork" accept="image/*" onFile={(f) => doUpload(f, (u) => setScene(sceneTab, {art: u}))} />
                <button className="btn" onClick={() => setScene(sceneTab, {art: DEFAULT_PROPS.scenes[sceneTab].art, artScale: 1, artX: 0, artY: 0})}>
                  Reset
                </button>
              </div>
              <label className="row">
                <span className="lbl">Layout</span>
                <select value={scene.layout} onChange={(e) => setScene(sceneTab, {layout: e.target.value as SceneConfig['layout']})}>
                  <option value="split">split across the 4 panels</option>
                  <option value="quad">repeat in every panel</option>
                </select>
              </label>
              <label className="row">
                <span className="lbl">Fit</span>
                <select value={scene.fit} onChange={(e) => setScene(sceneTab, {fit: e.target.value as SceneConfig['fit']})}>
                  <option value="contain">contain</option>
                  <option value="cover">cover</option>
                </select>
              </label>
              <label className="row">
                <span className="lbl">Blend</span>
                <select value={scene.blend} onChange={(e) => setScene(sceneTab, {blend: e.target.value as SceneConfig['blend']})}>
                  <option value="normal">normal (art covers rays)</option>
                  <option value="lighten">lighten (dark areas show rays)</option>
                </select>
              </label>
              <Slider label="Scale" value={scene.artScale} min={0.3} max={2} step={0.01} onChange={(v) => setScene(sceneTab, {artScale: v})} />
              <Slider label="Offset X" value={scene.artX} min={-600} max={600} step={1} onChange={(v) => setScene(sceneTab, {artX: v})} fmt={(v) => `${v}px`} />
              <Slider label="Offset Y" value={scene.artY} min={-600} max={600} step={1} onChange={(v) => setScene(sceneTab, {artY: v})} fmt={(v) => `${v}px`} />
              <Slider label="Rays" value={scene.rays.count} min={0} max={24} step={1} onChange={(v) => setScene(sceneTab, {rays: {...scene.rays, count: v}})} fmt={(v) => String(v)} />
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
              Silent by default. To sync to <b>Montagem Mythical</b>, import a copy you legally own (MP3 / WAV / M4A). Beats are detected and impacts snap to them.
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

          <Section title="Export MP4">
            {serverUp === false ? <p className="warn">Export needs the render server: run <code>npm run preview</code> and open the URL it prints.</p> : null}
            {localOnly ? <p className="warn">Some files were loaded locally only (server upload failed) — they preview fine but can't be exported.</p> : null}
            <div className="btns">
              <button className="btn primary" disabled={exportBlocked} onClick={() => startExport('silent')}>
                Render silent MP4
              </button>
              <button className="btn primary" disabled={exportBlocked || !audioReady} onClick={() => startExport('music')} title={audioReady ? '' : 'Import + enable an audio track first'}>
                Render MP4 with music
              </button>
            </div>
            <button className="btn small" onClick={downloadProps}>
              Download props JSON (for <code>npm run render -- --props</code>)
            </button>
            {jobs.map((j) => (
              <div className="job" key={j.id}>
                <div className="job-head">
                  <b>{j.mode === 'music' ? 'With music' : 'Silent'}</b>
                  <span>
                    {j.stage}
                    {j.renderedFrames !== undefined && j.stage === 'rendering' ? ` · ${j.renderedFrames}/${DURATION_FRAMES} frames` : ''}
                  </span>
                  {j.stage !== 'done' && j.stage !== 'error' && j.stage !== 'cancelled' ? (
                    <button className="btn small" onClick={() => cancelJob(j.id)}>
                      cancel
                    </button>
                  ) : null}
                </div>
                <div className="bar">
                  <div style={{width: `${Math.round(j.progress * 100)}%`}} />
                </div>
                {j.url ? (
                  <a className="btn small" href={`${j.url}?download=1`}>
                    Download {j.url.split('/').pop()}
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
