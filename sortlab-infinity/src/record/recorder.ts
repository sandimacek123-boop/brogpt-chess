export interface RecordingFormat {
  mime: string;
  label: string;
  ext: 'webm' | 'mp4';
}

const CANDIDATES: RecordingFormat[] = [
  { mime: 'video/webm;codecs=vp9,opus', label: 'WebM (VP9)', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8,opus', label: 'WebM (VP8)', ext: 'webm' },
  { mime: 'video/webm', label: 'WebM', ext: 'webm' },
  { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', label: 'MP4 (H.264)', ext: 'mp4' },
  { mime: 'video/mp4', label: 'MP4', ext: 'mp4' },
];

export const RESOLUTIONS = [
  { id: '720p', label: '1280 × 720 (720p)', w: 1280, h: 720 },
  { id: '1080p', label: '1920 × 1080 (1080p)', w: 1920, h: 1080 },
  { id: '1440p', label: '2560 × 1440 (1440p)', w: 2560, h: 1440 },
  { id: 'square', label: '1080 × 1080 (square)', w: 1080, h: 1080 },
  { id: 'vertical', label: '1080 × 1920 (vertical)', w: 1080, h: 1920 },
];

export function recordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

/** Formats the current browser can actually encode (MP4 appears only where supported). */
export function supportedFormats(): RecordingFormat[] {
  if (!recordingSupported()) return [];
  const out: RecordingFormat[] = [];
  const seen = new Set<string>();
  for (const f of CANDIDATES) {
    let ok = false;
    try {
      ok = MediaRecorder.isTypeSupported(f.mime);
    } catch {
      ok = false;
    }
    if (ok && !seen.has(f.label)) {
      out.push(f);
      seen.add(f.label);
    }
  }
  return out;
}

export class CanvasRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stopped: Promise<Blob> | null = null;
  bytes = 0;
  startedAt = 0;

  start(canvas: HTMLCanvasElement, opts: { fps: number; format: RecordingFormat; audio?: MediaStream | null; bitrate?: number }) {
    const video = canvas.captureStream(opts.fps);
    const tracks = [...video.getVideoTracks()];
    if (opts.audio) tracks.push(...opts.audio.getAudioTracks());
    const stream = new MediaStream(tracks);
    let mime = opts.format.mime;
    if (!opts.audio) mime = mime.replace(/,(opus|mp4a\.40\.2)/, '');
    if (!MediaRecorder.isTypeSupported(mime)) mime = opts.format.mime;
    this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: opts.bitrate ?? 12_000_000 });
    this.chunks = [];
    this.bytes = 0;
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size) {
        this.chunks.push(e.data);
        this.bytes += e.data.size;
      }
    };
    this.stopped = new Promise<Blob>((resolve) => {
      this.rec!.onstop = () => {
        stream.getVideoTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: opts.format.mime.split(';')[0] }));
      };
    });
    this.rec.start(250);
    this.startedAt = performance.now();
  }

  get recording() {
    return this.rec?.state === 'recording';
  }

  stop(): Promise<Blob> {
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    return this.stopped ?? Promise.resolve(new Blob());
  }
}
