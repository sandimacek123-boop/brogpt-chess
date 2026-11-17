import type { Settings, ScaleId } from '../state/settings';
import { Op, OP_STRIDE } from '../engine/ops';
import type { Timeline } from '../engine/timeline';

export type AudioSettings = Settings['audio'];

export interface NoteEvent {
  kind: 'compare' | 'swap' | 'write';
  /** pitch source in [0, 1] */
  t: number;
  /** stereo position in [-1, 1] */
  pan: number;
  /** magnitude in [0, 1] (for volume-by-magnitude) */
  mag: number;
}

const SCALES: Record<Exclude<ScaleId, 'custom'>, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  'whole-tone': [0, 2, 4, 6, 8, 10],
};

export function scaleIntervals(s: AudioSettings): number[] {
  if (s.scale === 'custom') {
    const v = s.customScale
      .split(/[\s,]+/)
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x >= 0 && x < 12);
    return v.length ? Array.from(new Set(v)).sort((a, b) => a - b) : SCALES.chromatic;
  }
  return SCALES[s.scale];
}

/** Map t in [0,1] to a MIDI note within the pitch range, optionally quantised to the scale. */
export function pitchFor(t: number, s: AudioSettings, intervals: number[]): number {
  const lo = Math.min(s.pitchMin, s.pitchMax);
  const hi = Math.max(s.pitchMin, s.pitchMax);
  const midi = lo + Math.max(0, Math.min(1, t)) * (hi - lo);
  if (!s.quantize) return midi;
  const base = Math.floor(midi);
  let best = base;
  let bestD = Infinity;
  for (let m = base - 2; m <= base + 2; m++) {
    const pc = (((m - s.rootNote) % 12) + 12) % 12;
    if (!intervals.includes(pc)) continue;
    const d = Math.abs(m - midi);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Pick up to `density` sounding events from the ops in [from, to). Selection is evenly spaced
 * and deterministic so the same playback produces the same notes (live and offline).
 */
export function notesForOps(tl: Timeline, from: number, to: number, s: AudioSettings, minKey: number, maxKey: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  if (to <= from) return out;
  const n = tl.n;
  const span = Math.max(1, maxKey - minKey);
  const count = to - from;
  const want = Math.max(1, Math.round(s.density));
  // scan candidate sounding ops (cap the scan for very large frames)
  const stride = count > want * 64 ? Math.floor(count / (want * 64)) : 1;
  const cand: number[] = [];
  for (let k = from; k < to; k += stride) {
    const t = tl.ops[k * OP_STRIDE];
    if ((t === Op.COMPARE || t === Op.COMPARE_HELD || t === Op.COMPARE_AUX) && s.soundCompare) cand.push(k);
    else if (t === Op.SWAP && s.soundSwap) cand.push(k);
    else if ((t === Op.WRITE || t === Op.MOVE || t === Op.TO_AUX || t === Op.AUX_STORE) && s.soundWrite) cand.push(k);
  }
  if (!cand.length) return out;
  const pick = Math.min(want, cand.length);
  for (let j = 0; j < pick; j++) {
    const k = cand[Math.floor(((j + 0.5) / pick) * cand.length)];
    const o = k * OP_STRIDE;
    const type = tl.ops[o];
    const a = tl.ops[o + 1];
    const b = tl.ops[o + 2];
    const kind: NoteEvent['kind'] = type === Op.SWAP ? 'swap' : type === Op.COMPARE || type === Op.COMPARE_HELD || type === Op.COMPARE_AUX ? 'compare' : 'write';
    const idx = a >= 0 && a < n ? a : b >= 0 && b < n ? b : 0;
    // key of the element at idx *after* the op (the state at playback position)
    const keyAt = (i: number) => (i >= 0 && i < n ? (tl.keys[tl.ids[i]] - minKey) / span : 0);
    let t: number;
    if (s.mapping === 'position') t = n > 1 ? idx / (n - 1) : 0.5;
    else if (s.mapping === 'pair' && b >= 0 && b < n && (type === Op.COMPARE || type === Op.SWAP)) t = (keyAt(a) + keyAt(b)) / 2;
    else if (type === Op.WRITE || type === Op.MOVE) t = (tl.keys[b] - minKey) / span; // b = written element id
    else t = keyAt(idx);
    out.push({ kind, t, pan: n > 1 ? (idx / (n - 1)) * 2 - 1 : 0, mag: t });
  }
  return out;
}

interface Graph {
  input: GainNode;
  master: GainNode;
  nodes: AudioNode[];
}

function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  let seed = 1234567;
  const rnd = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) | 0;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = rnd() * Math.pow(1 - i / len, 2.6);
  }
  return buf;
}

export function buildGraph(ctx: BaseAudioContext, s: AudioSettings): Graph {
  const input = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = s.highpass;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = s.lowpass;
  const dry = ctx.createGain();
  dry.gain.value = 1 - s.reverb * 0.5;
  const verb = ctx.createConvolver();
  verb.buffer = makeImpulse(ctx, 2.2);
  const verbGain = ctx.createGain();
  verbGain.gain.value = s.reverb;
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.18;
  const fb = ctx.createGain();
  fb.gain.value = Math.min(0.85, s.delay);
  const delayGain = ctx.createGain();
  delayGain.gain.value = s.delay;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  const master = ctx.createGain();
  master.gain.value = s.volume;
  input.connect(hp);
  hp.connect(lp);
  lp.connect(dry);
  lp.connect(verb);
  verb.connect(verbGain);
  lp.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(delayGain);
  dry.connect(comp);
  verbGain.connect(comp);
  delayGain.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);
  return { input, master, nodes: [input, hp, lp, dry, verb, verbGain, delay, fb, delayGain, comp, master] };
}

/** Schedule one synthesized note. Returns the time the voice ends. */
export function scheduleNote(ctx: BaseAudioContext, dest: AudioNode, ev: NoteEvent, when: number, s: AudioSettings, intervals: number[], gainScale: number): number {
  const midi = pitchFor(ev.t, s, intervals);
  const f = midiToFreq(midi);
  const kindGain = ev.kind === 'compare' ? 0.55 : ev.kind === 'swap' ? 1 : 0.8;
  const dur = s.noteDuration * (ev.kind === 'compare' ? 0.8 : 1);
  const peak = 0.22 * kindGain * gainScale * (s.volumeByMagnitude ? 0.35 + 0.65 * ev.mag : 1);
  const A = s.attack;
  const D = s.decay;
  const S = s.sustain;
  const R = s.release;
  const end = when + A + Math.max(dur, D) + R;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(peak, when + A);
  env.gain.linearRampToValueAtTime(peak * S, when + A + D);
  env.gain.setValueAtTime(peak * S, when + A + Math.max(dur, D));
  env.gain.linearRampToValueAtTime(0.0001, end);
  let out: AudioNode = env;
  if (typeof (ctx as AudioContext).createStereoPanner === 'function') {
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, ev.pan * s.stereoWidth));
    env.connect(pan);
    out = pan;
  }
  out.connect(dest);

  const osc = (type: OscillatorType, freq: number, gain: number, detune = 0, decayTo?: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    if (decayTo !== undefined) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, decayTo), when + Math.max(0.02, dur));
    o.connect(g);
    g.connect(env);
    o.start(when);
    o.stop(end + 0.02);
    return o;
  };

  switch (s.instrument) {
    case 'sine':
    case 'triangle':
    case 'square':
    case 'sawtooth':
      osc(s.instrument, f, s.instrument === 'square' || s.instrument === 'sawtooth' ? 0.45 : 1);
      break;
    case 'bell': {
      // simple FM bell: modulator at 3.5×, decaying index
      const car = ctx.createOscillator();
      car.frequency.setValueAtTime(f, when);
      const mod = ctx.createOscillator();
      mod.frequency.setValueAtTime(f * 3.5, when);
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(f * 2.2, when);
      idx.gain.exponentialRampToValueAtTime(f * 0.05, end);
      mod.connect(idx);
      idx.connect(car.frequency);
      car.connect(env);
      car.start(when);
      mod.start(when);
      car.stop(end + 0.02);
      mod.stop(end + 0.02);
      break;
    }
    case 'pluck': {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, when);
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(Math.min(16000, f * 12), when);
      flt.frequency.exponentialRampToValueAtTime(Math.max(80, f * 1.2), when + Math.max(0.04, dur));
      flt.Q.value = 2;
      o.connect(flt);
      flt.connect(env);
      o.start(when);
      o.stop(end + 0.02);
      break;
    }
    case 'piano':
      osc('triangle', f, 0.8, 0, 0.25);
      osc('sine', f * 2, 0.35, 3, 0.05);
      osc('sine', f * 3, 0.12, -4, 0.01);
      break;
    case 'marimba':
      osc('sine', f, 1, 0, 0.3);
      osc('sine', f * 4, 0.5, 0, 0.001);
      break;
    case 'chime':
      osc('sine', f, 0.8);
      osc('sine', f * 2.0, 0.35, 0, 0.05);
      osc('sine', f * 3.0, 0.2, 0, 0.02);
      break;
    case 'pad':
      osc('sawtooth', f, 0.25, -8);
      osc('sawtooth', f, 0.25, 8);
      osc('sine', f / 2, 0.4);
      break;
    case 'pulse':
      osc('square', f, 0.35);
      osc('square', f * 2, 0.1, 5);
      break;
  }
  return end;
}

/** Live audio engine. Created lazily after a user gesture (autoplay policy). */
export class SortAudio {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private graphKey = '';
  private voices: number[] = [];
  private intervals: number[] = SCALES.pentatonic;
  error: string | null = null;

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture handler. */
  async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
        if (!Ctor) {
          this.error = 'Web Audio is not supported in this browser.';
          return false;
        }
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.error = null;
      return true;
    } catch (e) {
      this.error = `Audio could not start: ${(e as Error).message}`;
      return false;
    }
  }

  private ensureGraph(s: AudioSettings) {
    if (!this.ctx) return;
    const key = JSON.stringify([s.highpass, s.lowpass, s.reverb, s.delay]);
    if (!this.graph || key !== this.graphKey) {
      if (this.graph) {
        const old = this.graph;
        old.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        setTimeout(() => old.nodes.forEach((n) => n.disconnect()), 600);
      }
      this.graph = buildGraph(this.ctx, s);
      this.graphKey = key;
    }
    this.graph.master.gain.setTargetAtTime(s.volume, this.ctx.currentTime, 0.02);
    this.intervals = scaleIntervals(s);
  }

  play(events: NoteEvent[], s: AudioSettings) {
    if (!this.ctx || this.ctx.state !== 'running' || !events.length) return;
    this.ensureGraph(s);
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((e) => e > now);
    const room = Math.max(0, s.polyphony - this.voices.length);
    const list = events.slice(0, room);
    if (!list.length) return;
    const gainScale = 1 / Math.sqrt(Math.max(1, list.length));
    for (const ev of list) {
      const end = scheduleNote(this.ctx, this.graph!.input, ev, now + 0.005, s, this.intervals, gainScale);
      this.voices.push(end);
    }
  }

  /** A short confirmation chord used by the completion effect. */
  chord(s: AudioSettings) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.ensureGraph(s);
    const now = this.ctx.currentTime;
    [0.2, 0.45, 0.7, 1].forEach((t, i) => scheduleNote(this.ctx!, this.graph!.input, { kind: 'swap', t, pan: (i - 1.5) / 2, mag: 1 }, now + i * 0.06, { ...s, noteDuration: 0.5, release: 0.6 }, this.intervals, 0.6));
  }

  silence() {
    if (!this.ctx || !this.graph) return;
    const g = this.graph;
    g.master.gain.cancelScheduledValues(this.ctx.currentTime);
    g.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    this.voices = [];
    // rebuild on next play
    const ctx = this.ctx;
    setTimeout(() => {
      g.nodes.forEach((n) => n.disconnect());
    }, 200);
    this.graph = null;
    void ctx;
  }

  async dispose() {
    this.silence();
    if (this.ctx) await this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}

export const audio = new SortAudio();
