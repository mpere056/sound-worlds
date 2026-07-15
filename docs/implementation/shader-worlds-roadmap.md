# Physics-first visual worlds roadmap

This roadmap covers five one-track worlds whose visible identity follows from a
deterministic physical model. They do not all use the same rendering foundation:
some are object-first, some field-first, and some hybrid. Shader use is chosen
only when it serves the product invariant.

## Shared product contract

- Select one note-bearing source track with the deterministic policy.
- Group simultaneous notes using a fixed chord epsilon.
- Give every grouped deadline one exact owned interaction or field transition.
- Compile authoritative trajectory, interaction, field, camera, and shader data
  before playback.
- Sample absolute song time; never advance hidden authoritative simulation.
- Preserve continuous state and concept-specific physical bounds.
- Certify no early ownership, solid overlap, invalid field state, or hidden
  deadline.
- Use shaders to visualize compiled state without changing its timing or truth.
- Make seeking order-independent and deterministic.
- Prepare a final-note interaction and visual resolution through the audio tail.

Phaseglass is the important field-only exception to the older hero-object rule:
its changing optical medium is the subject. Aurora retains compiled charged
physics but renders it as an abstract shared field. Pendulum, Vortex, and
Singularity each make different architecture choices documented in their plans.

## Shared package shape

```text
compilers/<concept>       grouping, inverse physics, search, certification
scenes/<concept>          geometry and/or field playback
packages/core             vector math, curves, deterministic RNG, diagnostics
packages/app              discovery, transport, tuning, export
```

Each compiler emits source diagnostics, grouped deadlines, authoritative state,
interactions, camera data, bounded visual controls, and certification. Scenes
consume the artifact without re-solving the world.

## Candidate comparison

| World | Core model | Foundation | Inverse risk | GPU cost | Order |
|---|---|---|---:|---:|---:|
| Aurora Cyclotron | Lorentz fields | field-first hybrid | low-medium | high | 1 |
| Phaseglass | vector refraction | field-first hybrid | low | high | 2 |
| Pendulum Cathedral | constrained swing/ballistics | object-first hybrid | medium | medium | 3 |
| Vortex Loom | incompressible flow | field-first hybrid | medium-high | high | 4 |
| Singularity Slalom | patched-conic gravity | object-first hybrid | high | high | 5 |

## Physics-first promotion policy

Every concept begins as a plain graybox. Visual promotion starts only after
event ownership, continuity, occupancy, seeking, camera containment, and final
resolution pass. Promotion then follows the
[Sound Worlds visual-quality standard](shader-worlds-visual-quality-standard.md)
and the [cross-world engineering learnings](sound-worlds-engineering-learnings.md).

Q0 proves the invariant. Q1 locks art direction and anti-goals. Q2 proves
composition and anticipation. Q3 proves material/field coherence. Q4 proves
musical expression. Q5 is full-song final acceptance.

## Plans

- [Aurora Cyclotron](shader-world-aurora-cyclotron.md)
- [Phaseglass](shader-world-phaseglass.md)
- [Pendulum Cathedral](shader-world-pendulum-cathedral.md)
- [Vortex Loom](shader-world-vortex-loom.md)
- [Singularity Slalom](shader-world-singularity-slalom.md)
- [Shared visual-quality standard](shader-worlds-visual-quality-standard.md)

## Cross-concept acceptance gate

Before Q1, every prototype must pass the relevant reference-song audit:

1. Every grouped note has exactly one owned interaction or field transition
   within `1e-6` seconds.
2. Analytical and numerical samplers agree within documented tolerances.
3. No future target, annulus, aperture, body, or mechanism is owned early.
4. State, speed, acceleration, curvature, tension, or field bounds pass.
5. The current event and next preparation remain readable in 9:16.
6. A 100-note fixture compiles deterministically within the concept budget.
7. Random seek order reproduces authoritative state, camera, and visual inputs.
8. Adaptive visual quality does not alter physics or event ownership.
9. The ending resolves from a prepared state and preserves the audio tail.

Passing this gate promotes only the physics/system graybox. It is not evidence
of final visual quality.
