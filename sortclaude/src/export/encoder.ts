import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import { Composer, projectDuration, type VideoProject } from './composer';
import type { Recording } from '../engine/runner';
import { buildGraph, scheduleNote, scaleIntervals } from '../audio/engine';

export interface CodecChoice {
  container: 'mp4' | 'webm';
  video: string; // WebCodecs codec string
  muxVideo: 'avc' | 'V_VP9' | 'V_VP8';
  audio: 'aac' | 'opus' | null;
  audioCodec: string | null;
  muxAudio: 'aac' | 'opus' | 'A_OPUS' | null;
  label: string;
}

export interface Capabilities {
  webcodecs: boolean;
  options: CodecChoice[];
  maxTested: { width: number; height: number; fps: number } | null;
  notes: string[];
}

function avcCodecFor(w: number, h: number, fps: number): string {
  const mbps = Math.ceil(w / 16) * Math.ceil(h / 16) * fps;
  // High profile; level chosen by macroblock throughput
  if (mbps <= 245760 && w * h <= 2097152) return 'avc1.640028'; // 4.0 (1080p60 fits 4.2; 4.0 for ≤1080p30)
  if (mbps <= 522240) return 'avc1.64002a'; // 4.2
  if (mbps <= 983040) return 'avc1.640033'; // 5.1
  return 'avc1.640034'; // 5.2
}

/** Probe which codecs this runtime can actually encode at the requested settings. */
export async function probeCapabilities(width: number, height: number, fps: number, bitrate: number): Promise<Capabilities> {
  const notes: string[] = [];
  const hasVE = typeof (globalThis as any).VideoEncoder !== 'undefined';
  const hasAE = typeof (globalThis as any).AudioEncoder !== 'undefined';
  if (!hasVE) return { webcodecs: false, options: [], maxTested: null, notes: ['WebCodecs VideoEncoder is not available in this browser. Real-time MediaRecorder capture (WebM) is used instead.'] };
  const vcfg = (codec: string) => ({ codec, width, height, bitrate, framerate: fps, avc: codec.startsWith('avc') ? { format: 'avc' as const } : undefined });
  const ok = async (codec: string) => {
    try {
      return (await VideoEncoder.isConfigSupported(vcfg(codec) as VideoEncoderConfig)).supported === true;
    } catch {
      return false;
    }
  };
  const aok = async (codec: string) => {
    if (!hasAE) return false;
    try {
      return (await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 })).supported === true;
    } catch {
      return false;
    }
  };
  const avc = avcCodecFor(width, height, fps);
  const [hAvc, hVp9, hVp8, hAac, hOpus] = await Promise.all([ok(avc), ok('vp09.00.41.08'), ok('vp8'), aok('mp4a.40.2'), aok('opus')]);
  const options: CodecChoice[] = [];
  if (hAvc) options.push({ container: 'mp4', video: avc, muxVideo: 'avc', audio: hAac ? 'aac' : hOpus ? 'opus' : null, audioCodec: hAac ? 'mp4a.40.2' : hOpus ? 'opus' : null, muxAudio: hAac ? 'aac' : hOpus ? 'opus' : null, label: `MP4 · H.264${hAac ? ' + AAC' : hOpus ? ' + Opus' : ''}` });
  if (hVp9) options.push({ container: 'webm', video: 'vp09.00.41.08', muxVideo: 'V_VP9', audio: hOpus ? 'opus' : null, audioCodec: hOpus ? 'opus' : null, muxAudio: hOpus ? 'A_OPUS' : null, label: `WebM · VP9${hOpus ? ' + Opus' : ''}` });
  if (hVp8) options.push({ container: 'webm', video: 'vp8', muxVideo: 'V_VP8', audio: hOpus ? 'opus' : null, audioCodec: hOpus ? 'opus' : null, muxAudio: hOpus ? 'A_OPUS' : null, label: `WebM · VP8${hOpus ? ' + Opus' : ''}` });
  if (!hAvc) notes.push(`H.264 encoding at ${width}×${height}@${fps} is not supported here, so MP4 is unavailable for this configuration.`);
  if (hAvc && !hAac) notes.push('AAC audio encoding is unavailable; MP4 files use Opus audio (plays in browsers, VLC, most modern players).');
  if (!hOpus && !hAac) notes.push('No audio encoder available: videos will be silent.');
  if (!options.length) notes.push(`No encoder supports ${width}×${height} at ${fps} FPS. Try a lower resolution or frame rate.`);
  return { webcodecs: true, options, maxTested: options.length ? { width, height, fps } : null, notes };
}

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  phase: 'preparing' | 'audio' | 'video' | 'finalizing' | 'done';
  etaSeconds: number | null;
}

export interface ExportResult {
  blob: Blob;
  mime: string;
  extension: string;
  codec: string;
  frames: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

/** Render the project's soundtrack offline (same synthesis as live playback). */
export async function renderAudio(composer: Composer, project: VideoProject): Promise<AudioBuffer | null> {
  if (!project.audioEnabled || typeof OfflineAudioContext === 'undefined') return null;
  const duration = projectDuration(project);
  const rate = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * rate) + rate, rate);
  const graph = buildGraph(ctx, project.audio);
  const notes = composer.collectNotes();
  const intervals = scaleIntervals(project.audio);
  // simple polyphony limit per time window
  const voices: number[] = [];
  for (const n of notes) {
    while (voices.length && voices[0] <= n.time) voices.shift();
    if (voices.length >= project.audio.polyphony) continue;
    const end = scheduleNote(ctx, graph.input, n.ev, n.time, project.audio, intervals, n.gain);
    voices.push(end);
    voices.sort((a, b) => a - b);
  }
  return ctx.startRendering();
}

/**
 * Offline, deterministic export: every frame is rendered at its exact timestamp, so output
 * timing does not depend on how fast this computer can draw.
 */
export async function exportVideo(
  project: VideoProject,
  recordings: Map<string, Recording>,
  choice: CodecChoice,
  bitrate: number,
  onProgress: (p: ExportProgress) => void,
  isCancelled: () => boolean,
  threeModule?: typeof import('../render/three/renderer3d'),
): Promise<ExportResult> {
  const { width, height, fps } = project;
  const duration = projectDuration(project);
  const totalFrames = Math.max(1, Math.round(duration * fps));
  onProgress({ frame: 0, totalFrames, phase: 'preparing', etaSeconds: null });
  const composer = new Composer(project, recordings, undefined, threeModule);
  let audio: AudioBuffer | null = null;
  if (project.audioEnabled && choice.audio) {
    onProgress({ frame: 0, totalFrames, phase: 'audio', etaSeconds: null });
    audio = await renderAudio(composer, project);
  }
  if (isCancelled()) throw new Error('Cancelled');

  const hasAudio = !!audio && !!choice.audio;
  let muxer: Mp4Muxer<Mp4Target> | WebmMuxer<WebmTarget>;
  if (choice.container === 'mp4') {
    muxer = new Mp4Muxer({
      target: new Mp4Target(),
      video: { codec: 'avc', width, height, frameRate: fps },
      audio: hasAudio ? { codec: choice.muxAudio as 'aac' | 'opus', numberOfChannels: 2, sampleRate: 48000 } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
  } else {
    muxer = new WebmMuxer({
      target: new WebmTarget(),
      video: { codec: choice.muxVideo as 'V_VP9' | 'V_VP8', width, height, frameRate: fps },
      audio: hasAudio ? { codec: 'A_OPUS', numberOfChannels: 2, sampleRate: 48000 } : undefined,
      firstTimestampBehavior: 'offset',
    });
  }

  let encodeError: Error | null = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => (muxer as any).addVideoChunk(chunk, meta),
    error: (e) => (encodeError = e as Error),
  });
  venc.configure({ codec: choice.video, width, height, bitrate, framerate: fps, latencyMode: 'quality', avc: choice.container === 'mp4' ? { format: 'avc' } : undefined } as VideoEncoderConfig);

  // ---- audio
  if (hasAudio && audio) {
    const aenc = new AudioEncoder({
      output: (chunk, meta) => (muxer as any).addAudioChunk(chunk, meta),
      error: (e) => (encodeError = e as Error),
    });
    aenc.configure({ codec: choice.audioCodec!, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });
    const frameSize = 4800;
    const totalSamples = Math.min(audio.length, Math.ceil(duration * 48000));
    const L = audio.getChannelData(0);
    const R = audio.getChannelData(1);
    for (let off = 0; off < totalSamples; off += frameSize) {
      const len = Math.min(frameSize, totalSamples - off);
      const planar = new Float32Array(len * 2);
      planar.set(L.subarray(off, off + len), 0);
      planar.set(R.subarray(off, off + len), len);
      const data = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: len, numberOfChannels: 2, timestamp: Math.round((off / 48000) * 1e6), data: planar });
      aenc.encode(data);
      data.close();
    }
    await aenc.flush();
    aenc.close();
  }

  // ---- video
  const t0 = performance.now();
  const keyEvery = Math.max(1, Math.round(fps * 2));
  try {
    for (let f = 0; f < totalFrames; f++) {
      if (isCancelled()) throw new Error('Cancelled');
      if (encodeError) throw encodeError;
      await composer.drawFrame(f / fps);
      const frame = new VideoFrame(composer.canvas as any, { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) });
      venc.encode(frame, { keyFrame: f % keyEvery === 0 });
      frame.close();
      while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      if (f % 3 === 0 || f === totalFrames - 1) {
        const el = (performance.now() - t0) / 1000;
        onProgress({ frame: f + 1, totalFrames, phase: 'video', etaSeconds: f > 5 ? (el / (f + 1)) * (totalFrames - f - 1) : null });
        await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
      }
    }
    onProgress({ frame: totalFrames, totalFrames, phase: 'finalizing', etaSeconds: 0 });
    await venc.flush();
    if (encodeError) throw encodeError;
  } finally {
    if (venc.state !== 'closed') venc.close();
    composer.dispose();
  }
  muxer.finalize();
  const buffer = (muxer.target as Mp4Target | WebmTarget).buffer;
  const mime = choice.container === 'mp4' ? 'video/mp4' : 'video/webm';
  onProgress({ frame: totalFrames, totalFrames, phase: 'done', etaSeconds: 0 });
  return { blob: new Blob([buffer], { type: mime }), mime, extension: choice.container, codec: choice.label, frames: totalFrames, duration: totalFrames / fps, width, height, fps, hasAudio };
}

/**
 * Fallback when WebCodecs is missing: real-time capture with MediaRecorder. Frames are still
 * drawn at their exact timestamps, but encoding happens in real time, so the export takes as
 * long as the video and dropped frames are possible on slow machines.
 */
export async function exportRealtime(project: VideoProject, recordings: Map<string, Recording>, onProgress: (p: ExportProgress) => void, isCancelled: () => boolean): Promise<ExportResult> {
  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const composer = new Composer(project, recordings, canvas);
  const stream = canvas.captureStream(project.fps);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const duration = projectDuration(project);
  const totalFrames = Math.round(duration * project.fps);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(250);
  const start = performance.now();
  for (;;) {
    if (isCancelled()) break;
    const t = (performance.now() - start) / 1000;
    if (t >= duration) break;
    await composer.drawFrame(t);
    onProgress({ frame: Math.round(t * project.fps), totalFrames, phase: 'video', etaSeconds: duration - t });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  rec.stop();
  await done;
  composer.dispose();
  if (isCancelled()) throw new Error('Cancelled');
  return { blob: new Blob(chunks, { type: 'video/webm' }), mime: 'video/webm', extension: 'webm', codec: `MediaRecorder ${mime} (real-time, no audio)`, frames: totalFrames, duration, width: project.width, height: project.height, fps: project.fps, hasAudio: false };
}

/** Verify a finished file by loading it in a media element (when the runtime can decode it). */
export function verifyPlayable(blob: Blob): Promise<{ ok: boolean; duration: number; width: number; height: number; error?: string }> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    const url = URL.createObjectURL(blob);
    const done = (r: { ok: boolean; duration: number; width: number; height: number; error?: string }) => {
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: false, duration: 0, width: 0, height: 0, error: 'timeout while reading metadata' }), 8000);
    v.onloadedmetadata = () => {
      clearTimeout(timer);
      done({ ok: true, duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    };
    v.onerror = () => {
      clearTimeout(timer);
      done({ ok: false, duration: 0, width: 0, height: 0, error: 'this runtime cannot decode the file for verification (the file may still be valid)' });
    };
    v.src = url;
  });
}
