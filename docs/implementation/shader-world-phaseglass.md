# Phaseglass implementation plan

## Product invariant

A luminous signal comet crosses one refractive phase membrane at every grouped
note. The crossing is intentional and exact; no membrane is crossed early.
Refraction redirects the comet without a discontinuity in position or speed.

## Mathematical model

For normalized incoming direction `i`, membrane normal `n`, and refractive
ratio `eta`, use vector Snell refraction:

```text
k = 1 - eta^2 * (1 - dot(n, i)^2)
t = eta*i - (eta*dot(n,i) + sqrt(k))*n
```

Reject `k < 0` unless the authored interaction is explicitly a total-internal-
reflection variant. Preserve speed with `v_out = speed * normalize(t)`.

Given bounded incoming and desired outgoing directions, solve membrane normal
and `eta` using a deterministic bracketed root solve. The next contact satisfies
`p(t_i) = contact_i`; straight spans use `p1 = p0 + v*dt`, while long spans may
use a low-curvature cubic flow segment with analytical arc-length lookup.

Pitch maps to `eta`, hue, and turn axis. Velocity maps to ripple amplitude and
chromatic spread. Duration maps only to visual decay.

## Work orders

### P0 - Contracts and grouping

- Add `compiler-phaseglass`, CLI, strict schema, fixtures, and stable IDs.
- Emit membrane deadlines, pitch/velocity mappings, gap diagnostics, and an
  explicit final-membrane contract.
- Gate: shuffled note input produces byte-identical plans.

### P1 - Refraction kernel

- Implement normalized refraction, inverse-normal solve, total-internal-
  reflection detection, and constant-speed segment sampling.
- Add randomized forward/inverse round-trip tests and grazing-incidence cases.
- Gate: direction error below `1e-7`; speed error below `1e-9`.

### P2 - Global route and certification

- Run bounded beam search over outgoing headings, `eta`, and membrane roll.
- Model membranes as finite oriented discs with active crossing apertures.
- Sweep every earlier segment against each future aperture; reject early
  crossings, edge clipping, membrane overlap, and camera-invisible contacts.
- Gate: every note owns exactly one aperture crossing and the final note owns
  the terminal membrane.

### P3 - Shader prototype

- Build a half-resolution fullscreen raymarch pass with folded noise, bounded
  32-48 steps, depth reconstruction, and temporal jitter.
- Render membranes with refraction, normal distortion, caustics, and a
  note-triggered radial shockwave sampled from absolute time.
- Gate: disabling shader quality changes appearance only, never geometry.

### P4 - Scene and camera

- Render the comet, persistent depth-readable trail, membrane rims, and camera
  look-ahead from compiled trajectory derivatives.
- Add app discovery, tuning, scrub, PNG, and short-video export.
- Gate: arbitrary seeking reproduces identical comet and shader state.

### P5 - Acceptance and budgets

- Compiler budget: 250 ms p95 for 100 notes after warmup.
- GPU budget: 16.7 ms at 1080 x 1920; adaptive raymarch resolution down to 0.5.
- Run full-song viewport, early-crossing, dense-note, and human motion audits.

## Principal risk

Finite membranes can intersect earlier spans even when their center contacts are
valid. Reuse Brick Breaker's time-varying occupancy discipline from the start.

