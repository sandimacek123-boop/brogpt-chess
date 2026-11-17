// Quality control for a rendered edit.
//   npm run verify                       → checks out/real-crosshair-silent.mp4
//   npm run verify -- out/other.mp4 [--expect-audio]
// Checks container/stream facts with ffprobe, decodes every frame to scan for
// off-palette (green / purple) pixels, checks crosshair alignment + checkerboard
// on rest frames, and proves analytically that no corner is ever exposed.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {ROOT} from './render-core';
import {COMP_SIZE, DEFAULT_PROPS, DURATION_FRAMES, FPS, HEIGHT, WIDTH} from '../src/config';
import {buildTimeline} from '../src/engine/timeline';
import {SHUTTER_FRAMES} from '../src/engine/render';

const args = process.argv.slice(2);
const file = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(ROOT, 'out', 'real-crosshair-silent.mp4'));
const expectAudio = args.includes('--expect-audio');
const qcDir = path.join(ROOT, 'out', 'qc');
fs.mkdirSync(qcDir, {recursive: true});

type Check = {name: string; pass: boolean; detail: string};
const checks: Check[] = [];
const check = (name: string, pass: boolean, detail: string) => checks.push({name, pass, detail});

const probe = JSON.parse(
  execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file]).toString(),
) as {streams: Array<Record<string, string | number>>; format: Record<string, string>};
const video = probe.streams.filter((s) => s.codec_type === 'video');
const audio = probe.streams.filter((s) => s.codec_type === 'audio');
const v = video[0];
check('video stream', video.length === 1, `${video.length} video stream(s)`);
check('codec H.264', v.codec_name === 'h264', String(v.codec_name));
check('resolution 1080×1920', v.width === WIDTH && v.height === HEIGHT, `${v.width}×${v.height}`);
check('60 fps', v.r_frame_rate === '60/1' && v.avg_frame_rate === '60/1', `r=${v.r_frame_rate} avg=${v.avg_frame_rate}`);
check('exactly 900 frames', Number(v.nb_read_frames) === DURATION_FRAMES, `${v.nb_read_frames} frames`);
const dur = Number(v.duration ?? probe.format.duration);
check('exactly 15 s', Math.abs(dur - 15) < 0.02, `${dur.toFixed(3)} s`);
check('pixel format', v.pix_fmt === 'yuv420p', String(v.pix_fmt));
if (expectAudio) check('audio stream present', audio.length === 1, `${audio.length} audio stream(s)`);
else check('silent: no audio stream', audio.length === 0, `${audio.length} audio stream(s)`);

// ---------------------------------------------------------------------------
// analytic coverage + motion checks (pure timeline maths, same code as render)
const tl = buildTimeline(DEFAULT_PROPS);
const half = COMP_SIZE / 2;
const cornerR = Math.hypot(WIDTH / 2, HEIGHT / 2);
let worstMargin = Infinity;
let worstFrame = -1;
let maxOmega = 0;
for (let f = 44; f < DURATION_FRAMES; f++) {
  for (let k = 0; k <= 8; k++) {
    const t = f - SHUTTER_FRAMES * 2 / 2 + (k / 8) * SHUTTER_FRAMES * 2; // test a 2× shutter span
    const cam = tl.camera(tl.warp(t));
    // rotated square of half-size half*scale centred at (dx,dy) must contain every frame corner
    for (const [cx, cy] of [[-WIDTH / 2, -HEIGHT / 2], [WIDTH / 2, -HEIGHT / 2], [-WIDTH / 2, HEIGHT / 2], [WIDTH / 2, HEIGHT / 2]]) {
      const x = cx - cam.dx;
      const y = cy - cam.dy;
      const a = (-cam.angle * Math.PI) / 180;
      const u = (x * Math.cos(a) - y * Math.sin(a)) / cam.scale;
      const w = (x * Math.sin(a) + y * Math.cos(a)) / cam.scale;
      const margin = half - Math.max(Math.abs(u), Math.abs(w));
      if (margin < worstMargin) {
        worstMargin = margin;
        worstFrame = f;
      }
    }
  }
  maxOmega = Math.max(maxOmega, Math.abs(tl.rotation.vel(f)));
}
check('no exposed corners (analytic, all frames + blur span)', worstMargin > 0, `worst margin ${worstMargin.toFixed(1)} px @ frame ${worstFrame} (corner radius ${cornerR.toFixed(0)})`);
const endAngle = tl.rotation.at(DURATION_FRAMES - 1);
check('ends aligned in the opening layout', Math.abs(((endAngle % 360) + 360) % 360) < 1e-6 && tl.state(DURATION_FRAMES - 1).scene === tl.state(50).scene, `final angle ${endAngle.toFixed(3)}°, scene ${tl.state(DURATION_FRAMES - 1).scene}`);
check('peak angular velocity', maxOmega > 10, `${(maxOmega * FPS).toFixed(0)} °/s`);

// ---------------------------------------------------------------------------
// decode every frame (downscaled) and scan hues
const SW = 270;
const SH = 480;
const hueOf = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const c = max - min;
  if (c === 0) return {h: 0, s: 0, v: max / 255};
  let h: number;
  if (max === r) h = ((g - b) / c) * 60;
  else if (max === g) h = ((b - r) / c) * 60 + 120;
  else h = ((r - g) / c) * 60 + 240;
  return {h: (h + 360) % 360, s: c / max, v: max / 255};
};

const scan = () =>
  new Promise<{green: number; purple: number; worstFrame: number; worstFrac: number; frames: number}>((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${SW}:${SH}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    const frameBytes = SW * SH * 3;
    let buf = Buffer.alloc(0);
    let n = 0;
    let green = 0;
    let purple = 0;
    let worstFrac = 0;
    let worst = -1;
    ff.stdout.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= frameBytes) {
        const fr = buf.subarray(0, frameBytes);
        buf = buf.subarray(frameBytes);
        let bad = 0;
        for (let p = 0; p < frameBytes; p += 3) {
          const {h, s, v: val} = hueOf(fr[p], fr[p + 1], fr[p + 2]);
          if (s < 0.3 || val < 0.25) continue; // ignore near-neutrals / near-black
          if (h >= 75 && h <= 165) {
            green++;
            bad++;
          } else if (h >= 255 && h <= 320) {
            purple++;
            bad++;
          }
        }
        const frac = bad / (SW * SH);
        if (frac > worstFrac) {
          worstFrac = frac;
          worst = n;
        }
        n++;
      }
    });
    ff.on('error', reject);
    ff.on('close', () => resolve({green, purple, worstFrame: worst, worstFrac, frames: n}));
  });

const grab = (frame: number, out: string, scale = '') =>
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `select=eq(n\\,${frame})${scale}`, '-frames:v', '1', out]);

const rawFrame = (frame: number) =>
  execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 64 * 1024 * 1024,
  });

const main = async () => {
  const s = await scan();
  const total = s.frames * SW * SH;
  check('decoded frame count', s.frames === DURATION_FRAMES, `${s.frames}`);
  check('no green', s.green / total < 0.0005, `${((s.green / total) * 100).toFixed(4)} % of pixels (saturated, hue 75–165°)`);
  check('no purple', s.purple / total < 0.0005, `${((s.purple / total) * 100).toFixed(4)} % of pixels (saturated, hue 255–320°); worst frame ${s.worstFrame} at ${(s.worstFrac * 100).toFixed(3)} %`);

  // rest frames: crosshair centred + checkerboard (blue TL/BR at 0°, swapped at 90°)
  const restFrames = [50, 116, 340, 899];
  for (const f of restFrames) {
    const px = rawFrame(f);
    const at = (x: number, y: number) => {
      const i = (y * WIDTH + x) * 3;
      return [px[i], px[i + 1], px[i + 2]];
    };
    // white line: centre column/row bright along most of its length
    let lineHits = 0;
    let lineTotal = 0;
    for (let y = 80; y < HEIGHT - 80; y += 7) {
      const c = at(WIDTH / 2, y);
      lineTotal++;
      if (Math.min(...c) > 200) lineHits++;
    }
    for (let x = 60; x < WIDTH - 60; x += 7) {
      const c = at(x, HEIGHT / 2);
      lineTotal++;
      if (Math.min(...c) > 200) lineHits++;
    }
    const angle = tl.rotation.at(tl.warp(f));
    const swapped = Math.round(angle / 90) % 2 !== 0;
    // classify quadrants by dominant saturated hue
    const fam = (x0: number, y0: number) => {
      let blue = 0;
      let red = 0;
      for (let y = y0 + 40; y < y0 + HEIGHT / 2 - 40; y += 9) {
        for (let x = x0 + 40; x < x0 + WIDTH / 2 - 40; x += 9) {
          const [r, g, b] = at(x, y);
          const {h, s: sat, v: val} = hueOf(r, g, b);
          if (sat < 0.35 || val < 0.25) continue;
          if (h >= 190 && h <= 235) blue++;
          else if (h >= 330 || h <= 15) red++;
        }
      }
      return blue > red ? 'blue' : 'red';
    };
    const q = [fam(0, 0), fam(WIDTH / 2, 0), fam(0, HEIGHT / 2), fam(WIDTH / 2, HEIGHT / 2)];
    const expected = swapped ? ['red', 'blue', 'blue', 'red'] : ['blue', 'red', 'red', 'blue'];
    check(
      `frame ${f}: centred white crosshair`,
      lineHits / lineTotal > 0.97,
      `${((lineHits / lineTotal) * 100).toFixed(1)} % of centre-line samples are white (angle ${angle.toFixed(1)}°)`,
    );
    check(`frame ${f}: diagonal checkerboard`, q.join() === expected.join(), `TL,TR,BL,BR = ${q.join(', ')}`);
  }

  // QC stills + contact sheet
  const sheetFrames = [10, 30, 60, 78, 100, 150, 200, 240, 262, 285, 306, 340, 377, 394, 410, 448, 470, 505, 530, 560, 620, 700, 760, 800, 826, 850, 866, 899];
  sheetFrames.forEach((f) => grab(f, path.join(qcDir, `f${String(f).padStart(3, '0')}.png`)));
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', file, '-vf',
    `select='${sheetFrames.map((f) => `eq(n\\,${f})`).join('+')}',scale=270:480,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='%{pts\\:hms}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6,tile=7x4`,
    '-frames:v', '1', '-vsync', 'vfr', path.join(qcDir, 'contact-sheet.png'),
  ]);

  const width = Math.max(...checks.map((c) => c.name.length));
  console.log(`\nQC report: ${path.relative(process.cwd(), file)}\n`);
  for (const c of checks) console.log(`${c.pass ? '✔' : '✘'}  ${c.name.padEnd(width)}  ${c.detail}`);
  const failed = checks.filter((c) => !c.pass);
  fs.writeFileSync(path.join(qcDir, 'report.json'), JSON.stringify({file, checks}, null, 2));
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed · stills + contact sheet in ${path.relative(process.cwd(), qcDir)}/`);
  if (failed.length) process.exit(1);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
