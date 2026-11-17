// QC helper: render individual frames to PNG with one shared browser.
//   node --import tsx scripts/stills.ts --out out/stills [--scale 0.5] [--props p.json] 0 78 240 394 866
import fs from 'node:fs';
import path from 'node:path';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {ROOT, chromiumOptions, findBrowser, getBundle, mergeProps} from './render-core';
import {COMPOSITION_ID, type EditProps} from '../src/config';

export const renderStills = async (frames: number[], outDir: string, scale = 1, props: Partial<EditProps> = {}) => {
  fs.mkdirSync(outDir, {recursive: true});
  const serveUrl = await getBundle();
  const browserExecutable = findBrowser();
  const puppeteerInstance = await openBrowser('chrome', {browserExecutable, chromiumOptions});
  const inputProps = mergeProps(props);
  const composition = await selectComposition({serveUrl, id: COMPOSITION_ID, inputProps, puppeteerInstance});
  const files: string[] = [];
  try {
    for (const f of frames) {
      const t = Date.now();
      const output = path.join(outDir, `f${String(f).padStart(3, '0')}.png`);
      await renderStill({composition, serveUrl, output, frame: f, inputProps, imageFormat: 'png', puppeteerInstance, scale});
      files.push(output);
      console.log(`frame ${f}: ${Date.now() - t} ms`);
    }
  } finally {
    await puppeteerInstance.close({silent: true});
  }
  return files;
};

const argv = process.argv.slice(2);
if (argv.length && import.meta.url === `file://${process.argv[1]}`) {
  const take = (n: string) => {
    const i = argv.indexOf(`--${n}`);
    if (i < 0) return undefined;
    const v = argv[i + 1];
    argv.splice(i, 2);
    return v;
  };
  const out = take('out') ?? path.join(ROOT, 'out', 'stills');
  const scale = Number(take('scale') ?? 1);
  const propsFile = take('props');
  const props = propsFile ? JSON.parse(fs.readFileSync(propsFile, 'utf8')) : {};
  await renderStills(argv.map(Number), out, scale, props);
}
