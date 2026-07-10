# Marble Music 3D physics-feel implementation plan

This is the next Marble Music step after the first one-track sync breakthrough.

The goal is **realistic-looking 3D physics**, not physically exact simulation.
The marble must feel like it has weight, spin, contact, momentum, and depth,
while the compiler continues to guarantee exact musical arrivals.

## Design decision

Do **not** make a runtime physics engine the timing authority for Marble Music
M1.5/M2.

Use **compiled pseudo-physical kinematics**:

- the compiler still owns note selection, target placement, impact times, travel
  windows, and camera anchors;
- every impact still lands exactly on the note onset;
- motion between impacts is shaped to look physical;
- the scene samples an absolute-time path, so playback and scrubbing are
  identical;
- runtime physics engines may be evaluated later for secondary props, but not
  for the marble's synced hero trajectory.

Why: the project has already proven that perceived sync depends on exact
arrival plus musical behavior between hits. A free-running simulation would make
arrival timing harder to prove, especially after seeking, frame drops, browser
differences, or dense passages.

## Research-backed conclusion

Online references checked while planning this slice:

- [AndrewB330/MusicMarbles](https://github.com/AndrewB330/MusicMarbles)
  - advances a complete marble world in fixed 15 ms ticks with smaller physics
    micro-steps, gravity integration, marble/plank collision impulses, and
    penetration correction;
  - its generator simulates forward to each requested note time, places a
    collision plank at the predicted marble pose, and rewinds/backtracks when a
    candidate would cause an earlier collision;
  - the important lesson for this implementation is continuous world motion:
    a note is a collision deadline, not a switch that starts movement;
  - Marble Music keeps deterministic absolute-time sampling, but must preserve
    the same continuous-motion invariant between every pair of impacts;
  - target placement must therefore be solved from velocity, gravity, and note
    timing. Placing targets from pitch first and stretching motion afterward is
    explicitly rejected because it creates arbitrary speed changes.

- [Rapier JavaScript rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/)
  and [colliders](https://rapier.rs/docs/user_guides/javascript/colliders/)
  - good if we later want dynamic secondary props, contact events, joints, or
    physics toys around the synced path;
  - kinematic bodies give the user total trajectory control, which resembles
    our compiler-owned motion model;
  - Rapier explicitly warns that directly changing a dynamic body's position is
    teleportation, not physical motion;
  - dynamic forces/impulses are useful for unsynced props but would complicate
    exact musical arrival;
  - Rapier has deterministic package variants, but adding a whole simulation
    loop still increases the amount of state we must prove after seeking.
- [rapier.js](https://github.com/dimforge/rapier.js)
  - official JavaScript bindings for Rapier;
  - worth keeping on the shortlist for a later optional secondary-physics
    sandbox.
- [cannon-es](https://github.com/pmndrs/cannon-es)
  - maintained, lightweight JavaScript 3D physics engine;
  - useful as reference/open-source material for how web physics examples
    structure bodies, collisions, friction, impulses, and examples;
  - not a timing authority for the hero marble.
- [react-three-rapier](https://github.com/pmndrs/react-three-rapier) and
  [use-cannon](https://github.com/pmndrs/use-cannon)
  - useful ecosystem references, but they are React / react-three-fiber wrappers;
  - this project is currently vanilla TypeScript scene packages, so do not add a
    React/R3F dependency just to get physics.
- [Three.js documentation](https://threejs.org/docs/)
  - the correct renderer layer for this concept: meshes, curves, geometry,
    cameras, lights, shadows, PBR-ish materials, quaternions, and later
    post-processing.
- Physics/math references:
  - [cubic Hermite splines](https://en.wikipedia.org/wiki/Cubic_Hermite_spline)
    for smooth 3D motion and rails that still hit exact endpoints;
  - [projectile motion](https://en.wikipedia.org/wiki/Projectile_motion) for
    authored arcs/drops that land at a known time;
  - [damping ratio](https://en.wikipedia.org/wiki/Damping) for believable
    recoil, wobble, and resonance envelopes.

The research changes the plan in an important way:

> The hero marble should not be a free-running rigid body. It should be a
> deterministic, absolute-time, music-locked pose function that uses physics
> formulas for its shape and feel.

Full physics engines are still useful, but only after the synced hero path works:

- secondary dangling ornaments;
- loose beads that rattle after a hit;
- tiny unsynced decorative particles;
- optional development sandbox to compare authored motion against real rigid
  bodies.

The common open-source web-physics pattern is:

```text
world.step(dt)
copy physics body transform to render mesh
```

That is appropriate for games. It is not appropriate as the source of truth for
a music visualizer where:

- scrubbing to `t = 5.000` must show the same frame every time;
- frame drops must not cause late note impacts;
- dense passages must be back-solved from note times;
- the marble must visibly arrive on the exact onset, not "almost there if the
  solver behaved today."

So the implementation plan is intentionally hybrid:

```text
compiler owns timing and path  ->  pure pose sampler owns marble state
Three.js owns rendering        ->  optional physics engine owns only props later
```

## What is wrong with the current visual layer

The current Marble slice is valuable because it proved sync, but it still reads
too flat:

- the SVG overlay is effectively 2D;
- target contact has glow but little physical consequence;
- the marble does not roll from path distance;
- there is no convincing surface normal, banking, bounce, or contact shadow;
- camera motion cannot yet reveal meaningful depth because the mechanism itself
  is mostly screen-space.

The next slice should make the Three.js scene the primary visible layer and
turn the SVG layer into either a temporary compatibility fallback or a debug
overlay.

### Browser review, 2026-07-08

The first real 3D-machine pass is directionally good: the wall frame, target
hardware, tube rails, shadows, damped target recoil, distance-based marble spin,
and pose-driven parallax make the scene read more like a physical object than
the original flat overlay.

It is not yet through the M2.3 acceptance gate. In screenshots from
`untitled-project-418cb58f` at 0 s, 5 s, and 10 s, the marble stays readable and
the camera is mostly comfortable, but three issues remain obvious:

- the fallback SVG/path-line language still makes the route read like a plotted
  graph instead of a built rail system;
- the board frame and glow can become over-bright in late-song frames, competing
  with the marble and targets;
- target hardware improves still frames, but the scene still needs a
  watch-through with audio before sync-readability can be called good.

Next visual work should therefore prioritize hiding or demoting the SVG overlay,
replacing the faint route/path line with physically motivated rails/supports,
clamping frame/glow brightness, and running a complete audio watch-through
before adding more target types or secondary physics.

## Physics-feel principles

### 1. Arrival is sacred

For every selected note:

```text
sampleMarblePath(path, note.t).pos === target.contactPos
target.contactPos = target.pos + normal * (marbleRadius + halfThickness + clearance)
```

The marble may arc, roll, bank, or bounce, but the final contact pose belongs
to the note onset.

The path must never use the platform mesh center as the marble-center impact
position. Validate signed distance from the platform surface immediately before,
at, and after contact so a correct exact frame cannot hide penetration on
adjacent frames.

### 2. Every impact immediately continues the motion

The complete interval between adjacent impacts belongs to motion:

```text
segment.t0 = currentHitT
segment.t1 = nextHitT
```

The target may recoil and resonate after contact, but the hero marble must not
remain pinned there because the source note has duration. Free-flight arcs use
constant-acceleration parabolas; rail segments keep nonzero path velocity at
their ends. Dense notes still use compact local mechanisms, but those
mechanisms must also move continuously.

### 3. The viewer needs visible forces

The renderer should show cues that humans read as physics:

- acceleration and deceleration;
- rolling spin proportional to distance;
- banking/tilting when turning;
- small compression/contact flash at impact;
- target vibration after impact;
- contact shadows;
- occlusion and parallax;
- settling after the last note.

These cues can be exaggerated. They only need to look plausible.

### 4. Dense notes become local mechanisms

Do not make a marble perform impossible heroic leaps for dense notes.

Dense passages should become:

- peg rattles;
- short chime cascades;
- rail ratchets;
- local resonator flicks;
- tiny hops inside one compact target family.

## Coordinate system

Use a real 3D wall-mounted coordinate system:

```text
x = horizontal across the board
y = vertical on the board
z = depth out from the board toward the camera
```

Recommended board setup:

- wall plane at `z = -0.35`;
- target plates mounted around `z = 0`;
- marble center offset toward camera by its radius plus clearance;
- rods/brackets extend from wall to target;
- rails/tubes live in 3D space, not screen-space.

This keeps the reference "wall-mounted marble music" feel while enabling camera
orbits, closeups, and parallax later.

## Data contract additions

Add a richer motion contract without breaking the current timing invariants.

Suggested additions:

```ts
interface MarblePathSegment {
  id: string;
  t0: number;
  t1: number;
  from: [number, number, number];
  to: [number, number, number];
  kind: "hold" | "rail" | "arc" | "drop" | "bounce" | "rattle" | "cascade" | "settle";
  easing: MarbleEasing;
  targetId?: string;
  clusterId?: string;

  // New M1.5/M2 fields:
  contactNormal?: [number, number, number];
  tangentIn?: [number, number, number];
  tangentOut?: [number, number, number];
  control?: [number, number, number];
  control2?: [number, number, number];
  railRadius?: number;
  bank?: number;
  gravityScale?: number;
  restitution?: number;
  arcLength?: number;
}

interface MarblePose {
  pos: [number, number, number];
  quat: [number, number, number, number];
  tangent: [number, number, number];
  normal: [number, number, number];
  speed: number;
  spin: number;
  contact: boolean;
  segmentId: string;
  kind: MarblePathKind;
  progress: number;
}
```

The exact shape can evolve, but `MarblePose` should become the renderer's single
source of truth for marble placement, spin, and contact state.

## Motion math

All motion math below must be evaluated from absolute song time. Do not
integrate frame-to-frame for the hero marble.

### Hold

Hold keeps the marble attached to a target during sustain:

```text
pos(t) = targetContactPos + tiny_resonance_offset(t)
```

The resonance offset should be tiny and deterministic:

```text
offset = normal * A * exp(-d * age) * sin(w * age + phase)
```

Use it for wobble/glow, not for visible desync.

Recommended default:

```text
A = min(0.03, 0.012 + 0.018 * velocity)
d = 9 to 14
w = 18 to 28 radians/sec
```

This makes a held note feel alive without making the marble look like it is
missing the target.

### Rail / slide

Rail motion should use a cubic Hermite or cubic Bezier curve through 3D.

Hermite form:

```text
p(u) = h00(u) p0 + h10(u) m0 + h01(u) p1 + h11(u) m1
u = clamp((t - t0) / (t1 - t0), 0, 1)
```

Where:

```text
h00 =  2u^3 - 3u^2 + 1
h10 =    u^3 - 2u^2 + u
h01 = -2u^3 + 3u^2
h11 =    u^3 -   u^2
```

Use tangents to avoid straight plotted-line motion. Build a small arc-length
lookup table per segment so spin and speed can be sampled deterministically.

Arc-length lookup:

```text
s[0] = 0
s[i] = s[i - 1] + distance(p(u[i]), p(u[i - 1]))
segment.arcLength = s[last]
```

To sample distance at progress `u`, binary-search/interpolate inside `s`. This
lets the visual speed and marble spin come from geometric distance instead of a
guess.

Suggested rail tangents:

```text
incomingDir = normalize(p1 - previousTarget)
outgoingDir = normalize(nextTarget - p0)
m0 = mix(normalize(p1 - p0), outgoingDir, 0.35) * tensionLength
m1 = mix(normalize(p1 - p0), incomingDir, 0.35) * tensionLength
```

Then clamp tangent length to avoid loops. If a segment would self-intersect or
overshoot badly, downgrade it to a simple visible rail with lower tension.

### Air arc / drop

For an airborne transfer, choose aesthetic gravity `g` and solve the vertical
velocity needed to land at the next target:

```text
T = t1 - t0
y(t) = y0 + vy0 * tau - 0.5 * g * tau^2
vy0 = (y1 - y0 + 0.5 * g * T^2) / T
tau = t - t0
```

Interpolate horizontal/depth position from the constant launch velocity. Target
placement uses the same equation forward, so the solved vertical launch speed
does not vary merely because decorative target positions changed.

If the solved arc is too flat or too high, clamp it into a visual range and
change the segment kind to rail/cascade instead of producing an ugly jump.

Important: the arc is not a simulation. It is an analytic curve that is solved
so `p(t1)` is exactly the next target.

Recommended visual ranges:

```text
T >= 0.12 sec for readable air
maxArcHeight = 0.20 to 0.65 board units
g = 6 to 14 board-units/sec^2, chosen per segment for aesthetics
```

If the music gives a time window that is too short for a readable airborne arc,
use a rail, peg rattle, or local cascade instead.

### Bounce / contact

At impact, show a damped response rather than simulating a full collision:

```text
response(age) = velocity * exp(-damping * age) * sin(frequency * age)
```

Use it to drive:

- target plate rotation;
- target scale/compression;
- glow intensity;
- contact shadow squash;
- marble highlight flare.

If a reflected velocity is useful for a visible ricochet:

```text
vOut = vIn - (1 + restitution) * dot(vIn, normal) * normal
```

This should inform the next authored segment, not run as uncontrolled dynamic
state.

Damped target response defaults:

```text
response = A * exp(-zeta * omega0 * age)
           * sin(omega0 * sqrt(1 - zeta^2) * age)

zeta = 0.45 to 0.75   // underdamped, visible but not floppy
omega0 = 18 to 36     // tuned by target type
A = noteVelocity * incomingSpeed * targetSensitivity
```

For objects that should return without oscillation, use a critically damped
envelope:

```text
response = A * (1 + omega * age) * exp(-omega * age)
```

### Rolling spin

Spin should come from traveled distance, not from `t * constant`.

For a sphere:

```text
spinAngle = arcLengthTraveled / marbleRadius
spinAxis = normalize(cross(contactNormal, tangent))
```

This is one of the most important cheap tricks for making the marble feel real.

Orientation should be built from a rolling quaternion plus any authored bank:

```text
qRoll = quatFromAxisAngle(spinAxis, spinAngle)
qBank = quatFromAxisAngle(tangent, bankAngle)
qPose = qBank * qRoll * qBase
```

`qBase` can hold the marble's decorative swirl orientation.

### Banking

When the marble turns, bank it into the curve:

```text
bankAngle ~= atan(speed^2 / (turnRadius * g))
```

Clamp the value aggressively for aesthetics, e.g. `[-18 deg, 18 deg]`. The goal is
readable inertia, not a perfect mechanical solve.

Estimate turn radius from three adjacent samples:

```text
turnAmount = angle(tangentBefore, tangentAfter)
turnRadius = max(arcStep / max(turnAmount, epsilon), minRadius)
```

Dense notes should generally get less banking and more local mechanical action;
large sweeping sparse notes can get more camera-visible banking.

## Architecture guardrails

These rules exist because the first successful Marble sync only happened after
the visual motion became music-owned rather than animation-owned.

### Must do

- Treat the compiled performance as the source of truth for every hit time.
- Sample the hero marble from absolute song time.
- Keep path generation deterministic and testable outside the browser.
- Build real Three.js 3D geometry for the visible machine.
- Use physics math to create believable motion, but solve each motion segment so
  it lands exactly at its target time.
- Preserve the current SVG/fallback layer only as temporary compatibility or
  debugging surface while the 3D layer is being replaced.
- Keep visual helper geometry honest: visible lines must be rails, rods,
  wires, shadows, or explicitly toggled debug overlays. A faint polyline that
  only traces note order should not be part of the shipped art path.
- Treat browser still-frame and audio watch-through reviews as phase gates.
  Passing compiler tests is necessary, but not enough for M2.1/M2.2.

### Must not do

- Do not use `world.step(dt)` as the hero marble's timing authority.
- Do not advance the hero marble from prior frame state.
- Do not let frame drops change where the hero marble is at song time `t`.
- Do not depend on browser physics solver output for the exact note impact
  pose.
- Do not hide timing errors with glow/bloom.
- Do not implement all target types before the first 3D one-track watch-through
  feels physically satisfying.

## Optional physics engine policy

Rapier or cannon-es may be added later only if the feature is explicitly
non-critical to sync or if the simulation is baked into deterministic authored
metadata.

Acceptable later uses:

- decorative beads rattling after a plate hit;
- hanging ornaments that wobble in response to impact metadata;
- loose confetti/particles whose timing is not the note onset;
- development-only comparison sandbox for tuning authored arcs/recoil.

Unacceptable for this slice:

- hero marble collision solving;
- note-to-note travel timing;
- exact impact location;
- camera timing;
- any feature that makes seeking produce a different frame than continuous
  playback.

If a physics engine is eventually used for kinematic moving pieces, prefer the
engine's kinematic-next-position APIs instead of teleporting bodies directly.

## Implementation phases

Current progress:

- Phase 0/1 foundation started in `@reaper-viz/compiler-marble`.
- `MarblePathSegment` now carries physical metadata for compiled motion:
  contact normals, tangents, secondary controls, arc-height/gravity hints,
  arc-length samples, rail radius, banking, and restitution.
- `sampleMarblePose` now returns a deterministic absolute-time pose with
  position, quaternion, tangent, normal, speed, spin, contact state, segment id,
  kind, and progress.
- The Marble scene now consumes `sampleMarblePose` for marble orientation and
  SVG fallback spin, replacing time-based fake marble rotation.
- The Marble scene has begun the real 3D machine replacement with tube rails
  following compiled path segments, marble contact shadowing, target shadows,
  and damped target recoil/wobble tied to impact timing.
- The 3D scene now includes more wall-mounted machine detail: frame geometry,
  target backplates, screws/collars/brackets, hardware scaling on impacts, and
  pose-driven camera parallax that follows marble tangent/depth without changing
  synced marble timing.
- Browser still-frame review on `untitled-project-418cb58f` shows meaningful
  visual progress, but also confirms the next scene slice should remove/demote
  the fallback SVG route language, clamp over-bright frame/glow response, and
  complete an audio watch-through before declaring the machine physically
  satisfying.
- The next scene slice now hides the SVG fallback overlay by default, removes
  the non-physical target-order line from the Three.js art path, lowers
  rail/target/marble glow intensity, and widens/damps the default camera so the
  one-track fixture reads as a physical mechanism instead of a plotted diagram.
  Browser still-frame checks at 0 s, 5 s, and 10 s on
  `untitled-project-418cb58f` showed the graph-like overlay removed and no
  console warnings; the full audio watch-through remains open.
- Rails now render as paired tubes with cross ties, wall standoffs, and small
  collars instead of a single route tube. The same 0 s / 5 s / 10 s browser
  still-frame check showed the route reading more like hardware, with no
  browser warnings. Dense/local mechanism readability and the full audio
  watch-through remain open.
- Tests now protect exact impact poses, finite normalized quaternions, monotonic
  arc-length samples, and distance-based spin.

### Phase 0 - Math/reference sandbox

Before replacing the scene, build the pure math layer with tests:

- vector helpers for Hermite curves, analytic arcs, arc-length tables, rolling
  spin, bank angle, and damped response;
- fixed fixture tests against `untitled-project-418cb58f`;
- golden samples for several note times and between-note times;
- speed/height clamps that downgrade impossible moves into rail/rattle/cascade
  segments.

This keeps us from debugging math, timing, and WebGL at the same time.

### Phase 1 - 3D pose compiler

Upgrade the compiler output so every segment has:

- 3D `from` / `to`;
- target contact normal;
- tangents/controls;
- arc-length samples;
- contact/hold/release metadata;
- response metadata for the target that gets hit.

Acceptance: tests prove exact impact, continuity, monotonic arc length, bounded
speed, and sane final tail behavior.

### Phase 2 - Three.js machine replacement

Replace the visible Marble layer with 3D geometry:

- wall board;
- plates/pegs/chimes;
- rods/brackets/screws;
- rails/tubes;
- glass/emissive marble;
- contact shadows and target glows.

Acceptance: the scene reads as a wall-mounted 3D marble machine even when
paused. The SVG overlay and any order-tracing path line are hidden by default or
clearly debug-only; visible guide geometry must be physically justified as rails,
supports, rods, wires, shadows, or target hardware.

### Phase 3 - Physics-feel pass

Use `sampleMarblePose` and response metadata to drive:

- marble roll/spin;
- contact squash/flare;
- plate wobble/recoil;
- depth/parallax camera movement;
- dense-note local mechanisms.

Acceptance: the one-track fixture still feels synced, and now the marble has
weight.

### Phase 4 - Optional engine spike

Only after Phase 3 works, optionally test Rapier or cannon-es for secondary
props behind a feature flag. If it does not clearly improve the look without
adding sync risk, remove the spike.

## Compiler tasks

### P1 - Upgrade path segments

- Add richer segment fields for tangents, normals, banking, arc length, and
  contact metadata.
- Generate true 3D contact positions for targets.
- Preserve current exact-impact tests.
- Add tests for:
  - every impact pose lands on the target;
  - every moving segment has positive duration;
  - adjacent segments are position-continuous;
  - arc-length samples are monotonic;
  - no segment exceeds configured max visual speed unless it is classified as
    rattle/cascade.
  - target positions are unchanged when only pitch changes;
  - fixture average speeds stay within the configured physical band and the
    fastest/slowest ratio remains bounded.
  - marble center stays at least one radius plus target half-thickness outside
    the platform around impact;
  - inflated oriented target footprints never intersect.

### P2 - Add `sampleMarblePose`

Replace or extend `sampleMarblePath` with a pose sampler:

```ts
sampleMarblePose(path, t): MarblePose
```

The sampler must return:

- position;
- quaternion/orientation;
- tangent;
- normal;
- speed;
- spin angle;
- contact flag;
- segment id/kind/progress.

It must be pure and deterministic.

### P3 - Compile physical response metadata

For each impact, compile:

- impact normal;
- incoming speed;
- response amplitude from velocity and speed;
- response duration;
- target wobble axis;
- glow/flash envelope.

This lets the scene render target physics without guessing from raw note data.

## Scene tasks

### R1 - Make Three.js the primary visible layer

- Keep WebGL2-only renderer initialization.
- Render the real wall, plates, rails, rods, pegs, marble, shadows, and glow in
  Three.js.
- Keep the SVG overlay hidden by default or remove it after the 3D layer is
  reliable. If retained, it must be toggled as a debug/sync diagnostic, not
  visible in exported artwork.
- Remove or replace the faint order polyline. The viewer should see built
  machine geometry, not the compiler's note order.
- Ensure `destroy()` disposes geometries, materials, textures, renderer, and any
  overlay nodes.

### R2 - Real 3D machine geometry

Create reusable builders:

- `createWallBoard`;
- `createPlateTarget`;
- `createPegTarget`;
- `createChimeTarget`;
- `createRailTube`;
- `createRodBracket`;
- `createMarble`.

Use simple geometry first:

- boxes/cylinders/spheres;
- bevel-like geometry where cheap;
- tubes along compiled rail curves;
- small screws/brackets for scale;
- target contact normals visible through tilt.

Material/lighting guardrails from the browser review:

- cap emissive/glow/frame brightness so the board frame never becomes the
  brightest object except during an intentional final reveal;
- make the marble and active target the local contrast peak at impact time;
- keep rails visible enough to explain motion, but dim enough that they do not
  read as a neon chart line.

### R3 - Marble physical rendering

Every frame:

1. sample `MarblePose`;
2. set marble position and quaternion;
3. rotate internal highlight/swirl from spin;
4. update contact shadow at the nearest target/wall point;
5. update trail/ribbon only as a subtle depth cue;
6. render.

The marble should feel like the hero object even before material polish.

### R4 - Target response

Each target should respond to impact age:

- plate flex/wobble;
- emissive pulse;
- tiny recoil along contact normal;
- resonator glow decay;
- chime shimmer;
- bracket shadow shift.

This response must peak at the compiled `hitT`.

### R5 - Camera parallax

Start with deterministic pose-follow framing, then add compiler-authored camera
anchors that can show depth without violating visibility:

- marble remains in-frame for the complete sampled timeline;
- current M1.5 camera centers the marble and uses compiled keys only for
  depth/zoom;
- close follow during sparse passages;
- slightly wider view before dense mechanisms;
- no camera cut that hides a note impact;
- final sculpture view after the last note/tail.

The camera remains sampled by absolute time.

After the 2026-07-09 review, subject visibility outranks sculpture overview.
Do not restore wide-board framing until an automated viewport projection check
proves the marble remains visible at every sampled time.

## Milestones

### M1.5 - Physical pose compiler

Done when:

- `sampleMarblePose` exists;
- path segments include tangents/normals/arc lengths;
- marble spin is distance-based;
- compiler tests prove exact note arrivals and continuity;
- current one-track fixture still feels synced.

### M2.1 - 3D machine replacement

Done when:

- the main visible Marble layer is Three.js 3D, not SVG;
- plates, rails, rods, wall, and marble all exist as 3D geometry;
- the route no longer reads as a plotted polyline;
- camera movement reveals real depth/parallax;
- target glow/wobble remains tied to impacts;
- no WebGL leaks or stale overlays appear after hot reload/concept switching.

### M2.2 - Physics-feel pass

Done when:

- marble acceleration/deceleration is visible;
- spin matches travel distance;
- arcs/drops feel weighted;
- impacts produce convincing target recoil;
- dense notes use compact mechanisms;
- tail settles rather than going dead.

### M2.3 - Acceptance watch-through

Done when the user can watch `untitled-project-418cb58f` and say:

> It still feels synced, and now the marble looks like it has real physical
> weight in a 3D space.

Only after that should work move to two-track Marble Music.

Before this gate can pass, review at least:

- 0 s, 5 s, and 10 s still frames with overlays off;
- a continuous audio watch-through of the full 12.5 s fixture;
- impact scrubs on several note hits;
- several between-note scrubs that prove the marble advances throughout the
  interval rather than waiting and then sprinting into the next impact.

## Verification checklist

- [ ] `corepack pnpm --filter @reaper-viz/compiler-marble test`
- [ ] Motion math unit tests for Hermite, arc, arc-length, spin, banking, and
      damped response
- [ ] Fixture-golden samples for `untitled-project-418cb58f` impact times
- [ ] `corepack pnpm --filter @reaper-viz/scene-marble build`
- [ ] `corepack pnpm --filter @reaper-viz/app typecheck`
- [ ] Full `corepack pnpm check`
- [ ] Browser watch-through on `untitled-project-418cb58f`
- [ ] Overlay-off still frames at 0 s, 5 s, and 10 s: no graph-like route line,
      no over-bright frame, marble/active target remain the focal point
- [ ] Scrub to every impact: marble is visibly at/near the correct target
- [x] Compiler tests reject stationary holds between impacts and verify first
      drop, full-interval travel, exact arrivals, and accumulated roll
- [x] Compiler tests bound average speed and prove pitch does not change route
      geometry
- [x] Compiler v11 separates platform centers from marble contact poses, samples
      pre/contact/post clearance, ranks target candidates against a 120 Hz
      sample of the full route, and validates sphere-to-3D-oriented-box
      clearance plus full 3D platform separating axes
- [x] A five-forward/one-back depth cadence weaves the marble through a widened
      bounded corridor; platform depth tilt follows the 3D collision normal
- [x] Projected-axis audit measures the reference project at 19.8% lateral,
      20.4% vertical, and 59.9% front/back contribution; regression tests
      require at least 52% depth and no more than 30% lateral contribution
- [x] Pose-follow camera uses a weighted time window, follows route depth at
      damped position/aim rates, and keeps stable zoom; continuity tests cover
      both sides of every impact tangent and sampled movement throughout the route
- [x] Three linked motion-mix sliders load the compiled default, maintain a 100%
      total, and rebuild the deterministic collision route at the current
      playback timestamp after a short debounce; compiler tests cover lateral-,
      vertical-, and depth-heavy profiles
- [ ] Move live motion recompilation to a Web Worker before enabling this control
      for substantially larger songs
- [x] `untitled-project-418cb58f` compiles 19 targets with zero footprint
      intersections; dense hardware is converted to compact pegs/chimes
- [x] Initial browser frame keeps the marble clearly visible with nearby
      platform context and no console warnings
- [ ] Scrub between impacts: the marble visibly advances throughout the
      interval with no late launch or target-to-target jump
- [ ] Add automated full-timeline viewport projection coverage before adding
      cinematic camera offsets
- [ ] Hot reload/concept switch: no frozen overlays, no growing platforms, no
      runaway memory

## Explicit non-goals for this slice

- Do not add two-track Marble Music yet.
- Do not use a physics engine as the marble timing authority.
- Do not build final Blender-quality assets.
- Do not spend the slice on bloom/DOF polish before the physical pose model
  works.
- Do not reintroduce flat plotted-line language as the primary visual.

## Sources consulted

| Source | What it informed |
| --- | --- |
| [Rapier JavaScript rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/) | Difference between dynamic, fixed, and kinematic bodies; why dynamic teleporting is wrong; why hero timing should stay authored. |
| [Rapier JavaScript colliders](https://rapier.rs/docs/user_guides/javascript/colliders/) | Collider/contact model for possible future secondary props. |
| [rapier.js](https://github.com/dimforge/rapier.js) | Official JS binding and deterministic package option, useful for a later spike. |
| [cannon-es](https://github.com/pmndrs/cannon-es) | Lightweight open-source JS physics engine reference and examples. |
| [react-three-rapier](https://github.com/pmndrs/react-three-rapier) / [use-cannon](https://github.com/pmndrs/use-cannon) | Useful ecosystem references, but rejected as direct dependencies because this app is not React/R3F. |
| [Three.js docs](https://threejs.org/docs/) | Rendering layer for curves, meshes, cameras, materials, shadows, vectors, and quaternions. |
| [Cubic Hermite spline](https://en.wikipedia.org/wiki/Cubic_Hermite_spline) | Smooth endpoint-exact rails and camera paths. |
| [Projectile motion](https://en.wikipedia.org/wiki/Projectile_motion) | Analytic arcs/drops that land exactly at a target time. |
| [Damping](https://en.wikipedia.org/wiki/Damping) | Recoil, wobble, resonance, and critically damped target returns. |
