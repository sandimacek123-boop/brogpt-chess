import { applyGlow, drawMode, Frame, is2dMode, RenderOpts } from '../render/renderer';
import { buildPalette } from '../render/palette';
import type { Settings } from '../state/settings';
import type { Player } from './player';
import type { Three3D } from '../render/three3d';

let threePromise: Promise<Three3D | null> | null = null;
let threeInstance: Three3D | null = null;
let threeFailed = false;

function loadThree(): Promise<Three3D | null> {
  if (!threePromise) {
    threePromise = import('../render/three3d')
      .then((m) => {
        try {
          threeInstance = new m.Three3D();
          return threeInstance;
        } catch {
          threeFailed = true;
          return null;
        }
      })
      .catch(() => {
        threeFailed = true;
        return null;
      });
  }
  return threePromise;
}

export interface StageExtras {
  sweep: number;
  sweepFail: number;
  time: number;
  reducedMotion: boolean;
  /** Area (CSS px) kept clear for overlaid UI; the visualization is drawn inside it. */
  inset?: { top: number; right: number; bottom: number; left: number };
  /** Global vertical scale for intro animations (0..1). */
  rise?: number;
  /** Burned-in caption (used for video recordings). */
  caption?: { title: string; sub: string; stat: string };
}

const REFLECT_MODES = new Set(['bars', 'blocks', 'stripes', 'dots', 'bars3d']);

/** Owns one canvas and draws a Player's state into it with the current settings. */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  fixedSize: { w: number; h: number } | null = null;
  dpr = 1;
  maxDpr = 2;
  /** Exponential moving average of draw time in ms. */
  drawMs = 0;
  /** Adaptive quality: 0 = full, 1 = no glow, 2 = no glow + 1× resolution. */
  quality = 0;
  adaptive = true;
  private slowFrames = 0;
  private fastFrames = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const g = canvas.getContext('2d', { alpha: false });
    if (!g) throw new Error('Canvas 2D is not supported in this browser');
    this.g = g;
  }

  /** Match the backing store to the element's CSS size (or a fixed recording size). */
  resize() {
    const c = this.canvas;
    let w: number;
    let h: number;
    if (this.fixedSize) {
      w = this.fixedSize.w;
      h = this.fixedSize.h;
      this.dpr = Math.max(1, w / Math.max(1, c.clientWidth || w));
    } else {
      this.dpr = Math.min(this.quality >= 2 ? 1 : this.maxDpr, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round((c.clientWidth || 300) * this.dpr));
      h = Math.max(1, Math.round((c.clientHeight || 150) * this.dpr));
    }
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }

  private drawCaption(g: CanvasRenderingContext2D, W: number, H: number, c: { title: string; sub: string; stat: string }) {
    const u = Math.min(W, H) / 1080;
    const pad = 56 * u;
    g.save();
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.font = `600 ${15 * u}px "Inter Variable", Inter, sans-serif`;
    g.fillText('SORTLAB INFINITY', pad, pad + 14 * u);
    g.fillStyle = '#fff';
    g.font = `600 ${46 * u}px "Inter Tight Variable", "Inter Variable", sans-serif`;
    g.fillText(c.title, pad, pad + 66 * u);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = `500 ${17 * u}px "JetBrains Mono Variable", monospace`;
    g.fillText(c.sub, pad, pad + 96 * u);
    g.textAlign = 'right';
    g.fillStyle = '#fff';
    g.font = `500 ${22 * u}px "JetBrains Mono Variable", monospace`;
    g.fillText(c.stat, W - pad, pad + 20 * u);
    g.restore();
  }

  /** Soft coloured haze behind the visualization (palette-driven light spill). */
  private drawAmbient(g: CanvasRenderingContext2D, W: number, H: number, baseline: number, palette: string[], bg: string) {
    const top = baseline - H * 0.6;
    const lin = g.createLinearGradient(0, 0, W, 0);
    const k = palette.length - 1;
    for (let i = 0; i <= 6; i++) lin.addColorStop(i / 6, palette[Math.round((i / 6) * k)] ?? '#000');
    g.save();
    g.globalAlpha = 0.11;
    g.fillStyle = lin;
    g.fillRect(0, top, W, H - top);
    g.restore();
    // feather the haze upward so it has no edge, and let it fall off below the floor
    const up = g.createLinearGradient(0, top, 0, baseline);
    up.addColorStop(0, hexA(bg, 1));
    up.addColorStop(0.75, hexA(bg, 0.35));
    up.addColorStop(1, hexA(bg, 0));
    g.fillStyle = up;
    g.fillRect(0, top - 1, W, baseline - top + 1);
    const down = g.createLinearGradient(0, baseline, 0, H);
    down.addColorStop(0, hexA(bg, 0.2));
    down.addColorStop(1, hexA(bg, 1));
    g.fillStyle = down;
    g.fillRect(0, baseline, W, H - baseline);
    const vg = g.createRadialGradient(W / 2, baseline, 0, W / 2, baseline, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  draw(player: Player, s: Settings, x: StageExtras) {
    const t0 = performance.now();
    this.render(player, s, x);
    const dt = performance.now() - t0;
    this.drawMs = this.drawMs * 0.9 + dt * 0.1;
    if (!this.adaptive || this.fixedSize) return;
    // Adaptive quality with hysteresis: degrade after sustained slow frames, recover slowly.
    if (this.drawMs > 14) {
      this.fastFrames = 0;
      if (++this.slowFrames > 45 && this.quality < 2) {
        this.quality++;
        this.slowFrames = 0;
        this.drawMs = 0;
      }
    } else if (this.drawMs < 5) {
      this.slowFrames = 0;
      if (++this.fastFrames > 240 && this.quality > 0) {
        this.quality--;
        this.fastFrames = 0;
      }
    }
  }

  private render(player: Player, s: Settings, x: StageExtras) {
    this.resize();
    const g = this.g;
    const W = this.canvas.width;
    const H = this.canvas.height;
    let minV = Infinity;
    for (let i = 0; i < player.n; i++) if (player.initial[i] < minV) minV = player.initial[i];
    if (!Number.isFinite(minV)) minV = 0;
    const palette = buildPalette(s.colorScheme, player.maxValue, Math.min(minV, 1), s.customFrom, s.customTo);
    const frame: Frame = {
      n: player.n,
      values: player.arr,
      heights: player.heights,
      offsets: player.offsets,
      hlType: player.hlType,
      hlAge: player.hlAge,
      maxValue: Math.max(1, player.maxValue),
      minValue: minV,
      sweep: x.sweep,
      sweepFail: x.sweepFail,
      time: x.reducedMotion ? 0 : x.time,
    };
    const opts: RenderOpts = {
      palette,
      background: s.background,
      compareColor: s.compareColor,
      swapColor: s.swapColor,
      writeColor: s.writeColor,
      sweepColor: '#3dffa2',
      failColor: '#ff3355',
      showHighlights: s.showHighlights,
      barWidth: s.barWidth,
      barSpacing: s.barSpacing,
      glow: s.glow,
      migraineIntensity: x.reducedMotion ? Math.min(0.25, s.migraineIntensity) : s.migraineIntensity,
      reducedMotion: x.reducedMotion,
      dpr: this.dpr,
    };
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = s.background;
    g.fillRect(0, 0, W, H);
    const d = this.dpr;
    const ins = x.inset ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const ix = Math.round(ins.left * d);
    const iy = Math.round(ins.top * d);
    const iw = Math.max(1, W - Math.round((ins.left + ins.right) * d));
    const ih = Math.max(1, H - Math.round((ins.top + ins.bottom) * d));
    if (s.ambient && player.n > 0) this.drawAmbient(g, W, H, iy + ih, palette, s.background);
    g.save();
    g.translate(ix, iy);
    g.beginPath();
    g.rect(-ix, -iy, W, iy + ih);
    g.clip();
    const rise = x.rise ?? 1;
    if (rise < 1) {
      g.translate(0, ih * (1 - rise));
      g.scale(1, Math.max(0.001, rise));
    }
    if (is2dMode(s.mode)) {
      drawMode(g, s.mode, frame, iw, ih, opts);
    } else {
      if (!threeInstance && !threeFailed) void loadThree();
      if (threeInstance) {
        try {
          const img = threeInstance.render(s.mode, frame, iw, ih, opts);
          g.drawImage(img, 0, 0, iw, ih);
        } catch {
          threeFailed = true;
        }
      }
      if (!threeInstance) {
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.font = `${14 * this.dpr}px Inter, ui-sans-serif, system-ui`;
        g.textAlign = 'center';
        g.fillText(threeFailed ? 'WebGL is unavailable — choose a 2D visualization' : 'Loading 3D renderer…', iw / 2, ih / 2);
        g.textAlign = 'start';
      }
    }
    g.restore();
    const floor = H - (iy + ih);
    if (s.reflection && REFLECT_MODES.has(s.mode) && floor > 4) {
      const rh = Math.min(floor, ih * 0.32);
      g.save();
      g.globalAlpha = 0.22;
      g.translate(0, (iy + ih) * 2);
      g.scale(1, -1);
      g.drawImage(this.canvas, ix, iy + ih - rh, iw, rh, ix, iy + ih - rh, iw, rh);
      g.restore();
      const fade = g.createLinearGradient(0, iy + ih, 0, iy + ih + rh);
      fade.addColorStop(0, hexA(s.background, 0.35));
      fade.addColorStop(1, hexA(s.background, 1));
      g.fillStyle = fade;
      g.fillRect(0, iy + ih, W, rh + 2);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(ix, iy + ih, iw, Math.max(1, d));
    }
    if (s.glow > 0 && (this.quality === 0 || this.fixedSize)) applyGlow(g, W, H, s.glow);
    if (x.caption) this.drawCaption(g, W, H, x.caption);
  }
}

function hexA(hex: string, a: number) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
