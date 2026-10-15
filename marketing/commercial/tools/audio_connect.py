#!/usr/bin/env python3
"""Soundtrack and sound design for the 9:16 social spot "A New Way to Connect."

Bright and rhythmic, on the same synth toolkit as the other films
(tools/audiolib.py): 120 BPM in A major. A distinctive cue on the shape-to-logo
cut, a warm pulse when the phone enters, a build through the device shots, the
lift at 10 s with the words on its accents, and an airy, settled ending.

    node tools/timeline-json.mjs connect/timeline.js build/connect-timeline.json
    TIMELINE=build/connect-timeline.json python3 tools/audio_connect.py
        -> build/audio/connect-mix.wav
"""
import os

import numpy as np
from scipy import signal

from audiolib import *  # noqa: F401,F403  (SR, T, DUR, BEAT, N, rng, instruments, effects)

DROP = T["drop"]
CALM = T["calm"]
PULSE = T["shotConverge"]

music, drums, sfx, verb_send = Bus(), Bus(), Bus(), Bus()

CHORDS = {
    "Amaj9": ["A2", "E3", "G#3", "B3", "C#4"],
    "F#m11": ["F#2", "C#3", "E3", "A3", "B3"],
    "Dmaj9": ["D3", "A3", "C#4", "E4", "F#4"],
    "E6sus": ["E2", "B2", "C#3", "F#3", "A3"],
    "Aadd9": ["A2", "E3", "A3", "B3", "C#4", "E4"],
}
ROOTS = {"Amaj9": "A1", "F#m11": "F#1", "Dmaj9": "D2", "E6sus": "E1", "Aadd9": "A1"}
PLAN = [
    (T["match"], 2.0, "Amaj9"), (2.0, 4.0, "Amaj9"), (4.0, 6.0, "F#m11"), (6.0, 8.0, "Dmaj9"), (8.0, DROP, "E6sus"),
    (DROP, 11.0, "Amaj9"), (11.0, 12.0, "F#m11"), (12.0, 13.0, "Dmaj9"), (13.0, T["logoResolve"], "E6sus"),
    (T["logoResolve"], CALM, "Aadd9"), (CALM, 17.0, "Dmaj9"), (17.0, DUR, "Aadd9"),
]

# --------------------------------------------------------------------------
# Music

for i, (a, b, name) in enumerate(PLAN):
    if a >= CALM:
        continue
    lifted = DROP <= a < CALM
    cutoff = 1500 if a < 6.0 else (2100 if a < DROP else 3000)
    level = -21 if a < 2.0 else (-20 if not lifted else -21)
    ch = pad_chord([hz(x) for x in CHORDS[name]], b - a, attack=0.5 if a < 2.0 else 0.08, release=0.6, cutoff=cutoff, width=0.85, seed=i)
    music.add(ch, a, db(level))
    verb_send.add(ch, a, db(level - 5))

# Warm low end: a rounded 8th pulse from the phone's entrance, fuller after the lift.
for a, b, name in PLAN:
    if a < PULSE or a >= CALM:
        continue
    root = hz(ROOTS[name])
    tpos, k = a, 0
    while tpos < b - 1e-6:
        if a >= DROP or k % 2 == 0 or a >= 6.0:
            vel = (1.0 if k % 2 == 0 else 0.7) * (1.0 if a >= DROP else 0.8)
            music.add(lp(bass_note(root, BEAT / 2 * 0.85, vel), 900 if a < DROP else 1600), tpos, db(-17 if a >= DROP else -19))
        tpos += BEAT / 2
        k += 1

# Airy plucked arpeggio in 16ths from the device sequence, 8ths before it.
for a, b, name in PLAN:
    if a < 4.0 or a >= CALM:
        continue
    notes = CHORDS[name]
    seq = [hz(x) * 2 for x in [notes[1], notes[2], notes[3], notes[4], notes[3], notes[2], notes[1], notes[3]]]
    step = BEAT / 4 if a >= 6.0 else BEAT / 2
    tpos, k = a, 0
    while tpos < b - 1e-6:
        lifted = a >= DROP
        vel = (0.85 if k % 2 == 0 else 0.55) * (1.0 if lifted else 0.75)
        x = pluck(seq[k % len(seq)], 0.6, 1.5 if lifted else 1.1, vel)
        p = 0.4 * np.sin(k * 1.3)
        music.add(x, tpos, db(-29 if lifted else -31), p)
        verb_send.add(x, tpos, db(-27), p)
        tpos += step
        k += 1

# A note under each word as it lands.
for at, note in zip(T["words1"], ["E5", "F#5", "G#5", "B5", "C#6"]):
    x = pluck(hz(note), 0.9, 1.4, 0.55)
    music.add(x, at, db(-29), 0.15)
    verb_send.add(x, at, db(-23), 0.15)
for at, note in zip(T["words2"], ["F#5", "A5", "C#6", "E6"]):
    x = pluck(hz(note), 0.9, 1.4, 0.55)
    music.add(x, at, db(-29), -0.15)
    verb_send.add(x, at, db(-23), -0.15)

# --------------------------------------------------------------------------
# Percussion: rhythmic clicks from the phone's entrance, the full kit at the lift.

def click(vel=1.0):
    """Short, dry mechanical tick for the rhythm bed."""
    n = secs(0.03)
    t = tt(n)
    return (bp(noise(n), 2500, 9000) * np.exp(-t / 0.0018) + 0.4 * np.sin(2 * np.pi * 3100 * t) * np.exp(-t / 0.004)) * vel


def kit(start, end, level):
    """level 1: kick + clicks; 2: + hats; 3: full (clap, shaker, 16th hats)."""
    b, i = start, 0
    while b < end - 1e-6:
        bar_beat = i % 4
        drums.add(kick(0.55 if level < 3 else 1.0), b, db(-19 if level < 3 else -13))
        if level >= 3 and bar_beat in (1, 3):
            c = clap(0.9)
            drums.add(c, b, db(-24))
            verb_send.add(c, b, db(-20))
        for s16 in range(4):
            ts = b + s16 * BEAT / 4
            if ts >= end:
                break
            if s16 in (1, 3) or level >= 3:
                drums.add(click([0.5, 0.9, 0.55, 0.8][s16]), ts, db(-27 if level < 3 else -29), 0.35 * (-1) ** s16)
            if level >= 2 and (level >= 3 or s16 % 2 == 0):
                drums.add(hat([0.85, 0.35, 0.6, 0.35][s16]), ts, db(-31 if level < 3 else -29), 0.2)
            if level >= 3 and s16 in (1, 3):
                drums.add(shaker(0.8), ts, db(-34), -0.3)
        b += BEAT
        i += 1


kit(PULSE, 6.0, 1)
kit(6.0, 9.0, 2)
# The last bar before the lift: claps rolling up in 8ths then 16ths.
kit(9.0, DROP - BEAT / 2, 1)
for k, at in enumerate(np.concatenate([np.arange(9.0, 9.5, BEAT / 2), np.arange(9.5, DROP - 1e-6, BEAT / 4)])):
    c = clap(0.4 + 0.6 * k / 7)
    drums.add(c, at, db(-30 + 6 * k / 7))
    verb_send.add(c, at, db(-26))
kit(DROP, CALM - 0.25, 3)

# The lift into the drop: a riser and a short, precise hit (no trailer boom).
music.add(pan(riser(2.0, 300, 11000, 1.0, 2.2), 0.0), DROP - 2.0, db(-26))

# Word accents: chord stab, a clean low hit and a click on each word.
for at, chord in [(T["simple"], "Amaj9"), (T["social"], "F#m11"), (T["disband"], "Dmaj9")]:
    stab = sum(pluck(hz(x) * 2, 0.9, 1.8, 0.8) for x in CHORDS[chord][1:])
    music.add(stab, at, db(-21))
    verb_send.add(stab, at, db(-15))
    sfx.add(lp(boom(0.6, 0.7, 70, 48), 400), at, db(-21))
    sfx.add(mech_click(0.8, 1.25), at, db(-20))
x = whoosh(0.4, 600, 5200, 0.7, 0.8, 0.0, 0.0)
sfx.add(x, T["simple"] - 0.28, db(-30))                      # SIMPLE. drops in from big
sfx.add(whoosh(0.5, 600, 5200, 0.5, 0.9, 0.9, -0.2), T["social"] - 0.05, db(-29))   # SOCIAL. slides from the right
sfx.add(whoosh(0.45, 700, 4800, 0.4, 0.7, 0.2, -0.9), T["socialOut"], db(-31))
sfx.add(whoosh(0.6, 200, 3000, 0.85, 0.9, 0.0, 0.0), T["disband"] - 0.1, db(-29))  # DISBAND. out of the depth

# The word folds into the mark: hit, click and a bright resolving chord.
music.add(boom(0.7, 1.6, 60, 40), T["logoResolve"], db(-18))
sfx.add(mech_click(1.0, 0.9), T["logoResolve"], db(-13))
res = sum(pluck(hz(x) * 2, 1.8, 1.6, 0.7) for x in CHORDS["Aadd9"][1:])
music.add(res, T["logoResolve"], db(-20))
verb_send.add(res, T["logoResolve"], db(-13))
shimmer = sum(bell(hz(x), 3.0, 0.5) for x in ["E6", "A6", "C#7"])
verb_send.add(shimmer, T["logoResolve"], db(-21))

# --------------------------------------------------------------------------
# The calm ending: the groove steps away, an airy pad, bells on the reveals.

end = pad_chord([hz(x) for x in ["D3", "A3", "C#4", "E4", "F#4"]], 17.0 - CALM, attack=0.25, release=1.4, cutoff=2600, width=0.9, seed=81)
music.add(end, CALM, db(-19))
verb_send.add(end, CALM, db(-13))
final = pad_chord([hz(x) for x in ["A2", "E3", "B3", "C#4", "E4", "A4"]], DUR - 17.0 - 0.8, attack=0.8, release=1.6, cutoff=2400, width=0.95, seed=99)
music.add(final, 17.0, db(-18))
verb_send.add(final, 17.0, db(-12))
sub_final = osc_sine(hz("A1"), secs(4)) * np.exp(-tt(secs(4)) / 2.0) * np.minimum(1, tt(secs(4)) / 0.2)
music.add(sub_final, 17.0, db(-24))
for at, note, v in [(T["slogan"], "C#6", 0.7), (T["endLine"], "E6", 0.55), (T["endUrl"], "A5", 0.8), (T["endHold"], "E5", 0.6)]:
    x = bell(hz(note), 3.0, v)
    music.add(x, at, db(-25), 0.12)
    verb_send.add(x, at, db(-16), 0.12)

# --------------------------------------------------------------------------
# Sound design, placed from the timeline

# 1 — the opening cue: the shape tears in, then a sharp, bright snap on the cut.
sfx.add(whoosh(T["match"] + 0.02, 400, 8000, 0.9, 1.0, 0.7, 0.0), 0.0, db(-24))
sfx.add(pan(riser(T["match"], 800, 12000, 0.8, 1.6), 0.3), 0.0, db(-31))
sfx.add(mech_click(1.0, 1.35), T["match"], db(-9))
snap_hit = hp(noise(secs(0.06)), 3000) * np.exp(-tt(secs(0.06)) / 0.006)
sfx.add(snap_hit, T["match"], db(-17))
sfx.add(lp(boom(0.7, 0.9, 82, 52), 500), T["match"], db(-17))
cue = sum(pluck(hz(x) * 2, 1.6, 2.0, 0.8) for x in ["E3", "A3", "B3", "C#4"])
music.add(cue, T["match"], db(-19))
verb_send.add(cue, T["match"], db(-11))
ring = bell(hz("A6"), 2.4, 0.5)
sfx.add(ring, T["match"] + 0.02, db(-28))
verb_send.add(ring, T["match"], db(-20))
sfx.add(whoosh(0.4, 500, 3200, 0.5, 0.6, 0.0, 0.0), T["logoUp"], db(-34))
sfx.add(whoosh(0.4, 800, 4200, 0.4, 0.5, 0.0, 0.3), T["line1Out"], db(-36))

# 2 — the phone from the left, the panel from the right; slot, lift, swap, close.
sfx.add(whoosh(0.7, 300, 4200, 0.6, 1.0, -0.9, -0.1), T["enter"] - 0.05, db(-25))
sfx.add(whoosh(0.65, 400, 5200, 0.6, 0.9, 0.9, 0.2), T["enter"] + 0.02, db(-27))
sfx.add(whoosh(0.7, 400, 3800, 0.85, 0.7, 0.4, 0.0), T["panelLand"] - 0.65, db(-32))
sfx.add(mech_click(0.9, 1.1), T["panelLand"], db(-15))
sfx.add(whoosh(0.5, 500, 4000, 0.4, 0.7, 0.0, 0.0), T["panelLand"], db(-31))
sfx.add(whoosh(0.3, 600, 5600, 0.7, 0.8, 0.0, 0.9), T["swapOut"], db(-29))
sfx.add(whoosh(0.3, 600, 5600, 0.5, 0.8, -0.9, 0.0), T["swapIn"] - 0.05, db(-29))
sfx.add(mech_click(0.7, 1.3), T["swapLand"], db(-19), -0.1)
sfx.add(ui_tick(0.8, 2500), T["swapIn"], db(-27))
sfx.add(whoosh(0.5, 400, 3600, 0.85, 0.7, 0.0, 0.0), T["collapse"], db(-32))
sfx.add(mech_click(0.9, 1.0), T["collapsed"], db(-15))
sfx.add(whoosh(0.5, 300, 4200, 0.7, 0.8, 0.0, 0.0), T["edgeOn"], db(-30))
# The iris: in on a rising swish, black for an instant on a precise hit, open.
sfx.add(whoosh(T["irisFull"] - T["iris"] + 0.05, 300, 7000, 0.95, 1.0, 0.0, 0.0), T["iris"], db(-25))
sfx.add(lp(boom(0.8, 0.8, 74, 46), 600), T["irisFull"], db(-17))
sfx.add(mech_click(0.8, 0.8), T["irisFull"], db(-17))
sfx.add(whoosh(0.4, 1200, 6000, 0.15, 0.7, 0.0, 0.0), T["irisFull"] + 0.02, db(-30))

# 3 — the second phone slides in; the screens change; the push into the lift.
sfx.add(whoosh(0.7, 350, 4600, 0.4, 1.0, 0.9, 0.3), T["pairJoin"] - 0.05, db(-26))
sfx.add(lp(boom(0.4, 0.5, 90, 60), 300), T["pairJoin"] + 0.45, db(-26))
for at in [T["glimpse1"], T["glimpse2"]]:
    sfx.add(ui_tick(0.8, 2400), at, db(-26))
sfx.add(whoosh(0.4, 800, 4200, 0.4, 0.5, 0.0, 0.3), T["line2Out"], db(-36))
sfx.add(whoosh(T["shotPairEnd"] - T["pushIn"], 300, 9000, 0.95, 1.0, 0.0, 0.0), T["pushIn"], db(-27))

# 4 — the phone spins in on the lift; the phones fly away before DISBAND.
sfx.add(whoosh(0.5, 400, 6000, 0.3, 1.0, 0.0, 0.0), DROP, db(-26))
sfx.add(whoosh(0.6, 300, 4800, 0.7, 0.9, 0.0, 0.0), T["phonesAway"], db(-28))

# 5 — the mark glides up; the address lands.
sfx.add(whoosh(0.8, 200, 2200, 0.6, 0.6, 0.0, 0.0), CALM, db(-33))
sfx.add(ui_tick(0.7, 2200), T["endUrl"] + 0.3, db(-30))

# --------------------------------------------------------------------------
# Mix

duck = np.ones(len(music.x))
for a in np.arange(DROP, CALM - 0.25, BEAT):
    i, m = secs(a), secs(0.24)
    duck[i:i + m] = np.minimum(duck[i:i + m], 1 - 0.3 * np.exp(-tt(m) / 0.08))
music.x *= duck[:, None]

# The build: music and kit climb about 5 dB through the device shots into the lift.
ramp = np.ones(len(music.x))
i0, i1 = secs(7.5), secs(DROP)
ramp[i0:i1] = db(5.0 * np.linspace(0, 1, i1 - i0) ** 1.5)
music.x *= ramp[:, None]
drums.x *= ramp[:, None]

verb = convolve(verb_send.x, reverb_ir(2.4, 0.02, 1.1))
room = convolve(sfx.x, reverb_ir(0.6, 0.006, 1.2, seed=3))
mix = music.x + drums.x + sfx.x + verb * db(-3) + room * db(-17)
if os.environ.get("STEMS"):
    sections = [(0, 2), (2, 6), (6, 10), (10, 15), (15, 20)]
    for name, bus in [("music", music.x), ("drums", drums.x), ("sfx", sfx.x), ("verb", verb * db(-3))]:
        print(f"{name:6s}", " ".join(f"{20 * np.log10(np.sqrt(np.mean(bus[secs(a):secs(b)] ** 2)) + 1e-9):6.1f}" for a, b in sections))
mix = hp(mix, 30, 4)
mix = mix + (db(2.5) - 1) * hp(mix, 7500, 1)

rms = np.sqrt(np.maximum(signal.sosfilt(sos("lowpass", 6), np.mean(mix ** 2, axis=1)), 0) + 1e-9)
thresh = db(-21)
gain = np.where(rms > thresh, (rms / thresh) ** (1 / 2.2 - 1), 1.0)
mix *= gain[:, None]

mix = mix[:N]
fade = secs(1.3)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix[: secs(0.005)] *= np.linspace(0, 1, secs(0.005))[:, None]

# Social platforms normalise to about -14 LUFS.
master(mix, "connect-mix.wav", -14.0)
