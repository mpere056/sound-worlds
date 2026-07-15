# Music visualization sync principles

This document records the first major sync lesson from the Marble Music
one-track generator. It is a project-wide rule for future Sound Worlds work,
not just a Marble implementation detail.

For the broader set of lessons from Marble Music, Brick Breaker, Aurora
Cyclotron, and Phaseglass, including inverse physics, shaders, effects,
performance, and rejected approaches, see the
[Sound Worlds engineering and design learnings](sound-worlds-engineering-learnings.md).

## Core lesson

Mathematical timing is necessary, but it is not enough.

A visualizer can place every impact at the exact source note time and still
feel unsynchronized if the visible object behaves unmusically between those
impact times. The viewer does not only judge the instant of contact; they also
judge whether the object's preparation, sustain, release, and travel match the
sound they are hearing.

The first successful Marble Music sync breakthrough happened when the motion
changed from:

```text
note onset -> immediately leave for the next note
```

to:

```text
note onset -> visible impact -> hold through the note's sustain/release
           -> depart with enough travel time -> arrive exactly on next note
```

For sparse one-track melodies where only one note is active at a time, this
made the visual feel much more connected to the audio.

## Perceptual sync contract

Every generator should satisfy two layers of sync:

1. **Numeric sync** - source events, compiled events, and visible payoff times
   agree in seconds.
2. **Behavioral sync** - the visible object or effect behaves in a way that
   matches the musical state before and after the payoff.

The second layer is where most “it is technically synced but feels random”
failures happen.

## Event lifecycle model

For note-driven generators, model each note or onset as a small lifecycle:

| Phase | Musical meaning | Visual responsibility |
|---|---|---|
| Anticipation | The next note is approaching | Move, aim, arc, charge, or prepare the object. |
| Impact | The note attack occurs | Land/contact/bloom exactly at `hitT`. |
| Sustain | The note is still sounding | Hold, resonate, glow, wobble, ring, or otherwise remain visually attached to that note. |
| Release/rest | The note fades or silence opens | Settle, decay, or begin travel only when musically plausible. |
| Tail | Audio continues after the final note | Preserve resonance without inventing fake new hits. |

Future visualizers should not treat a note onset as a zero-duration point if
the extracted event has a useful `dur` or if the rendered audio clearly sustains.

## One visible agent rule

When an extraction has one note-bearing track and only one note is active at a
time, the first generator should usually use one hero object or one hero visual
process.

For Marble Music this means:

- one marble;
- one active note target at a time;
- the marble is exactly at the target on the note onset;
- the marble remains visually associated with that note while it sustains;
- motion to the next note is back-solved so arrival is exact.

Adding many simultaneous decorative effects too early makes sync harder to
judge. Once this simple case feels satisfying, richer generators can layer in
secondary effects.

## Back-solved motion rule

The compiler should solve motion backward from the next musical payoff.

Recommended pattern:

1. Choose the next `hitT`.
2. Decide how much travel/setup time the visual needs.
3. Start the travel at `hitT - travelDuration`.
4. Keep the previous note visually alive until that departure time whenever
   possible.
5. If the available gap is too short, use a local mechanism rather than forcing
   impossible travel.

This is better than starting movement immediately after the previous hit and
hoping the in-between motion feels musical.

## Debug protocol for sync complaints

When a user says a visual is not synced:

1. Check extracted event times against compiled payoff times.
2. Check that app playback uses the audio clock to call `renderFrame(t)`.
3. Scrub directly to a payoff time and verify the visual contact state.
4. Inspect behavior between hits:
   - Does the object leave during a sustained note?
   - Is it moving while the sound is stable?
   - Is it stationary while new notes are sounding?
   - Is a large camera move hiding the payoff?
5. Only after those checks should visual intensity, color, or polish be tuned.

The Marble one-track fix proved that the problem can be between the hits even
when the hit timestamps are correct.

## Acceptance language

A generator is not ready to generalize to more tracks until the user can say:

> I can hear the musical event causing the visual event, and the visual object
> still feels attached to the sound between events.

For one-track generators, this is the minimum foundation before moving to
two-track or full-arrangement worlds.
