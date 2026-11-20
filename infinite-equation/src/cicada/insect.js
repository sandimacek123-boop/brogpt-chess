// Original geometric cicada line-art (top view, head up), built from bezier
// curves and mirrored. Returns polylines grouped by role so each group can be
// lit / animated separately. Units: ~4.5 tall.
import * as THREE from 'three';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const cubic = (p0, p1, p2, p3, n = 40) => Array.from({ length: n }, (_, i) => {
  const t = i / (n - 1), u = 1 - t;
  return V(
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  );
});
const cat = (...parts) => parts.reduce((a, p) => a.concat(a.length ? p.slice(1) : p), []);
const circle = (cx, cy, r, n = 48) => Array.from({ length: n + 1 }, (_, i) => V(cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)));
const mirror = (pl) => pl.map((p) => V(-p.x, p.y, p.z));
const both = (pl) => [pl, mirror(pl)];
const evalCubic = (c, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t * t * t * c[3][k]); };

export function cicadaLines() {
  const body = [], eyes = [], wingR = [], veinR = [];
  // head (closed outline)
  body.push(cat(
    cubic([-0.62, 1.3], [-0.64, 1.42], [-0.62, 1.52], [-0.56, 1.6], 12),
    cubic([-0.56, 1.6], [-0.3, 1.84], [0.3, 1.84], [0.56, 1.6], 30),
    cubic([0.56, 1.6], [0.62, 1.52], [0.64, 1.42], [0.62, 1.3], 12),
    cubic([0.62, 1.3], [0.3, 1.24], [-0.3, 1.24], [-0.62, 1.3], 24),
  ));
  // frons groove
  body.push(cubic([0, 1.3], [0, 1.45], [0, 1.6], [0, 1.74], 12));
  eyes.push(circle(0.74, 1.46, 0.17), circle(-0.74, 1.46, 0.17));
  eyes.push(circle(0, 1.58, 0.035, 16), circle(0.12, 1.5, 0.03, 16), circle(-0.12, 1.5, 0.03, 16));
  // pronotum
  body.push(cat(
    cubic([-0.62, 1.27], [-0.7, 1.12], [-0.8, 0.98], [-0.82, 0.86], 14),
    cubic([-0.82, 0.86], [-0.4, 0.8], [0.4, 0.8], [0.82, 0.86], 30),
    cubic([0.82, 0.86], [0.8, 0.98], [0.7, 1.12], [0.62, 1.27], 14),
    cubic([0.62, 1.27], [0.3, 1.22], [-0.3, 1.22], [-0.62, 1.27], 24),
  ));
  body.push(...both(cubic([0.25, 1.2], [0.3, 1.08], [0.38, 0.96], [0.5, 0.88], 12)));
  // mesonotum shield + cruciform mark
  body.push(cat(cubic([-0.8, 0.83], [-0.76, 0.42], [-0.42, 0.12], [0, 0.04], 30), cubic([0, 0.04], [0.42, 0.12], [0.76, 0.42], [0.8, 0.83], 30)));
  body.push(cat(cubic([-0.38, 0.72], [-0.2, 0.62], [-0.08, 0.5], [0, 0.42], 12), cubic([0, 0.42], [0.08, 0.5], [0.2, 0.62], [0.38, 0.72], 12)));
  body.push(cubic([0, 0.42], [0, 0.33], [0, 0.25], [0, 0.16], 8));
  // abdomen
  const abR = [[0.7, 0.1], [0.8, -0.6], [0.45, -1.45], [0, -1.78]];
  body.push(cat(cubic(...abR.map(([x, y]) => [-x, y]), 30), cubic(...abR, 30).reverse()));
  for (const s of [0.16, 0.32, 0.48, 0.63, 0.77, 0.89]) {
    const [x, y] = evalCubic(abR, s);
    body.push(cubic([-x, y], [-x * 0.4, y - 0.07], [x * 0.4, y - 0.07], [x, y], 20));
  }
  // legs + antennae
  body.push(...both(cubic([0.55, 1.12], [0.8, 1.2], [0.95, 1.3], [1.05, 1.72], 16)));
  body.push(...both(cubic([0.62, 0.95], [0.95, 0.92], [1.15, 0.8], [1.25, 0.55], 14)));
  body.push(...both(cubic([0.34, 1.7], [0.42, 1.8], [0.52, 1.86], [0.66, 1.9], 10)));

  // forewing (right) — outline + veins
  const lead = [[0.55, 0.82], [1.5, 0.9], [2.1, -0.6], [1.95, -2.35]];
  const trail = [[1.95, -2.35], [1.55, -2.62], [0.75, -1.4], [0.45, 0.55]];
  wingR.push(cat(cubic(...lead, 50), cubic(...trail, 50), cubic([0.45, 0.55], [0.48, 0.64], [0.52, 0.74], [0.55, 0.82], 6)));
  const B = [0.58, 0.7];
  const veins = [
    [B, [1.45, 0.45], [1.95, -0.9], [1.98, -2.1]],
    [B, [1.2, 0.0], [1.55, -1.0], [1.62, -2.36]],
    [B, [0.95, -0.2], [1.12, -1.1], [1.2, -2.0]],
    [B, [0.75, -0.2], [0.82, -0.8], [0.86, -1.3]],
  ];
  veins.forEach((v) => veinR.push(cubic(...v, 40)));
  for (const s of [0.42, 0.62, 0.82]) for (let i = 0; i < veins.length - 1; i++) {
    if (i === 2 && s > 0.6) continue;
    const a = evalCubic(veins[i], s), b = evalCubic(veins[i + 1], s + 0.03);
    veinR.push(cubic(a, [a[0] * 0.66 + b[0] * 0.34, a[1] * 0.66 + b[1] * 0.34 - 0.02], [a[0] * 0.34 + b[0] * 0.66, a[1] * 0.34 + b[1] * 0.66 - 0.02], b, 8));
  }
  // hindwing (right)
  wingR.push(cat(cubic([0.5, 0.45], [1.2, 0.35], [1.7, -0.55], [1.45, -1.05], 36), cubic([1.45, -1.05], [1.1, -1.25], [0.6, -0.4], [0.45, 0.3], 36)));
  veinR.push(cubic([0.52, 0.4], [0.95, 0.1], [1.25, -0.4], [1.38, -0.85], 24));
  veinR.push(cubic([0.52, 0.38], [0.8, 0.0], [0.98, -0.45], [1.08, -0.95], 24));
  // every wing polyline sits slightly above the body plane
  for (const pl of [...wingR, ...veinR]) pl.forEach((p) => { p.z = 0.06; });
  return { body, eyes, wingR, veinR, wingL: wingR.map(mirror), veinL: veinR.map(mirror), shoulder: V(0.55, 0.8, 0) };
}
