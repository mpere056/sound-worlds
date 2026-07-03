# M1 — Static Map

**Depends on:** [P0 foundations](../phase-0-foundations.md)
**Unlocks:** M2
**Est. size:** ~600 LOC compiler + ~250 LOC scene
**Exit demo:** open the dev app on a real project and see the *complete,
correct, fully-drawn* metro map as a still image — every line, station, and
transfer, octilinear throughout.

## Goal

Prove the layout solver. No animation, no trains, no rings — just: notes go in,
a correct map comes out. Almost all M1 code is the compiler; the scene is a
dumb draw-everything renderer.

## Scope

**In:** solver passes 1, 2, 4 (semantic compilation, transfers, octilinear
routing); lane/row geometry; trunk-only section layout (linear `rowCursor`, no
rings — repeated sections just lay out again as normal rows for now); statics
output; static rendering.
**Out:** reveal animation, trains, parallel corridor offsets, labels, legend,
rings/bypass, camera (fixed full-map view), polish.

## Work breakdown

### 1. Compiler skeleton (`compilers/metro/src/index.ts`)
- `compile(song, opts)` via `core/compilerKit`: validate → mtime → cast →
  passes → validate out.
- Role selection: melodic tracks = roles `lead|bass|keys|vocals` + any track
  with MIDI pitches; drums excluded. Log the cast.

### 2. Pass 1 — semantic compilation (`passes/semantic.ts`)
- Lane math: `lane = (pitchClass − tonic + 6) mod 12`; tonic from
  `song.meta.key` (fallback C when confidence < 0.5).
- Quantize note starts to `q = 1 beat` bins → `(row, lane)`.
- Merge rule: consecutive same-lane notes within a bar → one station,
  `mergedCount`, `times[]` preserved (M2 needs them for blooms).
- Chord clusters: ≥2 simultaneous notes on one track → single cluster station
  spanning `laneMin..laneMax`, entry/exit at root lane.
- Budgets: per-line 120 stations → bar-level merge escalation; global 600 →
  coarsen `q` to 2 beats. Decisions logged into performance metadata.
- Float pitch → lane with ±0.4 st hysteresis (audio-lead support).

### 3. Pass 2 — transfers (`passes/transfers.ts`)
- Group by `(row, lane)`; ≥2 tracks → interchange (with the real-time
  tolerance check: |Δt| < 80 ms).
- Unison-run collapse: consecutive shared cells between the same line pair →
  interchange at first cell only; rest tagged `parallelRun` for M3.

### 4. Pass 4 — routing (`passes/routing.ts`)
- Geometry constants: `laneX(i) = 90 + i·75`, `rowY(r) = headerH + r·44`.
- The 5-case octilinear pattern table (vertical / diagonal / diag+vert /
  diag+horiz / horizontal) → `poly: Vec2[]` per edge, arc length cached.
- No offsets yet: coincident polylines will overdraw — accepted in M1.

### 5. Statics assembly (`statics.ts`)
- `MetroStatics` per the [data model](../metro-map-implementation.md#3-data-model):
  stations, edges, `bounds`; `rings: []`, `legend: []` for now.
- `revealT` computed and stored (M2 consumes it; M1 ignores it).

### 6. Scene (`scenes/metro/src/`)
- PixiBackend; draw all edges as `Graphics` polylines (rounded joins), stations
  as circle/ring/bar sprites by kind. Palette from `performance.palette`.
- Fixed camera: fit `statics.bounds`.

## Acceptance criteria

- [ ] Unison fixture → exactly one interchange at the unison start.
- [ ] Chord fixture → cluster stations spanning correct lanes.
- [ ] Octilinearity property test: every edge segment angle ∈ {0°, 45°, 90°}.
- [ ] Station min-spacing property test passes (no two station centers < 18 px
      unless same station).
- [ ] Budget escalation triggers on the 2,000-note arp fixture and is logged.
- [ ] Determinism: recompile → byte-identical `performance.metro.json`.
- [ ] Real project renders a recognizable, non-overlapping map (human check).

## Tests added

Fixture suites: `unison`, `chords`, `arp-budget`, `float-pitch-hysteresis`.
Property tests: octilinearity, spacing, determinism. Golden: one full
`performance.metro.json` for the 8-bar fixture, committed.

## Notes & risks

Implementation status (2026-07-03): M1 now compiles deterministic MIDI lines,
chord clusters, aligned-note interchanges, and octilinear edges. Audio-only
tracks degrade to explicitly tagged activity shuttles sampled on the beat. The
current real export produces 5 lines, 95 stations, and 90 edges entirely from
that fallback because it contains no MIDI or detected onsets. Compiler,
octilinearity, interchange, fallback, determinism, production-build, and schema
checks pass. Browser selection is wired; final visual inspection is pending a
responsive in-app browser session.

- The tonic-centering decision affects every station position — get
  `key.confidence` handling right now or every later golden breaks.
- Resist rendering polish here; M1's whole value is trusting the solver output.
