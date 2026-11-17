// Centre brand layer: the official REAL symbol (app-icon lockup), the "Real"
// wordmark, secondary text and outro links. Drawn in screen space AFTER all
// spinning / blurred layers, so the type stays razor sharp and upright.

import {HEIGHT, LOGO_GRADIENT, WIDTH, type BrandSettings, type Palette} from '../config';
import type {LogoState} from './timeline';

export const WORDMARK_FONT = '"Montserrat", "Geist", sans-serif';
export const UI_FONT = '"Geist", "Montserrat", sans-serif';
export const MONO = '"Geist Mono", monospace';

// official symbol geometry (path bbox inside the 707×654 viewBox of real-logo.svg)
const SYM = {vbW: 707, vbH: 654, x0: 73, y0: 123, x1: 663, y1: 619};
const SYM_W = SYM.x1 - SYM.x0;
const SYM_H = SYM.y1 - SYM.y0;
const SYM_CX = (SYM.x0 + SYM.x1) / 2;
const SYM_CY = (SYM.y0 + SYM.y1) / 2;

export const ICON_RES = 640; // icon raster resolution (drawn ≤ ~300 px → always downsampled = crisp)

/**
 * Builds the logo raster once.
 *  app-icon: white rounded square, official symbol filled with the official gradient
 *  symbol:   the official white symbol on transparent
 * A custom uploaded logo (not the official SVG) is drawn untouched, aspect preserved.
 */
export const buildLogoIcon = (img: HTMLImageElement, style: BrandSettings['logoStyle'], official: boolean) => {
  const c = document.createElement('canvas');
  c.width = ICON_RES;
  c.height = ICON_RES;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const S = ICON_RES;

  if (!official) {
    const k = Math.min(S / img.naturalWidth, S / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
    return c;
  }

  // symbol layer
  const sym = document.createElement('canvas');
  sym.width = S;
  sym.height = S;
  const sctx = sym.getContext('2d')!;
  const symW = style === 'app-icon' ? 0.73 * S : 0.92 * S;
  const k = symW / SYM_W;
  const cy = style === 'app-icon' ? S / 2 + 0.057 * S : S / 2;
  const dx = S / 2 - SYM_CX * k;
  const dy = cy - SYM_CY * k;
  sctx.drawImage(img, dx, dy, SYM.vbW * k, SYM.vbH * k);

  if (style === 'app-icon') {
    // official gradient, top → bottom across the symbol
    sctx.globalCompositeOperation = 'source-in';
    const top = cy - (SYM_H * k) / 2;
    const g = sctx.createLinearGradient(0, top, 0, top + SYM_H * k);
    g.addColorStop(0, LOGO_GRADIENT.top);
    g.addColorStop(1, LOGO_GRADIENT.bottom);
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, S, S);
    // white rounded square
    const r = 0.225 * S;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(S, 0, S, S, r);
    ctx.arcTo(S, S, 0, S, r);
    ctx.arcTo(0, S, 0, 0, r);
    ctx.arcTo(0, 0, S, 0, r);
    ctx.closePath();
    ctx.fill();
  }
  ctx.drawImage(sym, 0, 0);
  return c;
};

const spacedText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, trackingPx: number) => {
  // letter-spaced, optically centred (no trailing space)
  ctx.letterSpacing = `${trackingPx}px`;
  ctx.textAlign = 'center';
  ctx.fillText(text, x + trackingPx / 2, y);
  ctx.letterSpacing = '0px';
};

export type BrandLayout = {cx: number; cy: number; plateR: number};

export const PLATE_R = 300;
const ICON_SIZE = 214;

/** Where the lockup sits this frame (used by the renderer for the plate + rings). */
export const brandLayout = (b: BrandSettings, logo: LogoState, shake: {dx: number; dy: number}): BrandLayout => ({
  cx: WIDTH / 2 + b.logoX + shake.dx * 0.35,
  cy: HEIGHT / 2 + b.logoY + logo.offsetY + shake.dy * 0.35,
  plateR: PLATE_R * b.logoScale * logo.scale,
});

export const drawPlate = (ctx: CanvasRenderingContext2D, lay: BrandLayout, pal: Palette, alpha: number, reticleDeg: number) => {
  if (alpha <= 0.002) return;
  const {cx, cy, plateR: R} = lay;
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(cx, cy - R * 0.25, R * 0.1, cx, cy, R);
  g.addColorStop(0, pal.graphite);
  g.addColorStop(1, pal.nearBlack);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.cyan;
  ctx.globalAlpha = alpha * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 9, 0, Math.PI * 2);
  ctx.stroke();
  // reticle ticks where the crosshair lines meet the plate (follow the panels)
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = ((reticleDeg + k * 90) * Math.PI) / 180;
    ctx.moveTo(cx + Math.cos(a) * (R - 18), cy + Math.sin(a) * (R - 18));
    ctx.lineTo(cx + Math.cos(a) * (R + 2), cy + Math.sin(a) * (R + 2));
  }
  ctx.stroke();
  ctx.restore();
};

export const drawBrand = (
  ctx: CanvasRenderingContext2D,
  icon: HTMLCanvasElement,
  b: BrandSettings,
  pal: Palette,
  logo: LogoState,
  lay: BrandLayout,
) => {
  const s = b.logoScale * logo.scale;
  const {cx, cy} = lay;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.textBaseline = 'alphabetic';

  // soft electric-blue light behind the symbol (cinematic accent)
  const iconCy = cy - 92 * s;
  if (logo.glow > 0) {
    const gr = ctx.createRadialGradient(cx, iconCy, 0, cx, iconCy, 260 * s);
    gr.addColorStop(0, `rgba(8,102,255,${0.55 * logo.glow * logo.iconAlpha})`);
    gr.addColorStop(1, 'rgba(8,102,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(cx - 300 * s, iconCy - 300 * s, 600 * s, 600 * s);
  }

  // icon
  if (logo.iconAlpha > 0) {
    const size = ICON_SIZE * s * logo.iconScale;
    ctx.globalAlpha = logo.iconAlpha;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24 * s;
    ctx.shadowOffsetY = 6 * s;
    ctx.drawImage(icon, cx - size / 2, iconCy - size / 2, size, size);
    ctx.shadowColor = 'transparent';
  }

  // wordmark "Real"
  if (logo.wordAlpha > 0 && b.wordmark) {
    const fs = 104 * s * b.wordmarkSize * logo.wordScale;
    ctx.globalAlpha = logo.wordAlpha;
    ctx.fillStyle = pal.white;
    ctx.font = `600 ${fs}px ${WORDMARK_FONT}`;
    spacedText(ctx, b.wordmark, cx, cy + 112 * s, fs * logo.tracking);
  }

  // secondary descriptor
  if (b.showSecondary && logo.execAlpha > 0) {
    const fs = 25 * s;
    ctx.globalAlpha = logo.execAlpha * 0.82;
    ctx.fillStyle = pal.white;
    ctx.font = `600 ${fs}px ${UI_FONT}`;
    spacedText(ctx, 'EXECUTOR', cx, cy + 166 * s, fs * 0.46);
  }
  if (b.showProjectReal && logo.projAlpha > 0) {
    const fs = 19 * s;
    ctx.globalAlpha = logo.projAlpha * 0.9;
    ctx.fillStyle = pal.cyan;
    ctx.font = `500 ${fs}px ${MONO}`;
    spacedText(ctx, 'PROJECT REAL', cx, cy - 226 * s, fs * 0.42);
  }
  ctx.restore();
};

export const drawLinks = (ctx: CanvasRenderingContext2D, b: BrandSettings, pal: Palette, logo: LogoState, lay: BrandLayout) => {
  const lines: Array<[string, number, number, number]> = [];
  if (b.showWebsite) lines.push(['projectreal.gg', 50, 0.97, logo.urlAlpha[0]]);
  if (b.showDiscord) lines.push(['discord.gg/projectreal', 40, 0.82, logo.urlAlpha[1]]);
  if (!lines.length) return;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  let y = lay.cy + lay.plateR + 104;
  for (const [text, size, a, alpha] of lines) {
    if (alpha > 0) {
      ctx.globalAlpha = alpha * a;
      ctx.fillStyle = pal.white;
      ctx.font = `500 ${size}px ${UI_FONT}`;
      spacedText(ctx, text, lay.cx, y + (1 - alpha) * 18, size * 0.03);
    }
    y += size + 30;
  }
  // thin divider above the links
  const div = Math.max(logo.urlAlpha[0], 0);
  if (div > 0) {
    ctx.globalAlpha = div * 0.6;
    ctx.fillStyle = pal.cyan;
    ctx.fillRect(lay.cx - 60 * div, lay.cy + lay.plateR + 44, 120 * div, 2);
  }
  ctx.restore();
};
