// Frame renderer.
//  1. build the square 2×2 crosshair composition for this frame (COMP_SIZE²)
//  2. draw it through the camera (rotate / zoom / shake) N times at sub-frame
//     times and average them  → temporal-supersampled motion blur whose
//     strength follows the real angular velocity
//  3. chromatic aberration, palette guard, impact flash

import {COMP_SIZE, HEIGHT, WIDTH, type EditProps, type SceneId} from '../config';
import {BRAND_TILE_SIZE} from '../art/placeholders';
import type {Assets, SceneAssets, Treated} from './assets';
import {guardPalette} from './color';
import {clamp} from './bezier';
import type {CameraSample, FrameState, Timeline} from './timeline';

export type RenderTargets = {
  comp: HTMLCanvasElement;
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
  return {comp: mk(COMP_SIZE, COMP_SIZE), scratch: mk(WIDTH, HEIGHT), chan: mk(WIDTH, HEIGHT)};
};

const C = COMP_SIZE / 2;
const LINE_W = 12; // white crosshair line (comp px == output px at zoom 1)
const LINE_EDGE = 3; // thin dark keyline either side (keeps the line visible on white panels)
const QUAD_ANCHOR = {x: 300, y: 320};
const CORNER_R = Math.hypot(WIDTH / 2, HEIGHT / 2);

// irregular sunburst, deterministic per scene
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
    const step = (Math.PI * 2) / count;
    for (let i = 0; i < count; i++) {
      const a = i * step + (rnd() - 0.5) * step * 0.4;
      const w = step * (0.16 + rnd() * 0.24);
      r.push([a, w]);
    }
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

  // sunburst rays (internal movement: slow spin, counter-parallax)
  const cfg = sc.config;
  const rays = raysFor(cfg.id, cfg.rays.count);
  const spin = ((cfg.rays.spin * m.t) / 60) * (Math.PI / 180);
  ctx.save();
  ctx.translate(C, C);
  ctx.scale(m.raysScale, m.raysScale);
  ctx.fillStyle = assets.colors.ray[which];
  ctx.beginPath();
  const R = COMP_SIZE * 1.2;
  for (const [a, w] of rays) {
    const a0 = a + spin - w / 2;
    const a1 = a + spin + w / 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
    ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();

  const drawArt = (art: Treated, cx: number, cy: number, boxW: number, boxH: number, fit: 'contain' | 'cover', extra: number) => {
    const r = fitRect(art.w, art.h, boxW, boxH, fit);
    const s = m.artScale * extra;
    const w = r.w * s;
    const h = r.h * s;
    ctx.globalCompositeOperation = cfg.blend === 'lighten' ? (blue ? 'darken' : 'lighten') : 'source-over';
    ctx.drawImage(art[which], cx - w / 2 + m.artDx, cy - h / 2 + m.artDy, w, h);
    ctx.globalCompositeOperation = 'source-over';
  };

  const panelArt = sc.panels[q];
  if (panelArt) {
    drawArt(panelArt, x0 + C / 2, y0 + C / 2, C * cfg.artScale, C * cfg.artScale, panelArt.placeholder ? 'contain' : 'cover', 1);
  } else if (sc.art) {
    if (cfg.layout === 'split') {
      const box = sc.art.placeholder ? COMP_SIZE : COMP_SIZE * 0.62;
      drawArt(sc.art, C + cfg.artX, C + cfg.artY, box * cfg.artScale, box * cfg.artScale, cfg.fit, 1);
    } else {
      const ax = C + (qx ? 1 : -1) * QUAD_ANCHOR.x + cfg.artX;
      const ay = C + (qy ? 1 : -1) * QUAD_ANCHOR.y + cfg.artY;
      const box = sc.art.placeholder ? BRAND_TILE_SIZE : 520;
      drawArt(sc.art, ax, ay, box * cfg.artScale, box * cfg.artScale, cfg.fit, 1 + 0.07 * brandPhase);
    }
  }
  ctx.restore();
};

const drawScene = (ctx: CanvasRenderingContext2D, id: SceneId, assets: Assets, st: FrameState, m: Motion) => {
  const sc = assets.scenes[id];
  if (!sc) return;
  for (let q = 0; q < 4; q++) {
    const blue = (q === 0 || q === 3) !== st.swap; // TL + BR inverted blue, TR + BL normal red
    drawSceneQuadrant(ctx, sc, assets, q, blue, m, id === 'BRAND' ? st.brandPhase : 0);
  }
};

const drawLines = (ctx: CanvasRenderingContext2D, grow: number) => {
  if (grow <= 0) return;
  const L = grow * (C + 4);
  const w = LINE_W;
  const e = LINE_EDGE;
  ctx.fillStyle = '#000';
  ctx.fillRect(C - w / 2 - e, C - L, w + 2 * e, 2 * L);
  ctx.fillRect(C - L, C - w / 2 - e, 2 * L, w + 2 * e);
  ctx.fillStyle = '#fff';
  ctx.fillRect(C - w / 2, C - L, w, 2 * L);
  ctx.fillRect(C - L, C - w / 2, 2 * L, w);
};

export const buildComposition = (comp: HTMLCanvasElement, st: FrameState, assets: Assets) => {
  const ctx = comp.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, COMP_SIZE, COMP_SIZE);

  const cam = st.camera;
  // layered parallax: artwork reacts a bit more to the camera than the panels, rays a bit less
  const a = (-cam.angle * Math.PI) / 180;
  const m: Motion = {
    t: st.t,
    artScale: 1 + Math.max(0, cam.scale - 1) * 0.35,
    raysScale: 1 - Math.max(0, cam.scale - 1) * 0.2,
    artDx: (cam.dx * Math.cos(a) - cam.dy * Math.sin(a)) * 0.35,
    artDy: (cam.dx * Math.sin(a) + cam.dy * Math.cos(a)) * 0.35,
  };

  if (st.iris > 0) {
    ctx.save();
    const R = st.iris * (C * 1.46);
    if (st.iris < 1) {
      ctx.beginPath();
      ctx.arc(C, C, R, 0, Math.PI * 2);
      ctx.clip();
    }
    if (st.wipe < 1 && st.prevScene) {
      // animated radial mask: new scene sweeps in clockwise from 12 o'clock
      drawScene(ctx, st.prevScene, assets, st, m);
      const start = -Math.PI / 2;
      const end = start + st.wipe * Math.PI * 2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(C, C);
      ctx.arc(C, C, COMP_SIZE, start, end);
      ctx.closePath();
      ctx.clip();
      drawScene(ctx, st.scene, assets, st, m);
      ctx.restore();
      if (st.wipe > 0) {
        ctx.save();
        ctx.translate(C, C);
        ctx.rotate(end);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, -LINE_W / 2 - LINE_EDGE, COMP_SIZE, LINE_W + 2 * LINE_EDGE);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, -LINE_W / 2, COMP_SIZE, LINE_W);
        ctx.restore();
      }
    } else {
      drawScene(ctx, st.scene, assets, st, m);
    }
    ctx.restore();
    if (st.iris < 1) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(C, C, R, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  drawLines(ctx, st.linesGrow);
};

const applyCamera = (ctx: CanvasRenderingContext2D, cam: CameraSample) => {
  const a = (cam.angle * Math.PI) / 180;
  const cos = Math.cos(a) * cam.scale;
  const sin = Math.sin(a) * cam.scale;
  // T(screen centre + shake) · R(angle) · S(scale) · T(-C)
  const tx = WIDTH / 2 + cam.dx;
  const ty = HEIGHT / 2 + cam.dy;
  ctx.setTransform(cos, sin, -sin, cos, tx - cos * C + sin * C, ty - sin * C - cos * C);
};

/** How far (px) the frame corners travel during the shutter interval. */
const travel = (a: CameraSample, b: CameraSample) =>
  Math.abs(((b.angle - a.angle) * Math.PI) / 180) * CORNER_R * Math.max(a.scale, b.scale) +
  Math.abs(b.scale - a.scale) * CORNER_R +
  Math.hypot(b.dx - a.dx, b.dy - a.dy);

export const SHUTTER_FRAMES = 0.6; // at motionBlur = 1 (≈216° shutter)

export type FrameInfo = {samples: number; ca: boolean; guard: boolean; state: FrameState};

export const renderFrame = (
  out: HTMLCanvasElement,
  frame: number,
  props: EditProps,
  assets: Assets,
  tl: Timeline,
  targets: RenderTargets,
  opts: {maxSamples?: number} = {},
): FrameInfo => {
  const st = tl.state(frame);
  buildComposition(targets.comp, st, assets);

  const ctx = out.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.imageSmoothingEnabled = true;

  // --- temporal supersampling motion blur --------------------------------
  const shutter = SHUTTER_FRAMES * clamp(props.motionBlur, 0, 3);
  const maxSamples = Math.max(1, Math.round(opts.maxSamples ?? props.maxBlurSamples));
  let samples = 1;
  if (shutter > 0) {
    const c0 = tl.camera(tl.warp(frame - shutter / 2));
    const c1 = tl.camera(tl.warp(frame + shutter / 2));
    samples = clamp(Math.ceil(travel(c0, c1) / 1.5), 1, maxSamples);
  }
  if (samples === 1) {
    applyCamera(ctx, st.camera);
    ctx.drawImage(targets.comp, 0, 0);
  } else {
    for (let k = 0; k < samples; k++) {
      const tau = frame - shutter / 2 + ((k + 0.5) / samples) * shutter;
      applyCamera(ctx, tl.camera(tl.warp(tau)));
      ctx.globalAlpha = 1 / (k + 1); // running average
      ctx.drawImage(targets.comp, 0, 0);
    }
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // --- chromatic aberration (radial RGB split) ----------------------------
  const caAmount = st.ca * clamp(props.chromaticAberration, 0, 2) * 0.0042;
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
      ctx.setTransform(s, 0, 0, s, (WIDTH / 2) * (1 - s), (HEIGHT / 2) * (1 - s));
      ctx.drawImage(targets.chan, 0, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // --- palette guard (no purple/green from red↔blue mixing) ---------------
  const doGuard = props.paletteGuard && (samples > 1 || doCA);
  if (doGuard) {
    const img = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    guardPalette(img.data, assets.guardTable);
    ctx.putImageData(img, 0, 0);
  }

  // --- impact flash ---------------------------------------------------------
  const flash = clamp(st.flash * props.flashIntensity, 0, 0.92);
  if (flash > 0.003) {
    ctx.fillStyle = `rgba(255,255,255,${flash})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  return {samples, ca: doCA, guard: doGuard, state: st};
};
