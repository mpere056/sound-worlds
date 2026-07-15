# Vortex Loom implementation plan

## Concept thesis

Vortex Loom is a deterministic fluid-field world in which one luminous shuttle
seed is woven through a persistent mineral-pigment medium. Every grouped note is
the seed's first correctly oriented entry into the annular interaction zone of
one compiled vortex. The same vortices that steer the seed deform the visible
warp, weft, dye, and particulate field; there is no separate beat-overlay
system.

This should feel like fluid mechanics becoming textile structure, not like a
marble route underwater and not like Aurora Cyclotron with a different palette.

## Product invariants

- The seed trajectory is continuous and is sampled from absolute score time.
- Every grouped deadline owns exactly one oriented annulus entry.
- No future annulus is entered early and no core is crossed illegally.
- The steering field is two-dimensional and incompressible within tolerance.
- Depth is a presentation of several certified 2D strata, not falsely claimed
  three-dimensional fluid simulation.
- All visible motion derives from one velocity field and its transported state.
- Dense notes increase bounded field strain and weave density without resetting
  the medium or replacing the composition.
- The final note completes a prepared woven structure and leaves a resolved
  pigment tail rather than producing a generic flash.

## Rendering architecture decision

Vortex Loom should be shader-first because the advected medium is the subject.
It is still a hybrid system:

```text
compiled 2D seed physics + vortex schedule
  -> deterministic field sampler
  -> checkpointed dye / fiber advection
  -> fullscreen field render and restrained resolve
```

Raster geometry is appropriate for the seed and optional diagnostic vectors.
The finished image should not render vortex targets as toruses or rings. Vortex
influence is perceived by deformation of persistent warp fibers, pigment, and
particulate density.

## Mathematical model

Use regularized point vortices plus a bounded divergence-free base flow:

```text
dx/dt = u(x,t)
u(x,t) = baseFlow(x,t)
       + sum Gamma_j(t)/(2*pi*(|r_j|^2 + core_j^2)) * perpendicular(r_j)
r_j = x - center_j
```

Represent the base flow with a stream function `psi`, using
`u = (d psi/dy, -d psi/dx)`, so incompressibility follows analytically where
possible. Vortex activation uses smooth absolute-time envelopes with bounded
first derivatives. An activation may not apply an unexplained velocity impulse.

Integrate the seed with deterministic fixed-step RK4 and dense Hermite output.
Detect each assigned event by solving the first root of:

```text
f(t) = |x(t) - center_i|^2 - contactRadius_i^2
```

Require the configured entry orientation from `dot(relativePosition, velocity)`.
The inverse solver selects center, circulation `Gamma`, core radius, activation
envelope, and depth stratum. It uses interval multiple shooting followed by a
bounded global relaxation. Hard failures include singular cores, stagnation,
wrong-side entry, recrossing ambiguity, and impossible deadlines.

The visible transport uses the same velocity field. Semi-Lagrangian advection
is acceptable for dye, but fiber landmarks should use a less diffusive method or
periodic deterministic remeshing so the loom does not dissolve into fog. Track
numerical mass loss and compensate only with a documented bounded correction.

## Musical mapping

The mapping is continuous and field-coherent:

- Register controls vortex core scale and which depth stratum carries the
  strongest deformation.
- Pitch class rotates the local strain axis around a circle-of-fifths basis.
- Melodic direction controls circulation handedness and shuttle approach bias.
- Velocity controls bounded circulation magnitude, pigment concentration, and
  caustic contrast.
- Duration controls the persistence and length of newly woven pigment, not the
  physical event time.
- Note spacing controls isolation versus interaction: sparse notes produce one
  broad readable curl; dense notes accumulate phrase strain and finer weave.
- Silence relaxes strain and lets transported pigment coast; it never freezes
  procedural motion.

Future notes reserve low-density channels in the warp up to three seconds ahead.
The reservation should look like tension and parted fibers, not a circular
target marker. At contact, reserved space fills with transported pigment.

## Visual direction

The installation should resemble museum-scale silk, ink, and mineral pigment
moving through a dark liquid chamber. A persistent sparse warp/weft reference
makes fluid deformation legible. Graphite black, oxidized cyan, muted vermilion,
bone white, and rare gold particulate provide a controlled material family.

Value hierarchy:

1. seed and current woven contact;
2. locally strained fibers and transported pigment;
3. next reserved channel;
4. older woven history;
5. calm surrounding medium.

The camera is a stable macro observation camera with bounded drift and shallow
parallax across strata. It does not chase every eddy. Large calm areas are
required so a curl has scale and direction.

Explicit anti-goals:

- visible annulus rings, target toruses, or repeated water ripples;
- full-screen curl noise with no hierarchy;
- dye, streamlines, and particles moving under unrelated equations;
- muddy additive blending or unrestricted rainbow pigment;
- per-note field resets, camera snaps, or sudden shader-slot replacement;
- calling decorative depth offsets solved 3D fluid dynamics;
- Aurora-like volumetric clouds, central knots, or electrical filaments.

Follow the [shared visual-quality standard](shader-worlds-visual-quality-standard.md)
and the [cross-world engineering learnings](sound-worlds-engineering-learnings.md).

## Compiler and runtime artifact

The compiler emits:

- grouped deadlines and source diagnostics;
- seed initial state and fixed physics step;
- vortex centers, cores, circulation curves, and activation windows;
- owned annulus entries and entry orientations;
- depth-stratum and continuous musical mappings;
- camera bounds and seed visibility report;
- physics, occupancy, convergence, and determinism certification;
- visual checkpoint cadence and replay budget.

Runtime playback samples this artifact. It may replay dye from the nearest
checkpoint, but it may not re-solve vortex placement.

## Work orders

### V0 - Contracts, fixtures, and fixed-step policy

- Add compiler/schema/CLI, deterministic grouping, stable seed policy, and
  explicit 2D/2.5D terminology.
- Add sparse, dense, long-silence, polarity-reversal, and final-note fixtures.
- Gate: compilation is byte-identical across repeated runs and worker counts.

### V1 - Divergence-free flow kernel

- Implement the stream-function base flow, regularized vortex velocity,
  analytical Jacobian, RK4 propagation, and dense interpolation.
- Verify divergence, near-core stability, energy-like bounds, and half-step
  convergence over randomized production ranges.
- Gate: seed drift remains below `1e-5` at the production step.

### V2 - Exact event and inverse solver

- Implement bracketed first-entry detection with oriented ownership.
- Build deterministic multiple shooting over center, circulation, core, and
  activation parameters, then bounded global relaxation.
- Keep physical impossibilities as hard rejects; emit residual and candidate
  diagnostics for every interval.
- Gate: every deadline error is below `1e-6` seconds with continuous velocity.

### V3 - Global occupancy and readability

- Reject early future-annulus entries, core crossings, overlapping cores,
  recrossing ambiguity, route self-crowding, and prolonged stagnation.
- Audit projected seed size, next-channel visibility, camera reversals, and
  excessive curvature compression in 9:16.
- Gate: event detection agrees with a high-resolution oracle on seeded tests.

### V4 - Deterministic transport and checkpoints

- Implement checkpointed dye advection, fiber transport/remeshing, pigment mass
  diagnostics, and bounded replay after arbitrary seeking.
- Separate authoritative field state from purely visual micro-detail.
- Gate: checkpoint restore and replay match uninterrupted playback within the
  documented texture tolerance and produce identical seed state.

### V5 - Unified field shader

- Render warp fibers, pigment density, particulate glints, future reservations,
  and contact light from the same advected coordinates and field potential.
- Use one half-resolution field pass plus a restrained full-resolution resolve.
- Prove that disabling particles or microdetail does not remove the main flow
  reading or change timing.
- Gate: sparse, dense, and silent captures all read as one medium in still frames.

### V6 - Camera, musical envelopes, and ending

- Add bounded camera drift, absolute-time attack/sustain/release curves, dense
  phrase pressure, and a causally prepared final textile resolution.
- Verify that future-note slot changes have zero-value handoffs.
- Gate: random seeks reproduce composition without pops or camera jumps.

### V7 - Performance and final acceptance

- Compiler budget: `2 s` p95 for 100 notes, with iteration exhaustion reported.
- GPU budget: `16.7 ms` at 1080 x 1920 using a half-resolution transport field.
- Record pigment replay cost, GPU time, and adaptive-quality compromises.
- Complete Q1-Q5 acceptance before promotion beyond engineering preview.

## Principal risks

The largest technical risk is deterministic seeking for persistent transported
textures. The largest visual risk is producing generic turbulence or water
ripples instead of a legible woven medium. Build checkpoint/replay and the
persistent warp reference before adding high-frequency fluid detail.
