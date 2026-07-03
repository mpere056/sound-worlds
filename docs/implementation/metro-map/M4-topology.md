# M4 — Topology

**Depends on:** M3
**Unlocks:** M5
**Est. size:** ~400 LOC compiler + ~150 LOC scene
**Exit demo:** on a song with a repeated chorus, the chorus draws once as a
**ring**; when chorus 2 arrives, no new geometry appears — every train swings
back onto the ring and rides another lap together, with the camera easing over
to downtown. The bridge takes the express bypass around everything.

## Goal

The structural signature of the whole concept: repetition becomes topology.
This phase changes the section-layout pass from linear-only to
rings-and-bypasses, and teaches trains to lap.

## Scope

**In:** ring geometry + arc mapping, portal edges, lap scheduling, bypass
curves, `rowOffset` bookkeeping, ring camera moments (camera phase 2),
under-construction pre-draw.
**Out:** polish/annealing/night/export (M5).

## Work breakdown

### 1. Section layout rework (`passes/sections.ts`)
- Sequential layout with `rowCursor`, dispatching per
  [§4.3](../metro-map-implementation.md#43-pass-3--section-topology-rows-rings-bypasses):
  - **First chorus occurrence** → instantiate `Ring`; `rowCursor += ringRows + margin`.
  - **Repeat occurrences** → zero geometry; record a `LapWindow {ringId,
    tStart, tEnd}` for scheduling.
  - **Bridge** → `Bypass` curve (single smooth path swung past lane 0;
    stations = bar-downbeat notes only).
  - Everything else → linear rows as before.
- All downstream row math already flows through `rowY()` — only the cursor
  bookkeeping changes.

### 2. Ring geometry (`rings.ts`)
- Rounded-rect ring centered on the lane band (lanes 2–9), concentric radius
  per line (`base − k·offset`, global rank order — matches corridor ranks).
- Station arc positions: `s = perimeter · (tNote − chorusStart)/chorusDur`,
  placed on the owning line's ring.
- Optional pitch wobble: ±4 px radial by deviation from the track's median
  pitch (config, default on).
- Transfers on the ring: same arc-position coincidence rule as trunk (radial
  connector bar spanning member rings).
- **Portals:** octilinear connectors from the last pre-chorus trunk station to
  the ring tangent, and ring exit to the next trunk station. Portals are
  ordinary edges — corridors/offsets/reveal all apply automatically (this is
  why M3 re-derived occupancy from polylines).

### 3. Lap scheduling (`trains.ts` extension)
- Chorus 1: trains enter via portal, ride arc positions as normal stops.
- Each `LapWindow`: schedule a **return leg** (last position → ring entry,
  arriving on the window's first note — back-solved travel) + one lap of the
  same arc stops shifted by the window's time offset + exit leg to the next
  trunk stop.
- Ring stop times use the *repeat occurrence's* real note times (the analyzer
  gives per-occurrence events; do not reuse chorus-1 times).

### 4. Reveal & pre-draw
- Ring edges reveal during chorus 1 like any edge (arc-length progressive).
- **Under-construction pre-draw:** 2 bars before chorus 1, ring geometry
  fades in as dashed 20%-alpha guides (`ring.predraw` span) — anticipation,
  and it stops the ring "popping" into a previously empty region.

### 5. Camera phase 2 (`camera.ts` extension)
- On each `LapWindow`: ease to ring center, zoom 1.3, hold for the lap, ease
  back to the frontier. Keyframes merged with phases 1/3; monotonicity test
  from M3 gets a carve-out (phase 2 legitimately moves "up" the map).

## Acceptance criteria

- [ ] Chorus-repeat fixture: exactly one ring; repeats emit **zero** stations
      /edges (property test on statics).
- [ ] Lap stop times equal the repeat occurrences' real note times.
- [ ] Return/exit legs arrive on their back-solved `hitT` (sync invariant
      extended to portal travel).
- [ ] One-lap arc math: last chorus note sits < 1 station-spacing before the
      exit tangent (no wraparound collision).
- [ ] Bypass: bridge fixture renders the express curve; sparse stations only.
- [ ] Human check: chorus 2 *reads* as "everyone rides downtown again."

## Tests added

Ring fixture suite (1 ring / 2 laps / 3 laps); statics-diff test (repeat
sections add no geometry); portal sync tests; bypass fixture; camera phase-2
keyframe ordering test. Golden re-baseline for the ring fixture only.

## Notes & risks

- **Time is no longer monotone in y** — anything that assumed "later note =
  lower on the map" (frontier tracking, label spatial hash rows) must key off
  geometry, not time. Audit M3 code for this assumption before starting.
- Ring capacity: a 32-bar chorus with a dense lead can crowd the perimeter —
  reuse the M1 merge escalation on ring stations (per-ring budget 60).
- If a song's "chorus" occurrences differ in length (common: final chorus is
  double), map arc by *musical position within the chorus form*
  (`mtime` bars relative to section start), clamping the extended tail to
  extra laps — a double-length final chorus = two laps. Delightful, and falls
  out of the math.
