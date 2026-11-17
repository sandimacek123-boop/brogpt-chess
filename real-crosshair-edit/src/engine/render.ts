// Frame renderer – layered like a compositing stack:
//   1. near-black backdrop + official wave texture
//   2. 4-panel crosshair composition, drawn through the camera N times at
//      sub-frame times and averaged (temporal-supersampled motion blur whose
//      strength follows the real angular velocity) + palette guard + grade
//   3. vignette
//   4. FX layer: concentric rings / streaks / light bursts / shockwaves, each
//      ring supersampled with its OWN angular velocity, plus bloom
//   5. central blue light, chromatic aberration, impact flash
//   6. sharp, upright brand layer: plate, official logo, wordmark, links

import {COMP_SIZE, HEIGHT, WIDTH, type EditProps, type SceneId} from '../config';
import type {Assets, SceneAssets, Treated} from './assets';
import {guardPalette} from './color';
import {clamp, easeOutCubic, easeOutExpo} from './bezier';
import type {CameraSample, FrameState, Timeline} from './timeline';
import {RING_SPECS, STREAKS, drawRing, drawStreak, type RingColor} from './rings';
import {MONO, PLATE_R, brandLayout, drawBrand, drawLinks, drawPlate} from './brand';

export type RenderTargets = {
  comp: HTMLCanvasElement;
  panels: HTMLCanvasElement;
  fx: HTMLCanvasElement;
  bloomA: HTMLCanvasElement;
  bloomB: HTMLCanvasElement;
  scratch: HTMLCanvasElement;
  chan: HTMLCanvasElement;
};

export const createTargets = (): RenderTargets => {
  const mk = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  return {
    comp: mk(COMP_SIZE, COMP_SIZE),
    panels: mk(WIDTH, HEIGHT),
    fx: mk(WIDTH, HEIGHT),
    bloomA: mk(WIDTH / 4, HEIGHT / 4),
    bloomB: mk(WIDTH / 8, HEIGHT / 8),
    scratch: mk(WIDTH, HEIGHT),
    chan: mk(WIDTH, HEIGHT),
  };
};

const C = COMP_SIZE / 2;
const LINE_W = 10;
const LINE_EDGE = 2;
const QUAD_ANCHOR = {x: 285, y: 610};
const CORNER_R = Math.hypot(WIDTH / 2, HEIGHT / 2);
const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------
// panel composition
// ---------------------------------------------------------------------------
const rayCache = new Map<string, Array<[number, number]>>();
const raysFor = (id: string, count: number) => {
  const k = `${id}:${count}`;
  let r = rayCache.get(k);
  if (!r) {
    r = [];
    let seed = id.charCodeAt(0) * 9301 + count * 49297;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const step = (Math.PI * 2) / Math.max(1, count);
    for (let i = 0; i < count; i++) r.push([i * step + (rnd() - 0.5) * step * 0.4, step * (0.14 + rnd() * 0.2)]);
    rayCache.set(k, r);
  }
  return r;
};

const fitRect = (w: number, h: number, boxW: number, boxH: number, fit: 'contain' | 'cover') => {
  const k = fit === 'cover' ? Math.max(boxW / w, boxH / h) : Math.min(boxW / w, boxH / h);
  return {w: w * k, h: h * k};
};

type Motion = {artScale: number; raysScale: number; artDx: number; artDy: number; t: number};

const drawSceneQuadrant = (
  ctx: CanvasRenderingContext2D,
  sc: SceneAssets,
  assets: Assets,
  q: number,
  blue: boolean,
  m: Motion,
  brandPhase: number,
  invertBlue: boolean,
) => {
  const which = blue ? 'blue' : 'red';
  const qx = q % 2;
  const qy = q >> 1;
  const x0 = qx * C;
  const y0 = qy * C;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, C, C);
  ctx.clip();
  ctx.fillStyle = assets.colors.bg[which];
  ctx.fillRect(x0, y0, C, C);

  const cfg = sc.config;
  if (cfg.rays.count > 0) {
    const rays = raysFor(cfg.id, cfg.rays.count);
    // every quadrant animates on its own: blue regions spin one way, red the other
    const spin = ((cfg.rays.spin * (blue ? 1 : -1) * m.t) / 60) * D2R;
    ctx.save();
    ctx.translate(C, C);
    ctx.scale(m.raysScale, m.raysScale);
    ctx.fillStyle = assets.colors.ray[which];
    ctx.beginPath();
    const R = COMP_SIZE * 1.2;
    for (const [a, w] of rays) {
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a + spin - w / 2) * R, Math.sin(a + spin - w / 2) * R);
      ctx.lineTo(Math.cos(a + spin + w / 2) * R, Math.sin(a + spin + w / 2) * R);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }

  const op: GlobalCompositeOperation = cfg.blend === 'screen' ? (blue && invertBlue ? 'multiply' : 'screen') : 'source-over';
  const drawArt = (art: Treated, cx: number, cy: number, boxW: number, boxH: number, fit: 'contain' | 'cover', extra: number) => {
    const r = fitRect(art.w, art.h, boxW, boxH, fit);
    const s = m.artScale * extra;
    ctx.globalAlpha = cfg.artOpacity;
    ctx.globalCompositeOperation = op;
    const qd = 26 * Math.sin(m.t / 90 + q * 1.7); // independent per-quadrant drift
    const qe = 26 * Math.cos(m.t / 110 + q * 2.3);
    ctx.drawImage(art[which], cx - (r.w * s) / 2 + m.artDx + qd, cy - (r.h * s) / 2 + m.artDy + qe, r.w * s, r.h * s);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  const panelArt = sc.panels[q];
  if (panelArt) {
    drawArt(panelArt, x0 + C / 2, y0 + C / 2, C * cfg.artScale, C * cfg.artScale, 'cover', 1);
  } else if (sc.art) {
    if (cfg.layout === 'split') {
      drawArt(sc.art, C + cfg.artX, C + cfg.artY, COMP_SIZE * cfg.artScale, COMP_SIZE * cfg.artScale, sc.art.procedural ? 'contain' : cfg.fit, 1);
    } else {
      const ax = C + (qx ? 1 : -1) * QUAD_ANCHOR.x + cfg.artX;
      const ay = C + (qy ? 1 : -1) * QUAD_ANCHOR.y + cfg.artY;
      drawArt(sc.art, ax, ay, 1200 * cfg.artScale, 1200 * cfg.artScale, 'contain', 1 + 0.08 * brandPhase);
    }
  }
  ctx.restore();
};

const drawScene = (ctx: CanvasRenderingContext2D, id: SceneId, assets: Assets, st: FrameState, m: Motion, invertBlue: boolean) => {
  const sc = assets.scenes[id];
  if (!sc) return;
  for (let q = 0; q < 4; q++) {
    const blue = (q === 0 || q === 3) !== st.swap; // TL + BR blue (inverted), TR + BL red
    drawSceneQuadrant(ctx, sc, assets, q, blue, m, id === 'BRAND' ? st.brandPhase : 0, invertBlue);
  }
};

const drawLines = (ctx: CanvasRenderingContext2D, grow: number) => {
  if (grow <= 0) return;
  const L = grow * (C + 4);
  const w = LINE_W;
  const e = LINE_EDGE;
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(C - w / 2 - e, C - L, w + 2 * e, 2 * L);
  ctx.fillRect(C - L, C - w / 2 - e, 2 * L, w + 2 * e);
  ctx.fillStyle = '#fff';
  ctx.fillRect(C - w / 2, C - L, w, 2 * L);
  ctx.fillRect(C - L, C - w / 2, 2 * L, w);
};

export const buildComposition = (comp: HTMLCanvasElement, st: FrameState, assets: Assets, invertBlue: boolean) => {
  const ctx = comp.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, COMP_SIZE, COMP_SIZE);
  if (st.panelsIris <= 0) return;

  const cam = st.camera;
  const a = -cam.angle * D2R;
  const m: Motion = {
    t: st.t,
    artScale: 1 + Math.max(0, cam.scale - 1) * 0.35, // layered parallax
    raysScale: 1 - Math.max(0, cam.scale - 1) * 0.2,
    artDx: (cam.dx * Math.cos(a) - cam.dy * Math.sin(a)) * 0.35,
    artDy: (cam.dx * Math.sin(a) + cam.dy * Math.cos(a)) * 0.35,
  };

  ctx.save();
  const R = 270 + st.panelsIris * (C * 1.46 - 270);
  if (st.panelsIris < 1) {
    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    ctx.clip();
  }
  if (st.wipe < 1 && st.prevScene) {
    // animated radial mask: the new artwork sweeps in clockwise from 12 o'clock
    drawScene(ctx, st.prevScene, assets, st, m, invertBlue);
    const start = -Math.PI / 2;
    const end = start + st.wipe * Math.PI * 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(C, C);
    ctx.arc(C, C, COMP_SIZE, start, end);
    ctx.closePath();
    ctx.clip();
    drawScene(ctx, st.scene, assets, st, m, invertBlue);
    ctx.restore();
    if (st.wipe > 0) {
      ctx.save();
      ctx.translate(C, C);
      ctx.rotate(end);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, -LINE_W / 2, COMP_SIZE, LINE_W);
      ctx.restore();
    }
  } else {
    drawScene(ctx, st.scene, assets, st, m, invertBlue);
  }
  drawLines(ctx, st.linesGrow);
  ctx.restore();
  if (st.panelsIris < 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    ctx.stroke();
  }
};

const applyCamera = (ctx: CanvasRenderingContext2D, cam: CameraSample, offsetY: number) => {
  const a = cam.angle * D2R;
  const cos = Math.cos(a) * cam.scale;
  const sin = Math.sin(a) * cam.scale;
  const tx = WIDTH / 2 + cam.dx;
  const ty = HEIGHT / 2 + cam.dy + offsetY;
  ctx.setTransform(cos, sin, -sin, cos, tx - cos * C + sin * C, ty - sin * C - cos * C);
};

const travel = (a: CameraSample, b: CameraSample) =>
  Math.abs((b.angle - a.angle) * D2R) * CORNER_R * Math.max(a.scale, b.scale) + Math.abs(b.scale - a.scale) * CORNER_R + Math.hypot(b.dx - a.dx, b.dy - a.dy);

export const SHUTTER_FRAMES = 0.6; // at motionBlur = 1 (≈216° shutter)

// ---------------------------------------------------------------------------
// FX layer
// ---------------------------------------------------------------------------
const ringColor = (c: RingColor, p: EditProps) =>
  c === 'white' ? p.palette.white : c === 'cyan' ? p.palette.cyan : c === 'electric' ? p.palette.electric : p.palette.red;

/** ring indices kept for a given density (lowest priority number = most important) */
export const ringsForDensity = (density: number) => {
  const n = clamp(Math.round(RING_SPECS.length * density), 4, RING_SPECS.length);
  return RING_SPECS.map((s, i) => ({i, p: s.priority}))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .slice(0, n)
    .map((x) => x.i)
    .sort((a, b) => a - b);
};

const drawFx = (
  fx: HTMLCanvasElement,
  frame: number,
  st: FrameState,
  props: EditProps,
  tl: Timeline,
  center: {cx: number; cy: number; zoom: number; plateR: number},
  shutter: number,
  maxK: number,
) => {
  const ctx = fx.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.globalCompositeOperation = 'lighter';
  const h = shutter / 2;
  const {cx, cy, zoom} = center;
  let maxCopies = 1;

  // --- concentric rings (each with its own temporal supersampling)
  if (st.ringsAlpha > 0) {
    for (const i of ringsForDensity(props.ringDensity)) {
      const s = RING_SPECS[i];
      const sweep = st.ringsSweep[i];
      if (sweep <= 0) continue;
      const alpha = s.alpha * st.ringsAlpha * Math.min(1, sweep * 1.6);
      const th0 = tl.ringAngle(i, tl.warp(frame - h));
      const th1 = tl.ringAngle(i, tl.warp(frame + h));
      const px = Math.abs(th1 - th0) * D2R * s.r * zoom;
      const K = shutter > 0 ? clamp(Math.ceil(px / 2.5), 1, maxK) : 1;
      maxCopies = Math.max(maxCopies, K);
      const opts = {
        cx,
        cy,
        zoom,
        color: ringColor(s.color, props),
        longColor: ringColor(s.longColor ?? s.color, props),
        thickness: props.ringThickness,
        tickDensity: props.tickDensity,
        labelFont: `500 ${Math.round(15 * zoom)}px ${MONO}`,
        sweep,
      };
      for (let k = 0; k < K; k++) {
        const tau = K === 1 ? frame : frame - h + ((k + 0.5) / K) * 2 * h;
        ctx.globalAlpha = alpha / K;
        drawRing(ctx, s, tl.ringAngle(i, tl.warp(tau)), opts);
      }
    }
  }

  // --- sweeping blue + red light streaks
  if (st.streakAlpha > 0) {
    STREAKS.forEach((s, j) => {
      const th0 = tl.streakAngle(j, tl.warp(frame - h));
      const th1 = tl.streakAngle(j, tl.warp(frame + h));
      const px = Math.abs(th1 - th0) * D2R * s.r * zoom;
      const K = shutter > 0 ? clamp(Math.ceil(px / 3), 1, maxK) : 1;
      for (let k = 0; k < K; k++) {
        const tau = K === 1 ? frame : frame - h + ((k + 0.5) / K) * 2 * h;
        drawStreak(ctx, s, tl.streakAngle(j, tl.warp(tau)), cx, cy, zoom, ringColor(s.color, props), (0.85 * st.streakAlpha) / K);
      }
    });
  }

  // --- radial light bursts
  for (const b of st.bursts) {
    const p = b.age / 16;
    const r0 = center.plateR + 12;
    const r1 = r0 + 1500 * easeOutCubic(Math.min(1, p * 1.4));
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, props.palette.cyan);
    g.addColorStop(1, 'rgba(8,102,255,0)');
    ctx.globalAlpha = 0.55 * b.strength * Math.pow(1 - p, 2);
    ctx.fillStyle = g;
    ctx.beginPath();
    const N = 28;
    for (let k = 0; k < N; k++) {
      const a = ((k / N) * 360 + b.seed * 7.3 + p * 6) * D2R;
      const w = (0.35 + ((k * 37 + b.seed) % 5) * 0.12) * D2R;
      ctx.moveTo(cx + Math.cos(a - w) * r0, cy + Math.sin(a - w) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a + w) * r0, cy + Math.sin(a + w) * r0);
      ctx.closePath();
    }
    ctx.fill();
  }

  // --- shockwaves
  for (const s of st.shocks) {
    const p = s.age / 34;
    const r = center.plateR + 1300 * easeOutExpo(p);
    ctx.globalAlpha = 0.85 * s.strength * Math.pow(1 - p, 1.6);
    ctx.strokeStyle = props.palette.white;
    ctx.lineWidth = 22 * (1 - p) + 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha *= 0.6;
    ctx.strokeStyle = props.palette.cyan;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return maxCopies;
};

// ---------------------------------------------------------------------------
export type FrameInfo = {samples: number; ringCopies: number; ca: boolean; guard: boolean; state: FrameState};

export const renderFrame = (
  out: HTMLCanvasElement,
  frame: number,
  props: EditProps,
  assets: Assets,
  tl: Timeline,
  targets: RenderTargets,
  opts: {maxSamples?: number; skipGuard?: boolean} = {},
): FrameInfo => {
  const st = tl.state(frame);
  const pal = props.palette;
  const shutter = SHUTTER_FRAMES * clamp(props.motionBlur, 0, 3);
  const maxSamples = Math.max(1, Math.round(opts.maxSamples ?? props.maxBlurSamples));
  const offsetY = st.logo.offsetY; // the whole stage moves up together for the outro links

  // --- 1. backdrop -----------------------------------------------------------------
  const ctx = out.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = pal.nearBlack;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (assets.backdrop && st.bgWave > 0) {
    const img = assets.backdrop;
    const k = Math.max(WIDTH / img.naturalWidth, HEIGHT / img.naturalHeight) * 1.08;
    const w = img.naturalWidth * k;
    const hgt = img.naturalHeight * k;
    const drift = Math.sin((st.t / 60) * 0.35) * 40;
    ctx.globalAlpha = st.bgWave * clamp(props.backgroundOpacity, 0, 1);
    ctx.drawImage(img, (WIDTH - w) / 2 + drift, (HEIGHT - hgt) / 2, w, hgt);
    ctx.globalAlpha = 1;
  }

  // --- 2. panels (temporal supersampling) -------------------------------------------
  let samples = 0;
  let guard = false;
  if (st.panelsIris > 0 && st.panelsAlpha > 0) {
    buildComposition(targets.comp, st, assets, props.invertBluePanels);
    const pctx = targets.panels.getContext('2d')!;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.globalAlpha = 1;
    pctx.globalCompositeOperation = 'source-over';
    pctx.clearRect(0, 0, WIDTH, HEIGHT);
    pctx.imageSmoothingEnabled = true;
    samples = 1;
    if (shutter > 0) {
      const c0 = tl.camera(tl.warp(frame - shutter / 2));
      const c1 = tl.camera(tl.warp(frame + shutter / 2));
      samples = clamp(Math.ceil(travel(c0, c1) / 1.5), 1, maxSamples);
    }
    if (samples === 1) {
      applyCamera(pctx, st.camera, offsetY);
      pctx.drawImage(targets.comp, 0, 0);
    } else {
      for (let k = 0; k < samples; k++) {
        const tau = frame - shutter / 2 + ((k + 0.5) / samples) * shutter;
        applyCamera(pctx, tl.camera(tl.warp(tau)), offsetY);
        pctx.globalAlpha = 1 / (k + 1); // running average
        pctx.drawImage(targets.comp, 0, 0);
      }
      pctx.globalAlpha = 1;
    }
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = st.grade;
    const contrast = g.contrast * props.contrast;
    const bright = g.brightness * props.brightness;
    const needsGrade = Math.abs(contrast - 1) > 0.005 || Math.abs(bright - 1) > 0.005 || Math.abs(g.saturate - 1) > 0.005;
    ctx.globalAlpha = st.panelsAlpha * clamp(props.backgroundOpacity, 0, 1);
    if (needsGrade) ctx.filter = `contrast(${contrast.toFixed(3)}) brightness(${bright.toFixed(3)}) saturate(${g.saturate.toFixed(3)})`;
    ctx.drawImage(targets.panels, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }

  // --- 3. vignette ------------------------------------------------------------------
  if (st.grade.vignette > 0) {
    const vg = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.28, WIDTH / 2, HEIGHT / 2, CORNER_R);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${clamp(st.grade.vignette, 0, 0.95)})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // --- 4. rings / streaks / bursts + bloom ------------------------------------------
  const lay = brandLayout(props.brand, st.logo, {dx: st.camera.dx, dy: st.camera.dy});
  const ringZoom = st.ringsZoom * (lay.plateR / PLATE_R) * (1 + 0.4 * Math.max(0, st.camera.scale - 1));
  const ringCopies = drawFx(targets.fx, frame, st, props, tl, {cx: lay.cx, cy: lay.cy, zoom: ringZoom, plateR: lay.plateR}, shutter, Math.min(24, maxSamples));
  const glow = clamp(props.glow, 0, 2);
  if (glow > 0) {
    const a = targets.bloomA.getContext('2d')!;
    const b = targets.bloomB.getContext('2d')!;
    a.globalCompositeOperation = 'copy';
    a.filter = 'blur(3px)';
    a.drawImage(targets.fx, 0, 0, WIDTH / 4, HEIGHT / 4);
    a.filter = 'none';
    b.globalCompositeOperation = 'copy';
    b.filter = 'blur(4px)';
    b.drawImage(targets.bloomA, 0, 0, WIDTH / 8, HEIGHT / 8);
    b.filter = 'none';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, 0.7 * glow);
    ctx.drawImage(targets.bloomA, 0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = Math.min(1, 0.55 * glow);
    ctx.drawImage(targets.bloomB, 0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(targets.fx, 0, 0);

  // --- 5a. central blue light (intro exposure + reveal) ------------------------------
  if (st.blueFlash > 0.002) {
    const r = 950 * (0.55 + 0.45 * (1 - st.blueFlash));
    const bg = ctx.createRadialGradient(lay.cx, lay.cy, 0, lay.cx, lay.cy, r);
    bg.addColorStop(0, `rgba(255,255,255,${0.9 * st.blueFlash})`);
    bg.addColorStop(0.18, `rgba(57,198,255,${0.75 * st.blueFlash})`);
    bg.addColorStop(0.5, `rgba(8,102,255,${0.4 * st.blueFlash})`);
    bg.addColorStop(1, 'rgba(8,102,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalCompositeOperation = 'source-over';
  }

  // --- 5b. chromatic aberration burst (restrained, radial) ----------------------------
  const caAmount = st.ca * clamp(props.chromaticAberration, 0, 2) * 0.0038;
  const doCA = caAmount * CORNER_R > 0.8;
  if (doCA) {
    const sctx = targets.scratch.getContext('2d')!;
    sctx.globalCompositeOperation = 'copy';
    sctx.drawImage(out, 0, 0);
    const cctx = targets.chan.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalCompositeOperation = 'lighter';
    const chans: Array<[string, number]> = [
      ['#ff0000', 1 + caAmount],
      ['#00ff00', 1],
      ['#0000ff', 1 - caAmount],
    ];
    for (const [col, s] of chans) {
      cctx.globalCompositeOperation = 'copy';
      cctx.drawImage(targets.scratch, 0, 0);
      cctx.globalCompositeOperation = 'multiply';
      cctx.fillStyle = col;
      cctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.setTransform(s, 0, 0, s, lay.cx * (1 - s), lay.cy * (1 - s));
      ctx.drawImage(targets.chan, 0, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // --- 5c. palette guard on everything below the logo: red↔blue blur mixing and
  //          additive light over red panels must never turn purple. The official
  //          logo is drawn afterwards and keeps its own colours.
  if (props.paletteGuard && !opts.skipGuard) {
    const img = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    guardPalette(img.data, assets.guardTable);
    ctx.putImageData(img, 0, 0);
    guard = true;
  }

  // --- 5d. impact flash (short, capped – logo stays readable above it) ----------------
  const flash = clamp(st.flash * props.flashIntensity, 0, props.reducedFlash ? 0.2 : 0.8);
  if (flash > 0.003) {
    ctx.fillStyle = `rgba(255,255,255,${flash})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // --- 6. brand layer: sharp, upright, never blurred ----------------------------------
  drawPlate(ctx, lay, pal, st.logo.plateAlpha, st.camera.angle);
  drawBrand(ctx, assets.logoIcon, props.brand, pal, st.logo, lay);
  drawLinks(ctx, props.brand, pal, st.logo, lay);

  return {samples, ringCopies, ca: doCA, guard, state: st};
};
