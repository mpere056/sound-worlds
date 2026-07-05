# R1 — The World

**Depends on:** [P0 foundations](../phase-0-foundations.md)
**Unlocks:** R2
**Est. size:** ~350 LOC compiler + ~250 LOC scene
**Exit demo:** in the dev app, a glowing dot slides along terrain that visibly
*is* the bassline — plateaus on held notes, staircases on runs — with the
camera following smoothly and the world speeding up when the mix gets loud.

## Goal

Build the substrate every later phase stands on: the `x(t)` motion system, the
terrain compiler, and the camera. No jumps yet — the runner glides on the
ground — but the world's relationship to the music must already be legible.

## Scope

**In:** speed profile → `x(t)`/`t(x)`, terrain from bass (calibration, shape
language, slope clamp), strata *edges computed* (rendered in R4), ground-only
trajectory, compile-time camera curves, parallax background, basic scene.
**Out:** jumps (R2), glyphs/gates/palette shifts (R3), erasure/strata
rendering/trail (R4), rail/ghost/end-card (R5).

## Work breakdown

### 1. Motion system (`compilers/runner/src/motion.ts`)
- `v(t) = v0 · (0.8 + 0.4 · energy(t))`, energy smoothed 500 ms
  (`core/TimedCurve.smooth`).
- `v0 = worldLen / ∫(0.8 + 0.4·energy)` with `worldLen = 60 wu · durationMin`
  (config).
- `x(t) = integrate(v)` (P0's `TimedCurve.integrate`), plus inverse `t(x)` by
  monotone resampling. **Property: strictly increasing** — assert at compile.

### 2. Terrain (`compilers/runner/src/terrain.ts`)
- Source cascade: bass MIDI → bass pitch curve → low-passed master envelope.
  Chosen source logged.
- Pitch → elevation with 10th/90th percentile calibration into
  `[hMin=0, hMax=14] wu` (per
  [§1.2](../waveform-runner-implementation.md#12-terrain-hx-from-the-bass)).
- Shape language: plateau during note, raised-cosine ramp across gaps (min
  ramp 0.6 wu).
- Slope clamp: slew-limit to `|dh/dx| ≤ tan 55°` — feasibility by construction.
- Sample to heightfield `h[i]`, `dx = 0.25 wu`; lerped query `h(x)`.
- Strata: compute stratum edge polylines
  (`h − depth_k − amp_k · wave_k(x)` from per-stem waveform summaries) into
  statics now; rendering waits for R4.

### 3. Trajectory v0 (`compilers/runner/src/trajectory.ts`)
- Single segment: `{kind:'ground', t0:0, t1:duration}`;
  `pose(t) = (x(t), h(x(t)))`. The `Seg` union + binary-search evaluator are
  built **now** (R2 only adds segment kinds).
- Lean angle from finite differences — the evaluator API returns
  `{pos, vel, lean, grounded}` from day one.

### 4. Camera (`compilers/runner/src/camera.ts`)
- `camX = x(t) + lead` (runner at 45% width, 40% height of frame).
- `camY` target `max(runnerY, h(x)+2)`, critically-damped filter run at
  compile over the sampled trajectory → stored curve (renderer stateless).
- Zoom baseline 1.0 (kick impulses arrive in R3). Emit `performance.camera`
  + `camY` curve.

### 5. Scene (`scenes/runner/src/`)
- PixiBackend: terrain surface as one triangulated ribbon (earcut at init) —
  built with the **per-vertex x attribute already in place** (R4's erasure
  shader needs it; cheap to add now, painful to retrofit).
- Runner: additive core sprite + soft halo; positioned from `pose(t)`.
- Parallax background ×3 layers (gradient + silhouette bands), scrolling from
  `x(t)` at 0.2/0.5/0.8 factors.
- Palette from `performance.palette` (single section palette for now).

## Acceptance criteria

- [ ] `x(t)` strictly increasing on all fixtures (property test).
- [ ] No-penetration: `pose(t).y ≥ h(x(t)) − 1e−4` sampled at 120 Hz
      (trivially true now; the test exists so R2 inherits it).
- [ ] Slope clamp: post-clamp terrain satisfies the limit everywhere.
- [ ] Percentile calibration: extreme fixture (2-octave bass) still fills but
      never exceeds `[hMin, hMax]`.
- [ ] Human check: held bass note = flat plateau; bass staircase riff = visible
      staircase; loud chorus = noticeably faster world.
- [ ] Scrub anywhere = identical frame (stateless scene gate).
- [ ] Determinism: byte-identical recompile.

## Tests added

Motion (monotonicity, worldLen normalization); terrain (calibration bounds,
ramp min-width, slope clamp property); trajectory evaluator (segment lookup,
continuity harness — ready for R2); fixture: `bass-staircase`, `bass-drone`,
`no-bass-fallback`. Golden frame at t=5 s.

## Implementation status

As of 2026-07-04, the current REAPER export still has no bass role, but it does
have keyboard MIDI. The source cascade now selects `midi-contour` before
falling back to `master-envelope`, so keys-only projects produce hills tied to
note contour instead of generic loudness. Motion, slope bounds, ground
clearance, stateless scrubbing, and byte determinism are covered by automated
tests. The bass plateau/staircase human check remains open until a
bass-bearing fixture or export is available. R1 renders foreground strata and a
humanoid runner earlier than the original art staging described above; jumps
remain R2 work.

## Notes & risks

- Getting `t(x)` right matters more than it looks: R2's clearance check and
  R4's erasure both query it. Build it as a first-class tested function, not
  an inline resample.
- Resist making the terrain pretty — R1 terrain is a readability instrument;
  the art pass rides on R4's strata.
