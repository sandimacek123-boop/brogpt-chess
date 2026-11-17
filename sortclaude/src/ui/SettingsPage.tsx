import { useState } from 'react';
import { useApp, type UserPreset, type DeepPartial } from '../state/store';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, SHORTCUT_LABELS, SETTINGS_VERSION, sanitize, type Settings } from '../state/settings';
import { Icon, Select, Slider, Toggle, Segmented, Modal, saveBlob, pickFile } from './components';
import { cssGradient, paletteStops } from '../render/palettes';
import { METRIC_DEFINITIONS } from '../engine/ops';
import { ALGORITHMS } from '../engine/registry';

/** Built-in preset library (Preset Studio). Each stores a complete visual configuration. */
export const BUILTIN_PRESETS: UserPreset[] = [
  { id: 'b-classic', name: 'Classic Rainbow Bars', builtin: true, created: 0, description: 'The timeless look: value-coloured bars.', data: { appearance: { viz: 'bars', palette: 'classic-rainbow', colorMode: 'value', background: 'math-grid', glow: 0.35, spacing: 0.15 }, sorting: { speed: 1 }, audio: { instrument: 'triangle', scale: 'pentatonic' } } },
  { id: 'b-cyber', name: 'Cyberpunk Wheel', builtin: true, created: 0, description: 'Neon colour wheel with grid backdrop.', data: { appearance: { viz: 'wheel', palette: 'cyberpunk', background: 'grid', glow: 0.6 }, sorting: { speed: 2 }, audio: { instrument: 'pulse', scale: 'minor' } } },
  { id: 'b-neon', name: 'Neon Spiral', builtin: true, created: 0, description: 'Glowing spiral over a starfield.', data: { appearance: { viz: 'spiral', palette: 'neon-rainbow', background: 'starfield', glow: 0.7, pointSize: 1.4 }, sorting: { speed: 2 }, audio: { instrument: 'chime', scale: 'pentatonic' } } },
  { id: 'b-galaxy', name: 'Galaxy Particles', builtin: true, created: 0, description: '3D particle galaxy with bloom.', data: { appearance: { viz: 'galaxy', palette: 'galaxy', glow: 0.8 }, three: { bloom: 1.2, autoRotate: true, rotateSpeed: 0.5, particleSize: 1.2 }, audio: { instrument: 'pad', scale: 'whole-tone' } } },
  { id: 'b-minimal', name: 'Mathematical Minimalism', builtin: true, created: 0, description: 'Monochrome scatter, no glow, pure data.', data: { appearance: { viz: 'scatter', palette: 'monochrome', background: 'solid', glow: 0, pointSize: 1.4 }, audio: { instrument: 'sine', scale: 'major' } } },
  { id: 'b-aurora', name: 'Aurora Ring', builtin: true, created: 0, description: 'Aurora palette on a ring.', data: { appearance: { viz: 'ring', palette: 'aurora', background: 'particles', glow: 0.55 }, audio: { instrument: 'bell', scale: 'pentatonic' } } },
  { id: 'b-golden', name: 'Golden Sunburst', builtin: true, created: 0, description: 'Warm golden radial wedges.', data: { appearance: { viz: 'sunburst', palette: 'golden', background: 'gradient', bgColor1: '#0a0703', bgColor2: '#1e1306', glow: 0.5 }, audio: { instrument: 'marimba', scale: 'major' } } },
  { id: 'b-ocean', name: 'Ocean Waves', builtin: true, created: 0, description: 'Smooth wave in ocean blues.', data: { appearance: { viz: 'wave', palette: 'ocean', background: 'gradient', bgColor1: '#02060f', bgColor2: '#04162b', glow: 0.5, smoothing: 0.8 }, audio: { instrument: 'pad', scale: 'minor' } } },
  { id: 'b-spectrum', name: 'Dark Spectrum', builtin: true, created: 0, description: 'Mirrored analyser bars.', data: { appearance: { viz: 'spectrum', palette: 'electric-blue', background: 'solid', bgColor1: '#030308', glow: 0.6 }, audio: { instrument: 'square', scale: 'blues' } } },
  { id: 'b-helix', name: '3D Helix Cinema', builtin: true, created: 0, description: 'Double helix with cinematic grading.', data: { appearance: { viz: 'helix', palette: 'pink-purple', glow: 0.7 }, three: { bloom: 1, autoRotate: true, cameraPreset: 'iso' }, cinematic: { grading: 'teal-orange', vignette: 0.5 }, audio: { instrument: 'piano', scale: 'major' } } },
];

/** Fields captured by "save preset": visual config, effects, camera, elements, audio, speed. */
export function capturePreset(s: Settings): DeepPartial<Settings> {
  const { bgImage, ...appearance } = s.appearance;
  void bgImage;
  return { appearance, three: s.three, cinematic: s.cinematic, audio: s.audio, sorting: { speed: s.sorting.speed, speedMode: s.sorting.speedMode } };
}

const PRESET_FILE = 'sortclaude-preset';

export function SettingsPage() {
  const [tab, setTab] = useState<'general' | 'presets' | 'performance' | 'shortcuts' | 'export' | 'about'>('general');
  return (
    <div className="page-scroll">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Preferences are saved automatically on this device. Web and desktop share the same versioned configuration format.</p>
        </div>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'general', label: 'General' }, { value: 'presets', label: 'Preset Studio' }, { value: 'performance', label: 'Performance' }, { value: 'shortcuts', label: 'Shortcuts' }, { value: 'export', label: 'Export' }, { value: 'about', label: 'About' }]} />
      </div>
      {tab === 'general' && <General />}
      {tab === 'presets' && <Presets />}
      {tab === 'performance' && <Performance />}
      {tab === 'shortcuts' && <Shortcuts />}
      {tab === 'export' && <ExportDefaults />}
      {tab === 'about' && <About />}
    </div>
  );
}

function General() {
  const g = useApp((s) => s.settings.general);
  const c = useApp((s) => s.settings.cinematic);
  const update = useApp((s) => s.update);
  const replace = useApp((s) => s.replaceSettings);
  const reset = useApp((s) => s.resetSettings);
  const toast = useApp((s) => s.toast);
  const settings = useApp((s) => s.settings);
  const [confirm, setConfirm] = useState(false);
  const minimal = () => {
    update('general', { reducedMotion: true, reducedFlashing: true });
    update('cinematic', { cameraMotion: false, grain: 0, particles: 0, completion: 'fade', backgroundAnimation: false });
    update('three', { autoRotate: false, trails: 0 });
    update('appearance', { glow: 0, colorMode: settings.appearance.colorMode === 'rainbow-rotation' ? 'value' : settings.appearance.colorMode });
    toast('Minimal-effects preset applied.', 'success');
  };
  return (
    <div className="cols-2">
      <div className="card stack">
        <h3>Interface</h3>
        <Slider label="UI scale" value={g.uiScale} min={0.75} max={2} step={0.05} onChange={(v) => update('general', { uiScale: v })} format={(v) => `${Math.round(v * 100)}%`} hint="Works together with Windows display scaling (100–200%)." />
        <Slider label="Sidebar width" value={g.sidebarWidth} min={260} max={520} step={10} onChange={(v) => update('general', { sidebarWidth: v })} format={(v) => `${v}px`} />
        <Select label="Default startup page" value={g.startupPage} onChange={(v) => update('general', { startupPage: v })} options={[{ value: 'visualizer', label: 'Visualizer' }, { value: 'battle', label: 'Battle' }, { value: 'lab', label: 'Algorithm Lab' }, { value: 'studio', label: 'Cinematic Studio' }, { value: 'benchmark', label: 'Benchmark' }, { value: 'settings', label: 'Settings' }]} />
        <Select label="Language" value={g.language} onChange={(v) => update('general', { language: v })} options={[{ value: 'en', label: 'English' }]} hint="All UI strings are centralised per component; English is the only translation shipped." />
        <Toggle label="Automatically restore last session" value={g.restoreSession} onChange={(v) => update('general', { restoreSession: v })} />
        <Toggle label="Auto-save preferences" value={g.autosave} onChange={(v) => update('general', { autosave: v })} />
        <Toggle label="Show tooltips" value={g.tooltips} onChange={(v) => update('general', { tooltips: v })} />
        <Toggle label="Show keyboard hints" value={g.keyboardHints} onChange={(v) => update('general', { keyboardHints: v })} />
      </div>
      <div className="card stack">
        <h3>Accessibility & motion</h3>
        <Toggle label="Reduced motion" value={g.reducedMotion} onChange={(v) => update('general', { reducedMotion: v })} hint="Disables camera drift, animated backgrounds, rotating colours and UI animations." />
        <Toggle label="Reduced flashing" value={g.reducedFlashing} onChange={(v) => update('general', { reducedFlashing: v })} hint="Caps the brightness of completion effects and disables grain/particle bursts." />
        <Toggle label="Camera motion (cinematic & 3D)" value={c.cameraMotion} onChange={(v) => update('cinematic', { cameraMotion: v })} />
        <Slider label="Cinematic particle density" value={c.particles} min={0} max={1} onChange={(v) => update('cinematic', { particles: v })} />
        <div className="row-wrap"><button className="btn" onClick={minimal}>Apply minimal-effects preset</button></div>
        <div className="hint">No effect in SortClaude strobes; completion effects fade over ≥ 0.6 s.</div>
        <h3 style={{ marginTop: 10 }}>Cinematic mode</h3>
        <Slider label="Intro duration" value={c.intro} min={0} max={10} step={0.1} onChange={(v) => update('cinematic', { intro: v })} format={(v) => `${v.toFixed(1)} s`} />
        <Slider label="Outro duration" value={c.outro} min={0} max={10} step={0.1} onChange={(v) => update('cinematic', { outro: v })} format={(v) => `${v.toFixed(1)} s`} />
        <Slider label="Camera movement speed" value={c.cameraSpeed} min={0} max={3} onChange={(v) => update('cinematic', { cameraSpeed: v })} />
        <Slider label="Cinematic zoom" value={c.zoom} min={1} max={2} onChange={(v) => update('cinematic', { zoom: v })} />
        <Slider label="Glow intensity" value={c.glow} min={0} max={1} onChange={(v) => update('cinematic', { glow: v })} />
        <Slider label="Light intensity" value={c.lightIntensity} min={0} max={2} onChange={(v) => update('cinematic', { lightIntensity: v })} />
        <Slider label="Motion trails" value={c.trails} min={0} max={0.95} onChange={(v) => update('cinematic', { trails: v })} />
        <Slider label="Background haze" value={c.backgroundBlur} min={0} max={20} onChange={(v) => update('cinematic', { backgroundBlur: v })} />
        <Slider label="Film grain" value={c.grain} min={0} max={1} onChange={(v) => update('cinematic', { grain: v })} />
        <Slider label="Vignette" value={c.vignette} min={0} max={1} onChange={(v) => update('cinematic', { vignette: v })} />
        <Toggle label="Background animation" value={c.backgroundAnimation} onChange={(v) => update('cinematic', { backgroundAnimation: v })} />
        <Select label="Color grading" value={c.grading} onChange={(v) => update('cinematic', { grading: v })} options={[{ value: 'none', label: 'None' }, { value: 'teal-orange', label: 'Teal & orange' }, { value: 'cool', label: 'Cool' }, { value: 'warm', label: 'Warm' }, { value: 'noir', label: 'Noir' }, { value: 'vivid', label: 'Vivid' }]} />
        <Select label="Transition style" value={c.transition} onChange={(v) => update('cinematic', { transition: v })} options={[{ value: 'fade', label: 'Fade' }, { value: 'zoom', label: 'Zoom' }, { value: 'slide', label: 'Slide' }, { value: 'sweep', label: 'Sweep' }]} />
        <Select label="Completion animation" value={c.completion} onChange={(v) => update('cinematic', { completion: v })} options={[{ value: 'rainbow-sweep', label: 'Rainbow sweep' }, { value: 'particle-burst', label: 'Gentle particle burst' }, { value: 'completion-wave', label: 'Glowing completion wave' }, { value: 'radial-pulse', label: 'Radial pulse' }, { value: 'cascade', label: 'Cascading color transition' }, { value: 'geometric', label: 'Soft geometric explosion' }, { value: 'fade', label: 'Smooth fade to result' }, { value: 'none', label: 'None' }]} />
        <Select label="Text animation" value={c.textAnimation} onChange={(v) => update('cinematic', { textAnimation: v })} options={[{ value: 'fade-up', label: 'Fade up' }, { value: 'typewriter', label: 'Typewriter' }, { value: 'tracking', label: 'Tracking' }, { value: 'none', label: 'None' }]} />
        <Toggle label="Show title" value={c.showTitle} onChange={(v) => update('cinematic', { showTitle: v })} />
        <Toggle label="Show counters" value={c.showCounters} onChange={(v) => update('cinematic', { showCounters: v })} />
      </div>
      <div className="card stack">
        <h3>Configuration files</h3>
        <div className="hint">Save your whole configuration to a file and load it on another device or in the desktop app (same format).</div>
        <div className="row-wrap">
          <button className="btn" onClick={() => saveBlob(new Blob([JSON.stringify({ format: 'sortclaude-config', ...settings }, null, 2)], { type: 'application/json' }), 'sortclaude-config.json')}>{Icon.save}Save configuration</button>
          <button className="btn" onClick={async () => {
            const f = await pickFile('.json,application/json');
            if (!f) return;
            try {
              if (f.size > 20_000_000) throw new Error('file too large');
              const d = JSON.parse(await f.text());
              if (d?.format !== 'sortclaude-config') throw new Error('not a SortClaude configuration file');
              if (typeof d.version === 'number' && d.version > SETTINGS_VERSION) throw new Error(`file is from a newer version (v${d.version})`);
              replace(d);
              toast('Configuration loaded and validated.', 'success');
            } catch (e) {
              toast(`Could not load: ${(e as Error).message}`, 'error');
            }
          }}>{Icon.open}Load configuration</button>
        </div>
        <button className="btn danger" onClick={() => setConfirm(true)}>Restore factory settings</button>
      </div>
      {confirm && (
        <Modal title="Restore factory settings?" onClose={() => setConfirm(false)}>
          <p className="muted">All preferences return to their defaults. Saved presets and custom algorithms are kept.</p>
          <div className="row-wrap"><button className="btn danger" onClick={() => { reset(); setConfirm(false); toast('Factory settings restored.', 'success'); }}>Restore</button><button className="btn" onClick={() => setConfirm(false)}>Cancel</button></div>
        </Modal>
      )}
    </div>
  );
}

function PresetCard({ p, onApply, onPreview, actions }: { p: UserPreset; onApply: () => void; onPreview: () => void; actions?: React.ReactNode }) {
  const ap = (p.data.appearance ?? {}) as Partial<Settings['appearance']>;
  const stops = paletteStops(ap.palette ?? 'classic-rainbow', (ap.customGradient as any) ?? []);
  return (
    <div className="card stack" style={{ padding: 12, gap: 8 }}>
      <div style={{ height: 46, borderRadius: 8, background: `${cssGradient(stops)}`, opacity: 0.9, position: 'relative' }}>
        <span className="tag" style={{ position: 'absolute', right: 6, bottom: 6, background: 'rgba(5,5,9,0.7)' }}>{ap.viz ?? '—'}</span>
      </div>
      <b>{p.name}</b>
      {p.description && <div className="hint">{p.description}</div>}
      <div className="row-wrap">
        <button className="btn primary" onClick={onApply}>Apply</button>
        <button className="btn" onMouseDown={onPreview} title="Hold to preview, release to revert">Hold to preview</button>
        {actions}
      </div>
    </div>
  );
}

function Presets() {
  const presets = useApp((s) => s.presets);
  const settings = useApp((s) => s.settings);
  const applyPreset = useApp((s) => s.applyPreset);
  const savePreset = useApp((s) => s.savePreset);
  const deletePreset = useApp((s) => s.deletePreset);
  const renamePreset = useApp((s) => s.renamePreset);
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState('My preset');
  const [renaming, setRenaming] = useState<string | null>(null);

  // preview = temporarily apply; release restores the previous settings
  const preview = (p: UserPreset) => {
    const before = useApp.getState().settings;
    applyPreset(p);
    const restore = () => {
      useApp.setState({ settings: before });
      window.removeEventListener('mouseup', restore);
    };
    window.addEventListener('mouseup', restore);
    useApp.getState().setPage('settings');
    toast('Previewing — the visualizer behind uses the preset while you hold the button.', 'info');
  };
  const apply = (p: UserPreset) => {
    applyPreset(p);
    toast(`Applied “${p.name}”.`, 'success');
  };
  const exportPreset = (p: UserPreset) => saveBlob(new Blob([JSON.stringify({ format: PRESET_FILE, version: SETTINGS_VERSION, name: p.name, description: p.description ?? '', data: p.data }, null, 2)], { type: 'application/json' }), `${p.name.replace(/[^\w-]+/g, '_')}.sortclaude-preset.json`);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card stack">
        <h3>Save current look</h3>
        <div className="row-wrap">
          <input className="input" style={{ width: 240 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Preset name" />
          <button className="btn primary" onClick={() => { savePreset({ id: `u-${Date.now()}`, name: name.slice(0, 80) || 'Preset', created: Date.now(), data: capturePreset(settings) }); toast('Preset saved.', 'success'); }}>{Icon.save}Save preset</button>
          <button className="btn" onClick={async () => {
            const f = await pickFile('.json,application/json');
            if (!f) return;
            try {
              if (f.size > 2_000_000) throw new Error('file too large');
              const d = JSON.parse(await f.text());
              if (d?.format !== PRESET_FILE || typeof d.data !== 'object') throw new Error('not a SortClaude preset');
              // validate by sanitizing a merge against defaults, then keep only known sections
              const clean = sanitize(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, ...d.data });
              const data: DeepPartial<Settings> = {};
              for (const k of ['appearance', 'three', 'cinematic', 'audio'] as const) if (d.data[k]) (data as any)[k] = clean[k];
              if (d.data.sorting) data.sorting = { speed: clean.sorting.speed, speedMode: clean.sorting.speedMode };
              savePreset({ id: `u-${Date.now()}`, name: String(d.name ?? 'Imported').slice(0, 80), description: String(d.description ?? '').slice(0, 200), created: Date.now(), data });
              toast('Preset imported and validated.', 'success');
            } catch (e) {
              toast(`Invalid preset: ${(e as Error).message}`, 'error');
            }
          }}>{Icon.open}Import preset</button>
        </div>
        <div className="hint">A preset stores the visualization type, palette and gradient, effects, background, element settings, 3D camera, cinematic settings, audio settings and playback speed — not the algorithm or dataset.</div>
      </div>
      {presets.length > 0 && (
        <>
          <h3 className="label" style={{ margin: 0 }}>Your presets</h3>
          <div className="cols-3">
            {presets.map((p) => (
              <PresetCard key={p.id} p={p} onApply={() => apply(p)} onPreview={() => preview(p)} actions={
                <>
                  {renaming === p.id ? (
                    <input className="input" autoFocus defaultValue={p.name} onBlur={(e) => { renamePreset(p.id, e.target.value || p.name); setRenaming(null); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Rename preset" />
                  ) : (
                    <button className="btn ghost" onClick={() => setRenaming(p.id)}>Rename</button>
                  )}
                  <button className="btn ghost" onClick={() => savePreset({ ...p, id: `u-${Date.now()}`, name: `${p.name} copy`, created: Date.now() })}>Duplicate</button>
                  <button className="btn ghost" onClick={() => exportPreset(p)}>Export</button>
                  <button className="btn ghost danger" onClick={() => deletePreset(p.id)}>Delete</button>
                </>
              } />
            ))}
          </div>
        </>
      )}
      <h3 className="label" style={{ margin: 0 }}>Preset library</h3>
      <div className="cols-3">
        {BUILTIN_PRESETS.map((p) => (
          <PresetCard key={p.id} p={p} onApply={() => apply(p)} onPreview={() => preview(p)} actions={<><button className="btn ghost" onClick={() => savePreset({ ...p, builtin: false, id: `u-${Date.now()}`, name: `${p.name} (mine)`, created: Date.now() })}>Duplicate</button><button className="btn ghost" onClick={() => exportPreset(p)}>Export</button></>} />
        ))}
      </div>
    </div>
  );
}

function Performance() {
  const p = useApp((s) => s.settings.performance);
  const update = useApp((s) => s.update);
  return (
    <div className="cols-2">
      <div className="card stack">
        <h3>Graphics</h3>
        <Segmented label="Quality" value={p.quality} onChange={(v) => update('performance', { quality: v })} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'ultra', label: 'Ultra' }, { value: 'auto', label: 'Automatic' }]} />
        <Toggle label="Adaptive quality (Automatic mode)" value={p.adaptive} onChange={(v) => update('performance', { adaptive: v })} hint="Lowers glow, grain and resolution when the measured frame rate drops. Never changes the sort." />
        <Slider label="Target FPS" value={p.targetFps} min={15} max={240} step={5} onChange={(v) => update('performance', { targetFps: v })} />
        <Slider label="Rendering resolution" value={p.renderScale} min={0.25} max={2} onChange={(v) => update('performance', { renderScale: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Particle limit (3D point-cloud switch)" value={p.particleLimit} min={100} max={200000} step={100} onChange={(v) => update('performance', { particleLimit: v })} />
      </div>
      <div className="card stack">
        <h3>Simulation</h3>
        <Slider label="Max operations per displayed frame" value={Math.log10(p.maxOpsPerFrame)} min={0} max={Math.log10(5_000_000)} step={0.01} onChange={(v) => update('performance', { maxOpsPerFrame: Math.round(Math.pow(10, v)) })} format={() => p.maxOpsPerFrame.toLocaleString()} hint="At high speed, many logical ops are folded into one frame. Counters stay exact." />
        <Slider label="Timeline checkpoint memory" value={p.historyMB} min={16} max={1024} step={16} onChange={(v) => update('performance', { historyMB: v })} format={(v) => `${v} MB`} hint="More memory = more checkpoints = faster seeking. Rewind is always exact." />
        <Toggle label="Run algorithms in Web Workers" value={p.useWorkers} onChange={(v) => update('performance', { useWorkers: v })} hint="Keeps the interface responsive. Takes effect after reload." />
        <Toggle label="Large dataset mode" value={p.largeDatasetMode} onChange={(v) => update('performance', { largeDatasetMode: v, quality: v ? 'medium' : p.quality, maxOpsPerFrame: v ? 2_000_000 : p.maxOpsPerFrame })} />
        <div className="hint">Recording limit: 16,000,000 operations per sort (≈256 MB). Larger sorts stop with an explanation instead of freezing. Every recorded position remains fully rewindable.</div>
      </div>
      <div className="card stack" style={{ gridColumn: '1 / -1' }}>
        <h3>Operation counter definitions</h3>
        <table className="tbl">
          <tbody>{METRIC_DEFINITIONS.map((m) => <tr key={m.key}><td style={{ width: 140 }}><b>{m.label}</b></td><td className="muted">{m.definition}</td></tr>)}</tbody>
        </table>
        <div className="hint">“Execution time” in the visualizer is the measured time of the instrumented worker run that produced the recording. “Playback time” is real time spent animating. Benchmark timings use a count-only run with no recording.</div>
      </div>
    </div>
  );
}

function Shortcuts() {
  const sc = useApp((s) => s.settings.shortcuts);
  const update = useApp((s) => s.update);
  const [capturing, setCapturing] = useState<string | null>(null);
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h3>Keyboard shortcuts</h3>
      <div className="hint" style={{ marginBottom: 10 }}>Shortcuts never fire while typing in a text field or the code editor. Click a key to rebind it. Shift + ← / → steps 10 operations.</div>
      <table className="tbl">
        <tbody>
          {Object.keys(DEFAULT_SHORTCUTS).map((k) => (
            <tr key={k}>
              <td>{SHORTCUT_LABELS[k]}</td>
              <td style={{ width: 180 }}>
                <button className={`btn ${capturing === k ? 'on' : ''}`} onClick={() => setCapturing(k)} onKeyDown={(e) => {
                  if (capturing !== k) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const key = e.code === 'Space' ? 'Space' : e.key;
                  update('shortcuts', { [k]: key });
                  setCapturing(null);
                }}>{capturing === k ? 'Press a key…' : <span className="mono">{sc[k] || '—'}</span>}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row-wrap" style={{ marginTop: 12 }}><button className="btn" onClick={() => update('shortcuts', { ...DEFAULT_SHORTCUTS })}>Reset to defaults</button></div>
    </div>
  );
}

function ExportDefaults() {
  const e = useApp((s) => s.settings.export);
  const update = useApp((s) => s.update);
  return (
    <div className="card stack" style={{ maxWidth: 640 }}>
      <h3>Video export defaults</h3>
      <Segmented label="Orientation" value={e.aspect} onChange={(v) => update('export', { aspect: v })} options={[{ value: '9:16', label: 'Vertical 9:16' }, { value: '16:9', label: 'Horizontal 16:9' }, { value: '1:1', label: 'Square' }, { value: 'custom', label: 'Custom' }]} />
      <Segmented label="Resolution" value={e.resolution} onChange={(v) => update('export', { resolution: v })} options={[{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }, { value: 1440, label: '1440p' }, { value: 2160, label: '4K' }]} />
      <Slider label="Frame rate" value={e.fps} min={12} max={120} step={1} onChange={(v) => update('export', { fps: v })} />
      <Select label="Format" value={e.format} onChange={(v) => update('export', { format: v })} options={[{ value: 'auto', label: 'Best available' }, { value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM' }]} />
      <Toggle label="Include audio" value={e.audio} onChange={(v) => update('export', { audio: v })} />
      <Toggle label="Branding" value={e.branding} onChange={(v) => update('export', { branding: v })} />
      <Slider label="Default clip duration" value={e.duration} min={2} max={120} step={1} onChange={(v) => update('export', { duration: v })} format={(v) => `${v} s`} />
      <Slider label="Bitrate" value={e.bitrateMbps} min={1} max={80} step={1} onChange={(v) => update('export', { bitrateMbps: v })} format={(v) => `${v} Mbps`} />
      <div className="field"><label>Filename pattern</label><input className="input mono" value={e.filename} onChange={(ev) => update('export', { filename: ev.target.value.slice(0, 120) })} /></div>
    </div>
  );
}

function About() {
  const desktop = !!(window as any).sortclaude?.isDesktop;
  return (
    <div className="cols-2">
      <div className="card stack">
        <h2>SortClaude 5.5</h2>
        <div className="muted">{desktop ? 'Desktop application (Electron)' : 'Web application'} · {ALGORITHMS.length} implemented algorithms · 20 2D + 10 3D visualizations</div>
        <p className="muted">Every animation, sound and statistic is driven by the operations the algorithms actually perform. No accounts, no network access needed, no feature locks.</p>
      </div>
      <div className="card stack">
        <h3>Open-source components</h3>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>React (MIT) · Zustand (MIT) · Zod (MIT)</li>
          <li>Three.js (MIT) — 3D rendering, bloom, orbit controls</li>
          <li>CodeMirror 6 (MIT) — algorithm editor</li>
          <li>mp4-muxer, webm-muxer (MIT) — video containers</li>
          <li>Inter, Space Grotesk, JetBrains Mono (SIL OFL 1.1) — bundled fonts</li>
          <li>Electron (MIT) — desktop shell</li>
        </ul>
      </div>
    </div>
  );
}
