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
}

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
    if (is2dMode(s.mode)) {
      drawMode(g, s.mode, frame, W, H, opts);
    } else {
      if (!threeInstance && !threeFailed) void loadThree();
      if (threeInstance) {
        try {
          const img = threeInstance.render(s.mode, frame, W, H, opts);
          g.drawImage(img, 0, 0, W, H);
        } catch {
          threeFailed = true;
        }
      }
      if (!threeInstance) {
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.font = `${14 * this.dpr}px ui-sans-serif, system-ui`;
        g.textAlign = 'center';
        g.fillText(threeFailed ? 'WebGL is unavailable — choose a 2D visualization' : 'Loading 3D renderer…', W / 2, H / 2);
        g.textAlign = 'start';
      }
    }
    if (s.glow > 0 && (this.quality === 0 || this.fixedSize)) applyGlow(g, W, H, s.glow);
  }
}
