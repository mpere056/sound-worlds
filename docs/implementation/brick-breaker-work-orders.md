# Music-Synced Brick Breaker work orders

This document turns the product plan into independently testable implementation
slices. The first milestone is a deterministic headless compiler, not a game
screen. Each phase must land with fixtures and diagnostics before the next phase
depends on it.

## Delivery strategy

Keep the existing monorepo boundaries:

```text
packages/core                         shared time, curves, RNG, schema helpers
compilers/brick-breaker               musical grouping, route search, validation
scenes/brick-breaker                  absolute-time Three.js playback
packages/app                          discovery, transport, tuning, export
```

The compiler receives an immutable `Song` and options and emits a serializable
`BrickBreakerPerformance`. The scene samples that performance at absolute song
time. Runtime physics may be used as an offline validation oracle, but it must
not advance the preview state.

Every phase has its own commit and benchmark record. Keep generated fixture
artifacts out of unrelated commits.

## B0 - Contracts, grouping, and diagnostics

**Status: implemented.** `@reaper-viz/compiler-brick-breaker` now emits a
deterministic `brick-breaker.plan.json` artifact with stable grouped deadlines,
exact brick/cell counts, source-track diagnostics, gap statistics, and exact
first/final hit times. The app does not advertise this plan as a playable world.
The 12.5-second reference project currently measures 19 notes, 19 bricks, no
compound groups, a 0.174479-second minimum gap, six short gaps, eleven medium
gaps, and one long gap.

### Goal

Prove how many destructible objects the song requires before solving motion.

### Data contracts

```ts
interface BrickHitGroup {
  id: string;
  t: number;
  notes: Array<{ trackId: string; pitch: number; velocity: number; duration: number }>;
  representativePitch: number;
  energy: number;
}

interface BrickBreakerCompileOptions {
  sourceTrackId?: string;
  chordEpsilonSec: number;
  seed: string;
  board: { width: number; height: number };
}

interface BrickBreakerCompileReport {
  sourceTrackId: string;
  sourceNoteCount: number;
  groupedHitCount: number;
  compoundGroupCount: number;
  firstHitSec: number;
  finalHitSec: number;
  minimumGapSec: number;
  gapHistogram: Record<string, number>;
  warnings: string[];
}
```

### Work

1. Create `@reaper-viz/compiler-brick-breaker` with strict TypeScript build,
   Vitest coverage, and a deterministic CLI entry point.
2. Reuse the documented one-track selection policy; require a clear diagnostic
   when no note-bearing source exists.
3. Sort note-ons by `(time, trackId, pitch, source index)` and group events whose
   start time is within the fixed chord epsilon of the group anchor.
4. Generate stable IDs from group index and musical content. Do not use wall
   clock time, object iteration order, or random UUIDs.
5. Produce count and gap diagnostics without generating geometry.
6. Add fixtures for an empty track, one note, a chord, near-epsilon notes,
   repeated pitches, a dense trill, and a long final gap.

### Gate

- Grouping is deterministic under shuffled input ordering.
- One grouped time equals one future destructible brick.
- The last group retains the exact final note-on time.
- Empty or unsupported input fails with an actionable diagnostic.
- JSON output is byte-identical across repeated runs.

## B1 - Direct-contact trajectory kernel

**Status: next.** Use the measured B0 gap distribution to select provisional
speed bands; do not tune only around evenly spaced synthetic notes.

### Goal

Construct a continuous one-ball route that reaches one brick contact at every
deadline for fixtures where direct brick-to-brick travel is sufficient.

### State and segments

```ts
interface BallState {
  t: number;
  position: [number, number];
  velocity: [number, number];
}

interface BallSegment {
  kind: "launch" | "brick" | "wall" | "paddle" | "tail";
  t0: number;
  t1: number;
  from: [number, number];
  to: [number, number];
  velocity: [number, number];
  contactId?: string;
  normal?: [number, number];
}
```

Start in 2D. A 3D presentation may add depth later, but adding an unconstrained
axis now would multiply the route-search space without helping Brick Breaker
readability.

For every note gap `dt`, candidate travel distance is `speed * dt`. Solve a
contact point and normal satisfying:

```text
p1 = p0 + v_out * dt
v_out = v_in - 2 dot(v_in, n) n
speedMin <= length(v_out) <= speedMax
incidenceMin <= -dot(normalize(v_in), n) <= incidenceMax
```

The solver may choose the next brick position and orientation. Prefer a grid
anchor through a soft cost, never by violating exact timing.

### Work

1. Implement vector, reflection, line-circle, and line-oriented-box primitives
   as pure functions with tolerance constants in one module.
2. Implement an absolute-time segment sampler with defined boundary ownership:
   a destruction deadline samples the contact pose, and the next open interval
   samples the reflected path.
3. Generate deterministic launch candidates and bounded speed bands.
4. Score candidates by board containment, readable incidence, speed continuity,
   row/column affinity, route separation, and distance from board corners.
5. Emit rejection counts by reason rather than returning a generic failure.

### Gate

- Contact position error is below `1e-6` world units at every deadline.
- Velocity magnitude is continuous across static brick reflections.
- Arbitrary seek order yields identical ball poses.
- No segment exceeds documented speed or incidence bounds.
- A 16-hit direct fixture compiles in less than 50 ms on the reference machine.

## B2 - Time-varying occupancy and continuous validation

### Goal

Prove the ball cannot touch a future brick early or tunnel through geometry.

### Occupancy model

A brick collider is active on `[0, destructionTime]`. At its destruction time,
the assigned contact is legal and all other contacts remain illegal. Later
segments may pass through its former footprint.

Use a broad phase over brick swept AABBs followed by exact swept-circle versus
oriented-box tests. Endpoint sampling alone is forbidden. Wall checks use the
ball radius inset from board boundaries.

### Work

1. Add immutable brick colliders with `activeUntil` and compound-cell metadata.
2. Build a deterministic spatial index with stable tie ordering.
3. Validate every open segment against bricks active during any part of its
   interval, splitting at destruction deadlines where occupancy changes.
4. Distinguish assigned contact, premature contact, stale-brick contact, wall
   penetration, overlap-at-start, and numerical ambiguity.
5. Add a high-resolution sampled oracle in tests to cross-check analytical
   sweeps on randomized seeded cases.

### Gate

- Zero premature contacts in every accepted fixture.
- Thin-collider tunneling fixtures fail analytically even when endpoints clear.
- Destroyed-space reuse is accepted only after the destruction deadline.
- Analytical and sampled-oracle results agree on at least 10,000 seeded cases.

## B3 - Compiled paddle motion

### Goal

Support routes that return through a smoothly moving paddle without making the
paddle a runtime rescue mechanism.

Represent each required intercept as `(time, paddleX, ballContactX)`. Join
intercepts using quintic minimum-jerk curves with zero endpoint acceleration
where time permits. Validate the entire curve, not just intercepts.

### Bounds

- Paddle remains inside the board after accounting for half-width.
- Maximum speed and acceleration are compiler options with conservative defaults.
- Contact offset is bounded away from paddle corners.
- Added steering impulse changes direction but cannot create unbounded speed.
- Paddle cannot intersect any live brick or the ball before its scheduled contact.

### Gate

- Position, velocity, and acceleration are continuous between paddle spans.
- Exact intercept error is below `1e-6` world units.
- No frame-rate-dependent paddle state exists.
- Impossible intercept sequences report the first violated kinematic bound.

## B4 - Wall-assisted itinerary search

### Goal

Choose a legal sequence of support contacts for each musical gap without
exploding search cost.

Use deterministic beam search over transition templates. A node contains ball
state, placed bricks, remaining deadlines, paddle state, occupancy summary,
cost, and a stable lexical tie key.

Initial template order:

1. direct brick;
2. one side or top wall;
3. paddle return;
4. wall then paddle;
5. two walls for long gaps.

Use iterative beam widths such as 8, 24, then 64. Cache transition feasibility
by quantized incoming state, gap bucket, occupancy hash, and template. Keep
search deterministic even if candidate evaluation later moves to workers.

### Cost function

Record every term independently:

```text
total = speedChange
      + incidenceRisk
      + boardEdgeRisk
      + paddleEffort
      + visualDisorder
      + corridorCongestion
      + templateComplexity
```

Hard invalidity never becomes a large soft cost.

### Gate

- Fixtures force each template family at least once.
- The same seed produces the same itinerary across worker counts.
- Search has explicit node/time budgets and reports budget exhaustion separately
  from physical impossibility.
- A 100-hit representative fixture compiles below the provisional 500 ms p95
  budget before visual polish begins.

## B5 - Dense notes, compound bricks, and failure reports

### Goal

Handle chords and short inter-note gaps without unrealistic speed spikes.

Compound bricks contain one visible cell per grouped note but expose one outer
collision surface and one destruction deadline. Dense sequential groups may use
small adjacent bricks and short reflection chains, provided every group still
has one distinct legal contact.

Classify each failure as one of:

- below minimum travel time;
- above maximum useful travel time without support contacts;
- no collision-free brick footprint;
- incidence outside bounds;
- paddle kinematics impossible;
- search budget exhausted;
- numerical ambiguity near simultaneous contact.

The report includes group indices, timestamps, gap length, attempted templates,
and the tightest violated bound. Never silently delete or retime a group.

### Gate

- Chord cell count equals source note count inside every compound group.
- Dense fixtures remain within the normal speed ceiling.
- Deliberately impossible songs fail deterministically with stable diagnostics.
- Immediately after the penultimate hit, exactly one live brick remains.

## B6 - Scene, fragments, camera, and app integration

### Goal

Render the certified performance without introducing new physics state.

### Scene contract

- Sample ball and paddle transforms directly from absolute time.
- Derive brick visibility from `t < destructionTime`.
- Derive fragments from `(brickId, t - destructionTime, seed)` so seek and export
  reproduce the same burst.
- Keep the ball visible with a bounded follow camera that also preserves enough
  board context to read upcoming bricks.
- Pool brick cells and fragment meshes; do not rebuild the scene on every hit.
- Audio remains the transport clock in preview.

### Visual hierarchy

The first release should clearly distinguish the ball, live bricks, destroyed
space, paddle, and walls. Pitch and track role may influence hue or row. Velocity
may influence fragment energy. These mappings cannot move collision geometry
after certification.

### Gate

- One scene and renderer survive playback, scrub, and project changes.
- Random seeks match linear playback screenshots at the same timestamps.
- The ball and active contact region remain inside the safe viewport.
- Browser p95 frame interval remains below 20 ms on the reference fixture.
- PNG and three-second MP4 export reproduce preview state.

## Fixture matrix

| Fixture | Purpose | Required outcome |
| --- | --- | --- |
| one-note | launch/final contract | one brick, exact final hit |
| four-chord | grouping | one compound brick, four cells |
| direct-16 | direct reflections | no support contacts |
| wall-gap | wall template | at least one certified wall contact |
| paddle-gap | paddle template | smooth bounded paddle intercept |
| destroyed-corridor | time occupancy | legal reuse only after destruction |
| dense-trill | dense chain | normal speed ceiling preserved |
| impossible-gap | diagnostics | stable physical-impossibility report |
| representative-100 | performance | search and runtime budgets pass |

## Initial commit sequence

1. `feat: scaffold brick breaker compiler contracts`
2. `feat: group brick breaker musical deadlines`
3. `feat: solve direct brick breaker trajectories`
4. `feat: validate swept brick breaker occupancy`
5. `feat: compile bounded brick breaker paddle motion`
6. `feat: search wall assisted brick itineraries`
7. `feat: add brick breaker dense-note diagnostics`
8. `feat: render music synced brick breaker scene`

After B0, reassess fixture gap distributions before fixing speed, board, beam,
or paddle defaults. Those values should come from measured songs rather than
being tuned around a single synthetic route.
