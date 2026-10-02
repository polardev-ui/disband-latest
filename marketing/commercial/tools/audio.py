#!/usr/bin/env python3
"""Soundtrack and sound design for the Disband commercial.

Everything is synthesised here — no samples — and every effect is placed from
build/timeline.json, the same timing the picture uses, so the clicks land on
the frames they belong to. Music is 120 BPM from t=0; the scene boundaries
and hits (logo click, counter stop, final logo) sit on that grid.

    python3 tools/audio.py            -> build/audio/mix.wav (48 kHz stereo, float)
"""
import os

import numpy as np
from scipy import signal

from audiolib import *  # noqa: F401,F403  (SR, T, DUR, BEAT, N, rng, instruments, effects)

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
# Master: ITU-R BS.1770 loudness to -15 LUFS, then a look-ahead limiter.

master(mix, "mix.wav", -15.0)
