#!/usr/bin/env python3
"""Soundtrack and sound design for "The Internet, Reconnected."

Original atmospheric electronic score on the shared synth toolkit
(tools/audiolib.py) — generated here, so it is cleared for paid promotion.
100 BPM, D minor resolving to F major. It builds from mystery to movement to
resolution, and every transformation in reconnect/timeline.js has a sound of
its own, kept small and musical (few whooshes, no trailer hits):
  * the signal: air, a sub drone, a glint as light finds the first token; a
    tuned tick as each token unstacks; a thin tone running along each link;
    the lines locking into the grid: a soft chord accent;
  * into the structure: a shimmer as the rails draw back into the dark; each
    part landing in its slot is a soft tuned knock (a cascade); panels sweep
    in with a brushed-metal glide; the assembled app: a warm swell;
  * the community in motion: the groove; rail icons flipping (glassy blips);
    the active space's icon in flight; channel rows lifting (small shutters)
    with tones running out along their lines; the ripple; typing as real
    key taps, one per captured character;
  * familiar, transformed: half the groove, warmer harmony; the layers
    closing; bells on the words and a glassy flourish as the letters re-form;
  * everything becomes Disband: a long build as the lines converge; the
    outline closing; a rising tone as the mark fills; the resolution — a deep,
    warm accent and the music's peak — on the mark's formation;
  * the invitation: the final chord rings out.

    node tools/timeline-json.mjs reconnect/timeline.js build/reconnect-timeline.json
    TIMELINE=build/reconnect-timeline.json python3 tools/audio_reconnect.py
        -> build/audio/reconnect-mix.wav
"""
import os

import numpy as np
from scipy import signal

from audiolib import *  # noqa: F401,F403  (SR, T, DUR, BEAT, N, rng, instruments, effects)

LOCK, ASSEMBLED, FORMED = T["lock"], T["assembled"], T["formed"]
music, drums, sfx, verb_send = Bus(), Bus(), Bus(), Bus()

CHORDS = {
    "Dm9": ["D3", "A3", "C4", "E4", "F4"],
    "Bbmaj7": ["A#2", "F3", "A3", "D4"],
    "Bbmaj9": ["A#2", "F3", "A3", "C4", "D4"],
    "Fmaj9": ["F2", "C3", "E3", "G3", "A3"],
    "Gm9": ["G2", "D3", "F3", "A3", "A#3"],
    "C6sus": ["C3", "G3", "A3", "D4", "F4"],
    "FA": ["A2", "E3", "F3", "C4", "G4"],
    "Asus": ["A2", "E3", "A3", "D4", "E4"],
    "Fadd9": ["F2", "C3", "F3", "G3", "A3", "C4"],
}
ROOTS = {"Dm9": "D2", "Bbmaj7": "A#1", "Bbmaj9": "A#1", "Fmaj9": "F1", "Gm9": "G1", "C6sus": "C2", "FA": "A1", "Asus": "A1", "Fadd9": "F1"}
PLAN = [
    (0.0, LOCK, "Dm9"), (LOCK, T["enter"], "Bbmaj7"), (T["enter"], 7.3, "Dm9"), (7.3, 9.7, "Bbmaj9"),
    (9.7, T["track"], "Fmaj9"), (T["track"], 14.4, "Dm9"), (14.4, T["type"], "Gm9"), (T["type"], 18.6, "Bbmaj9"),
    (18.6, T["explode"], "C6sus"), (T["explode"], T["whole"], "Fmaj9"), (T["whole"], 25.2, "Bbmaj9"),
    (25.2, T["converge"], "FA"), (T["converge"], 29.4, "Gm9"), (29.4, FORMED, "Asus"),
    (FORMED, T["settle"], "Fmaj9"), (T["settle"], DUR, "Fadd9"),
]
# Where the groove plays and how full it is (0 pulse, 1 groove, 2 full).
GROOVE = [(T["enter"] + 0.1, 7.3, 0), (7.3, T["track"], 1), (T["track"], T["explode"], 2),
          (T["explode"] + 0.3, T["converge"], 1), (FORMED, T["settle"], 2)]

# --------------------------------------------------------------------------
# Instruments only this film uses


def phase(f):
    return 2 * np.pi * np.cumsum(f) / SR


def panned(x, p0, p1):
    p = np.linspace(p0, p1, len(x))
    return np.stack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)], axis=1)


def metal_glide(dur, f0, f1, vel=1.0, p0=-0.4, p1=0.4):
    """Brushed metal sliding: inharmonic modes gliding in pitch over a scrape."""
    n = secs(dur)
    u = tt(n) / dur
    ph = phase(f0 * (f1 / f0) ** (u ** 1.3))
    y = sum(np.sin(ph * r + k) * (0.6 ** k) for k, r in enumerate([1.0, 2.76, 5.40, 8.93]))
    scrape = sweep_lp(bp(noise(n), 2500, 11000), 2500 + 5000 * u) * 0.4
    env = np.minimum(1, u / 0.15) * (1 - u) ** 0.8
    return panned((y * 0.25 + scrape) * env * vel, p0, p1)


def knock(f, vel=1.0):
    """A part landing in its slot: a short tuned body with a soft felt transient."""
    n = secs(0.35)
    t = tt(n)
    body = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.07) + 0.4 * np.sin(2 * np.pi * 2.01 * f * t) * np.exp(-t / 0.03)
    felt = lp(noise(n), 1800) * np.exp(-t / 0.008) * 0.6
    return (body * 0.7 + felt) * vel


def blip(f, vel=1.0):
    """A glassy flip: two detuned partials and a tiny tick."""
    n = secs(0.25)
    t = tt(n)
    y = (np.sin(2 * np.pi * f * t) + 0.6 * np.sin(2 * np.pi * f * 2.997 * t)) * np.exp(-t / 0.06)
    tick = bp(noise(n), 4000, 12000) * np.exp(-t / 0.002) * 0.4
    return (y * 0.5 + tick) * vel


def line_tone(dur, f0, f1, vel=1.0, p0=0.0, p1=0.0):
    """A thin tone running along a line: a sine glide with a soft attack."""
    n = secs(dur)
    u = tt(n) / dur
    y = np.sin(phase(f0 * (f1 / f0) ** u)) * np.minimum(1, u / 0.1) * (1 - u) ** 1.5
    return panned(y * vel, p0, p1)


def shimmer(dur, vel=1.0):
    """High, airy noise swelling and settling: light running back into the dark."""
    n = secs(dur)
    u = tt(n) / dur
    y = bp(noise(n), 5000, 14000) * np.sin(np.pi * u) ** 1.5
    return np.stack([y, np.roll(y, 700)], axis=1) * vel


def sub_drop(vel=1.0, dur=3.4, f0=72, f1=29):
    n = secs(dur)
    t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.4)
    return np.tanh(1.5 * np.sin(phase(f)) * np.exp(-t / 1.3) * np.minimum(1, t / 0.005)) * vel


# --------------------------------------------------------------------------
# Music

n = secs(DUR)
t = tt(n)
air = hp(lp(noise(n), 3400), 450) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.05 * t))
music.add(pan(air, -0.35) * 0.6 + pan(np.roll(air, 1900), 0.35) * 0.6, 0.0, db(-47))
drone = osc_sine(hz("D1"), n) * np.clip(t / 1.5, 0, 1) * np.clip((T["enter"] + 1.0 - t) / 1.2, 0, 1)
music.add(np.tanh(1.5 * drone), 0.0, db(-28))

for i, (a, b, name) in enumerate(PLAN):
    peak = FORMED <= a < T["settle"]
    warm = T["explode"] <= a < T["converge"]
    cutoff = 700 if a < LOCK else (1300 if a < T["enter"] else (2600 if peak else (1700 if warm else 2100)))
    level = -22 if a < T["enter"] else (-17 if peak else (-18.5 if warm else -20))
    ch = pad_chord([hz(x) for x in CHORDS[name]], b - a, attack=1.8 if a == 0 else (0.6 if warm else 0.3),
                   release=1.6 if b < DUR else 0.4, cutoff=cutoff, width=0.85, seed=i)
    music.add(ch, a, db(level))
    verb_send.add(ch, a, db(level - (1.5 if warm else 3)))

# Bass: an 8th pulse inside the groove, long roots elsewhere (from the lock).
for a, b, name in PLAN:
    if a < LOCK:
        continue
    root = hz(ROOTS[name])
    lvl = max([g[2] for g in GROOVE if g[0] <= a < g[1]] or [-1])
    if lvl >= 1:
        step = BEAT / 2 if lvl == 2 else BEAT
        tpos, k = a, 0
        while tpos < b - 1e-6:
            music.add(lp(bass_note(root, step * 0.85, 0.9 if k % 2 == 0 else 0.62), 950), tpos, db(-20))
            tpos += step
            k += 1
    else:
        m = secs(b - a + 0.3)
        u = tt(m)
        x = osc_sine(root, m) * np.minimum(1, u / 0.35) * np.clip((b - a + 0.3 - u) / 0.5, 0, 1)
        music.add(np.tanh(1.3 * x), a, db(-23))

# Arpeggio where the groove is full; slow bells in the warm section and the end.
for a, b, name in PLAN:
    notes = CHORDS[name]
    lvl = max([g[2] for g in GROOVE if g[0] <= a < g[1]] or [-1])
    if lvl == 2:
        seq = [hz(x) * 2 for x in [notes[1], notes[2], notes[3], notes[-1], notes[3], notes[2], notes[1], notes[3]]]
        tpos, k = a, 0
        while tpos < b - 1e-6:
            x = pluck(seq[k % len(seq)], 0.5, 1.2, 0.8 if k % 2 == 0 else 0.5)
            music.add(x, tpos, db(-33), 0.4 * np.sin(k * 1.3))
            verb_send.add(x, tpos, db(-29))
            tpos += BEAT / 4
            k += 1
    elif T["explode"] <= a < T["converge"] or a >= T["settle"]:
        for j, at in enumerate(np.arange(a + 0.3, b - 1.0, BEAT * 2)):
            x = bell(hz(notes[1 + j % (len(notes) - 1)]) * 2, 2.8, 0.42)
            music.add(x, at, db(-30), 0.3 * np.sin(j * 1.7))
            verb_send.add(x, at, db(-20))

# --------------------------------------------------------------------------
# Pulse and percussion

for g0, g1, lvl in GROOVE:
    b, i = g0, 0
    while b < g1 - 0.2:
        half = T["explode"] <= g0 < T["converge"]
        if not half or i % 2 == 0:
            drums.add(kick([0.45, 0.68, 0.85][lvl]), b, db([-23, -18, -16][lvl]))
        if lvl == 2 and i % 2 == 1:
            c = clap(0.65)
            drums.add(c, b, db(-28))
            verb_send.add(c, b, db(-22))
        for s16 in range(4):
            ts = b + s16 * BEAT / 4
            if lvl >= 1 and (s16 % 2 == 0 or lvl == 2):
                drums.add(hat([0.8, 0.3, 0.55, 0.3][s16]), ts, db(-32 if half else -31), 0.2)
            if lvl == 2 and s16 in (1, 3):
                drums.add(shaker(0.7), ts, db(-37), -0.3)
        b += BEAT
        i += 1

# --------------------------------------------------------------------------
# Sound design

# 1 — the signal.
x = bell(hz("A6"), 2.4, 0.4)
sfx.add(x, T["glint"], db(-30))
verb_send.add(x, T["glint"], db(-20))
sfx.add(metal_glide(1.2, 900, 1300, 0.4, -0.3, 0.3), T["glint"] - 0.1, db(-34))
for i in range(1, 9):
    at = T["unstack"] + (i - 1) * 0.09
    sfx.add(blip(hz(["D6", "F6", "A6", "C7", "D7", "E7", "F7", "A7"][i - 1]) / 2, 0.5), at, db(-31), -0.6 + 0.15 * i)
    sfx.add(line_tone(0.6, 1400 + 60 * i, 2100 + 60 * i, 0.25, -0.5, 0.5), T["unstack"] + 0.15 + (i - 1) * 0.09, db(-38))
music.add(pan(riser(LOCK - T["spiral"], 250, 7000, 0.7, 2.2), 0.0), T["spiral"], db(-31))
for k in range(9):
    sfx.add(knock(hz("D4") * (1 + 0.06 * k), 0.4), T["organize"] + 0.15 + k * 0.06 + 0.55, db(-30), -0.5 + 0.12 * k)
acc = sum(pluck(hz(x) * 2, 2.0, 1.1, 0.6) for x in CHORDS["Bbmaj7"][1:])
music.add(acc, LOCK, db(-21))
verb_send.add(acc, LOCK, db(-13))
music.add(lp(sub_drop(0.6, 2.4, 60, 34), 300), LOCK, db(-19))
for k in range(4):
    sfx.add(line_tone(0.9, 300, 2400, 0.3, (-0.8, 0.8, -0.4, 0.4)[k], (-1.0, 1.0, -0.9, 0.9)[k]), LOCK - 0.05 + 0.06 * k, db(-35))
for k, note in enumerate(["D5", "F5", "A5", "C6"]):
    x = pluck(hz(note), 1.2, 0.8, 0.45)
    music.add(x, T["head"] + 0.14 * k, db(-31), 0.15)
    verb_send.add(x, T["head"] + 0.14 * k, db(-23), 0.15)

# 2 — into the structure.
sfx.add(shimmer(1.4, 0.5), T["rails"], db(-33))
for t0, dur, p0, p1 in [(T["railPanel"], 0.45, -0.7, -0.4), (T["column"], 0.6, -0.6, 0.0), (T["membersPanel"], 0.5, 0.4, 0.8), (T["chatPanel"], 0.65, -0.2, 0.6)]:
    sfx.add(metal_glide(dur + 0.2, 500, 760, 0.6, p0, p1), t0 - 0.05, db(-29))
scale = [hz(x) for x in ["D4", "F4", "G4", "A4", "C5", "D5", "F5", "G5", "A5", "C6"]]
lands = [(T["rows"] + k * 0.08 + 0.9, -0.7) for k in range(10)] + [(T["strata"] + k * 0.17 + 1.2, 0.0) for k in range(9)] + \
        [(T["members"] + k * 0.08 + 0.9, 0.7) for k in range(8)] + [(T["rows"] + 1.1, -0.6), (T["rows"] + 1.4, -0.6), (T["chrome"] + 0.8, 0.1), (T["chrome"] + 1.0, 0.1)]
for j, (at, p) in enumerate(sorted(lands)):
    sfx.add(knock(scale[j % len(scale)] / 2, 0.55), at, db(-29), p)
swell = sum(pluck(hz(x) * 2, 2.4, 1.0, 0.55) for x in CHORDS["Fmaj9"][1:])
music.add(swell, ASSEMBLED, db(-22))
verb_send.add(swell, ASSEMBLED, db(-13))

# 3 — the community in motion.
for i in range(9):
    if i != 2:
        sfx.add(blip(hz(["A5", "C6", "D6", "E6", "F6", "G6", "A6", "C7", "D7"][i]), 0.6), T["pop"] + i * 0.1 + 0.2, db(-29), -0.5)
sfx.add(whoosh(0.9, 300, 3200, 0.5, 0.45, -0.6, 0.2), T["dd"], db(-32))
sfx.add(whoosh(0.8, 300, 2800, 0.5, 0.4, 0.2, -0.6), T["louver"] + 0.7, db(-34))
for k in range(10):
    sfx.add(shutter(0.45, 1.0 + 0.04 * k, seed=k), T["louver"] + k * 0.05, db(-31), -0.6)
    sfx.add(line_tone(0.8, 900 + 70 * k, 1800 + 70 * k, 0.22, -0.6, 0.9), T["louver"] + 0.2 + k * 0.05, db(-36))
for k in range(10):
    sfx.add(mech_click(0.35, 1.2 + 0.03 * k), T["louverClose"] + (9 - k) * 0.035 + 0.5, db(-31), -0.6)
sfx.add(whoosh(1.2, 150, 1600, 0.5, 0.45, 0.4, -0.2), T["ripple"], db(-34))
n_typed = 41
for i in range(n_typed):
    at = T["type"] + (i + 0.5) * (T["typed"] - T["type"]) / n_typed
    sfx.add(key_tap(0.5 + 0.15 * ((i * 7) % 3), seed=i), at, db(-30), 0.05)

# 4 — familiar, transformed.
sfx.add(whoosh(1.4, 120, 1400, 0.5, 0.45, 0.3, -0.3), T["explode"], db(-34))
sfx.add(lp(boom(0.35, 1.4, 64, 42), 300), T["whole"], db(-26))
for at, note in [(T["familiar"], "A5"), (T["familiar"] + 0.25, "C6")]:
    x = bell(hz(note), 3.0, 0.5)
    music.add(x, at, db(-28), 0.1)
    verb_send.add(x, at, db(-18), 0.1)
for k, note in enumerate(["F5", "A5", "C6", "E6", "F6"]):
    x = pluck(hz(note), 1.0, 1.0, 0.45)
    music.add(x, T["swap"] + 0.08 * k, db(-30), -0.4 + 0.2 * k)
    verb_send.add(x, T["swap"] + 0.08 * k, db(-21))

# 5 — everything becomes Disband.
music.add(pan(riser(FORMED - T["converge"], 200, 9000, 0.9, 2.4), 0.0), T["converge"], db(-27))
for k in range(9):
    sfx.add(line_tone(1.4, 200 + 40 * k, 1200 + 90 * k, 0.25, (-0.9 + 0.2 * k), 0.0), T["converge"] + 0.4 + 0.1 * k, db(-36))
sfx.add(blip(hz("A6"), 0.6), T["contour"], db(-28))
fill = line_tone(FORMED - T["fill"] + 0.1, 220, 880, 0.6, 0.0, 0.0)
sfx.add(fill, T["fill"], db(-30))
music.add(sub_drop(1.0, 3.6, 70, 28), FORMED - 0.02, db(-12.5))
music.add(lp(boom(0.6, 2.4, 52, 32), 260), FORMED, db(-18))
peak = sum(pluck(hz(x) * 2, 2.6, 1.3, 0.8) for x in CHORDS["Fmaj9"][1:])
music.add(peak, FORMED, db(-18))
verb_send.add(peak, FORMED, db(-10))
glass = sum(bell(hz(x), 3.8, 0.42) for x in ["C6", "F6", "A6"])
verb_send.add(glass, T["highlight"], db(-18))
sfx.add(metal_glide(1.1, 2200, 3400, 0.3, -0.5, 0.5), T["highlight"], db(-34))
for at, note in [(T["name"], "A5"), (T["slogan"], "C6")]:
    x = bell(hz(note), 3.0, 0.5)
    music.add(x, at, db(-27), 0.12)
    verb_send.add(x, at, db(-18), 0.12)

# 6 — the invitation.
for at, note in [(T["cta"], "F5"), (T["url"], "A5"), (T["endHold"] + 0.5, "C5")]:
    x = bell(hz(note), 3.2, 0.55)
    music.add(x, at, db(-26), 0.1)
    verb_send.add(x, at, db(-17), 0.1)
sfx.add(mech_click(0.5, 1.0), T["url"] + 0.25, db(-25))

# --------------------------------------------------------------------------
# Mix

duck = np.ones(len(music.x))
for g0, g1, lvl in GROOVE:
    if lvl < 1:
        continue
    for a in np.arange(g0, g1 - 0.2, BEAT):
        i_, m = secs(a), secs(0.24)
        duck[i_:i_ + m] = np.minimum(duck[i_:i_ + m], 1 - 0.18 * np.exp(-tt(m) / 0.09))
music.x *= duck[:, None]

verb = convolve(verb_send.x, reverb_ir(3.4, 0.03, 0.9))
room = convolve(sfx.x, reverb_ir(0.8, 0.008, 1.05, seed=3))
mix = music.x + drums.x + sfx.x * db(4.0) + verb * db(-3) + room * db(-12)
if os.environ.get("STEMS"):
    sections = [(0, 5), (5, 12), (12, 20), (20, 27), (27, 34), (34, 38)]
    for name, bus in [("music", music.x), ("drums", drums.x), ("sfx", sfx.x), ("verb", verb * db(-3))]:
        print(f"{name:6s}", " ".join(f"{20 * np.log10(np.sqrt(np.mean(bus[secs(a):secs(b)] ** 2)) + 1e-9):6.1f}" for a, b in sections))
mix = hp(mix, 26, 4)
mix = mix + (db(1.5) - 1) * hp(mix, 8000, 1)

rms = np.sqrt(np.maximum(signal.sosfilt(sos("lowpass", 6), np.mean(mix ** 2, axis=1)), 0) + 1e-9)
thresh = db(-21)
gain = np.where(rms > thresh, (rms / thresh) ** (1 / 2.2 - 1), 1.0)
mix *= gain[:, None]

# A natural ending: the last chord rings out over the final 2.3 seconds.
mix = mix[:N]
fade = secs(2.3)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix[: secs(0.01)] *= np.linspace(0, 1, secs(0.01))[:, None]

# About -14 LUFS, the level TikTok and other platforms normalise to.
master(mix, "reconnect-mix.wav", -14.0)
