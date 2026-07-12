# Singularity Slalom implementation plan

## Product invariant

One probe reaches periapsis around a visible gravitational body at every grouped
note. Position and velocity remain continuous; the note is owned by closest
approach, not by a collision or arbitrary shader pulse.

## Mathematical model

Each local encounter uses two-body gravity:

```text
a = -mu * r / |r|^3
specificEnergy = |v|^2/2 - mu/|r|
periapsis condition: dot(r, v) = 0
```

Use patched conics: outside an encounter sphere, travel follows a bounded drift
arc; inside, propagate a Kepler segment with universal variables and Stumpff
functions. The inverse problem selects body center, `mu`, orbital plane, and
periapsis radius so the exact note time satisfies the periapsis condition and
the outgoing state can reach the next encounter.

Pitch maps to mass class, orbital-plane bias, and spectrum. Velocity maps to
`mu`, lensing strength, and accretion brightness. Clamp all mappings to prevent
singular acceleration and camera-hostile curvature.

## Work orders

### S0 - Contracts and feasibility diagnostics

- Emit note deadlines, minimum gaps, requested mass classes, and provisional
  encounter bounds.
- Diagnose intervals below minimum periapsis time before geometry generation.
- Gate: the final note is retained exactly and unsupported input fails clearly.

### S1 - Kepler propagation kernel

- Implement universal-variable propagation for elliptic, parabolic-near, and
  hyperbolic states with deterministic iteration caps.
- Cross-check against high-resolution symplectic integration.
- Gate: state error below `1e-6` over the documented operating envelope.

### S2 - Inverse encounter solver

- Use bracketed multiple shooting over center, `mu`, plane normal, and radius.
- Score continuity, acceleration, periapsis clearance, visual separation, and
  future reachability; hard physical failures never become soft penalties.
- Gate: exact closest approach at every deadline with no speed teleportation.

### S3 - Global occupancy

- Certify probe clearance from all bodies, accretion discs, and encounter
  spheres outside the assigned periapsis.
- Reject overlapping gravity wells and chaotic multi-body regions; this world
  deliberately uses patched two-body influence, not uncontrolled N-body motion.
- Gate: analytical event detection agrees with a symplectic sampled oracle.

### S4 - Shader and scene

- Raymarch accretion discs and volumetric jets; warp the background star field
  with a bounded screen-space lensing approximation derived from compiled mass
  and impact parameter.
- Render trajectory streaks and periapsis shock rings from absolute event age.
- Gate: no NaNs, infinite brightness, or resolution-dependent physics state.

### S5 - Performance and acceptance

- Compiler budget: 1.5 s p95 for 100 notes with cacheable encounter solves.
- GPU budget: 16.7 ms using capped lens samples and distance-based disc quality.
- Require stress fixtures for near-parabolic motion, long gaps, and dense notes.

## Principal risk

This is the least forgiving inverse problem. Begin with six-note hyperbolic
fixtures and do not build the final shader until propagation and event timing
are independently certified.

