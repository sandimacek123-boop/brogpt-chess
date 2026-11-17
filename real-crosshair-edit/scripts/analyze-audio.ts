// Beat analysis for a legally obtained music file (e.g. Montagem Mythical).
//   npm run analyze-audio -- public/audio/montagem-mythical.mp3
// Writes <file>.beats.json next to the audio and prints BPM + beat count.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {analyzeBeats, type BeatAnalysis} from '../src/audio/beats';

const SR = 22050;

const decode = (file: string): Float32Array => {
  const args = ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'];
  let buf: Buffer;
  try {
    buf = execFileSync('ffmpeg', args, {maxBuffer: 1024 * 1024 * 1024});
  } catch {
    // fall back to the ffmpeg that ships with Remotion
    buf = execFileSync('npx', ['remotion', 'ffmpeg', ...args], {maxBuffer: 1024 * 1024 * 1024});
  }
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(ab);
};

export const analyzeFile = (file: string): BeatAnalysis => {
  const result = analyzeBeats(decode(file), SR);
  fs.writeFileSync(`${file}.beats.json`, JSON.stringify(result, null, 2));
  return result;
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error('usage: npm run analyze-audio -- <audio.mp3|wav|m4a>');
    process.exit(1);
  }
  const r = analyzeFile(file);
  console.log(`${path.basename(file)}: ${r.duration.toFixed(1)} s, ~${r.bpm.toFixed(1)} BPM, ${r.beats.length} beats`);
  console.log(`first beats: ${r.beats.slice(0, 8).map((b) => b.toFixed(3)).join(', ')}`);
  console.log(`saved → ${file}.beats.json`);
}
