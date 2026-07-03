# R4 — The Identity

**Depends on:** R3
**Unlocks:** R5
**Est. size:** ~150 LOC compiler + ~400 LOC scene (this phase is render-heavy)
**Exit demo:** the concept's signature is on screen — the world **un-renders
behind the runner**, crumbling into particles at the erasure front, terrain
shows its stem-strata geology, and the runner trails a comet ribbon. Pause on
any frame and it looks like the poster.

## Goal

Ship the visual identity: erasure front, crumb particles, strata rendering,
and the trail. Almost all scene work — the compiler already computed
everything these need (strata edges in R1, `x(t)`/`t(x)` for the front).

## Scope

**In:** erasure front + glow band, stateless crumb particles, strata
rendering, trail ribbon, outro erasure freeze, ghost-window *compilation*
(rendering in R5).
**Out:** rail/float polish, ghost rendering, end card (R5).

## Work breakdown

### 1. Erasure front (compiler: `erasure.ts`, ~40 LOC)
- `xE(t) = x(t − 2 beats)` — computed as a shifted copy of the `x(t)` curve
  (beat shift via `mtime`, tempo-change-safe).
- **Outro freeze:** from outro start, `xE` holds its value
  (`erasure.freeze` event + clamped curve). The past finally persists.
- Per-cell crossing times for crumb bursts: `tCross(i) = tAtX(x_i)` shifted by
  the lag — precomputed array in statics (the renderer never searches).

### 2. Erasure rendering (`scenes/runner/src/erasure.ts`)
- Terrain fragment shader: discard where `v_x < xE(t)` (per-vertex x attribute
  placed in R1 — pays off now); glow band
  `smoothstep(xE, xE + 1.2 wu)` in the concept accent color.
- Behind-front ghost dots: sparse dim points sampled from the discarded
  region (`hash(cellIndex)` selects ~4%), faded by distance behind the front —
  "memory of the past."

### 3. Crumb particles (`scenes/runner/src/crumbs.ts`)
- Per crossed cell i, a burst of `n = 6` particles with
  `p(age) = p0 + v0·age + ½a·age² + curl(seed_i, age)`, `age = t − tCross(i)`,
  lifetime 1.5 s — **pure functions, no particle state**, scrub-exact.
- Instanced quads; the vertex shader evaluates the motion (seed + birth time
  per instance). Active window: only cells with `age ∈ [0, 1.5]` are drawn —
  a rolling index range over the precomputed `tCross` array (binary search,
  same pattern as segment lookup).
- Budget: cap simultaneous bursts at 120 cells; if the world moves faster
  (loud sections), stride-skip cells deterministically.

### 4. Strata rendering (`scenes/runner/src/strata.ts`)
- R1's stratum edge polylines → one ribbon per stratum below the surface,
  darker + desaturated by depth; per-stem accent tint at 15%.
- Same per-vertex x attribute + erasure discard (strata crumble with the
  surface).
- Subtle parallax cheat: strata scroll at 0.97× so the geology reads as depth.

### 5. Trail (`scenes/runner/src/trail.ts`)
- Rebuilt each frame from the trajectory: `pose(t − k·dt)` for k = 0..24,
  `dt = 16 ms` → polyline strip, width/alpha tapered, additive.
- **Stateless by construction** — no trail buffer; seeking renders the exact
  historical trail. Glyph-merge tint shards (R3) modulate strip color by
  segment age.

### 6. Ghost windows (compiler only, ~30 LOC)
- For each repeated chorus occurrence: `ghost.window {tStart, tEnd,
  sourceOffset = chorusN.start − chorus1.start}` events + statics. Rendering
  is one R5 task (sample `pose(t − sourceOffset)` on a back layer) — compiled
  now so R5's scene work is trivial.

## Acceptance criteria

- [ ] Erasure front trails the runner by exactly 2 beats at any tempo
      (unit test on the shifted curve, incl. a tempo-change fixture).
- [ ] Outro freeze: `xE` constant after outro start; terrain visibly persists
      (golden frame).
- [ ] **Scrub-exactness under accumulation-looking effects:** seek to random
      t → frame hash identical to play-through (crumbs/trail/ghost-dots are
      the risk; this test is the phase gate).
- [ ] Crumb budget honored on the loud-fast fixture; stride-skip is
      deterministic.
- [ ] Frame time with full strata + crumbs + trail < 8 ms at 1080×1920 on the
      reference machine (export must beat realtime).
- [ ] Human check: the first 10 seconds of a real project *read the premise* —
      a viewer should articulate "the world disappears behind him" unprompted.

## Tests added

Shifted-curve unit tests (incl. tempo change); crossing-times precompute
(monotone, complete coverage); scrub/frame-hash equivalence (extended to this
scene's new systems); perf budget test; goldens: erasure close-up, strata
wide, outro freeze.

## Notes & risks

- The scrub-exactness bar is why every effect here is designed as
  `f(t − birthTime)` — if any implementation shortcut introduces
  accumulated state (e.g., a pooled particle that reuses slots
  nondeterministically), the frame-hash test catches it immediately. Keep the
  test tight rather than the code careful.
- Visual tuning time-box: strata/glow/crumb aesthetics can absorb infinite
  hours — expose everything in Tweakpane, do one focused tuning session, move
  to R5.
