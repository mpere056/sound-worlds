# Vortex Loom implementation plan

## Product invariant

One luminous seed is advected through an incompressible flow. Every grouped note
is an exact passage through the annular interaction zone of one musical vortex.
The seed curls continuously; it never teleports or receives an unexplained kick.

## Mathematical model

Use a regularized point-vortex field plus bounded base flow:

```text
dx/dt = u(x,t)
u = baseFlow + sum Gamma_j/(2*pi*(r_j^2 + core_j^2)) * perp(r_j)
```

Integrate with deterministic fixed-step RK4 and dense Hermite event sampling.
The inverse solver selects vortex center, circulation `Gamma`, core radius, and
activation window so `|x(t_i)-center_i| = contactRadius_i` at the deadline.

The certified physics is two-dimensional incompressible flow with
`divergence(u) = 0` inside tolerance. A 2.5D presentation may place independent
flow layers at different depths and interpolate purely visual dye between them;
it must not be described as a solved three-dimensional fluid. A note owns the
first correctly oriented annulus entry at its deadline, not any later recrossing.

Pitch controls circulation sign, depth layer, and dye wavelength. Velocity
controls circulation magnitude and emitted ink density. Duration controls visual
dye persistence, not the physical activation interval unless explicitly mapped.

## Final aesthetic direction

Vortex Loom should resemble museum-scale ink and mineral pigment moving through
dark water: graphite black, oxidized cyan, muted vermilion, and occasional gold
particulate highlights. Large calm fields and negative space make each curl
legible. The seed remains a crisp luminous point with a fine tapering filament;
the camera drifts like a macro lens rather than chasing every eddy.

Avoid full-screen high-frequency curl noise, uniformly saturated dye, muddy
additive blending, and turbulent motion with no hierarchy. Follow the
[shared visual-quality standard](shader-worlds-visual-quality-standard.md) after
the Q0 physics gate.

## Work orders

### V0 - Contracts and fixed-step policy

- Add compiler/schema/CLI, note grouping, stable seed policy, and a documented
  physics step independent of render FPS.
- Gate: the same song compiles identically across worker counts and machines.

### V1 - Flow kernel

- Implement regularized vortex velocity, analytical Jacobian, RK4 propagation,
  dense interpolation, and annulus event detection.
- Verify numerical divergence, first-entry orientation, and 2D layer ownership.
- Verify near-core stability and convergence against half-step integration.
- Gate: deadline-position drift below `1e-5` at the production step.

### V2 - Multiple-shooting inverse solver

- Solve one interval at a time, then globally relax centers and circulation with
  bounded Levenberg-Marquardt or deterministic coordinate descent.
- Penalize curvature spikes, near-stagnation, route self-crowding, and camera
  reversals; reject singular cores and impossible deadlines.
- Gate: all residuals and iteration counts are emitted in diagnostics.

### V3 - Time-varying occupancy

- Certify exactly one assigned annulus crossing per note and no early crossing
  of future vortices. Prevent overlapping cores and ambiguous simultaneous
  ownership.
- Gate: event detector agrees with a high-resolution sampled oracle on seeded
  randomized fields.

### V4 - Fluid shader

- Advect a low-resolution dye texture with semi-Lagrangian backtracing driven by
  the same compiled field parameters; add curl-noise detail visually only.
- Composite streamlines, pressure ripples, seed trail, and note-age blooms.
- Gate: resetting or seeking reconstructs dye deterministically from checkpoints
  or a bounded replay, never from uncontrolled frame history.

### V5 - Budgets and acceptance

- Compiler budget: 2 s p95 for 100 notes; expose iteration-budget exhaustion.
- GPU budget: 16.7 ms with a 0.5-resolution dye buffer and fixed advection steps.
- Run dense-vortex, stagnation, long-gap, seek, and full-song camera audits.
- Complete Q1-Q5 art direction, composition, material, effect, and full-song
  acceptance before calling the world visually finished.

## Principal risk

Persistent fluid textures conflict with stateless seeking. Plan deterministic
checkpoints every fixed musical interval before visual work expands.
