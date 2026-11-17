import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { ALGORITHMS, CATEGORIES, getAlgorithm, validateRun } from '../engine/registry';
import { ELEMENT_PRESETS, PATTERNS, generateKeys } from '../engine/generators';
import { VIZ_2D, VIZ_3D, is3D, type Viz2D, type Settings } from '../state/settings';
import { PALETTES, cssGradient, paletteStops, type GradientStop } from '../render/palettes';
import { Renderer2D } from '../render/renderer2d';
import { Section, Slider, Toggle, Select, Segmented, ColorInput, Icon, saveBlob, pickFile } from './components';
import { randomSeed, normalizeSeed } from '../engine/rng';
import { useSim } from '../state/simulation';
import { player } from '../state/player';
import { toggleSound } from './Visualizer';
import type { RenderView } from '../render/view';

export function Sidebar() {
  return (
    <>
      <AlgorithmPanel />
      <DatasetPanel />
      <VisualizationPanel />
      <ColorPanel />
      <ElementPanel />
      <BackgroundPanel />
      <ThreePanel />
      <AudioPanel />
      <HighlightPanel />
    </>
  );
}

// ------------------------------------------------------------------ algorithm
export function AlgorithmPicker({ value, onChange, height = 300, filter }: { value: string; onChange: (id: string) => void; height?: number; filter?: (id: string) => boolean }) {
  const [q, setQ] = useState('');
  const list = ALGORITHMS.filter((a) => (!filter || filter(a.id)) && (a.name.toLowerCase().includes(q.toLowerCase()) || a.family.toLowerCase().includes(q.toLowerCase())));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('.algo-item.active')?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <input className="input" placeholder={`Search ${ALGORITHMS.length} algorithms…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search algorithms" />
      <div className="algo-list" style={{ maxHeight: height }} ref={ref} role="listbox" aria-label="Algorithms">
        {CATEGORIES.map((cat) => {
          const items = list.filter((a) => a.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <div className="algo-group">{cat}</div>
              {items.map((a) => (
                <button key={a.id} role="option" aria-selected={a.id === value} className={`algo-item ${a.id === value ? 'active' : ''}`} onClick={() => onChange(a.id)} data-algo={a.id}>
                  <span>{a.name}</span>
                  <span className="cx">{a.average.length > 14 ? a.worst : a.average}</span>
                </button>
              ))}
            </div>
          );
        })}
        {!list.length && <div className="empty">No algorithm matches “{q}”.</div>}
      </div>
    </div>
  );
}

function AlgorithmPanel() {
  const algoId = useApp((s) => s.settings.sorting.algorithm);
  const update = useApp((s) => s.update);
  const a = getAlgorithm(algoId);
  return (
    <Section title={`Algorithm · ${ALGORITHMS.length} implemented`} id="algo">
      <AlgorithmPicker value={algoId} onChange={(id) => update('sorting', { algorithm: id })} />
      <div className="info-card">
        <div className="field-row">
          <b style={{ fontFamily: 'var(--display)' }}>{a.name}</b>
          <span className="tag">{a.category}</span>
        </div>
        <div className="muted small">{a.description}</div>
        <div className="cx-grid">
          <div><span>Best</span><b>{a.best}</b></div>
          <div><span>Average</span><b>{a.average}</b></div>
          <div><span>Worst</span><b>{a.worst}</b></div>
          <div><span>Space</span><b>{a.space}</b></div>
        </div>
        <div className="row-wrap">
          <span className={`tag ${a.stable ? 'stable' : ''}`}>{a.stable ? 'Stable' : 'Not stable'}</span>
          <span className="tag">{a.inPlace ? 'In place' : 'Out of place'}</span>
          <span className="tag">{a.comparison ? 'Comparison-based' : 'Non-comparison'}</span>
          <span className="tag">max {a.maxN.toLocaleString()} visual</span>
        </div>
        <div className="hint">{a.notes}</div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ dataset
function DatasetPanel() {
  const s = useApp((st) => st.settings.sorting);
  const update = useApp((st) => st.update);
  const toast = useApp((st) => st.toast);
  const algo = getAlgorithm(s.algorithm);
  const [seedText, setSeedText] = useState(String(s.seed));
  const [nText, setNText] = useState(String(s.n));
  useEffect(() => setSeedText(String(s.seed)), [s.seed]);
  useEffect(() => setNText(String(s.n)), [s.n]);
  const sim = useSim();

  const saveDataset = async () => {
    const keys = sim.initialKeys;
    if (!keys) return;
    const data = { format: 'sortclaude-dataset', version: 1, n: keys.length, pattern: s.pattern, seed: s.seed, keys: Array.from(keys) };
    await saveBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `sortclaude-dataset-${s.pattern}-${keys.length}-${s.seed}.json`);
    toast('Dataset saved.', 'success');
  };
  const loadDataset = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d?.format !== 'sortclaude-dataset' || !Array.isArray(d.keys)) throw new Error('Not a SortClaude dataset file.');
      if (d.keys.length > 1_000_000) throw new Error('Dataset too large (max 1,000,000 values).');
      if (!d.keys.every((k: unknown) => Number.isInteger(k) && Math.abs(k as number) <= 2147483647)) throw new Error('Datasets may only contain 32-bit integers.');
      update('sorting', { pattern: 'custom', customData: d.keys.join(','), n: d.keys.length });
      toast(`Loaded ${d.keys.length.toLocaleString()} values.`, 'success');
    } catch (e) {
      toast(`Invalid dataset: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <Section title="Data & shuffle" id="data">
      <div className="field">
        <div className="field-row">
          <label>Elements</label>
          <span className="hint">limit for {algo.name}: {algo.maxN.toLocaleString()}</span>
        </div>
        <div className="input-group">
          <select className="select" aria-label="Element count preset" value={ELEMENT_PRESETS.includes(s.n) ? String(s.n) : 'custom'} onChange={(e) => e.target.value !== 'custom' && update('sorting', { n: Number(e.target.value) })} disabled={s.pattern === 'custom'}>
            {ELEMENT_PRESETS.map((n) => (
              <option key={n} value={n} disabled={n > algo.maxN}>{n.toLocaleString()}{n > algo.maxN ? ' (too many)' : ''}</option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          <input className="input mono" style={{ width: 96 }} aria-label="Custom element count" value={nText} disabled={s.pattern === 'custom'} onChange={(e) => setNText(e.target.value.replace(/[^\d]/g, ''))} onBlur={() => {
            const v = Math.max(0, Math.min(1_000_000, Number(nText) || 0));
            update('sorting', { n: v });
          }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </div>
      </div>
      <Select label="Initial order" value={s.pattern} options={PATTERNS.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => update('sorting', { pattern: v })} hint={PATTERNS.find((p) => p.id === s.pattern)?.description} />
      <div className="hint">{PATTERNS.find((p) => p.id === s.pattern)?.description}</div>
      {s.pattern === 'custom' && (
        <div className="field">
          <label>Custom integers (comma / space separated)</label>
          <textarea className="input" rows={3} value={s.customData.length > 20000 ? s.customData.slice(0, 20000) + ' …' : s.customData} onChange={(e) => update('sorting', { customData: e.target.value })} aria-label="Custom data" readOnly={s.customData.length > 20000} />
        </div>
      )}
      <div className="field">
        <label>Shuffle seed</label>
        <div className="input-group">
          <input className="input mono" data-testid="seed" aria-label="Shuffle seed" value={seedText} onChange={(e) => setSeedText(e.target.value)} onBlur={() => update('sorting', { seed: normalizeSeed(seedText) })} onKeyDown={(e) => e.key === 'Enter' && update('sorting', { seed: normalizeSeed(seedText) })} />
          <button className="btn icon" title="New random seed" aria-label="New random seed" onClick={() => update('sorting', { seed: randomSeed() })}>{Icon.dice}</button>
          <button className="btn icon" title="Copy seed" aria-label="Copy seed" onClick={() => navigator.clipboard?.writeText(String(s.seed)).then(() => toast('Seed copied.', 'success'), () => toast('Clipboard unavailable.', 'error'))}>{Icon.copy}</button>
        </div>
        <div className="hint">Same seed + pattern + count = identical data (SFC32 generator seeded via SplitMix32).</div>
      </div>
      <div className="row-wrap">
        <button className="btn" onClick={() => player.restart()} title="Reuse this seed: restart from the identical initial data">{Icon.restart}Reuse seed</button>
        <button className="btn" onClick={saveDataset}>{Icon.save}Save</button>
        <button className="btn" onClick={loadDataset}>{Icon.open}Load</button>
      </div>
      <Toggle label="Automatic restart" value={s.autoRestart} onChange={(v) => update('sorting', { autoRestart: v })} />
      <Segmented label="Speed scale" value={s.speedMode} onChange={(v) => update('sorting', { speedMode: v })} options={[{ value: 'normalized', label: '1× ≈ 12 s per sort' }, { value: 'fixed', label: '1× = 240 ops/s' }]} />
      <Toggle label="Custom logical ops / second" value={s.useCustomRate} onChange={(v) => update('sorting', { useCustomRate: v })} />
      {s.useCustomRate && (
        <Slider label="Ops per second" value={Math.log10(s.customOpsPerSec)} min={-1} max={7} step={0.01} format={() => `${s.customOpsPerSec >= 100 ? Math.round(s.customOpsPerSec).toLocaleString() : s.customOpsPerSec.toFixed(1)}`} onChange={(v) => update('sorting', { customOpsPerSec: Math.pow(10, v) })} />
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ previews
const PREVIEW_KEYS = generateKeys({ n: 64, pattern: 'random', seed: 7 });
const previewView = (): RenderView => {
  const n = PREVIEW_KEYS.length;
  const ids = new Int32Array(n);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => PREVIEW_KEYS[a] - PREVIEW_KEYS[b]);
  // half sorted: first half in order, second half original
  const half = order.slice(0, n / 2);
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => !half.includes(i));
  [...half, ...rest].forEach((id, i) => (ids[i] = id));
  const finalPos = new Int32Array(n);
  order.forEach((id, i) => (finalPos[id] = i));
  return { n, keys: PREVIEW_KEYS, ids, sorted: new Uint8Array(n), pivot: -1, range: null, minKey: 1, maxKey: n, finalPos, compare: [], write: [], done: false, time: 0, completion: -1 };
};

function VizPreview({ viz, appearance }: { viz: Viz2D; appearance: Settings['appearance'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    c.width = 180;
    c.height = 68;
    try {
      const r = new Renderer2D(c);
      r.render(previewView(), { viz, appearance: { ...appearance, glow: 0, blur: 0, background: 'solid', scale: 0.95, rotation: 0 }, sorting: { highlightCompare: false, highlightPivot: false, highlightSwap: false, highlightSorted: false }, completionEffect: 'none', reducedMotion: true, reducedFlashing: true, quality: 0.25 });
    } catch {
      /* ignore */
    }
  }, [viz, appearance.palette, appearance.customGradient, appearance.colorMode, appearance.bgColor1]);
  return <canvas ref={ref} />;
}

function VisualizationPanel() {
  const a = useApp((s) => s.settings.appearance);
  const update = useApp((s) => s.update);
  return (
    <Section title="Visualization" id="viz">
      <div className="label">2D shapes · switching never resets the sort</div>
      <div className="grid-picker" role="radiogroup" aria-label="2D visualizations">
        {VIZ_2D.map((v) => (
          <button key={v.id} className={`pick ${a.viz === v.id ? 'active' : ''}`} title={v.hint} onClick={() => update('appearance', { viz: v.id })} data-viz={v.id} role="radio" aria-checked={a.viz === v.id}>
            <VizPreview viz={v.id} appearance={a} />
            {v.name}
          </button>
        ))}
      </div>
      <div className="label">3D studio (WebGL)</div>
      <div className="grid-picker" role="radiogroup" aria-label="3D visualizations">
        {VIZ_3D.map((v) => (
          <button key={v.id} className={`pick ${a.viz === v.id ? 'active' : ''}`} title={v.hint} onClick={() => update('appearance', { viz: v.id })} data-viz={v.id} role="radio" aria-checked={a.viz === v.id}>
            <span className="swatch" style={{ background: 'radial-gradient(circle at 40% 35%, rgba(168,85,247,0.55), rgba(56,223,255,0.15) 55%, transparent 70%), #0b0b12' }} />
            {v.name}
          </button>
        ))}
      </div>
      <div className="hint">{[...VIZ_2D, ...VIZ_3D].find((v) => v.id === a.viz)?.hint}</div>
    </Section>
  );
}

// ------------------------------------------------------------------ color
function ColorPanel() {
  const a = useApp((s) => s.settings.appearance);
  const update = useApp((s) => s.update);
  return (
    <Section title="Colors" id="colors">
      <div className="grid-picker" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))' }}>
        {PALETTES.map((p) => (
          <button key={p.id} className={`pick ${a.palette === p.id ? 'active' : ''}`} onClick={() => update('appearance', { palette: p.id })} title={p.name} data-palette={p.id}>
            <span className="swatch" style={{ height: 14, background: cssGradient(p.id === 'custom' ? a.customGradient : p.stops) }} />
            {p.name}
          </button>
        ))}
      </div>
      {a.palette === 'custom' && <GradientEditor stops={a.customGradient} onChange={(st) => update('appearance', { customGradient: st })} />}
      <Select
        label="Color assignment"
        value={a.colorMode}
        onChange={(v) => update('appearance', { colorMode: v })}
        options={[
          { value: 'value', label: 'By element value' },
          { value: 'identity', label: 'By original identity' },
          { value: 'index', label: 'By current index' },
          { value: 'rainbow-rotation', label: 'Rainbow rotation (animated)' },
          { value: 'height', label: 'Gradient by height' },
          { value: 'fixed', label: 'Fixed color' },
        ]}
      />
      <div className="hint">
        {a.colorMode === 'value' && 'Colour encodes the key: when sorted, colours form a smooth gradient.'}
        {a.colorMode === 'identity' && 'Each element keeps the colour of the slot it started in, so you can follow individual elements as they move. A sorted random array looks scrambled — that shows where elements came from.'}
        {a.colorMode === 'index' && 'Colour belongs to the position, not the element: the gradient stays still while elements move through it.'}
        {a.colorMode === 'rainbow-rotation' && 'Value-based colour with a slowly rotating hue offset.'}
        {a.colorMode === 'height' && 'Value-based colour; on bar shapes the palette maps to height.'}
        {a.colorMode === 'fixed' && 'One colour for every element; highlights still show operations.'}
      </div>
      {a.colorMode === 'fixed' && <ColorInput label="Fixed color" value={a.fixedColor} onChange={(v) => update('appearance', { fixedColor: v })} />}
      <Segmented label="Interpolation" value={a.interpolation} onChange={(v) => update('appearance', { interpolation: v })} options={[{ value: 'rgb', label: 'RGB' }, { value: 'hsl', label: 'HSL (hue path)' }]} />
    </Section>
  );
}

export function GradientEditor({ stops, onChange }: { stops: GradientStop[]; onChange: (s: GradientStop[]) => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState(0);
  const sorted = [...stops];
  const drag = useRef<number | null>(null);
  const toast = useApp((s) => s.toast);
  const savePreset = useApp((s) => s.savePreset);
  const move = (clientX: number) => {
    if (drag.current === null || !barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onChange(stops.map((s, i) => (i === drag.current ? { ...s, pos: Math.round(pos * 1000) / 1000 } : s)));
  };
  const cur = stops[Math.min(sel, stops.length - 1)];
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div
        ref={barRef}
        style={{ position: 'relative', height: 26, borderRadius: 7, background: cssGradient(stops), border: '1px solid var(--line-2)', cursor: 'copy' }}
        onDoubleClick={(e) => {
          const r = barRef.current!.getBoundingClientRect();
          const pos = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
          if (stops.length >= 16) return toast('At most 16 color stops.', 'error');
          onChange([...stops, { pos, color: cur?.color ?? '#ffffff' }]);
          setSel(stops.length);
        }}
        onPointerMove={(e) => move(e.clientX)}
        onPointerUp={() => (drag.current = null)}
        title="Double-click to add a stop, drag markers to move"
      >
        {sorted.map((s, i) => (
          <div
            key={i}
            role="slider"
            aria-label={`Color stop ${i + 1}`}
            aria-valuenow={Math.round(s.pos * 100)}
            tabIndex={0}
            onPointerDown={(e) => {
              drag.current = i;
              setSel(i);
              (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId);
              e.stopPropagation();
            }}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowRight' ? 0.01 : e.key === 'ArrowLeft' ? -0.01 : 0;
              if (d) onChange(stops.map((x, j) => (j === i ? { ...x, pos: Math.max(0, Math.min(1, x.pos + d)) } : x)));
            }}
            style={{ position: 'absolute', left: `calc(${s.pos * 100}% - 7px)`, top: 4, width: 14, height: 16, borderRadius: 4, background: s.color, border: `2px solid ${i === sel ? '#fff' : 'rgba(0,0,0,0.6)'}`, cursor: 'grab' }}
          />
        ))}
      </div>
      {cur && <ColorInput label={`Stop ${sel + 1} · ${(cur.pos * 100).toFixed(0)}%`} value={cur.color} onChange={(c) => onChange(stops.map((s, i) => (i === sel ? { ...s, color: c } : s)))} />}
      <div className="row-wrap">
        <button className="btn" onClick={() => (stops.length >= 16 ? toast('At most 16 stops.', 'error') : (onChange([...stops, { pos: 0.5, color: '#ffffff' }]), setSel(stops.length)))}>{Icon.plus}Add stop</button>
        <button className="btn" disabled={stops.length <= 2} onClick={() => { onChange(stops.filter((_, i) => i !== sel)); setSel(0); }}>{Icon.trash}Remove</button>
        <button className="btn ghost" onClick={() => onChange(paletteStops('custom', []))}>Reset</button>
        <button className="btn ghost" onClick={() => {
          savePreset({ id: `grad-${Date.now()}`, name: `Gradient ${new Date().toLocaleTimeString()}`, created: Date.now(), data: { appearance: { palette: 'custom', customGradient: stops } as any } });
          toast('Gradient saved as a preset (Settings → Presets).', 'success');
        }}>{Icon.save}Save</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ element / effect settings
function ElementPanel() {
  const a = useApp((s) => s.settings.appearance);
  const update = useApp((s) => s.update);
  const viz = a.viz;
  const radial = ['wheel', 'spiral', 'ring', 'sunburst', 'circular-bars', 'particles', 'spikes'].includes(viz);
  const linearBars = ['bars', 'hbars', 'skyline', 'spectrum'].includes(viz);
  const points = ['spiral', 'ring', 'scatter', 'dots', 'particles'].includes(viz);
  const three = is3D(viz);
  const up = (p: Partial<Settings['appearance']>) => update('appearance', p);
  return (
    <Section title="Elements & effects" id="elements">
      {(linearBars || viz === 'tiles' || viz === 'dots' || viz === 'heatmap' || viz === 'circular-bars' || three) && <Slider label="Spacing" value={a.spacing} min={0} max={0.9} onChange={(v) => up({ spacing: v })} format={(v) => `${Math.round(v * 100)}%`} />}
      {(linearBars || viz === 'circular-bars' || viz === 'wave' || three) && <Slider label="Element size" value={a.size} min={0.1} max={viz === 'circular-bars' || three || viz === 'wave' ? 4 : 1} onChange={(v) => up({ size: v })} />}
      {points && <Slider label="Point size" value={a.pointSize} min={0.2} max={6} onChange={(v) => up({ pointSize: v })} />}
      {!three && <Slider label="Scale" value={a.scale} min={0.2} max={1.5} onChange={(v) => up({ scale: v })} />}
      {!three && radial && <Slider label="Rotation" value={a.rotation} min={-180} max={180} step={1} onChange={(v) => up({ rotation: v })} format={(v) => `${v}°`} />}
      {!three && (linearBars || viz === 'tiles' || viz === 'sunburst' || viz === 'wheel') && <Slider label="Outline" value={a.outline} min={0} max={4} step={0.1} onChange={(v) => up({ outline: v })} />}
      <Slider label="Glow" value={a.glow} min={0} max={1} onChange={(v) => up({ glow: v })} format={(v) => `${Math.round(v * 100)}%`} />
      {!three && <Slider label="Blur" value={a.blur} min={0} max={8} step={0.1} onChange={(v) => up({ blur: v })} />}
      {!three && <Slider label="Opacity" value={a.opacity} min={0.05} max={1} onChange={(v) => up({ opacity: v })} />}
      {viz === 'wave' && <Slider label="Smoothing" value={a.smoothing} min={0} max={1} onChange={(v) => up({ smoothing: v })} />}
      <Slider label="Highlight intensity" value={a.highlightIntensity} min={0} max={1} onChange={(v) => up({ highlightIntensity: v })} />
      <Toggle label="Statistics overlay" value={a.showStats} onChange={(v) => up({ showStats: v })} />
    </Section>
  );
}

function BackgroundPanel() {
  const a = useApp((s) => s.settings.appearance);
  const update = useApp((s) => s.update);
  const toast = useApp((s) => s.toast);
  const up = (p: Partial<Settings['appearance']>) => update('appearance', p);
  return (
    <Section title="Background" id="bg" defaultOpen={false}>
      <Select
        label="Style"
        value={a.background}
        onChange={(v) => up({ background: v })}
        options={[
          { value: 'math-grid', label: 'Dark mathematical grid' },
          { value: 'solid', label: 'Solid color' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'starfield', label: 'Starfield' },
          { value: 'grid', label: 'Subtle grid' },
          { value: 'particles', label: 'Animated particles' },
          { value: 'geometric', label: 'Abstract geometric' },
          { value: 'image', label: 'Imported image' },
        ]}
      />
      <ColorInput label="Base color" value={a.bgColor1} onChange={(v) => up({ bgColor1: v })} />
      {a.background === 'gradient' && <ColorInput label="Second color" value={a.bgColor2} onChange={(v) => up({ bgColor2: v })} />}
      {a.background === 'image' && (
        <div className="row-wrap">
          <button className="btn" onClick={async () => {
            const f = await pickFile('image/*');
            if (!f) return;
            if (f.size > 6 * 1024 * 1024) return toast('Image too large (max 6 MB).', 'error');
            const reader = new FileReader();
            reader.onload = () => up({ bgImage: String(reader.result) });
            reader.readAsDataURL(f);
          }}>{Icon.open}Choose image</button>
          {a.bgImage && <button className="btn ghost" onClick={() => up({ bgImage: '' })}>Remove</button>}
          <div className="hint">The image stays on this device (stored locally with your settings).</div>
        </div>
      )}
    </Section>
  );
}

function ThreePanel() {
  const viz = useApp((s) => s.settings.appearance.viz);
  const t = useApp((s) => s.settings.three);
  const update = useApp((s) => s.update);
  if (!is3D(viz)) return null;
  const up = (p: Partial<Settings['three']>) => update('three', p);
  return (
    <Section title="3D camera & lighting" id="three">
      <Segmented label="Camera" value={t.cameraPreset} onChange={(v) => up({ cameraPreset: v })} options={[{ value: 'iso', label: 'Iso' }, { value: 'front', label: 'Front' }, { value: 'top', label: 'Top' }, { value: 'side', label: 'Side' }]} />
      <div className="row-wrap">
        <button className="btn" onClick={() => window.dispatchEvent(new Event('sortclaude:reset-camera'))}>{Icon.camera}Reset camera</button>
      </div>
      <Toggle label="Orthographic projection" value={t.orthographic} onChange={(v) => up({ orthographic: v })} />
      <Toggle label="Auto rotate" value={t.autoRotate} onChange={(v) => up({ autoRotate: v })} />
      <Slider label="Rotation speed" value={t.rotateSpeed} min={0} max={3} onChange={(v) => up({ rotateSpeed: v })} />
      <Slider label="Ambient light" value={t.ambient} min={0} max={3} onChange={(v) => up({ ambient: v })} />
      <Slider label="Point light" value={t.pointLight} min={0} max={5} onChange={(v) => up({ pointLight: v })} />
      <Slider label="Bloom" value={t.bloom} min={0} max={3} onChange={(v) => up({ bloom: v })} />
      <Slider label="Particle / element size" value={t.particleSize} min={0.1} max={5} onChange={(v) => up({ particleSize: v })} />
      <Slider label="Particle density" value={t.density} min={0.1} max={1} onChange={(v) => up({ density: v })} hint="Fraction of particles drawn in point-cloud mode (rendering only; the sort is unaffected)." />
      <Slider label="Motion trails" value={t.trails} min={0} max={0.95} onChange={(v) => up({ trails: v })} />
      <Toggle label="Shadows (high quality only)" value={t.shadows} onChange={(v) => up({ shadows: v })} />
      <Slider label="Render resolution" value={t.renderScale} min={0.25} max={2} onChange={(v) => up({ renderScale: v })} format={(v) => `${Math.round(v * 100)}%`} />
    </Section>
  );
}

function AudioPanel() {
  const a = useApp((s) => s.settings.audio);
  const update = useApp((s) => s.update);
  const up = (p: Partial<Settings['audio']>) => update('audio', p);
  return (
    <Section title="Sorting music" id="audio" defaultOpen={false}>
      <div className="field-row">
        <label className="label">Sound</label>
        <button className={`btn ${a.enabled ? 'on' : ''}`} onClick={toggleSound}>{a.enabled ? Icon.sound : Icon.mute}{a.enabled ? 'On' : 'Off'}</button>
      </div>
      <Slider label="Master volume" value={a.volume} min={0} max={1} onChange={(v) => up({ volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <AudioControls />
    </Section>
  );
}

export function AudioControls() {
  const a = useApp((s) => s.settings.audio);
  const update = useApp((s) => s.update);
  const up = (p: Partial<Settings['audio']>) => update('audio', p);
  const midiName = (m: number) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][Math.round(m) % 12] + (Math.floor(Math.round(m) / 12) - 1);
  return (
    <>
      <Select label="Instrument" value={a.instrument} onChange={(v) => up({ instrument: v })} options={[
        { value: 'sine', label: 'Sine Wave' }, { value: 'triangle', label: 'Triangle Wave' }, { value: 'square', label: 'Square Wave' }, { value: 'sawtooth', label: 'Sawtooth Wave' },
        { value: 'bell', label: 'Soft Bell (FM)' }, { value: 'pluck', label: 'Plucked Tone' }, { value: 'piano', label: 'Piano-like Synth' }, { value: 'marimba', label: 'Marimba-like Synth' },
        { value: 'chime', label: 'Digital Chime' }, { value: 'pad', label: 'Ambient Pad' }, { value: 'pulse', label: 'Electronic Pulse' },
      ]} />
      <Select label="Pitch from" value={a.mapping} onChange={(v) => up({ mapping: v })} options={[{ value: 'value', label: 'Element value' }, { value: 'position', label: 'Array position' }, { value: 'pair', label: 'Compared pair (average)' }]} />
      <Select label="Scale" value={a.scale} onChange={(v) => up({ scale: v })} options={[{ value: 'pentatonic', label: 'Pentatonic' }, { value: 'major', label: 'Major' }, { value: 'minor', label: 'Minor' }, { value: 'blues', label: 'Blues' }, { value: 'whole-tone', label: 'Whole-tone' }, { value: 'chromatic', label: 'Chromatic' }, { value: 'custom', label: 'Custom' }]} />
      {a.scale === 'custom' && (
        <div className="field">
          <label>Custom scale (semitones 0–11)</label>
          <input className="input mono" value={a.customScale} onChange={(e) => up({ customScale: e.target.value })} />
        </div>
      )}
      <Select label="Root note" value={String(a.rootNote)} onChange={(v) => up({ rootNote: Number(v) })} options={['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((n, i) => ({ value: String(i), label: n }))} />
      <Toggle label="Quantize pitch to scale" value={a.quantize} onChange={(v) => up({ quantize: v })} />
      <Slider label="Lowest note" value={a.pitchMin} min={12} max={120} step={1} onChange={(v) => up({ pitchMin: v })} format={midiName} />
      <Slider label="Highest note" value={a.pitchMax} min={12} max={127} step={1} onChange={(v) => up({ pitchMax: v })} format={midiName} />
      <Slider label="Note duration" value={a.noteDuration} min={0.01} max={1} onChange={(v) => up({ noteDuration: v })} format={(v) => `${Math.round(v * 1000)} ms`} />
      <Slider label="Attack" value={a.attack} min={0.001} max={0.5} step={0.001} onChange={(v) => up({ attack: v })} format={(v) => `${Math.round(v * 1000)} ms`} />
      <Slider label="Decay" value={a.decay} min={0.001} max={1} step={0.001} onChange={(v) => up({ decay: v })} format={(v) => `${Math.round(v * 1000)} ms`} />
      <Slider label="Sustain" value={a.sustain} min={0} max={1} onChange={(v) => up({ sustain: v })} />
      <Slider label="Release" value={a.release} min={0.005} max={2} step={0.005} onChange={(v) => up({ release: v })} format={(v) => `${Math.round(v * 1000)} ms`} />
      <Slider label="Notes per frame (density)" value={a.density} min={1} max={32} step={1} onChange={(v) => up({ density: v })} hint="At high speeds many ops fall into one frame; at most this many are sonified (evenly sampled)." />
      <Slider label="Polyphony limit" value={a.polyphony} min={1} max={64} step={1} onChange={(v) => up({ polyphony: v })} />
      <Slider label="Stereo width" value={a.stereoWidth} min={0} max={1} onChange={(v) => up({ stereoWidth: v })} />
      <Slider label="Reverb" value={a.reverb} min={0} max={1} onChange={(v) => up({ reverb: v })} />
      <Slider label="Delay" value={a.delay} min={0} max={0.9} onChange={(v) => up({ delay: v })} />
      <Slider label="Low-pass filter" value={Math.log10(a.lowpass)} min={Math.log10(200)} max={Math.log10(20000)} onChange={(v) => up({ lowpass: Math.round(Math.pow(10, v)) })} format={() => `${a.lowpass} Hz`} />
      <Slider label="High-pass filter" value={Math.log10(a.highpass)} min={Math.log10(20)} max={Math.log10(5000)} onChange={(v) => up({ highpass: Math.round(Math.pow(10, v)) })} format={() => `${a.highpass} Hz`} />
      <Toggle label="Comparison sounds" value={a.soundCompare} onChange={(v) => up({ soundCompare: v })} />
      <Toggle label="Swap sounds" value={a.soundSwap} onChange={(v) => up({ soundSwap: v })} />
      <Toggle label="Write sounds" value={a.soundWrite} onChange={(v) => up({ soundWrite: v })} />
      <Toggle label="Volume follows magnitude" value={a.volumeByMagnitude} onChange={(v) => up({ volumeByMagnitude: v })} />
    </>
  );
}

function HighlightPanel() {
  const s = useApp((st) => st.settings.sorting);
  const update = useApp((st) => st.update);
  return (
    <Section title="Highlights" id="hl" defaultOpen={false}>
      <Toggle label="Comparisons (white)" value={s.highlightCompare} onChange={(v) => update('sorting', { highlightCompare: v })} />
      <Toggle label="Swaps & writes (pink)" value={s.highlightSwap} onChange={(v) => update('sorting', { highlightSwap: v })} />
      <Toggle label="Pivot (amber)" value={s.highlightPivot} onChange={(v) => update('sorting', { highlightPivot: v })} />
      <Toggle label="Confirmed-sorted elements" value={s.highlightSorted} onChange={(v) => update('sorting', { highlightSorted: v })} />
      <Toggle label="Show complexity in header" value={s.showComplexity} onChange={(v) => update('sorting', { showComplexity: v })} />
    </Section>
  );
}

export function useAlgorithmLimits(algoId: string, n: number) {
  return useMemo(() => validateRun(getAlgorithm(algoId), new Int32Array(Math.min(n, getAlgorithm(algoId).maxN + 1)), 'record'), [algoId, n]);
}
