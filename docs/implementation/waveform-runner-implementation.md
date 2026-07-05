# Waveform Runner — Implementation Plan

Companion to [the concept doc](../waveform-runner.md). The engineering core of
this concept is that **the runner's entire trajectory is a compiled, piecewise
closed-form function of time** — no physics engine, no integration at render
time, every landing analytically guaranteed to hit its snare. This doc derives
that math and specifies terrain, systems, rendering, tests, and build order.

---

## Current implementation

R1 and R2 are implemented. R3 is in progress: the compiler emits deterministic
MIDI melody glyphs or explicitly tagged beat/activity fallback glyphs after
the final trajectory, stores exact runner-pose merge targets, limits concurrent
beams to six, and preserves overflow events as sparkles. The scene renders
stateless 300 ms approaches and merge ripples. Gates, palette transitions,
kick camera impulses, beat gait, track strata, and vocal halo plumbing are now
implemented. Conservative sustained-downlifter float spans are also
implemented. Richer authored-song acceptance remains. See
[Current implementation status](../implementation-status.md) and
[R3 — The Music](waveform-runner/R3-music.md).

## 1. World model

### 1.1 Horizontal motion: `x(t)` is a compiled curve

The runner never has independent horizontal physics. Horizontal position is a
monotone function of song time, compiled once:

```
v(t) = v0 · (0.8 + 0.4 · energy(t))        // energy = master curve, smoothed 500 ms
x(t) = ∫₀ᵗ v(u) du                          // cumulative sum at 50 Hz → TimedCurve
```

- `v0` is chosen so the whole song spans a target world length
  (`v0 = worldLen / ∫(0.8 + 0.4·energy)`), keeping every song's world
  proportionate.
- `x(t)` is strictly increasing ⇒ invertible; both `x(t)` and `t(x)` are stored
  (the inverse is needed to evaluate "terrain height under the runner at time t").
- Consequence for jumps: while airborne, the runner still follows `x(t)`
  horizontally (it "keeps running through the air") — this decouples the
  vertical solve from the horizontal one and is what makes everything closed-form.

### 1.2 Terrain: `h(x)` from the bass

Built from the bass track (MIDI notes preferred, pitch curve fallback,
low-passed master envelope if no bass exists):

1. Map bass pitch → elevation with per-song calibration:
   `e(p) = hMin + (p − p10)/(p90 − p10) · (hMax − hMin)`, using the 10th/90th
   pitch percentiles so any song fills the band. Default band: `hMin = 0`,
   `hMax = 14` world units (screen lower half at zoom 1).
2. **Shape language:** during a note, terrain holds a plateau at `e(pitch)`;
   between notes, a raised-cosine ramp over the gap (min ramp width 0.6 wu).
   Staccato bass runs therefore compile to staircases automatically; long notes
   to mesas.
3. **Slope clamp (feasibility by construction):** walk the profile and slew-rate
   limit it to `|dh/dx| ≤ tan 55°`. We author the terrain, so unreachable
   geometry is *prevented*, not handled.
4. Sampled to a uniform heightfield `h[i]` at `dx = 0.25 wu`; queries are
   lerped. Strata (visual only): stratum k's edge =
   `h(x) − depth_k − amp_k · wave_k(x)` where `wave_k` is stem k's waveform
   summary resampled over x.

## 2. The jump system (closed-form ballistics)

### 2.1 Gravity derived from tempo

For visual consistency across songs, gravity is chosen so a standard 1-beat
flat jump has a fixed apex height `A` (default 3.2 wu):

```
T_beat = 60 / BPM                 (at the jump's local tempo)
g      = 8A / T_beat²
```

Derivation: flat jump of duration `T` has `v_y0 = gT/2` and apex
`= v_y0²/2g = gT²/8`. Setting apex = A at `T = T_beat` gives `g = 8A/T_beat²`.
Half-beat hops then get apex `A/4`, two-beat leaps `4A` — jump size scales with
musical duration *quadratically*, which reads exactly right.

### 2.2 Single jump solve

A landing is a snare at time `L`. Choose takeoff time `Tk = L − D` where the
flight duration `D` is selected from `{1, 0.5, 1.5, 2}` beats (preference
order), subject to: `Tk` ≥ previous segment end + `minGround` (0.25 beat), and
`Tk` snapped to the nearest 1/16 grid position ≤ that bound.

With `y0 = h(x(Tk))`, `y1 = h(x(L))`, and flight time `D`:

```
y(τ)  = y0 + v_y0 · τ − ½ g τ²                    τ ∈ [0, D]
land:   y(D) = y1     ⟹     v_y0 = (y1 − y0)/D + gD/2
apex:   τ_a = v_y0/g,  y_apex = y0 + v_y0²/(2g)     (if v_y0 > 0)
```

One formula, no iteration. The event emitted carries `hitT = L`.

### 2.3 Clearance check and the double-jump fallback

Terrain can rise mid-flight. Validate by sampling
`clr(τ) = y(τ) − h(x(Tk + τ))` at `dτ = 1/120 s`, excluding 40 ms windows at
both endpoints (where clearance is 0 by definition), requiring
`clr ≥ 0.4 wu`. On failure, escalate in order:

1. **Bigger arc:** retry with the next larger `D` (higher apex).
2. **Double jump:** pick a mid-impulse time `M ∈ (Tk, L)` from the hats/kick
   onsets in that window (musical!), nearest to the violation point. Solve two
   independent ballistic segments through a chosen mid-height:

   ```
   y_M   = max over violation window of (h(x(τ)) + 0.8 wu)
   seg A: (Tk, y0) → (M, y_M):   v_yA = (y_M − y0)/(M−Tk) + g(M−Tk)/2
   seg B: (M, y_M) → (L, y1):    v_yB = (y1 − y_M)/(L−M) + g(L−M)/2
   ```

   The double-jump impulse fires on a real percussive onset — a mechanic that
   is also a sync moment.
3. **Terrain concession (never fails):** locally lower the offending crest by
   the clearance deficit (re-running the slope clamp). Logged to the compile
   report; in practice rare because bass-driven terrain and snare-driven jumps
   are correlated in real music.

### 2.4 Jump budgeting

- Max 2 jumps/bar (config). Snares beyond budget → **ground pulse** events
  (shockwave ring, no airtime).
- Snare selection when dense: prefer backbeats (beat 2/4), then loudest
  velocity.
- No snare track: fallback chain `snare → clap → percussion → kick →
  MIDI note starts → bar downbeats`, chosen once at compile with the choice
  logged.

## 3. The trajectory: one piecewise function

The compiler assembles non-overlapping segments covering `[0, duration]`:

```ts
type Seg =
  | { kind: 'ground'; t0: number; t1: number }                          // y = h(x(t))
  | { kind: 'air';    t0: number; t1: number; y0: number; vy: number }  // ballistic
  | { kind: 'air2';   t0: number; tm: number; t1: number;
      y0: number; vyA: number; yM: number; vyB: number }                // double jump
  | { kind: 'rail';   t0: number; t1: number }                          // y = rail(x(t))
  | { kind: 'float';  t0: number; t1: number; yCurve: CurveRef }        // slow-mo drift
```

Runner state at any `t` = binary search for the segment (O(log n)) + closed
form. Properties that fall out for free:

- **Scrub-safe / stateless** — `pose(t)` is pure; dev-mode seeking just works.
- **Continuity checkable** — segment boundaries must agree in `y` to ε
  (property test, §8).
- **The ghost is free** — the final-chorus déjà-vu ghost samples the *same*
  trajectory with `t' = t − (chorusN.start − chorus1.start)`, drawn at 30 %
  alpha on a back parallax layer.

Facing/lean animation is derived, not stored: lean angle
`∝ atan2(dy/dt, dx/dt)` from finite differences of the closed forms.

## 4. Other systems

### 4.1 Glyph collection (lead notes) — the collection beam

Coupling collectible positions to the jump trajectory would over-constrain the
solver, so collection is decoupled with a **beam**: a glyph sits at
`(x(t_note), h + 1.5..5 wu by pitch)`; starting at `t_note − 0.3 s` it eases
toward the runner's *predicted* position `pose(t_note)` (known at compile
time!), merging exactly at `t_note`, emitting the ripple ring + a trail-color
shard. Guaranteed sync, zero constraints on jumps, and visually reads as the
runner "pulling" the melody out of the world.

### 4.2 Grind rail (the drop)

- Rail polyline: bass pitch during the drop mapped to a band *above* the
  terrain (`h + 4..9 wu`), same plateau/ramp shape language, no slope clamp
  (rails can be steep — the runner is locked on).
- Entry: a normal solved jump whose landing is the first drop-bass onset *on
  the rail curve* instead of terrain; exit likewise back to terrain.
- On-rail pose: `y = rail(x(t))`; spark bursts (`hitT = bass onset`) at every
  bass note; lean = rail tangent.

### 4.3 Erasure front (the un-rendering world)

- Front position: `xE(t) = x(t − 2 beats)`; during the outro the lag freezes
  (`xE` stops advancing) — the past finally persists.
- Terrain fragments with `x < xE` are discarded in the fragment shader
  (per-vertex x attribute vs. uniform `xE`), with a 1.2 wu glow band at the cut.
- Crumb particles are **stateless**: each terrain cell i, when crossed by the
  front at `t_i = t(x_i)/…` (known at compile), emits a burst whose particles
  evaluate `p(age) = p0 + v0·age + ½a·age² + curlNoise(seed_i, age)` — a pure
  function of `t − t_i`, no simulation state, scrub-safe like everything else.

### 4.4 Gates, palette, camera

- **Section gates:** arch at `x(t_boundary)`; door animation keyed to the last
  bar before the boundary; label = region name; palette LUT lerp over ±0.5 beat.
- **Camera:** `camX = x(t) + lead` (runner sits at 40 % height, 45 % width of
  the 9:16 frame); `camY` = critically damped follow of
  `max(runnerY, h(x)+2)` — the damping filter is run *at compile time* over the
  sampled trajectory and stored as a curve, so the renderer stays stateless.
  Zoom impulses on kicks: `zoom(t) = 1 + Σ 0.02·e^{−8(t−t_kick)}` evaluated
  over the last few kicks only.

## 5. Compiler pipeline (order matters)

```
1. mtime + roles           (core)
2. speed profile → x(t), t(x)
3. terrain h(x) from bass  (+ slope clamp, strata edges)
4. rail geometry           (drop sections)
5. jump solver             (landings ← snares; budget; clearance; escalation)
6. trajectory assembly     (segments; continuity assert)
7. glyph schedule          (implemented: beams from final pose(t_note))
8. erasure milestones, gates, palette ramps, ghost windows
9. camera curves           (compile-time damping)
10. statics + events + curves → performance.runner.json
```

Compile report (`--report`): jump table (per snare: D chosen, single/double,
concessions), terrain concessions, budget overflows — the "why does it look
like that" audit trail.

## 6. Event & statics inventory

```
statics: terrain polyline + strata, rail, gates, glyph list
         (spawnPos, mergePos, mergeT, source, pitch/mode),
         palette ramps, ghost window mapping
curves:  x(t), camY(t), zoomBase(t), energy
events:  jump.takeoff {hitT: snareT}       jump.land {hitT}
         jump.midImpulse {hitT: hat/kickT}
         glyph.merge {hitT: noteT, pitch}  ground.pulse {hitT}
         grind.enter/exit, grind.spark {hitT: bassT}
         gate.open {section}, palette.shift, erasure.freeze
```

Every event's `hitT` feeds the shared sync-invariant test.

## 7. Rendering (PixiBackend)

- **Terrain:** one static triangulated ribbon per stratum (earcut at init);
  erasure = shader discard + edge glow (uniform `xE`); parallax bg ×3.
- **Runner:** additive core sprite + halo (vocal RMS) + **trail** rebuilt each
  frame by sampling `pose(t − k·dt)` for k = 0..24 — a polyline strip that is
  itself stateless (no accumulated trail buffer, so scrubbing is exact).
- **Glyphs:** instanced quads with per-instance `(spawnPos, mergeT)`; beam path
  evaluated in the vertex shader as `mix(spawnPos, runnerPose(mergeT), ease(u))`.
- **Ground pulses / ripples / sparks:** instanced rings, radius/alpha =
  `f(t − hitT)`.
- All motion pure in `t` ⇒ this scene is **stateless** (no checkpoints needed,
  unlike Painting).

## 8. Testing

- **Trajectory properties** (fixture + property tests):
  - continuity: `|y(seg_i.t1) − y(seg_{i+1}.t0)| < 1e−6`
  - no penetration: `pose(t).y ≥ h(x(t)) − 1e−4` for all sampled t
  - every `jump.land.hitT` is a selected snare onset; `|t_land − hitT| = 0` by
    construction, asserted anyway
  - clearance holds on every air segment (re-run the validator on output)
  - determinism: byte-identical recompile
- **Fixtures:** flat-bass + regular snares (canonical jumps); rising-bass under
  a jump (forces double-jump path); dense D&B snares (budget); no-snare ambient
  (fallback chain).
- **Golden frames:** takeoff, apex, landing, erasure close-up, drop entry.

## 9. Tuning surface (Tweakpane)

`apexHeight A`, `v0 scale`, terrain band `hMin/hMax`, ramp width, erasure lag,
trail length, palette per section kind, glow strengths, camera lead/damping,
zoom-kick amount. All in `tuning.runner.json`; none require recompiling except
`A`, `v0`, and terrain band (marked "recompile" in the UI — they change the
solve).

## 10. Build phases

Each phase has a full work-order document. All phases depend on the shared
[P0 — Foundations](phase-0-foundations.md).

| Phase | Deliverable | Work order |
|---|---|---|
| R1 | The world — x(t), bass terrain, camera; runner glides | [waveform-runner/R1-world.md](waveform-runner/R1-world.md) |
| R2 | The jumps — solver, snare landings, the de-risk demo | [waveform-runner/R2-jumps.md](waveform-runner/R2-jumps.md) |
| R3 | The music — glyph beams, gates + palettes, kick zoom, floats | [waveform-runner/R3-music.md](waveform-runner/R3-music.md) |
| R4 | The identity — erasure front, crumbs, strata, trail | [waveform-runner/R4-identity.md](waveform-runner/R4-identity.md) |
| R5 | Ship — rail grind, ghost, cadence gate, end card, mp4 | [waveform-runner/R5-ship.md](waveform-runner/R5-ship.md) |

Rough size: compiler ~900 LOC (≈300 of it the jump solver + validator), scene
~700 LOC. R1+R2 is the proof — if a render at R2 shows three consecutive
snare-perfect landings with the sync overlay green, the concept is de-risked.
