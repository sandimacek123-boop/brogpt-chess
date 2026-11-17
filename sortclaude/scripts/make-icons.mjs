// Renders public/icon.svg to PNGs and packs a multi-resolution Windows .ico (PNG-compressed entries).
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const svg = await readFile('public/icon.svg', 'utf8');
const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
const launch = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launch);
const page = await browser.newPage();
await mkdir('build', { recursive: true });
const pngs = {};
for (const s of sizes) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
  pngs[s] = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } });
}
await browser.close();
await writeFile('build/icon.png', pngs[512]);
await writeFile('public/icon-256.png', pngs[256]);
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const header = Buffer.alloc(6 + 16 * icoSizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
icoSizes.forEach((s, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(s === 256 ? 0 : s, e);
  header.writeUInt8(s === 256 ? 0 : s, e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[s].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[s].length;
});
await writeFile('build/icon.ico', Buffer.concat([header, ...icoSizes.map((s) => pngs[s])]));
console.log('icons written: build/icon.ico, build/icon.png');
