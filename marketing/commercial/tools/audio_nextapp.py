#!/usr/bin/env python3
"""Soundtrack and sound design for the 9:16 social spot "Not another boring app."

Same synth toolkit as the other films (tools/audiolib.py), 120 BPM in E minor.
A breath of air, a spinning whoosh into a sharp hit as the phone lands, the
beat from the first headline, cut accents through the product shots, a build
under the three words to a G major climax on the mark, and a clean resolve
as the mark locks in beside the phone.

    node tools/timeline-json.mjs nextapp/timeline.js build/nextapp-timeline.json
    TIMELINE=build/nextapp-timeline.json python3 tools/audio_nextapp.py
        -> build/audio/nextapp-mix.wav
"""
import os

import numpy as np
from scipy import signal

from audiolib import *  # noqa: F401,F403  (SR, T, DUR, BEAT, N, rng, instruments, effects)

LAND = T["land"]
BEAT0 = T["beat"]
BUILD = T["shotFEnd"]          # 10 s: black, the words
CLIMAX = T["climax"]
CALM = T["white"]
LOCK = T["lock"]

music, drums, sfx, verb_send = Bus(), Bus(), Bus(), Bus()

CHORDS = {
    "Em9": ["E3", "B3", "D4", "F#4", "G4"],
    "Cmaj9": ["C3", "G3", "B3", "D4", "E4"],
    "G6": ["G2", "D3", "E3", "B3", "D4"],
    "Dsus": ["D3", "A3", "D4", "E4", "G4"],
    "Am11": ["A2", "E3", "G3", "C4", "D4"],
    "Gadd9": ["G2", "D3", "A3", "B3", "D4", "G4"],
    "G69": ["G2", "D3", "A3", "B3", "E4", "G4"],
}
ROOTS = {"Em9": "E1", "Cmaj9": "C2", "G6": "G1", "Dsus": "D2", "Am11": "A1", "Gadd9": "G1"}
PLAN = [
    (0.0, BEAT0, "Em9"), (BEAT0, 3.0, "Em9"), (3.0, 5.0, "Cmaj9"), (5.0, 7.0, "G6"), (7.0, 9.0, "Dsus"), (9.0, BUILD, "Am11"),
    (BUILD, 11.25, "Em9"), (11.25, 12.25, "Cmaj9"), (12.25, CLIMAX, "Dsus"), (CLIMAX, CALM, "Gadd9"),
]

# --------------------------------------------------------------------------
# Music

# A breath of air before anything moves.
n = secs(1.2)
air = hp(lp(noise(n), 5000), 600) * np.clip(tt(n) / 0.25, 0, 1) * np.clip((1.2 - tt(n)) / 0.6, 0, 1)
music.add(pan(air, -0.3) * 0.6 + pan(np.roll(air, 900), 0.3) * 0.6, 0.0, db(-40))

for i, (a, b, name) in enumerate(PLAN):
    cutoff = 1200 if a < BEAT0 else (2400 if a < BUILD else (1500 + 1600 * (a - BUILD) / 3) if a < CLIMAX else 3200)
    level = -24 if a < BEAT0 else -21
    ch = pad_chord([hz(x) for x in CHORDS[name]], b - a, attack=0.25 if a < BEAT0 else 0.06, release=0.5, cutoff=cutoff, width=0.85, seed=i)
    music.add(ch, a, db(level))
    verb_send.add(ch, a, db(level - 5))

# Deep, controlled bass: 8ths through the groove, held roots under the build.
for a, b, name in PLAN:
    if a < BEAT0 or name not in ROOTS:
        continue
    root = hz(ROOTS[name])
    if BUILD <= a < CLIMAX:
        m = secs(b - a + 0.1)
        x = osc_sine(root, m) * np.minimum(1, tt(m) / 0.05) * np.clip((b - a + 0.1 - tt(m)) / 0.1, 0, 1)
        music.add(np.tanh(1.5 * x), a, db(-21))
        continue
    tpos, k = a, 0
    while tpos < b - 1e-6:
        music.add(lp(bass_note(root, BEAT / 2 * 0.85, 1.0 if k % 2 == 0 else 0.7), 1400), tpos, db(-17))
        tpos += BEAT / 2
        k += 1

# Airy arpeggio in 16ths through the product shots and the climax.
for a, b, name in PLAN:
    if not (5.0 <= a < BUILD or a >= CLIMAX):
        continue
    notes = CHORDS[name]
    seq = [hz(x) * 2 for x in [notes[1], notes[2], notes[3], notes[4], notes[3], notes[2], notes[1], notes[3]]]
    tpos, k = a, 0
    while tpos < b - 1e-6:
        x = pluck(seq[k % len(seq)], 0.55, 1.5, 0.8 if k % 2 == 0 else 0.5)
        music.add(x, tpos, db(-31), 0.4 * np.sin(k * 1.3))
        verb_send.add(x, tpos, db(-28))
        tpos += BEAT / 4
        k += 1

# --------------------------------------------------------------------------
# Percussion

def click(vel=1.0):
    n = secs(0.03)
    t = tt(n)
    return (bp(noise(n), 2500, 9000) * np.exp(-t / 0.0018) + 0.4 * np.sin(2 * np.pi * 3100 * t) * np.exp(-t / 0.004)) * vel


def groove(start, end, level):
    """1: kick, hats on 8ths, clicks; 2: + clap, 16th hats, shaker."""
    b, i = start, 0
    while b < end - 1e-6:
        drums.add(kick(1.0 if level >= 2 else 0.8), b, db(-13 if level >= 2 else -15))
        if i % 4 in (1, 3):
            c = clap(0.9 if level >= 2 else 0.7)
            drums.add(c, b, db(-24 if level >= 2 else -27))
            verb_send.add(c, b, db(-21))
        for s16 in range(4):
            ts = b + s16 * BEAT / 4
            if ts >= end:
                break
            if level >= 2 or s16 % 2 == 0:
                drums.add(hat([0.9, 0.35, 0.6, 0.35][s16]), ts, db(-29), 0.2)
            if s16 in (1, 3):
                drums.add(click(0.8), ts, db(-28), 0.35 * (-1) ** s16)
            if level >= 2 and s16 in (1, 3):
                drums.add(shaker(0.8), ts, db(-34), -0.3)
        b += BEAT
        i += 1


groove(BEAT0, 5.0, 1)
groove(5.0, BUILD - 0.25, 2)
groove(CLIMAX, CALM, 2)

# The build under the words: no kick, then kicks in 8ths and claps in 16ths
# through the last beat before the climax.
for at in np.arange(BUILD + 0.25, CLIMAX - 1e-6, BEAT / 4):
    drums.add(hat(0.5 + 0.4 * ((at - BUILD) / (CLIMAX - BUILD))), at, db(-31), 0.2)
for at in np.arange(12.25, CLIMAX - 1e-6, BEAT / 2):
    drums.add(kick(0.8), at, db(-16))
roll = np.arange(12.5, CLIMAX - 1e-6, BEAT / 4)
for k, at in enumerate(roll):
    c = clap(0.4 + 0.6 * k / max(1, len(roll) - 1))
    drums.add(c, at, db(-30 + 7 * k / max(1, len(roll) - 1)))
    verb_send.add(c, at, db(-25))
music.add(pan(riser(CLIMAX - BUILD, 250, 12000, 1.0, 2.6), 0.0), BUILD, db(-27))

# --------------------------------------------------------------------------
# Sound design, placed from the timeline

def stab(chord, vel=0.8):
    return sum(pluck(hz(x) * 2, 0.9, 1.9, vel) for x in CHORDS[chord][1:])


# 1 — the spin: a whoosh that flutters with the turns, then the hit.
d = LAND - T["phoneIn"]
ns = secs(d + 0.05)
u = tt(ns) / d
spin = whoosh(d + 0.05, 500, 7000, 0.85, 1.0, 0.9, 0.0)
spin *= (0.65 + 0.35 * np.abs(np.sin(2 * np.pi * (1.25 * 2) * u ** 0.45)))[:, None]
sfx.add(spin, T["phoneIn"], db(-22))
sfx.add(mech_click(1.0, 1.0), LAND, db(-9))
sfx.add(lp(boom(0.8, 0.9, 80, 48), 500), LAND, db(-15))
sfx.add(hp(noise(secs(0.05)), 3500) * np.exp(-tt(secs(0.05)) / 0.006), LAND, db(-18))
x = stab("Em9", 0.9)
music.add(x, LAND, db(-18))
verb_send.add(x, LAND, db(-12))
sfx.add(whoosh(0.3, 800, 6000, 0.8, 0.6, 0.6, 0.0), LAND - 0.26, db(-30))
sfx.add(whoosh(0.3, 900, 4800, 0.3, 0.6, 0.0, -0.8), T["line1Out"], db(-31))

# 2 — face, lift, the spread, MEET DISBAND., the flight into the dark.
sfx.add(whoosh(0.5, 300, 3000, 0.7, 0.8, 0.0, 0.0), T["face"], db(-30))
sfx.add(whoosh(0.6, 400, 6000, 0.5, 1.0, 0.0, 0.0), T["lift"] - 0.05, db(-25))
sfx.add(ui_tick(0.8, 2600), T["lift"], db(-26))
for i in range(4):
    p = 0.7 if i % 2 == 0 else -0.7
    sfx.add(whoosh(0.4, 500, 5200, 0.4, 0.8, 0.0, p), T["spread"] + i * 0.125, db(-29))
x = stab("Cmaj9", 0.9)
music.add(x, T["meet"], db(-18))
verb_send.add(x, T["meet"], db(-12))
sfx.add(lp(boom(0.8, 0.8, 76, 46), 500), T["meet"], db(-16))
sfx.add(mech_click(0.8, 1.2), T["meet"], db(-17))
sfx.add(whoosh(T["shotHeroEnd"] - T["flyInto"] + 0.05, 300, 9000, 0.95, 1.0, 0.0, 0.0), T["flyInto"], db(-24))
sfx.add(lp(boom(0.8, 0.6, 70, 44), 600), T["shotA"], db(-16))

# 3 — the cuts: a tick on every cut, the moves in each shot.
for at in [T["shotB"], T["shotC"], T["shotD"], T["shotE"], T["shotF"]]:
    sfx.add(click(1.0), at, db(-20))
sfx.add(whoosh(0.7, 300, 4200, 0.7, 0.9, -0.4, 0.2), T["shotA"] + 0.05, db(-27))
sfx.add(mech_click(0.8, 1.15), T["aLand"], db(-17))
sfx.add(whoosh(0.35, 600, 5600, 0.6, 0.8, 0.0, 0.0), T["bOut"] - 0.1, db(-27))
sfx.add(mech_click(0.7, 1.3), T["shotC"] - 0.05, db(-20))
sfx.add(whoosh(0.3, 900, 5200, 0.4, 0.6, 0.6, -0.4), T["cPush"], db(-29))
sfx.add(ui_tick(0.8, 2400), T["cPush"] + 0.3, db(-26))
mid = (T["shotD"] + T["shotE"]) / 2
sfx.add(whoosh(T["shotE"] - T["shotD"], 300, 5000, 0.5, 1.0, -0.9, 0.9), T["shotD"], db(-25))
sfx.add(whoosh(T["shotE"] - T["shotD"], 200, 2600, 0.5, 0.8, 0.9, -0.9), T["shotD"], db(-29))
sfx.add(lp(boom(0.5, 0.5, 90, 60), 400), mid, db(-23))
for i in range(3):
    sfx.add(whoosh(0.45, 400, 4600, 0.8, 0.7, [-0.8, 0.0, 0.8][i], [-0.3, 0.0, 0.3][i]), T["shotE"] + i * 0.06, db(-30))
sfx.add(mech_click(1.0, 0.95), T["eAlign"], db(-14))
sfx.add(whoosh(T["shotFEnd"] - T["shotF"], 200, 6000, 0.8, 1.0, 0.0, 0.0), T["shotF"], db(-25))
music.add(boom(0.8, 1.2, 60, 38), T["shotFEnd"] - 0.2, db(-18))

# 4 — the words: three accents, the flip, the climax.
x = stab("Em9", 0.9)
music.add(x, T["your"], db(-18))
verb_send.add(x, T["your"], db(-11))
sfx.add(lp(boom(0.8, 0.9, 74, 44), 500), T["your"], db(-15))
sfx.add(whoosh(0.3, 600, 7000, 0.85, 0.7, 0.0, 0.0), T["your"] - 0.26, db(-29))
sfx.add(whoosh(0.25, 800, 5000, 0.2, 0.6, 0.0, 0.0), T["yourOut"], db(-32))
x = stab("Cmaj9", 0.9)
music.add(x, T["people"], db(-18))
verb_send.add(x, T["people"], db(-11))
sfx.add(lp(boom(0.8, 0.9, 74, 44), 500), T["people"], db(-15))
sfx.add(whoosh(0.45, 500, 5600, 0.55, 0.9, 0.9, -0.1), T["people"] - 0.12, db(-26))
sfx.add(whoosh(0.3, 700, 5000, 0.3, 0.7, 0.0, -0.9), T["peopleOut"], db(-30))
x = stab("Dsus", 0.9)
music.add(x, T["disband"], db(-18))
verb_send.add(x, T["disband"], db(-11))
sfx.add(lp(boom(0.8, 0.9, 74, 44), 500), T["disband"], db(-15))
for i in range(8):
    sfx.add(click(0.7), T["disband"] + i * 0.03, db(-31), -0.6 + 0.17 * i)
sfx.add(whoosh(T["climax"] - T["flip"], 400, 8000, 0.6, 0.9, -0.3, 0.3), T["flip"], db(-25))
music.add(boom(1.0, 2.2, 58, 34), CLIMAX, db(-13))
sfx.add(mech_click(1.0, 0.9), CLIMAX, db(-12))
big = stab("Gadd9", 1.0)
music.add(big, CLIMAX, db(-16))
verb_send.add(big, CLIMAX, db(-9))
crash = hp(noise(secs(2.0)), 4000) * np.exp(-tt(secs(2.0)) / 0.6)
music.add(pan(crash, -0.3) * 0.7 + pan(np.roll(crash, 600), 0.3) * 0.7, CLIMAX, db(-30))
shimmer = sum(bell(hz(x), 3.0, 0.5) for x in ["G6", "B6", "D7"])
verb_send.add(shimmer, CLIMAX, db(-20))

# 5 — white; the phone glides in; the mark locks; the lines; a clean ending.
sfx.add(whoosh(0.6, 300, 3600, 0.6, 0.6, 0.0, 0.0), CALM, db(-32))
calm = pad_chord([hz(x) for x in CHORDS["Cmaj9"]], LOCK - CALM, attack=0.3, release=0.8, cutoff=2400, width=0.9, seed=71)
music.add(calm, CALM, db(-19))
verb_send.add(calm, CALM, db(-13))
sfx.add(whoosh(T["lock"] - T["settle"], 300, 4200, 0.55, 0.9, 0.9, 0.2), T["settle"], db(-27))
sfx.add(mech_click(0.9, 0.85), LOCK, db(-13))
sfx.add(lp(boom(0.6, 1.6, 56, 36), 400), LOCK, db(-19))
final = pad_chord([hz(x) for x in CHORDS["G69"]], DUR - LOCK - 0.8, attack=0.2, release=1.6, cutoff=2600, width=0.95, seed=99)
music.add(final, LOCK, db(-17))
verb_send.add(final, LOCK, db(-11))
sub = osc_sine(hz("G1"), secs(4)) * np.exp(-tt(secs(4)) / 2.2) * np.minimum(1, tt(secs(4)) / 0.06)
music.add(sub, LOCK, db(-21))
for at, note, v in [(T["slogan"], "B5", 0.6), (T["explore"], "D6", 0.6), (T["url"], "G5", 0.8), (T["endHold"], "D5", 0.6)]:
    x = bell(hz(note), 3.0, v)
    music.add(x, at, db(-25), 0.12)
    verb_send.add(x, at, db(-16), 0.12)

# --------------------------------------------------------------------------
# Mix

duck = np.ones(len(music.x))
for lo, hi in [(BEAT0, BUILD - 0.25), (CLIMAX, CALM)]:
    for a in np.arange(lo, hi, BEAT):
        i, m = secs(a), secs(0.24)
        duck[i:i + m] = np.minimum(duck[i:i + m], 1 - 0.3 * np.exp(-tt(m) / 0.08))
music.x *= duck[:, None]

# The build under the words starts lower and climbs into the climax.
ramp = np.ones(len(music.x))
i0, i1 = secs(BUILD), secs(CLIMAX)
ramp[i0:i1] = db(-5.0 + 5.0 * np.linspace(0, 1, i1 - i0) ** 1.6)
music.x *= ramp[:, None]
drums.x *= ramp[:, None]

verb = convolve(verb_send.x, reverb_ir(2.4, 0.02, 1.1))
room = convolve(sfx.x, reverb_ir(0.6, 0.006, 1.2, seed=3))
mix = music.x + drums.x + sfx.x + verb * db(-3) + room * db(-17)
if os.environ.get("STEMS"):
    sections = [(0, 2), (2, 5), (5, 10), (10, 14), (14, 20)]
    for name, bus in [("music", music.x), ("drums", drums.x), ("sfx", sfx.x), ("verb", verb * db(-3))]:
        print(f"{name:6s}", " ".join(f"{20 * np.log10(np.sqrt(np.mean(bus[secs(a):secs(b)] ** 2)) + 1e-9):6.1f}" for a, b in sections))
mix = hp(mix, 30, 4)
mix = mix + (db(2.5) - 1) * hp(mix, 7500, 1)

rms = np.sqrt(np.maximum(signal.sosfilt(sos("lowpass", 6), np.mean(mix ** 2, axis=1)), 0) + 1e-9)
thresh = db(-20)
gain = np.where(rms > thresh, (rms / thresh) ** (1 / 2.3 - 1), 1.0)
mix *= gain[:, None]

mix = mix[:N]
fade = secs(1.3)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix[: secs(0.01)] *= np.linspace(0, 1, secs(0.01))[:, None]

# Social platforms normalise to about -14 LUFS.
master(mix, "nextapp-mix.wav", -14.0)
