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

Patched-conic boundaries must preserve position and velocity exactly. Record the
acceleration-model change at each sphere of influence and reject solutions whose
boundary acceleration jump exceeds the documented approximation limit. Detect
periapsis by a sign change from `dot(r,v) < 0` to `dot(r,v) > 0`, then solve the
root; merely sampling a small radius is not exact event ownership.

Pitch maps to mass class, orbital-plane bias, and spectrum. Velocity maps to
`mu`, lensing strength, and accretion brightness. Clamp all mappings to prevent
singular acceleration and camera-hostile curvature.

## Final aesthetic direction

Singularity Slalom should be sparse, monumental, and physically heavy: deep
black negative space, restrained ivory starlight, white-hot accretion edges,
subtle iron-red and gold heat, and rare spectral color reserved for major notes.
The probe is small enough to communicate scale but has a precise readable trail.
Camera movement favors slow orbital dollies and stable horizons while lensing
and parallax communicate force.

Avoid a crowded field of interchangeable neon planets, constant camera tumbling,
overexposed discs, and lens distortion so strong that trajectories become
unreadable. Follow the [shared visual-quality standard](shader-worlds-visual-quality-standard.md)
after the Q0 physics gate.

## Work orders

### S0 - Contracts and feasibility diagnostics

- Emit note deadlines, minimum gaps, requested mass classes, and provisional
  encounter bounds.
- Diagnose intervals below minimum periapsis time before geometry generation.
- Gate: the final note is retained exactly and unsupported input fails clearly.

### S1 - Kepler propagation kernel

- Implement universal-variable propagation for elliptic, parabolic-near, and
  hyperbolic states with deterministic iteration caps.
- Implement bracketed periapsis root detection and exact state continuity at
  every patched-conic boundary.
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
- Certify non-overlapping spheres of influence, body/disc clearance, and bounded
  acceleration-model discontinuity at every patch boundary.
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
- Complete Q1-Q5 art direction, composition, material, effect, and full-song
  acceptance before calling the world visually finished.

## Principal risk

This is the least forgiving inverse problem. Begin with six-note hyperbolic
fixtures and do not build the final shader until propagation and event timing
are independently certified.
