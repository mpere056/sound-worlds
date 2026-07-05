# Metro Map — Implementation Plan

Companion to [the concept doc](../metro-map.md). This is the engineering design:
data model, the layout solver, train kinematics, rendering, edge cases, tests,
and build phases. Everything here consumes `song.json` and produces
`performance.metro.json` + a scene module — per the
[data contracts](../architecture/data-contracts.md).

---

## Current implementation

M1 and M2 are implemented. M3 is in progress: labels, legend presentation,
frontier/final-fit camera, stable global-rank corridor separation, offset train
paths, and interchange sizing are implemented. Occupancy-specific joint
healing, district bands, and complete label-overlap optimization remain before
M4 topology work. See [Current implementation status](../implementation-status.md)
and [M3 — Cartography](metro-map/M3-cartography.md).

## 1. Why this layout problem is tractable

General octilinear transit-map layout is NP-hard (it's solved with MIPs in the
literature). **We are not solving that problem.** Our graph has special
structure that removes the hardness:

1. Every line is a **path** (a track's notes in time order) — no arbitrary topology.
2. Station positions are **semantically pinned** to a coordinate system we
   control: time bins × pitch-class lanes. We never search for positions —
   we *derive* them, then locally resolve conflicts.
3. Aesthetics (octilinearity, parallel corridors, bend minimization) become
   **local pattern selection per edge**, not global optimization.

The result is a deterministic O(n log n) pipeline with an optional cheap
annealing polish at the end.

## 2. Coordinate system

```
x-axis: 12 pitch-class lanes           y-axis: time, flowing DOWN
        chromatic order, rotated               one row per time bin
        so the tonic is the center lane
```

- `laneX(i) = marginX + i * laneGap` for `i ∈ 0..11`. With 1080 px width,
  `marginX = 90`, `laneGap = 75` → lanes span 90–915 px, leaving a label margin.
- Chromatic lane order (not circle of fifths): stepwise melodies become
  adjacent-lane staircases — legibility of *melodic motion* beats harmonic
  adjacency for this visual. Rotation puts the tonic center-frame.
- **Time bin (row):** base quantum `q = 1 beat`, adaptive per song (see §4.1).
  `rowY(r) = headerH + r * rowGap`, default `rowGap = 44 px` at zoom 1.
- Absolute pitch → lane: `lane = (pitchClass − tonic + 6) mod 12`. Octave is
  discarded deliberately — it keeps the map 12 lanes wide, and octave unisons
  reading as "the same station" is musically defensible.

## 3. Data model

```ts
// ---- statics (compiled once, animated by revealT) ----
interface MetroStatics {
  lanes: { count: number; laneX: number[] };
  stations: Station[];
  edges: Edge[];
  rings: Ring[];                    // chorus loop lines
  bypasses: Bypass[];               // bridge express curves
  legend: LegendEntry[];
  districts: District[];            // key-change tint bands
  bounds: AABB;                     // for the final pull-back
}

interface Station {
  id: string;
  pos: Vec2;                        // resolved px (lane/row or ring arc)
  kind: 'stop' | 'interchange' | 'terminal';
  lines: LineId[];                  // members (≥2 ⇒ interchange)
  label: { text: string; side: 'L' | 'R'; tier: 0 | 1 | 2 };  // tier = zoom visibility
  revealT: number;                  // first note time that creates it
  mergedCount: number;              // how many notes merged into this station (§4.1)
}

interface Edge {
  lineId: LineId;
  from: StationId; to: StationId;
  poly: Vec2[];                     // octilinear polyline incl. parallel offset
  length: number;                   // cached arc length
  revealT: number;
}

interface Ring {
  repeatGroup: string;              // e.g. "chorus"
  center: Vec2;
  ringRadius: Record<LineId, number>;  // concentric per line
  perimeter: number;
  entry: PortalEdge; exit: PortalEdge; // trunk ↔ ring connectors
}

// ---- schedules (drive the animation) ----
interface TrainSchedule {
  lineId: LineId;
  stops: Array<{
    stationId: StationId;
    arriveT: number;                // EXACT unquantized note time — the sync payoff
    departT: number;                // arriveT + dwell
    edgeToNext?: EdgeRef;           // trunk edge or ring arc span
  }>;
}
```

Key invariant: **geometry is quantized, timing is not.** Stations sit on the
grid; trains arrive at real note times. The grid organizes space; the music
owns time.

## 4. The layout solver

Five passes, all deterministic.

### 4.1 Pass 1 — Semantic compilation (notes → abstract stations)

```
for each melodic track (roles: lead, bass, keys, vocals, other-with-MIDI):
  quantize note starts to bins of q
  MERGE: consecutive notes with same lane within the same bar → one station
         (mergedCount += 1; station blooms once per underlying note anyway)
  emit AbstractStation { trackId, row, lane, times[] }
```

- **Adaptive quantum:** start `q = 1 beat`. If any line exceeds the station
  budget (default **120 stations/line**), coarsen that line's merge window
  (bar-level merging of same-pitch runs) before touching `q` globally. If the
  *total* map exceeds ~600 stations, coarsen `q` to 2 beats. Both decisions are
  logged into the performance metadata (never silent).
- **Chords on one track** (≥2 simultaneous notes): emit one **chord cluster** —
  a single elongated station spanning `laneMin..laneMax` at that row (rendered
  as a connector bar). The line enters and exits at the root note's lane.
- **Float pitches** (audio-derived leads): round to nearest pitch class with
  ±0.4 semitone hysteresis keyed to the previous assignment, so vibrato never
  flickers lanes.

### 4.2 Pass 2 — Transfer detection

```
group AbstractStations by (row, lane):
  if ≥2 distinct tracks share a cell → merge into ONE station, kind=interchange
  else kind=stop
```

Refinement so long unisons don't spam rings: a run of consecutive shared cells
between the same two lines becomes **one interchange at the run's first cell**;
the remainder renders as a parallel corridor (§4.4). Onset alignment tolerance
for "same time" = same bin AND |Δt real| < 80 ms (guards against quantization
gluing unrelated notes).

### 4.3 Pass 3 — Section topology (rows, rings, bypasses)

Sections are laid out sequentially, maintaining a `rowCursor`:

```
for each section in song order:
  switch (section) {
    first occurrence of a repeatGroup with kind=chorus:
        instantiate RING at (centerLane, rowCursor + ringRows/2)
        map the section's stations onto the ring (below)
        rowCursor += ringRows + marginRows
    repeat occurrence of an existing ring:
        NO geometry; trains will re-ride the ring (schedule-only)
    kind=bridge:
        BYPASS: a single smooth curve from (bypassLane, rowStart) to
        (bypassLane, rowEnd) swung out past lane 0; stations sparse
        (only bar-downbeat notes become stops)
    default (verse/intro/etc.):
        rows laid out normally; rowCursor += section bins
  }
```

**Ring geometry.** A rounded rectangle (reads more "metro" than a circle),
outer size `ringW × ringH` (fits within lanes 2..9). Lines become concentric
rings ordered by track index, `ringRadius(line k) = base − k·offset`. A station
on the ring sits at arc-length position

```
s = perimeter · (stationTime − chorusStart) / chorusDuration
```

so one lap of the ring = one pass of the chorus, and **train laps ≡ chorus
repeats** with zero extra bookkeeping. Pitch is deliberately sacrificed on the
ring (topology over geography — the transit-map move); an optional subtle
radial wobble (±4 px by pitch deviation from the track median) keeps melodic
shape hinted. Entry/exit portals are octilinear connectors from the trunk's
last pre-chorus station to the ring tangent point (and out again).

### 4.4 Pass 4 — Octilinear routing + parallel corridors

For each line, connect consecutive stations `(r0,l0) → (r1,l1)`,
`Δr = r1−r0 ≥ 0`, `Δl = l1−l0` (in lane units where 1 lane ≈ 1.7 rows of px —
work in px space):

| Case | Pattern | Bends |
|---|---|---|
| `Δl = 0` | vertical | 0 |
| `|Δl| = Δr` (px-diagonal) | single 45° | 0 |
| `|Δl| < Δr` | 45° for the lane distance, then vertical | 1 |
| `|Δl| > Δr` | 45° for the row distance, then horizontal into the station | 1 |
| `Δr = 0, Δl ≠ 0` | horizontal | 0 |

Bend orientation (diagonal-first vs. last) defaults to diagonal-first; the
polish pass (§4.6) may flip per edge. All joins get radius `rBend = 10 px`
rounding at render time.

**Parallel corridors.** Build an occupancy index: for every grid cell edge
(cell → neighbor), the set of lines whose polylines traverse it. Where `k ≥ 2`
lines share a corridor, offset each perpendicular to travel direction:

```
offset(line) = (rank(line) − (k−1)/2) · corridorGap        // corridorGap = 7 px
```

`rank` = fixed global line order (track index). Fixed ordering is what real
map renderers use — it forfeits crossing-minimization but guarantees the same
line is always on the same side, which reads *more* professional, not less.
Interchange rings are sized to span their members' offsets
(`radius = baseR + (k−1)/2 · corridorGap`).

### 4.5 Pass 5 — Labels

Greedy with two-tier fallback:

1. Candidate anchors: right of station, left, below-right. Score = overlaps
   against (a) line geometry within 2 rows, (b) already-placed labels
   (AABB test via a spatial hash).
2. Zero-overlap candidate → place. Else → tier-demote (tier 1 hides below
   zoom 1.4; tier 2 hides below zoom 2.2 — only visible in the drawing-head
   close-up phase).
3. Always tier-0: interchanges, section-boundary stations, termini.

Label text: pitch name (`F#4`-style but octave-less: `F#`), bar number, or a
user-supplied word list (markers named `lyric:word` map to stations in order).

### 4.6 Optional polish — cheap annealing

Search space is deliberately tiny: per-edge bend orientation (binary) + label
side (ternary). Cost = crossings×10 + bends-adjacent-to-interchange×3 +
label-overlaps×5. ~200 iterations of random flips with acceptance on
improvement, seeded RNG. Runs in milliseconds; skippable (`--no-polish`).

## 5. Train kinematics

Per line, from the *unquantized* note times:

```
dwell(k)     = clamp(0.25 · gap(k), 80 ms, 600 ms)   // gap = next arrive − this arrive
departT(k)   = arriveT(k) + dwell(k)
travel(k)    = arriveT(k+1) − departT(k)
pos(t)       = polylinePoint(edge, easeArrive((t − departT)/travel) · edge.length)
```

`easeArrive` = cubic ease-in-out ⇒ the train *stops* exactly at `arriveT(k+1)`,
which is exactly the note onset — this is the sync payoff, guaranteed by
construction, and each stop event carries `hitT = arriveT` for the sync tests.

- **Sprints:** `travel < 150 ms` → linear motion + a motion-streak sprite
  instead of easing (fast runs read as an express dash through stations).
- **Rests > 2 beats:** the train waits with blinking door lights (blink phase =
  `hash(stationId) + bar phase` — deterministic, scrub-safe).
- **Rings:** identical math on arc-length around the ring; chorus repeat n
  simply schedules another lap (arc positions already encode within-chorus
  time; laps come free).
- Drums don't get trains: `kick` → cross-tie pulse event at the current
  frontier row; `snare` → beacon blink at the nearest upcoming interchange.

## 6. Reveal choreography (drawing the map)

Everything has `revealT`:

- A station reveals at its first note (pop + ring bloom, scale overshoot 1.25 → 1).
- An edge reveals when its *destination* station first plays: a glowing
  drawing-head dot traverses the edge during `[revealT − travel, revealT]`
  (back-solved so the head *arrives* on the note), leaving the stroked line
  behind it (implemented as arc-length clip, §8).
- Legend chips reveal on each line's first note; district tints on key changes;
  ring geometry pre-draws as faint "under construction" dashes 2 bars before
  chorus 1, then inks in as it plays (anticipation).

## 7. Camera

Three compiled phases (keyframes in `performance.camera`):

1. **Follow:** target = smoothed drawing frontier `maxRowY(t)` (compile-time
   smoothed — critically damped filter run over the reveal schedule), zoom 1.6.
2. **Ring moments:** on chorus repeats, ease to the ring center, zoom 1.3.
3. **The reveal:** last 6 s, ease to fit `statics.bounds` (zoom-to-fit is
   computed at compile time), legend completes, title lozenge stamps.

## 8. Rendering (PixiBackend)

- **Edges:** one ribbon mesh per line (rounded joins/caps baked into the
  triangulation, done once at init). Reveal clipping via a per-vertex
  arc-length attribute + uniform `revealLen(t)` in the fragment/vertex shader —
  no per-frame retriangulation.
- **Stations:** instanced sprites (circle, ring, connector-bar variants);
  bloom pulses driven by `station.bloom` events (scale/alpha as pure
  `f(t − hitT)` decay).
- **Trains:** capsule sprites, rotation = polyline tangent; position from §5
  math each frame (stateless).
- **Labels:** BitmapText, tier-culled by camera zoom.
- **Poster export:** `renderStill(tEnd, 4)` — same statics at 4×; **SVG
  export** serializes `statics` directly (polylines, circles, text) — it's
  vector data already; this is serialization, not rendering.

## 9. Edge cases & fallbacks

| Case | Handling |
|---|---|
| No regions in project | No rings; single trunk; camera phases 1+3 only |
| Arp track with 2 000 notes | Bar-merge policy + station budget (§4.1); blooms still fire per note on the merged station |
| Only drums (no melodic tracks) | Refuse with a clear message — this concept needs pitches (documented limitation) |
| Two long-unison lines | Single interchange at unison start + parallel corridor (§4.2) |
| Tempo changes | All bin math via `core/mtime`; rows are beat-indexed, not second-indexed |
| Key confidence low | Tonic centering skipped (lane 0 = C), neutral palette |

## 10. Testing

- **Fixture songs** (`core/fixtures`): 8-bar two-track unison fixture (transfer
  detection), chorus-repeated fixture (ring + lap schedule), arp fixture
  (merging/budget).
- **Property tests:** all edge segments' angles ∈ {0°, 45°, 90°}; station
  min-spacing respected; every `TrainSchedule.arriveT` equals its source note
  time exactly; polyline arc-length monotone; determinism (byte-identical
  recompile).
- **Sync invariant** (shared harness): every `station.bloom` / train stop
  carries `hitT`; payoff within 1 frame.
- **Golden frames:** t = {2 s, chorus 1 mid, ring lap 2, final reveal}.

## 11. Build phases

Each phase has a full work-order document. All phases depend on the shared
[P0 — Foundations](phase-0-foundations.md).

| Phase | Deliverable | Work order |
|---|---|---|
| M1 | Static map renders — the layout solver proven | [metro-map/M1-static-map.md](metro-map/M1-static-map.md) |
| M2 | It's alive — reveal, trains, blooms, sync verified | [metro-map/M2-alive.md](metro-map/M2-alive.md) |
| M3 | It's a map — corridors, labels, legend, camera | [metro-map/M3-cartography.md](metro-map/M3-cartography.md) |
| M4 | Topology — chorus rings + laps, bypass | [metro-map/M4-topology.md](metro-map/M4-topology.md) |
| M5 | Ship — polish, night mode, mp4 + poster + SVG | [metro-map/M5-ship.md](metro-map/M5-ship.md) |

Rough size: compiler ~1 200 LOC, scene ~800 LOC, shared kit reuse for the rest.
