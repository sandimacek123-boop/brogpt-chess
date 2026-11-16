import { useEffect, useMemo, useRef, useState } from 'react';
import type { VisualizerController, VisualizerStatus } from '../engine/visualizer';
import { CanvasRecorder, RESOLUTIONS, recordingSupported, supportedFormats } from '../record/recorder';
import { useSettings } from '../state/SettingsContext';
import { getAlgorithm } from '../algorithms';
import { Button, Card, Field, Select, Toggle } from './controls';
import { IconDownload, IconRecord, IconStop } from './icons';
import { isNative, saveAndShareNative } from '../native';

type RecState = 'idle' | 'recording' | 'finalizing';

export default function RecordingPanel({ controller, status }: { controller: VisualizerController; status: VisualizerStatus }) {
  const { settings, audio, update } = useSettings();
  const formats = useMemo(() => supportedFormats(), []);
  const [res, setRes] = useState('1080p');
  const [fps, setFps] = useState(60);
  const [fmt, setFmt] = useState(0);
  const [withAudio, setWithAudio] = useState(true);
  const [state, setState] = useState<RecState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [video, setVideo] = useState<{ url: string; name: string; size: number; type: string; blob: Blob } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const recRef = useRef<CanvasRecorder | null>(null);
  const timerRef = useRef<number>(0);

  useEffect(() => () => {
    window.clearInterval(timerRef.current);
    if (video) URL.revokeObjectURL(video.url);
  }, []);

  if (!recordingSupported() || formats.length === 0) {
    return (
      <Card title="Recording">
        <p className="text-sm text-ink-400">Video recording needs MediaRecorder and canvas.captureStream, which this browser does not support.</p>
      </Card>
    );
  }

  const stop = async () => {
    const rec = recRef.current;
    if (!rec) return;
    setState('finalizing');
    window.clearInterval(timerRef.current);
    const blob = await rec.stop();
    recRef.current = null;
    controller.onFinished = null;
    if (controller.stage) {
      controller.stage.fixedSize = null;
      controller.stage.canvas.style.objectFit = '';
    }
    const f = formats[fmt] ?? formats[0];
    if (video) URL.revokeObjectURL(video.url);
    const algo = getAlgorithm(settings.algorithmId);
    const name = `sortlab-${algo.id}-${status.n}-${settings.mode}.${f.ext}`;
    setVideo({ url: URL.createObjectURL(blob), name, size: blob.size, type: blob.type, blob });
    setSaveMsg(null);
    setState('idle');
  };

  const start = async () => {
    const stage = controller.stage;
    if (!stage) return;
    const r = RESOLUTIONS.find((x) => x.id === res) ?? RESOLUTIONS[1];
    const f = formats[fmt] ?? formats[0];
    let audioStream: MediaStream | null = null;
    if (withAudio) {
      audio.unlock();
      if (!settings.soundEnabled) update({ soundEnabled: true });
      audioStream = audio.getRecordStream();
    }
    stage.fixedSize = { w: r.w, h: r.h };
    stage.canvas.style.objectFit = 'contain';
    stage.resize();
    controller.restart();
    const rec = new CanvasRecorder();
    try {
      rec.start(stage.canvas, { fps, format: f, audio: audioStream, bitrate: r.w * r.h * fps * 0.1 });
    } catch (e) {
      stage.fixedSize = null;
      stage.canvas.style.objectFit = '';
      alert(`Recording could not start: ${(e as Error).message}`);
      return;
    }
    recRef.current = rec;
    setState('recording');
    setElapsed(0);
    setBytes(0);
    timerRef.current = window.setInterval(() => {
      setElapsed((performance.now() - rec.startedAt) / 1000);
      setBytes(rec.bytes);
    }, 250);
    controller.onFinished = () => {
      // keep a short tail so the verification sweep is included
      window.setTimeout(() => void stop(), 1600);
    };
    await controller.start();
  };

  return (
    <Card
      title="Recording"
      right={
        state === 'recording' ? (
          <span className="flex items-center gap-2 text-xs font-semibold text-[#ff2e63]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#ff2e63]" /> REC
          </span>
        ) : null
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Resolution">
          <Select ariaLabel="Resolution" value={res} onChange={setRes} options={RESOLUTIONS.map((r) => ({ value: r.id, label: r.label }))} disabled={state !== 'idle'} />
        </Field>
        <Field label="Frame rate">
          <Select
            ariaLabel="Frame rate"
            value={String(fps)}
            onChange={(v) => setFps(Number(v))}
            options={[
              { value: '30', label: '30 fps' },
              { value: '60', label: '60 fps' },
            ]}
            disabled={state !== 'idle'}
          />
        </Field>
        <Field label="Format">
          <Select ariaLabel="Format" value={String(fmt)} onChange={(v) => setFmt(Number(v))} options={formats.map((f, i) => ({ value: String(i), label: f.label }))} disabled={state !== 'idle'} />
        </Field>
      </div>
      <div className="mt-2">
        <Toggle checked={withAudio} onChange={setWithAudio} label="Include sound" description="Turns on sorting sounds and records them into the video." />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {state === 'idle' ? (
          <Button variant="danger" onClick={() => void start()} disabled={status.phase === 'computing'}>
            <IconRecord /> Record run
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => void stop()} disabled={state === 'finalizing'}>
            <IconStop /> {state === 'finalizing' ? 'Finalizing…' : 'Stop'}
          </Button>
        )}
        {state === 'recording' && (
          <div className="flex-1 text-xs text-ink-300 tnum">
            {elapsed.toFixed(1)} s · {(bytes / 1048576).toFixed(1)} MB · sort {(status.progress * 100).toFixed(0)}%
            <div className="mt-1.5 h-1 overflow-hidden rounded bg-white/10">
              <div className="h-full bg-[#ff2e63] transition-[width]" style={{ width: `${status.progress * 100}%` }} />
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-400">
        Recording restarts the current run from the beginning at the chosen resolution and stops automatically shortly after it finishes. MP4 is listed only when your
        browser can encode it.
      </p>
      {video && state === 'idle' && (
        <div className="mt-4 flex flex-col gap-3">
          <video src={video.url} controls playsInline className="max-h-64 w-full rounded-xl border border-white/10 bg-black" />
          {isNative() ? (
            <Button
              variant="primary"
              onClick={() => {
                setSaveMsg('Preparing…');
                saveAndShareNative(video.blob, video.name)
                  .then(() => setSaveMsg(null))
                  .catch((e: Error) => setSaveMsg(`Could not share: ${e.message}`));
              }}
            >
              <IconDownload /> Save / share {video.name} ({(video.size / 1048576).toFixed(1)} MB)
            </Button>
          ) : (
            <a
              href={video.url}
              download={video.name}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-ink-950 transition hover:bg-white/90"
            >
              <IconDownload /> Download {video.name} ({(video.size / 1048576).toFixed(1)} MB)
            </a>
          )}
          {saveMsg && <p className="text-xs text-ink-300">{saveMsg}</p>}
        </div>
      )}
    </Card>
  );
}
