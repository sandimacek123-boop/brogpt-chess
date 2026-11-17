import { drawMode, Frame, RenderOpts } from '../../render/renderer';
import { buildPalette } from '../../render/palette';
import type { VisualMode } from '../../render/modes';
import { mulberry32 } from '../../core/rng';

/** Half-sorted sample data so each thumbnail shows both order and chaos. */
function sample(n: number) {
  const rng = mulberry32(9);
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = Math.floor(n * 0.45); i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const cache = new Map<string, string>();

/** Render a static preview of a mode to a data URL (cached). 3D modes get a stylised 2D stand-in. */
export function modeThumb(mode: VisualMode, w = 300, h = 168): string {
  const key = `${mode}:${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#07070b';
  g.fillRect(0, 0, w, h);
  const n = mode === 'pixelGrid' ? 160 : 96;
  const vals = sample(n);
  const f: Frame = {
    n,
    values: Int32Array.from(vals),
    heights: Float32Array.from(vals),
    offsets: new Float32Array(n),
    hlType: new Uint8Array(n),
    hlAge: new Float32Array(n),
    maxValue: n,
    minValue: 1,
    sweep: -1,
    sweepFail: -1,
    time: 0.8,
  };
  const o: RenderOpts = {
    palette: buildPalette('rainbow', n, 1, '#000000', '#ffffff'),
    background: '#07070b',
    compareColor: '#fff',
    swapColor: '#ff2e63',
    writeColor: '#35f2a0',
    sweepColor: '#3dffa2',
    failColor: '#ff3355',
    showHighlights: false,
    barWidth: 0.78,
    barSpacing: 0,
    glow: 0,
    migraineIntensity: 0.5,
    reducedMotion: true,
    dpr: 1,
  };
  const pad = 12;
  g.save();
  g.translate(pad, pad);
  if (mode === 'bars3d' || mode === 'sphere3d') {
    // isometric stand-in for the WebGL modes
    if (mode === 'bars3d') {
      g.transform(1, -0.18, 0.55, 0.55, 0, h * 0.3);
      drawMode(g, 'bars', f, w - pad * 2 - 60, h - pad * 2 - 30, o);
    } else {
      const cx = (w - pad * 2) / 2;
      const cy = (h - pad * 2) / 2;
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = i * 2.399963;
        const rad = (h * 0.32) * (0.75 + 0.25 * (vals[i] / n));
        const z = Math.sin(th) * r;
        g.globalAlpha = 0.45 + 0.55 * ((z + 1) / 2);
        g.fillStyle = o.palette[vals[i]];
        g.beginPath();
        g.arc(cx + Math.cos(th) * r * rad, cy + y * rad, 2.6 + z, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  } else drawMode(g, mode, f, w - pad * 2, h - pad * 2, o);
  g.restore();
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
