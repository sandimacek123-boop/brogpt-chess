// Shared render pipeline used by the CLI (scripts/render.ts) and the preview
// server's "Export MP4" button.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition, type RenderMediaOnProgress} from '@remotion/renderer';
import {COMPOSITION_ID, mergeProps, type EditProps} from '../src/config';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A pre-installed headless Chrome (cloud boxes / CI). Locally Remotion downloads its own. */
export const findBrowser = (): string | undefined => {
  const env = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (env && fs.existsSync(env)) return env;
  const pw = '/opt/pw-browsers';
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw)) {
      if (!d.startsWith('chromium_headless_shell')) continue;
      const p = path.join(pw, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
};

let bundlePromise: Promise<string> | null = null;
export const getBundle = (onProgress?: (p: number) => void) => {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.join(ROOT, 'src/index.ts'),
      publicDir: path.join(ROOT, 'public'),
      onProgress: (p) => onProgress?.(p / 100),
    });
    bundlePromise.catch(() => (bundlePromise = null));
  }
  return bundlePromise;
};

export type RenderJob = {
  props?: Partial<EditProps>;
  /** Remotion composition id: COMPOSITION_ID (first edit) or the facts composition */
  compositionId?: string;
  output: string;
  /** include the music track (only if props.audio.src is set + enabled) */
  withAudio: boolean;
  crf?: number;
  concurrency?: number;
  frameRange?: [number, number];
  onProgress?: (p: {stage: string; progress: number; renderedFrames?: number; encodedFrames?: number}) => void;
  cancelSignal?: Parameters<typeof renderMedia>[0]['cancelSignal'];
};

export {mergeProps};

export const chromiumOptions = {gl: 'swangle' as const};

export const runRender = async (job: RenderJob) => {
  const inputProps = mergeProps(job.props);
  if (!job.withAudio) inputProps.audio = {...inputProps.audio, enabled: false};
  const hasAudio = job.withAudio && Boolean(inputProps.audio.src) && inputProps.audio.enabled;
  if (job.withAudio && !hasAudio) throw new Error('Music export requested but no audio track is set/enabled.');

  job.onProgress?.({stage: 'bundling', progress: 0});
  const serveUrl = await getBundle((p) => job.onProgress?.({stage: 'bundling', progress: p}));
  const browserExecutable = findBrowser();
  const composition = await selectComposition({serveUrl, id: job.compositionId ?? COMPOSITION_ID, inputProps, browserExecutable, chromiumOptions});

  fs.mkdirSync(path.dirname(job.output), {recursive: true});
  const onProgress: RenderMediaOnProgress = ({progress, renderedFrames, encodedFrames, stitchStage}) => {
    job.onProgress?.({stage: stitchStage === 'muxing' ? 'muxing' : 'rendering', progress, renderedFrames, encodedFrames});
  };
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: job.output,
    inputProps,
    imageFormat: 'png',
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    crf: job.crf ?? 16,
    x264Preset: 'slow',
    muted: !hasAudio,
    enforceAudioTrack: false,
    audioCodec: hasAudio ? 'aac' : undefined,
    audioBitrate: hasAudio ? '320k' : undefined,
    concurrency: job.concurrency ?? Math.max(1, Math.min(8, os.cpus().length)),
    frameRange: job.frameRange,
    browserExecutable,
    chromiumOptions,
    timeoutInMilliseconds: 120000,
    cancelSignal: job.cancelSignal,
    onProgress,
  });
  job.onProgress?.({stage: 'done', progress: 1});
  return job.output;
};

export const runStill = async (frame: number, output: string, props?: Partial<EditProps>, compositionId: string = COMPOSITION_ID) => {
  const inputProps = mergeProps(props);
  const serveUrl = await getBundle();
  const browserExecutable = findBrowser();
  const composition = await selectComposition({serveUrl, id: compositionId, inputProps, browserExecutable, chromiumOptions});
  await renderStill({composition, serveUrl, output, frame, inputProps, imageFormat: 'png', browserExecutable, chromiumOptions});
  return output;
};
