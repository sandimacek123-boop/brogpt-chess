import { useState } from 'react';
import { CLASS_INFO, MoveClass } from '../chess/review';

/**
 * White's win probability across the game (area above = White better). Mistakes and
 * blunders are marked; click anywhere to jump to that move.
 */
export default function EvalGraph({
  wins,
  classes,
  current,
  onSelect,
}: {
  /** White win% for each position (index = ply), null while not analysed. */
  wins: (number | null)[];
  classes: (MoveClass | undefined)[];
  current: number;
  onSelect: (ply: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 140;
  const n = Math.max(1, wins.length - 1);
  const x = (i: number) => (i / n) * W;
  const y = (w: number) => H - (w / 100) * H;
  const pts = wins.map((w, i) => (w === null ? null : [x(i), y(w)] as const));
  const known = pts.filter(Boolean) as (readonly [number, number])[];
  const path = known.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = known.length ? `${path} L${known[known.length - 1][0].toFixed(1)},${H} L0,${H} Z` : '';
  const pick = (clientX: number, rect: DOMRect) => Math.max(0, Math.min(wins.length - 1, Math.round(((clientX - rect.left) / rect.width) * n)));
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-36 w-full cursor-pointer rounded-xl bg-[#1f1d2b]"
        onMouseMove={(e) => setHover(pick(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSelect(pick(e.clientX, e.currentTarget.getBoundingClientRect()))}
        role="img"
        aria-label="Evaluation graph"
      >
        <path d={area} fill="#efedf7" opacity={0.92} />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#8b7bff" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {classes.map((c, i) => {
          if (!c || (c !== 'mistake' && c !== 'blunder' && c !== 'inaccuracy')) return null;
          const p = pts[i + 1];
          if (!p) return null;
          return <circle key={i} cx={p[0]} cy={p[1]} r={c === 'inaccuracy' ? 5 : 7} fill={CLASS_INFO[c].color} stroke="#1f1d2b" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
        })}
        <line x1={x(current)} x2={x(current)} y1={0} y2={H} stroke="#8b7bff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="#fff" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      {hover !== null && wins[hover] !== null && (
        <div
          className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-white px-2 py-0.5 font-mono text-[10.5px] text-ink-950"
          style={{ left: `${(hover / n) * 100}%` }}
        >
          ply {hover} · White {Math.round(wins[hover]!)}%
        </div>
      )}
    </div>
  );
}
