#!/usr/bin/env python3
"""Soundtrack and sound design for the Disband Android beta announcement.

Same palette as the main commercial (tools/audio.py): 120 BPM, the D major
colour, synthesised instruments and effects placed from the timeline. The
energy stays light under the product shots, lifts on "The Android beta is
here.", and resolves on the final logo.

    node tools/timeline-json.mjs android/timeline.js build/android-timeline.json
    TIMELINE=build/android-timeline.json python3 tools/audio_android.py
        -> build/audio/android-mix.wav
"""
import os

import numpy as np
from scipy import signal

from audiolib import *  # noqa: F401,F403  (SR, T, DUR, BEAT, N, rng, instruments, effects)

LIFT = T["betaIn"]           # the groove arrives with the announcement
GROOVE_END = T["ctaOut"] - 0.25

# --------------------------------------------------------------------------
# Arrangement

music, drums, sfx, verb_send = Bus(), Bus(), Bus(), Bus()

CHORDS = {
    "Dmaj9": ["D3", "A3", "C#4", "E4", "F#4"],
    "Bm9": ["B2", "F#3", "A3", "C#4", "D4"],
    "Gmaj9": ["G2", "D3", "F#3", "A3", "B3"],
    "A6sus": ["A2", "E3", "F#3", "B3", "D4"],
}
ROOTS = {"Dmaj9": "D2", "Bm9": "B1", "Gmaj9": "G1", "A6sus": "A1"}
# (start, end, chord): two-bar changes, re-phrased so the lift lands on a downbeat.
PLAN = [
    (4.0, 8.0, "Dmaj9"), (8.0, 12.0, "Bm9"), (12.0, 16.0, "Gmaj9"), (16.0, LIFT, "A6sus"),
    (LIFT, LIFT + 4, "Dmaj9"), (LIFT + 4, LIFT + 6, "Bm9"), (LIFT + 6, LIFT + 8, "Gmaj9"), (LIFT + 8, GROOVE_END + 0.25, "A6sus"),
]

# Intro: a low D bed under the logo, felt more than heard.
n = secs(4.4)
t = tt(n)
drone = (osc_sine(hz("D1"), n) + 0.35 * osc_sine(hz("D2"), n) + 0.12 * lp(osc_saw(hz("A2"), n), 500))
drone *= np.clip(t / 2.2, 0, 1) ** 2 * np.clip((4.4 - t) / 0.9, 0, 1)
music.add(drone, 0.2, db(-30))
air = hp(lp(noise(secs(4.0)), 3000), 400) * np.clip(tt(secs(4.0)) / 3.5, 0, 1) ** 2
music.add(pan(air, 0.0) * 0.5 + pan(np.roll(air, 900), 0.0) * 0.5, 0.0, db(-46))

# Pads: warm and close before the lift, a touch brighter after it.
for i, (a, b, name) in enumerate(PLAN):
    lifted = a >= LIFT
    level = -16.5 if a < 8 else (-19 if a < 12 else (-20 if not lifted else -21))
    cutoff = 1300 if a < 8 else (1900 if not lifted else 2500)
    ch = pad_chord([hz(x) for x in CHORDS[name]], b - a, attack=0.9 if a == 4.0 else 0.35, release=1.2, cutoff=cutoff, seed=i)
    music.add(ch, a, db(level))
    verb_send.add(ch, a, db(level - 6))


# Arpeggio: 8ths from the first line, opening up at the lift.
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
            lifted = tpos >= LIFT
            bright = 1.4 if lifted else (1.0 if tpos >= 12.0 else 0.8)
            vel = (0.9 if k % 2 == 0 else 0.62) * (1.0 if lifted else (0.8 if tpos >= 12.0 else 0.7))
            if T["connectIn"] <= tpos < LIFT:
                vel *= 0.75
            x = pluck(seq[k % len(seq)], 0.9, bright, vel)
            p = 0.35 * np.sin(k * 1.7)
            music.add(x, tpos, db(-25), p)
            verb_send.add(x, tpos, db(-24), p)
        k += 1
        tpos += BEAT / 2


# Drums. Under the shots: hats, then a soft four-on-the-floor heartbeat.
# From the lift: kick, clap, hats and shaker, with the bass.
def drum_pattern(start, end, level):
    b = start
    i = 0
    while b < end - 1e-6:
        beat_in_bar = i % 4
        if level >= 2 and beat_in_bar in (0, 2):
            drums.add(kick(1.0), b, db(-12))
        if level == 1:
            drums.add(kick(0.55), b, db(-21))
        if level >= 2 and beat_in_bar in (1, 3):
            c = clap(0.9)
            drums.add(c, b, db(-25.5))
            verb_send.add(c, b, db(-20))
        for s16 in range(4):
            ts = b + s16 * BEAT / 4
            if ts >= end:
                break
            if level >= 2 or s16 % 2 == 0:
                v = [0.9, 0.35, 0.6, 0.35][s16]
                drums.add(hat(v), ts, db(-31 if level >= 2 else -34), 0.25)
                if level >= 2 and s16 in (1, 3):
                    drums.add(shaker(0.8), ts, db(-35), -0.3)
        b += BEAT
        i += 1


drum_pattern(8.0, 12.0, 0)
drum_pattern(12.0, T["connectIn"] + 0.15, 1)
drum_pattern(T["connectIn"] + 0.15, LIFT - 1.0, 0)
drum_pattern(LIFT, GROOVE_END, 2)

# Bass: 8th-note root pulse, from the lift only.
for a, b, name in PLAN:
    if b <= LIFT:
        continue
    root = hz(ROOTS[name])
    tpos = max(a, LIFT)
    k = 0
    while tpos < min(b, GROOVE_END) - 1e-6:
        vel = 1.0 if k % 2 == 0 else 0.7
        music.add(bass_note(root, BEAT / 2 * 0.92, vel), tpos, db(-17.5))
        tpos += BEAT / 2
        k += 1

# The lift: a riser out of the breath before it, then a hit and a bright stab.
music.add(pan(riser(1.5, 400, 10000, 1.0), 0.0), LIFT - 1.5, db(-30))
music.add(boom(1.0, 2.6), LIFT, db(-15))
stab = sum(pluck(hz(x) * 2, 1.6, 1.8, 0.8) for x in CHORDS["Dmaj9"][1:])
music.add(stab, LIFT, db(-18))
verb_send.add(stab, LIFT, db(-12))
x = bell(hz("A5"), 3.0, 0.7)
music.add(x, T["earlyIn"], db(-26), -0.1)
verb_send.add(x, T["earlyIn"], db(-18), -0.1)

# Finale: the groove steps aside, a lift into the logo, the resolving chord,
# and a small melody on the reveals that comes home on the URL.
bridge = pad_chord([hz(x) for x in CHORDS["A6sus"]], 0.9, attack=0.1, release=1.0, cutoff=1500, seed=41)
music.add(bridge, GROOVE_END, db(-22))
music.add(pan(riser(1.0, 400, 9000, 1.0, 2.8), 0.0), T["endLogoLand"] - 1.0, db(-28))
music.add(boom(0.9, 3.4, 52, 34), T["endLogoLand"], db(-15))
final = pad_chord([hz(x) for x in ["D3", "A3", "C#4", "E4", "F#4", "A4"]], DUR - T["endLogoLand"] - 1.4, attack=0.25, release=1.6, cutoff=2600, width=0.85, seed=99)
music.add(final, T["endLogoLand"], db(-17))
verb_send.add(final, T["endLogoLand"], db(-12))
sub_final = osc_sine(hz("D1"), secs(8)) * np.exp(-tt(secs(8)) / 3.5) * np.minimum(1, tt(secs(8)) / 0.05)
music.add(sub_final, T["endLogoLand"], db(-20))
for at, note, v in [(T["endTitle"], "D5", 0.9), (T["endSlogan"], "A5", 0.75), (T["endNote"], "F#5", 0.6), (T["endUrl"], "E5", 0.8), (T["endUrl"] + 0.5, "D5", 0.75)]:
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

# Type: barely-there air on the reveals and exits.
for at in [T["comingIn"], T["connectIn"], T["ctaHead"]]:
    sfx.add(whoosh(0.7, 800, 5000, 0.35, 0.5, -0.2, 0.2), at - 0.05, db(-36))
for at in [T["comingOut"], T["connectOut"], T["betaOut"]]:
    sfx.add(whoosh(0.45, 900, 4200, 0.4, 0.6, 0.0, 0.3), at, db(-35))

# Scene 3: the phone rises in, the camera pushes to the display, the screens
# change with a soft tap, the phone settles left.
sfx.add(whoosh(1.1, 250, 3800, 0.7, 1.0, 0.0, 0.0), T["shotIntro"] - 0.15, db(-26))
sfx.add(whoosh(1.4, 250, 2400, 0.6, 0.8, -0.2, 0.1), 10.3, db(-33))
for at in [T["introSwitch1"], T["introSwitch2"]]:
    sfx.add(ui_tick(0.9, 2400), at, db(-24))
    sfx.add(whoosh(0.35, 700, 3200, 0.3, 0.5, 0.0, 0.0), at, db(-36))
sfx.add(whoosh(1.2, 300, 3400, 0.55, 0.9, 0.2, -0.5), 12.0, db(-30))

# Scene 4: the second phone slides in from the right; both drop away.
sfx.add(whoosh(0.9, 350, 4600, 0.45, 1.0, 0.8, 0.3), T["shotPair"] - 0.1, db(-26))
sfx.add(whoosh(0.5, 300, 3600, 0.7, 1.0, 0.0, 0.0), T["shotPairEnd"] - 0.4, db(-27))

# Scene 6: the phone slides in from the left; the URL and the arrow land.
sfx.add(whoosh(0.8, 350, 4600, 0.4, 1.0, -0.8, -0.4), T["shotCta"] - 0.05, db(-26))
sfx.add(whoosh(0.6, 800, 4400, 0.35, 0.5, 0.2, 0.4), T["ctaSub"] - 0.05, db(-38))
sfx.add(ui_tick(0.9, 2200), T["ctaUrl"], db(-25), 0.3)
sfx.add(ui_tick(0.7, 2900), T["ctaArrow"] + 0.35, db(-27), 0.2)
sfx.add(whoosh(0.4, 700, 3600, 0.5, 0.6, 0.0, 0.3), T["ctaArrow"], db(-34))
sfx.add(whoosh(0.5, 300, 3600, 0.7, 1.0, -0.3, -0.3), T["ctaOut"], db(-27))

# Scene 7: the mark settles with a soft click.
sfx.add(whoosh(0.9, 200, 2200, 0.85, 0.9, 0.0, 0.0), T["endLogo"], db(-31))
sfx.add(mech_click(0.7, 0.9), T["endLogoLand"], db(-16))

# --------------------------------------------------------------------------
# Mix

# Kick ducks the pads/bass slightly so the pulse breathes.
duck = np.ones(len(music.x))
for a in np.arange(LIFT, GROOVE_END, 1.0):
    i = secs(a)
    m = secs(0.28)
    duck[i:i + m] = np.minimum(duck[i:i + m], 1 - 0.32 * np.exp(-tt(m) / 0.09))
music.x *= duck[:, None]

verb = convolve(verb_send.x, reverb_ir(2.6, 0.022, 1.0))
room = convolve(sfx.x, reverb_ir(0.7, 0.006, 1.2, seed=3))
mix = music.x + drums.x + sfx.x + verb * db(-3) + room * db(-17)
if os.environ.get("STEMS"):
    sections = [(0, 4), (4, 7.2), (7.2, 12), (12, 17.35), (17.35, LIFT), (LIFT, GROOVE_END), (GROOVE_END, 40)]
    for name, bus in [("music", music.x), ("drums", drums.x), ("sfx", sfx.x), ("verb", verb * db(-3)), ("room", room * db(-17))]:
        row = []
        for a, b in sections:
            seg = bus[secs(a):secs(b)]
            row.append(f"{20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9):6.1f}")
        print(f"{name:6s}", " ".join(row))
mix = hp(mix, 32, 4)
mix = mix - (1 - db(-5)) * lp(mix, 65, 2)
mix = mix + (db(2.5) - 1) * hp(mix, 7500, 1)

rms = np.sqrt(np.maximum(signal.sosfilt(sos("lowpass", 6), np.mean(mix ** 2, axis=1)), 0) + 1e-9)
thresh = db(-20)
gain = np.where(rms > thresh, (rms / thresh) ** (1 / 2.2 - 1), 1.0)
mix *= gain[:, None]

# The final chord rings into the held end card and is gone by the last frame.
mix = mix[:N]
fade = secs(1.2)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
mix[: secs(0.01)] *= np.linspace(0, 1, secs(0.01))[:, None]

# --------------------------------------------------------------------------
# Master: ITU-R BS.1770 loudness to about -15 LUFS after the limiter.

master(mix, "android-mix.wav", -14.7)
