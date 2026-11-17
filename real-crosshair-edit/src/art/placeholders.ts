// PLACEHOLDER ARTWORK — clearly not official REAL assets.
// Procedural, grayscale (luminance + alpha) layers drawn with Canvas 2D.
// The colour treatments (red duotone / inverted blue) are applied afterwards,
// so anything drawn here only needs light/dark values.
//
// Replace any of these by passing an image path / URL as a scene's `art`
// (preview UI: "Artwork" → upload), or drop the official REAL logo in via `logo`.

import {COMP_SIZE} from '../config';

export const PLACEHOLDER_NAMES = ['wordmark', 'executor', 'emblem', 'code', 'brand'] as const;
export type PlaceholderName = (typeof PLACEHOLDER_NAMES)[number];

export const DISPLAY_FONT = '"Anton", "Impact", "Arial Black", sans-serif';
export const MONO_FONT = '"JetBrains Mono", "DejaVu Sans Mono", monospace';

type Ctx = CanvasRenderingContext2D;
type Opts = {logo: CanvasImageSource | null; logoAspect: number; labels: boolean};

const g = (L: number, a = 1) => {
  const v = Math.round(Math.max(0, Math.min(1, L)) * 255);
  return `rgba(${v},${v},${v},${a})`;
};

const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const spaced = (ctx: Ctx, text: string, x: number, y: number, spacing: number) => {
  // letter-spaced text centred at x
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let cx = x - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  [...text].forEach((ch, k) => {
    ctx.fillText(ch, cx, y);
    cx += widths[k] + spacing;
  });
  ctx.textAlign = prevAlign;
  return total;
};

/** Bold wordmark with extrusion + outline. Returns the drawn box height. */
const wordmark = (
  ctx: Ctx,
  text: string,
  cx: number,
  cyIn: number,
  targetWidth: number,
  opts: {depth: number; stroke: number; slices?: boolean},
) => {
  let cy = cyIn;
  ctx.save();
  ctx.font = `400 400px ${DISPLAY_FONT}`;
  const w400 = ctx.measureText(text).width;
  const size = (400 * targetWidth) / w400;
  ctx.font = `400 ${size}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  // optically centre the caps on cy
  ctx.textBaseline = 'alphabetic';
  const tm = ctx.measureText(text);
  cy += (tm.actualBoundingBoxAscent - tm.actualBoundingBoxDescent) / 2;
  ctx.lineJoin = 'round';
  const step = Math.max(1.5, opts.depth / 18);
  // extrusion (depth toward bottom-right)
  for (let d = opts.depth; d > 0; d -= step) {
    ctx.fillStyle = g(0.32 - (d / opts.depth) * 0.12);
    ctx.strokeStyle = g(0);
    ctx.lineWidth = opts.stroke;
    ctx.strokeText(text, cx + d, cy + d);
    ctx.fillText(text, cx + d, cy + d);
  }
  ctx.strokeStyle = g(0);
  ctx.lineWidth = opts.stroke;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = g(1);
  ctx.fillText(text, cx, cy);
  if (opts.slices) {
    // graphic horizontal cuts through the letters
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = g(0);
    const h = size * 0.72;
    for (const k of [-0.22, 0.05, 0.3]) ctx.fillRect(cx - targetWidth, cy + h * k, targetWidth * 2, size * 0.022);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  return size * 0.75;
};

const placeholderLabel = (ctx: Ctx, x: number, y: number, size = 26) => {
  ctx.save();
  ctx.font = `700 ${size}px ${MONO_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = 'PLACEHOLDER ART — REPLACE WITH OFFICIAL REAL ASSETS';
  const w = ctx.measureText(text).width + 40;
  ctx.fillStyle = g(0, 0.85);
  ctx.fillRect(x - w / 2, y - size, w, size * 2);
  ctx.fillStyle = g(1);
  ctx.fillText(text, x, y);
  ctx.restore();
};

const drawLogo = (ctx: Ctx, o: Opts, cx: number, cy: number, box: number) => {
  if (!o.logo) return false;
  const w = o.logoAspect >= 1 ? box : box * o.logoAspect;
  const h = o.logoAspect >= 1 ? box / o.logoAspect : box;
  ctx.drawImage(o.logo, cx - w / 2, cy - h / 2, w, h);
  return true;
};

// ---------------------------------------------------------------------------

const drawWordmarkScene = (ctx: Ctx, S: number, o: Opts) => {
  const c = S / 2;
  const r = rng(11);
  // halftone ring
  for (let y = 0; y < S; y += 26) {
    for (let x = (y / 26) % 2 ? 13 : 0; x < S; x += 26) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      if (d < 620 || d > 1180) continue;
      const th = Math.atan2(dy, dx);
      const m = 0.5 + 0.5 * Math.cos(th * 2 + 0.6);
      const rad = (1.5 + 8 * ((d - 620) / 560)) * m;
      if (rad < 1) continue;
      ctx.fillStyle = g(0.95);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // speed lines
  ctx.lineCap = 'round';
  for (let k = 0; k < 90; k++) {
    const th = r() * Math.PI * 2;
    const r0 = 520 + r() * 260;
    const r1 = r0 + 220 + r() * 520;
    ctx.strokeStyle = g(1, 0.9);
    ctx.lineWidth = 1.5 + r() * 5;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(th) * r0, c + Math.sin(th) * r0);
    ctx.lineTo(c + Math.cos(th) * r1, c + Math.sin(th) * r1);
    ctx.stroke();
  }
  // corner brackets
  ctx.fillStyle = g(1);
  const bx = 520;
  const by = 330;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const x = c + sx * bx;
    const y = c + sy * by;
    ctx.fillRect(x - (sx > 0 ? 90 : 0), y - 6, 90, 12);
    ctx.fillRect(x - 6, y - (sy > 0 ? 90 : 0), 12, 90);
  }
  const hasLogo = drawLogo(ctx, o, c, c - 470, 170);
  // wordmark
  wordmark(ctx, 'REAL', c, c + 12, 900, {depth: 34, stroke: 16, slices: true});
  ctx.fillStyle = g(1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 46px ${MONO_FONT}`;
  spaced(ctx, 'ROBLOX EXECUTOR', c, c - (hasLogo ? 350 : 380), 16);
  ctx.font = `400 30px ${MONO_FONT}`;
  spaced(ctx, 'INJECT — EXECUTE — REPEAT', c, c + 388, 10);
  ctx.font = `700 22px ${MONO_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('REAL//01', c - bx + 22, c - by + 40);
  ctx.textAlign = 'right';
  ctx.fillText('EXEC 100%', c + bx - 22, c + by - 34);
  if (o.labels) placeholderLabel(ctx, c, c + 470);
};

const CODE_LINES: Array<Array<[string, number]>> = [
  [['-- REAL · placeholder script', 0.42]],
  [
    ['local ', 0.75],
    ['Players = game:GetService(', 0.95],
    ['"Players"', 0.62],
    [')', 0.95],
  ],
  [
    ['local ', 0.75],
    ['me = Players.LocalPlayer', 0.95],
  ],
  [],
  [
    ['print(', 0.95],
    ['"REAL loaded for "', 0.62],
    [' .. me.Name)', 0.95],
  ],
  [],
  [
    ['for ', 0.75],
    ['spin = 1, 4 ', 0.95],
    ['do', 0.75],
  ],
  [['    task.wait(0.25)', 0.95]],
  [
    ['    print(', 0.95],
    ['"crosshair"', 0.62],
    [', spin * 90)', 0.95],
  ],
  [['end', 0.75]],
];

const roundRect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const drawExecutorScene = (ctx: Ctx, S: number, o: Opts) => {
  const c = S / 2;
  // huge outlined REAL behind
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate((-12 * Math.PI) / 180);
  ctx.font = `400 980px ${DISPLAY_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeStyle = g(1, 0.9);
  ctx.strokeText('REAL', 0, 40);
  ctx.restore();

  ctx.save();
  ctx.translate(c, c);
  ctx.rotate((-7 * Math.PI) / 180);
  const W = 1240;
  const H = 900;
  const x0 = -W / 2;
  const y0 = -H / 2;
  // hard shadow
  roundRect(ctx, x0 + 34, y0 + 34, W, H, 26);
  ctx.fillStyle = g(0);
  ctx.fill();
  // body
  roundRect(ctx, x0, y0, W, H, 26);
  ctx.fillStyle = g(0.07);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = g(1);
  ctx.stroke();
  // title bar
  ctx.save();
  roundRect(ctx, x0, y0, W, H, 26);
  ctx.clip();
  ctx.fillStyle = g(0.93);
  ctx.fillRect(x0, y0, W, 96);
  ctx.restore();
  ctx.fillStyle = g(0);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `400 62px ${DISPLAY_FONT}`;
  ctx.fillText('REAL', x0 + 34, y0 + 50);
  ctx.font = `700 26px ${MONO_FONT}`;
  ctx.fillStyle = g(0.25);
  ctx.fillText('executor', x0 + 168, y0 + 54);
  if (o.logo) drawLogo(ctx, o, x0 + W - 300, y0 + 48, 64);
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.arc(x0 + W - 150 + k * 50, y0 + 48, 14, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = g(0);
    ctx.stroke();
  }
  // tabs
  ctx.font = `700 26px ${MONO_FONT}`;
  const tabs = ['Script 1', 'Script 2', '+'];
  let tx = x0 + 34;
  tabs.forEach((t, k) => {
    const w = ctx.measureText(t).width + 44;
    ctx.lineWidth = 4;
    ctx.strokeStyle = g(k === 0 ? 1 : 0.5);
    ctx.fillStyle = g(k === 0 ? 0.2 : 0.07);
    roundRect(ctx, tx, y0 + 118, w, 52, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = g(k === 0 ? 1 : 0.6);
    ctx.fillText(t, tx + 22, y0 + 145);
    tx += w + 14;
  });
  // editor
  const ex = x0 + 34;
  const ey = y0 + 190;
  const ew = W - 300;
  const eh = 520;
  ctx.lineWidth = 4;
  ctx.strokeStyle = g(0.55);
  roundRect(ctx, ex, ey, ew, eh, 14);
  ctx.stroke();
  ctx.font = `400 31px ${MONO_FONT}`;
  CODE_LINES.forEach((line, k) => {
    const ly = ey + 44 + k * 47;
    ctx.fillStyle = g(0.4);
    ctx.textAlign = 'right';
    ctx.fillText(String(k + 1), ex + 58, ly);
    ctx.textAlign = 'left';
    let lx = ex + 86;
    for (const [txt, L] of line) {
      ctx.fillStyle = g(L);
      ctx.fillText(txt, lx, ly);
      lx += ctx.measureText(txt).width;
    }
    if (k === 8) {
      ctx.fillStyle = g(1);
      ctx.fillRect(lx + 8, ly - 18, 16, 36);
    }
  });
  // side list
  const sx = ex + ew + 22;
  ctx.lineWidth = 4;
  ctx.strokeStyle = g(0.55);
  roundRect(ctx, sx, ey, W - (sx - x0) - 34, eh, 14);
  ctx.stroke();
  ctx.font = `700 24px ${MONO_FONT}`;
  ['SCRIPTS', 'spin.lua', 'intro.lua', 'hud.lua', 'fx.lua', 'edit.lua'].forEach((t, k) => {
    ctx.fillStyle = g(k === 0 ? 1 : 0.62);
    ctx.fillText(t, sx + 22, ey + 44 + k * 52);
  });
  // buttons
  const by = ey + eh + 34;
  const btns: Array<[string, number, boolean]> = [
    ['EXECUTE', 300, true],
    ['CLEAR', 200, false],
    ['OPEN FILE', 250, false],
    ['ATTACH', 220, false],
  ];
  let bx = ex;
  for (const [label, w, primary] of btns) {
    roundRect(ctx, bx, by, w, 82, 14);
    ctx.fillStyle = g(primary ? 1 : 0.07);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = g(1);
    ctx.stroke();
    ctx.fillStyle = g(primary ? 0 : 1);
    ctx.textAlign = 'center';
    ctx.font = primary ? `400 50px ${DISPLAY_FONT}` : `800 28px ${MONO_FONT}`;
    ctx.fillText(label, bx + w / 2, by + 43);
    bx += w + 22;
  }
  ctx.restore();
  if (o.labels) placeholderLabel(ctx, c, c + 560);
};

const ringText = (ctx: Ctx, text: string, cx: number, cy: number, radius: number, startAngle: number) => {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = (Math.PI * 2 * radius) / total;
  let a = startAngle;
  chars.forEach((ch, k) => {
    const w = widths[k] * scale;
    const mid = a + w / 2 / radius;
    ctx.save();
    ctx.translate(cx + Math.cos(mid) * radius, cy + Math.sin(mid) * radius);
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += w / radius;
  });
};

const drawEmblemScene = (ctx: Ctx, S: number, o: Opts) => {
  const c = S / 2;
  const TAU = Math.PI * 2;
  ctx.lineCap = 'butt';
  // outer dashed ring
  ctx.strokeStyle = g(1);
  ctx.lineWidth = 16;
  for (let a = 0; a < 360; a += 6) {
    ctx.beginPath();
    ctx.arc(c, c, 1010, (a * TAU) / 360, ((a + 3) * TAU) / 360);
    ctx.stroke();
  }
  // compass labels (crosshair theme)
  ctx.fillStyle = g(1);
  ctx.font = `800 40px ${MONO_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ([['000', 0, -1], ['090', 1, 0], ['180', 0, 1], ['270', -1, 0]] as Array<[string, number, number]>).forEach(
    ([t, dx, dy]) => ctx.fillText(t, c + dx * 940, c + dy * 940),
  );
  // radial bars
  for (let k = 0; k < 144; k++) {
    const th = (k / 144) * TAU;
    const long = k % 6 === 0;
    ctx.lineWidth = long ? 9 : 5;
    ctx.strokeStyle = g(long ? 1 : 0.8);
    const r0 = long ? 800 : 830;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(th) * r0, c + Math.sin(th) * r0);
    ctx.lineTo(c + Math.cos(th) * 890, c + Math.sin(th) * 890);
    ctx.stroke();
  }
  // ring text
  ctx.font = `800 56px ${MONO_FONT}`;
  ctx.fillStyle = g(1);
  ringText(ctx, 'REAL • EXECUTOR • REAL • EXECUTOR • REAL • EXECUTOR • ', c, c, 705, -Math.PI / 2);
  // thick rings
  ctx.strokeStyle = g(1);
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.arc(c, c, 585, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(c, c, 540, 0, TAU);
  ctx.stroke();
  // ticks
  for (let a = 0; a < 360; a += 5) {
    const th = (a * TAU) / 360;
    const long = a % 30 === 0;
    ctx.lineWidth = long ? 9 : 5;
    const r0 = long ? 405 : 440;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(th) * r0, c + Math.sin(th) * r0);
    ctx.lineTo(c + Math.cos(th) * 495, c + Math.sin(th) * 495);
    ctx.stroke();
  }
  // bracket arcs on the diagonals
  ctx.lineWidth = 22;
  for (const a of [45, 135, 225, 315]) {
    ctx.beginPath();
    ctx.arc(c, c, 650, ((a - 12) * TAU) / 360, ((a + 12) * TAU) / 360);
    ctx.stroke();
  }
  // core disc
  ctx.fillStyle = g(0);
  ctx.beginPath();
  ctx.arc(c, c, 365, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = g(1);
  ctx.stroke();
  if (!drawLogo(ctx, o, c, c - 30, 400)) {
    wordmark(ctx, 'REAL', c, c - 20, 430, {depth: 14, stroke: 10});
  }
  ctx.fillStyle = g(1);
  ctx.font = `800 34px ${MONO_FONT}`;
  spaced(ctx, 'EXECUTOR', c, c + 210, 12);
  if (o.labels) placeholderLabel(ctx, c, c + 1080);
};

const TOKENS = [
  'local', 'function', 'end', 'then', 'if', 'return', 'print("REAL")', 'task.wait()', 'game:GetService("RunService")',
  'Players.LocalPlayer', 'REAL.execute()', 'for i = 1, 360 do', 'Vector3.new(0, 90, 0)', 'CFrame.Angles(0, math.rad(90), 0)',
  'while true do', '-- REAL', 'spin += 90', 'workspace', 'loadstring', 'pcall(function()', 'getgenv().REAL = true', 'nil', '{}',
];

const drawCodeScene = (ctx: Ctx, S: number, o: Opts) => {
  const c = S / 2;
  const r = rng(77);
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate((-14 * Math.PI) / 180);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `400 28px ${MONO_FONT}`;
  for (let y = -1500; y < 1500; y += 40) {
    let line = '';
    while (line.length < 190) line += TOKENS[Math.floor(r() * TOKENS.length)] + '  ';
    ctx.fillStyle = g(0.32 + r() * 0.36);
    ctx.fillText(line, -1700 + r() * 40, y);
  }
  // main band
  ctx.fillStyle = g(0);
  ctx.fillRect(-1800, -200, 3600, 400);
  ctx.fillStyle = g(1);
  ctx.fillRect(-1800, -184, 3600, 368);
  ctx.fillStyle = g(0);
  ctx.textAlign = 'center';
  ctx.font = `400 270px ${DISPLAY_FONT}`;
  ctx.fillText('EXECUTE', 0, 8);
  ctx.font = `800 30px ${MONO_FONT}`;
  for (const x of [-1500, -900, 900, 1500]) {
    ctx.fillText('REAL://run', x, -130);
    ctx.fillText('0x5245414C', x, 130);
  }
  // secondary strips
  for (const [y, h] of [
    [300, 70],
    [-370, 70],
  ] as Array<[number, number]>) {
    ctx.fillStyle = g(0.85);
    ctx.fillRect(-1800, y, 3600, h);
    ctx.fillStyle = g(0);
    ctx.font = `800 34px ${MONO_FONT}`;
    let s = '';
    while (s.length < 200) s += 'REAL ✕ EXECUTOR ✕ ';
    ctx.textAlign = 'left';
    ctx.fillText(s, -1780, y + h / 2 + 2);
  }
  ctx.restore();
  if (o.logo) {
    ctx.fillStyle = g(0);
    ctx.beginPath();
    ctx.arc(c, c - 620, 170, 0, Math.PI * 2);
    ctx.fill();
    drawLogo(ctx, o, c, c - 620, 240);
  }
  if (o.labels) placeholderLabel(ctx, c, c + 640);
};

/** Tile repeated in every quadrant (drawn centred on the quadrant anchor). */
const drawBrandTile = (ctx: Ctx, S: number, o: Opts) => {
  const c = S / 2;
  const hasLogo = drawLogo(ctx, o, c, c - 150, 170);
  const wy = hasLogo ? c + 60 : c;
  wordmark(ctx, 'REAL', wy === c ? c : c, wy, 430, {depth: 16, stroke: 11, slices: true});
  ctx.fillStyle = g(1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 27px ${MONO_FONT}`;
  spaced(ctx, 'ROBLOX EXECUTOR', c, wy + 152, 9);
  ctx.fillRect(c - 215, wy + 186, 430, 6);
  if (!hasLogo) {
    ctx.font = `700 22px ${MONO_FONT}`;
    spaced(ctx, '[ REAL ]', c, wy - 170, 14);
  }
  if (o.labels) placeholderLabel(ctx, c, wy + 240, 16);
};

export const BRAND_TILE_SIZE = 1200;

export const drawPlaceholder = (name: PlaceholderName, ctx: Ctx, o: Opts) => {
  ctx.textBaseline = 'middle';
  switch (name) {
    case 'wordmark':
      return drawWordmarkScene(ctx, COMP_SIZE, o);
    case 'executor':
      return drawExecutorScene(ctx, COMP_SIZE, o);
    case 'emblem':
      return drawEmblemScene(ctx, COMP_SIZE, o);
    case 'code':
      return drawCodeScene(ctx, COMP_SIZE, o);
    case 'brand':
      return drawBrandTile(ctx, BRAND_TILE_SIZE, o);
  }
};

export const placeholderSize = (name: PlaceholderName) => (name === 'brand' ? BRAND_TILE_SIZE : COMP_SIZE);
