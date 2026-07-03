# Metro Map of the Song

> **Implementation plan:** [implementation/metro-map-implementation.md](implementation/metro-map-implementation.md)

**One-line pitch:** A transit map draws itself as the song plays — each track a
colored line, each note a station, harmonies become transfer stations, choruses
become loop lines — ending on a poster-grade map of the song's structure that
musicians will instantly understand.

## The hook

It's clever *and* clean. Transit-map design language (Beck-style octilinear
lines, rounded caps, interchange rings) is universally loved and screenshots
beautifully. The musical payload is real, not decorative: **you can read the
song from the map** — where the hook repeats, where the bass and lead lock into
unison, where the bridge takes its detour. Final frame doubles as merch
(print/SVG poster: "the metro map of my single").

## Visual identity

- **Style:** authentic transit-diagram grammar — thick rounded polylines, 45°
  octilinear bends, white interchange rings, station ticks, a proper legend, a
  cream (day) or ink-navy (night) background with a faint grid.
- **Typography:** transit-style sans (Helvetica-adjacent), station labels set
  horizontally, metro-sign title lozenge at the end.
- **Format:** 9:16. **Time flows downward** (reading/scroll direction); the
  camera follows the drawing head down the map, then pulls back for the reveal.

## The mapping (this is the concept)

| Music | Map element |
|---|---|
| Track / role | **A line** (one color each, from a curated metro palette). |
| Note | **A station** on that line, placed at (bar-position ↓, pitch-lane ↔). |
| Same pitch at the same moment on two tracks | **Transfer station** — shared white interchange ring joining the lines. Harmonic unisons become the map's junctions. |
| Chord (keys track) | An **interchange cluster** — one multi-ring station spanning the chord's pitch lanes. |
| Beat grid | The **signal system** — faint cross-ties every beat; kick pulses them, snare blinks level-crossing beacons. |
| Repeated section (chorus) | **A loop line** — the chorus is drawn once as a circle; every repetition, the trains ride the loop again (structure becomes topology: verses are branches off the central chorus ring). |
| Bridge | An **express bypass** — a long elegant curve that skips the grid. |
| Key change | **District boundary** — background tint and grid angle shift. |
| Section labels (regions) | **Station-group names** on the margin: "Verse I", "Chorus", set in transit signage style. |
| Tempo | Train speed baseline. |

## The trains

Each line has a small capsule train = that stem's playhead.

- A train **arrives at a station exactly when its note plays** (inter-station
  speed is back-solved from note spacing; arrivals are the sync payoff).
- On arrival: station bloom (ring pulse), label flash, soft doors-chime aligned
  to the note.
- Note velocity = passenger count (tiny dots boarding on loud notes — stretch).
- During rests, the train waits at a station with idle blinkers — silence is
  visible as a stopped train.

## Song structure → drawing arc

| Phase | What happens |
|---|---|
| Intro | Empty grid + compass rose + title lozenge sketch; first line begins drawing with its first note. |
| Verses | Lines extend downward; new tracks debut as new lines with a legend chip animating in ("● Bass — Blue Line"). |
| Chorus 1 | The **loop line** is drawn — the map's centerpiece ring. |
| Later choruses | No new geometry: all trains converge and ride the existing ring together (repetition = shared ride, visually rhymes with the music). |
| Bridge | The express bypass sweeps around everything. |
| Drop | Every signal lights, all trains at speed, station blooms cascading down the map. |
| Outro | Trains pull one by one into a terminal as their tracks drop from the mix. |
| Final chord | Camera pulls back to the **full map**; legend completes; title lozenge stamps; hold 2s as end-card. |

## Signature moments

1. **A melodic run** = a train sprinting through six stations in perfect note-time.
2. **The unison moment** — two trains arriving at the same transfer station on
   the same beat from opposite directions.
3. **Chorus 2** — all trains merging onto the loop line together.
4. **The reveal** — the completed poster.

## Technical approach

- **Renderer:** pure 2D Canvas vector (simplest of all concepts — no WebGL
  required, trivially exports SVG + 4× PNG poster).
- **Layout solver (the actual engineering):**
  - MVP: lane grid — time rows (per bar) × pitch-class columns; octilinear
    connectors chosen from a small template set; collision-avoided by lane
    nudging. Deterministic.
  - Stretch: proper schematic optimization pass (simulated annealing on bend
    count / edge crossings — the classic transit-map-layout literature problem).
- **Compiler:** quantizes notes to the grid, detects unisons (pitch+time
  coincidence within tolerance) → transfer stations, detects repeated sections
  (region names or self-similarity) → loop-line topology, emits draw/train
  schedules with back-solved train easings.
- **Trains:** position = arc-length interpolation along the polyline with
  per-segment durations from note gaps.

## Data requirements

MIDI notes for melodic/bass/keys tracks (this concept is MIDI-first; audio-only
melodic stems need pitch tracking and quantize confidence), drum onsets, regions
with names, tempo map, track names for the legend.

## MVP → stretch

- **MVP:** lane-grid layout, 4 lines, stations + transfers, trains with
  synced arrivals, legend, poster export.
- **Stretch:** loop-line chorus topology, express bypass, annealed octilinear
  beautification, passengers, night mode, animated "system opening day" intro.

## Risks & mitigations

- **Dense songs → spaghetti** → quantize floor (1/8 default), per-line station
  budget (merge repeated adjacent pitches into one bigger station), and the
  loop-line trick removes all chorus duplication.
- **Audio-only projects** → degrade gracefully: unpitched tracks become straight
  "shuttle lines" with stations on onsets only.
- **Reading order confusion** → the camera always follows the drawing head;
  section margin labels anchor where you are in the song.

## Open questions

- Station naming: pitch names ("C♯4"), bar numbers, or user-supplied words per
  marker (lyric fragments would be lovely)?
- One map style (brand) vs. per-city themes (London/Tokyo/Vienna palettes) as
  presets?
