#!/usr/bin/env node
// Offline renderer: serves the project, drives headless Chromium frame-by-frame, pipes raw RGBA into FFmpeg.
// usage:
//   node render.js --out build/video.mp4 [--start 0 --end 900]       full/partial video (no audio)
//   node render.js --stills 102,270,654 --dir build/qc               single PNG frames for inspection
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('playwright');
const ROOT = __dirname;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const W = 1080, H = 1920;
const start = +arg('start', 0), end = +arg('end', 900);
const out = arg('out', null), stills = arg('stills', null), dir = arg('dir', 'build/qc'), sMul = +arg('smul', 1);
const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.webp': 'image/webp', '.otf': 'font/otf', '.svg': 'image/svg+xml', '.png': 'image/png' };

let sink = null; // async (frameIndex, buffer)
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST' && u.pathname === '/frame') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => { await sink(+u.searchParams.get('i'), Buffer.concat(chunks)); res.end('ok'); });
    return;
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  let ff = null;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(ROOT, out)), { recursive: true });
    ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', '60', '-i', '-',
      '-vf', 'vflip', '-c:v', 'libx264', '-preset', 'medium', '-crf', '10', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', path.resolve(ROOT, out)], { stdio: ['pipe', 'inherit', 'inherit'] });
    sink = (i, buf) => new Promise(r => { if (!ff.stdin.write(buf)) ff.stdin.once('drain', r); else r(); });
  } else {
    fs.mkdirSync(path.resolve(ROOT, dir), { recursive: true });
    sink = (i, buf) => new Promise(r => {
      const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-', '-vf', 'vflip', '-frames:v', '1', path.resolve(ROOT, dir, `f${String(i).padStart(3, '0')}.png`)]);
      p.on('close', r); p.stdin.end(buf);
    });
  }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !m.text().includes('GPU stall')) || m.text().startsWith('word widths')) console.log('[page]', m.type(), m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/src/index.html`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 180000 });
  const frames = stills ? stills.split(',').map(Number) : Array.from({ length: end - start }, (_, k) => start + k);
  const T0 = Date.now();
  for (let k = 0; k < frames.length; k++) {
    const r = await page.evaluate(([f, sMul]) => window.renderFrame(f, { sMul }), [frames[k], sMul]);
    if (k % 10 === 0 || stills) {
      const el = (Date.now() - T0) / 1000, eta = el / (k + 1) * (frames.length - k - 1);
      console.log(`frame ${frames[k]}  S=${r.S}  ${r.ms}ms  elapsed ${el.toFixed(0)}s  eta ${eta.toFixed(0)}s`);
    }
  }
  await browser.close();
  if (ff) { ff.stdin.end(); await new Promise(r => ff.on('close', r)); }
  server.close();
  console.log('done', ((Date.now() - T0) / 1000).toFixed(1) + 's');
})().catch(e => { console.error(e); process.exit(1); });
