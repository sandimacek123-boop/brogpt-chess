import { parseBestMove, parseInfo, PvLine } from './uci';

export interface SearchOptions {
  fen: string;
  multipv?: number;
  depth?: number;
  movetime?: number;
  /** Stockfish "Skill Level" 0–20 (lower = weaker, deliberately imperfect). */
  skill?: number;
  onInfo?: (lines: PvLine[]) => void;
}

export interface SearchResult {
  best: string | null;
  lines: PvLine[];
}

interface Job {
  opts: SearchOptions;
  whiteToMove: boolean;
  lines: Map<number, PvLine>;
  resolve: (r: SearchResult) => void;
  reject: (e: Error) => void;
  cancelled: boolean;
  started: boolean;
}

export class EngineCancelled extends Error {
  constructor() {
    super('search cancelled');
    this.name = 'EngineCancelled';
  }
}

/**
 * Stockfish 17.1 (single-threaded WASM) in a Web Worker, behind a small job queue:
 * a new search stops the running one, waits for its `bestmove`, then starts. Info
 * lines from a stopped search are discarded, so callers never see stale output.
 */
export class Engine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private current: Job | null = null;
  private pending: Job | null = null;
  private skill = 20;
  private multipv = 1;
  name = 'Stockfish';
  failed: string | null = null;

  constructor(private url: string) {}

  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      let w: Worker;
      try {
        w = new Worker(this.url);
      } catch (e) {
        this.failed = (e as Error).message;
        reject(e);
        return;
      }
      this.worker = w;
      const timer = setTimeout(() => {
        this.failed = 'The engine did not start in time.';
        reject(new Error(this.failed));
      }, 20000);
      let stage = 0;
      w.onmessage = (e: MessageEvent) => {
        const line = String(e.data);
        if (stage === 0) {
          if (line.startsWith('id name')) this.name = line.slice(8).trim();
          if (line === 'uciok') {
            stage = 1;
            w.postMessage('setoption name Hash value 32');
            w.postMessage('isready');
          }
          return;
        }
        if (stage === 1) {
          if (line === 'readyok') {
            stage = 2;
            clearTimeout(timer);
            w.onmessage = (ev: MessageEvent) => this.onLine(String(ev.data));
            resolve();
          }
        }
      };
      w.onerror = (e) => {
        clearTimeout(timer);
        this.failed = e.message || 'The engine could not be loaded.';
        reject(new Error(this.failed));
      };
      w.postMessage('uci');
    });
    return this.ready;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private onLine(line: string) {
    const job = this.current;
    if (!job) return;
    if (line.startsWith('info ')) {
      if (job.cancelled) return;
      const info = parseInfo(line, job.whiteToMove);
      if (!info || info.bound) return;
      job.lines.set(info.multipv, info);
      job.opts.onInfo?.(this.sorted(job));
      return;
    }
    const bm = parseBestMove(line);
    if (!bm) return;
    this.current = null;
    if (job.cancelled) job.reject(new EngineCancelled());
    else job.resolve({ best: bm.best, lines: this.sorted(job) });
    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      this.begin(next);
    }
  }

  private sorted(job: Job) {
    return [...job.lines.values()].sort((a, b) => a.multipv - b.multipv);
  }

  private begin(job: Job) {
    this.current = job;
    job.started = true;
    const o = job.opts;
    const skill = o.skill ?? 20;
    if (skill !== this.skill) {
      this.send(`setoption name Skill Level value ${skill}`);
      this.skill = skill;
    }
    const mpv = o.multipv ?? 1;
    if (mpv !== this.multipv) {
      this.send(`setoption name MultiPV value ${mpv}`);
      this.multipv = mpv;
    }
    this.send(`position fen ${o.fen}`);
    if (o.movetime) this.send(`go movetime ${o.movetime}`);
    else this.send(`go depth ${o.depth ?? 18}`);
  }

  /** Start a search. Any running search is stopped and its promise rejects with EngineCancelled. */
  async search(opts: SearchOptions): Promise<SearchResult> {
    await this.init();
    const whiteToMove = opts.fen.split(' ')[1] !== 'b';
    return new Promise<SearchResult>((resolve, reject) => {
      const job: Job = { opts, whiteToMove, lines: new Map(), resolve, reject, cancelled: false, started: false };
      if (this.pending) {
        this.pending.cancelled = true;
        this.pending.reject(new EngineCancelled());
      }
      if (this.current) {
        this.pending = job;
        if (!this.current.cancelled) {
          this.current.cancelled = true;
          this.send('stop');
        }
      } else this.begin(job);
    });
  }

  /** Stop whatever is running (its promise rejects with EngineCancelled). */
  stop() {
    if (this.pending) {
      this.pending.cancelled = true;
      this.pending.reject(new EngineCancelled());
      this.pending = null;
    }
    if (this.current && !this.current.cancelled) {
      this.current.cancelled = true;
      this.send('stop');
    }
  }

  newGame() {
    this.stop();
    this.send('ucinewgame');
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}
