// Converts the official REAL logo SVG (pixel-traced polygon paths) into smooth,
// simplified contours for 3D extrusion and line-drawing animation.
// Output: src/logo.json  ->  { shapes: [[x,y,...], ...] } in units where logo height = 2.0, centered.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'assets/official/real-logo.svg'), 'utf8');
const ds = [...svg.matchAll(/ d="([^"]+)"/g)].map(m => m[1]);

const loops = [];
for (const d of ds) {
  for (const sub of d.split(/(?=M)/).filter(s => s.trim())) {
    const pts = [...sub.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map(m => [+m[1], +m[2]]);
    loops.push(pts);
  }
}

// circular moving-average smoothing (kills the 1px staircase)
function smooth(pts, win) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, w = 0;
    for (let k = -win; k <= win; k++) {
      const p = pts[(i + k + n) % n];
      const wk = 1 - Math.abs(k) / (win + 1);
      sx += p[0] * wk; sy += p[1] * wk; w += wk;
    }
    out.push([sx / w, sy / w]);
  }
  return out;
}
// resample closed loop at uniform arc length
function resample(pts, step) {
  const n = pts.length, out = [];
  let acc = 0;
  out.push(pts[0]);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - acc;
    while (t <= seg) {
      out.push([a[0] + (b[0] - a[0]) * t / seg, a[1] + (b[1] - a[1]) * t / seg]);
      t += step;
    }
    acc = seg - (t - step);
  }
  out.pop();
  return out;
}
// Ramer–Douglas–Peucker on an open polyline
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = -1, dmax = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  return [a, b];
}

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const l of loops) for (const [x, y] of l) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, s = 2 / (maxY - minY);

const shapes = loops.map(l => {
  let p = resample(l, 1.0);
  p = smooth(p, 3);
  p = resample(p, 1.5);
  p = smooth(p, 2);
  // split loop in half for RDP stability, then rejoin
  const half = Math.floor(p.length / 2);
  const a = rdp(p.slice(0, half + 1), 0.35), b = rdp(p.slice(half).concat([p[0]]), 0.35);
  const q = a.slice(0, -1).concat(b.slice(0, -1));
  const flat = [];
  for (const [x, y] of q) flat.push(+((x - cx) * s).toFixed(5), +(-(y - cy) * s).toFixed(5)); // flip Y for 3D
  return flat;
});

fs.writeFileSync(path.join(root, 'src/logo.json'), JSON.stringify({ aspect: (maxX - minX) / (maxY - minY), shapes }));
console.log('logo shapes:', shapes.map(s => s.length / 2), 'aspect', ((maxX - minX) / (maxY - minY)).toFixed(3));
