// Beat tracking (pure TS – runs in the browser preview and in Node).
//  onset envelope = log-spectral flux  →  tempo via weighted autocorrelation
//  →  beats via dynamic programming (Ellis 2007).

export type BeatAnalysis = {bpm: number; beats: number[]; duration: number};

const fft = (re: Float64Array, im: Float64Array) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
};

export const analyzeBeats = (samples: Float32Array, sampleRate: number): BeatAnalysis => {
  const duration = samples.length / sampleRate;
  let N = 1;
  while (N < sampleRate * 0.046) N <<= 1;
  const hop = Math.max(1, Math.round(sampleRate * 0.0116));
  const frames = Math.max(0, Math.floor((samples.length - N) / hop));
  const fps = sampleRate / hop;
  if (frames < 32) return {bpm: 0, beats: [], duration};

  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const bins = N / 2;
  let prev = new Float64Array(bins);
  const onset = new Float64Array(frames);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < N; i++) {
      re[i] = samples[off + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const cur = new Float64Array(bins);
    let flux = 0;
    for (let b = 1; b < bins; b++) {
      const mag = Math.log1p(1000 * Math.hypot(re[b], im[b]));
      cur[b] = mag;
      const d = mag - prev[b];
      if (d > 0) flux += d;
    }
    onset[f] = flux;
    prev = cur;
  }
  // high-pass (remove local mean), rectify, normalise
  const W = Math.round(fps * 0.4);
  const env = new Float64Array(frames);
  let acc = 0;
  const pre = new Float64Array(frames + 1);
  for (let f = 0; f < frames; f++) pre[f + 1] = pre[f] + onset[f];
  for (let f = 0; f < frames; f++) {
    const a = Math.max(0, f - W);
    const b = Math.min(frames, f + W + 1);
    const mean = (pre[b] - pre[a]) / (b - a);
    env[f] = Math.max(0, onset[f] - mean);
    acc += env[f] * env[f];
  }
  const sd = Math.sqrt(acc / frames) || 1;
  for (let f = 0; f < frames; f++) env[f] /= sd;

  // tempo: autocorrelation weighted toward ~120 BPM
  const minLag = Math.floor((60 / 190) * fps);
  const maxLag = Math.ceil((60 / 65) * fps);
  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let f = lag; f < frames; f++) s += env[f] * env[f - lag];
    s /= frames - lag;
    const bpm = (60 * fps) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    if (s * w > bestScore) {
      bestScore = s * w;
      bestLag = lag;
    }
  }
  // refine with parabolic interpolation
  const ac = (lag: number) => {
    let s = 0;
    for (let f = lag; f < frames; f++) s += env[f] * env[f - lag];
    return s / (frames - lag);
  };
  const y0 = ac(bestLag - 1);
  const y1 = ac(bestLag);
  const y2 = ac(bestLag + 1);
  const denom = y0 - 2 * y1 + y2;
  const period = denom !== 0 ? bestLag + (0.5 * (y0 - y2)) / denom : bestLag;
  const bpm = (60 * fps) / period;

  // dynamic-programming beat tracker
  const alpha = 100;
  const score = new Float64Array(frames);
  const back = new Int32Array(frames).fill(-1);
  for (let f = 0; f < frames; f++) {
    let best = 0;
    let arg = -1;
    const lo = Math.max(0, Math.floor(f - 2 * period));
    const hi = Math.floor(f - period / 2);
    for (let p = lo; p <= hi; p++) {
      const pen = Math.log((f - p) / period);
      const v = score[p] - alpha * pen * pen;
      if (v > best || arg < 0) {
        best = v;
        arg = p;
      }
    }
    score[f] = env[f] + (arg >= 0 ? best : 0);
    back[f] = arg;
  }
  // start from the best-scoring frame in the last beat period
  let end = frames - 1;
  let endScore = -Infinity;
  for (let f = Math.max(0, Math.floor(frames - period)); f < frames; f++) {
    if (score[f] > endScore) {
      endScore = score[f];
      end = f;
    }
  }
  const beatFrames: number[] = [];
  for (let f = end; f >= 0; f = back[f]) {
    beatFrames.push(f);
    if (back[f] < 0) break;
  }
  beatFrames.reverse();
  // frame index → seconds (centre of analysis window)
  const beats = beatFrames.map((f) => (f * hop + N * 0.75) / sampleRate);
  return {bpm, beats, duration};
};

/** Browser helper: decode an audio file (File/Blob/ArrayBuffer) and analyse it. */
export const analyzeInBrowser = async (data: ArrayBuffer): Promise<BeatAnalysis> => {
  const Ctx = (window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext);
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(data.slice(0));
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
    }
    // analyse at ≈ 22 kHz for speed
    const step = Math.max(1, Math.floor(buf.sampleRate / 22050));
    const ds = new Float32Array(Math.floor(mono.length / step));
    for (let i = 0; i < ds.length; i++) ds[i] = mono[i * step];
    return analyzeBeats(ds, buf.sampleRate / step);
  } finally {
    void ctx.close();
  }
};
