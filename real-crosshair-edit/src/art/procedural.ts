// Original abstract geometry (no fake UI, no logos, no invented claims).
// Drawn as grayscale luminance + alpha; the blue / red panel treatments are
// applied afterwards like any other artwork.

import {COMP_SIZE} from '../config';

export const PROCEDURAL_NAMES = ['calibration', 'grid'] as const;
export type ProceduralName = (typeof PROCEDURAL_NAMES)[number];

export const MONO_FONT = '"Geist Mono", "DejaVu Sans Mono", monospace';

type Ctx = CanvasRenderingContext2D;

const g = (L: number, a = 1) => {
  const v = Math.round(Math.max(0, Math.min(1, L)) * 255);
  return `rgba(${v},${v},${v},${a})`;
};

const TAU = Math.PI * 2;

const drawCalibration = (ctx: Ctx, S: number) => {
  const c = S / 2;
  ctx.lineCap = 'butt';
  // concentric dashed rings
  for (let k = 0; k < 12; k++) {
    const r = 380 + k * 68;
    ctx.strokeStyle = g(k % 3 === 0 ? 1 : 0.75);
    ctx.lineWidth = k % 3 === 0 ? 6 : 2.5;
    ctx.setLineDash(k % 2 ? [18, 14] : k % 3 === 0 ? [] : [4, 10]);
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // radial calibration ticks
  for (let a = 0; a < 360; a += 2) {
    const th = (a * TAU) / 360;
    const major = a % 30 === 0;
    const mid = a % 10 === 0;
    const r0 = major ? 1030 : mid ? 1065 : 1085;
    ctx.strokeStyle = g(major ? 1 : 0.7);
    ctx.lineWidth = major ? 7 : mid ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(th) * r0, c + Math.sin(th) * r0);
    ctx.lineTo(c + Math.cos(th) * 1120, c + Math.sin(th) * 1120);
    ctx.stroke();
  }
  // degree labels
  ctx.fillStyle = g(1);
  ctx.font = `500 34px ${MONO_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let a = 0; a < 360; a += 30) {
    const th = ((a - 90) * TAU) / 360;
    ctx.save();
    ctx.translate(c + Math.cos(th) * 985, c + Math.sin(th) * 985);
    ctx.rotate(th + Math.PI / 2);
    ctx.fillText(String(a).padStart(3, '0'), 0, 0);
    ctx.restore();
  }
  // diagonal hatching sectors
  ctx.save();
  ctx.beginPath();
  for (const a0 of [20, 200]) {
    ctx.moveTo(c, c);
    ctx.arc(c, c, 900, (a0 * TAU) / 360, ((a0 + 50) * TAU) / 360);
    ctx.closePath();
  }
  ctx.clip();
  ctx.strokeStyle = g(0.9, 0.85);
  ctx.lineWidth = 3;
  for (let d = -S; d < S; d += 22) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + S, S);
    ctx.stroke();
  }
  ctx.restore();
  // plus markers on a lattice
  ctx.strokeStyle = g(1, 0.9);
  ctx.lineWidth = 3;
  for (let y = 120; y < S; y += 240) {
    for (let x = 120; x < S; x += 240) {
      if (Math.hypot(x - c, y - c) < 1180) continue;
      ctx.beginPath();
      ctx.moveTo(x - 14, y);
      ctx.lineTo(x + 14, y);
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x, y + 14);
      ctx.stroke();
    }
  }
};

const drawGrid = (ctx: Ctx, S: number) => {
  const c = S / 2;
  for (let x = 0; x <= S; x += 60) {
    const major = (x - c) % 300 === 0;
    ctx.strokeStyle = g(major ? 0.95 : 0.6, major ? 0.9 : 0.55);
    ctx.lineWidth = major ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, S);
    ctx.moveTo(0, x);
    ctx.lineTo(S, x);
    ctx.stroke();
  }
  ctx.strokeStyle = g(1);
  ctx.lineWidth = 4;
  for (let y = c % 300; y <= S; y += 300) {
    for (let x = c % 300; x <= S; x += 300) {
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = g(0.85, 0.7);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, s > 0 ? 0 : S);
    ctx.lineTo(S, s > 0 ? S : 0);
    ctx.stroke();
  }
};

export const drawProcedural = (name: ProceduralName, ctx: Ctx) => {
  if (name === 'calibration') drawCalibration(ctx, COMP_SIZE);
  else drawGrid(ctx, COMP_SIZE);
};
