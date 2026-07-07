# Marble Music

**One-line pitch:** A single exported track becomes a wall-mounted kinetic
marble machine: one marble rolls, bounces, and drops through tuned plates,
rails, pegs, and glowing resonators, with every visible impact landing exactly
on a note.

This concept exists because the project needs a more strategic path than
"invent a universal visualizer for every song." Marble Music is the first
track-count-specific generator: make **one-track music** feel excellent before
attempting two-track or full-arrangement generators.

## Visual reference

The desired look is close to a miniature marble-run music sculpture:

- a real-feeling wall or vertical board, not an abstract graph;
- metal rods, small brackets, colored plates, pegs, and resonator blocks;
- a glossy marble with believable weight, reflections, and contact shadows;
- impacts that make plates flash, flex, ring, or glow;
- a camera close enough to feel tactile, with depth of field and soft shadows;
- a final artifact that looks like a designed kinetic sculpture, not plotted
  data.

The reference images suggest a wall-mounted music-box / marble-run aesthetic.
Implementation should use **Three.js**, not Blender. The generated scene must be
procedural and deterministic from `song.json`.

## Why this should be the first one-track generator

For one track, there is no need to infer a whole world, city, runner, or band.
The song can become one physical object:

- one note = one target impact;
- pitch = plate position / size / color / resonator type;
- velocity = impact brightness, plate vibration, marble squash/glow;
- duration = sustained plate glow or resonator hum;
- note spacing = marble travel distance and path style.

The success criteria are simpler and stricter than Painting or Metro:

> When a note is heard, the marble should visibly hit something at that moment.

If that feels satisfying for one track, then two-track and higher-track
generators can build on it.

## Track-count ladder

### 1 track: Marble Music solo

One track controls one marble machine.

- One marble travels through a tuned sequence of plates.
- Every note start is a physical contact.
- Repeated pitches reuse or echo the same visual family of plates.
- Close notes become rolls, ramps, rattles, or multi-peg cascades instead of
  impossible long jumps.
- The final audio tail becomes residual plate glow, marble wobble, and slow
  resonator decay.

### 2 tracks: Marble duet

Only after the one-track generator feels good:

- either two marbles run through interleaved machines;
- or one track is the marble path while the other forms bass rails, gates, or
  resonating frame pieces;
- collisions or handoffs happen only when the music actually has aligned notes.

### 3+ tracks: Marble ensemble

Do not start here. Higher-track arrangements need a proven one-track and
two-track grammar first.

Possible extensions:

- low tracks become rails/frame structure;
- mid tracks become plates and chimes;
- high tracks become sparkle pegs, bells, or upper ornaments;
- drums become bumpers/hammers if drum roles are present;
- section changes rotate or re-light the machine.

## One-track mapping

The compiler should choose a single source track and derive a physical route.

| Musical feature | Marble-machine mapping |
|---|---|
| Note start time | Exact impact time on a plate/peg/chime |
| Pitch | Vertical/lateral plate placement, resonator size, color family |
| Velocity | Impact flash, vibration amplitude, marble glow, contact sound visual |
| Duration | Plate afterglow / ringing time |
| Repeated pitch | Same plate family or nearby octave-related plate |
| Small note gap | Roll/rattle/cascade path rather than large airborne jump |
| Large note gap | Visible travel arc, rail slide, or drop |
| Audio tail | Residual resonance, plate glow, marble settling |

## Compiler strategy

The compiler should not rely on Three.js physics to "hopefully" hit notes.
It should back-solve the marble schedule:

1. Sort note events by time.
2. Assign each note to a target object: plate, peg, chime, or resonator.
3. Place targets in a visually pleasing wall-mounted route using pitch and note
   density.
4. Build deterministic path segments between impacts:
   - rail slide for medium gaps;
   - drop or bounce for larger gaps;
   - rattle/cascade for dense clusters;
   - hold/wobble for long rests.
5. Emit events with `hitT === note.t`.
6. Render the marble position as a function of time, not as an uncontrolled
   runtime physics simulation.

Physics can be faked for beauty, but timing must be compiled.

## Implementation decisions

These decisions are fixed for the first implementation:

- **One track first.** The first accepted Marble Music generator uses one
  selected note-bearing track, not all project tracks.
- **Compiled kinematics.** The marble path is a deterministic function of
  `t`; runtime physics is not the timing source.
- **Physical wall sculpture.** The layout should feel mounted on a wall or
  vertical board, with rods, brackets, plates, pegs, and resonators.
- **Dense notes become mechanisms.** Close notes must become rattles, rolls,
  peg arrays, or cascades rather than impossible jumps.
- **Tail resonance matters.** If the master audio continues after the final
  selected note, the machine should keep glowing, wobbling, or settling.
- **Three.js from the start.** The first renderer slice should establish the
  Three.js path rather than faking the concept in Pixi.

The detailed build contract lives in
[Marble Music implementation](implementation/marble-music-implementation.md),
and the promotion gate lives in
[Marble Music acceptance checklist](implementation/marble-music-acceptance-checklist.md).

## Three.js renderer strategy

Use Three.js because this concept depends on depth, shadows, and tactile
materials.

Scene elements:

- wall/board plane with subtle plaster or matte texture;
- metal rods and brackets;
- colored impact plates with bevels;
- glossy marble sphere with reflection/highlight;
- optional ghosted trajectory ribbon for readability;
- lights attached to active plates;
- soft contact shadows;
- camera with shallow depth of field feel, even if implemented cheaply.

The first implementation can be simple geometry:

- `SphereGeometry` for the marble;
- `BoxGeometry` with bevel-like scaling for plates;
- `CylinderGeometry` for rods/pegs;
- wall plane plus shadows;
- deterministic camera path following the marble.

## Dense-note handling

The one-track generator must classify note spacing:

- **gap < 90 ms:** too dense for separate physical jumps; group as a trill or
  rattle cluster.
- **90-220 ms:** quick peg cascade or rolling ratchet.
- **220-700 ms:** normal rail/arc travel.
- **>700 ms:** cinematic travel, wobble, hold, or camera drift.

This matters because a single-track piano run can have extremely close notes.
Trying to make one marble do a dramatic jump for every close note will look
wrong. Dense notes should feel like a rolling musical mechanism.

## Acceptance criteria

One-track Marble Music is not accepted until:

- every note in the selected track has a visible impact or dense-cluster hit;
- impact timing is frame-locked to note starts;
- the marble never teleports;
- dense note clusters become satisfying rattles/rolls, not unreadable chaos;
- late audio tail has visible resonant decay;
- the scene feels like a physical object built for this track;
- the renderer is Three.js-based, not Pixi-only and not Blender-authored.

## First-slice defaults

These defaults replace the earlier open questions for the first implementation:

- Choose the best-scoring note-bearing track automatically, but record the
  selection reason and leave room for a manual override.
- Use stable pitch-class color/material families so repeated pitches feel
  recognizable.
- Repeated pitches should reuse a nearby plate family, not necessarily the exact
  same plate every time.
- The route should be a hybrid wall-mounted sculpture: mostly gravity-readable
  downward motion with occasional arcs, rails, cascades, and orbit-like turns.

Later versions can revise these choices after the one-track acceptance test, but
the first implementation should not stop to redesign them.
