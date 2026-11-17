import { useEffect, useRef } from 'react';
import type { Line } from '../chess/line';
import { CLASS_INFO, MoveClass } from '../chess/review';

/** Two-column move list. `current` is the ply shown on the board (0 = start). */
export default function MoveList({
  line,
  current,
  onSelect,
  classes,
}: {
  line: Line;
  current: number;
  onSelect: (ply: number) => void;
  classes?: (MoveClass | undefined)[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector(`[data-ply="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);
  const blackFirst = line.startFen.split(' ')[1] === 'b';
  const startNo = Number(line.startFen.split(' ')[5]) || 1;
  const rows: { no: number; w?: number; b?: number }[] = [];
  let ply = 1;
  if (blackFirst && line.plies.length) {
    rows.push({ no: startNo, b: 1 });
    ply = 2;
  }
  for (let no = blackFirst ? startNo + 1 : startNo; ply <= line.plies.length; no++) {
    const r: { no: number; w?: number; b?: number } = { no, w: ply++ };
    if (ply <= line.plies.length) r.b = ply++;
    rows.push(r);
  }
  const cell = (p?: number) => {
    if (!p) return <span />;
    const cls = classes?.[p - 1];
    const info = cls ? CLASS_INFO[cls] : null;
    const showMark = cls && cls !== 'best' && cls !== 'excellent' && cls !== 'good' && cls !== 'book';
    return (
      <button
        type="button"
        data-ply={p}
        onClick={() => onSelect(p)}
        className={`flex items-center justify-between gap-1 rounded-md px-2 py-1 text-left font-mono text-[13px] transition ${
          p === current ? 'bg-white/[0.12] text-white' : 'text-ink-200 hover:bg-white/[0.05]'
        }`}
      >
        <span className="truncate">{line.plies[p - 1].san}</span>
        {showMark && info && (
          <span className="shrink-0 text-[11px] font-bold" style={{ color: info.color }} title={info.label}>
            {info.symbol}
          </span>
        )}
      </button>
    );
  };
  return (
    <div ref={ref} className="max-h-full overflow-y-auto pr-1" role="list" aria-label="Moves">
      {rows.length === 0 && <p className="px-2 py-3 text-[13px] text-ink-400">No moves yet.</p>}
      <div className="grid grid-cols-[2.4rem_1fr_1fr] gap-x-1 gap-y-0.5">
        {rows.map((r) => (
          <div key={r.no} className="contents" role="listitem">
            <span className="py-1 pr-1 text-right font-mono text-[12px] text-ink-500">{r.no}.</span>
            {r.w ? cell(r.w) : <span className="px-2 py-1 font-mono text-[13px] text-ink-500">…</span>}
            {cell(r.b)}
          </div>
        ))}
      </div>
    </div>
  );
}
