import { useEffect, useRef } from 'react';
import { executeSort } from '../core/execute';
import { generatePattern } from '../core/patterns';
import { Player } from '../engine/player';
import { drawMode, Frame, RenderOpts } from '../render/renderer';
import { buildPalette } from '../render/palette';

const N = 48;
const BG = '#08080c';

function render(c: HTMLCanvasElement, p: Player) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(c.clientWidth * dpr);
  const h = Math.round(c.clientHeight * dpr);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  const f: Frame = {
    n: p.n,
    values: p.arr,
    heights: p.heights,
    offsets: p.offsets,
    hlType: p.hlType,
    hlAge: p.hlAge,
    maxValue: p.maxValue,
    minValue: 1,
    sweep: -1,
    sweepFail: -1,
    time: 0,
  };
  const o: RenderOpts = {
    palette: buildPalette('rainbow', p.maxValue, 1, '#000000', '#ffffff'),
    background: BG,
    compareColor: '#ffffff',
    swapColor: '#ff2e63',
    writeColor: '#35f2a0',
    sweepColor: '#3dffa2',
    failColor: '#ff3355',
    showHighlights: true,
    barWidth: 0.7,
    barSpacing: 0,
    glow: 0,
    migraineIntensity: 0,
    reducedMotion: true,
    dpr,
  };
  const top = 30 * dpr;
  g.save();
  g.translate(0, top);
  drawMode(g, 'bars', f, w, h - top, o);
  g.restore();
}

/** Tiny live replay of an algorithm on 48 elements; plays while `active`. */
export default function MiniPreview({ algorithmId, active, slow }: { algorithmId: string; active: boolean; slow?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const player = useRef<Player | null>(null);

  useEffect(() => {
    const p = new Player();
    const n = slow ? 7 : N;
    p.load(generatePattern('random', n, 17));
    player.current = p;
    if (ref.current) render(ref.current, p);
  }, [algorithmId, slow]);

  useEffect(() => {
    const c = ref.current;
    const p = player.current;
    if (!c || !p) return;
    if (!active) {
      p.load(p.initial);
      render(c, p);
      return;
    }
    if (p.totalOps === 0) {
      const res = executeSort({ id: 0, algorithmId, values: p.initial, opLimit: 200_000, seed: 3, record: true });
      p.load(p.initial, res.trace);
    } else p.load(p.initial, p.trace);
    const rate = Math.max(30, p.totalOps / 2.6);
    let raf = 0;
    let last = 0;
    let hold = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
      last = ts;
      if (p.done) {
        hold += dt;
        if (hold > 1.2) {
          hold = 0;
          p.load(p.initial, p.trace);
        }
      } else p.tick(dt, rate);
      p.animate(dt, 0.55, 8);
      render(c, p);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, algorithmId]);

  return <canvas ref={ref} className="block h-full w-full" aria-hidden />;
}
