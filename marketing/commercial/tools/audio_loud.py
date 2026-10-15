#!/usr/bin/env python3
"""Soundtrack and sound design for the 9:16 social spot "The internet is loud."

Same synth toolkit as the other films (tools/audiolib.py), 120 BPM on D.
A low drone in the dark; the rush brings fragment whooshes, a restrained
distorted texture and accelerating impacts, with a deep hit under the headline.
At the freeze everything stops dead: one click, then near silence. Warm pads
arrive with the phone, the product turn builds gently, and the logo resolves
into a spacious D major chord.

    node tools/timeline-json.mjs loud/timeline.js build/loud-timeline.json
    TIMELINE=build/loud-timeline.json python3 tools/audio_loud.py
        -> build/audio/loud-mix.wav
"""
import os

import numpy as np
from scipy import signal

from audiolib import *  # noqa: F401,F403  (SR, T, DUR, BEAT, N, rng, instruments, effects)

FREEZE = T["freeze"]
RUSH = T["rushStart"]
RESOLVE = T["morphEnd"]

noise_bus, music, drums, sfx, verb_send = Bus(), Bus(), Bus(), Bus(), Bus()

# --------------------------------------------------------------------------
# 1 — the noise (everything here is on `noise_bus` and is cut at the freeze)

# A low drone that is there from the first frame, felt before it is heard.
n = secs(FREEZE + 0.2)
t = tt(n)
drone = osc_sine(hz("D1"), n) + 0.6 * osc_sine(hz("D1") * 1.006, n) + 0.25 * lp(osc_saw(hz("D2"), n), 300)
rumble = lp(noise(n), 120) * 3.0
env = np.clip(t / 0.5, 0, 1) ** 2 * (0.55 + 0.45 * np.clip((t - RUSH) / (FREEZE - RUSH), 0, 1))
noise_bus.add((drone + rumble) * env, 0.0, db(-24))
# A sparse distant tick in the dark before the rush.
for at in [0.12, 0.31]:
    noise_bus.add(lp(counter_click(0.8), 3000), at, db(-30), 0.4 * (-1) ** int(at * 10))

# The rush: a hit, then fragments passing in every direction.
noise_bus.add(whoosh(0.5, 300, 9000, 0.12, 1.0, 0.0, 0.0), RUSH - 0.03, db(-22))
noise_bus.add(boom(0.8, 1.2, 70, 40), RUSH + 0.05, db(-17))
r = np.random.default_rng(41)
for k in range(30):
    at = RUSH + 0.05 + (FREEZE - RUSH - 0.2) * (k / 30) ** 0.9 + r.random() * 0.06
    d = 0.22 + r.random() * 0.4
    p0 = r.choice([-1, 1]) * (0.3 + 0.6 * r.random())
    noise_bus.add(whoosh(d, 400 + 600 * r.random(), 3000 + 6000 * r.random(), 0.3 + 0.4 * r.random(), 0.6 + 0.4 * r.random(), p0, -p0 * r.random()), at, db(-33 + 6 * k / 30))

# A restrained distorted texture, gated in 16ths, thickening towards the freeze.
m = secs(FREEZE - RUSH)
tm = tt(m)
grit = np.tanh(5 * bp(noise(m), 250, 2600)) * 0.5
gate = np.zeros(m)
for s16 in np.arange(0, FREEZE - RUSH, BEAT / 4):
    i = secs(s16)
    L = secs(BEAT / 4)
    seg = np.exp(-tt(L) / 0.03)
    gate[i:i + L] = np.maximum(gate[i:i + L], seg[: max(0, min(L, m - i))])
grit *= gate * (0.25 + 0.75 * (tm / (FREEZE - RUSH)) ** 1.5)
noise_bus.add(pan(grit, 0.0) * 0.7 + pan(np.roll(grit, 700), 0.0) * 0.3, RUSH, db(-31))
# A dissonant cluster rising under it.
cluster = sum(lp(osc_saw(hz(x), m), 900) for x in ["D3", "D#3", "A3"]) / 3
cluster *= (tm / (FREEZE - RUSH)) ** 2
noise_bus.add(np.tanh(2 * cluster), RUSH, db(-30))

# Impacts on the grid, a distorted low pulse with each; the headline gets the big one.
for at in T["impacts"]:
    big = abs(at - T["headline"]) < 1e-6
    noise_bus.add(boom(1.0 if big else 0.6, 2.4 if big else 0.6, 64 if big else 80, 30 if big else 46), at, db(-11 if big else -19))
    bassp = np.tanh(3 * lp(osc_saw(hz("D1"), secs(0.25)), 260)) * np.exp(-tt(secs(0.25)) / 0.08)
    noise_bus.add(bassp, at, db(-22))
    noise_bus.add(mech_click(0.6, 0.7), at, db(-24))
noise_bus.add(lp(noise(secs(0.08)), 4000) * np.exp(-tt(secs(0.08)) / 0.012), T["headline"], db(-18))

# --------------------------------------------------------------------------
# 2 — stillness, then warmth

# The freeze: one dry click and the faintest air.
sfx.add(mech_click(0.9, 0.9), FREEZE, db(-17))
air = hp(lp(noise(secs(DUR)), 2200), 400) * 0.5
air *= np.clip((tt(secs(DUR)) - 0.05) / 0.4, 0, 1)
music.add(pan(air, 0.0), FREEZE, db(-56))

CHORDS = {
    "Dmaj9": ["D3", "A3", "C#4", "E4", "F#4"],
    "Bm9": ["B2", "F#3", "A3", "C#4", "D4"],
    "Gmaj9": ["G2", "D3", "F#3", "A3", "B3"],
    "A6sus": ["A2", "E3", "F#3", "B3", "D4"],
    "D69": ["D3", "A3", "B3", "E4", "F#4", "A4"],
}
ROOTS = {"Dmaj9": "D2", "Bm9": "B1", "Gmaj9": "G1", "A6sus": "A1"}
PLAN = [(3.6, 6.0, "Dmaj9"), (6.0, 8.0, "Bm9"), (8.0, 10.0, "Gmaj9"), (10.0, 12.25, "A6sus")]
for i, (a, b, name) in enumerate(PLAN):
    cutoff = {3.6: 1300, 6.0: 1700, 8.0: 2100}.get(a, 2500)
    ch = pad_chord([hz(x) for x in CHORDS[name]], b - a, attack=1.4 if a == 3.6 else 0.4, release=1.2, cutoff=cutoff, width=0.85, seed=i)
    music.add(ch, a, db(-18))
    verb_send.add(ch, a, db(-22))

# The strip of light: a soft shimmer that crosses the stereo field with it.
sw = T["sweepEnd"] - T["sweep"]
ns = secs(sw)
u = tt(ns) / sw
shine = sweep_lp(hp(noise(ns), 3000), 4000 + 8000 * np.sin(np.pi * u)) * np.sin(np.pi * u) ** 2
sfx.add(pan(shine, -0.8 + 1.6 * u), T["sweep"], db(-33))
glint = bell(hz("A6"), 2.0, 0.5)
sfx.add(glint, T["sweep"] + sw * 0.55, db(-32), 0.2)
verb_send.add(glint, T["sweep"] + sw * 0.55, db(-24), 0.2)
# The screen wakes; the line arrives.
sfx.add(ui_tick(0.7, 2200), T["screenOn"], db(-28))
x = bell(hz("F#5"), 2.6, 0.5)
music.add(x, T["screenOn"] + 0.05, db(-30))
verb_send.add(x, T["screenOn"] + 0.05, db(-22))
for k, note in enumerate(["A4", "D5", "E5"]):
    x = pluck(hz(note), 1.6, 0.7, 0.55)
    music.add(x, T["line2"] + 0.25 * k, db(-31), 0.15)
    verb_send.add(x, T["line2"] + 0.25 * k, db(-24), 0.15)
sfx.add(whoosh(1.4, 120, 1600, 0.6, 1.0, 0.0, 0.0), T["phoneIn"] + 0.3, db(-32))

# --------------------------------------------------------------------------
# 3 — the product turn: the music gathers gently

def pulse(start, end, kick_vel, tick_level, hats):
    b, i = start, 0
    while b < end - 1e-6:
        if kick_vel:
            drums.add(kick(kick_vel), b, db(-18))
        for s in range(2):
            ts = b + s * BEAT / 2
            if ts < end:
                drums.add(counter_click(1.0 if s == 0 else 0.6), ts, db(tick_level), 0.3 * (-1) ** i)
        if hats:
            for s16 in range(4):
                ts = b + s16 * BEAT / 4
                if ts < end:
                    drums.add(hat([0.8, 0.3, 0.55, 0.3][s16]), ts, db(-33), 0.2)
        b += BEAT
        i += 1


pulse(6.0, 8.0, 0.4, -26, False)
pulse(8.0, 9.0, 0.5, -24, False)
pulse(9.0, 12.0, 0.6, -23, True)

for a, b, name in PLAN:
    if a < 8.0:
        continue
    root = hz(ROOTS[name])
    tpos, k = a, 0
    while tpos < min(b, 12.0) - 1e-6:
        music.add(lp(bass_note(root, BEAT / 2 * 0.88, 0.9 if k % 2 == 0 else 0.6), 1200), tpos, db(-21))
        tpos += BEAT / 2
        k += 1
for a, b, name in PLAN:
    if a < 6.0:
        continue
    notes = CHORDS[name]
    seq = [hz(x) * 2 for x in [notes[1], notes[2], notes[3], notes[4], notes[3], notes[2]]]
    tpos, k = max(a, 7.0), 0
    while tpos < min(b, 12.0) - 1e-6:
        x = pluck(seq[k % len(seq)], 0.8, 1.0, 0.8 if k % 2 == 0 else 0.55)
        music.add(x, tpos, db(-31), 0.35 * np.sin(k * 1.7))
        verb_send.add(x, tpos, db(-27))
        tpos += BEAT / 2
        k += 1

# Layers lift on 8ths with soft whooshes and come home on clicks.
sfx.add(whoosh(0.8, 250, 2600, 0.6, 0.8, -0.3, 0.3), T["turn"], db(-32))
for k in range(6):
    sfx.add(whoosh(0.7, 300 + 80 * k, 3000 + 400 * k, 0.35, 0.8, -0.5 + 0.2 * k, -0.2 + 0.2 * k), T["explode"] + 0.125 * k, db(-32))
for k, at in enumerate([T["assembleClicks"][0] - 0.125] + list(T["assembleClicks"])):
    sfx.add(whoosh(0.5, 400, 3600, 0.85, 0.7, 0.4 - 0.2 * k, 0.0), at - 0.45, db(-35))
    c = mech_click(0.9, 1.1 + 0.07 * k)
    sfx.add(c, at, db(-16), 0.15 * (-1) ** k)
    verb_send.add(c, at, db(-29))
for at in [T["glimpse1"], T["glimpse2"], T["glimpse3"]]:
    sfx.add(ui_tick(0.8, 2400), at, db(-27))
# "Meet Disband."
x = bell(hz("D6"), 3.0, 0.6) + bell(hz("A5"), 3.0, 0.4)
music.add(x, T["meet"], db(-28))
verb_send.add(x, T["meet"], db(-19))

# --------------------------------------------------------------------------
# 4 & 5 — the recede, the white, the mark; the resolve and the call to action

sfx.add(whoosh(1.2, 120, 1400, 0.5, 1.0, 0.0, 0.0), T["recede"], db(-28))
music.add(pan(riser(T["silhouette"] - T["white"] + 0.3, 600, 12000, 0.9, 2.0), 0.0), T["white"] - 0.3, db(-30))
sfx.add(ui_tick(0.6, 1800), T["silhouette"], db(-30))
sfx.add(whoosh(T["morphEnd"] - T["silhouette"], 200, 2600, 0.8, 0.8, 0.0, 0.0), T["silhouette"], db(-31))
music.add(boom(0.7, 3.0, 52, 32), RESOLVE, db(-17))
sfx.add(mech_click(0.7, 0.85), RESOLVE, db(-17))
res = pad_chord([hz(x) for x in CHORDS["Dmaj9"] + ["A4"]], T["endMove"] - RESOLVE, attack=0.35, release=1.5, cutoff=2600, width=0.95, seed=91)
music.add(res, RESOLVE, db(-17))
verb_send.add(res, RESOLVE, db(-11))
sub = osc_sine(hz("D1"), secs(5)) * np.exp(-tt(secs(5)) / 2.5) * np.minimum(1, tt(secs(5)) / 0.08)
music.add(sub, RESOLVE, db(-22))
shimmer = sum(bell(hz(x), 4.0, 0.45) for x in ["F#6", "A6", "C#7"])
verb_send.add(shimmer, RESOLVE, db(-22))
x = bell(hz("A5"), 3.0, 0.6)
music.add(x, T["slogan"], db(-26), 0.1)
verb_send.add(x, T["slogan"], db(-17), 0.1)

final = pad_chord([hz(x) for x in CHORDS["D69"]], DUR - T["endMove"] - 0.8, attack=0.6, release=1.6, cutoff=2400, width=0.95, seed=99)
music.add(final, T["endMove"], db(-18))
verb_send.add(final, T["endMove"], db(-12))
sfx.add(whoosh(0.8, 200, 2200, 0.6, 0.6, 0.0, 0.0), T["endMove"], db(-33))
for at, note, v in [(T["endTitle"], "D6", 0.75), (T["endLine"], "B5", 0.55), (T["endUrl"], "A5", 0.8), (T["endHold"], "F#5", 0.6)]:
    x = bell(hz(note), 3.2, v)
    music.add(x, at, db(-25), 0.12)
    verb_send.add(x, at, db(-16), 0.12)

# --------------------------------------------------------------------------
# Mix

# The dead stop: the noise and its reverb end on the freeze frame.
cut = secs(FREEZE)
noise_dry = noise_bus.x.copy()
noise_verb = convolve(np.concatenate([noise_dry[:cut], np.zeros_like(noise_dry[cut:])]), reverb_ir(1.6, 0.012, 1.0, seed=5))
for x_ in (noise_dry, noise_verb):
    x_[cut:] = 0
    x_[cut - secs(0.004):cut] *= np.linspace(1, 0, secs(0.004))[:, None]

verb = convolve(verb_send.x, reverb_ir(3.0, 0.028, 0.95))
room = convolve(sfx.x, reverb_ir(0.7, 0.006, 1.1, seed=3))
mix = noise_dry + noise_verb * db(-8) + music.x + drums.x + sfx.x + verb * db(-3) + room * db(-17)
if os.environ.get("STEMS"):
    sections = [(0, 3), (3, 6), (6, 12), (12, 16), (16, 20)]
    for name, bus in [("noise", noise_dry), ("music", music.x), ("drums", drums.x), ("sfx", sfx.x), ("verb", verb * db(-3))]:
        print(f"{name:6s}", " ".join(f"{20 * np.log10(np.sqrt(np.mean(bus[secs(a):secs(b)] ** 2)) + 1e-9):6.1f}" for a, b in sections))
mix = hp(mix, 26, 4)
mix = mix + (db(2.0) - 1) * hp(mix, 8000, 1)

rms = np.sqrt(np.maximum(signal.sosfilt(sos("lowpass", 6), np.mean(mix ** 2, axis=1)), 0) + 1e-9)
thresh = db(-21)
gain = np.where(rms > thresh, (rms / thresh) ** (1 / 2.2 - 1), 1.0)
mix *= gain[:, None]

mix = mix[:N]
fade = secs(1.4)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix[: secs(0.01)] *= np.linspace(0, 1, secs(0.01))[:, None]

# Social platforms normalise to about -14 LUFS.
master(mix, "loud-mix.wav", -14.0)
