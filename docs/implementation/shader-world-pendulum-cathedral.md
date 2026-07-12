# Pendulum Cathedral implementation plan

## Product invariant

One luminous orb moves through a cathedral of pivots, tethers, and chimes. Every
grouped note owns exactly one chime strike, tether transfer, or maximum-tension
event. The orb alternates constrained swings and certified ballistic transfers.

## Mathematical model

Constrained swing spans use:

```text
theta'' + damping*theta' + g/L*sin(theta) = torque(t)/(m*L^2)
small-angle half-period ~= pi*sqrt(L/g)
```

Ballistic transfers use `p(t)=p0+v0*t+0.5*g*t^2`. The inverse compiler first
estimates tether length from the note gap, then uses a deterministic shooting
solve for pivot position, release angle, and bounded torque. Constraint impulses
preserve position and apply explicitly reported energy changes.

Use a symplectic or variational step only for the conservative gravity/tether
subsystem. Apply damping and authored torque in a deterministic operator-split
step; calling the entire damped system symplectic would be incorrect. A tether
may pull but never push, so tension must remain nonnegative. Attach candidates
must satisfy distance, approach-direction, and relative-speed bounds before an
impulse is legal.

Pitch maps to tether length, swing plane, and chime color. Velocity maps to
launch energy, tension glow, and chime amplitude. Duration maps to resonance.

## Final aesthetic direction

Pendulum Cathedral should feel architectural and crafted: monumental dark stone,
aged brass pivots, clear or smoked crystal chimes, narrow shafts of warm daylight,
and cool shadow rather than generalized fantasy glow. Tethers reveal tension
through restrained traveling highlights. The camera uses measured crane and
dolly movement that respects gravity, scale, and the rhythm of the swing.

Avoid floating architecture, weightless cuts, excessive stained-glass color,
constant dust, and bloom that erases brass/crystal material differences. Follow
the [shared visual-quality standard](shader-worlds-visual-quality-standard.md)
after the Q0 physics gate.

## Work orders

### C0 - Event vocabulary and plan

- Define `chime.strike`, `tether.attach`, `tether.release`, and `tension.peak`
  ownership with exact deadline semantics.
- Emit gap feasibility and required swing-family diagnostics.
- Gate: every note has one owner and the final note owns a terminal chime.

### C1 - Constraint and ballistic kernel

- Implement conservative symplectic swing integration, operator-split damping
  and torque, analytical ballistic sampling, constraint projection,
  release/attach impulses, tension checks, and energy accounting.
- Detect maximum-tension ownership by a bracketed derivative root rather than a
  frame sample.
- Gate: tether-length error below `1e-7`; ballistic endpoint below `1e-6`.

### C2 - Inverse mechanism solver

- Generate candidates in order: half swing, full swing, transfer, ballistic
  chime, and compound pivot transfer.
- Use bounded shooting over length, pivot, phase, and torque; score energy
  continuity, mechanism spacing, readable arcs, and future reachability.
- Gate: no unexplained velocity change and no runtime rescue impulse.

### C3 - Geometry and collision certification

- Sweep the orb against every future chime, tether, pivot, and architectural
  collider. Certify tether paths against mechanisms and prevent tangled spans.
- Reject negative tension, invalid approach direction, and attachments whose
  impulse exceeds the authored energy budget.
- Gate: assigned contacts occur at endpoints and all premature contacts fail.

### C4 - Shader cathedral

- Render volumetric stained-light fields, interference rings, tether tension
  waves, and chime resonance using compiled event-age uniforms.
- Keep structural geometry simple and let the shader reveal force and tension.
- Gate: camera always sees the orb and the next mechanism without abrupt zoom.

### C5 - Budgets and acceptance

- Compiler budget: 750 ms p95 for 100 notes.
- GPU budget: 16.7 ms with bounded volumetric samples and shadow quality tiers.
- Test dense notes, near-full rotations, zero-length gaps, tether crossings, and
  arbitrary seeking.
- Complete Q1-Q5 art direction, composition, material, effect, and full-song
  acceptance before calling the world visually finished.

## Principal risk

Short note gaps can demand implausibly short tethers. Compound chimes may group
dense deadlines, but the compiler must diagnose rather than silently retime.
