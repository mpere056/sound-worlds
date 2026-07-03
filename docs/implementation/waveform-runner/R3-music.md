# R3 — The Music

**Depends on:** R2
**Unlocks:** R4
**Est. size:** ~250 LOC compiler + ~250 LOC scene
**Exit demo:** the world now responds to *everything*: melody notes fly into
the runner as glowing glyphs exactly on their notes, section gates swing open
with palette flips on region boundaries, and the camera punches subtly on
every kick.

## Goal

Wire the remaining musical roles into the world: lead (glyph collection
beams), sections (gates + palettes), kick (camera impulses), vocals (halo).
After R3 the game is musically *complete* — R4/R5 add identity and set pieces.

## Scope

**In:** glyph placement + collection beams, section gates, palette ramps,
kick zoom impulses, vocal halo, downlifter float segments (simple version).
**Out:** erasure/strata/trail (R4), rail/ghost/end-card (R5).

## Work breakdown

### 1. Glyph system (`compilers/runner/src/glyphs.ts`)
- Placement: for each lead note, glyph at
  `(x(t_note), h(x(t_note)) + map(pitch → 1.5..5 wu))` (per-song pitch
  percentile calibration, same pattern as terrain).
- **Collection beam** (the decoupling trick from
  [§4.1](../waveform-runner-implementation.md#41-glyph-collection-lead-notes--the-collection-beam)):
  beam window `[t_note − 0.3 s, t_note]`; target = `pose(t_note)` — computable
  now because R2's trajectory is final before glyphs compile. Emit
  `glyph.merge {hitT: t_note, pitch}` + statics `{spawnPos, mergeT, mergePos}`.
- Density cap: max 6 concurrent in-flight beams; excess lead notes in dense
  runs become instant sparkles at the runner (still `hitT`-carrying).

### 2. Gates & palettes (`compilers/runner/src/sections.ts`)
- Gate statics at `x(t_boundary)` per region boundary: arch dimensions from
  local terrain height; label = region name.
- `gate.open` span = the last bar before the boundary (doors part as the bar
  plays out; fully open on the downbeat — back-solved, carries
  `hitT = t_boundary`).
- Palette: solver emits one palette per section *kind*;
  `palette.shift` events lerp the global LUT over ±0.5 beat around boundaries.

### 3. Camera impulses (`camera.ts` extension)
- `zoom(t) = 1 + Σ_recent 0.02 · e^{−8(t − t_kick)}` — evaluated over a ring
  of the last 4 kicks (stateless window query, not accumulation).
- Shake bus: budgeted to kicks only, amplitude from kick velocity, same decay
  form. Both emitted as compiled curve + params (renderer stays dumb).

### 4. Float segments (downlifters)
- FX downlifter spans → `float` trajectory segments: the solver carves the
  span out of `ground`, `yCurve` = gentle sine drift 1.5 wu above terrain,
  re-entry solved like a mini-jump landing on the span end (which the
  compiler snaps to the nearest downbeat).
- Continuity asserts extend automatically (same evaluator).

### 5. Scene work
- Glyphs: instanced quads; beam path evaluated **in the vertex shader** as
  `mix(spawnPos, mergePos, ease(u))`, `u = (t − t0)/0.3` — zero per-frame CPU.
  Merge flash + ripple ring on `hitT`; a shard of the runner's halo tints to
  the glyph's pitch color for 2 beats (stateless: last-merge query).
- Gates: two-piece arch sprites, door angle = `f(gate.open progress)`; label
  BitmapText.
- Palette: global LUT uniform lerped by `palette.shift`; all layer tints
  sample it.
- Vocal halo: radius/intensity from the vocal RMS curve (direct curve sample).

## Acceptance criteria

- [ ] Every `glyph.merge` fires within 1 frame of its lead note (sync
      invariant); merge position equals `pose(hitT)` exactly (unit test —
      this catches trajectory/glyph compile-order bugs).
- [ ] Beam cap respected on the arp fixture; overflow sparkles still sync.
- [ ] Gates fully open exactly on section downbeats; palette LUT reaches its
      target within ±0.5 beat.
- [ ] Float segments: continuity + no-penetration properties still green;
      re-entry lands on a downbeat.
- [ ] Kick zoom visible but subtle (human check: play with sync overlay,
      confirm impulses coincide with kick flashes).
- [ ] Scrub-anywhere statelessness still holds (beams/LUT/halo all pure in t).

## Tests added

Glyph merge-position exactness; beam-cap overflow behavior; gate/palette
timing units; float-segment continuity fixtures; updated golden frames
(gate moment, glyph merge, float drift).

## Notes & risks

- **Compile-order dependency is now real:** glyphs depend on the final
  trajectory; trajectory depends on floats; floats depend on FX spans. The
  pipeline order in [§5](../waveform-runner-implementation.md#5-compiler-pipeline-order-matters)
  is normative — encode it as explicit pipeline stages, not implicit call
  order.
- Palette-per-section-kind means two verses share a palette — intentional
  (repetition = familiarity). Per-section override lives in tuning.
