# Phaseglass implementation plan

## Current implementation status

- P0 complete: deterministic source selection, chord grouping, and one deadline per grouped note time.
- P1 complete: tested passive Snell refraction and active phase-gradient transmission with constant-speed round trips.
- P2 first pass complete: finite membrane placement, one-contact lookahead, exact crossing and speed audits, overlap clearance, and early-crossing certification.
- P3 architectural reset implemented, visual acceptance pending: there is no hero particle, target chain, folded volume, or central knot. Broad coherent wavefront strands traverse faceted phase sheets; each sheet has view-dependent glass edges, an aperture bevel, and etching aligned to its compiled outgoing direction. Completed sheets persist as the growing score.
- P4 fourth pass complete: a fixed-orientation gallery camera glides through a continuous score window without chasing ray headings. Independently clipped route segments preserve exact visible bends and hand off continuously at note boundaries.
- P4 optical-coherence pass complete: carrier phase comes from absolute score time and remains continuous across a bend. Every note launches a deterministic directional caustic sweep across its sheet, while the composite adds restrained highlight diffraction rather than full-screen bloom.
- P4 bend-legibility pass complete: segment-local light slabs were replaced by Gaussian wave envelopes with soft longitudinal joins. Incoming and outgoing fields meet at full strength on the membrane, the near future fades by optical travel time, and rounded clipped sheets avoid rectangular light cutoffs.
- P5 compiler stress fixture complete: a deterministic 100-note phrase at roughly 105 ms spacing stays under the 250 ms test budget with positive membrane clearance and no early crossings.

## Product invariant

A coherent wavefront crosses one refractive phase membrane at every grouped
note. Its certified central ray reaches the active aperture intentionally and
exactly; no membrane is crossed early. The membrane redirects the downstream
wave without a discontinuity in central-ray position or speed, and the visible
change in direction is the membrane's authored impulse rather than a target hit.

## Mathematical model

For normalized incoming direction `i`, membrane normal `n`, and refractive
ratio `eta`, use vector Snell refraction:

```text
k = 1 - eta^2 * (1 - dot(n, i)^2)
t = eta*i - (eta*dot(n,i) + sqrt(k))*n
```

Reject `k < 0` unless the authored interaction is explicitly a total-internal-
reflection variant. Ordinary passive refraction changes propagation speed with
medium index and therefore requires medium state on both sides. Do not call a
constant-speed turn ordinary Snell refraction.

The recommended first prototype is an active phase-gradient membrane, analogous
to a metasurface, that changes tangential momentum while preserving magnitude:

```text
p_out_parallel = p_in_parallel + phaseGradient
|p_out| = |p_in|
```

Here `p` is momentum, not position. Reject a requested phase gradient when the
outgoing tangential momentum exceeds total momentum and no real normal component
exists.

The schema records `passive-refraction` or `active-phase` explicitly. The
inverse solver uses Snell only for passive spans and the phase-gradient model
for constant-speed spans.

Given bounded incoming and desired outgoing directions, solve membrane normal
and either `eta` or phase gradient using a deterministic bracketed root solve.
The next contact satisfies
`p(t_i) = contact_i`; unforced spans use `p1 = p0 + v*dt`. A curved long span
must name and compile a bounded force field; an unexplained cubic trajectory is
not accepted as physics.

Pitch maps to `eta`, hue, and turn axis. Velocity maps to ripple amplitude and
chromatic spread. Duration maps only to visual decay.

## Final aesthetic direction

Phaseglass should feel like a monumental precision-optics installation
suspended in a vast, dark architectural space. Its dominant grammar is planar
and piecewise linear: faceted phase sheets, etched interference patterns, broad
parallel wavefront strands, and caustics that reorganize downstream only where
a note membrane applies an authored impulse. Pearl-white highlights and
restrained cyan/amber spectral edges make sheet thickness, transmission, and
changing direction legible in still frames. No traveling object is the subject;
the growing refractive architecture and the light passing through it are the
subject together.

The next three seconds must read as unfilled optical capacity. Upcoming notes
appear as dormant, low-energy sheets connected by the same wave path that will
illuminate them. At contact, the entire sheet fills, its directional etching
resolves, and downstream wavefronts visibly agree with its phase gradient.
Completed sheets remain as a dim glass score. History, present, and preview are
therefore states of one optical system, not stacked effects.

Avoid hero particles, chase cameras, target chains, ring-like apertures,
volumetric nebulae, folded fractal fog, central energy knots, circular portals,
unrestricted rainbow dispersion, milky full-screen bloom, translucent objects
with no edge definition, and noise that makes every membrane look the same.
Those belong too close to Aurora Cyclotron's visual territory. Follow the
[shared visual-quality standard](shader-worlds-visual-quality-standard.md) after
the Q0 physics gate.

## Work orders

### P0 - Contracts and grouping

- Add `compiler-phaseglass`, CLI, strict schema, fixtures, and stable IDs.
- Emit membrane deadlines, pitch/velocity mappings, gap diagnostics, and an
  explicit final-membrane contract.
- Gate: shuffled note input produces byte-identical plans.

### P1 - Refraction kernel

- Implement normalized refraction, inverse-normal solve, total-internal-
  reflection detection, active phase-gradient impulses, passive medium state,
  and constant-speed active segment sampling.
- Add randomized forward/inverse round-trip tests and grazing-incidence cases.
- Gate: direction error below `1e-7`; speed error below `1e-9`.

### P2 - Global route and certification

- Run bounded beam search over outgoing headings, interaction mode, `eta` or
  phase gradient, and membrane roll.
- Model membranes as finite oriented discs with active crossing apertures.
- Sweep every earlier segment against each future aperture; reject early
  crossings, edge clipping, membrane overlap, and camera-invisible contacts.
- Gate: every note owns exactly one aperture crossing and the final note owns
  the terminal membrane.

### P3 - Shader prototype

- Build a half-resolution fullscreen raymarch pass with a bounded 32-48 steps,
  sparse architectural depth references, and temporal jitter.
- Render finite faceted membranes with outgoing-direction etchings, caustics,
  and note-triggered phase filling sampled from absolute time. Render broad
  coherent wavefront strands over independently clipped, piecewise-linear route
  segments for recent history and the three-second preview.
- Gate: disabling shader quality changes appearance only, never geometry.

### P4 - Scene and camera

- Render persistent depth-readable wavefronts, membrane frames, and a
  fixed-orientation gallery camera translated by a continuous score window.
- Add app discovery, tuning, scrub, PNG, and short-video export.
- Gate: arbitrary seeking reproduces identical architecture and shader state.

### P5 - Acceptance and budgets

- Compiler budget: 250 ms p95 for 100 notes after warmup.
- GPU budget: 16.7 ms at 1080 x 1920; adaptive raymarch resolution down to 0.5.
- Run full-song viewport, early-crossing, dense-note, and human motion audits.
- Complete Q1-Q5 art direction, composition, material, effect, and full-song
  acceptance before calling the world visually finished.

## Principal risk

Finite membranes can intersect earlier spans even when their center contacts are
valid. Reuse Brick Breaker's time-varying occupancy discipline from the start.
The broad rendered wavefront is a visualization around the certified central
ray; it must never imply additional physical contacts outside the active finite
aperture.
