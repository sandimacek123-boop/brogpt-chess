#!/usr/bin/env node
// Headless frame renderer for THE INFINITE EQUATION.
//   node render.js stills --scale 0.5 --times 1,3,5          -> out/stills/*.png
//   node render.js frames --scale 1 --sub 4 --workers 2       -> out/frames/f_00000.png ...
//   node render.js encode                                     -> out/the-infinite-equation.mp4
//   add --page cicada.html to render the Cicada 3301 edit instead
// Frames are rendered deterministically by index, so rendering is resumable and
// can be split across parallel browser workers.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const args = process.argv.slice(2);
const mode = args[0] || 'stills';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SCALE = +opt('scale', 1), SUB = +opt('sub', 1), WORKERS = +opt('workers', 1);
const OUT = path.join(ROOT, opt('out', 'out'));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json' };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

async function openPage(browser, port, extra = '') {
  const W = Math.round(1080 * SCALE), H = Math.round(1920 * SCALE);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/${opt('page', 'index.html')}?scale=${SCALE}&sub=${SUB}${extra}`);
  await page.waitForFunction(() => window.READY || window.ERROR, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.ERROR);
  if (err) throw new Error(err);
  return page;
}

async function grabTo(page, frame, file) {
  const data = await page.evaluate((i) => { window.renderFrame(i); return window.grab('image/png'); }, frame);
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
}

const launch = () => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

(async () => {
  if (mode === 'encode') return encode();
  const srv = await serve();
  const port = srv.address().port;
  if (mode === 'stills') {
    const times = opt('times', '0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5,13.5,14.3').split(',').map(Number);
    const dir = path.join(OUT, 'stills'); fs.mkdirSync(dir, { recursive: true });
    const browser = await launch();
    const page = await openPage(browser, port);
    for (const t of times) {
      const t0 = Date.now();
      await grabTo(page, Math.round(t * 60), path.join(dir, `t_${t.toFixed(2)}.png`));
      console.log(`t=${t}s  ${Date.now() - t0} ms`);
    }
    await browser.close();
  } else if (mode === 'frames') {
    const dir = path.join(OUT, 'frames'); fs.mkdirSync(dir, { recursive: true });
    const [a, b] = opt('range', '0-899').split('-').map(Number);
    const stride = +opt('stride', 1);
    const todo = [];
    for (let i = a; i <= b; i += stride) if (!fs.existsSync(path.join(dir, `f_${String(i).padStart(5, '0')}.png`))) todo.push(i);
    console.log(`${todo.length} frames to render with ${WORKERS} worker(s), scale ${SCALE}, sub ${SUB}`);
    const t0 = Date.now(); let done = 0;
    await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
      const browser = await launch();
      const page = await openPage(browser, port);
      for (let k = w; k < todo.length; k += WORKERS) {
        const i = todo[k];
        const file = path.join(dir, `f_${String(i).padStart(5, '0')}.png`);
        await grabTo(page, i, file + '.tmp');
        fs.renameSync(file + '.tmp', file);
        done++;
        if (done % 10 === 0 || done === todo.length) {
          const el = (Date.now() - t0) / 1000;
          console.log(`${done}/${todo.length}  ${(el / done).toFixed(2)} s/frame  eta ${((todo.length - done) * el / done / 60).toFixed(1)} min`);
        }
      }
      await browser.close();
    }));
  }
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });

function encode() {
  const dir = path.join(OUT, 'frames');
  const name = opt('name', 'the-infinite-equation.mp4');
  const fps = opt('fps', '60');
  const r = spawnSync('ffmpeg', [
    '-y', '-framerate', fps, '-i', path.join(dir, 'f_%05d.png'),
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-map', '0:v', '-map', '1:a', '-shortest',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', opt('crf', '14'), '-profile:v', 'high', '-level', '4.2',
    '-pix_fmt', 'yuv420p', '-tune', 'film', '-x264-params', 'aq-mode=3',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '128k', '-t', '15', '-movflags', '+faststart',
    path.join(OUT, name),
  ], { stdio: 'inherit' });
  process.exit(r.status);
}
