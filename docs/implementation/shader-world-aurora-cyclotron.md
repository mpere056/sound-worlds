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

Pitch maps to field polarity, coil orientation, and aurora wavelength. Velocity
maps to field magnitude, particle charge flare, and discharge amplitude.
Duration maps to coil afterglow.

## Work orders

### A0 - Contracts and direct feasibility

- Add compiler/schema/CLI, grouped coil deadlines, charge/mass defaults, field
  bounds, and exact final-coil ownership.
- Report gaps that exceed field, acceleration, or coil-spacing limits.
- Gate: deterministic grouping and byte-identical plan output.

### A1 - Closed-form Lorentz kernel

- Implement constant `E/B` propagation, helical basis construction, degenerate
  parallel-field handling, and absolute-time sampling.
- Cross-check closed form against Boris integration over randomized fields.
- Gate: position and velocity agreement below `1e-7` for production ranges.

### A2 - Inverse field and coil solver

- Solve field axis, magnitude, parallel acceleration, and coil transform for
  every deadline-to-deadline segment.
- Use candidate families: planar arc, 3D helix, polarity reversal, acceleration
  span, and long-gap multi-turn helix.
- Gate: exact coil-center crossing, continuous state, and bounded curvature.

### A3 - Global certification

- Model coils as finite oriented tori with an interaction aperture. Sweep the
  charged particle against every future aperture and solid rim.
- Reject early crossings, rim impacts, coil overlap, ambiguous ownership, and
  camera-invisible depth compression.
- Gate: one and only one coil crossing per note; final coil on final note.

### A4 - Aurora shader and scene

- Render field-aligned aurora curtains, plasma filaments, coil discharge rings,
  and a depth-readable charged trail. Drive shader coordinates from the same
  compiled field basis used by physics.
- Use a half-resolution volumetric pass plus full-resolution coils and particle.
- Gate: shader quality changes cannot alter crossing positions or timing.

### A5 - Performance and acceptance

- Compiler budget: 150 ms p95 for 100 notes due to closed-form segments.
- GPU budget: 16.7 ms at 1080 x 1920 with adaptive volumetric resolution.
- Test near-zero field, parallel velocity, multi-turn helices, dense notes,
  polarity changes, occupancy, full-song camera framing, and arbitrary seeks.

## Principal risk

Several helical solutions can satisfy the same endpoint. Deterministic candidate
ordering and costs must favor readable arcs over unnecessary multi-turn motion.

