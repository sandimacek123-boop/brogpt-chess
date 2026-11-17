// Join the two rendered halves into the 30 s edit and (optionally) lay a music
// track under it.
//
//   node --import tsx scripts/join-music.ts \
//     --part1 out/REAL_Crosshair_Part1_beatsynced.mp4 \
//     --part2 out/REAL_Facts_beatsynced.mp4 \
//     --audio public/audio/montagem-mythical.aac --offset 0.16 \
//     --silent-out out/REAL_Crosshair_30s_beatsynced.mp4 \
//     --out out/REAL_Crosshair_30s_music.mp4
//
// The video streams are copied (no re-encode). The audio starts `--offset` seconds
// into the song, which is the same offset the beat-sync render used, and fades
// out over the last second.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const need = (name: string) => {
  const v = opt(name);
  if (!v) throw new Error(`missing --${name}`);
  return path.resolve(v);
};

const part1 = need('part1');
const part2 = need('part2');
const out = need('out');
const silentOut = opt('silent-out') ? path.resolve(opt('silent-out')!) : null;
const audio = opt('audio') ? path.resolve(opt('audio')!) : null;
const offset = Number(opt('offset') ?? 0);
const fade = Number(opt('fade') ?? 1);

for (const f of [part1, part2, ...(audio ? [audio] : [])]) {
  if (!fs.existsSync(f)) throw new Error(`file not found: ${f}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'real-join-'));
const list = path.join(tmp, 'list.txt');
fs.writeFileSync(list, `file '${part1}'\nfile '${part2}'\n`);

const silent = silentOut ?? path.join(tmp, 'joined.mp4');
fs.mkdirSync(path.dirname(silent), {recursive: true});
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent], {stdio: 'inherit'});
console.log(`joined (no audio) → ${silent}`);

if (audio) {
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', silent]).toString().trim());
  fs.mkdirSync(path.dirname(out), {recursive: true});
  execFileSync(
    'ffmpeg',
    [
      '-v', 'error', '-y',
      '-i', silent,
      '-ss', String(offset), '-i', audio,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
      '-af', `afade=t=out:st=${Math.max(0, dur - fade).toFixed(3)}:d=${fade}`,
      '-t', dur.toFixed(3),
      '-movflags', '+faststart',
      out,
    ],
    {stdio: 'inherit'},
  );
  console.log(`with music → ${out}`);
}

const probe = (f: string) =>
  execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,pix_fmt:format=duration', '-of', 'compact', f]).toString();
for (const f of [silent, ...(audio ? [out] : [])]) {
  console.log(`\n${path.basename(f)}\n${probe(f)}`);
}
fs.rmSync(tmp, {recursive: true, force: true});
