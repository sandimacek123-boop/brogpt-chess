import { useEffect, useRef, useState } from 'react';
import type { VisualizerController } from '../../engine/visualizer';

/**
 * Video-editor style scrubber. The background is an activity waveform of the whole run
 * (bright = swaps/writes, dim = comparisons), so you can see an algorithm's phases and
 * drag straight to them.
 */
export default function Timeline({ controller, traceVersion }: { controller: VisualizerController; traceVersion: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; op: number } | null>(null);
  const dragging = useRef(false);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const g = c.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, w, h);
      const p = controller.player;
      const prog = p.totalOps ? p.pos / p.totalOps : 0;
      const act = controller.activity;
      const mid = h * 0.5;
      const grad = g.createLinearGradient(0, 0, w, 0);
      ['#ff3b5c', '#ff8a3b', '#ffd23b', '#3bff8a', '#3bd8ff', '#7b5cff', '#ff3bd8'].forEach((col, i) => grad.addColorStop(i / 6, col));
      if (act) {
        const n = act.moves.length;
        const bw = w / n;
        for (let i = 0; i < n; i++) {
          const x = i * bw;
          const played = (i + 0.5) / n <= prog;
          const mh = Math.max(dpr, act.moves[i] * mid * 0.92);
          const ch = Math.max(dpr * 0.5, act.compares[i] * mid * 0.55);
          g.globalAlpha = played ? 0.95 : 0.22;
          g.fillStyle = grad;
          g.fillRect(x, mid - mh, Math.max(dpr, bw - dpr * 0.6), mh * 2);
          g.globalAlpha = played ? 0.35 : 0.1;
          g.fillStyle = '#ffffff';
          g.fillRect(x, mid - ch, Math.max(dpr, bw - dpr * 0.6), ch * 2);
        }
        g.globalAlpha = 1;
      } else {
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(0, mid - dpr / 2, w, dpr);
      }
      if (act) {
        const x = prog * w;
        const glow = g.createRadialGradient(x, mid, 0, x, mid, 18 * dpr);
        glow.addColorStop(0, 'rgba(255,255,255,0.35)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = glow;
        g.fillRect(x - 18 * dpr, 0, 36 * dpr, h);
        g.fillStyle = '#fff';
        g.fillRect(x - dpr, 0, 2 * dpr, h);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [controller, traceVersion]);

  const opAt = (clientX: number) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return { x: clientX - r.left, op: Math.round(t * controller.player.totalOps) };
  };

  const schedule = (op: number) => {
    const first = pending.current === null;
    pending.current = op;
    if (first)
      requestAnimationFrame(() => {
        if (pending.current !== null) controller.seek(pending.current);
        pending.current = null;
      });
  };

  const enabled = !!controller.activity;
  return (
    <div className="relative">
      <canvas
        ref={ref}
        className={`block h-11 w-full ${enabled ? 'cursor-ew-resize' : 'cursor-default'}`}
        aria-label="Timeline — drag to scrub through the sort"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={controller.player.totalOps}
        aria-valuenow={controller.player.pos}
        tabIndex={enabled ? 0 : -1}
        onPointerDown={(e) => {
          if (!enabled) return;
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          schedule(opAt(e.clientX).op);
        }}
        onPointerMove={(e) => {
          if (!enabled) return;
          const a = opAt(e.clientX);
          setHover(a);
          if (dragging.current) schedule(a.op);
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => setHover(null)}
      />
      {hover && enabled && (
        <div
          className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-white px-2 py-0.5 font-mono text-[10.5px] font-medium text-ink-950 tnum"
          style={{ left: hover.x }}
        >
          op {hover.op.toLocaleString('en-US')}
        </div>
      )}
    </div>
  );
}
