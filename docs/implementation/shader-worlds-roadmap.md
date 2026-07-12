# Physics-first shader worlds roadmap

This roadmap defines five one-track, one-hero-object worlds whose shader
identity follows from a deterministic physical model. Each concept has its own
work orders, but all five share the same musical and runtime contracts.

## Shared product contract

- Select one note-bearing source track with the existing deterministic policy.
- Group simultaneous notes using a fixed chord epsilon; one group owns one
  exact interaction deadline.
- Compile all trajectory, interaction, camera, and shader-control data before
  playback. Runtime rendering samples absolute song time and never advances a
  hidden simulation.
- Every grouped deadline has exactly one visible interaction. No early contact,
  duplicate ownership, silent deadline, or retiming is allowed.
- Preserve a continuous hero-object trajectory with documented speed,
  acceleration, curvature, and visibility bounds.
- Shader effects may visualize physics but may not alter compiled physics.
- Seeking to times in any order must produce byte-identical poses and uniforms.
- The final note owns an authored terminal interaction and visual resolution.

## Shared package shape

```text
compilers/<concept>       grouping, inverse physics, search, certification
scenes/<concept>          Three.js geometry and GLSL shader playback
packages/core             vector math, curves, deterministic RNG, diagnostics
packages/app              discovery, transport, tuning, export
```

Each compiler emits a JSON performance containing source diagnostics, grouped
deadlines, physical segments, interactions, camera keys, bounded shader curves,
and a certification report. Each scene must render from that artifact without
re-solving the route.

## Candidate comparison

| World | Core model | Inverse-solver risk | Shader cost | Recommended order |
|---|---|---:|---:|---:|
| Aurora Cyclotron | closed-form Lorentz helices | low-medium | medium-high | 1 |
| Phaseglass | bounded vector refraction | low | high | 2 |
| Pendulum Cathedral | constrained swing and ballistic transfer | medium | medium | 3 |
| Vortex Loom | incompressible flow integration | medium-high | high | 4 |
| Singularity Slalom | patched-conic gravity | high | high | 5 |

The recommended first spike is Aurora Cyclotron because constant-field helical
motion has a closed form, making exact note timing easier to certify than the
iterative Marble Music and Brick Breaker searches.

## Physics-first, polish-later promotion policy

Each concept begins as a deliberately plain physics graybox. Shader polish must
not begin until exact note ownership, trajectory continuity, occupancy, seeking,
and camera containment pass. After that gate, promotion follows the shared
[shader worlds visual-quality standard](shader-worlds-visual-quality-standard.md):
art-direction lock, composition/camera, material and shader craft, musical
effects, then full-song visual acceptance. This preserves physics priority
without lowering the final expectation of a refined, professional result.

## Plans

- [Phaseglass](shader-world-phaseglass.md)
- [Singularity Slalom](shader-world-singularity-slalom.md)
- [Vortex Loom](shader-world-vortex-loom.md)
- [Pendulum Cathedral](shader-world-pendulum-cathedral.md)
- [Aurora Cyclotron](shader-world-aurora-cyclotron.md)
- [Shared visual-quality standard](shader-worlds-visual-quality-standard.md)

## Cross-concept acceptance gate

Before visual polish, every prototype must pass the same reference-song audit:

1. Every grouped note has exactly one interaction within `1e-6` seconds.
2. Numerical and analytical samplers agree within documented tolerances.
3. No future target is contacted early and no target geometry overlaps.
4. Speed, acceleration, and curvature stay inside concept-specific bounds.
5. The hero object remains inside the 9:16 safe viewport at sampled intervals.
6. A 100-note fixture compiles deterministically within the concept budget.
7. The shader holds 60 FPS at 1080 x 1920 on the reference machine, with an
   adaptive-quality fallback that does not change physics or event timing.

Passing this gate promotes a concept only from Q0 physics graybox to Q1 art
direction. It does not constitute visual completion.
