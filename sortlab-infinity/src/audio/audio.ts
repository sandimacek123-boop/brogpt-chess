import type { SoundEvent } from '../engine/player';
import { frequencyFor, ScaleId } from './scales';

export interface AudioSettings {
  soundEnabled: boolean;
  volume: number;
  waveform: OscillatorType;
  scale: ScaleId;
  pitchMin: number;
  pitchMax: number;
  soundCompare: boolean;
  soundSwap: boolean;
  soundWrite: boolean;
}

/**
 * Synthesised sorting sounds. The AudioContext is only created from a user gesture
 * (unlock()), which satisfies browser autoplay policies.
 */
export class SortAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  /** Stream destination used to include audio in recordings. */
  recordDest: MediaStreamAudioDestinationNode | null = null;
  private lastNote = 0;
  private active = 0;
  maxVoices = 12;
  minInterval = 1 / 90;

  /** Create/resume the AudioContext. Must be called from a user gesture. */
  unlock(): boolean {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -18;
        this.comp.ratio.value = 6;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.3;
        this.master.connect(this.comp);
        this.comp.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  getRecordStream(): MediaStream | null {
    if (!this.ctx || !this.comp) return null;
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.comp.connect(this.recordDest);
    }
    return this.recordDest.stream;
  }

  setVolume(v: number) {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.6, this.ctx.currentTime, 0.02);
  }

  /** Play a single tone for a normalised value (used by settings preview). */
  tone(t: number, s: AudioSettings, duration = 0.12) {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    if (this.active >= this.maxVoices) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = s.waveform;
    osc.frequency.value = frequencyFor(t, s.pitchMin, s.pitchMax, s.scale);
    const peak = s.waveform === 'square' || s.waveform === 'sawtooth' ? 0.12 : 0.22;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env);
    env.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
    this.active++;
    osc.onended = () => {
      this.active--;
      osc.disconnect();
      env.disconnect();
    };
  }

  /**
   * Play sounds for a frame's events, throttled: at most one note per minInterval and
   * a bounded number of simultaneous voices, which prevents clipping and distortion.
   */
  playEvents(events: SoundEvent[], maxValue: number, s: AudioSettings, opsPerSecond: number) {
    if (!s.soundEnabled || !this.ctx || this.ctx.state !== 'running' || events.length === 0) return;
    this.setVolume(s.volume);
    const now = this.ctx.currentTime;
    if (now - this.lastNote < this.minInterval) return;
    // pick the most recent eligible event
    for (let k = events.length - 1; k >= 0; k--) {
      const e = events[k];
      if ((e.kind === 1 && !s.soundCompare) || (e.kind === 2 && !s.soundSwap) || (e.kind === 3 && !s.soundWrite)) continue;
      this.lastNote = now;
      const dur = Math.max(0.04, Math.min(0.18, 6 / Math.max(1, opsPerSecond) + 0.04));
      this.tone(e.value / Math.max(1, maxValue), s, dur);
      return;
    }
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
