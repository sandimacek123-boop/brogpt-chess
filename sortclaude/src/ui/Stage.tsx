import React, { useEffect, useRef, useState } from 'react';
import { player } from '../state/player';
import { useApp } from '../state/store';
import { Renderer2D, type RenderOptions } from '../render/renderer2d';
import { is3D, type Settings, type Viz2D, type Viz3D } from '../state/settings';
import type { RenderView } from '../render/view';

export function qualityValue(q: Settings['performance']['quality'], fps: number, adaptiveLevel: number): number {
  switch (q) {
    case 'low':
      return 0.25;
    case 'medium':
      return 0.5;
    case 'high':
      return 0.75;
    case 'ultra':
      return 1;
    default:
      return adaptiveLevel;
  }
}

export function renderOptions(st: Settings, quality: number, cinematic: boolean): RenderOptions {
  const viz = (is3D(st.appearance.viz) ? 'bars' : st.appearance.viz) as Viz2D;
  return {
    viz,
    appearance: st.appearance,
    sorting: st.sorting,
    completionEffect: st.general.reducedFlashing && st.cinematic.completion === 'particle-burst' ? 'fade' : st.cinematic.completion,
    reducedMotion: st.general.reducedMotion,
    reducedFlashing: st.general.reducedFlashing,
    quality,
    post: cinematic
      ? {
          vignette: st.cinematic.vignette,
          grain: st.general.reducedFlashing ? 0 : st.cinematic.grain,
          grading: st.cinematic.grading,
          zoom: st.cinematic.zoom,
          cameraMotion: st.cinematic.cameraMotion && !st.general.reducedMotion,
          cameraSpeed: st.cinematic.cameraSpeed,
          backgroundAnimation: st.cinematic.backgroundAnimation,
          backgroundBlur: st.cinematic.backgroundBlur,
          glowBoost: st.cinematic.glow,
          particles: st.cinematic.particles,
        }
      : undefined,
  };
}

/**
 * Hosts the active visualization. Switching between 2D and 3D swaps the canvas but never
 * touches the timeline, so the sorting state is preserved exactly.
 */
export function Stage({ cinematic = false }: { cinematic?: boolean }) {
  const viz = useApp((s) => s.settings.appearance.viz);
  const threeD = is3D(viz);
  const [webglFailed, setWebglFailed] = useState(false);
  return threeD && !webglFailed ? <Stage3D key="3d" onFail={() => setWebglFailed(true)} viz={viz as Viz3D} /> : <Stage2D key="2d" cinematic={cinematic} fallbackFrom3D={threeD} />;
}

function useCanvasSize(ref: React.RefObject<HTMLElement>, cb: (w: number, h: number) => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      cb(r.width, r.height);
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    cb(r.width, r.height);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Adaptive quality: lowers expensive effects when the measured frame rate drops. Never alters sort data. */
export class Adaptive {
  level = 1;
  private lastChange = 0;
  update(fps: number, target: number, enabled: boolean): number {
    if (!enabled) return (this.level = 1);
    const now = performance.now();
    if (now - this.lastChange < 1500) return this.level;
    if (fps < target * 0.72 && this.level > 0.25) {
      this.level = Math.max(0.25, this.level - 0.25);
      this.lastChange = now;
    } else if (fps > target * 0.95 && this.level < 1) {
      this.level = Math.min(1, this.level + 0.25);
      this.lastChange = now;
    }
    return this.level;
  }
}

function Stage2D({ cinematic, fallbackFrom3D }: { cinematic: boolean; fallbackFrom3D: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 1, h: 1 });
  const adaptive = useRef(new Adaptive());

  useCanvasSize(hostRef, (w, h) => (size.current = { w, h }));

  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: Renderer2D;
    try {
      renderer = new Renderer2D(canvas);
    } catch (e) {
      useApp.getState().toast((e as Error).message, 'error');
      return;
    }
    let lastView: RenderView | null = null;
    const off = player.onFrame((view) => {
      const st = useApp.getState().settings;
      const level = adaptive.current.update(player.fps, st.performance.targetFps, st.performance.adaptive && st.performance.quality === 'auto');
      const q = qualityValue(st.performance.quality, player.fps, level);
      const dpr = Math.min(2, window.devicePixelRatio || 1) * st.performance.renderScale * (q < 0.5 ? 0.75 : 1);
      const w = Math.max(1, Math.round(size.current.w * dpr));
      const h = Math.max(1, Math.round(size.current.h * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const v = view ?? lastView;
      lastView = v;
      const opts = renderOptions(st, q, cinematic || useApp.getState().cinematic);
      if (!v) {
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = st.appearance.bgColor1;
        ctx.fillRect(0, 0, w, h);
        return;
      }
      renderer.render(v, opts);
    });
    return off;
  }, [cinematic]);

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} aria-label="Sorting visualization" role="img" />
      {fallbackFrom3D && (
        <div className="stage-corner" style={{ top: 12, bottom: 'auto' }}>
          <span className="chip warn">WebGL unavailable — showing 2D fallback</span>
        </div>
      )}
    </div>
  );
}

function Stage3D({ viz, onFail }: { viz: Viz3D; onFail: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<import('../render/three/renderer3d').Renderer3D | null>(null);
  const size = useRef({ w: 1, h: 1, changed: true });
  const adaptive = useRef(new Adaptive());
  const [loading, setLoading] = useState(true);
  useCanvasSize(hostRef, (w, h) => (size.current = { w, h, changed: true }));

  useEffect(() => {
    let off: (() => void) | null = null;
    let disposed = false;
    (async () => {
      const mod = await import('../render/three/renderer3d');
      if (disposed) return;
      if (!mod.webglAvailable()) {
        onFail();
        return;
      }
      let r: InstanceType<typeof mod.Renderer3D>;
      try {
        r = new mod.Renderer3D(canvasRef.current!, { interactive: true });
      } catch {
        onFail();
        return;
      }
      rendererRef.current = r;
      setLoading(false);
      let lastView: RenderView | null = null;
      let lastScale = 0;
      off = player.onFrame((view) => {
        const st = useApp.getState().settings;
        const level = adaptive.current.update(player.fps, st.performance.targetFps, st.performance.adaptive && st.performance.quality === 'auto');
        const q = qualityValue(st.performance.quality, player.fps, level);
        const scale = Math.min(2, window.devicePixelRatio || 1) * st.three.renderScale * st.performance.renderScale * (q < 0.5 ? 0.7 : 1);
        if (size.current.changed || scale !== lastScale) {
          r.setSize(size.current.w, size.current.h, scale);
          size.current.changed = false;
          lastScale = scale;
        }
        const v = view ?? lastView;
        lastView = v;
        if (!v) return;
        r.render(v, {
          viz: useApp.getState().settings.appearance.viz as Viz3D,
          appearance: st.appearance,
          three: st.three,
          sorting: st.sorting,
          reducedMotion: st.general.reducedMotion,
          quality: q,
          particleLimit: st.performance.particleLimit,
        });
      });
    })();
    return () => {
      disposed = true;
      off?.();
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => {
      const st = useApp.getState().settings;
      rendererRef.current?.resetCamera(st.three.cameraPreset, viz);
    };
    window.addEventListener('sortclaude:reset-camera', handler);
    return () => window.removeEventListener('sortclaude:reset-camera', handler);
  }, [viz]);

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} aria-label="3D sorting visualization" role="img" />
      {loading && (
        <div className="stage-overlay">
          <div className="stage-msg"><span className="spinner" /> &nbsp;Loading 3D engine…</div>
        </div>
      )}
      <div className="stage-corner"><span className="chip">Drag to orbit · scroll to zoom · right-drag to pan</span></div>
    </div>
  );
}
