// Renders eco-video/index.html frame by frame and pipes the frames into ffmpeg.
//
//   node render.js <out.mp4>                 # full 150 s video at 30 fps
//   node render.js --stills <outDir> 2 40 90 # just a few PNG stills at those seconds
//
// Needs the `playwright` package (Chromium is preinstalled in this environment)
// and ffmpeg on PATH.

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const FPS = 30;
const HTML = 'file://' + path.resolve(__dirname, 'index.html');

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(HTML);
  await page.waitForFunction(() => typeof window.renderAt === 'function');
  return page;
}

function frameBuffer(page, t) {
  return page.evaluate((tt) => {
    window.renderAt(tt);
    return document.getElementById('c').toDataURL('image/png');
  }, t).then(url => Buffer.from(url.split(',')[1], 'base64'));
}

async function stills(outDir, times) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await openPage(browser);
  for (const t of times) {
    const buf = await frameBuffer(page, t);
    const file = path.join(outDir, `t${String(t).padStart(5, '0')}.png`);
    fs.writeFileSync(file, buf);
    console.log(file);
  }
  await browser.close();
}

async function video(outFile) {
  const browser = await chromium.launch();
  const page = await openPage(browser);
  const total = await page.evaluate(() => window.TOTAL);
  const n = Math.round(total * FPS);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', outFile,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => ff.on('close', code => (code === 0 ? res() : rej(new Error('ffmpeg ' + code)))));

  const started = Date.now();
  for (let i = 0; i < n; i++) {
    const buf = await frameBuffer(page, i / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`frame ${i}/${n} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  ff.stdin.end();
  await ffDone;
  await browser.close();
  console.log('done:', outFile, `${n} frames, ${total} s`);
}

(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--stills') {
    await stills(args[1], args.slice(2).map(Number));
  } else {
    await video(args[0] || 'eco-video.mp4');
  }
})().catch(e => { console.error(e); process.exit(1); });
