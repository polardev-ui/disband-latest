#!/usr/bin/env python3
"""Soundtrack and sound design for the Disband commercial.

Everything is synthesised here — no samples — and every effect is placed from
build/timeline.json, the same timing the picture uses, so the clicks land on
the frames they belong to. Music is 120 BPM from t=0; the scene boundaries
and hits (logo click, counter stop, final logo) sit on that grid.

    python3 tools/audio.py            -> build/audio/mix.wav (48 kHz stereo, float)
"""
import json
import os

import numpy as np
from scipy import signal

SR = 48000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(os.path.join(ROOT, "build", "timeline.json")))
T = TL["T"]
DUR = TL["DURATION"]
BEAT = 60.0 / TL["BPM"]
N = int(round(DUR * SR))
rng = np.random.default_rng(20260927)


# --------------------------------------------------------------------------
# Building blocks

def tt(n):
    return np.arange(n) / SR


def secs(d):
    return int(round(d * SR))


def noise(n):
    return rng.standard_normal(n)


def sos(kind, f, order=2):
    return signal.butter(order, f, kind, fs=SR, output="sos")


def lp(x, f, order=2):
    return signal.sosfilt(sos("lowpass", min(f, SR * 0.45), order), x, axis=0)


def hp(x, f, order=2):
    return signal.sosfilt(sos("highpass", f, order), x, axis=0)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(sos("bandpass", [lo, min(hi, SR * 0.45)], order), x, axis=0)


def osc_sine(freq, n, phase=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return np.sin(phase + 2 * np.pi * np.cumsum(f) / SR)


def osc_saw(freq, n, phase=0.0):
    """Band-limited (PolyBLEP) sawtooth."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    ph = (phase + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    a = ph < dt
    x = ph[a] / dt[a]
    y[a] -= x + x - x * x - 1
    b = ph > 1 - dt
    x = (ph[b] - 1) / dt[b]
    y[b] -= x * x + x + x + 1
    return y


def sweep_lp(x, cutoff):
    """Time-varying low-pass: blend of a bank of fixed filters (cheap, smooth)."""
    bank_f = np.geomspace(150, 16000, 14)
    bank = [lp(x, f) for f in bank_f]
    pos = np.interp(np.log(np.clip(cutoff, bank_f[0], bank_f[-1])), np.log(bank_f), np.arange(len(bank_f)))
    i = np.clip(np.floor(pos).astype(int), 0, len(bank_f) - 2)
    w = pos - i
    stacked = np.stack(bank)
    idx = np.arange(len(x))
    return stacked[i, idx] * (1 - w) + stacked[i + 1, idx] * w


def pan(x, p):
    """Equal-power pan; p may vary over time (-1 left … 1 right)."""
    th = (np.asarray(p) + 1) * np.pi / 4
    return np.stack([x * np.cos(th), x * np.sin(th)], axis=1)


def db(v):
    return 10 ** (v / 20)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def hz(name):
    """'F#4' -> frequency."""
    pitch, octave = name[:-1], int(name[-1])
    return midi(12 * (octave + 1) + NOTE[pitch])


class Bus:
    def __init__(self):
        self.x = np.zeros((N + secs(6), 2))

    def add(self, sig, at, gain=1.0, p=0.0):
        if sig.ndim == 1:
            sig = pan(sig, p)
        i = secs(at)
        if i < 0:
            sig, i = sig[-i:], 0
        end = min(i + len(sig), len(self.x))
        self.x[i:end] += sig[: end - i] * gain


def reverb_ir(rt=2.4, pre=0.018, bright=1.0, seed=7):
    r = np.random.default_rng(seed)
    n = secs(rt * 1.3)
    t = tt(n)
    out = np.zeros((n, 2))
    for lo, hi, k in [(40, 350, 1.0), (350, 1600, 0.85), (1600, 5500, 0.62 * bright), (5500, 15000, 0.34 * bright)]:
        env = 10 ** (-3 * t / (rt * k))
        for ch in range(2):
            out[:, ch] += bp(r.standard_normal(n), lo, hi) * env
    out[: secs(0.004)] *= np.linspace(0, 1, secs(0.004))[:, None]
    out /= np.sqrt(np.sum(out ** 2) / 2)
    return np.concatenate([np.zeros((secs(pre), 2)), out])


def convolve(x, ir):
    y = np.zeros((len(x) + len(ir) - 1, 2))
    for ch in range(2):
        y[:, ch] = signal.fftconvolve(x[:, ch], ir[:, ch])
    return y[: len(x)]


# --------------------------------------------------------------------------
# Instruments

def kick(vel=1.0):
    n = secs(0.5)
    t = tt(n)
    f = 52 + 95 * np.exp(-t / 0.03)
    body = osc_sine(f, n) * np.exp(-t / 0.13)
    click = hp(noise(n), 1800) * np.exp(-t / 0.0035) * 0.18
    y = np.tanh(1.6 * (body + click))
    return lp(y, 4200) * vel


def clap(vel=1.0):
    n = secs(0.4)
    t = tt(n)
    env = np.zeros(n)
    for k, d in enumerate([0.0, 0.009, 0.019]):
        env += (t >= d) * np.exp(-np.maximum(t - d, 0) / 0.0045) * (0.8 + 0.1 * k)
    env += np.exp(-t / 0.085) * 0.45
    return bp(noise(n), 950, 5200) * env * vel


def hat(vel=1.0, open_=False):
    n = secs(0.25 if open_ else 0.08)
    t = tt(n)
    return hp(noise(n), 7500, 3) * np.exp(-t / (0.07 if open_ else 0.016)) * vel


def shaker(vel=1.0):
    n = secs(0.09)
    t = tt(n)
    env = (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.03)
    return bp(noise(n), 4000, 11000) * env * vel


def bass_note(f, dur, vel=1.0):
    n = secs(dur + 0.08)
    t = tt(n)
    env = np.minimum(1, t / 0.004) * (0.55 + 0.45 * np.exp(-t / 0.09)) * np.clip((dur + 0.06 - t) / 0.06, 0, 1)
    sub = osc_sine(f, n)
    grit = sweep_lp(osc_saw(f, n), 380 + 900 * np.exp(-t / 0.07))
    return np.tanh(1.2 * (0.8 * sub + 0.5 * grit)) * env * vel


def pad_chord(notes, dur, attack=0.9, release=1.8, cutoff=1900, width=0.7, seed=0):
    r = np.random.default_rng(seed)
    n = secs(dur + release)
    t = tt(n)
    out = np.zeros((n, 2))
    for j, f in enumerate(notes):
        for k, cents in enumerate([-11, -4, 0, 5, 12]):
            v = osc_saw(f * 2 ** (cents / 1200), n, phase=r.random())
            p = width * np.sin(1.3 * j + 2.1 * k)
            out += pan(v, p) * (1.0 / 5)
    env = np.minimum(1, t / attack) ** 1.6 * np.clip((dur + release - t) / release, 0, 1) ** 1.3
    out = lp(out, cutoff, 2) * env[:, None]
    # Slow breathing tremolo keeps the sustain alive.
    out *= (0.92 + 0.08 * np.sin(2 * np.pi * 0.23 * t))[:, None]
    return out / max(1, len(notes)) * 1.6


def pluck(f, dur=1.1, bright=1.0, vel=1.0):
    n = secs(dur)
    t = tt(n)
    y = np.zeros(n)
    for k in range(1, 11):
        inh = 1 + 0.00035 * k * k
        y += (1 / k ** 1.15) * np.sin(2 * np.pi * f * k * inh * t) * np.exp(-t * (2.6 + 2.4 * k / bright))
    y *= np.minimum(1, t / 0.0025)
    return y * vel * 0.5


def bell(f, dur=3.2, vel=1.0):
    n = secs(dur)
    t = tt(n)
    y = np.zeros(n)
    for ratio, amp, dec in [(1, 1, 1.9), (2.0, 0.42, 1.2), (2.76, 0.28, 0.85), (4.07, 0.16, 0.55), (5.43, 0.09, 0.4), (6.8, 0.05, 0.3)]:
        y += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / dec)
    return y * np.minimum(1, t / 0.003) * vel * 0.35


def boom(vel=1.0, dur=2.2, f0=58, f1=36):
    n = secs(dur)
    t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.18)
    y = osc_sine(f, n) * np.exp(-t / 0.75) * np.minimum(1, t / 0.006)
    thump = lp(noise(n), 180) * np.exp(-t / 0.06) * 0.8
    return np.tanh(1.3 * (y + thump)) * vel


def riser(dur, f_lo=300, f_hi=9000, vel=1.0, curve=2.2):
    n = secs(dur)
    t = tt(n) / dur
    x = noise(n)
    cut = f_lo * (f_hi / f_lo) ** (t ** curve)
    y = hp(sweep_lp(x, cut), 120)
    env = t ** 1.8
    tone = osc_sine(220 * 2 ** (2 * t ** curve), n) * 0.12
    return (y + tone) * env * vel


def whoosh(dur=0.5, f_lo=500, f_peak=4200, peak_at=0.55, vel=1.0, p0=-0.5, p1=0.5):
    n = secs(dur)
    t = tt(n) / dur
    shape = np.where(t < peak_at, (t / peak_at) ** 2, ((1 - t) / (1 - peak_at)) ** 1.6)
    cut = f_lo + (f_peak - f_lo) * shape
    y = hp(sweep_lp(noise(n), cut), 160) * shape ** 1.2
    return pan(y * vel, p0 + (p1 - p0) * t)


# --------------------------------------------------------------------------
# Sound effects

def mech_click(vel=1.0, pitch=1.0):
    """A precise, slightly weighty latch: transient, body, and a second catch."""
    n = secs(0.12)
    t = tt(n)
    snap = bp(noise(n), 2200, 9000) * np.exp(-t / 0.0022)
    body = (np.sin(2 * np.pi * 185 * pitch * t) * np.exp(-t / 0.022)
            + 0.6 * np.sin(2 * np.pi * 540 * pitch * t) * np.exp(-t / 0.011)
            + 0.3 * np.sin(2 * np.pi * 1730 * pitch * t) * np.exp(-t / 0.006))
    y = snap * 0.9 + body * 0.55
    catch = np.zeros(n)
    d = secs(0.017)
    catch[d:] = (bp(noise(n - d), 3000, 8000) * np.exp(-tt(n - d) / 0.0015)) * 0.35
    return (y + catch) * vel


def shutter(vel=1.0, pitch=1.0, seed=0):
    """Camera shutter: curtain open and close ~40 ms apart, with a mechanical ring."""
    r = np.random.default_rng(seed)
    n = secs(0.16)
    out = np.zeros(n)
    for k, (d, g) in enumerate([(0.0, 1.0), (0.042, 0.8)]):
        i = secs(d)
        m = n - i
        t = tt(m)
        nz = bp(r.standard_normal(m), 1500 * pitch, 7000) * np.exp(-t / 0.004)
        ring = (np.sin(2 * np.pi * 1120 * pitch * t) * np.exp(-t / 0.009) * 0.5
                + np.sin(2 * np.pi * 2390 * pitch * t) * np.exp(-t / 0.005) * 0.3)
        thock = np.sin(2 * np.pi * 92 * t) * np.exp(-t / 0.018) * (0.7 if k == 0 else 0.3)
        out[i:] += (nz + ring + thock) * g
    return out * vel


def counter_click(vel=1.0):
    """Muffled mechanical counter tick."""
    n = secs(0.03)
    t = tt(n)
    y = bp(noise(n), 500, 2400) * np.exp(-t / 0.0025) + 0.5 * np.sin(2 * np.pi * 720 * t) * np.exp(-t / 0.005)
    return lp(y, 1600) * vel


def ui_tick(vel=1.0, f=2600):
    n = secs(0.05)
    t = tt(n)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006) * 0.6 + hp(noise(n), 5000) * np.exp(-t / 0.0015) * 0.4) * vel


def key_tap(vel=1.0, seed=0):
    r = np.random.default_rng(seed)
    n = secs(0.05)
    t = tt(n)
    f = 1650 * (1 + 0.06 * (r.random() - 0.5))
    return (bp(r.standard_normal(n), 1200, 4800) * np.exp(-t / 0.004) + 0.35 * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006)) * vel


def pop(vel=1.0):
    """Soft two-note arrival chime."""
    n = secs(0.6)
    t = tt(n)
    a = np.sin(2 * np.pi * hz("A5") * t) * np.exp(-t / 0.12) * np.minimum(1, t / 0.004)
    d = secs(0.075)
    b = np.zeros(n)
    b[d:] = np.sin(2 * np.pi * hz("E6") * tt(n - d)) * np.exp(-tt(n - d) / 0.2) * np.minimum(1, tt(n - d) / 0.004)
    return (a * 0.55 + b * 0.6) * vel


# --------------------------------------------------------------------------
# Arrangement

music, drums, sfx, verb_send = Bus(), Bus(), Bus(), Bus()

CHORDS = {
    "Dmaj9": ["D3", "A3", "C#4", "E4", "F#4"],
    "Bm9": ["B2", "F#3", "A3", "C#4", "D4"],
    "Gmaj9": ["G2", "D3", "F#3", "A3", "B3"],
    "A6sus": ["A2", "E3", "F#3", "B3", "D4"],
    "A": ["A2", "E3", "A3", "C#4", "E4"],
}
ROOTS = {"Dmaj9": "D2", "Bm9": "B1", "Gmaj9": "G1", "A6sus": "A1", "A": "A1"}
# (start, end, chord)
PLAN = [
    (4.0, 8.0, "Dmaj9"), (8.0, 12.0, "Bm9"), (12.0, 16.0, "Gmaj9"), (16.0, 20.0, "A6sus"),
    (20.0, 24.0, "Dmaj9"), (24.0, 26.0, "Bm9"), (26.0, 27.0, "Gmaj9"), (27.0, 29.5, "A6sus"),
]

# Intro: a low D bed under the logo, felt more than heard.
n = secs(4.4)
t = tt(n)
drone = (osc_sine(hz("D1"), n) + 0.35 * osc_sine(hz("D2"), n) + 0.12 * lp(osc_saw(hz("A2"), n), 500))
drone *= np.clip(t / 2.2, 0, 1) ** 2 * np.clip((4.4 - t) / 0.9, 0, 1)
music.add(drone, 0.2, db(-30))
air = hp(lp(noise(secs(4.0)), 3000), 400) * np.clip(tt(secs(4.0)) / 3.5, 0, 1) ** 2
music.add(pan(air, 0.0) * 0.5 + pan(np.roll(air, 900), 0.0) * 0.5, 0.0, db(-46))

# Pads
for i, (a, b, name) in enumerate(PLAN):
    level = -16.5 if a < 8 else (-19 if a < 12 else -21)
    cutoff = 1300 if a < 8 else 2100
    ch = pad_chord([hz(x) for x in CHORDS[name]], b - a, attack=0.9 if a == 4.0 else 0.35, release=1.2, cutoff=cutoff, seed=i)
    music.add(ch, a, db(level))
    verb_send.add(ch, a, db(level - 6))

# Arpeggio: 8ths from scene 2, opening up with the groove.
def arp_notes(name):
    notes = CHORDS[name]
    seq = [notes[1], notes[2], notes[3], notes[4], notes[3], notes[2]]
    return [hz(x) * 2 for x in seq]

for a, b, name in PLAN:
    seq = arp_notes(name)
    k = 0
    tpos = a
    while tpos < b - 1e-6:
        if tpos >= 4.25:
            groove = tpos >= 12.0
            bright = 1.4 if groove else 0.8
            vel = (0.9 if k % 2 == 0 else 0.62) * (1.0 if groove else 0.7)
            if 18.45 <= tpos < 20.0:
                vel *= 0.75
            x = pluck(seq[k % len(seq)], 0.9, bright, vel)
            p = 0.35 * np.sin(k * 1.7)
            music.add(x, tpos, db(-25), p)
            verb_send.add(x, tpos, db(-24), p)
        k += 1
        tpos += BEAT / 2

# Counter build: riser into the stop, a hit on the stop itself.
music.add(pan(riser(T["countEnd"] - T["countStart"] + 0.15, 500, 11000, 1.0), 0.0), T["countStart"] - 0.15, db(-32))
hit = boom(1.0, 2.6)
music.add(hit, T["countEnd"], db(-14))
stab = sum(pluck(hz(x) * 2, 1.6, 1.8, 0.8) for x in CHORDS["Bm9"][1:])
music.add(stab, T["countEnd"], db(-18))
verb_send.add(stab, T["countEnd"], db(-12))

# Drums: a light pulse from 9.0, the full groove from 12.0, out at 28.5.
def drum_pattern(start, end, full):
    b = start
    i = 0
    while b < end - 1e-6:
        beat_in_bar = i % 4
        if full:
            if beat_in_bar in (0, 2) and not (18.45 <= b < 19.45):
                drums.add(kick(1.0), b, db(-12))
            if beat_in_bar in (1, 3):
                c = clap(0.9)
                drums.add(c, b, db(-25.5))
                verb_send.add(c, b, db(-20))
        for s16 in range(4):
            ts = b + s16 * BEAT / 4
            if ts >= end:
                break
            if full or s16 % 2 == 0:
                v = [0.9, 0.35, 0.6, 0.35][s16]
                drums.add(hat(v), ts, db(-31 if full else -34), 0.25)
                if full and s16 in (1, 3):
                    drums.add(shaker(0.8), ts, db(-35), -0.3)
        b += BEAT
        i += 1

drum_pattern(9.0, 12.0, False)
drum_pattern(12.0, 28.5, True)
for bt in np.arange(10.0, 12.0, 1.0):
    drums.add(kick(0.55), bt, db(-17))

# Bass: 8th-note root pulse under the groove.
for a, b, name in PLAN:
    if b <= 12.0:
        continue
    root = hz(ROOTS[name])
    tpos = max(a, 12.0)
    k = 0
    while tpos < min(b, 28.5) - 1e-6:
        vel = 1.0 if k % 2 == 0 else 0.7
        music.add(bass_note(root, BEAT / 2 * 0.92, vel), tpos, db(-17.5))
        tpos += BEAT / 2
        k += 1

# Finale: breakdown, a lift into the logo, the resolving chord, and a small
# melody on the reveals.
music.add(pan(riser(1.0, 400, 9000, 1.0, 2.8), 0.0), T["endLogoLand"] - 1.0, db(-28))
music.add(boom(0.9, 3.4, 52, 34), T["endLogoLand"], db(-15))
final = pad_chord([hz(x) for x in ["D3", "A3", "C#4", "E4", "F#4", "A4"]], DUR - T["endLogoLand"] - 1.4, attack=0.25, release=1.6, cutoff=2600, width=0.85, seed=99)
music.add(final, T["endLogoLand"], db(-17))
verb_send.add(final, T["endLogoLand"], db(-12))
sub_final = osc_sine(hz("D1"), secs(8)) * np.exp(-tt(secs(8)) / 3.5) * np.minimum(1, tt(secs(8)) / 0.05)
music.add(sub_final, T["endLogoLand"], db(-20))
# Bridge between the groove and the finale: the last chord rings out.
bridge = pad_chord([hz(x) for x in CHORDS["A6sus"]], 1.0, attack=0.1, release=1.0, cutoff=1500, seed=41)
music.add(bridge, 28.5, db(-22))
for at, note, v in [(T["endTitle"], "D5", 0.9), (T["endSlogan"], "A5", 0.75), (T["endUrl"], "F#5", 0.6), (T["endCta"], "E5", 0.8), (T["endCta"] + 0.5, "D5", 0.7)]:
    x = bell(hz(note), 3.2, v)
    music.add(x, at, db(-24), 0.15)
    verb_send.add(x, at, db(-16), 0.15)
shimmer = sum(bell(hz(x), 4.0, 0.5) for x in ["F#6", "A6", "C#7"])
verb_send.add(shimmer, T["endLogoLand"], db(-23))

# --------------------------------------------------------------------------
# Sound design, placed from the timeline

# Scene 1: the rise, the click, five shutter clicks, the zoom-through.
sfx.add(whoosh(1.05, 250, 2600, 0.8, 1.0, 0.0, 0.0), T["logoRise"] - 0.02, db(-30))
sfx.add(mech_click(1.0), T["logoLand"], db(-9))
verb_send.add(mech_click(1.0), T["logoLand"], db(-24))
sfx.add(boom(0.5, 0.8, 70, 48), T["logoLand"], db(-22))
for k, at in enumerate(T["inversions"]):
    s = shutter(1.0, 1.0 + 0.025 * ((k * 7) % 3 - 1), seed=k)
    sfx.add(s, at, db(-12.5 if k < 4 else -11), 0.12 * ((-1) ** k))
    verb_send.add(s, at, db(-27))
sfx.add(boom(0.6, 1.2, 64, 40), T["inversions"][-1], db(-21))
sfx.add(whoosh(T["zoomEnd"] - T["zoomStart"] + 0.12, 200, 7000, 0.92, 1.0, 0.0, 0.0), T["zoomStart"], db(-21))
sfx.add(boom(0.7, 1.8, 60, 36), T["zoomEnd"], db(-19))

# Scene 2/3 text: barely-there air on the reveals and exits.
for at in [T["privacyIn"], T["usersIn"], T["globeIn"], T["syncIn"]]:
    sfx.add(whoosh(0.7, 800, 5000, 0.35, 0.5, -0.2, 0.2), at - 0.05, db(-36))
for at in [T["privacyOut"], T["syncOut"]]:
    sfx.add(whoosh(0.45, 900, 4200, 0.4, 0.6, 0.0, 0.3), at, db(-35))

# Counter: muffled ticks whose rate follows the count, quiet then building.
k_exp = 7.0
tpos, phase = T["countStart"], 0.0
dtc = 1.0 / SR * 64
ticks = []
while tpos < T["countEnd"]:
    p = (tpos - T["countStart"]) / (T["countEnd"] - T["countStart"])
    rate = 9 + 62 * (np.exp(k_exp * p) - 1) / (np.exp(k_exp) - 1) ** 0.62
    rate = min(rate, 70)
    phase += rate * dtc
    if phase >= 1:
        phase -= 1
        ticks.append((tpos, p))
    tpos += dtc
for at, p in ticks:
    vel = 0.25 + 0.75 * p ** 1.5
    sfx.add(counter_click(vel * (0.9 + 0.2 * rng.random())), at, db(-17), 0.3 * (rng.random() - 0.5))
sfx.add(mech_click(0.9, 0.82), T["countEnd"], db(-14))

# Scene 3 → 4 and the product shots: whooshes follow the camera.
sfx.add(whoosh(0.7, 300, 3800, 0.7, 1.0, 0.0, 0.0), T["usersOut"], db(-27))
sfx.add(whoosh(0.55, 400, 5200, 0.6, 1.0, -0.6, 0.7), T["shotTrio"] - 0.28, db(-24))
sfx.add(whoosh(0.5, 400, 4600, 0.6, 1.0, 0.0, 0.0), T["shotMacro"] - 0.3, db(-25))
sfx.add(whoosh(0.5, 300, 4000, 0.4, 0.9, 0.0, -0.2), T["shotMacroEnd"] - 0.32, db(-26))
sfx.add(ui_tick(0.9), T["heroSwitch"], db(-24))
sfx.add(ui_tick(0.8, 2200), T["sheetUp"], db(-25))
sfx.add(whoosh(0.4, 600, 3000, 0.3, 0.6, 0.2, 0.0), T["sheetUp"], db(-33))
sfx.add(pop(0.7), T["globeIcon"], db(-24))

# Scene 5: whip, settings, laptop lid, typing, send, arrival.
sfx.add(whoosh(0.55, 350, 6000, 0.55, 1.0, 0.7, -0.7), T["globeOut"], db(-22))
sfx.add(ui_tick(1.0, 2400), T["settingsOpen"], db(-22))
sfx.add(whoosh(0.35, 700, 3500, 0.3, 0.6, 0.0, 0.0), T["settingsOpen"], db(-33))
sfx.add(whoosh(0.45, 400, 5000, 0.8, 1.0, 0.0, 0.0), T["shotLaptop"] - 0.25, db(-25))
lid = whoosh(0.8, 200, 1500, 0.5, 1.0, 0.0, 0.0)
sfx.add(lid, T["shotLaptop"] + 0.05, db(-30))
sfx.add(mech_click(0.4, 0.7), T["shotLaptop"] + 0.95, db(-24))
sfx.add(whoosh(0.45, 400, 5200, 0.8, 1.0, -0.5, 0.5), T["shotSync"] - 0.25, db(-25))
text = "Perfect. See you tomorrow at 2 "
span = T["send"] - 0.1 - T["typeStart"]
for i in range(len(text)):
    at = T["typeStart"] + span * (i + rng.random() * 0.6) / len(text)
    sfx.add(key_tap(0.8 + 0.3 * rng.random(), seed=i), at, db(-31), -0.35)
sfx.add(ui_tick(1.0, 1900), T["send"], db(-22), -0.3)
sfx.add(whoosh(T["arrive"] - T["send"], 500, 6500, 0.45, 1.0, -0.45, 0.45), T["send"] + 0.02, db(-23))
sfx.add(pop(1.0), T["arrive"], db(-18), 0.35)
verb_send.add(pop(1.0), T["arrive"], db(-24), 0.35)
sfx.add(whoosh(0.5, 300, 3600, 0.7, 1.0, 0.0, 0.0), T["shotSyncEnd"] - 0.32, db(-26))

# Scene 6: the mark settles with a soft click.
sfx.add(whoosh(0.9, 200, 2200, 0.85, 0.9, 0.0, 0.0), T["endLogo"], db(-31))
sfx.add(mech_click(0.7, 0.9), T["endLogoLand"], db(-16))

# --------------------------------------------------------------------------
# Mix

# Kick ducks the pads/bass slightly so the pulse breathes.
duck = np.ones(len(music.x))
for a in np.arange(12.0, 28.5, 1.0):
    if 18.45 <= a < 19.45:
        continue
    i = secs(a)
    m = secs(0.28)
    duck[i:i + m] = np.minimum(duck[i:i + m], 1 - 0.32 * np.exp(-tt(m) / 0.09))
music.x *= duck[:, None]

verb = convolve(verb_send.x, reverb_ir(2.6, 0.022, 1.0))
room = convolve(sfx.x, reverb_ir(0.7, 0.006, 1.2, seed=3))
mix = music.x + drums.x + sfx.x + verb * db(-3) + room * db(-17)
if os.environ.get("STEMS"):
    # Section RMS per bus, for balancing by numbers.
    sections = [(0, 1.45), (1.45, 3.9), (3.9, 7.25), (7.25, 9.0), (9.0, 12.0), (12.0, 20.5), (20.5, 28.5), (28.5, 40)]
    for name, bus in [("music", music.x), ("drums", drums.x), ("sfx", sfx.x), ("verb", verb * db(-3)), ("room", room * db(-17))]:
        row = []
        for a, b in sections:
            seg = bus[secs(a):secs(b)]
            row.append(f"{20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9):6.1f}")
        print(f"{name:6s}", " ".join(row))
mix = hp(mix, 32, 4)
# Tame the sub (it reads as boom on headphones and vanishes on laptops) and
# open the top a little for air.
mix = mix - (1 - db(-5)) * lp(mix, 65, 2)
mix = mix + (db(2.5) - 1) * hp(mix, 7500, 1)

# Gentle bus compression (RMS, slow) then a clean peak ceiling.
rms = np.sqrt(np.maximum(signal.sosfilt(sos("lowpass", 6), np.mean(mix ** 2, axis=1)), 0) + 1e-9)
thresh = db(-20)
gain = np.where(rms > thresh, (rms / thresh) ** (1 / 2.2 - 1), 1.0)
mix *= gain[:, None]

mix = mix[:N]
fade = secs(1.2)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix[: secs(0.01)] *= np.linspace(0, 1, secs(0.01))[:, None]

# --------------------------------------------------------------------------
# Master: ITU-R BS.1770 loudness to the target, then a look-ahead limiter.

def lufs(x):
    k1 = signal.lfilter([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], x, axis=0)
    k2 = signal.lfilter([1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621], k1, axis=0)
    blk, hop = secs(0.4), secs(0.1)
    ms = np.array([np.sum(np.mean(k2[i:i + blk] ** 2, axis=0)) for i in range(0, len(k2) - blk, hop)])
    ld = -0.691 + 10 * np.log10(ms + 1e-12)
    ms = ms[ld > -70]
    rel = -0.691 + 10 * np.log10(np.mean(ms)) - 10
    ms = ms[-0.691 + 10 * np.log10(ms) > rel]
    return -0.691 + 10 * np.log10(np.mean(ms))


def limit(x, ceiling=db(-1.2), look=secs(0.004), release=0.08):
    # Peak estimate on a 4x oversampled signal approximates true peak.
    up = signal.resample_poly(x, 4, 1, axis=0)
    pk = np.max(np.abs(up), axis=1).reshape(-1, 4).max(axis=1)[: len(x)]
    need = np.minimum(1.0, ceiling / np.maximum(pk, 1e-9))
    # Look-ahead: take the minimum gain over the window ahead of each sample.
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(need, size=look * 2 + 1, origin=0)
    g = np.concatenate([g[look:], np.full(look, g[-1])])
    # Release smoothing (attack is instant thanks to the look-ahead).
    a = np.exp(-1 / (release * SR))
    out = np.empty_like(g)
    cur = 1.0
    for i in range(len(g)):
        cur = g[i] if g[i] < cur else a * cur + (1 - a) * g[i]
        out[i] = cur
    return x * out[:, None]


TARGET = -15.0
before = lufs(mix)
mix *= db(TARGET - before)
mix = limit(mix)
after = lufs(mix)

from scipy.io import wavfile
os.makedirs(os.path.join(ROOT, "build", "audio"), exist_ok=True)
out = os.path.join(ROOT, "build", "audio", "mix.wav")
wavfile.write(out, SR, mix.astype(np.float32))
print(f"wrote {out}: {len(mix) / SR:.2f}s, {before:.1f} -> {after:.1f} LUFS, peak {20 * np.log10(np.max(np.abs(mix))):.2f} dBFS")
