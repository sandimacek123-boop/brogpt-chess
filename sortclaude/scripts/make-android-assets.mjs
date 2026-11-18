// Generates Android launcher icons (legacy, round, adaptive foreground) and branded splash screens.
import { chromium } from 'playwright';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const RES = 'android/app/src/main/res';
const svg = await readFile('public/icon.svg', 'utf8');
const bars = `<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#38dfff"/><stop offset=".55" stop-color="#a855f7"/><stop offset="1" stop-color="#f43fbd"/></linearGradient></defs>
<rect x="13" y="41" width="5.5" height="7" rx="2.4" fill="url(#g)"/><rect x="21" y="34" width="5.5" height="14" rx="2.4" fill="url(#g)"/><rect x="29" y="27" width="5.5" height="21" rx="2.4" fill="url(#g)"/><rect x="37" y="20" width="5.5" height="28" rx="2.4" fill="url(#g)"/><rect x="45" y="13" width="5.5" height="35" rx="2.4" fill="url(#g)"/>`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
async function render(html, w, h, transparent = true) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#050509'}">${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, s] of Object.entries(DENS)) {
  const L = Math.round(48 * s);
  await writeFile(`${RES}/mipmap-${d}/ic_launcher.png`, await render(svg.replace('<svg ', `<svg width="${L}" height="${L}" `), L, L));
  const round = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${L}" viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#0e0e17"/><g transform="translate(4.5 3.5) scale(0.86)">${bars}</g></svg>`;
  await writeFile(`${RES}/mipmap-${d}/ic_launcher_round.png`, await render(round, L, L));
  // adaptive foreground: 108dp canvas, artwork inside the 66dp safe zone
  const F = Math.round(108 * s);
  const fg = `<svg xmlns="http://www.w3.org/2000/svg" width="${F}" height="${F}" viewBox="0 0 108 108"><g transform="translate(22 21) scale(1.0)">${bars}</g></svg>`;
  await writeFile(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, await render(fg, F, F));
}
await writeFile(`${RES}/values/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0E0E17</color>\n</resources>\n');
// splash screens: keep each file's exact size
const dirs = (await readdir(RES)).filter((x) => x.startsWith('drawable'));
for (const dir of dirs) {
  const file = path.join(RES, dir, 'splash.png');
  let buf;
  try { buf = await readFile(file); } catch { continue; }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const m = Math.min(w, h);
  const icon = Math.round(m * 0.22);
  const html = `<div style="width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 45%,#1a1033 0%,#050509 60%);font-family:sans-serif">
    ${svg.replace('<svg ', `<svg width="${icon}" height="${icon}" `)}
    <div style="margin-top:${Math.round(m * 0.04)}px;color:#f5f5fa;font-weight:600;font-size:${Math.round(m * 0.055)}px;letter-spacing:.02em">SortClaude <span style="color:#38dfff">5.5</span></div></div>`;
  await writeFile(file, await render(html, w, h, false));
}
await browser.close();
console.log('android icons + splash written');
