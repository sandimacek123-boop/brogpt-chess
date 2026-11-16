#!/usr/bin/env python3
"""
REAL — BEYOND EXECUTION :: original soundtrack generator.

100% procedural / original: dark phonk x cinematic trap, 150 BPM, F minor.
Every sound (808, kick, clap, cowbell, hats, risers, booms, whooshes, glitches,
mechanical hits, reverb) is synthesized here from oscillators and noise.
No samples, no copyrighted material.

Grid: beat = 0.4 s = 24 video frames @ 60 fps. The drop lands on frame 270 (4.5 s).
Outputs:
  build/audio.wav         48 kHz stereo 24-bit
  src/audio_events.json   frame numbers of kicks/snares/etc. (drives beat-reactive visuals)
"""
import json, os, sys
import numpy as np
from scipy import signal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TL = json.load(open(os.path.join(ROOT, 'src/timeline.json')))
SR = 48000
DUR = 15.0
N = int(SR * DUR)
FPS = TL['fps']
H = TL['hits']
rng = np.random.default_rng(7)

def F(frame):  # video frame -> seconds
    return frame / FPS

DROP = F(TL['drop'])          # 4.5 s
BEAT = 60 / TL['bpm']         # 0.4 s
SIX = BEAT / 4                # 16th = 0.1 s

def step_t(n):  # 16th-note index relative to the drop
    return DROP + n * SIX

# ----------------------------------------------------------------- buses
buses = {k: np.zeros((2, N)) for k in ['drums', 'bass', 'music', 'sfx', 'swell', 'verb_send', 'verb_send_long']}
events = {k: [] for k in ['kick', 'snare', 'hat', 'bass', 'cowbell', 'impact', 'whoosh', 'text']}

def place(bus, sig, t, gain=1.0, pan=0.0, send=0.0, long_send=0.0):
    """Mix mono or stereo signal into a bus at time t (s). pan in [-1, 1] (equal power)."""
    i0 = int(round(t * SR))
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        st = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    else:
        st = sig
    st = st * gain
    if i0 < 0:
        st = st[:, -i0:]; i0 = 0
    L = min(st.shape[1], N - i0)
    if L <= 0:
        return
    buses[bus][:, i0:i0 + L] += st[:, :L]
    if send:
        buses['verb_send'][:, i0:i0 + L] += st[:, :L] * send
    if long_send:
        buses['verb_send_long'][:, i0:i0 + L] += st[:, :L] * long_send

def tt(d):
    return np.arange(int(d * SR)) / SR

def sos(kind, f, order=2):
    if kind == 'band':
        return signal.butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], btype='band', output='sos')
    return signal.butter(order, f / (SR / 2), btype=kind, output='sos')

def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)

def svf(x, fc, q=0.8, mode='low'):
    """Time-varying TPT state-variable filter. fc: array or scalar (Hz)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2
    out = np.empty_like(x)
    ic1 = ic2 = 0.0
    for n in range(len(x)):
        v3 = x[n] - ic2
        v1 = a1[n] * ic1 + a2[n] * v3
        v2 = ic2 + a2[n] * ic1 + a3[n] * v3
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
        out[n] = v2 if mode == 'low' else (v1 if mode == 'band' else x[n] - k * v1 - v2)
    return out

def noise(d):
    return rng.standard_normal(int(d * SR))

def note(name):
    names = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
    n, o = name[:-1], int(name[-1])
    midi = 12 * (o + 1) + names[n]
    return 440 * 2 ** ((midi - 69) / 12)

def fade(x, a=0.002, r=0.01):
    n = len(x); e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:min(na, n)] = np.linspace(0, 1, min(na, n))
    e[-min(nr, n):] *= np.linspace(1, 0, min(nr, n))
    return x * e

# ----------------------------------------------------------------- instruments
def kick(d=0.5, f0=170, f1=44, drive=2.2):
    t = tt(d)
    fr = f1 + (f0 - f1) * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    body = np.sin(ph) * np.exp(-t * 6.5)
    click = filt(noise(d), 'high', 2500) * np.exp(-t * 500) * 0.5
    return fade(np.tanh(drive * (body + click)) / np.tanh(drive), 0.0005, 0.02)

def bass808(freqs_t, d, drive=3.0):
    """freqs_t: callable t->Hz."""
    t = tt(d)
    fr = freqs_t(t)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    s = np.sin(ph) + 0.18 * np.sin(2 * ph + 0.3)
    env = np.minimum(1, t / 0.004) * (0.75 + 0.25 * np.exp(-t * 4))
    s = np.tanh(drive * s * env) / np.tanh(drive)
    s = filt(s, 'low', 3200)
    return fade(s, 0.003, 0.035)

def clap(d=0.35):
    t = tt(d)
    n = noise(d)
    env = np.zeros_like(t)
    for off in (0, 0.009, 0.018, 0.026):
        m = t >= off
        env[m] += np.exp(-(t[m] - off) * 220)
    env += 0.55 * np.exp(-np.maximum(t - 0.026, 0) * 16) * (t >= 0.026)
    s = filt(n * env, 'band', (900, 7000))
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 28) * 0.6
    snap = filt(noise(d), 'high', 5000) * np.exp(-t * 60) * 0.35
    return fade(np.tanh(1.6 * (s + body + snap)), 0.0005, 0.03)

METAL = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0])

def metallic(d):
    t = tt(d)
    return sum(np.sign(np.sin(2 * np.pi * f * t + i)) for i, f in enumerate(METAL)) / 6

def hat(d=0.06, open_=False, bright=1.0):
    dd = 0.32 if open_ else d
    t = tt(dd)
    s = 0.6 * metallic(dd) + 0.5 * noise(dd)
    s = filt(s, 'band', (7000, 15000))
    env = np.exp(-t * (9 if open_ else 70))
    return fade(s * env * bright, 0.0005, 0.01)

def cowbell(f, d=0.28):
    t = tt(d)
    s = 0.6 * np.sign(np.sin(2 * np.pi * f * t)) + 0.45 * np.sign(np.sin(2 * np.pi * f * 1.4818 * t))
    s = filt(s, 'band', (f * 0.9, f * 4.5))
    env = 0.75 * np.exp(-t * 38) + 0.25 * np.exp(-t * 9)
    s = np.tanh(2.0 * s * env)
    return fade(s, 0.0008, 0.02)

def crash(d=2.2, decay=2.0):
    t = tt(d)
    s = 0.5 * metallic(d) + noise(d)
    s = filt(s, 'high', 3500)
    env = np.exp(-t * decay) * (0.6 + 0.4 * np.exp(-t * 18))
    sL = s * env
    sR = filt(0.5 * metallic(d)[::-1][:len(t)] * 0 + noise(d), 'high', 3500) * env
    return np.vstack([fade(sL, 0.001, 0.2), fade(sR, 0.001, 0.2)])

def boom(d=2.8, f0=120, f1=26, decay=1.5, drive=2.5):
    t = tt(d)
    fr = f1 + (f0 - f1) * np.exp(-t * 5)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    s = np.sin(ph) * np.exp(-t * decay)
    rumble = filt(noise(d), 'low', 300) * np.exp(-t * 6) * 0.8
    crack = filt(noise(d), 'band', (600, 5000)) * np.exp(-t * 40) * 0.7
    out = np.tanh(drive * (s + rumble + crack)) / np.tanh(drive)
    return fade(out, 0.0005, 0.3)

def riser(d, f_lo=250, f_hi=9000, saw_lo=110, saw_hi=880):
    t = tt(d)
    x = t / d
    fc = f_lo * (f_hi / f_lo) ** (x ** 1.4)
    n = svf(noise(d), fc, q=2.2, mode='band')
    fr = saw_lo * (saw_hi / saw_lo) ** (x ** 1.6)
    ph = np.cumsum(fr) / SR
    saw = sum(((ph * (1 + det)) % 1.0) * 2 - 1 for det in (-0.006, 0, 0.007)) / 3
    saw = svf(saw, 400 + 5000 * x ** 2, q=0.9)
    amp = x ** 2.2
    s = (n * 0.9 + saw * 0.45) * amp
    # slight stereo movement
    L = s * (0.85 + 0.15 * np.sin(2 * np.pi * 3 * t * x))
    R = s * (0.85 + 0.15 * np.cos(2 * np.pi * 3 * t * x))
    return np.vstack([fade(L, 0.05, 0.004), fade(R, 0.05, 0.004)])

def whoosh(d=0.5, pan_from=-1, pan_to=1, f_peak=2600, gain_curve=2.0):
    t = tt(d)
    x = t / d
    bell = np.sin(np.pi * x) ** gain_curve
    fc = 350 + f_peak * np.sin(np.pi * x ** 0.8) ** 2
    s = svf(noise(d), fc, q=1.4, mode='band') * bell
    p = pan_from + (pan_to - pan_from) * x
    a = (p + 1) * np.pi / 4
    return np.vstack([s * np.cos(a), s * np.sin(a)]) * 1.4

def reverse_swell(d=0.6, bright=4000):
    t = tt(d)
    s = filt(noise(d) + 0.4 * metallic(d), 'band', (300, bright)) * np.exp(-t * 4.5)
    s = s[::-1] * (t / d) ** 0.5
    return fade(s, 0.01, 0.003)

def metal_hit(f0=180, d=0.9):
    t = tt(d)
    parts = [(1, 1.0, 9), (2.76, 0.6, 13), (5.40, 0.4, 18), (8.93, 0.25, 25), (13.34, 0.15, 34)]
    s = sum(a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t * dc) for r, a, dc in parts)
    clk = filt(noise(d), 'high', 3000) * np.exp(-t * 300)
    return fade(np.tanh(1.8 * (s + clk)) * 0.8, 0.0003, 0.05)

def key_click(d=0.25):
    t = tt(d)
    clk = filt(noise(d), 'band', (2500, 9000)) * np.exp(-t * 900)
    clk2 = filt(noise(d), 'band', (1500, 6000)) * np.exp(-np.maximum(t - 0.035, 0) * 700) * (t >= 0.035) * 0.7
    thock = np.sin(2 * np.pi * 135 * t) * np.exp(-t * 35)
    return fade(clk + clk2 + thock * 0.9, 0.0002, 0.02)

def glitch(d=0.3, seed=1, base=600):
    g = np.random.default_rng(seed)
    t = tt(d)
    out = np.zeros_like(t)
    seg = int(SR * 0.0125)
    for i in range(0, len(t), seg):
        if g.random() < 0.72:
            f = base * 2 ** g.uniform(-1.5, 2)
            tt_ = t[i:i + seg] - t[i]
            kind = g.integers(3)
            if kind == 0:
                w = np.sign(np.sin(2 * np.pi * f * tt_))
            elif kind == 1:
                w = g.standard_normal(len(tt_))
            else:
                w = np.sin(2 * np.pi * f * tt_ * (1 + 6 * tt_))
            out[i:i + seg] = w * g.uniform(0.4, 1.0)
    out = np.round(out * 6) / 6  # bitcrush
    out = filt(out, 'band', (200, 9000))
    return fade(out * np.exp(-t * 3), 0.0005, 0.01)

def zap(d=0.35, f0=4200, f1=300):
    t = tt(d)
    fr = f1 + (f0 - f1) * np.exp(-t * 22)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    return fade(np.sin(ph) * np.exp(-t * 9), 0.0003, 0.02)

def shimmer_chime(fs, d=2.5):
    t = tt(d)
    s = np.zeros_like(t)
    for i, f in enumerate(fs):
        mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t * 3)
        s += np.sin(2 * np.pi * f * t + mod) * np.exp(-t * (2.0 + i * 0.4)) / len(fs)
    return fade(s, 0.002, 0.3)

def supersaw(freqs, d, cutoff=1400, attack=0.4, release=0.8, dets=(-0.011, -0.004, 0.0, 0.005, 0.012)):
    t = tt(d)
    L = np.zeros_like(t); R = np.zeros_like(t)
    for fi, f in enumerate(freqs):
        for j, det in enumerate(dets):
            ph = (f * (1 + det) * t + rng.random()) % 1.0
            w = ph * 2 - 1
            if j % 2 == 0: L += w
            else: R += w
            if det == 0: L += w * 0.5; R += w * 0.5
    norm = len(freqs) * len(dets) * 0.5
    env = np.minimum(1, t / attack) * np.minimum(1, (d - t) / release)
    L = filt(L / norm * env, 'low', cutoff); R = filt(R / norm * env, 'low', cutoff)
    return np.vstack([L, R])

def sub_drop(d=2.0, f0=95, f1=27):
    t = tt(d)
    fr = f1 + (f0 - f1) * np.exp(-t * 2.2)
    ph = 2 * np.pi * np.cumsum(fr) / SR
    s = np.sin(ph) + 0.2 * np.sin(2 * ph)
    return fade(np.tanh(1.8 * s) * np.exp(-t * 0.9), 0.002, 0.4)

def heartbeat(d=0.6):
    t = tt(d)
    def thump(off, amp):
        tt_ = np.maximum(t - off, 0)
        fr = 40 + 50 * np.exp(-tt_ * 30)
        ph = 2 * np.pi * np.cumsum(fr * (t >= off)) / SR
        return np.sin(ph) * np.exp(-tt_ * 14) * amp * (t >= off)
    return fade(np.tanh(2 * (thump(0, 1) + thump(0.16, 0.65))), 0.001, 0.05)

# ----------------------------------------------------------------- arrangement
melody = {0: 'F5', 2: 'F5', 3: 'Ab5', 5: 'F5', 6: 'C6', 8: 'Bb5', 10: 'Ab5', 11: 'G5', 12: 'F5', 14: 'Eb5',
          16: 'F5', 18: 'F5', 19: 'Ab5', 21: 'F5', 22: 'C6', 24: 'Db6', 26: 'C6', 27: 'Bb5', 28: 'Ab5', 30: 'G5'}
kickA, kickB = [0, 6, 10], [0, 3, 8, 10]
bassA = [(0, 6, 'F1', None), (6, 4, 'F1', None), (10, 6, 'Ab1', 'F1')]
bassB = [(0, 3, 'F1', None), (3, 5, 'F1', None), (8, 2, 'Db2', None), (10, 6, 'C2', 'F1')]

def add_kick(t, gain=1.0):
    place('drums', kick(), t, 0.95 * gain)
    events['kick'].append(t)

def add_snare(t, gain=1.0):
    place('drums', clap(), t, 0.62 * gain, pan=0.0, send=0.18)
    events['snare'].append(t)

def add_bass(t, dur, n1, n2=None, gain=1.0):
    f1 = note(n1)
    if n2 is None:
        fn = lambda tt_: np.full_like(tt_, f1)
    else:
        f2 = note(n2); gl = dur * 0.55
        fn = lambda tt_: np.where(tt_ < gl, f1, f1 * (f2 / f1) ** np.clip((tt_ - gl) / (dur - gl), 0, 1))
    place('bass', bass808(fn, dur + 0.05), t, 0.62 * gain)
    events['bass'].append(t)

def groove(n_from, n_to, intensity=1.0, cowbell_oct=1.0, hats=True, bass=True, kicks=True):
    """Lay the phonk groove for 16th indices [n_from, n_to) relative to the drop."""
    for n in range(n_from, n_to):
        t = step_t(n)
        bar = (n // 16) % 2
        s = n % 16
        if kicks and s in (kickA if bar == 0 else kickB):
            add_kick(t, 1.0)
        if s in (4, 12):
            add_snare(t, 1.0)
        if hats:
            acc = 1.0 if s % 4 == 0 else (0.7 if s % 2 == 0 else 0.45)
            if bar == 1 and s in (14, 15):  # 32nd rolls
                for k in range(2):
                    place('drums', hat(0.04), t + k * SIX / 2, 0.22 * intensity, pan=0.25)
            elif bar == 0 and s == 14:
                place('drums', hat(open_=True), t, 0.16 * intensity, pan=-0.2)
            else:
                place('drums', hat(), t, 0.26 * acc * intensity, pan=0.25 if s % 2 else -0.15)
            events['hat'].append(t)
        m = n % 32
        if m in melody:
            place('music', cowbell(note(melody[m]) * cowbell_oct), t, 0.30 * intensity, pan=0.12 * np.sin(n), send=0.25)
            events['cowbell'].append(t)
        if bass:
            for (st, ln, a, b) in (bassA if bar == 0 else bassB):
                if s == st:
                    add_bass(t, ln * SIX, a, b, intensity)

def impact(t, size=1.0, pan=0.0):
    place('sfx', boom(), t, 0.85 * size, pan=pan, long_send=0.35 * size)
    place('sfx', crash(), t, 0.30 * size, send=0.2)
    place('drums', kick(0.6, 200, 40, 3.0), t, 0.9 * size)
    events['impact'].append(t)

# ---- SCENE 1: awakening (0 – 2.1 s)
t = tt(2.3)
drone = (np.sin(2 * np.pi * note('F1') * t) * 0.5 + 0.35 * np.sin(2 * np.pi * note('F2') * 1.003 * t)) * np.minimum(1, t / 1.4) ** 2
rumble = filt(rng.standard_normal(len(t)), 'low', 140, 4) * (0.3 + 0.7 * np.minimum(1, t / 1.6))
air = filt(rng.standard_normal(len(t)), 'band', (2000, 9000)) * 0.05 * (t / 2.3)
place('music', np.tanh(1.5 * (drone + rumble * 0.8)) * 0.5 + air, 0.0, 0.8, long_send=0.3)
pad_in = supersaw([note('F3'), note('Ab3'), note('C4'), note('Eb4')], 2.2, cutoff=700, attack=1.6, release=0.3)
place('music', pad_in, 0.0, 0.16, long_send=0.4)
for tb in (F(30), F(54), F(78)):
    place('sfx', heartbeat(), tb, 0.55 + 0.15 * (tb > 1), long_send=0.15)
place('sfx', reverse_swell(0.75), F(H['logoReveal']) - 0.75, 0.5, long_send=0.2)
for k in range(8):  # tension ticks into the reveal
    place('sfx', hat(0.03, bright=1.0), 0.9 + k * SIX, 0.06 + 0.02 * k, pan=0.4 * (-1) ** k, send=0.3)
# logo reveal impact
place('sfx', boom(3.0, 100, 24, 1.2), F(H['logoReveal']), 0.75, long_send=0.5)
place('sfx', metal_hit(140, 1.2), F(H['logoReveal']), 0.25, long_send=0.4)
place('sfx', shimmer_chime([note('F5'), note('C6'), note('Ab6')], 2.0), F(H['logoReveal']) + 0.02, 0.18, long_send=0.6)
events['impact'].append(F(H['logoReveal']))

# ---- SCENE 2: buildup (2.1 – 4.5 s)
for k in range(-6, 0):
    add_kick(DROP + k * BEAT, 0.42 + 0.06 * (k + 6))
    place('bass', bass808(lambda x: np.full_like(x, note('F1')), 0.32), DROP + k * BEAT, 0.35)
place('sfx', riser(F(H['inhale']) - F(126) + 0.02), F(126), 0.36)
# filtered cowbell teaser opening up
teaser = np.zeros(int(SR * 1.5))
for n in range(-16, -2):
    m = n % 32
    if m in melody:
        cb = cowbell(note(melody[m]))
        i0 = int((n + 16) * SIX * SR)
        teaser[i0:i0 + len(cb)] += cb[:max(0, len(teaser) - i0)]
tx = np.arange(len(teaser)) / len(teaser)
teaser = svf(teaser, 500 + 7000 * tx ** 2, q=1.3)
place('music', teaser, step_t(-16), 0.30, send=0.3)
# snare roll: 8ths -> 16ths -> 32nds, crescendo
roll = [(-16 + 2 * i) for i in range(4)] + [(-8 + i) for i in range(4)] + [(-4 + 0.5 * i) for i in range(4)]
for i, n in enumerate(roll):
    place('drums', clap(0.2), step_t(n), 0.18 + 0.03 * i, send=0.2)
# text hits
place('sfx', boom(1.6, 90, 30, 2.5), F(H['textReal']), 0.55, long_send=0.3)
place('sfx', shimmer_chime([note('C6'), note('G6')], 1.2), F(H['textReal']), 0.1, send=0.5)
place('sfx', zap(0.4, 5200, 900), F(H['textPrecision']), 0.22, pan=0.3, send=0.3)
place('sfx', metal_hit(320, 0.5), F(H['textPrecision']), 0.25, send=0.3)
place('sfx', whoosh(0.45, 1, -1, 3200), F(H['textPerformance']) - 0.3, 0.55)
place('sfx', kick(0.4, 220, 60, 3), F(H['textPerformance']), 0.5)
# inhale -> drop
place('swell', reverse_swell(0.5, 7000), F(H['drop']) - 0.5, 0.75)
place('sfx', whoosh(0.22, -0.6, 0.6, 5000, 1.0), F(H['inhale']), 0.35)

# ---- SCENE 3/4: drop + execution (4.5 – 9.3 s), 3 bars of groove
groove(0, 48)
impact(DROP, 1.15)
place('sfx', glitch(0.18, 3, 900), DROP + 0.02, 0.10, pan=0.4)
place('sfx', whoosh(0.3, -1, 1, 2400), F(H['whipOut']) - 0.05, 0.6)
# feature-word hits
place('sfx', sub_drop(0.9, 110, 38), F(H['textUNC']), 0.55)
place('sfx', glitch(0.22, 11, 700), F(H['textUNC']), 0.14, pan=-0.3)
place('sfx', whoosh(0.32, 1, -1, 3800), F(H['textSUNC']) - 0.2, 0.6)
place('sfx', zap(0.3, 6500, 1400), F(H['textSUNC']), 0.14, pan=-0.4, send=0.2)
place('sfx', metal_hit(110, 1.2), F(H['textStability']), 0.42, long_send=0.3)
place('sfx', filt(noise(0.35), 'low', 220) * np.exp(-tt(0.35) * 6), F(H['textStability']), 0.45)
place('sfx', key_click(), F(H['textOneKey']), 0.55, send=0.2)
place('sfx', boom(1.2, 140, 45, 3.5, 2), F(H['textOneKey']) + 0.01, 0.4)
place('sfx', whoosh(0.32, -1, 1, 4200, 1.5), F(H['climaxEntry']) - 0.3, 0.7)
place('sfx', reverse_swell(0.3, 6000), F(H['climaxEntry']) - 0.3, 0.4)
for k in range(4):  # text accent ticks
    events['text'].append(F([H['textUNC'], H['textSUNC'], H['textStability'], H['textOneKey']][k]))

# ---- SCENE 5: climax (9.3 – 12.5 s)
n0 = int(round((F(H['climaxEntry']) - DROP) / SIX))          # 48
n_build = int(round((F(H['finalBuild']) - DROP) / SIX))       # 72
n_gap = int(round((F(H['finalInhale']) - DROP) / SIX))        # 78
groove(n0, n_build, intensity=1.1, cowbell_oct=1.0)
groove(n0, n_build, intensity=0.45, cowbell_oct=2.0, hats=False, bass=False, kicks=False)  # octave double
impact(F(H['climaxEntry']), 0.8)
lead = supersaw([note('F2'), note('C3'), note('F3')], F(H['inkImpact']) - F(H['climaxEntry']) + 0.1, cutoff=1800, attack=0.05, release=0.2)
place('music', lead, F(H['climaxEntry']), 0.22, send=0.2)
lead2 = supersaw([note('Db2'), note('Ab2'), note('F3')], F(H['finalBuild']) - F(H['inkImpact']) + 0.05, cutoff=2400, attack=0.03, release=0.1)
place('music', lead2, F(H['inkImpact']), 0.24, send=0.2)
# ink impact: anime stab
impact(F(H['inkImpact']), 1.0)
place('sfx', metal_hit(95, 1.6), F(H['inkImpact']), 0.35, long_send=0.4)
place('sfx', zap(0.6, 8000, 200), F(H['inkImpact']), 0.15, send=0.3)
# final build
for i in range(n_build, n_gap):
    add_kick(step_t(i), 0.75) if (i - n_build) % 2 == 0 else None
roll = [n_build + i for i in range(4)] + [n_build + 4 + 0.5 * i for i in range(4)]
for i, n in enumerate(roll):
    place('drums', clap(0.18), step_t(n), 0.2 + 0.05 * i, send=0.2)
for i in range(n_build, n_gap):
    place('drums', hat(), step_t(i), 0.25)
    place('drums', hat(), step_t(i + 0.5), 0.16)
place('bass', bass808(lambda x: note('F1') * 2 ** (x / 0.6 * 1.0), 0.6), step_t(n_build), 0.5)
place('sfx', riser(F(H['finalInhale']) - F(H['finalBuild']) + 0.01, 600, 11000, 220, 1760), F(H['finalBuild']), 0.5)
place('swell', reverse_swell(0.4, 8000), F(H['finalImpact']) - 0.4, 0.85)

# ---- SCENE 6: final reveal (12.5 – 15 s)
FI = F(H['finalImpact'])
impact(FI, 1.3)
place('sfx', sub_drop(2.4, 90, 26), FI, 0.75)
place('sfx', metal_hit(70, 2.0), FI, 0.3, long_send=0.6)
place('bass', bass808(lambda x: note('F1') * 2 ** (-np.clip(x - 0.3, 0, 2) / 1.6), 2.2, drive=2.2), FI, 0.5)
pad = supersaw([note('F3'), note('Ab3'), note('C4'), note('Eb4'), note('G4')], DUR - FI - 0.05, cutoff=1500, attack=0.5, release=1.4)
place('music', pad, FI + 0.05, 0.2, long_send=0.6)
# cowbell echo tail
for k, n in enumerate([0, 2, 3, 5, 6]):
    m = melody[n]
    place('music', cowbell(note(m)), FI + 0.1 + k * SIX, 0.16 * (0.75 ** k), pan=0.5 * (-1) ** k, long_send=0.6)
place('sfx', shimmer_chime([note('F5'), note('C6'), note('Eb6'), note('Ab6')], 1.6), F(H['textBeyond']), 0.16, long_send=0.7)
place('sfx', whoosh(0.5, -0.8, 0.8, 2000), F(H['textBeyond']) - 0.35, 0.3)

# ----------------------------------------------------------------- reverb + mix
def ir(seconds, damp_hz, predelay=0.012, seed=0):
    g = np.random.default_rng(seed)
    t = tt(seconds)
    env = np.exp(-t * 6.9 / seconds)
    L = filt(g.standard_normal(len(t)) * env, 'low', damp_hz)
    R = filt(g.standard_normal(len(t)) * env, 'low', damp_hz)
    pd = int(predelay * SR)
    L = np.concatenate([np.zeros(pd), L]); R = np.concatenate([np.zeros(pd), R])
    return L / np.sqrt(np.sum(L ** 2)), R / np.sqrt(np.sum(R ** 2))

def convolve(st, irLR):
    return np.vstack([signal.fftconvolve(st[0], irLR[0])[:N], signal.fftconvolve(st[1], irLR[1])[:N]])

verb_short = convolve(buses['verb_send'], ir(1.1, 6000, 0.01, 1)) * 0.9
verb_long = convolve(buses['verb_send_long'], ir(3.2, 4200, 0.03, 2)) * 0.9

# sidechain: duck bass/music under kicks
duck = np.ones(N)
for kt in events['kick']:
    i0 = int(kt * SR); L = int(0.18 * SR)
    if i0 >= N: continue
    e = 1 - 0.55 * np.exp(-np.arange(L) / SR * 22)
    duck[i0:i0 + L] = np.minimum(duck[i0:i0 + L], e[:max(0, min(L, N - i0))])
duck = filt(duck, 'low', 60)

# pre-drop "inhale" gaps: everything except the reverse swells drops out
gap = np.ones(N)
for g0, g1 in ((H['inhale'] + 2, H['drop']), (H['finalInhale'] + 2, H['finalImpact'])):
    a, b = int(F(g0) * SR), int(F(g1) * SR) - int(0.004 * SR)
    gap[a:b] = 0.06
gap = filt(gap, 'low', 90)  # ~ few ms smoothing
gap = np.clip(gap, 0, 1)
mix = ((buses['drums'] * 1.0 + buses['bass'] * duck * 0.8 + buses['music'] * duck * 0.9 + buses['sfx'] * 0.85
        + verb_short * 0.5 + verb_long * 0.28) * gap + buses['swell'] * 0.9) * 0.42
mix = np.vstack([filt(mix[0], 'high', 24, 2), filt(mix[1], 'high', 24, 2)])

# glue: gentle bus saturation + brickwall-ish limiter
mix = np.tanh(mix * 1.1) / 1.1
peak_env = np.max(np.abs(mix), axis=0)
ceiling = 10 ** (-1.6 / 20)
gain = np.minimum(1.0, ceiling / np.maximum(peak_env, 1e-9))
# lookahead min-filter + smooth release
look = int(0.003 * SR)
from scipy.ndimage import minimum_filter1d
gain = minimum_filter1d(gain, size=2 * look + 1)
gain = signal.lfilter([1 - 0.9993], [1, -0.9993], gain - 1) + 1
gain = np.minimum(gain, minimum_filter1d(np.minimum(1.0, ceiling / np.maximum(peak_env, 1e-9)), size=2 * look + 1))
mix = mix * gain
# global fades: start from silence, end at exact silence
fi = int(0.02 * SR); fo = int(0.9 * SR)
mix[:, :fi] *= np.linspace(0, 1, fi)
mix[:, -fo:] *= np.linspace(1, 0, fo) ** 2
peak = np.max(np.abs(mix))
mix = mix / peak * ceiling
print(f'peak after limiter (pre-normalize): {20*np.log10(peak):.2f} dBFS, final peak {20*np.log10(np.max(np.abs(mix))):.2f} dBFS')
rms = np.sqrt(np.mean(mix ** 2)); print(f'rms {20*np.log10(rms):.2f} dBFS')

os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
pcm = np.clip(mix.T, -1, 1)
pcm24 = (pcm * (2 ** 23 - 1)).astype(np.int32)
import wave
with wave.open(os.path.join(ROOT, 'build/audio.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(3); w.setframerate(SR)
    b = pcm24.astype('<i4').tobytes()
    b = b''.join(b[i:i + 3] for i in range(0, len(b), 4))
    w.writeframes(b)

ev = {k: sorted(set(int(round(t * FPS)) for t in v if 0 <= t < DUR)) for k, v in events.items()}
json.dump(ev, open(os.path.join(ROOT, 'src/audio_events.json'), 'w'))
print({k: len(v) for k, v in ev.items()})
print('wrote build/audio.wav')
