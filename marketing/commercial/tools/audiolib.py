"""Synthesis toolkit shared by the Disband soundtracks.

Oscillators, filters, instruments, sound effects, reverb and mastering. The
timeline comes from build/timeline.json, or from the file named by the
TIMELINE environment variable.
"""
import json
import os

import numpy as np
from scipy import signal

SR = 48000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TL = json.load(open(os.environ.get("TIMELINE", os.path.join(ROOT, "build", "timeline.json"))))
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


def master(mix, name, target=-15.0):
    """Normalise to the target loudness, limit, and write build/audio/<name>."""
    from scipy.io import wavfile
    before = lufs(mix)
    mix = mix * db(target - before)
    mix = limit(mix)
    after = lufs(mix)
    os.makedirs(os.path.join(ROOT, "build", "audio"), exist_ok=True)
    out = os.path.join(ROOT, "build", "audio", name)
    wavfile.write(out, SR, mix.astype(np.float32))
    print(f"wrote {out}: {len(mix) / SR:.2f}s, {before:.1f} -> {after:.1f} LUFS, peak {20 * np.log10(np.max(np.abs(mix))):.2f} dBFS")
    return mix
