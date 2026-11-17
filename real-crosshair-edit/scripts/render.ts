// CLI render.
//   npm run render                                → out/real-crosshair-silent.mp4 (no audio stream)
//   npm run render -- --props my-props.json       → use props exported from the preview UI
//   npm run render:music -- --audio public/audio/montagem-mythical.mp3 [--offset 12.3] [--no-sync]
//                                                 → out/real-crosshair-music.mp4 (+ silent version)
//   extra: --crf 16  --concurrency 4  --frames 0-119  --out path.mp4  --still 300
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT, mergeProps, runRender, runStill} from './render-core';
import {analyzeFile} from './analyze-audio';
import type {EditProps} from '../src/config';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const main = async () => {
  let props: Partial<EditProps> = {};
  const propsFile = opt('props');
  if (propsFile) props = JSON.parse(fs.readFileSync(propsFile, 'utf8'));

  const music = flag('music');
  const audioArg = opt('audio');
  if (music) {
    const merged = mergeProps(props);
    let src = merged.audio.src;
    if (audioArg) {
      const abs = path.resolve(audioArg);
      if (!fs.existsSync(abs)) throw new Error(`Audio file not found: ${abs}`);
      const ext = path.extname(abs).toLowerCase();
      if (!['.mp3', '.wav', '.m4a'].includes(ext)) throw new Error('Supported audio: .mp3 .wav .m4a');
      const publicDir = path.join(ROOT, 'public');
      let rel = path.relative(publicDir, abs);
      if (rel.startsWith('..')) {
        rel = path.join('audio', path.basename(abs));
        fs.copyFileSync(abs, path.join(publicDir, rel));
      }
      src = rel.split(path.sep).join('/');
    }
    if (!src) {
      console.log('No audio provided (--audio <file>). Music export skipped – the silent render is the deliverable.');
      process.exit(1);
    }
    const offset = Number(opt('offset') ?? merged.audio.startOffset ?? 0);
    let beats = merged.audio.beats;
    if (!flag('no-sync') && !beats) {
      const localPath = path.join(ROOT, 'public', src);
      if (fs.existsSync(localPath)) {
        const analysis = analyzeFile(localPath);
        beats = analysis.beats;
        console.log(`Beat analysis: ~${analysis.bpm.toFixed(1)} BPM, ${beats.length} beats`);
      }
    }
    props = {
      ...props,
      audio: {...merged.audio, src, enabled: true, startOffset: offset, beats, beatSync: !flag('no-sync')},
    };
  }

  const frames = opt('frames');
  const frameRange = frames ? (frames.split('-').map(Number) as [number, number]) : undefined;
  const still = opt('still');
  if (still) {
    const out = opt('out') ?? path.join(ROOT, 'out', `still-${still}.png`);
    await runStill(Number(still), out, props);
    console.log(`still → ${out}`);
    return;
  }

  const targets: Array<{out: string; withAudio: boolean}> = [];
  const silentOut = opt('out') && !music ? path.resolve(opt('out')!) : path.join(ROOT, 'out', 'real-crosshair-silent.mp4');
  if (!music || !flag('skip-silent')) targets.push({out: silentOut, withAudio: false});
  if (music) targets.push({out: opt('out') ? path.resolve(opt('out')!) : path.join(ROOT, 'out', 'real-crosshair-music.mp4'), withAudio: true});

  for (const t of targets) {
    const started = Date.now();
    let last = -1;
    await runRender({
      props,
      output: t.out,
      withAudio: t.withAudio,
      crf: opt('crf') ? Number(opt('crf')) : undefined,
      concurrency: opt('concurrency') ? Number(opt('concurrency')) : undefined,
      frameRange,
      onProgress: (p) => {
        const pct = Math.floor(p.progress * 100);
        if (pct !== last) {
          last = pct;
          process.stdout.write(`\r[${t.withAudio ? 'music' : 'silent'}] ${p.stage} ${pct}%  frames ${p.renderedFrames ?? 0}/${frameRange ? frameRange[1] - frameRange[0] + 1 : 900}   `);
        }
      },
    });
    process.stdout.write(`\n✓ ${t.out}  (${((Date.now() - started) / 1000).toFixed(0)} s)\n`);
    try {
      const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames', '-of', 'compact', t.out]).toString();
      process.stdout.write(probe);
    } catch {
      /* ffprobe optional */
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
