// Renderer for "REAL: INFINITE". Reuses the crosshair composition, rings and
// the official logo raster from the main engine, adds its own sections and a
// glitch / RGB-split / shake post pass.

import {COMP_SIZE, HEIGHT, WIDTH, type EditProps, type SceneId} from '../config';
import type {Assets} from '../engine/assets';
import {buildComposition, type RenderTargets} from '../engine/render';
import {RING_SPECS, drawRing} from '../engine/rings';
import {clamp} from '../engine/bezier';
import type {FrameState, LogoState} from '../engine/timeline';
import type {BeatInfo, InsaneTimeline} from './timeline';
import {INSANE_FRAMES} from './timeline';

const C = COMP_SIZE / 2;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const DISPLAY = '"Montserrat", "Geist", sans-serif';
const SANS = '"Geist", "Montserrat", sans-serif';
const MONO = '"Geist Mono", monospace';
const D2R = Math.PI / 180;
const CYAN = '#39C6FF';
const BLUE = '#0866FF';
const RED = '#FF1849';
const INK = '#080B12';

type Ctx = CanvasRenderingContext2D;

const rand = (a: number, b = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const outQuart = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 4);
const outBack = (x: number) => {
  const t = clamp(x, 0, 1);
  return 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
};
const inOut = (x: number) => {
  const t = clamp(x, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const LOGO_OFF: LogoState = {
  iconAlpha: 0, iconScale: 1, wordAlpha: 0, wordScale: 1, tracking: 0.1, execAlpha: 0, projAlpha: 0,
  scale: 1, offsetY: 0, plateAlpha: 0, urlAlpha: [0, 0], glow: 0,
};

const panelState = (t: number, scene: SceneId, swap: boolean, angle = 0, scale = 1): FrameState => ({
  t, camera: {angle, scale, dx: 0, dy: 0}, omega: 0, flash: 0, blueFlash: 0, ca: 0, swap, scene, prevScene: null,
  wipe: 1, panelsIris: 1, panelsAlpha: 1, linesGrow: 1, brandPhase: 0, ringsSweep: [], ringsAlpha: 0, ringsZoom: 1,
  streakAlpha: 0, bursts: [], shocks: [], grade: {contrast: 1, brightness: 1, saturate: 1, vignette: 0}, bgWave: 0,
  logo: LOGO_OFF, collapse: 0,
});

const drawComp = (ctx: Ctx, comp: HTMLCanvasElement, s: number, deg: number) => {
  const a = deg * D2R;
  const cos = Math.cos(a) * s;
  const sin = Math.sin(a) * s;
  ctx.setTransform(cos, sin, -sin, cos, CX - cos * C + sin * C, CY - sin * C - cos * C);
  ctx.drawImage(comp, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
};

/** temporal supersampling: each sub-frame is drawn on `sample`, averaged into `buf`, then onto ctx */
const blurred = (ctx: Ctx, buf: HTMLCanvasElement, sample: HTMLCanvasElement, t: number, n: number, draw: (c: Ctx, tau: number) => void) => {
  if (n <= 1) {
    draw(ctx, t);
    return;
  }
  const b = buf.getContext('2d')!;
  const sc = sample.getContext('2d')!;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-over';
  for (let k = 0; k < n; k++) {
    const tau = t - 0.3 + ((k + 0.5) / n) * 0.6;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalAlpha = 1;
    sc.globalCompositeOperation = 'source-over';
    sc.fillStyle = INK;
    sc.fillRect(0, 0, WIDTH, HEIGHT);
    draw(sc, tau);
    b.globalAlpha = 1 / (k + 1);
    b.drawImage(sample, 0, 0);
  }
  b.globalAlpha = 1;
  ctx.drawImage(buf, 0, 0);
};

const fit = (ctx: Ctx, lines: string[], weight: number, family: string, maxW: number, maxPx: number) => {
  ctx.font = `${weight} 100px ${family}`;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  return Math.min(maxPx, (100 * maxW) / Math.max(1, w));
};

const backdrop = (ctx: Ctx, assets: Assets, alpha: number, t: number) => {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const img = assets.backdrop;
  if (img && alpha > 0) {
    const k = Math.max(WIDTH / img.naturalWidth, HEIGHT / img.naturalHeight) * 1.1;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, (WIDTH - img.naturalWidth * k) / 2 + Math.sin(t / 50) * 30, (HEIGHT - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    ctx.globalAlpha = 1;
  }
};

// ---------------------------------------------------------------------------
// intro: terminal
const drawIntro = (ctx: Ctx, assets: Assets, tl: InsaneTimeline, t: number, b: BeatInfo) => {
  backdrop(ctx, assets, 0.2, t);
  const B = tl.beats;
  const x = 110;
  const y = 690;
  const w = 860;
  const h = 470;
  const on = t >= B[0] - 4;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (on) {
    const pop = outBack((t - B[0] + 4) / 10);
    ctx.save();
    ctx.translate(CX, y + h / 2);
    ctx.scale(pop, pop);
    ctx.translate(-CX, -(y + h / 2));
    ctx.fillStyle = 'rgba(13,16,24,0.94)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(57,198,255,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y + 64, w, 2);
    ctx.drawImage(assets.logoIcon, x + 28, y + 16, 34, 34);
    ctx.font = `500 24px ${MONO}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('real.exe', x + 76, y + 42);
    ['#FF1849', '#FFFFFF', '#39C6FF'].forEach((c, k) => {
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(x + w - 110 + k * 34, y + 33, 9, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.font = `500 34px ${MONO}`;
    const cmd = '> real.exe --inject';
    const typed = Math.floor(cmd.length * clamp((t - B[0]) / Math.max(1, B[1] - B[0] - 4), 0, 1));
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(cmd.slice(0, typed), x + 40, y + 130);
    if (t < B[1] && Math.floor(t / 15) % 2 === 0) ctx.fillRect(x + 40 + ctx.measureText(cmd.slice(0, typed)).width + 4, y + 102, 18, 34);
    const line = (txt: string, ok: string, yy: number) => {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(txt, x + 40, yy);
      ctx.fillStyle = CYAN;
      ctx.fillText(ok, x + 40 + ctx.measureText(txt).width, yy);
    };
    if (t >= B[1]) line('  loading modules ...... ', 'OK', y + 196);
    if (t >= B[2]) {
      line('  attaching ............ ', 'OK', y + 262);
      const p = clamp((t - B[2]) / (B[3] - B[2]), 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(`  injecting  ${Math.round(p * 100)}%`, x + 40, y + 340);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 70, y + 370, w - 140, 18);
      const g = ctx.createLinearGradient(x + 70, 0, x + w - 70, 0);
      g.addColorStop(0, BLUE);
      g.addColorStop(1, CYAN);
      ctx.fillStyle = g;
      ctx.fillRect(x + 70, y + 370, (w - 140) * p, 18);
    }
    ctx.restore();
  }
  // INJECTED slam
  if (t >= B[3]) {
    const s = 1 + 1.2 * (1 - outBack((t - B[3]) / 9));
    const size = fit(ctx, ['INJECTED'], 700, DISPLAY, 940, 200) * s;
    ctx.font = `700 ${size}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = RED;
    ctx.fillText('INJECTED', CX + 10, CY + 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('INJECTED', CX, CY);
  }
  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let yy = 0; yy < HEIGHT; yy += 4) ctx.fillRect(0, yy, WIDTH, 1);
  void b;
};

// ---------------------------------------------------------------------------
// tunnel: the crosshair composition nested inside itself, zooming in forever
const K = 1.6;
const RC = 700;
const TUNNEL_SCENES: SceneId[] = ['D', 'A', 'C', 'BRAND', 'D', 'A'];

const tunnelLevel = (tl: InsaneTimeline, t: number) => {
  const b = tl.at(t);
  if (b.sec !== 'tunnel') return b.sec === 'intro' ? 0 : 9;
  return (b.i - 4) * 1.5 + 1.5 * outQuart(b.lt / b.len);
};

const drawTunnelAt = (ctx: Ctx, comp: HTMLCanvasElement, icon: HTMLCanvasElement, L: number) => {
  const k0 = Math.floor(L);
  ctx.save();
  for (let k = k0; k < k0 + 16; k++) {
    const s = Math.pow(K, L - k);
    if (1200 * s < 2) break;
    if (k > k0) {
      ctx.beginPath();
      ctx.arc(CX, CY, RC * Math.pow(K, L - (k - 1)), 0, Math.PI * 2);
      ctx.clip();
    }
    drawComp(ctx, comp, s, k * 45 + (L - k) * 30);
  }
  ctx.restore();
  ctx.strokeStyle = '#FFFFFF';
  for (let k = k0; k < k0 + 16; k++) {
    const r = RC * Math.pow(K, L - k);
    if (r < 3) break;
    if (r > 1500) continue;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(1, 6 * Math.pow(K, L - k));
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // the logo waits at the vanishing point and grows as we fall toward it
  if (L > 4) {
    const size = 30 * Math.pow(K, L - 5);
    ctx.globalAlpha = clamp((L - 4) / 1.5, 0, 1);
    ctx.drawImage(icon, CX - size / 2, CY - size / 2, size, size);
    ctx.globalAlpha = 1;
  }
};

// ---------------------------------------------------------------------------
// kinetic type
const WORDS: string[][] = [['REAL'], ['UNDETECTED'], ['sUNC 100'], ['UNC 100'], ['MYRIAD 99'], ['1 KEY', 'SYSTEM'], ['$2.99'], ['CRYPTO']];
const TYPE_SCENES: SceneId[] = ['A', 'D', 'C', 'BRAND', 'B', 'D', 'A', 'C'];

const drawWord = (ctx: Ctx, j: number, lt: number, t: number, layer: HTMLCanvasElement) => {
  const lines = WORDS[j];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fill = (txt: string, x: number, y: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillText(txt, x, y);
  };
  switch (j) {
    case 0: {
      // zoom-through with echo trail
      const p = outQuart(lt / 12);
      const base = fit(ctx, lines, 700, DISPLAY, 900, 340);
      for (let e = 4; e >= 0; e--) {
        const sc = 1 + (1 - p) * 3 + e * 0.14 * (1 - 0.6 * p);
        ctx.font = `700 ${base * sc}px ${DISPLAY}`;
        ctx.globalAlpha = e === 0 ? 1 : 0.2 * (1 - e / 5);
        if (e === 0) fill('REAL', CX + 12, CY + 12, RED);
        fill('REAL', CX, CY, '#FFFFFF');
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 1: {
      // horizontal slice glitch + RGB split
      const size = fit(ctx, lines, 700, DISPLAY, 960, 300);
      ctx.font = `700 ${size}px ${DISPLAY}`;
      const amp = 90 * Math.exp(-lt / 6) + (rand(Math.floor(t / 3), 9) > 0.75 ? 18 : 0);
      const N = 10;
      const top = CY - size * 0.6;
      for (let k = 0; k < N; k++) {
        const y0 = top + (k * size * 1.2) / N;
        const off = (rand(k, Math.floor(t / 2)) - 0.5) * 2 * amp;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y0, WIDTH, (size * 1.2) / N + 1);
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        fill('UNDETECTED', CX + off + 8, CY, RED);
        fill('UNDETECTED', CX + off - 8, CY, CYAN);
        ctx.globalCompositeOperation = 'source-over';
        fill('UNDETECTED', CX + off, CY, '#FFFFFF');
        ctx.restore();
      }
      break;
    }
    case 2:
    case 3: {
      // counters
      const [label, num] = lines[0].split(' ');
      const v = Math.round(Number(num) * outQuart(lt / 14));
      ctx.font = `500 54px ${MONO}`;
      ctx.letterSpacing = '12px';
      fill(label, CX + 6, CY - 230, CYAN);
      ctx.letterSpacing = '0px';
      ctx.font = `700 380px ${DISPLAY}`;
      fill(String(v), CX + 10, CY + 10, j === 2 ? BLUE : '#FFFFFF');
      fill(String(v), CX, CY, j === 2 ? '#FFFFFF' : RED);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(CX - 380, CY + 230, 760, 16);
      ctx.fillStyle = j === 2 ? CYAN : RED;
      ctx.fillRect(CX - 380, CY + 230, 760 * outQuart(lt / 14), 16);
      break;
    }
    case 4: {
      // stacked outline scroll
      const size = fit(ctx, lines, 700, DISPLAY, 920, 230);
      ctx.font = `700 ${size}px ${DISPLAY}`;
      const step = size * 0.95;
      const scroll = (lt * 4) % step;
      for (let k = -5; k <= 5; k++) {
        const y = CY + k * step - scroll;
        if (k === 0) {
          fill('MYRIAD 99', CX, y, '#FFFFFF');
        } else {
          ctx.globalAlpha = Math.max(0, 0.75 - Math.abs(k) * 0.13);
          ctx.strokeStyle = k % 2 ? CYAN : '#FFFFFF';
          ctx.lineWidth = 3;
          ctx.strokeText('MYRIAD 99', CX, y);
          ctx.globalAlpha = 1;
        }
      }
      break;
    }
    case 5: {
      // split by the crosshair: each quadrant colours the text differently
      const size = fit(ctx, lines, 700, DISPLAY, 940, 300);
      ctx.font = `700 ${size}px ${DISPLAY}`;
      const quads: Array<[number, number, string]> = [
        [0, 0, '#FFFFFF'],
        [CX, 0, CYAN],
        [0, CY, RED],
        [CX, CY, '#FFFFFF'],
      ];
      const slide = (1 - outQuart(lt / 10)) * 300;
      for (const [qx, qy, col] of quads) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(qx, qy, CX, CY);
        ctx.clip();
        const dir = qx === 0 ? -1 : 1;
        fill(lines[0], CX + dir * slide, CY - size * 0.55, col);
        fill(lines[1], CX - dir * slide, CY + size * 0.55, col);
        ctx.restore();
      }
      break;
    }
    case 6: {
      // card flip + glint
      const size = fit(ctx, lines, 700, DISPLAY, 900, 420);
      const l = layer.getContext('2d')!;
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.globalCompositeOperation = 'source-over';
      l.clearRect(0, 0, WIDTH, HEIGHT);
      l.font = `700 ${size}px ${DISPLAY}`;
      l.textAlign = 'center';
      l.textBaseline = 'middle';
      l.fillStyle = '#FFFFFF';
      l.fillText('$2.99', CX, CY);
      l.globalCompositeOperation = 'source-atop';
      const gx = -400 + clamp((lt - 10) / 18, 0, 1) * (WIDTH + 800);
      const g = l.createLinearGradient(gx - 120, 0, gx + 120, 0);
      g.addColorStop(0, 'rgba(57,198,255,0)');
      g.addColorStop(0.5, 'rgba(57,198,255,1)');
      g.addColorStop(1, 'rgba(57,198,255,0)');
      l.fillStyle = g;
      l.fillRect(0, 0, WIDTH, HEIGHT);
      const sx = Math.max(0.02, Math.cos((1 - outQuart(lt / 12)) * Math.PI * 0.5));
      ctx.save();
      ctx.translate(CX, CY);
      ctx.scale(sx, 1);
      ctx.translate(-CX, -CY);
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
      break;
    }
    case 7: {
      // ring text spinning around the word
      const size = fit(ctx, lines, 700, DISPLAY, 640, 240) * (0.8 + 0.2 * outBack(lt / 10));
      ctx.font = `700 ${size}px ${DISPLAY}`;
      fill('CRYPTO', CX, CY, '#FFFFFF');
      ctx.font = `600 40px ${SANS}`;
      const txt = 'CRYPTO · '.repeat(8);
      const R = 430;
      let a = t * 1.6 * D2R;
      const per = (Math.PI * 2) / txt.length;
      for (const ch of txt) {
        ctx.save();
        ctx.translate(CX + Math.cos(a) * R, CY + Math.sin(a) * R);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = CYAN;
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        a += per;
      }
      break;
    }
  }
};

// ---------------------------------------------------------------------------
// logo assembly + end card
const drawRingsLocked = (ctx: Ctx, p: number, props: EditProps, zoom = 1, alpha = 1) => {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  RING_SPECS.forEach((s) => {
    const deg = s.home + s.dir * 900 * Math.pow(1 - clamp(p, 0, 1), 3);
    ctx.globalAlpha = s.alpha * alpha;
    const col = s.color === 'white' ? '#FFFFFF' : s.color === 'cyan' ? CYAN : s.color === 'electric' ? BLUE : RED;
    drawRing(ctx, s, deg, {
      cx: CX, cy: CY, zoom, color: col, longColor: s.longColor === 'cyan' ? CYAN : col, thickness: props.ringThickness,
      tickDensity: props.tickDensity, labelFont: `500 15px ${MONO}`, sweep: clamp(p * 2.5, 0, 1),
    });
  });
  ctx.restore();
};

const drawLockup = (ctx: Ctx, icon: HTMLCanvasElement, iconP: number, wordA: number, extra: number) => {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(CX, CY, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const g = ctx.createRadialGradient(CX, CY - 90, 0, CX, CY - 90, 260);
  g.addColorStop(0, `rgba(8,102,255,${0.5 * iconP})`);
  g.addColorStop(1, 'rgba(8,102,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(CX - 300, CY - 390, 600, 600);
  const size = 210 * outBack(iconP);
  if (size > 1) ctx.drawImage(icon, CX - size / 2, CY - 92 - size / 2, size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = wordA;
  ctx.font = `600 104px ${DISPLAY}`;
  ctx.letterSpacing = `${10 + 30 * (1 - wordA)}px`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('Real', CX + 5, CY + 112);
  ctx.letterSpacing = '12px';
  ctx.font = `600 25px ${SANS}`;
  ctx.globalAlpha = wordA * 0.8;
  ctx.fillText('EXECUTOR', CX + 6, CY + 166);
  ctx.letterSpacing = '0px';
  ctx.globalAlpha = extra;
  ctx.font = `600 50px ${SANS}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('projectreal.gg', CX, CY + 430);
  ctx.font = `500 40px ${SANS}`;
  ctx.fillStyle = CYAN;
  ctx.fillText('discord.gg/projectreal', CX, CY + 500);
  ctx.globalAlpha = 1;
};

// ---------------------------------------------------------------------------
let grain: HTMLCanvasElement | null = null;
const drawGrain = (ctx: Ctx, t: number) => {
  if (!grain) {
    grain = document.createElement('canvas');
    grain.width = 256;
    grain.height = 256;
    const g = grain.getContext('2d')!;
    const img = g.createImageData(256, 256);
    let seed = 77;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      const v = 96 + ((seed >>> 16) % 64);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const pat = ctx.createPattern(grain, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.3;
  ctx.translate((Math.floor(t) * 37) % 256, (Math.floor(t) * 61) % 256);
  ctx.fillStyle = pat;
  ctx.fillRect(-256, -256, WIDTH + 512, HEIGHT + 512);
  ctx.restore();
};

/** glitch slices + RGB split + shake, from a copy of the frame */
const post = (out: HTMLCanvasElement, tg: RenderTargets, glitch: number, split: number, dx: number, dy: number, seed: number) => {
  if (glitch < 0.02 && split < 0.6 && Math.abs(dx) + Math.abs(dy) < 0.5) return;
  const ctx = out.getContext('2d')!;
  const s = tg.scratch.getContext('2d')!;
  s.globalCompositeOperation = 'copy';
  s.drawImage(out, 0, 0);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const N = 16;
  for (let k = 0; k < N; k++) {
    const y0 = Math.floor((k * HEIGHT) / N);
    const h = Math.ceil(HEIGHT / N);
    const off = rand(seed, k) > 0.55 ? (rand(k, seed) - 0.5) * 2 * glitch * 110 : 0;
    ctx.drawImage(tg.scratch, 0, y0, WIDTH, h, off + dx, y0 + dy, WIDTH, h);
  }
  if (split >= 0.6) {
    s.drawImage(out, 0, 0);
    const c = tg.chan.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalCompositeOperation = 'lighter';
    for (const [col, ox] of [['#ff0000', split], ['#00ff00', 0], ['#0000ff', -split]] as Array<[string, number]>) {
      c.globalCompositeOperation = 'copy';
      c.drawImage(tg.scratch, 0, 0);
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = col;
      c.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(tg.chan, ox, 0);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
};

// ---------------------------------------------------------------------------
export const renderInsane = (out: HTMLCanvasElement, frame: number, props: EditProps, assets: Assets, tl: InsaneTimeline, tg: RenderTargets) => {
  const ctx = out.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  const t = frame;
  const b = tl.at(t);
  const B = tl.beats;
  const icon = assets.logoIcon;

  let hit = 0.25; // beat hit strength for this beat
  if (b.sec === 'intro') {
    drawIntro(ctx, assets, tl, t, b);
    hit = b.i === 3 ? 1 : 0.15;
  } else if (b.sec === 'tunnel') {
    const scene = TUNNEL_SCENES[clamp(b.i - 4, 0, 5)];
    buildComposition(tg.comp, panelState(t, scene, b.i % 2 === 1), assets, props.invertBluePanels);
    const dL = Math.abs(tunnelLevel(tl, t + 0.3) - tunnelLevel(tl, t - 0.3));
    const n = clamp(Math.ceil(dL * 30), 1, 8);
    blurred(ctx, tg.panels, tg.chan, t, n, (c, tau) => drawTunnelAt(c, tg.comp, icon, tunnelLevel(tl, tau)));
    hit = b.i === 4 ? 0.8 : 0.3;
  } else if (b.sec === 'type') {
    const j = clamp(b.i - 10, 0, 7);
    const degAt = (tau: number) => {
      const lt = tau - B[b.i];
      return (j - 1) * 90 + 90 * inOut(lt / 10);
    };
    buildComposition(tg.comp, panelState(t, TYPE_SCENES[j], j % 2 === 1, degAt(t), 1.06), assets, props.invertBluePanels);
    backdrop(ctx, assets, 0, t);
    const scale = 1.06 + 0.08 * Math.exp(-b.lt / 6);
    blurred(ctx, tg.panels, tg.chan, t, b.lt < 11 ? 8 : 1, (c, tau) => drawComp(c, tg.comp, scale, degAt(tau)));
    ctx.fillStyle = 'rgba(8,11,18,0.55)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawWord(ctx, j, b.lt, t, tg.fx);
    hit = b.i === 10 ? 1 : 0.45;
  } else if (b.sec === 'logo') {
    const p = (t - tl.bounds.logo) / (tl.bounds.end - tl.bounds.logo);
    backdrop(ctx, assets, 0.3, t);
    drawRingsLocked(ctx, p, props, 0.9 + 0.1 * outQuart(p));
    const iconP = clamp((t - B[19]) / Math.max(1, B[21] - B[19]), 0, 1);
    drawLockup(ctx, icon, iconP, clamp((t - B[21]) / 12, 0, 1), 0);
    hit = b.i === 18 ? 0.7 : 0.2;
  } else {
    const age = t - tl.bounds.end;
    backdrop(ctx, assets, 0, t);
    buildComposition(tg.comp, panelState(t, 'D', false), assets, props.invertBluePanels);
    ctx.globalAlpha = 0.45;
    drawComp(ctx, tg.comp, 1.05 + 0.04 * (age / 120), 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(8,11,18,0.45)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawRingsLocked(ctx, 1, props, 1, 0.8);
    const sp = clamp(age / 32, 0, 1);
    if (sp < 1) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.globalAlpha = Math.pow(1 - sp, 1.5);
      ctx.lineWidth = 24 * (1 - sp) + 2;
      ctx.beginPath();
      ctx.arc(CX, CY, 300 + 1400 * outQuart(sp), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawLockup(ctx, icon, 1, 1, clamp((age - 20) / 20, 0, 1));
    hit = b.i === 22 ? 1 : 0.2;
  }

  // post: shake, glitch, RGB split, flash, grain, vignette, glitch-out
  const kick = Math.exp(-b.lt / 5) * (b.i >= 0 ? hit : 0);
  const outro = clamp((t - (INSANE_FRAMES - 18)) / 16, 0, 1);
  const glitch = Math.min(1.5, kick * (b.sec === 'type' ? 1 : 0.6) + outro * 1.5);
  const split = 14 * kick + 30 * outro;
  const shake = 26 * kick;
  post(out, tg, glitch, split, shake * (rand(t, 1) - 0.5) * 2, shake * (rand(t, 2) - 0.5) * 2, b.i * 13 + Math.floor(t / 2));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  const flash = Math.min(0.6, 0.6 * hit * Math.exp(-b.lt / 3.5));
  if (b.i >= 0 && flash > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${flash})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  drawGrain(ctx, t);
  const vg = ctx.createRadialGradient(CX, CY, HEIGHT * 0.3, CX, CY, 1150);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (outro > 0) {
    ctx.fillStyle = `rgba(0,0,0,${0.9 * outro})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
};
