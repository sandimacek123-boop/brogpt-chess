// Preview + export server.
//   npm run preview  → http://localhost:3000
// Serves the preview app (Vite middleware), accepts uploads (logo, artwork,
// audio) and runs real Remotion renders with live progress (SSE).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createServer as createVite} from 'vite';
import {makeCancelSignal} from '@remotion/renderer';
import {ROOT, runRender} from '../scripts/render-core';
import type {EditProps} from '../src/config';

const PORT = Number(process.env.PORT ?? 3000);
const UPLOADS = path.join(ROOT, 'uploads');
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(UPLOADS, {recursive: true});
fs.mkdirSync(OUT, {recursive: true});

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.json': 'application/json',
};
const ALLOWED_UPLOADS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp3', '.wav', '.m4a']);

type Job = {
  id: string;
  mode: 'silent' | 'music';
  stage: string;
  progress: number;
  renderedFrames?: number;
  url?: string;
  error?: string;
  listeners: Set<http.ServerResponse>;
  cancel: () => void;
};
const jobs = new Map<string, Job>();
let queue: Promise<void> = Promise.resolve();

const publicJob = (j: Job) => ({id: j.id, mode: j.mode, stage: j.stage, progress: j.progress, renderedFrames: j.renderedFrames, url: j.url, error: j.error});
const emit = (j: Job) => {
  const data = `data: ${JSON.stringify(publicJob(j))}\n\n`;
  for (const res of j.listeners) res.write(data);
};

const readBody = (req: http.IncomingMessage, limit = 200 * 1024 * 1024) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Upload too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const sendFile = (req: http.IncomingMessage, res: http.ServerResponse, file: string, download: boolean) => {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  const stat = fs.statSync(file);
  const headers: Record<string, string | number> = {
    'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'access-control-allow-origin': '*',
    'accept-ranges': 'bytes',
    'cache-control': 'no-cache',
  };
  if (download) headers['content-disposition'] = `attachment; filename="${path.basename(file)}"`;
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : stat.size - 1;
    res.writeHead(206, {...headers, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': end - start + 1});
    fs.createReadStream(file, {start, end}).pipe(res);
    return;
  }
  res.writeHead(200, {...headers, 'content-length': stat.size});
  fs.createReadStream(file).pipe(res);
};

/** '/uploads/x.png' (what the browser uses) → absolute URL the headless renderer can load. */
const absolutize = (props: EditProps): EditProps => {
  const fix = (s: string | null) => (s && s.startsWith('/uploads/') ? `http://127.0.0.1:${PORT}${s}` : s);
  if (JSON.stringify(props).includes('blob:')) throw new Error('Some files were only loaded in the browser (blob:). Re-upload them while the server is running.');
  return {
    ...props,
    logo: fix(props.logo),
    audio: {...props.audio, src: fix(props.audio.src)},
    scenes: props.scenes.map((s) => ({...s, art: fix(s.art)!, panels: s.panels.map(fix) as typeof s.panels})),
  };
};

const startJob = (mode: 'silent' | 'music', props: EditProps, frameRange?: [number, number]): Job => {
  const id = crypto.randomBytes(6).toString('hex');
  const {cancelSignal, cancel} = makeCancelSignal();
  const job: Job = {id, mode, stage: 'queued', progress: 0, listeners: new Set(), cancel};
  jobs.set(id, job);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = `real-crosshair-${mode}-${stamp}.mp4`;
  queue = queue.then(async () => {
    if (job.stage === 'cancelled') return;
    try {
      await runRender({
        props: absolutize(props),
        output: path.join(OUT, file),
        withAudio: mode === 'music',
        frameRange,
        cancelSignal,
        onProgress: (p) => {
          job.stage = p.stage;
          job.progress = p.progress;
          job.renderedFrames = p.renderedFrames;
          emit(job);
        },
      });
      job.stage = 'done';
      job.progress = 1;
      job.url = `/out/${file}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      job.stage = /cancel/i.test(msg) ? 'cancelled' : 'error';
      job.error = job.stage === 'error' ? msg : undefined;
    }
    emit(job);
    for (const res of job.listeners) res.end();
    job.listeners.clear();
  });
  return job;
};

const main = async () => {
  const vite = await createVite({configFile: path.join(ROOT, 'vite.config.ts'), server: {middlewareMode: true}, appType: 'spa'});

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname === '/api/health') {
        res.writeHead(200, {'content-type': 'application/json'}).end('{"ok":true}');
        return;
      }
      if (url.pathname === '/api/upload' && req.method === 'POST') {
        const name = decodeURIComponent(String(req.headers['x-filename'] ?? 'file'));
        const ext = path.extname(name).toLowerCase();
        if (!ALLOWED_UPLOADS.has(ext)) {
          res.writeHead(400).end(`Unsupported file type ${ext}`);
          return;
        }
        const body = await readBody(req);
        const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 16);
        const base = path.basename(name, ext).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'file';
        const fileName = `${base}-${hash}${ext}`;
        fs.writeFileSync(path.join(UPLOADS, fileName), body);
        res.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({url: `/uploads/${fileName}`}));
        return;
      }
      if (url.pathname === '/api/render' && req.method === 'POST') {
        const {mode, props, frameRange} = JSON.parse((await readBody(req, 5 * 1024 * 1024)).toString()) as {
          mode: 'silent' | 'music';
          props: EditProps;
          frameRange?: [number, number]; // optional partial render (testing)
        };
        if (mode === 'music' && !(props.audio?.src && props.audio.enabled)) {
          res.writeHead(400).end('Import and enable an audio track first.');
          return;
        }
        absolutize(props); // validate early
        const job = startJob(mode === 'music' ? 'music' : 'silent', props, frameRange);
        res.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({id: job.id}));
        return;
      }
      const ev = url.pathname.match(/^\/api\/render\/([a-f0-9]+)\/(events|cancel)$/);
      if (ev) {
        const job = jobs.get(ev[1]);
        if (!job) {
          res.writeHead(404).end('unknown job');
          return;
        }
        if (ev[2] === 'cancel') {
          if (job.stage === 'queued') job.stage = 'cancelled';
          job.cancel();
          emit(job);
          res.writeHead(200).end('ok');
          return;
        }
        res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'});
        res.write(`data: ${JSON.stringify(publicJob(job))}\n\n`);
        if (['done', 'error', 'cancelled'].includes(job.stage)) {
          res.end();
          return;
        }
        job.listeners.add(res);
        req.on('close', () => job.listeners.delete(res));
        return;
      }
      if (url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/out/')) {
        const dir = url.pathname.startsWith('/uploads/') ? UPLOADS : OUT;
        const rel = decodeURIComponent(url.pathname.replace(/^\/(uploads|out)\//, ''));
        const file = path.resolve(dir, rel);
        if (!file.startsWith(dir + path.sep)) {
          res.writeHead(403).end();
          return;
        }
        sendFile(req, res, file, url.searchParams.has('download'));
        return;
      }
      vite.middlewares(req, res, () => {
        res.writeHead(404).end('not found');
      });
    } catch (e) {
      res.writeHead(500).end(e instanceof Error ? e.message : String(e));
    }
  });

  server.listen(PORT, () => {
    console.log(`\n  REAL crosshair edit · preview + export\n  → http://localhost:${PORT}\n`);
  });
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
