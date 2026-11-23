// QC helper: bundle once, render chosen frames to out/stills/ (half size).
// node scripts/stills.mjs 150 400 650 ...
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';

const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE;
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const composition = await selectComposition({serveUrl, id: 'Miha', browserExecutable});
for (const frame of process.argv.slice(2).map(Number)) {
  await renderStill({composition, serveUrl, frame, output: `out/stills/f${String(frame).padStart(4, '0')}.png`, scale: 0.5, browserExecutable});
  console.log('frame', frame);
}
