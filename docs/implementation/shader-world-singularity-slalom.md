# Singularity Slalom implementation plan

## Concept thesis

Singularity Slalom is a sparse gravitational choreography. One small probe
passes a sequence of massive bodies, and every grouped note is the exact
periapsis of one owned encounter. The audience reads the music through changing
curvature, speed, scale, parallax, gravitational lensing, and the preparation of
the next flyby.

This is a hybrid object/field world. The probe trajectory and bodies are
compiled geometry; shaders visualize accretion, jets, and bounded lensing. The
shader must reveal the certified gravity model rather than substitute generic
space pulses for it.

## Product invariants

- Probe position and velocity remain continuous through every patch boundary.
- Every grouped note owns exactly one closest approach, detected as an exact
  radial-velocity root.
- No body, disc, atmosphere, or future encounter sphere is entered early.
- The approximation remains patched two-body dynamics; uncontrolled N-body
  chaos is outside the first product.
- Lensing bends a persistent star/depth reference using compiled body state.
- Dense notes use legal compact encounter families, not singular masses,
  invisible teleports, or unbounded speed.
- The camera preserves trajectory comprehension and a stable sense of scale.
- The final note completes a prepared terminal slingshot, capture, or escape.

## Rendering architecture decision

Use Three.js for bodies, probe, route history, and camera, plus bounded shader
passes for accretion and lensing:

```text
patched-conic compiler
  -> exact trajectory, encounters, bodies, camera, lens parameters
  -> rasterized probe/body scene
  -> refracted star-field and local volumetric resolve
```

The persistent star field, dust strata, and distant structures are essential:
lensing is not visible against empty black. Chromatic edge separation and focal
compression should be restrained. Periapsis shock rings are rejected because
they read as decorative ripples rather than gravity.

## Mathematical model

Inside an encounter patch, use two-body gravity:

```text
a = -mu*r/|r|^3
specificEnergy = |v|^2/2 - mu/|r|
periapsis condition: dot(r, v) = 0
```

Propagate elliptic, near-parabolic, and hyperbolic conics with universal
variables and Stumpff functions. Outside encounter spheres, use a declared
bounded drift or parent-frame conic. At every patch boundary preserve position
and velocity exactly and record the acceleration-model discontinuity.

Periapsis ownership requires a sign change from negative to positive radial
velocity followed by a bracketed root solve. Merely sampling a small radius is
not exact enough.

The inverse solver selects body center, gravitational parameter `mu`, orbital
plane, sphere of influence, periapsis radius, and encounter branch. Start with
analytic hyperbolic/elliptic estimates, then apply deterministic multiple
shooting. Hard rejects include body penetration, disc crossing, singular
acceleration, patch overlap, unreadable projected curvature, and no feasible
outgoing state.

Use high-resolution symplectic integration only as an oracle and for optional
finite-force refinements. Runtime simulation never owns timing.

## Musical mapping

- Register controls mass/radius family and the scale of the encounter.
- Pitch class rotates the orbital plane within a bounded spatial basis.
- Melodic interval controls signed plane change and slingshot handedness.
- Velocity controls bounded `mu`, periapsis speed, accretion excitation, and
  lensing strength.
- Duration controls afterimage, jet, and accretion persistence.
- Note spacing selects encounter family: compact flyby, long transfer, optional
  partial orbit, or sparse drift.
- Phrase density accumulates gravitational tension and environmental activity
  without replacing bodies or retuning the whole scene at each onset.

An upcoming body must be discoverable before its note through parallax, the
probe's bending approach, and subtle star-field displacement. It should not be
announced by a target ring.

## Visual direction

The world is sparse, monumental, and physically heavy. Deep black negative
space, ivory starlight, white-hot accretion edges, iron red, and rare gold heat
create a restrained palette. The small probe and its thin world-space trail
establish scale against large bodies and slowly moving reference strata.

Value hierarchy:

1. probe at current periapsis and the local accretion/lensing response;
2. next gravitational body and approach arc;
3. recent trajectory and departing body;
4. persistent star/depth field;
5. distant inactive bodies.

Lensing samples the background with body-centered, impact-parameter-bounded
offsets derived from compiled mass and camera geometry. It should produce shear,
magnification, compression, and focal displacement. A glow-only disc or circular
screen distortion is not sufficient.

The camera uses slow orbital dollies, bounded angular acceleration, and a stable
up reference. It may lead the probe toward the next encounter but should never
spin with raw orbital curvature.

Explicit anti-goals:

- interchangeable neon planets or a crowded asteroid field;
- generic shock rings, screen flashes, or lens flares on every note;
- lensing with no persistent background reference;
- full-screen distortion that hides the trajectory;
- camera tumbling, abrupt zoom, or the probe leaving frame;
- calling patched conics an exact N-body simulation;
- singular brightness, NaNs, or mass chosen only for spectacle.

Follow the [shared visual-quality standard](shader-worlds-visual-quality-standard.md)
and the [cross-world engineering learnings](sound-worlds-engineering-learnings.md).

## Compiler artifact and certification

The performance contains grouped deadlines, conic elements, patch boundaries,
body transforms, event roots, probe states, acceleration discontinuities,
clearance margins, lensing bounds, camera keys, musical envelopes, and a full
certification report.

Certification covers periapsis ownership, state continuity, body/disc clearance,
non-overlapping influence spheres, bounded acceleration, collision-free route
history, projected probe size, camera containment, and deterministic seeking.

## Work orders

### S0 - Contracts and feasibility fixtures

- Define encounter ownership, mass/radius bounds, patch policy, final encounter
  families, and explicit impossible-gap diagnostics.
- Start with six-note hyperbolic fixtures, then add elliptic, near-parabolic,
  dense, long-gap, and plane-change fixtures.
- Gate: unsupported input fails clearly without dropping or retiming notes.

### S1 - Universal-variable propagation

- Implement Stumpff functions, universal anomaly solving, deterministic
  iteration limits, and degenerate-case diagnostics.
- Cross-check position, velocity, energy, and angular momentum against a
  high-resolution symplectic oracle.
- Gate: state error stays below `1e-6` over the certified envelope.

### S2 - Periapsis and patch certification

- Implement bracketed radial-velocity roots and exact patch-boundary continuity.
- Measure acceleration-model changes and reject patches beyond approximation
  limits.
- Gate: analytical events agree with the sampled oracle and are uniquely owned.

### S3 - Inverse encounter solver

- Use analytic conic estimates plus deterministic multiple shooting over center,
  `mu`, plane, influence radius, and periapsis.
- Score future reachability, visual separation, force cost, and route clarity;
  keep physical failures as hard rejects.
- Gate: every deadline is an exact closest approach with no speed teleportation.

### S4 - Global occupancy and camera feasibility

- Certify all body, disc, jet, atmosphere, and influence-sphere clearances.
- Reject overlapping wells, unintended earlier encounters, trajectory
  compression, invisible probe spans, and camera-hostile curvature.
- Gate: the full route remains legible and collision-free in 9:16.

### S5 - Hybrid scene and physically owned lensing

- Render body/accretion geometry and a persistent multi-depth star/dust field.
- Derive lens offsets, chromatic separation, and caustic intensity from compiled
  mass, impact parameter, and camera geometry.
- Keep jets, heat, and trail secondary to trajectory and lensing.
- Gate: lensing reads as background displacement in still frames with all note
  flashes disabled.

### S6 - Musical phrasing, camera, and ending

- Add dense-phrase accumulation, silence coasting, exact periapsis envelopes,
  bounded camera look-ahead, and authored final capture/escape resolution.
- Gate: full playback and random seeks contain no camera, exposure, body, or
  shader-slot discontinuities.

### S7 - Performance and final acceptance

- Compiler budget: `1.5 s` p95 for 100 notes with cached encounter primitives.
- GPU budget: `16.7 ms` using capped lens samples and distance-based disc detail.
- Require near-parabolic, high-curvature, sparse, dense, silent, and final-tail
  acceptance captures before promotion beyond engineering preview.

## Principal risks

The inverse problem is the least forgiving of the planned worlds. The visual
risk is equally important: generic planets and pulse rings would erase the
concept even if timing were correct. Do not begin final accretion art until a
neutral six-encounter scene proves exact periapsis, readable scale, and star-field
lensing derived from compiled mass.
