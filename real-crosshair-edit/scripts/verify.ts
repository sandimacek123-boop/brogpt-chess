// Quality control for a rendered edit.
//   npm run verify                          → checks out/REAL_Spinning_Crosshair_Final.mp4
//   npm run verify -- out/other.mp4 [--expect-audio]
// Checks the file (ffprobe + full decode), the maths (continuity, alignment,
// corner coverage), and the pixels (palette, crosshair, checkerboard, logo
// visibility, text contrast, URLs), then writes stills + a contact sheet.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {ROOT} from './render-core';
import {COMP_SIZE, DEFAULT_PROPS, DURATION_FRAMES, EXPORT_FILENAME, FPS, HEIGHT, WIDTH} from '../src/config';
import {buildTimeline} from '../src/engine/timeline';
import {SHUTTER_FRAMES} from '../src/engine/render';
import {RING_SPECS, ringPeriod} from '../src/engine/rings';
import {brandLayout} from '../src/engine/brand';

const args = process.argv.slice(2);
const file = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(ROOT, 'out', EXPORT_FILENAME));
const expectAudio = args.includes('--expect-audio');
const qcDir = path.join(ROOT, 'out', 'qc');
fs.mkdirSync(qcDir, {recursive: true});

type Check = {name: string; pass: boolean; detail: string};
const checks: Check[] = [];
const check = (name: string, pass: boolean, detail: string) => checks.push({name, pass, detail});

// ---------------------------------------------------------------------------
// 1. container / stream / integrity
const probe = JSON.parse(
  execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file]).toString(),
) as {streams: Array<Record<string, string | number>>; format: Record<string, string>};
const video = probe.streams.filter((s) => s.codec_type === 'video');
const audio = probe.streams.filter((s) => s.codec_type === 'audio');
const v = video[0];
check('one video stream', video.length === 1, `${video.length} video stream(s)`);
check('codec H.264', v.codec_name === 'h264', `${v.codec_name} (${v.profile})`);
check('resolution 1080×1920', v.width === WIDTH && v.height === HEIGHT, `${v.width}×${v.height}`);
check('60 fps', v.r_frame_rate === '60/1' && v.avg_frame_rate === '60/1', `r=${v.r_frame_rate} avg=${v.avg_frame_rate}`);
check('exactly 900 frames', Number(v.nb_read_frames) === DURATION_FRAMES, `${v.nb_read_frames} frames`);
const dur = Number(v.duration ?? probe.format.duration);
check('exactly 15 s', Math.abs(dur - 15) < 0.02, `${dur.toFixed(3)} s`);
check('pixel format yuv420p', v.pix_fmt === 'yuv420p', String(v.pix_fmt));
if (expectAudio) check('audio stream present', audio.length === 1, `${audio.length} audio stream(s)`);
else check('no audio stream (silent export)', audio.length === 0, `${audio.length} audio stream(s)`);

const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], {encoding: 'utf8'});
check('file integrity (full decode, no errors)', decode.status === 0 && decode.stderr.trim() === '', decode.stderr.trim() ? decode.stderr.trim().slice(0, 160) : 'clean decode');
const pts = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file])
  .toString()
  .trim()
  .split('\n')
  .map(Number);
let gaps = 0;
for (let k = 1; k < pts.length; k++) if (Math.abs(pts[k] - pts[k - 1] - 1 / FPS) > 0.002) gaps++;
check('no missing / duplicated timestamps', pts.length === DURATION_FRAMES && gaps === 0, `${pts.length} frames, ${gaps} irregular steps`);

// ---------------------------------------------------------------------------
// 2. maths: continuity, alignment, coverage (same code as the renderer)
const tl = buildTimeline(DEFAULT_PROPS);
// jump detector: with a fine step a continuous velocity changes by ~accel·DT,
// a discontinuity would show up as a large step no matter how small DT is
const DT = 0.002;
let maxDv = 0;
let maxDvAt = 0;
let prevV = tl.rotation.vel(0);
for (let t = DT; t < DURATION_FRAMES; t += DT) {
  const vel = tl.rotation.vel(t);
  if (Math.abs(vel - prevV) > maxDv) {
    maxDv = Math.abs(vel - prevV);
    maxDvAt = t;
  }
  prevV = vel;
}
let maxRingDv = 0;
RING_SPECS.forEach((_, i) => {
  const H = 0.01;
  let pv = (tl.ringAngle(i, H) - tl.ringAngle(i, 0)) / H;
  for (let t = H; t < DURATION_FRAMES; t += H) {
    const vel = (tl.ringAngle(i, t + H) - tl.ringAngle(i, t)) / H;
    maxRingDv = Math.max(maxRingDv, Math.abs(vel - pv));
    pv = vel;
  }
});
check('panel rotation C¹-continuous (no angle/velocity jumps)', maxDv < 0.05, `max Δω ${maxDv.toFixed(4)}°/frame per ${DT}-frame step (f${maxDvAt.toFixed(1)})`);
check('ring rotation C¹-continuous', maxRingDv < 0.1, `max Δω ${maxRingDv.toFixed(4)}°/frame per 0.01-frame step`);

const mod360 = (a: number) => {
  const r = ((a % 360) + 360) % 360;
  return Math.min(r, 360 - r);
};
const lockErr = Math.max(
  ...RING_SPECS.map((s, i) => {
    const P = ringPeriod(s, 1);
    const a = tl.ringAngle(i, tl.lockFrame + 1) - s.home;
    const r = ((a % P) + P) % P;
    return Math.min(r, P - r);
  }),
);
const panelLock = mod360(tl.rotation.at(tl.lockFrame + 1));
check('precision alignment at the lock (rings + panels)', lockErr < 1e-6 && panelLock < 1e-6, `ring error ${lockErr.toExponential(1)}°, panels ${panelLock.toFixed(6)}°`);
check('ends aligned (panels at 0° mod 360)', mod360(tl.rotation.at(DURATION_FRAMES - 1)) < 1e-6, `final ${tl.rotation.at(DURATION_FRAMES - 1).toFixed(3)}°`);

const half = COMP_SIZE / 2;
let worst = Infinity;
let worstAt = -1;
for (let f = 0; f < DURATION_FRAMES; f++) {
  const st = tl.state(f);
  if (st.panelsIris < 1 || st.panelsAlpha <= 0) continue; // intro reveal / outro collapse are masked on purpose
  for (let k = 0; k <= 8; k++) {
    const t = f - SHUTTER_FRAMES + (k / 8) * 2 * SHUTTER_FRAMES;
    const cam = tl.camera(tl.warp(t));
    for (const [cx, cy] of [[-WIDTH / 2, -HEIGHT / 2], [WIDTH / 2, -HEIGHT / 2], [-WIDTH / 2, HEIGHT / 2], [WIDTH / 2, HEIGHT / 2]]) {
      const x = cx - cam.dx;
      const y = cy - cam.dy - st.logo.offsetY;
      const a = (-cam.angle * Math.PI) / 180;
      const u = (x * Math.cos(a) - y * Math.sin(a)) / cam.scale;
      const w = (x * Math.sin(a) + y * Math.cos(a)) / cam.scale;
      const margin = half - Math.max(Math.abs(u), Math.abs(w));
      if (margin < worst) {
        worst = margin;
        worstAt = f;
      }
    }
  }
}
check('no exposed corners while panels are open', worst > 0, `worst margin ${worst.toFixed(1)} px @ frame ${worstAt}`);

// ---------------------------------------------------------------------------
// 3. pixels
const hsv = (r: number, g: number, b: number) => {
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
const lum = (r: number, g: number, b: number) => {
  const f = (x: number) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const rawFrame = (frame: number) =>
  execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 64 * 1024 * 1024,
  });

const scanPalette = () =>
  new Promise<{green: number; purple: number; frames: number; worst: number; worstFrac: number}>((resolve, reject) => {
    const SW = 270;
    const SH = 480;
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${SW}:${SH}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    const bytes = SW * SH * 3;
    let buf = Buffer.alloc(0);
    let n = 0;
    let green = 0;
    let purple = 0;
    let worst = -1;
    let worstFrac = 0;
    ff.stdout.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= bytes) {
        const fr = buf.subarray(0, bytes);
        buf = buf.subarray(bytes);
        let bad = 0;
        for (let p = 0; p < bytes; p += 3) {
          const {h, s, v: val} = hsv(fr[p], fr[p + 1], fr[p + 2]);
          if (s < 0.3 || val < 0.25) continue;
          if (h >= 75 && h <= 165) {
            green++;
            bad++;
          } else if (h >= 255 && h <= 320) {
            purple++;
            bad++;
          }
        }
        if (bad / (SW * SH) > worstFrac) {
          worstFrac = bad / (SW * SH);
          worst = n;
        }
        n++;
      }
    });
    ff.on('error', reject);
    ff.on('close', () => resolve({green, purple, frames: n, worst, worstFrac: worstFrac * 100}));
  });

const main = async () => {
  const s = await scanPalette();
  const total = s.frames * 270 * 480;
  check('decoded frame count', s.frames === DURATION_FRAMES, `${s.frames}`);
  check('no green', s.green / total < 0.0005, `${((s.green / total) * 100).toFixed(4)} % of pixels`);
  check('no off-palette purple', s.purple / total < 0.0005, `${((s.purple / total) * 100).toFixed(4)} % of pixels (worst frame ${s.worst}: ${s.worstFrac.toFixed(3)} %)`);

  // rest frames: crosshair lines + checkerboard
  for (const f of [126, 176, 356, 760]) {
    const px = rawFrame(f);
    const at = (x: number, y: number) => {
      const i = (Math.round(y) * WIDTH + Math.round(x)) * 3;
      return [px[i], px[i + 1], px[i + 2]];
    };
    const st = tl.state(f);
    // the crosshair belongs to the composition, which moves with the camera shake:
    // find each line across a ±40 px window and check it sits on the composition centre
    const ccx = WIDTH / 2 + st.camera.dx;
    const ccy = HEIGHT / 2 + st.camera.dy + st.logo.offsetY;
    const plateR = 300 * st.logo.scale + 40;
    const Lm = (x: number, y: number) => {
      const [r, g, b] = at(x, y);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    let hits = 0;
    let tot = 0;
    const offs: number[] = [];
    const probeLine = (vertical: boolean, along: number) => {
      let best = -1;
      let bestPos = 0;
      for (let d = -40; d <= 40; d++) {
        const val = vertical ? Lm(ccx + d, along) : Lm(along, ccy + d);
        if (val > best) {
          best = val;
          bestPos = d;
        }
      }
      // centre of the bright plateau (the line is ~10 px wide)
      const val = (d: number) => (vertical ? Lm(ccx + d, along) : Lm(along, ccy + d));
      let lo = bestPos;
      let hi = bestPos;
      while (lo > -45 && val(lo - 1) >= best - 40) lo--;
      while (hi < 45 && val(hi + 1) >= best - 40) hi++;
      const centre = (lo + hi) / 2;
      // the line must be bright and stand out from what is 20+ px beside it
      const side = vertical
        ? Math.max(Lm(ccx + bestPos - 22, along), Lm(ccx + bestPos + 22, along))
        : Math.max(Lm(along, ccy + bestPos - 22), Lm(along, ccy + bestPos + 22));
      tot++;
      if (best > 150 && best - side > 25) {
        hits++;
        offs.push(Math.abs(centre));
      }
    };
    for (let y = 120; y < HEIGHT - 120; y += 6) if (Math.abs(y - ccy) > plateR) probeLine(true, y);
    for (let x = 60; x < WIDTH - 60; x += 6) if (Math.abs(x - ccx) > plateR) probeLine(false, x);
    const angle = st.camera.angle;
    const swapped = Math.round(angle / 90) % 2 !== 0;
    const fam = (x0: number, y0: number) => {
      let blue = 0;
      let red = 0;
      for (let y = y0 + 30; y < y0 + HEIGHT / 2 - 30; y += 7) {
        for (let x = x0 + 30; x < x0 + WIDTH / 2 - 30; x += 7) {
          const {h, s: sat, v: val} = hsv(...(at(x, y) as [number, number, number]));
          if (sat < 0.35 || val < 0.2) continue;
          if (h >= 185 && h <= 240) blue++;
          else if (h >= 330 || h <= 15) red++;
        }
      }
      return blue > red ? 'blue' : 'red';
    };
    const q = [fam(0, 0), fam(WIDTH / 2, 0), fam(0, HEIGHT / 2), fam(WIDTH / 2, HEIGHT / 2)];
    const expected = swapped ? ['red', 'blue', 'blue', 'red'] : ['blue', 'red', 'red', 'blue'];
    offs.sort((a, b) => a - b);
    const med = offs[Math.floor(offs.length / 2)] ?? 99;
    const p95 = offs[Math.floor(offs.length * 0.95)] ?? 99;
    check(
      `f${f}: centred white crosshair lines`,
      hits / tot > 0.9 && med <= 1 && p95 <= 2,
      `line found on ${((hits / tot) * 100).toFixed(1)} % of probes, offset from the composition centre median ${med.toFixed(1)} px / p95 ${p95.toFixed(1)} px (ring ticks crossing a line can widen single probes) (panels ${angle.toFixed(1)}°, shake ${st.camera.dx.toFixed(1)},${st.camera.dy.toFixed(1)})`,
    );
    check(`f${f}: diagonal blue/red checkerboard`, q.join() === expected.join(), `TL,TR,BL,BR = ${q.join(', ')}`);
  }

  // logo visibility + wordmark contrast on every key frame after the logo is in
  const brandFrames = [70, 120, 240, 360, 450, 540, 660, 780, 899];
  for (const f of brandFrames) {
    const px = rawFrame(f);
    const at = (x: number, y: number) => {
      const i = (Math.round(y) * WIDTH + Math.round(x)) * 3;
      return [px[i], px[i + 1], px[i + 2]] as [number, number, number];
    };
    const st = tl.state(f);
    const lay = brandLayout(DEFAULT_PROPS.brand, st.logo, {dx: st.camera.dx, dy: st.camera.dy});
    const sc = DEFAULT_PROPS.brand.logoScale * st.logo.scale;
    // icon: white tile + gradient symbol
    const size = 214 * sc * st.logo.iconScale;
    const icy = lay.cy - 92 * sc;
    let white = 0;
    let sym = 0;
    let n = 0;
    for (let y = icy - size * 0.4; y < icy + size * 0.4; y += 2) {
      for (let x = lay.cx - size * 0.4; x < lay.cx + size * 0.4; x += 2) {
        const [r, g, b] = at(x, y);
        n++;
        if (Math.min(r, g, b) > 235) white++;
        const c = hsv(r, g, b);
        if (c.s > 0.25 && c.h >= 220 && c.h <= 245) sym++;
      }
    }
    // wordmark box: text vs background contrast (WCAG)
    const base = lay.cy + 112 * sc;
    let tl_ = 0;
    let tn = 0;
    let bl = 0;
    let bn = 0;
    for (let y = base - 76 * sc; y < base - 2; y += 1) {
      for (let x = lay.cx - 180 * sc; x < lay.cx + 180 * sc; x += 2) {
        const [r, g, b] = at(x, y);
        const L = lum(r, g, b);
        if (Math.min(r, g, b) > 225) {
          tl_ += L;
          tn++;
        } else if (Math.max(r, g, b) < 90) {
          bl += L;
          bn++;
        }
      }
    }
    const textFrac = tn / Math.max(1, tn + bn);
    const ratio = tn && bn ? (tl_ / tn + 0.05) / (bl / bn + 0.05) : 0;
    check(
      `f${f}: official logo visible + "Real" readable`,
      white / n > 0.3 && sym / n > 0.05 && textFrac > 0.08 && textFrac < 0.6 && ratio >= 7,
      `icon white ${((white / n) * 100).toFixed(0)} %, symbol ${((sym / n) * 100).toFixed(0)} % · wordmark ink ${(textFrac * 100).toFixed(0)} %, contrast ${ratio.toFixed(1)}:1`,
    );
    if (f === 899) {
      // outro links below the plate
      let ink = 0;
      let all = 0;
      let inkL = 0;
      let bgL = 0;
      let bgN = 0;
      for (let y = lay.cy + lay.plateR + 50; y < lay.cy + lay.plateR + 190; y += 1) {
        for (let x = lay.cx - 300; x < lay.cx + 300; x += 2) {
          const [r, g, b] = at(x, y);
          all++;
          if (Math.min(r, g, b) > 180) {
            ink++;
            inkL += lum(r, g, b);
          } else if (Math.max(r, g, b) < 70) {
            bgL += lum(r, g, b);
            bgN++;
          }
        }
      }
      const cr = ink && bgN ? (inkL / ink + 0.05) / (bgL / bgN + 0.05) : 0;
      check('f899: projectreal.gg + discord.gg/projectreal visible', ink / all > 0.02 && cr >= 7, `link ink ${((ink / all) * 100).toFixed(1)} %, contrast ${cr.toFixed(1)}:1`);
    }
  }

  // stills + contact sheet of the required frames
  const sheet = [0, 60, 120, 240, 360, 450, 540, 660, 780, 899];
  for (const f of sheet) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `select=eq(n\\,${f})`, '-frames:v', '1', path.join(qcDir, `f${String(f).padStart(3, '0')}.png`)]);
  }
  execFileSync('ffmpeg', [
    '-v', 'error', '-y',
    ...sheet.flatMap((f) => ['-i', path.join(qcDir, `f${String(f).padStart(3, '0')}.png`)]),
    '-filter_complex',
    sheet.map((f, i) => `[${i}]scale=324:576,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='frame ${f}':x=8:y=8:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.65[v${i}]`).join(';') +
      ';' + sheet.map((_, i) => `[v${i}]`).join('') + 'xstack=inputs=10:layout=0_0|324_0|648_0|972_0|1296_0|0_576|324_576|648_576|972_576|1296_576',
    '-frames:v', '1', path.join(qcDir, 'contact-sheet.png'),
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
