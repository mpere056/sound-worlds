# Phaseglass implementation plan

## Current implementation status

- P0 complete: deterministic source selection, chord grouping, and one deadline per grouped note time.
- P1 complete: tested passive Snell refraction and active phase-gradient transmission with constant-speed round trips.
- P2 first pass complete: finite membrane placement, one-contact lookahead, exact crossing and speed audits, overlap clearance, and early-crossing certification.
- P3 architectural reset complete: there is no hero particle, target chain, folded volume, or central knot. Faceted phase sheets have view-dependent glass edges, aperture bevels, directional etching, and restrained highlight diffraction.
- P4 material pass complete: refraction bends read without rectangular cutoffs, note contacts launch directional caustic sweeps, and the glass, field, and spectral response share one optical palette.
- P5 holographic-instrument pivot implemented, visual acceptance pending: seven stationary glass registers accumulate phase masks from the score. One broad coherent field is re-solved through every written register; there are no rendered route segments and the camera never follows a traveler.
- P5 temporal semantics complete: future notes ghost their assigned register for three seconds, note contact begins a short continuous writing attack, completed masks persist through silence, and repeated register assignments accumulate instead of replacing prior state.
- P5 compiler stress fixture complete: a deterministic 100-note phrase at roughly 105 ms spacing stays under the 250 ms test budget with positive membrane clearance and no early crossings.

## Product invariant

Each grouped note writes one bounded phase contribution into one of seven fixed
glass registers. The contribution persists, and all downstream interference is
recomputed from the ordered set of written register masks. The compiler's
certified central ray remains the deterministic source of phase-gradient data,
but the runtime does not depict that ray as a traveler or route.

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

Phaseglass should feel like a monumental holographic computation instrument
suspended in a vast, dark architectural space. Seven fixed faceted registers
receive etched phase information while one continuous broad light field passes
through the entire installation. Pearl-white highlights and restrained
cyan/amber spectral edges make sheet thickness, transmission, and changing
interference legible in still frames. No traveling object or sequential target
is the subject; the accumulated optical memory and its whole-field consequence
are the subject together.

The next three seconds must read as unfilled optical capacity. Upcoming notes
appear as low-energy latent etchings in their assigned fixed register. At
contact, a short writing sweep resolves the new phase contribution and the
field downstream of that register reorganizes continuously. Completed masks
remain in the register, so history, present, and preview are states of one
instrument rather than stacked effects.

Avoid hero particles, route-following cameras, target chains, rendered path
segments, ring-like apertures,
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
- Render seven fixed faceted registers with phase-gradient etchings, caustics,
  and note-triggered mask writing sampled from absolute time. Propagate one
  broad coherent field through the ordered accumulated masks.
- Gate: disabling shader quality changes appearance only, never geometry.

### P4 - Scene and camera

- Render persistent depth-readable interference, register frames, and one
  stationary gallery camera framing the complete installation.
- Add app discovery, tuning, scrub, PNG, and short-video export.
- Gate: arbitrary seeking reproduces identical architecture and shader state.

### P5 - Acceptance and budgets

- Compiler budget: 250 ms p95 for 100 notes after warmup.
- GPU budget: 16.7 ms at 1080 x 1920; adaptive raymarch resolution down to 0.5.
- Run full-song viewport, early-crossing, dense-note, and human motion audits.
- Complete Q1-Q5 art direction, composition, material, effect, and full-song
  acceptance before calling the world visually finished.

## Principal risk

The compiler currently solves sequential finite membranes while the runtime
re-registers their authored phase gradients into a fixed seven-plane optical
bench. Preserve the compiler's crossing and bounded-gradient certification, but
do not imply that the displayed fixed planes are literal locations on its
central-ray route. A later contract revision should emit register masks
directly once this choreography passes visual acceptance.
