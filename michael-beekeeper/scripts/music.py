#!/usr/bin/env python3
"""Original soundtrack for "Michael": a gentle Slovenian-style waltz with a
musette accordion, music box, guitar oom-pah-pah, strings, church bells and a
hum of bees. Synthesised from scratch with numpy: no samples, nothing downloaded.

90 BPM in 3/4 -> one bar = 2 s = 60 video frames; 48 bars = 96 s (the video length).
Usage: python3 scripts/music.py  ->  public/music.wav
"""
import pathlib
import wave

import numpy as np

SR = 44100
BEAT = 60 / 90
BAR = 3 * BEAT
BARS = 48
N = int((BARS * BAR + 4) * SR)  # + reverb tail, trimmed at the end
rng = np.random.default_rng(1945)


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def add(buf, sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    j = min(i + len(sig), N)
    if j <= i:
        return
    a = (pan + 1) * np.pi / 4
    buf[0, i:j] += sig[: j - i] * np.cos(a) * gain
    buf[1, i:j] += sig[: j - i] * np.sin(a) * gain


def accordion(m, dur):
    """Three reeds, the outer two detuned (musette tuning, the folk-accordion sound)."""
    n = int((dur + 0.15) * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for cents in (-9, 0, 9):
        f = hz(m) * 2 ** (cents / 1200)
        for h in range(1, 11):
            if f * h > 8000:
                break
            sig += (1.2 if h % 2 else 0.75) / h ** 1.15 * np.sin(2 * np.pi * f * h * t + cents * h)
    e = np.clip(t / 0.045, 0, 1) * np.clip((dur + 0.15 - t) / 0.15, 0, 1)
    return sig * e * (1 + 0.05 * np.sin(2 * np.pi * 5.2 * t)) * 0.09


def musicbox(m, dur=2.4):
    t = np.arange(int(dur * SR)) / SR
    f = hz(m)
    sig = (np.sin(2 * np.pi * f * t) * np.exp(-t * 2.0)
           + 0.3 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 7)
           + 0.12 * np.sin(2 * np.pi * f * 6.8 * t) * np.exp(-t * 11))
    return sig * np.clip(t / 0.003, 0, 1) * np.clip((dur - t) / 0.3, 0, 1)


def pluck(m, dur=1.4, decay=0.996):
    """Karplus-Strong string, computed one period-block at a time."""
    p = int(round(SR / hz(m)))
    n = int(dur * SR)
    y = np.zeros(n)
    exc = rng.uniform(-1, 1, p + 1)
    y[: p + 1] = np.convolve(exc, np.hanning(14) / 7, 'same')  # softer, nylon-ish attack
    k = p + 1
    while k < n:
        e = min(k + p, n)
        y[k:e] = decay * 0.5 * (y[k - p:e - p] + y[k - p - 1:e - p - 1])
        k = e
    t = np.arange(n) / SR
    return y * np.clip(t / 0.004, 0, 1) * np.clip((dur - t) / 0.2, 0, 1)


def saw_pad(notes, dur):
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for m in notes:
        for cents in (-6, 6):
            f = hz(m) * 2 ** (cents / 1200)
            sig += 2 * ((f * t + rng.random()) % 1) - 1
    e = np.clip(t / 0.9, 0, 1) * np.clip((dur + 1.2 - t) / 1.2, 0, 1)
    return sig * e / len(notes)


def bell(m, dur=6.0):
    t = np.arange(int(dur * SR)) / SR
    f = hz(m)
    parts = [(0.5, 1.0, 0.9), (1, 0.8, 1.4), (1.19, 0.55, 2.0), (1.56, 0.45, 2.6),
             (2, 0.5, 3.0), (2.74, 0.25, 4.2), (3, 0.2, 4.8), (4.07, 0.12, 6.0)]
    return sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in parts) * np.clip(t / 0.004, 0, 1)


def smooth_noise(n, rate):
    pts = rng.standard_normal(int(n / SR * rate) + 2)
    return np.interp(np.arange(n) / SR * rate, np.arange(len(pts)), pts)


def buzz(dur, base):
    n = int(dur * SR)
    f = base + 12 * smooth_noise(n, 2) + 6 * np.sin(2 * np.pi * 3.3 * np.arange(n) / SR)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = sum(np.sin(h * ph) / h for h in range(1, 14))
    return sig * (0.55 + 0.45 * np.tanh(smooth_noise(n, 1.5)))


def lowpass(x, cutoff):
    spec = np.fft.rfft(x, axis=-1)
    freqs = np.fft.rfftfreq(x.shape[-1], 1 / SR)
    spec *= 1 / (1 + (freqs / cutoff) ** 4)
    return np.fft.irfft(spec, n=x.shape[-1], axis=-1)


# ---------------------------------------------------------------- the score
BASS = {'G': 43, 'Em': 40, 'C': 48, 'D': 38, 'D7': 38, 'Am': 45}
CHORD = {'G': [59, 62, 67], 'Em': [59, 64, 67], 'C': [60, 64, 67], 'D': [57, 62, 66],
         'D7': [57, 60, 66], 'Am': [57, 60, 64]}
A_CH = ['G', 'Em', 'C', 'D', 'G', 'Em', 'D7', 'G']
B_CH = ['C', 'G', 'Am', 'D', 'C', 'G', 'D', 'G']
A_MEL = [[(74, 2), (71, 1)], [(76, 1), (74, 1), (71, 1)], [(72, 2), (76, 1)], [(74, 3)],
         [(71, 1), (74, 1), (79, 1)], [(79, 1.5), (78, 0.5), (76, 1)], [(72, 1), (71, 1), (69, 1)], [(67, 3)]]
B_MEL = [[(76, 2), (79, 1)], [(74, 2), (71, 1)], [(72, 1), (71, 1), (69, 1)], [(66, 1), (69, 1), (74, 1)],
         [(76, 1), (79, 1), (76, 1)], [(74, 2), (71, 1)], [(69, 1.5), (71, 0.5), (72, 1)], [(71, 2), (67, 1)]]

# per bar: chord, melody, lead instrument, and layer levels (scenes are noted on the right)
bars = []
for c in ['G', 'Em', 'C', 'D']:                                             # 0-8 s   title
    bars.append(dict(ch=c, mel=None, lead=None, arp=1, pad=0.7))
for c, m in zip(A_CH, A_MEL):                                                # 8-24 s  birth, dedek's bees
    bars.append(dict(ch=c, mel=m, lead='box', pah=0.45, bass=0.6, pad=0.5))
for c, m in zip(B_CH, B_MEL):                                                # 24-40 s Bled, wedding
    bars.append(dict(ch=c, mel=m, lead='acc', pah=1, bass=1, pad=0.35))
for i, (c, m) in enumerate(zip(A_CH, A_MEL)):                               # 40-56 s own bee house, 1991
    bars.append(dict(ch=c, mel=m, lead='acc', pah=1, bass=1, pad=1.0 if i >= 6 else 0.6, box8=i >= 6))
for c, m in zip(B_CH, B_MEL):                                                # 56-72 s freedom, grandkids
    bars.append(dict(ch=c, mel=m, lead='acc', pah=1, bass=1, pad=0.9, box8=True))
bars.append(dict(ch='C', mel=[(76, 3)], lead='acc', pah=0.8, bass=0.8, pad=0.8))       # 72-76 s World Bee Day
bars.append(dict(ch='D', mel=[(74, 2), (78, 1)], lead='acc', pah=0.6, bass=0.7, pad=0.7))
for c, m in zip(A_CH, A_MEL):                                                # 76-92 s last autumn
    bars.append(dict(ch=c, mel=m, lead='box', bass=0.35, pad=0.55))
bars.append(dict(ch='C', mel=[(76, 2), (72, 1)], lead='box', pad=0.6))                   # 92-96 s outro
bars.append(dict(ch='G', mel=[(79, 3)], lead='box', pad=0.6, bass=0.4))
assert len(bars) == BARS

mel_st = np.zeros((2, N))
box_st = np.zeros((2, N))
pah_st = np.zeros((2, N))
pad_st = np.zeros((2, N))
fx_st = np.zeros((2, N))

for b, bar in enumerate(bars):
    t0 = b * BAR
    ch = CHORD[bar['ch']]
    if bar.get('bass'):
        add(pah_st, pluck(BASS[bar['ch']], 1.8, 0.997), t0, -0.1, bar['bass'] * 1.3)
    if bar.get('pah'):
        for beat in (1, 2):
            for k, m in enumerate(ch):
                add(pah_st, pluck(m, 0.9, 0.993), t0 + beat * BEAT + k * 0.012, 0.25, bar['pah'] * 0.42)
    if bar.get('pad'):
        add(pad_st, saw_pad([m - 12 for m in ch] + [BASS[bar['ch']] + 12], BAR), t0, 0, bar['pad'])
    if bar.get('arp'):
        for k, m in enumerate(ch + [ch[1] + 12, ch[2] + 12, ch[0] + 12]):
            add(box_st, musicbox(m + 12, 2.0), t0 + k * BEAT / 2, (k % 3 - 1) * 0.4, 0.45)
    if bar['mel']:
        t = t0
        for k, (m, beats) in enumerate(bar['mel']):
            if bar['lead'] == 'acc':
                add(mel_st, accordion(m, beats * BEAT * 0.94), t, -0.15)
            else:
                add(box_st, musicbox(m + 12), t, 0.1, 0.8)
            if bar.get('box8') and k == 0:
                add(box_st, musicbox(m + 24, 1.6), t, 0.35, 0.35)
            t += beats * BEAT

for t in (34.0, 35.0, 36.0, 37.0):          # wedding bells
    add(fx_st, bell(67), t, -0.5, 0.22)
add(fx_st, bell(55, 8.0), 84.0, 0.4, 0.16)  # one distant bell for Michael

for start, end in ((16, 26), (42, 52), (68, 76), (86, 96)):  # bees at the hives
    for base, pan in ((205, -0.6), (238, 0.5), (262, 0.0)):
        sig = buzz(end - start, base)
        sig *= np.clip(np.minimum(np.arange(len(sig)), len(sig) - np.arange(len(sig))) / (1.2 * SR), 0, 1)
        add(fx_st, sig, start, pan, 0.012)

pad_st = lowpass(pad_st, 1800)
mix = mel_st * 1.0 + box_st * 0.22 + pah_st * 0.55 + pad_st * 0.05 + fx_st

# reverb: convolution with decaying, decorrelated noise (a small wooden church)
ir_len = int(2.4 * SR)
tir = np.arange(ir_len) / SR
ir = rng.standard_normal((2, ir_len)) * np.exp(-tir * 2.9)
ir = lowpass(ir, 5000)
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
L = 1 << int(np.ceil(np.log2(N + ir_len)))
wet = np.fft.irfft(np.fft.rfft(mix, L, axis=1) * np.fft.rfft(ir, L, axis=1), L, axis=1)[:, :N]
out = mix * 0.82 + wet * 0.3

total = int(BARS * BAR * SR)
out = out[:, :total]
fade_in, fade_out = int(0.4 * SR), int(5.0 * SR)
out[:, :fade_in] *= np.linspace(0, 1, fade_in)
out[:, -fade_out:] *= np.linspace(1, 0, fade_out) ** 1.5
out = np.tanh(out / np.abs(out).max() * 1.15) / np.tanh(1.15) * 0.89

path = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'music.wav'
with wave.open(str(path), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out.T * 32767).astype('<i2').tobytes())
assert abs(out.shape[1] / SR - BARS * BAR) < 0.01
print(f'{path}  {out.shape[1] / SR:.1f} s')
