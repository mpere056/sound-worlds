# Pendulum Cathedral implementation plan

## Concept thesis

Pendulum Cathedral is a monumental kinetic instrument. One luminous orb moves
through a coherent architecture of pivots, tethers, transfer catches, and
resonant chimes. Every grouped note owns one mechanically meaningful event:
chime strike, tether attach, tether release, or maximum-tension passage.

The subject is crafted mechanism and gravity. This is an object-first hybrid
world, not a shader-first world. Shaders may reveal crystal refraction, tension,
resonance, dust in light shafts, and subtle material response, but recognizable
geometry and certified constrained motion carry the experience.

## Product invariants

- Orb position and velocity are continuous except at declared, energy-accounted
  attach, release, or impact impulses.
- A tether pulls but never pushes; tension remains nonnegative.
- Every note owns exactly one visible mechanical event at its deadline.
- No future chime, tether, pivot, or architectural solid is contacted early.
- Tethers do not pass through architecture, mechanisms, or each other.
- The orb remains visible with the current and next mechanism readable.
- Dense passages use valid compact mechanisms, not implausibly short tethers or
  hidden rescue impulses.
- The final note completes a prepared terminal chime and leaves the cathedral
  resonating through the audio tail.

## Rendering architecture decision

Use Three.js geometry, physically coherent materials, compiled animation, and
selective shaders:

```text
inverse mechanism compiler
  -> pivots, tethers, chimes, orb trajectory, camera plan
  -> rasterized PBR scene
  -> local crystal/tension/light-shaft shader effects
```

Do not replace mechanisms with abstract fullscreen imagery. The audience must
understand where weight is supported, why the orb turns, and what it is about to
strike. Shader quality changes may alter caustics and atmospheric samples only;
they may not hide or alter mechanism silhouettes.

## Mathematical model

Constrained spans use the nonlinear pendulum equation:

```text
theta'' + damping*theta' + (g/L)*sin(theta) = torque(t)/(m*L^2)
small-angle half-period ~= pi*sqrt(L/g)
```

Ballistic transfers use:

```text
p(t) = p0 + v0*t + 0.5*g*t^2
v(t) = v0 + g*t
```

The compiler estimates a mechanism family from the deadline gap, then performs
bounded shooting over tether length, pivot position, swing plane, release phase,
and authored torque. Use a variational or symplectic step only for the
conservative gravity/tether subsystem. Apply damping and torque with a declared
deterministic operator split.

For a tether from pivot `c` to orb `p`, enforce `|p-c| = L`. Compute tension from
the radial equation and reject negative values. Attach candidates require
distance, approach direction, relative speed, free tether corridor, and bounded
impulse. Maximum-tension events are derivative roots solved with a bracket, not
frame samples.

Impact response uses an explicit restitution/friction model. A rendered chime
normal must agree with incoming and outgoing velocity. Energy diagnostics report
gravity work, damping loss, authored torque work, and impulse changes per span.

## Musical event vocabulary

- `chime.strike`: a visible surface contact and sound-producing payoff.
- `tether.attach`: a catch closes and a new constrained span begins.
- `tether.release`: a latch opens into a certified ballistic transfer.
- `tension.peak`: the orb passes the bottom or another solved maximum-tension
  state, revealed by a traveling tether highlight.

Chime strikes should own most ordinary notes because they are immediately
legible. Attach/release and tension events are structural punctuation and should
be selected according to phrase shape, not rotated arbitrarily.

Musical mapping:

- Register controls tether-length family and vertical architectural tier.
- Pitch class controls swing-plane orientation within a restrained spatial fan.
- Melodic interval controls transfer direction and mechanism continuity.
- Velocity controls bounded launch/impact energy, chime excitation, and tension
  highlight amplitude.
- Duration controls crystal and architectural resonance decay.
- Note spacing selects half-swing, full-swing, ballistic transfer, or compact
  compound mechanism families.

## Visual direction

The cathedral should feel engineered, old, and immense: dark stone, aged brass,
smoked or clear crystal, cool ambient shadow, and narrow warm daylight. Scale is
communicated by gravity, long arcs, acoustic decay, parallax, and restrained
atmosphere rather than constant particles.

Value hierarchy:

1. orb and current mechanical event;
2. next pivot/chime and connecting tether;
3. recent resonant mechanism;
4. cathedral structure and distant mechanisms;
5. atmospheric depth.

Anticipation comes from composition: the next chime catches a narrow highlight,
the tether path is readable, and the camera provides enough look-ahead. Do not
draw a generic target ring around it.

Effects are locally owned:

- a tether highlight travels from the physical tension maximum;
- crystal caustics begin at the impact point and respect chime orientation;
- resonance deforms local crystal/reflection response, not the entire screen;
- fragments or dust inherit impact direction when an authored event warrants
  them;
- silence preserves pendulum motion and architectural ambience.

Explicit anti-goals:

- floating pivots or unsupported architecture;
- weightless cuts, camera zoom tied directly to swing speed, or hidden impacts;
- every chime pulsing on every note;
- fullscreen stained-glass shaders replacing readable mechanisms;
- interference rings, generic magical shockwaves, and constant dust;
- bloom that erases brass, stone, and crystal material differences;
- mechanisms assembled from disconnected decorative parts.

Follow the [shared visual-quality standard](shader-worlds-visual-quality-standard.md)
and the [cross-world engineering learnings](sound-worlds-engineering-learnings.md).

## Compiler artifact and certification

The plan contains event ownership, mechanism transforms, exact span states,
tether state, impulses, energy ledger, collision clearances, camera keys,
resonance envelopes, source diagnostics, and a certification report. Runtime
playback samples this artifact and never advances an authoritative pendulum
simulation.

Certification includes swept orb collision, swept tether segments, mechanism
overlap, attach/release legality, nonnegative tension, impact normal agreement,
energy bounds, projected size, and deterministic seeking.

## Work orders

### C0 - Contracts, fixtures, and event grammar

- Define event ownership, grouping, final-note terminal chime, and impossible-gap
  diagnostics.
- Add fixtures for sparse swings, dense passages, ballistic transfers, plane
  changes, and long resonances.
- Gate: every note has one stable owner and repeated compilation is identical.

### C1 - Constraint, ballistic, and impact kernels

- Implement conservative integration, operator-split damping/torque, analytical
  ballistic sampling, constraint projection, impulses, and energy accounting.
- Implement bracketed tension extrema and radius-aware chime collision.
- Gate: tether error below `1e-7` and ballistic endpoint error below `1e-6`.

### C2 - Inverse mechanism solver

- Generate deterministic families: half swing, full swing, release transfer,
  catch transfer, ballistic chime, and compact compound instrument.
- Back-solve length, pivot, phase, plane, torque, and contact normal.
- Score energy continuity, spatial clarity, future reachability, and repetition;
  keep physical failures as hard rejects.
- Gate: no unexplained velocity change or runtime rescue impulse.

### C3 - Global geometry and tether certification

- Sweep orb and tether against all live mechanisms and cathedral solids.
- Reject negative tension, tangled or intersecting tether corridors, premature
  chime contact, pivot overlap, and insufficient projected target size.
- Gate: randomized continuous validation agrees with a conservative oracle.

### C4 - Object-first scene and materials

- Build coherent pivots, catches, tethers, chimes, and supporting architecture
  with stable local hierarchies and shared material families.
- Add crystal transmission, brass/stone response, bounded shadows, and light
  shafts without making shader effects the subject.
- Gate: the gray material scene still explains every event with effects disabled.

### C5 - Camera, resonance, and musical phrasing

- Compile a damped crane/dolly camera from orb motion and mechanism look-ahead.
- Add local attack/sustain/release envelopes, tension travel, crystal caustics,
  and a prepared final resonance.
- Gate: exact-event scrubs, random seeks, and dense passages show no camera,
  transform, or exposure jumps.

### C6 - Performance and final acceptance

- Compiler budget: `750 ms` p95 for 100 notes.
- GPU budget: `16.7 ms` with shadow, caustic, and atmosphere quality tiers.
- Require material, mechanism, collision, 9:16, full-song, and silent-playback
  audits before promotion beyond engineering preview.

## Principal risks

The physics risk is that short gaps demand implausibly short tethers or excessive
attach impulses. The visual risk is turning a precise kinetic instrument into a
generic fantasy shader scene. Solve and render a six-event brass/crystal
mechanism in neutral light before building the cathedral around it.
