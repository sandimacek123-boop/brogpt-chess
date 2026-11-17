import { useMemo, useRef, useState } from 'react';

/** Categorical palette (validated for the #0e0e17 surface: CVD ΔE ≥ 8.4, normal ΔE ≥ 19.3, contrast ≥ 3:1). */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];
export const MAX_SERIES = SERIES_COLORS.length;

export interface Series {
  id: string;
  name: string;
  color: string;
  points: { x: number; y: number }[];
}

function niceTicks(min: number, max: number, count: number, log: boolean): number[] {
  if (log) {
    const lo = Math.floor(Math.log10(Math.max(min, 1e-9)));
    const hi = Math.ceil(Math.log10(Math.max(max, 1e-9)));
    const out: number[] = [];
    for (let e = lo; e <= hi; e++) out.push(Math.pow(10, e));
    return out;
  }
  const span = max - min || 1;
  const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (count * step0) / span;
  const step = err <= 0.15 ? step0 * 10 : err <= 0.35 ? step0 * 5 : err <= 0.75 ? step0 * 2 : step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.001; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

export function compact(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  if (a >= 10 || a === 0) return `${Math.round(v)}`;
  return v.toPrecision(2);
}

/** Single-axis line chart with crosshair tooltip, legend and direct end labels (≤ 4 series). */
export function LineChart({ title, series, xLabel, yLabel, logX, logY, yFormat = compact, height = 260 }: { title: string; series: Series[]; xLabel: string; yLabel: string; logX?: boolean; logY?: boolean; yFormat?: (v: number) => string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = height;
  const m = { l: 56, r: series.length <= 4 ? 96 : 16, t: 12, b: 36 };
  const all = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.y) && (!logY || p.y > 0));
  const xs = Array.from(new Set(all.map((p) => p.x))).sort((a, b) => a - b);
  const minX = xs[0] ?? 0;
  const maxX = xs[xs.length - 1] ?? 1;
  const minY = logY ? Math.min(...all.map((p) => p.y)) : 0;
  const maxY = Math.max(...all.map((p) => p.y), logY ? 1 : 0);
  const tf = (v: number, lo: number, hi: number, log?: boolean) => {
    if (log) {
      const a = Math.log10(Math.max(lo, 1e-9));
      const b = Math.log10(Math.max(hi, 1e-9));
      return b === a ? 0.5 : (Math.log10(Math.max(v, 1e-9)) - a) / (b - a);
    }
    return hi === lo ? 0.5 : (v - lo) / (hi - lo);
  };
  const yTicks = niceTicks(minY, maxY, 5, !!logY);
  const yLo = logY ? yTicks[0] : 0;
  const yHi = logY ? yTicks[yTicks.length - 1] : Math.max(maxY, yTicks[yTicks.length - 1] ?? 1);
  const px = (x: number) => m.l + tf(x, minX, maxX, logX) * (W - m.l - m.r);
  const py = (y: number) => H - m.b - tf(y, yLo, yHi, logY) * (H - m.t - m.b);
  if (!all.length) return <div className="card"><h3>{title}</h3><div className="empty">No data yet</div></div>;
  const hx = hover !== null ? xs[hover] : null;
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="row-wrap" style={{ marginBottom: 6, gap: 12 }}>
        {series.length > 1 && series.map((s) => (
          <span key={s.id} className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i style={{ width: 14, height: 2, background: s.color, display: 'inline-block', borderRadius: 2 }} />{s.name}
          </span>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title}
          onMouseMove={(e) => {
            const r = ref.current!.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            let bd = Infinity;
            xs.forEach((v, i) => {
              const d = Math.abs(px(v) - x);
              if (d < bd) {
                bd = d;
                best = i;
              }
            });
            setHover(best);
          }}
          onMouseLeave={() => setHover(null)}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={py(t)} y2={py(t)} stroke="rgba(255,255,255,0.06)" />
              <text x={m.l - 8} y={py(t) + 4} fill="#9999b2" fontSize="10.5" textAnchor="end" fontFamily="JetBrains Mono">{yFormat(t)}</text>
            </g>
          ))}
          {xs.map((x) => (
            <text key={x} x={px(x)} y={H - m.b + 16} fill="#9999b2" fontSize="10.5" textAnchor="middle" fontFamily="JetBrains Mono">{compact(x)}</text>
          ))}
          <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} stroke="rgba(255,255,255,0.18)" />
          <text x={(m.l + W - m.r) / 2} y={H - 4} fill="#66667e" fontSize="10.5" textAnchor="middle">{xLabel}{logX ? ' (log)' : ''}</text>
          <text x={12} y={H / 2} fill="#66667e" fontSize="10.5" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>{yLabel}{logY ? ' (log)' : ''}</text>
          {hx !== null && <line x1={px(hx)} x2={px(hx)} y1={m.t} y2={H - m.b} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />}
          {series.map((s) => {
            const pts = s.points.filter((p) => Number.isFinite(p.y) && (!logY || p.y > 0)).sort((a, b) => a.x - b.x);
            if (!pts.length) return null;
            const d = pts.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join('');
            const last = pts[pts.length - 1];
            return (
              <g key={s.id}>
                <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p) => <circle key={p.x} cx={px(p.x)} cy={py(p.y)} r={hx === p.x ? 5 : 3.2} fill={s.color} stroke="#0e0e17" strokeWidth="2" />)}
                {series.length <= 4 && <text x={px(last.x) + 8} y={py(last.y) + 4} fill="#f5f5fa" fontSize="10.5">{s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name}</text>}
              </g>
            );
          })}
        </svg>
        {hx !== null && (
          <div style={{ position: 'absolute', top: 4, left: `${Math.min(70, (px(hx) / W) * 100 + 2)}%`, background: 'rgba(14,14,23,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 10px', pointerEvents: 'none', fontSize: 11.5, minWidth: 150 }}>
            <div className="muted" style={{ marginBottom: 4 }}>{xLabel} = {hx.toLocaleString()}</div>
            {series
              .map((s) => ({ s, p: s.points.find((p) => p.x === hx) }))
              .filter((r) => r.p)
              .sort((a, b) => b.p!.y - a.p!.y)
              .map(({ s, p }) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />{s.name}</span>
                  <b className="mono" style={{ fontWeight: 500 }}>{yFormat(p!.y)}</b>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Horizontal ranking bars (one measure, one axis). */
export function RankBars({ title, rows, format }: { title: string; rows: { id: string; name: string; value: number; color: string }[]; format: (v: number) => string }) {
  const [hover, setHover] = useState<string | null>(null);
  const sorted = useMemo(() => [...rows].filter((r) => Number.isFinite(r.value)).sort((a, b) => a.value - b.value), [rows]);
  const max = Math.max(...sorted.map((r) => r.value), 1e-9);
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="stack" style={{ gap: 6 }}>
        {sorted.map((r, i) => (
          <div key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} style={{ display: 'grid', gridTemplateColumns: '22px 150px 1fr 90px', alignItems: 'center', gap: 10, opacity: hover && hover !== r.id ? 0.55 : 1 }} title={`${r.name}: ${format(r.value)}`}>
            <span className="mono dim">{i + 1}</span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
            <div style={{ height: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
              <div style={{ height: '100%', width: `${Math.max(1, (r.value / max) * 100)}%`, background: r.color, borderRadius: '0 4px 4px 0' }} />
            </div>
            <span className="mono small" style={{ textAlign: 'right' }}>{format(r.value)}</span>
          </div>
        ))}
        {!sorted.length && <div className="empty">No data yet</div>}
      </div>
    </div>
  );
}
