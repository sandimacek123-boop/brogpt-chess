import { Timeline } from '../engine/timeline';
import type { Recording } from '../engine/runner';
import { buildViewCache, makeView, type ViewCache } from '../render/view';
import { Renderer2D, type RenderOptions } from '../render/renderer2d';
import { getAlgorithm } from '../engine/registry';
import { is3D, type Settings, type VizId, type Viz2D, type Viz3D, type CompletionEffect } from '../state/settings';
import type { PatternId } from '../engine/generators';
import { notesForOps, type NoteEvent } from '../audio/engine';

export type ClipLayout = 'single' | 'stack2' | 'side2' | 'grid4' | 'grid8' | 'grid16';
export type Transition = 'none' | 'crossfade' | 'fade-black' | 'zoom' | 'slide' | 'color-sweep' | 'spiral' | 'wipe';
export const LAYOUT_PANELS: Record<ClipLayout, number> = { single: 1, stack2: 2, side2: 2, grid4: 4, grid8: 8, grid16: 16 };

export interface Clip {
  id: string;
  algorithms: string[]; // one per panel
  viz: VizId;
  n: number;
  pattern: PatternId;
  seed: number;
  duration: number; // seconds
  layout: ClipLayout;
  transition: Transition;
  title: string; // '' = algorithm name
  audio: number; // 0..1 clip volume
}

export interface TextStyle {
  showTitle: boolean;
  showCounters: boolean;
  showSize: boolean;
  showComplexity: boolean;
  showWinner: boolean;
  titleSize: number; // relative to min(W,H)
  position: 'top' | 'center' | 'bottom';
  color: string;
  animation: 'fade-up' | 'typewriter' | 'tracking' | 'none';
}

export interface VideoProject {
  width: number;
  height: number;
  fps: number;
  intro: number;
  outro: number;
  clips: Clip[];
  text: TextStyle;
  appearance: Settings['appearance'];
  three: Settings['three'];
  cinematic: Settings['cinematic'];
  audio: Settings['audio'];
  audioEnabled: boolean;
  branding: boolean;
  completion: CompletionEffect;
}

export const TRANSITION_SECONDS = 0.7;
/** Fraction of a clip spent sorting; the rest holds the sorted result for the completion effect. */
export function sortSeconds(clip: Clip): number {
  return Math.max(0.5, clip.duration - Math.min(2, clip.duration * 0.2));
}

export function projectDuration(p: VideoProject): number {
  return p.intro + p.clips.reduce((s, c) => s + c.duration, 0) + p.outro;
}

export function recordingKey(algorithmId: string, c: Pick<Clip, 'n' | 'pattern' | 'seed'>): string {
  return `${algorithmId}|${c.n}|${c.pattern}|${c.seed}`;
}

interface Panel {
  tl: Timeline;
  cache: ViewCache;
  total: number;
  scratch: { compare: number[]; write: number[] };
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function mk(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

/**
 * Deterministic composer: frame(t) depends only on t and the recordings, so the preview and the
 * offline export draw exactly the same picture. Panels are driven by their real op logs.
 */
export class Composer {
  readonly canvas: AnyCanvas;
  private ctx: Ctx;
  private r2d: Renderer2D;
  private panelCanvas: AnyCanvas;
  private prevFrame: AnyCanvas;
  private prevCtx: Ctx;
  private panels = new Map<string, Panel>();
  private three: import('../render/three/renderer3d').Renderer3D | null = null;
  private threeCanvas: HTMLCanvasElement | null = null;
  private threeSize = '';
  private lastClipIndex = -1;

  constructor(public project: VideoProject, private recordings: Map<string, Recording>, canvas?: AnyCanvas, private threeModule?: typeof import('../render/three/renderer3d')) {
    this.canvas = canvas ?? mk(project.width, project.height);
    this.canvas.width = project.width;
    this.canvas.height = project.height;
    this.ctx = this.canvas.getContext('2d', { alpha: false }) as Ctx;
    this.panelCanvas = mk(project.width, project.height);
    this.r2d = new Renderer2D(this.panelCanvas);
    this.prevFrame = mk(project.width, project.height);
    this.prevCtx = this.prevFrame.getContext('2d') as Ctx;
  }

  private panel(algo: string, clip: Clip): Panel | null {
    const key = recordingKey(algo, clip);
    let p = this.panels.get(key);
    if (!p) {
      const rec = this.recordings.get(key);
      if (!rec) return null;
      const tl = new Timeline(rec, 24 * 1024 * 1024);
      p = { tl, cache: buildViewCache(tl), total: tl.total, scratch: { compare: [], write: [] } };
      this.panels.set(key, p);
    }
    return p;
  }

  /** Locate clip and local time for a global time. */
  locate(t: number): { index: number; local: number; phase: 'intro' | 'clip' | 'outro' } {
    const p = this.project;
    if (t < p.intro) return { index: 0, local: 0, phase: 'intro' };
    let acc = p.intro;
    for (let i = 0; i < p.clips.length; i++) {
      if (t < acc + p.clips[i].duration) return { index: i, local: t - acc, phase: 'clip' };
      acc += p.clips[i].duration;
    }
    return { index: p.clips.length - 1, local: p.clips.length ? p.clips[p.clips.length - 1].duration : 0, phase: 'outro' };
  }

  /** Op position of every panel of a clip at local time. Shared clock in op units (battle-fair). */
  positions(clip: Clip, local: number): number[] {
    const ps = clip.algorithms.slice(0, LAYOUT_PANELS[clip.layout]).map((a) => this.panel(a, clip));
    const maxTotal = Math.max(1, ...ps.map((p) => p?.total ?? 0));
    const prog = Math.min(1, Math.max(0, local / sortSeconds(clip)));
    const ease = prog; // linear in operations: honest pacing
    const clock = ease * maxTotal;
    return ps.map((p) => (p ? Math.min(p.total, Math.round(clock)) : 0));
  }

  private rects(layout: ClipLayout, W: number, H0: number): { x: number; y: number; w: number; h: number }[] {
    const g = Math.round(Math.min(W, H0) * 0.012);
    const portrait = H0 > W;
    // multi-panel layouts reserve a title band so the title never covers panel labels
    const t = this.project.text;
    const band = layout !== 'single' && t.showTitle && t.position !== 'center' ? Math.round(Math.min(W, H0) * 0.06 * t.titleSize * 1.5) : 0;
    const y0 = t.position === 'top' ? band : 0;
    const H = H0 - band;
    const grid = (cols: number, rows: number) => {
      const out = [];
      const cw = (W - g * (cols + 1)) / cols;
      const ch = (H - g * (rows + 1)) / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: g + c * (cw + g), y: y0 + g + r * (ch + g), w: cw, h: ch });
      return out;
    };
    switch (layout) {
      case 'single':
        return [{ x: 0, y: 0, w: W, h: H }];
      case 'stack2':
        return grid(1, 2);
      case 'side2':
        return grid(2, 1);
      case 'grid4':
        return grid(2, 2);
      case 'grid8':
        return portrait ? grid(2, 4) : grid(4, 2);
      case 'grid16':
        return grid(4, 4);
    }
  }

  private options(viz: Viz2D, multi: boolean): RenderOptions {
    const p = this.project;
    return {
      viz,
      appearance: { ...p.appearance, viz, glow: multi ? p.appearance.glow * 0.6 : p.appearance.glow },
      sorting: { highlightCompare: true, highlightSwap: true, highlightPivot: true, highlightSorted: false },
      completionEffect: p.completion,
      reducedMotion: false,
      reducedFlashing: false,
      quality: 1,
      post: {
        vignette: p.cinematic.vignette,
        grain: p.cinematic.grain,
        grading: p.cinematic.grading,
        zoom: multi ? 1 : p.cinematic.zoom,
        cameraMotion: !multi && p.cinematic.cameraMotion,
        cameraSpeed: p.cinematic.cameraSpeed,
        backgroundAnimation: p.cinematic.backgroundAnimation,
        backgroundBlur: 0,
        glowBoost: p.cinematic.glow,
        particles: p.cinematic.particles,
      },
    };
  }

  private async ensureThree(w: number, h: number) {
    if (!this.threeModule) return null;
    if (!this.three) {
      this.threeCanvas = document.createElement('canvas');
      this.three = new this.threeModule.Renderer3D(this.threeCanvas, { interactive: false, preserveDrawingBuffer: true });
    }
    const key = `${w}x${h}`;
    if (key !== this.threeSize) {
      this.three.setSize(w, h, 1);
      this.threeSize = key;
    }
    return this.three;
  }

  /** Draw the frame at global time t (seconds). */
  async drawFrame(t: number): Promise<void> {
    const p = this.project;
    const W = p.width;
    const H = p.height;
    const ctx = this.ctx;
    const loc = this.locate(t);
    if (!p.clips.length) {
      ctx.fillStyle = '#050509';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const clip = p.clips[loc.index];
    const local = loc.phase === 'intro' ? 0 : loc.phase === 'outro' ? clip.duration : loc.local;
    // outgoing frame for transitions: always re-render the previous clip's final frame so the
    // result does not depend on render order (scrubbing the preview == sequential export)
    const inTransition = loc.phase === 'clip' && loc.index > 0 && clip.transition !== 'none' && loc.local < TRANSITION_SECONDS;
    if (inTransition && this.lastClipIndex !== loc.index) {
      const prevClip = p.clips[loc.index - 1];
      await this.drawClip(prevClip, prevClip.duration, t);
      this.drawText(prevClip, prevClip.duration, t, { phase: 'clip', index: loc.index - 1 });
      this.prevCtx.drawImage(this.canvas as CanvasImageSource, 0, 0);
      this.lastClipIndex = loc.index;
    }

    await this.drawClip(clip, local, t);

    // transition overlay at the beginning of a clip
    if (inTransition) {
      this.drawTransition(clip.transition, loc.local / TRANSITION_SECONDS);
    }
    this.drawText(clip, local, t, loc);
    if (loc.phase === 'intro') {
      const q = t / Math.max(0.001, p.intro);
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, 1 - q * 1.6).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (loc.phase === 'outro') this.drawOutro((t - (projectDuration(p) - p.outro)) / Math.max(0.001, p.outro));
  }

  private async drawClip(clip: Clip, local: number, t: number) {
    const p = this.project;
    const W = p.width;
    const H = p.height;
    const ctx = this.ctx;
    const count = LAYOUT_PANELS[clip.layout];
    const rects = this.rects(clip.layout, W, H);
    const pos = this.positions(clip, local);
    const multi = count > 1;
    const sortEnd = sortSeconds(clip);
    const completion = local > sortEnd ? Math.min(1, (local - sortEnd) / Math.max(0.3, Math.min(1.8, clip.duration - sortEnd))) : -1;
    ctx.fillStyle = p.appearance.bgColor1;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < count; i++) {
      const algo = clip.algorithms[i];
      const r = rects[i];
      const panel = algo ? this.panel(algo, clip) : null;
      if (!panel) continue;
      panel.tl.seek(pos[i]);
      const done = panel.tl.done;
      const finishedEarly = done && local <= sortEnd;
      const view = makeView(panel.tl, panel.cache, Math.max(1, Math.min(32, Math.round(panel.total / (sortEnd * p.fps)))), t, completion >= 0 && completion < 1 ? completion : -1, panel.scratch);
      if (is3D(clip.viz)) {
        const three = await this.ensureThree(Math.round(r.w), Math.round(r.h));
        if (three) {
          three.render(view, { viz: clip.viz as Viz3D, appearance: p.appearance, three: { ...p.three, autoRotate: p.cinematic.cameraMotion }, sorting: { highlightCompare: true, highlightSwap: true, highlightPivot: true }, reducedMotion: false, quality: 1, particleLimit: 30000 });
          ctx.drawImage(this.threeCanvas!, r.x, r.y, r.w, r.h);
        }
      } else {
        // render into the panel canvas region, then blit (keeps per-panel clipping simple)
        if (this.panelCanvas.width !== W || this.panelCanvas.height !== H) {
          this.panelCanvas.width = W;
          this.panelCanvas.height = H;
        }
        this.r2d.render(view, this.options(clip.viz as Viz2D, multi), { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
        ctx.drawImage(this.panelCanvas as CanvasImageSource, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      }
      if (multi) {
        const fs = Math.max(12, Math.round(Math.min(W, H) * (count > 8 ? 0.018 : 0.024)));
        ctx.save();
        ctx.font = `600 ${fs}px "Space Grotesk", "Inter Variable", sans-serif`;
        ctx.fillStyle = 'rgba(5,5,9,0.6)';
        const label = getAlgorithm(algo).name;
        const tw = ctx.measureText(label).width;
        ctx.fillRect(r.x + fs * 0.5, r.y + fs * 0.5, tw + fs, fs * 1.6);
        ctx.fillStyle = finishedEarly || done ? '#34d399' : '#f5f5fa';
        ctx.fillText(label, r.x + fs, r.y + fs * 1.65);
        if (p.text.showCounters) {
          const c = panel.tl.getCounters();
          ctx.font = `500 ${Math.round(fs * 0.75)}px "JetBrains Mono", monospace`;
          ctx.fillStyle = 'rgba(245,245,250,0.75)';
          ctx.fillText(`${c.operations.toLocaleString('en-US')} ops · ${c.comparisons.toLocaleString('en-US')} cmp`, r.x + fs, r.y + r.h - fs * 0.8);
        }
        ctx.restore();
      }
    }
  }

  private drawTransition(type: Transition, q: number) {
    const W = this.project.width;
    const H = this.project.height;
    const ctx = this.ctx;
    const prev = this.prevFrame as CanvasImageSource;
    const e = q * q * (3 - 2 * q);
    ctx.save();
    switch (type) {
      case 'crossfade':
        ctx.globalAlpha = 1 - e;
        ctx.drawImage(prev, 0, 0);
        break;
      case 'fade-black':
        if (q < 0.5) {
          ctx.drawImage(prev, 0, 0);
          ctx.fillStyle = `rgba(0,0,0,${(q * 2).toFixed(3)})`;
        } else ctx.fillStyle = `rgba(0,0,0,${(2 - q * 2).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
        break;
      case 'zoom': {
        const s = 1 + e * 0.6;
        ctx.globalAlpha = 1 - e;
        ctx.translate(W / 2, H / 2);
        ctx.scale(s, s);
        ctx.drawImage(prev, -W / 2, -H / 2);
        break;
      }
      case 'slide':
        ctx.drawImage(prev, -e * W, 0);
        break;
      case 'color-sweep': {
        ctx.beginPath();
        ctx.rect(e * W * 1.2, 0, W, H);
        ctx.clip();
        ctx.drawImage(prev, 0, 0);
        const gx = e * W * 1.2;
        const g = ctx.createLinearGradient(gx - W * 0.15, 0, gx + W * 0.02, 0);
        g.addColorStop(0, 'rgba(56,223,255,0)');
        g.addColorStop(0.6, 'rgba(168,85,247,0.7)');
        g.addColorStop(1, 'rgba(244,63,189,0.9)');
        ctx.restore();
        ctx.save();
        ctx.fillStyle = g;
        ctx.fillRect(gx - W * 0.15, 0, W * 0.17, H);
        break;
      }
      case 'spiral': {
        // previous frame survives outside a growing spiral wedge
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        const R = Math.hypot(W, H) * 0.6 * e;
        const cx = W / 2;
        const cy = H / 2;
        ctx.moveTo(cx + R, cy);
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.08) {
          const rr = R * (0.75 + 0.25 * Math.sin(a * 3 + e * 8));
          ctx.lineTo(cx + Math.cos(a + e * 3) * rr, cy + Math.sin(a + e * 3) * rr);
        }
        ctx.clip('evenodd');
        ctx.drawImage(prev, 0, 0);
        break;
      }
      case 'wipe': {
        ctx.beginPath();
        const off = e * (W + H);
        ctx.moveTo(off, 0);
        ctx.lineTo(W + H, 0);
        ctx.lineTo(W + H, H);
        ctx.lineTo(off - H, H);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(prev, 0, 0);
        break;
      }
    }
    ctx.restore();
  }

  private drawText(clip: Clip, local: number, t: number, loc: { phase: string; index: number }) {
    const p = this.project;
    const s = p.text;
    const W = p.width;
    const H = p.height;
    const ctx = this.ctx;
    const base = Math.min(W, H);
    const multi = LAYOUT_PANELS[clip.layout] > 1;
    const fs = Math.round(base * 0.06 * s.titleSize);
    const band = Math.round(base * 0.06 * s.titleSize * 1.5);
    const y = multi ? (s.position === 'top' ? band * 0.68 : s.position === 'bottom' ? H - band * 0.32 : H * 0.46) : s.position === 'top' ? H * 0.1 : s.position === 'center' ? H * 0.46 : H * 0.84;
    const appear = loc.phase === 'intro' ? Math.min(1, t / Math.max(0.3, p.intro * 0.8)) : Math.min(1, local / 0.9);
    ctx.save();
    ctx.textAlign = 'center';
    if (s.showTitle && (!multi || s.position !== 'center')) {
      const text = clip.title || (multi ? clip.algorithms.slice(0, LAYOUT_PANELS[clip.layout]).map((a) => getAlgorithm(a).name).join(' vs ') : getAlgorithm(clip.algorithms[0]).name);
      let shown = text;
      let dy = 0;
      let alpha = appear;
      let tracking = 0;
      if (s.animation === 'typewriter') {
        shown = text.slice(0, Math.ceil(text.length * Math.min(1, appear * 1.4)));
        alpha = 1;
      } else if (s.animation === 'fade-up') dy = (1 - appear) * fs * 0.6;
      else if (s.animation === 'tracking') tracking = (1 - appear) * fs * 0.4;
      else alpha = 1;
      ctx.globalAlpha = alpha;
      ctx.font = `600 ${multi ? Math.round(fs * 0.7) : fs}px "Space Grotesk", "Inter Variable", sans-serif`;
      ctx.fillStyle = s.color;
      ctx.shadowColor = 'rgba(56,223,255,0.35)';
      ctx.shadowBlur = fs * 0.4;
      if ('letterSpacing' in ctx && tracking) (ctx as any).letterSpacing = `${tracking.toFixed(1)}px`;
      ctx.fillText(shown, W / 2, y + dy);
      if ('letterSpacing' in ctx) (ctx as any).letterSpacing = '0px';
      ctx.shadowBlur = 0;
      const subParts: string[] = [];
      if (s.showSize) subParts.push(`${clip.n.toLocaleString('en-US')} ELEMENTS`);
      if (s.showComplexity && !multi) subParts.push(getAlgorithm(clip.algorithms[0]).average.toUpperCase());
      if (subParts.length && !multi) {
        ctx.font = `500 ${Math.round(fs * 0.28)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = 'rgba(245,245,250,0.6)';
        if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${(fs * 0.06).toFixed(1)}px`;
        ctx.fillText(subParts.join('  ·  '), W / 2, y + dy + fs * 0.62);
        if ('letterSpacing' in ctx) (ctx as any).letterSpacing = '0px';
      }
    }
    if (s.showCounters && !multi && loc.phase !== 'intro') {
      const panel = this.panel(clip.algorithms[0], clip);
      if (panel) {
        const c = panel.tl.getCounters();
        ctx.globalAlpha = 0.85;
        ctx.font = `500 ${Math.round(base * 0.022)}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#f5f5fa';
        const cy = s.position === 'bottom' ? H * 0.08 : H * 0.94;
        ctx.fillText(`${c.operations.toLocaleString('en-US')} ops   ·   ${c.comparisons.toLocaleString('en-US')} comparisons   ·   ${c.writes.toLocaleString('en-US')} writes`, W / 2, cy);
      }
    }
    if (s.showWinner && multi && local > sortSeconds(clip) * 0.98) {
      const ids = clip.algorithms.slice(0, LAYOUT_PANELS[clip.layout]);
      let best = ids[0];
      let bestT = Infinity;
      for (const a of ids) {
        const pnl = this.panel(a, clip);
        if (pnl && pnl.total < bestT) {
          bestT = pnl.total;
          best = a;
        }
      }
      ctx.globalAlpha = Math.min(1, (local - sortSeconds(clip) * 0.98) / 0.5);
      const f2 = Math.round(base * 0.045);
      ctx.font = `600 ${f2}px "Space Grotesk", sans-serif`;
      ctx.fillStyle = 'rgba(5,5,9,0.72)';
      const label = `🏆 ${getAlgorithm(best).name} — fewest operations`;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(W / 2 - tw / 2 - f2 * 0.6, H / 2 - f2 * 1.1, tw + f2 * 1.2, f2 * 1.7);
      ctx.fillStyle = '#facc15';
      ctx.fillText(label, W / 2, H / 2 + f2 * 0.15);
    }
    if (p.branding) {
      ctx.globalAlpha = 0.55;
      ctx.textAlign = 'right';
      ctx.font = `600 ${Math.round(base * 0.018)}px "Space Grotesk", sans-serif`;
      ctx.fillStyle = '#f5f5fa';
      ctx.fillText('SortClaude 5.5', W - base * 0.03, H - base * 0.03);
    }
    ctx.restore();
  }

  private drawOutro(q: number) {
    const W = this.project.width;
    const H = this.project.height;
    const ctx = this.ctx;
    const base = Math.min(W, H);
    ctx.save();
    ctx.fillStyle = `rgba(5,5,9,${Math.min(0.85, q * 1.5).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = Math.min(1, q * 2);
    ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round(base * 0.07)}px "Space Grotesk", sans-serif`;
    const g = ctx.createLinearGradient(W * 0.3, 0, W * 0.7, 0);
    g.addColorStop(0, '#38dfff');
    g.addColorStop(0.5, '#a855f7');
    g.addColorStop(1, '#f43fbd');
    ctx.fillStyle = g;
    ctx.fillText('Sorted.', W / 2, H / 2);
    if (this.project.branding) {
      ctx.font = `500 ${Math.round(base * 0.022)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(245,245,250,0.7)';
      ctx.fillText('made with SortClaude 5.5', W / 2, H / 2 + base * 0.06);
    }
    ctx.restore();
  }

  /**
   * Note events for the whole project, timed to the frames on which their ops are displayed.
   * The same sampling as live playback (notesForOps) is used.
   */
  collectNotes(): { time: number; ev: NoteEvent; gain: number }[] {
    const p = this.project;
    const out: { time: number; ev: NoteEvent; gain: number }[] = [];
    let start = p.intro;
    for (const clip of p.clips) {
      const frames = Math.round(clip.duration * p.fps);
      const panels = clip.algorithms.slice(0, LAYOUT_PANELS[clip.layout]).map((a) => this.panel(a, clip));
      const prev = panels.map(() => 0);
      const audioPanels = Math.min(panels.length, 4);
      for (let f = 0; f < frames; f++) {
        const local = f / p.fps;
        const pos = this.positions(clip, local);
        for (let i = 0; i < audioPanels; i++) {
          const pn = panels[i];
          if (!pn) continue;
          if (pos[i] > prev[i]) {
            pn.tl.seek(pos[i]);
            const notes = notesForOps(pn.tl, prev[i], pos[i], { ...p.audio, density: Math.max(1, Math.round(p.audio.density / audioPanels)) }, pn.cache.minKey, pn.cache.maxKey);
            for (const ev of notes) out.push({ time: start + local, ev, gain: clip.audio / Math.sqrt(Math.max(1, notes.length * audioPanels)) });
          }
          prev[i] = pos[i];
        }
      }
      start += clip.duration;
    }
    return out;
  }

  dispose() {
    this.three?.dispose();
    this.three = null;
    this.panels.clear();
  }
}
