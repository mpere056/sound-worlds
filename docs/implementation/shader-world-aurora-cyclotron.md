# Aurora Cyclotron implementation plan

## Product invariant

One charged particle follows helical paths through luminous electromagnetic
coils. Every grouped note owns an exact coil-center crossing. Electric fields
may change speed; magnetic fields turn the particle without changing speed.

## Mathematical model

The Lorentz equation is:

```text
m*dv/dt = q*(E + v cross B)
omega = q*|B|/m
radius = |v_perp|/|omega|
rotationAngle = omega*dt
```

For constant fields, use the closed-form decomposition of velocity parallel and
perpendicular to `B`. Given note gap `dt` and desired turn angle, directly solve
`|B| = m*angle/(q*dt)`. A bounded parallel electric field controls travel
distance without changing the authored turning plane.

A real finite coil does not create a uniform field with a hard boundary. The Q0
prototype may use explicitly labeled ideal field volumes to prove synchronization.
The promoted physics model adds analytic loop/solenoid fields or divergence-free
field primitives plus short fringe regions integrated with the Boris method.
The inverse solver applies a deterministic shooting correction through those
fringes. Validate `divergence(B) = 0` numerically and verify that magnetic work is
zero while electric work matches kinetic-energy change.

Pitch maps to field polarity, coil orientation, and aurora wavelength. Velocity
maps to field magnitude, particle charge flare, and discharge amplitude.
Duration maps to coil afterglow.

## Final aesthetic direction

Aurora Cyclotron should combine polar-night atmosphere with precision scientific
hardware: ceramic or brushed-metal coils, restrained copper details, deep blue-
black space, emerald/cyan aurora, and sparing warm discharge accents. Field lines
appear as elegant volumetric curtains rather than a dense wireframe. The charged
particle is a clean white core with a thin spectral tail. Camera banking follows
helix curvature but remains damped and horizon-aware.

Avoid generic purple sci-fi fog, every coil glowing equally, thick opaque trails,
and uncontrolled volumetric brightness. Follow the
[shared visual-quality standard](shader-worlds-visual-quality-standard.md) after
the Q0 physics gate.

## Work orders

### A0 - Contracts and direct feasibility

**Status: implemented.** `@reaper-viz/compiler-aurora` now selects one
note-bearing track deterministically, groups chord deadlines, validates charge,
mass, field, spacing, and epsilon options, emits stable IDs and gap diagnostics,
and writes `aurora.plan.json`. The 12.5-second reference song produces 19
deadlines from 19 notes, no compound deadlines, a `0.174479` second minimum gap,
and the exact `9.916146` second final deadline.

- Add compiler/schema/CLI, grouped coil deadlines, charge/mass defaults, field
  bounds, and exact final-coil ownership.
- Report gaps that exceed field, acceleration, or coil-spacing limits.
- Gate: deterministic grouping and byte-identical plan output.

### A1 - Closed-form Lorentz kernel

**Status: implemented.** Pure TypeScript propagation handles arbitrary constant
electric and magnetic fields, circular and helical motion, `E x B` drift,
zero-field and neutral degeneracies, kinetic/electric work accounting, and
absolute duration. The finite-field foundation adds arbitrary-axis solenoids
with smooth paraxial fringe fields, an explicit aperture-validity ratio,
numerical divergence measurement, and variable-field Boris propagation with
work-energy diagnostics. Eighteen focused compiler/physics tests pass, including
a 50,000-step constant-field comparison plus finite-fringe convergence,
divergence, and energy checks. The bounded shooting correction belongs to A2.

- Implement constant `E/B` propagation, helical basis construction, degenerate
  parallel-field handling, and absolute-time sampling.
- Cross-check closed form against Boris integration over randomized fields.
- Add divergence-free field primitives, fringe-region Boris propagation, and
  electric/magnetic work diagnostics before promotion beyond Q0. Completed
  with a paraxial finite-solenoid primitive; a higher-fidelity loop-field model
  remains an optional later refinement outside the certified aperture.
- Gate: position and velocity agreement below `1e-7` for production ranges.

### A2 - Inverse field and coil solver

**Status: in progress.** The first exact inverse primitive solves the signed
constant magnetic field for a requested axis, duration, and turn angle, then
propagates the resulting circular or helical segment and emits its exact
coil-center contact, physical coil axis, and separate arrival direction. It
enforces charge, speed, axis, duration, and maximum-field feasibility. A first
deterministic route compiler now scores planar, depth-oriented, and inward
candidate axes for field cost, route compactness, coil spacing, continuity, and
depth readability. The reference performance certifies 19 exact coil-center
crossings, a `6.56` maximum field under the `8.0` limit, and `0.899` minimum
adjacent coil spacing. Electric acceleration spans, full global occupancy, and
finite-fringe shooting correction remain.

- Solve field axis, magnitude, parallel acceleration, and coil transform for
  every deadline-to-deadline segment.
- Use candidate families: planar arc, 3D helix, polarity reversal, acceleration
  span, and long-gap multi-turn helix.
- Apply a bounded shooting correction for finite-field fringe regions while
  retaining the closed-form ideal segment as the initial guess.
- Gate: exact coil-center crossing, continuous state, and bounded curvature.

### A3 - Global certification

**Status: in progress; solid occupancy implemented.** Coils are certified as
oriented torus bodies rather than bounding spheres, preserving valid
perpendicular arrangements. Conservative sampled lower bounds account for coil
surface thickness, particle radius, and travel between route samples. Candidate
scoring now rejects new-coil entry clipping, old-coil rim impacts, earlier-route
intersections, final-tail exit clipping, and coil-body overlap. Candidate
feasibility also requires both axial aperture travel and a nontrivial
perpendicular velocity component, preventing legal-but-straight field spans.
The reference route reports `0.3924` minimum coil surface clearance, `0.0401`
minimum particle clearance, a `19.665` maximum route radius, zero solid
occupancy violations, and zero crossing error. Explicit early-aperture ownership
and finite-fringe recertification remain.

- Model coils as finite oriented tori with an interaction aperture. Sweep the
  charged particle against every future aperture and solid rim.
- Reject early crossings, rim impacts, coil overlap, ambiguous ownership, and
  camera-invisible depth compression.
- Gate: one and only one coil crossing per note; final coil on final note.

### A4 - Aurora shader and scene

**Status: physics graybox implemented.** Aurora Cyclotron is selectable in the
preview app. Its seek-safe Three.js scene samples the compiled Lorentz route,
renders solved toroidal coil transforms, follows the charged particle, and uses
a lightweight fragment shader for polar-night aurora curtains and stars. The
next five coils carry the visual hierarchy while passed and distant coils
recede without moving. This is a Q0 visualization, not final art direction.

- Render field-aligned aurora curtains, plasma filaments, coil discharge rings,
  and a depth-readable charged trail. Drive shader coordinates from the same
  compiled field basis used by physics.
- Use a half-resolution volumetric pass plus full-resolution coils and particle.
- Gate: shader quality changes cannot alter crossing positions or timing.

### A5 - Performance and acceptance

- Compiler budget: 300 ms p95 for 100 notes including fringe correction; retain
  a 150 ms diagnostic target for the ideal-field Q0 compiler.
- GPU budget: 16.7 ms at 1080 x 1920 with adaptive volumetric resolution.
- Test near-zero field, parallel velocity, multi-turn helices, dense notes,
  polarity changes, occupancy, full-song camera framing, and arbitrary seeks.
- Complete Q1-Q5 art direction, composition, material, effect, and full-song
  acceptance before calling the world visually finished.

## Principal risk

Several helical solutions can satisfy the same endpoint. Deterministic candidate
ordering and costs must favor readable arcs over unnecessary multi-turn motion.
