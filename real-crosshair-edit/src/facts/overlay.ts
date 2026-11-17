// Screen-space overlay for the fact-file section: the text card, count-ups,
// bars, source lines, the end card, film grain and the closing fade.
// Drawn after the brand layer, sharp, never blurred.

import {HEIGHT, WIDTH} from '../config';
import {clamp, easeOutCubic, easeOutExpo, smoothstep} from '../engine/bezier';
import type {OverlayExtra} from '../engine/timeline';
import {BEAT_FRAMES, FACT_BEATS, FACTS_FRAMES, type FactBeat} from './content';

const SANS = '"Geist", "Montserrat", sans-serif';
const DISPLAY = '"Montserrat", "Geist", sans-serif';
const MONO = '"Geist Mono", monospace';
const CYAN = '#39C6FF';
const BLUE = '#0866FF';
const RED = '#FF1849';

// card geometry (px, 1080×1920)
const CARD_X = 110;
const CARD_W = 860;
const CARD_Y = 580;
const CARD_H = 760;
const INNER_X = CARD_X + 44;
const INNER_W = CARD_W - 88;

type Ctx = CanvasRenderingContext2D;

const roundRect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const wrap = (ctx: Ctx, text: string, maxW: number): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(t).width > maxW) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
};

/** headline size chosen from the FINAL text so it does not jump while counting */
const fitHeadline = (ctx: Ctx, lines: string[], maxW: number, maxPx: number) => {
  ctx.font = `700 100px ${DISPLAY}`;
  ctx.letterSpacing = '0px';
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  return Math.min(maxPx, (100 * maxW) / Math.max(1, widest));
};

const scrim = (ctx: Ctx, A: number) => {
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 260, WIDTH / 2, HEIGHT / 2, 1100);
  g.addColorStop(0, 'rgba(8,11,18,0.25)');
  g.addColorStop(1, 'rgba(8,11,18,0.72)');
  ctx.globalAlpha = A;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
};

const drawCard = (ctx: Ctx, beat: FactBeat, lt: number) => {
  const inA = smoothstep(0, 10, lt);
  const outA = 1 - smoothstep(BEAT_FRAMES - 14, BEAT_FRAMES - 4, lt);
  const A = Math.min(inA, outA);
  if (A <= 0.001) return;

  scrim(ctx, A);

  // card body
  ctx.globalAlpha = A * 0.88;
  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 28);
  ctx.fillStyle = '#080B12';
  ctx.fill();
  ctx.globalAlpha = A * 0.9;
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.stroke();

  // accent bar draws in
  const bar = easeOutCubic(clamp((lt - 2) / 24, 0, 1));
  const g = ctx.createLinearGradient(INNER_X, 0, INNER_X + INNER_W, 0);
  g.addColorStop(0, BLUE);
  g.addColorStop(1, CYAN);
  ctx.globalAlpha = A;
  ctx.fillStyle = g;
  ctx.fillRect(INNER_X, CARD_Y + 40, INNER_W * bar, 4);

  // label
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = A * smoothstep(4, 16, lt);
  ctx.font = `500 26px ${MONO}`;
  ctx.letterSpacing = '4px';
  ctx.fillStyle = CYAN;
  ctx.fillText(beat.label, INNER_X, CARD_Y + 96);
  ctx.letterSpacing = '0px';

  // headline (count-ups use the eased progress e)
  const e = easeOutExpo(clamp((lt - 6) / 44, 0, 1));
  const size = fitHeadline(ctx, beat.head(1), INNER_W, 168);
  const lines = beat.head(e);
  ctx.font = `700 ${size}px ${DISPLAY}`;
  ctx.fillStyle = '#FFFFFF';
  const lineH = size * 1.04;
  let y = CARD_Y + 150 + size * 0.9;
  lines.forEach((ln, i) => {
    const r = easeOutCubic(clamp((lt - 4 - i * 7) / 28, 0, 1));
    ctx.save();
    ctx.beginPath();
    ctx.rect(INNER_X - 8, y - size * 1.05, (INNER_W + 16) * r, size * 1.3);
    ctx.clip();
    ctx.globalAlpha = A;
    ctx.fillText(ln, INNER_X, y);
    ctx.restore();
    y += lineH;
  });
  const headBase = y - lineH;

  // red underline
  ctx.globalAlpha = A;
  ctx.fillStyle = RED;
  ctx.fillRect(INNER_X, headBase + 28, 120 * easeOutCubic(clamp((lt - 14) / 24, 0, 1)), 6);

  // supporting line
  ctx.font = `600 38px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  const subLines = wrap(ctx, beat.sub, INNER_W);
  let sy = headBase + 96;
  ctx.globalAlpha = A * smoothstep(18, 32, lt);
  subLines.forEach((ln, i) => ctx.fillText(ln, INNER_X, sy + i * 50));
  sy += subLines.length * 50 + 40;

  // bars (compatibility)
  if (beat.bars) {
    const trackX = INNER_X + 120;
    const trackW = INNER_W - 120 - 150;
    beat.bars.forEach((b, i) => {
      const p = easeOutCubic(clamp((lt - 24 - i * 10) / 50, 0, 1));
      const by = sy + i * 84;
      ctx.globalAlpha = A * smoothstep(20, 34, lt);
      ctx.font = `500 26px ${MONO}`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(b.label, INNER_X, by + 26);
      ctx.textAlign = 'right';
      ctx.fillStyle = CYAN;
      ctx.fillText(b.shown, INNER_X + INNER_W, by + 26);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(trackX, by + 12, trackW, 16);
      const tg = ctx.createLinearGradient(trackX, 0, trackX + trackW, 0);
      tg.addColorStop(0, BLUE);
      tg.addColorStop(1, CYAN);
      ctx.fillStyle = tg;
      ctx.fillRect(trackX, by + 12, trackW * b.value * p, 16);
    });
  }

  // source
  ctx.globalAlpha = A * smoothstep(30, 44, lt);
  ctx.font = `400 20px ${MONO}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`SOURCE · ${beat.src}`, INNER_X, CARD_Y + CARD_H - 36);
};

const drawEnd = (ctx: Ctx, lt: number, icon: HTMLCanvasElement) => {
  const A = smoothstep(0, 14, lt);
  if (A <= 0.001) return;
  scrim(ctx, A);
  const pop = easeOutExpo(clamp(lt / 40, 0, 1));
  const size = 230 * (0.9 + 0.1 * pop);
  ctx.globalAlpha = A;
  ctx.drawImage(icon, WIDTH / 2 - size / 2, 640, size, size);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = A * smoothstep(10, 28, lt);
  ctx.font = `600 120px ${DISPLAY}`;
  ctx.letterSpacing = '8px';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('Real', WIDTH / 2 + 4, 1030);
  ctx.letterSpacing = '14px';
  ctx.font = `600 34px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillText('EXECUTOR', WIDTH / 2 + 7, 1090);
  ctx.letterSpacing = '0px';

  ctx.globalAlpha = A * smoothstep(30, 50, lt);
  ctx.font = `600 66px ${SANS}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('projectreal.gg', WIDTH / 2, 1210);
  ctx.globalAlpha = A * smoothstep(42, 62, lt);
  ctx.font = `500 42px ${SANS}`;
  ctx.fillStyle = CYAN;
  ctx.fillText('discord.gg/projectreal', WIDTH / 2, 1280);
  ctx.globalAlpha = A * smoothstep(54, 70, lt);
  ctx.font = `400 20px ${MONO}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('SOURCE · projectreal.gg · checked 17 Nov 2026', WIDTH / 2, 1350);
  ctx.textAlign = 'left';
};

let grain: HTMLCanvasElement | null = null;
const makeGrain = () => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(256, 256);
  let seed = 1337;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const v = 96 + ((seed >>> 16) % 64); // mid-grey noise for the overlay blend
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
};

const drawGrain = (ctx: Ctx, frame: number) => {
  grain ??= makeGrain();
  const pat = ctx.createPattern(grain, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.28;
  ctx.translate((frame * 37) % 256, (frame * 61) % 256); // grain moves every frame
  ctx.fillStyle = pat;
  ctx.fillRect(-256, -256, WIDTH + 512, HEIGHT + 512);
  ctx.restore();
};

export const drawFactsOverlay = (ctx: Ctx, frame: number, extra: OverlayExtra) => {
  const b = Math.min(FACT_BEATS.length - 1, Math.floor(frame / BEAT_FRAMES));
  const lt = frame - b * BEAT_FRAMES;
  const beat = FACT_BEATS[b];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  if (beat.kind === 'end') drawEnd(ctx, lt, extra.logoIcon);
  else drawCard(ctx, beat, lt);
  drawGrain(ctx, frame);
  const fade = smoothstep(FACTS_FRAMES - 16, FACTS_FRAMES - 1, frame);
  if (fade > 0) {
    // ends at 85 % black, so the last frame still shows the end card
    ctx.globalAlpha = 0.85 * fade;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  ctx.restore();
};
