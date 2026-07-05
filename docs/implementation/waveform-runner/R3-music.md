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

Implementation note: until the extractor carries richer FX labels, this is
conservative. Sustained events on downlifter/falling-like tracks become float
spans only when they do not overlap jump arcs; unrelated FX hits and risers
stay on the ground trajectory.

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

- [x] Every `glyph.merge` fires within 1 frame of its lead note (sync
      invariant); merge position equals `pose(hitT)` exactly (unit test —
      this catches trajectory/glyph compile-order bugs).
- [x] Beam cap respected on the dense-note fixture; overflow sparkles still
      emit merge events.
- [x] Gate compiler emits `gate.open` spans whose `tEnd`/`hitT` equal section
      downbeats; scene renders opening arches and section labels from gate
      statics. Visual acceptance on a region-authored reference song remains.
- [x] Palette shifts span ±0.5 beat around section boundaries; the scene
      samples/interpolates those palettes for all palette-derived layers.
- [x] Float segments: continuity + no-penetration properties still green;
      re-entry lands on a downbeat/end. Visual acceptance on an FX-authored
      reference song remains.
- [ ] Kick zoom visible but subtle (human check: play with sync overlay,
      confirm impulses coincide with kick flashes).
- [x] Implemented glyph beams, merge ripples, and gate opening progress are
      pure in `t` and remain scrub-safe. Palette LUT and vocal halo sampling
      are also direct functions of `t`; authored-song visual verification still
      needs a richer export.
- [x] Vocal halo curve is compiler-owned, normalized from vocal-like track RMS,
      records `statics.vocalHaloSource`, and stays silent when no vocal role is
      exported. Visual acceptance on a vocal-bearing reference song remains.

## Tests added

Glyph merge-position exactness; beam-cap overflow behavior; gate/palette
timing units; vocal-halo source/fallback behavior; float-segment continuity
fixture; updated golden frames (gate moment, glyph merge, float drift).

## Notes & risks

Implementation status (2026-07-04): the compiler now emits deterministic lead
glyphs after the final R2 trajectory is known, caps collection beams at six,
and preserves overflow notes as merge sparkles. Audio-only REAPER exports use
beat-synchronous activity glyphs, so the feature remains visible without MIDI.
The scene renders stateless 300 ms collection beams and exact-time merge
ripples. The current `untitled-project-6d2e04f7` reference compiles 48 MIDI
glyphs and 48 merge events from keyboard tracks.
Runner output is now compiler version 3. Twenty-two Runner tests cover the
trajectory, exact merge position, audio fallback, role preservation, density
cap, event preservation, compiled step events, track-derived stratum edges,
section gate/palette timing, vocal-halo source/fallback behavior, and
float-segment continuity. Base scene colors now consume `performance.palette`
and role colors for glyphs, background, terrain, runner, trail, speed lines,
and event ripples. The scene also consumes compiled `runner.step` events for
beat-locked gait, compiled `statics.strata` edges for geological layers,
compiled `statics.gates` for opening section arches, and `palette.shift` spans
for section palette transitions. Vocal halo now comes from `curves.vocalHalo`
and renders as an additive runner aura; conservative float segments now lift
the runner from sustained downlifter-like events with scene-rendered FX drift
rings/streaks. Authored-song visual acceptance remains open R3 work.

- **Compile-order dependency is now real:** glyphs depend on the final
  trajectory; trajectory depends on floats; floats depend on FX spans. The
  pipeline order in [§5](../waveform-runner-implementation.md#5-compiler-pipeline-order-matters)
  is normative — encode it as explicit pipeline stages, not implicit call
  order.
- Palette-per-section-kind means two verses share a palette — intentional
  (repetition = familiarity). Per-section override lives in tuning.
