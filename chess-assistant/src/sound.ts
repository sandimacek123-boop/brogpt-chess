/** Small synthesized board sounds (Web Audio). Created lazily on the first user gesture. */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function playMoveSound(kind: 'move' | 'capture' | 'check' | 'end') {
  if (kind === 'move') blip(420, 0.07, 'triangle', 0.18);
  else if (kind === 'capture') {
    blip(300, 0.09, 'square', 0.08);
    blip(180, 0.1, 'triangle', 0.16, 0.012);
  } else if (kind === 'check') {
    blip(660, 0.08, 'triangle', 0.16);
    blip(880, 0.1, 'triangle', 0.12, 0.07);
  } else {
    blip(523, 0.18, 'sine', 0.16);
    blip(659, 0.18, 'sine', 0.14, 0.12);
    blip(784, 0.3, 'sine', 0.14, 0.24);
  }
}

export function soundFor(san: string, gameOver: boolean) {
  if (gameOver) playMoveSound('end');
  else if (san.includes('+')) playMoveSound('check');
  else if (san.includes('x')) playMoveSound('capture');
  else playMoveSound('move');
}
