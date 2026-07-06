# M3 — Cartography

**Depends on:** M2
**Unlocks:** M4
**Est. size:** ~450 LOC compiler + ~300 LOC scene
**Exit demo:** the map now *looks like a transit map* — parallel lines share
corridors cleanly, stations have names, a legend builds as lines debut, the
camera follows the drawing frontier and pulls back at the end to a
screenshot-worthy full map.

## Goal

The design-language phase: everything that makes a viewer read "authentic
metro diagram" rather than "node graph." Plus the camera, which turns the
static viewpoint into cinematography.

## Scope

**In:** parallel corridor offsets, interchange ring sizing, labels with tiers,
legend, key-change districts, camera phases 1 & 3 (follow + final reveal).
**Out:** rings/bypass (M4), ring camera moments (M4), annealing/night
mode/export (M5).

M3 now also owns the **line-identity gate** for projects with similar MIDI
tracks. If four keys lines are present, they must not read as one anonymous
braid: color, legend naming, corridor separation, train markers, and cue
strength must make each line traceable before moving on to topology.

## Work breakdown

### 1. Parallel corridors (`compilers/metro/src/passes/corridors.ts`)
- Occupancy index: for every grid-cell edge, the ordered set of lines
  traversing it (from routed polylines — re-derive cell traversal from the
  polylines, don't re-route).
- Offset each line's polyline perpendicular to segment direction:
  `offset = (rank − (k−1)/2) · 7 px`, rank = global track-index order.
- Joint healing: where a line's offset changes between segments (corridor
  membership changes), insert a 45° micro-jog — keeps octilinearity.
- Interchange rings resize: `radius = baseR + (k−1)/2 · 7 px`; connector-bar
  stations span member offsets.
- Update edge arc-lengths (trains ride the *offset* polyline).

### 2. Labels (`compilers/metro/src/passes/labels.ts`)
- Text source precedence: `lyric:` marker words → pitch names → bar numbers
  (config).
- Greedy placement per [§4.5](../metro-map-implementation.md#45-pass-5--labels):
  candidates R/L/BR, spatial-hash AABB scoring against geometry + placed
  labels; tier demotion on conflict (tier 1 < zoom 1.4, tier 2 < zoom 2.2).
- Always tier-0: interchanges, section boundaries, termini.

### 3. Legend & districts
- Legend entry per line: color chip + track name; `legend.reveal` at the
  line's first note (event already exists — add statics + placement: bottom
  margin, two columns).
- For duplicate/similar role names, preserve stable source identity in the
  legend (`track name`, short index, or user alias) rather than collapsing the
  display to a generic role label like `Keys`.
- Districts: key-change detection from chords/`key` → horizontal tint bands
  behind row ranges (`district.shift` events tint-lerp over 1 beat).

### 4. Camera (`compilers/metro/src/camera.ts`)
- **Phase 1 — follow:** target = drawing frontier `maxRowY(t)` from the reveal
  schedule, smoothed at compile time (critically damped, ζ=1, ω tuned);
  zoom 1.6; horizontal centering on the active lane centroid (slow lerp).
- **Phase 3 — the reveal:** final 6 s, ease to fit `statics.bounds` (padding
  8%), then hold. Title lozenge `title.stamp` event on the final chord.
- Emit as `performance.camera` keyframes (the 2D camera rig from P0 consumes
  them); scene stays camera-dumb.

### 5. Scene work
- Label rendering: BitmapText atlas, tier culling by camera zoom.
- Legend container pinned in screen space (not world space).
- District bands: full-width rects behind the line layer, tint-lerp on events.
- Micro-jog joins: rounded (reuse the M2 rounded-join drawing).

## Acceptance criteria

- [ ] Corridor property test: within any shared corridor, line order is the
      global rank order; no two polylines coincide exactly.
- [ ] Post-offset octilinearity still holds (angles ∈ {0°, 45°, 90°}).
- [ ] Trains ride offset polylines (arc-length updated — no station overshoot).
- [ ] Zero tier-0 label overlaps on all fixtures + one real project.
- [ ] Camera never moves backwards (frontier is monotone; smoothing must not
      overshoot into reverse — test on the sampled camera curve).
- [ ] Final frame (pull-back) contains the entire `bounds` with padding.
- [ ] Human check: 60 s of a real project reads as "a metro map being drawn."
- [ ] Similar-track check: `untitled-project-6d2e04f7` or an equivalent
      multi-keys export still lets the reviewer distinguish individual lines
      and identify which line is reacting to a note.
- [ ] Sync-readability from M2 survives the M3 camera/label/corridor work:
      added cartography must not make note payoffs harder to see.

## Tests added

Corridor ordering + octilinearity-after-offset properties; label overlap
scanner (tier 0); camera monotonicity + final-fit unit tests; updated goldens
(M1/M2 goldens re-baselined — offsets move everything; this is the expected
one-time golden churn, do it consciously).

## Notes & risks

Implementation status (2026-07-03): the compiler now marks and labels line
termini, labels MIDI stations by pitch and audio-fallback downbeats by bar, and
emits a monotone frontier camera that eases into a full-map final reveal. The
scene applies the compiled camera to map geometry, trains, blooms, clusters,
and labels while keeping the title and legend screen-pinned. Lines now receive
stable global-rank corridor offsets, trains ride the offset polylines, and
interchange rings grow with their line count. Occupancy-specific joint healing,
district-band acceptance on an authored-region song, and full overlap
optimization remain open M3 work. Section district statics/rendering landed on
2026-07-05, but the current reference export only exercises the single
whole-song fallback band.

- **The offset pass is the most fiddly code in the whole game** (joint healing
  at corridor-membership changes). Time-box it: micro-jogs may look imperfect
  at extreme cases; M5's annealing can flip bend orientations to reduce them.
- Re-deriving occupancy from polylines (not from the router) keeps corridors
  correct even for M4's portal edges later — worth the small extra cost now.
- Do not start M4 solely because M3 is "visually prettier." M4 should begin
  after this phase is readable on the current MIDI export, or immediately when
  a richer export with repeated regions exists and the M3 line-identity gate is
  already green.
