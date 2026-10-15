#!/usr/bin/env python3
"""Soundtrack and sound design for the 9:16 social spot "Your Space. Your Privacy."

Same synth toolkit as the other films (tools/audiolib.py), darker palette:
120 BPM in D minor while the phone is in the dark, resolving to F major when
the light floods in. Near silence, a low impact on the logo lock, ticking
percussion and a slow build through the exploded phone, a riser into the white
flash, and a spacious resolve on the end card.

    node tools/timeline-json.mjs vertical/timeline.js build/vertical-timeline.json
    TIMELINE=build/vertical-timeline.json python3 tools/audio_vertical.py
        -> build/audio/vertical-mix.wav
"""
import os

import numpy as np
from scipy import signal

from audiolib import *  # noqa: F401,F403  (SR, T, DUR, BEAT, N, rng, instruments, effects)

LIGHT = T["flashPeak"]
END = T["endLogoLand"]

music, drums, sfx, verb_send = Bus(), Bus(), Bus(), Bus()

CHORDS = {
    "Dm9": ["D3", "A3", "C4", "E4", "F4"],
    "Bbmaj9": ["A#2", "F3", "A3", "C4", "D4"],
    "Gm9": ["G2", "D3", "F3", "A3", "A#3"],
    "A7sus": ["A2", "E3", "G3", "D4"],
    "Fmaj9": ["F2", "C3", "E3", "G3", "A3"],
    "Csus": ["C3", "F3", "G3", "D4"],
}
ROOTS = {"Dm9": "D2", "Bbmaj9": "A#1", "Gm9": "G1", "A7sus": "A1", "Fmaj9": "F1", "Csus": "C2"}
PLAN = [
    (2.0, 6.0, "Dm9"), (6.0, 7.75, "Bbmaj9"), (7.75, 8.5, "Gm9"), (8.5, LIGHT, "A7sus"),
    (LIGHT, 11.5, "Fmaj9"), (11.5, 13.5, "Dm9"), (13.5, 15.5, "Bbmaj9"), (15.5, END, "Csus"),
]

# --------------------------------------------------------------------------
# Music

# Distant air and a sub that is felt before it is heard.
n = secs(2.4)
t = tt(n)
drone = osc_sine(hz("D1"), n) + 0.3 * osc_sine(hz("A1"), n)
drone *= np.clip((t - 0.15) / 1.3, 0, 1) ** 2 * np.clip((2.4 - t) / 0.6, 0, 1)
music.add(drone, 0.0, db(-31))
air = hp(lp(noise(secs(DUR)), 2600), 300)
air *= np.clip(tt(secs(DUR)) / 1.5, 0, 1) ** 2 * (0.7 + 0.3 * np.sin(2 * np.pi * 0.11 * tt(secs(DUR))))
music.add(pan(air, 0.0) * 0.6 + pan(np.roll(air, 1400), 0.0) * 0.4, 0.0, db(-50))

# Pads: closed and low in the dark, opening as the shot builds, bright in the light.
for i, (a, b, name) in enumerate(PLAN):
    lit = a >= LIGHT
    cutoff = {2.0: 900, 6.0: 1200, 7.75: 1500, 8.5: 1900}.get(a, 2400)
    level = -18 if not lit else -20
    ch = pad_chord([hz(x) for x in CHORDS[name]], b - a, attack=1.2 if a == 2.0 else 0.3, release=1.0, cutoff=cutoff, width=0.8, seed=i)
    music.add(ch, a, db(level))
    verb_send.add(ch, a, db(level - 4))

# Deep, soft bass: long held roots in the dark, a gentle 8th pulse in the light.
for a, b, name in PLAN:
    root = hz(ROOTS[name])
    if a < LIGHT:
        if a < 6.0:
            continue
        d = b - a
        m = secs(d + 0.3)
        tb = tt(m)
        x = osc_sine(root, m) * np.minimum(1, tb / (1.6 if a == 6.0 else 0.25)) ** 2 * np.clip((d + 0.3 - tb) / 0.3, 0, 1)
        music.add(np.tanh(1.4 * x), a, db(-25 if a == 6.0 else -23))
    else:
        tpos, k = a, 0
        while tpos < min(b, T["phoneOut"]) - 1e-6:
            music.add(bass_note(root, BEAT / 2 * 0.9, 0.9 if k % 2 == 0 else 0.6), tpos, db(-21))
            tpos += BEAT / 2
            k += 1

# A note under each word as it lands.
for at, note in zip(T["words1"], ["A4", "C5", "D5", "E5", "F5"]):
    x = pluck(hz(note), 1.4, 0.7, 0.6)
    music.add(x, at, db(-30), 0.2)
    verb_send.add(x, at, db(-24), 0.2)
for at, note in zip(T["words2"], ["C5", "F5"]):
    x = bell(hz(note), 2.6, 0.6)
    music.add(x, at, db(-28), -0.1)
    verb_send.add(x, at, db(-20), -0.1)
for at, note in zip(T["words3"], ["A4", "C5", "D5", "F5"]):
    x = pluck(hz(note), 1.3, 1.1, 0.6)
    music.add(x, at, db(-30), 0.15)
    verb_send.add(x, at, db(-24), 0.15)

# A soft 8th arpeggio carries the light section.
for a, b, name in PLAN:
    if a < LIGHT:
        continue
    notes = CHORDS[name]
    seq = [hz(x) * 2 for x in [notes[1], notes[2], notes[3], notes[-1], notes[3], notes[2]]]
    tpos, k = max(a, LIGHT + 1.0), 0
    while tpos < min(b, T["phoneOut"]) - 1e-6:
        x = pluck(seq[k % len(seq)], 0.8, 1.0, 0.8 if k % 2 == 0 else 0.55)
        music.add(x, tpos, db(-31), 0.35 * np.sin(k * 1.7))
        verb_send.add(x, tpos, db(-27))
        tpos += BEAT / 2
        k += 1

# --------------------------------------------------------------------------
# Ticking percussion and the pulse

def ticks(start, end, level, hats_from=None, kick_from=None, kick_vel=0.5):
    b, i = start, 0
    while b < end - 1e-6:
        for s8 in range(2):
            ts = b + s8 * BEAT / 2
            if ts < end:
                drums.add(counter_click(1.0 if s8 == 0 else 0.6), ts, db(level), 0.3 * (-1) ** i)
        if hats_from is not None and b >= hats_from:
            for s16 in range(4):
                ts = b + s16 * BEAT / 4
                if ts < end:
                    drums.add(hat([0.8, 0.3, 0.55, 0.3][s16]), ts, db(level - 13), 0.2)
        if kick_from is not None and b >= kick_from:
            drums.add(kick(kick_vel), b, db(-17))
        b += BEAT
        i += 1


ticks(2.0, 6.0, -23)
ticks(6.0, 8.5, -21, hats_from=6.0, kick_from=6.0, kick_vel=0.45)
ticks(8.5, LIGHT - 0.25, -19, hats_from=8.5, kick_from=8.5, kick_vel=0.6)
ticks(LIGHT + 1.0, T["phoneOut"], -23, hats_from=LIGHT + 1.0, kick_from=LIGHT + 1.0, kick_vel=0.55)
for at in np.arange(LIGHT + 1.5, T["phoneOut"], 1.0):
    c = clap(0.7)
    drums.add(c, at, db(-31))
    verb_send.add(c, at, db(-25))

# --------------------------------------------------------------------------
# Sound design, placed from the timeline

# 1 — the beam: a filtered sweep with a high glint as it crosses the mark.
sfx.add(whoosh(T["beamEnd"] - T["beamStart"], 300, 3200, 0.5, 0.9, -0.8, 0.8), T["beamStart"], db(-31))
glint = sum(bell(hz(x), 2.2, 0.4) for x in ["D6", "A6"])
sfx.add(hp(glint, 1500), (T["beamStart"] + T["beamEnd"]) / 2, db(-33), 0.0)
verb_send.add(glint, (T["beamStart"] + T["beamEnd"]) / 2, db(-26))
sfx.add(whoosh(T["logoLock"] - T["logoForward"], 150, 1800, 0.9, 1.0, 0.0, 0.0), T["logoForward"], db(-29))
# The lock: a deep mechanical click and a low cinematic impact.
sfx.add(mech_click(1.0, 0.72), T["logoLock"], db(-8))
sfx.add(lp(mech_click(1.0, 0.5), 900), T["logoLock"] + 0.004, db(-12))
verb_send.add(mech_click(1.0, 0.72), T["logoLock"], db(-22))
music.add(boom(1.0, 2.6, 56, 32), T["logoLock"], db(-13))

# 2 — the phone rises out of the dark; the screen changes.
sfx.add(whoosh(1.6, 150, 2200, 0.65, 1.0, 0.0, 0.0), T["shotDark"] - 0.1, db(-27))
sfx.add(ui_tick(0.8, 2300), T["screenSwitch"], db(-27))
sfx.add(whoosh(0.45, 900, 4200, 0.4, 0.5, 0.0, 0.3), T["line1Out"], db(-36))

# 3 — the turn, the layers lifting off one by one, coming home with clicks.
sfx.add(whoosh(0.7, 250, 2600, 0.6, 0.8, -0.3, 0.3), T["turn"], db(-31))
for k in range(5):
    sfx.add(whoosh(0.9, 300 + 80 * k, 3000 + 400 * k, 0.35, 0.8, -0.5 + 0.25 * k, -0.2 + 0.25 * k), T["explode"] + 0.1 * k, db(-31 - k * 0.5))
sfx.add(pad_chord([hz("D5"), hz("A5")], 1.2, attack=0.6, release=1.0, cutoff=4000, seed=77), T["explode"] + 0.3, db(-32))
for k, at in enumerate([T["assembleClicks"][0] - 0.125] + list(T["assembleClicks"])):
    sfx.add(whoosh(0.55, 400, 3600, 0.85, 0.7, 0.4 - 0.2 * k, 0.0), at - 0.5, db(-34))
    c = mech_click(0.9, 1.15 + 0.07 * k)
    sfx.add(c, at, db(-15), 0.15 * (-1) ** k)
    verb_send.add(c, at, db(-28))
sfx.add(pan(riser(1.2, 300, 12000, 1.0, 2.4), 0.0), LIGHT - 1.2, db(-25))

# The light floods in: impact, shimmer, the resolve to F major.
music.add(boom(1.0, 3.0, 54, 32), LIGHT, db(-13))
sfx.add(whoosh(0.9, 2000, 12000, 0.08, 0.8, 0.0, 0.0), LIGHT - 0.05, db(-29))
shimmer = sum(bell(hz(x), 3.5, 0.5) for x in ["F6", "A6", "C7"])
music.add(shimmer, LIGHT, db(-30))
verb_send.add(shimmer, LIGHT, db(-20))
sfx.add(whoosh(0.45, 900, 4200, 0.4, 0.5, 0.0, 0.3), T["line2Out"], db(-36))

# 4 — the glide, the mark rising behind, the push.
sfx.add(whoosh(1.5, 200, 2400, 0.55, 0.9, 0.4, -0.1), T["glide"], db(-29))
sfx.add(whoosh(1.4, 120, 1500, 0.6, 1.0, 0.0, 0.0), T["logo3dIn"], db(-31))
sfx.add(lp(boom(0.5, 1.6, 48, 34), 300), T["logo3dIn"] + 0.6, db(-24))
sfx.add(ui_tick(0.8, 2300), T["screenSwitch2"], db(-28))
sfx.add(whoosh(0.45, 900, 4200, 0.4, 0.5, 0.0, 0.3), T["line3Out"], db(-36))
sfx.add(whoosh(0.6, 250, 3200, 0.7, 1.0, 0.0, 0.0), T["phoneOut"], db(-27))
sfx.add(pan(riser(0.9, 400, 9000, 1.0, 2.8), 0.0), END - 0.9, db(-29))

# 5 — the end card: the mark settles, the name, the address; then space.
sfx.add(whoosh(0.6, 200, 2200, 0.85, 0.9, 0.0, 0.0), T["endLogo"], db(-31))
sfx.add(mech_click(0.8, 0.85), END, db(-14))
music.add(boom(0.9, 3.4, 50, 32), END, db(-15))
final = pad_chord([hz(x) for x in ["F2", "C3", "E3", "G3", "A3", "D4"]], DUR - END - 1.0, attack=0.3, release=1.6, cutoff=2600, width=0.9, seed=99)
music.add(final, END, db(-17))
verb_send.add(final, END, db(-11))
sub_final = osc_sine(hz("F1"), secs(5)) * np.exp(-tt(secs(5)) / 2.5) * np.minimum(1, tt(secs(5)) / 0.05)
music.add(sub_final, END, db(-21))
for at, note, v in [(T["endTitle"], "F5", 0.85), (T["endLine"], "A5", 0.6), (T["endUrl"], "C6", 0.75), (T["endHold"], "A5", 0.6)]:
    x = bell(hz(note), 3.2, v)
    music.add(x, at, db(-25), 0.12)
    verb_send.add(x, at, db(-16), 0.12)

# --------------------------------------------------------------------------
# Mix

duck = np.ones(len(music.x))
for a in np.arange(LIGHT + 1.0, T["phoneOut"], BEAT):
    i, m = secs(a), secs(0.26)
    duck[i:i + m] = np.minimum(duck[i:i + m], 1 - 0.25 * np.exp(-tt(m) / 0.09))
music.x *= duck[:, None]

verb = convolve(verb_send.x, reverb_ir(3.0, 0.03, 0.9))
room = convolve(sfx.x, reverb_ir(0.8, 0.008, 1.1, seed=3))
mix = music.x + drums.x + sfx.x + verb * db(-3) + room * db(-16)
if os.environ.get("STEMS"):
    sections = [(0, 2), (2, 6), (6, 9.5), (9.5, 16.5), (16.5, 20)]
    for name, bus in [("music", music.x), ("drums", drums.x), ("sfx", sfx.x), ("verb", verb * db(-3))]:
        print(f"{name:6s}", " ".join(f"{20 * np.log10(np.sqrt(np.mean(bus[secs(a):secs(b)] ** 2)) + 1e-9):6.1f}" for a, b in sections))
mix = hp(mix, 28, 4)
mix = mix + (db(2.0) - 1) * hp(mix, 8000, 1)

rms = np.sqrt(np.maximum(signal.sosfilt(sos("lowpass", 6), np.mean(mix ** 2, axis=1)), 0) + 1e-9)
thresh = db(-22)
gain = np.where(rms > thresh, (rms / thresh) ** (1 / 2.0 - 1), 1.0)
mix *= gain[:, None]

mix = mix[:N]
fade = secs(1.4)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix[: secs(0.01)] *= np.linspace(0, 1, secs(0.01))[:, None]

# Social platforms normalise to about -14 LUFS.
master(mix, "vertical-mix.wav", -14.0)
