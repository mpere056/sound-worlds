# Marble Music deep design review

This document records the reasoning behind the Marble Music plan. It is meant
to prevent the implementation from repeating the same failure pattern as the
earlier broad visualizers: technically active visuals that do not feel clearly
caused by the music.

## Core thesis

Marble Music should work better for the current project because it narrows the
problem:

```text
one note-bearing track -> one physical machine -> one visible impact per note
```

That is a much cleaner mapping than trying to infer a full world from sparse
roles. The viewer does not need to understand a city, terrain system, or
painting grammar. They only need to feel: "I heard a note, and the marble hit
something."

## Why this is safer than another broad visualizer

The current reference export has short, keys-only material. It does not contain
the role variety that Runner, Metro, or Painting need to feel fully authored.

Marble Music avoids that mismatch:

| Problem in broad concepts | Marble Music answer |
|---|---|
| No drums/bass/lead roles | Use one selected note track only. |
| No regions/sections | Do not rely on section topology. |
| Sparse short duration | Build a compact physical object. |
| User cannot see sync | Make each note a target impact. |
| End has audio tail | Render resonance/settle instead of new fake events. |

The implementation can still fail, but its failure modes are local and testable.

## The actual hard parts

### 1. Perceived sync, not just numeric sync

It is not enough for `event.t === note.t` in JSON. The visual envelope must peak
when the note is heard.

Required behavior:

- marble contact pose at `hitT`;
- target flash/wobble strongest at `hitT`;
- visible response lasts long enough to be perceived at 60 fps;
- preview time comes from `audio.currentTime`, not an independent timer.

This is why the implementation plan specifies an impact envelope rather than a
single-frame event.

### 2. Dense notes are mechanism design

A real marble cannot jump across the wall every 50 ms. The correct answer is not
"move faster." The correct answer is to change the local mechanism:

- rattle inside a short peg cage;
- roll over a comb of tiny chimes;
- cascade through adjacent plates;
- flash multiple neighboring pegs while the marble remains locally plausible.

Dense-note handling is the central design trick. Without it, the generator will
teleport or look random.

### 3. Three.js integration is a real foundation task

The app currently uses a Pixi-first preview path. Marble Music needs depth,
lighting, shadows, and 3D camera parallax. Therefore implementation must first
make backend ownership explicit:

- Pixi scenes continue to use Pixi;
- Marble Music uses Three.js;
- switching concepts releases the previous backend;
- both backends obey `renderFrame(t)`.

Trying to fake Marble Music as a Pixi scene would preserve technical
convenience while sacrificing the core aesthetic.

### 4. The layout must not become a graph

The route can be deterministic and data-driven, but it should not look like a
plotted line. The compiler should generate an object that feels mounted,
constructed, and tactile.

Design safeguards:

- physical rods and brackets;
- target families rather than one dot per note;
- gravity-readable downward motion with occasional arcs/orbits;
- repeated pitches reuse visual families;
- camera frames local mechanisms, not a whole chart.

### 5. "Perfect" means gated, not assumed

No plan can guarantee a perfect result before implementation. The right standard
is to make every important claim testable:

- every selected note has an impact or cluster membership;
- every impact has `hitT` copied from the source note;
- every path segment is continuous;
- dense gaps are explicitly classified;
- the scene is pure as a function of `t`;
- tail resonance covers the audible tail;
- the human checklist passes before moving to two tracks.

## Implementation order that minimizes risk

1. **M0A - backend boundary:** make the app capable of hosting Pixi or Three
   scenes without leaking contexts.
2. **M0B - minimal Three scene:** wall, one plate, one marble, one mocked hit.
3. **M1A - compiler skeleton:** write deterministic `performance.marble.json`
   with selected source metrics.
4. **M1B - note-to-impact invariant:** every selected note maps to an impact or
   cluster.
5. **M1C - path solver:** continuous path covers the whole song duration.
6. **M2 - real preview:** Marble scene samples the real compiled path.
7. **M3 - dense-note/tail proof:** high-track dense gap and audio tail both look
   intentional.
8. **M4 - aesthetic pass:** only after sync is trustworthy.

This order deliberately proves infrastructure and sync before visual polish.

## Things that should cause an implementation pause

Pause and fix the plan/code if any of these happen:

- the scene needs `update(dt)` to work;
- a selected note has no impact or cluster;
- dense notes are handled by teleporting the marble;
- app routing requires Three.js to reuse a live Pixi backend;
- the visual goes still before `song.meta.durationSec`;
- the first review requires debug overlays to perceive note sync;
- the implementation starts supporting two tracks before one track passes.

## Expected first success

The first satisfying target is intentionally modest:

> The low repeating keys track becomes a short wall-mounted marble machine where
> the marble hits 20 note targets in time, then the machine rings out during the
> final tail.

If that works, the project has a trustworthy foundation. If that does not work,
adding more tracks or more effects will only hide the failure.
