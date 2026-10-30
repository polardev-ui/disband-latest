#!/usr/bin/env python3
"""Soundtrack and sound design for "The Way It Used to Feel." (morphing classic UI).

Original atmospheric electronic score on the shared synth toolkit
(tools/audiolib.py) — generated here, so it is cleared for paid promotion.
120 BPM, A minor. Every morph in morph/timeline.js has a sonic counterpart:
  * the point of light and the hull: air, a high glint, a rising pull; the
    window snapping together is the first impact;
  * the rail stretching into a strip: a metallic glide; its turn: a fluttering
    air sweep; the rows landing in the column: a run of small latches;
  * crossing the column edge: a spatial whoosh panned across the field;
  * bands separating and flipping: mechanical textures (servo, ratchet, ticks);
    the bands closing as the DM view: an impact;
  * the regions converging as the whole app: an impact; the fold: hinged
    thuds; the turn: a rising sweep; the mark: the deep accent and the peak;
  * the end: the score resolves and rings out.

    node tools/timeline-json.mjs morph/timeline.js build/morph-timeline.json
    TIMELINE=build/morph-timeline.json python3 tools/audio_morph.py
        -> build/audio/morph-mix.wav
"""
import os

import numpy as np
from scipy import signal

from audiolib import *  # noqa: F401,F403  (SR, T, DUR, BEAT, N, rng, instruments, effects)

SNAP, CLOSED, WHOLE, MARK, SETTLE = T["snap"], T["closed"], T["whole"], T["mark"], T["settle"]

music, drums, sfx, verb_send = Bus(), Bus(), Bus(), Bus()

CHORDS = {
    "Am9": ["A2", "E3", "G3", "B3", "C4"],
    "Fmaj9": ["F2", "C3", "E3", "G3", "A3"],
    "Em7": ["E2", "B2", "D3", "G3", "B3"],
    "Dm9": ["D3", "A3", "C4", "E4", "F4"],
    "G6sus": ["G2", "D3", "E3", "A3", "C4"],
    "Cadd9": ["C3", "G3", "D4", "E4", "G4"],
}
ROOTS = {"Am9": "A1", "Fmaj9": "F1", "Em7": "E1", "Dm9": "D2", "G6sus": "G1", "Cadd9": "C2"}
PLAN = [
    (0.0, SNAP, "Am9"), (SNAP, T["stretch"], "Fmaj9"), (T["stretch"], T["fold"], "Am9"), (T["fold"], T["chat"], "Em7"),
    (T["chat"], T["flip"], "Fmaj9"), (T["flip"], CLOSED, "Dm9"), (CLOSED, T["explode"], "Am9"), (T["explode"], WHOLE, "Em7"),
    (WHOLE, T["accent"], "Fmaj9"), (T["accent"], T["foldIn"], "G6sus"), (T["foldIn"], MARK, "Dm9"),
    (MARK, SETTLE, "Fmaj9"), (SETTLE, DUR, "Cadd9"),
]
# Sections where the groove plays, and how full it is (0 pulse, 1 groove, 2 full).
GROOVE = [(SNAP, T["stretch"], 0), (T["stretch"], T["chat"], 1), (T["chat"], T["explode"], 2),
          (WHOLE, T["foldIn"], 2), (MARK, SETTLE, 2)]

# --------------------------------------------------------------------------
# Instruments only this film uses

def glide_phase(f):
    return 2 * np.pi * np.cumsum(f) / SR


def metal_glide(dur, f0, f1, vel=1.0, p0=-0.4, p1=0.4):
    """A struck bar sliding in pitch: inharmonic modes, a bright scrape, a slow swell."""
    n = secs(dur)
    u = tt(n) / dur
    f = f0 * (f1 / f0) ** (u ** 1.3)
    ph = glide_phase(f)
    y = sum(np.sin(ph * r + k) * (0.62 ** k) for k, r in enumerate([1.0, 2.76, 5.40, 8.93]))
    scrape = sweep_lp(bp(noise(n), 2500, 11000), 3000 + 6000 * u) * 0.35
    env = np.minimum(1, u / 0.12) * (1 - u) ** 0.7
    return _panned((y * 0.35 + scrape) * env * vel, p0, p1)


def _panned(x, p0, p1):
    p = np.linspace(p0, p1, len(x))
    l, r = np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
    return np.stack([x * l, x * r], axis=1)


def servo(dur, f0=90, f1=170, vel=1.0):
    """A small motor spinning up: a buzzy tone with a gear ratchet on top."""
    n = secs(dur)
    u = tt(n) / dur
    f = f0 + (f1 - f0) * u ** 0.8
    ph = glide_phase(f)
    buzz = np.tanh(2.5 * np.sin(ph)) * 0.5 + 0.25 * np.sin(2 * ph)
    buzz = bp(buzz, 120, 2400)
    ratchet = np.zeros(n)
    rate = 26 + 30 * u
    clicks = np.cumsum(rate / SR)
    edges = np.flatnonzero(np.diff(np.floor(clicks)) > 0)
    m = secs(0.012)
    for e in edges:
        k = min(m, n - e)
        ratchet[e:e + k] += bp(noise(k), 1800, 7000) * np.exp(-tt(k) / 0.0015)
    env = np.minimum(1, u / 0.1) * np.minimum(1, (1 - u) / 0.15)
    return (buzz * 0.5 + ratchet * 0.6) * env * vel


def flutter(dur, vel=1.0, p0=-0.6, p1=0.6):
    """Air across a turning edge: a whoosh with a fast amplitude flutter."""
    x = whoosh(dur, 400, 5200, 0.55, 1.0, p0, p1)
    u = tt(len(x))
    rate = 9 + 16 * u / dur
    return x * (0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(rate) / SR))[:, None] * vel


def sub_drop(vel=1.0, dur=3.2, f0=70, f1=28):
    """The deep accent: a long falling sine under a boom."""
    n = secs(dur)
    t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.35)
    y = np.sin(glide_phase(f)) * np.exp(-t / 1.2) * np.minimum(1, t / 0.004)
    return np.tanh(1.6 * y) * vel


# --------------------------------------------------------------------------
# Music

n = secs(DUR)
t = tt(n)
air = hp(lp(noise(n), 3600), 500) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.06 * t))
music.add(pan(air, -0.35) * 0.6 + pan(np.roll(air, 1700), 0.35) * 0.6, 0.0, db(-48))
drone = osc_sine(hz("A1"), n) * np.clip(t / 1.2, 0, 1) * np.clip((SNAP + 0.6 - t) / 0.8, 0, 1)
music.add(np.tanh(1.4 * drone), 0.0, db(-29))

for i, (a, b, name) in enumerate(PLAN):
    peak = MARK <= a < SETTLE
    cutoff = 800 if a < SNAP else (2600 if peak else (1500 if a >= SETTLE else 2000))
    level = -21 if a < SNAP else (-17 if peak else -20)
    ch = pad_chord([hz(x) for x in CHORDS[name]], b - a, attack=1.4 if a == 0 else 0.3, release=1.4 if b < DUR else 0.4,
                   cutoff=cutoff, width=0.85, seed=i)
    music.add(ch, a, db(level))
    verb_send.add(ch, a, db(level - 3))

# Bass: a held root before the groove, an 8th pulse in it, a long root at the end.
for a, b, name in PLAN:
    if a < SNAP:
        continue
    root = hz(ROOTS[name])
    pulsing = any(g0 <= a < g1 and lvl >= 1 for g0, g1, lvl in GROOVE)
    if pulsing:
        tpos, k = a, 0
        while tpos < b - 1e-6:
            music.add(lp(bass_note(root, BEAT / 2 * 0.85, 0.9 if k % 2 == 0 else 0.6), 1000), tpos, db(-20))
            tpos += BEAT / 2
            k += 1
    else:
        m = secs(b - a + 0.3)
        u = tt(m)
        x = osc_sine(root, m) * np.minimum(1, u / 0.3) * np.clip((b - a + 0.3 - u) / 0.5, 0, 1)
        music.add(np.tanh(1.3 * x), a, db(-23))

# A 16th arpeggio where the groove is full; slow glints elsewhere.
for a, b, name in PLAN:
    notes = CHORDS[name]
    full = any(g0 <= a < g1 and lvl == 2 for g0, g1, lvl in GROOVE)
    if full:
        seq = [hz(x) * 2 for x in [notes[1], notes[2], notes[3], notes[4], notes[3], notes[2], notes[1], notes[3]]]
        tpos, k = a, 0
        while tpos < b - 1e-6:
            x = pluck(seq[k % len(seq)], 0.5, 1.25, 0.8 if k % 2 == 0 else 0.5)
            music.add(x, tpos, db(-33), 0.4 * np.sin(k * 1.3))
            verb_send.add(x, tpos, db(-29))
            tpos += BEAT / 4
            k += 1
    elif a >= SETTLE:
        for j, at in enumerate(np.arange(a + 0.5, b - 1.2, 1.0)):
            x = bell(hz(notes[1 + j % 4]) * 2, 2.8, 0.42)
            music.add(x, at, db(-30), 0.3 * np.sin(j * 1.7))
            verb_send.add(x, at, db(-21))

# --------------------------------------------------------------------------
# Pulse and percussion

for g0, g1, lvl in GROOVE:
    b, i = g0, 0
    while b < g1 - 0.2:
        drums.add(kick([0.5, 0.72, 0.88][lvl]), b, db([-22, -17, -15.5][lvl]))
        if lvl == 2 and i % 2 == 1:
            c = clap(0.75)
            drums.add(c, b, db(-27))
            verb_send.add(c, b, db(-22))
        for s16 in range(4):
            ts = b + s16 * BEAT / 4
            if lvl >= 1 and (s16 % 2 == 0 or lvl == 2):
                drums.add(hat([0.8, 0.3, 0.55, 0.3][s16]), ts, db(-31), 0.2)
            if lvl == 2 and s16 in (1, 3):
                drums.add(shaker(0.8), ts, db(-36), -0.3)
        b += BEAT
        i += 1

# --------------------------------------------------------------------------
# Sound design

# 1 — point, hull, outline, split, the window snaps together.
x = bell(hz("E6"), 2.0, 0.4)
sfx.add(x, T["point"], db(-31))
verb_send.add(x, T["point"], db(-21))
sfx.add(whoosh(0.7, 800, 6000, 0.5, 0.6, -0.3, 0.3), T["point"] + 0.05, db(-36))
sfx.add(flutter(1.1, 0.5, 0.6, -0.6), T["outline"] + 0.1, db(-38))
for k in range(4):
    sfx.add(whoosh(0.5, 300, 3600, 0.5, 0.55, (-0.8, 0.8, -0.5, 0.5)[k], 0.0), T["split"] + 0.06 * k, db(-35))
music.add(pan(riser(SNAP - T["split"], 300, 9000, 0.9, 2.2), 0.0), T["split"], db(-28))
music.add(boom(0.8, 2.4, 58, 34), SNAP, db(-15))
sfx.add(mech_click(0.9, 0.8), SNAP, db(-16))
for k in range(5):
    sfx.add(mech_click(0.35, 1.2 + 0.1 * k), SNAP - 0.12 + 0.025 * k, db(-30), (-0.6, 0.6, -0.3, 0.3, 0.0)[k])
hit = sum(pluck(hz(x) * 2, 1.8, 1.2, 0.7) for x in CHORDS["Fmaj9"][1:])
music.add(hit, SNAP, db(-21))
verb_send.add(hit, SNAP, db(-13))
for k, note in enumerate(["A4", "C5", "E5", "G5"]):
    x = pluck(hz(note), 1.2, 0.8, 0.45)
    music.add(x, T["title"] + 0.16 * k, db(-32), 0.15)
    verb_send.add(x, T["title"] + 0.16 * k, db(-24), 0.15)

# 2 — the metallic glide as the rail stretches; the turn; rows land; the edge.
sfx.add(metal_glide(T["strip"] - T["stretch"] + 0.9, 340, 780, 0.9, -0.5, 0.4), T["stretch"] - 0.05, db(-22))
verb_send.add(metal_glide(T["strip"] - T["stretch"] + 0.9, 340, 780, 0.9, -0.5, 0.4), T["stretch"] - 0.05, db(-26))
sfx.add(flutter(T["turned"] - T["turn"], 0.9, -0.5, 0.5), T["turn"], db(-29))
sfx.add(metal_glide(0.5, 1100, 1500, 0.5, 0.0, 0.0), T["edge"] - 0.1, db(-31))
for i in range(11):
    at = T["fold"] + 0.45 + i * 0.035 - 0.02
    sfx.add(mech_click(0.45, 1.5 - 0.03 * i), at, db(-27), -0.4 + 0.08 * i)
sfx.add(whoosh(1.0, 200, 6500, 0.4, 1.0, -0.95, 0.95), T["cross"], db(-23))
sfx.add(lp(boom(0.35, 1.0, 90, 50), 400), T["boundary"], db(-27))

# 3 — bands separate (mechanical), flip one by one, close as the DM view.
sfx.add(servo(T["fanned"] - T["bands"], 80, 160, 0.9), T["bands"], db(-24), -0.2)
for k in range(11):
    sfx.add(mech_click(0.4, 0.9 + 0.04 * k), T["bands"] + 0.08 * k, db(-26), -0.6 + 0.12 * k)
for k in range(11):
    at = T["flip"] + k * 0.085 + 0.22
    sfx.add(ui_tick(0.7, 2000 + 90 * k), at, db(-26), -0.5 + 0.1 * k)
    sfx.add(whoosh(0.3, 600, 4000, 0.5, 0.35, 0.0, 0.0), at - 0.12, db(-38))
sfx.add(servo(CLOSED - T["close"], 170, 90, 0.7), T["close"], db(-26), 0.2)
music.add(boom(0.85, 2.2, 60, 36), CLOSED, db(-15.5))
sfx.add(mech_click(0.85, 0.85), CLOSED, db(-17))
for at, note in [(T["home"], "E6"), (T["home"] + 1.2, "C6")]:
    x = bell(hz(note), 2.8, 0.5)
    music.add(x, at, db(-28))
    verb_send.add(x, at, db(-19))

# 4 — explode, flip in flight, converge as the whole app; the camera arcs.
for k in range(6):
    sfx.add(whoosh(0.7, 250, 3800, 0.45, 0.6, (-0.8, 0.8, -0.4, 0.4, -0.6, 0.6)[k], 0.0), T["explode"] + 0.04 * k, db(-31))
sfx.add(servo(0.8, 120, 200, 0.5), T["explode"] + 0.15, db(-29))
music.add(pan(riser(WHOLE - T["explode"], 400, 8000, 0.8, 2.0), 0.0), T["explode"], db(-30))
music.add(boom(0.9, 2.6, 56, 32), WHOLE, db(-14.5))
sfx.add(mech_click(0.9, 0.8), WHOLE, db(-16))
big = sum(pluck(hz(x) * 2, 2.0, 1.3, 0.75) for x in CHORDS["Fmaj9"][1:])
music.add(big, WHOLE, db(-20))
verb_send.add(big, WHOLE, db(-12))
sfx.add(whoosh(3.0, 150, 1800, 0.5, 0.5, -0.6, 0.6), WHOLE + 0.3, db(-36))
sfx.add(lp(boom(0.45, 1.6, 64, 40), 500), T["accent"], db(-24))
for at, note in [(T["familiar"], "A5"), (T["next"], "E6")]:
    x = bell(hz(note), 2.8, 0.5)
    music.add(x, at, db(-28), 0.12)
    verb_send.add(x, at, db(-18), 0.12)

# 5 — the fold (two hinged thuds), the turn, the mark: the deep accent.
for at in (T["foldIn"] + 0.55, T["block"] - 0.12):
    sfx.add(lp(boom(0.5, 0.9, 80, 46), 600), at, db(-22))
    sfx.add(mech_click(0.6, 0.7), at, db(-22))
sfx.add(whoosh(0.8, 200, 2400, 0.6, 0.6, -0.5, 0.0), T["foldIn"], db(-31))
sfx.add(whoosh(0.8, 200, 2400, 0.6, 0.6, 0.5, 0.0), T["fold2"], db(-31))
music.add(pan(riser(T["markEdge"] - T["fold2"], 300, 10000, 1.0, 2.4), 0.0), T["fold2"], db(-25))
sfx.add(flutter(T["markEdge"] - T["spin"] + 0.05, 1.0, -0.4, 0.4), T["spin"], db(-25))
music.add(sub_drop(1.0, 3.4, 72, 27), MARK - 0.02, db(-12))
music.add(boom(0.9, 2.8, 52, 30), MARK, db(-15))
sfx.add(mech_click(0.8, 0.75), MARK, db(-18))
peak = sum(pluck(hz(x) * 2, 2.4, 1.4, 0.8) for x in CHORDS["Fmaj9"][1:])
music.add(peak, MARK, db(-18))
verb_send.add(peak, MARK, db(-10))
shimmer = sum(bell(hz(x), 3.6, 0.42) for x in ["C6", "F6", "A6"])
verb_send.add(shimmer, T["highlight"], db(-18))
sfx.add(metal_glide(1.0, 2400, 3600, 0.35, -0.5, 0.5), T["highlight"], db(-33))
for at, note in [(T["name"], "A5"), (T["slogan"], "C6")]:
    x = bell(hz(note), 3.0, 0.5)
    music.add(x, at, db(-27), 0.12)
    verb_send.add(x, at, db(-18), 0.12)

# 6 — the line and the address; the score resolves and rings out.
sfx.add(whoosh(1.0, 150, 1600, 0.5, 0.5, 0.0, 0.0), SETTLE, db(-34))
for at, note in [(T["cta"], "E6"), (T["url"], "G5"), (T["endHold"] + 0.5, "C5")]:
    x = bell(hz(note), 3.2, 0.55)
    music.add(x, at, db(-26), 0.1)
    verb_send.add(x, at, db(-17), 0.1)
sfx.add(mech_click(0.55, 1.0), T["url"] + 0.2, db(-23))

# --------------------------------------------------------------------------
# Mix

duck = np.ones(len(music.x))
for g0, g1, lvl in GROOVE:
    if lvl < 1:
        continue
    for a in np.arange(g0, g1 - 0.2, BEAT):
        i_, m = secs(a), secs(0.22)
        duck[i_:i_ + m] = np.minimum(duck[i_:i_ + m], 1 - 0.2 * np.exp(-tt(m) / 0.08))
music.x *= duck[:, None]

verb = convolve(verb_send.x, reverb_ir(3.2, 0.03, 0.9))
room = convolve(sfx.x, reverb_ir(0.7, 0.008, 1.1, seed=3))
mix = music.x + drums.x + sfx.x + verb * db(-3) + room * db(-16)
if os.environ.get("STEMS"):
    sections = [(0, 4), (4, 10), (10, 17), (17, 24), (24, 30), (30, 35)]
    for name, bus in [("music", music.x), ("drums", drums.x), ("sfx", sfx.x), ("verb", verb * db(-3))]:
        print(f"{name:6s}", " ".join(f"{20 * np.log10(np.sqrt(np.mean(bus[secs(a):secs(b)] ** 2)) + 1e-9):6.1f}" for a, b in sections))
mix = hp(mix, 26, 4)
mix = mix + (db(1.5) - 1) * hp(mix, 8000, 1)

rms = np.sqrt(np.maximum(signal.sosfilt(sos("lowpass", 6), np.mean(mix ** 2, axis=1)), 0) + 1e-9)
thresh = db(-21)
gain = np.where(rms > thresh, (rms / thresh) ** (1 / 2.2 - 1), 1.0)
mix *= gain[:, None]

# A natural ending: the last chord rings out over the final two seconds.
mix = mix[:N]
fade = secs(2.2)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix[: secs(0.01)] *= np.linspace(0, 1, secs(0.01))[:, None]

# About -14 LUFS, the level TikTok and other platforms normalise to.
master(mix, "morph-mix.wav", -14.0)
