# M2 — Alive

**Depends on:** M1
**Unlocks:** M3
**Est. size:** ~300 LOC compiler + ~350 LOC scene
**Exit demo:** press play in the dev app — the map draws itself as the song
plays, trains run the lines and stop exactly on notes, stations bloom on hits,
and the sync overlay confirms every payoff is on the beat.

## Goal

Turn the still image into the video. This is the phase where the concept's
core promise — *trains arrive when notes play* — becomes verifiable on screen.

## Scope

**In:** train schedules + kinematics, reveal choreography, station blooms,
kick/snare signal events, sync-invariant wiring.
**Out:** labels/legend/districts (M3), parallel offsets (M3), rings (M4),
camera motion (M3 — keep fixed full-map view so sync is easy to eyeball).

## Work breakdown

### 1. Train schedules (`compilers/metro/src/trains.ts`)
- Per line, from **unquantized** note times:
  `dwell = clamp(0.25·gap, 80 ms, 600 ms)`, `departT = arriveT + dwell`,
  travel = gap remainder — per [§5 of the implementation plan](../metro-map-implementation.md#5-train-kinematics).
- Sprint flag when `travel < 150 ms`.
- Rest handling: gaps > 2 beats emit `train.wait` spans (blinker rendering).
- Emit `train.travel` span events (`tEnd = arriveT`, `params.hitT = arriveT`)
  and `station.bloom` instantaneous events — **one bloom per underlying merged
  note** (use `Station.times[]`), each with its own `hitT`.

### 2. Reveal choreography (`compilers/metro/src/reveal.ts`)
- `station.reveal` at first note; `edge.reveal` spans ending at the destination
  station's first note (drawing-head arrives *on* the note — back-solved start).
- Emit in one sorted event stream with the trains.

### 3. Drum signals
- `signal.pulse` (kick): parameterized by current frontier row (computed at
  compile: max revealed row at that kick's time).
- `beacon.blink` (snare): nearest not-yet-passed interchange.

### 4. Scene work (`scenes/metro/src/`)
- **Reveal rendering:** per-edge progressive draw — M2 keeps it simple with
  per-edge `Graphics` redraw clipped by arc-length progress (the shader-clip
  ribbon optimization is M5). Drawing-head glow dot travels the edge during its
  reveal span.
- **Trains:** capsule sprite per line; position = arc-length interpolation with
  `easeArrive` cubic; rotation = polyline tangent; sprint = linear + streak
  sprite. Waiting blinkers: phase = `hash(stationId) + barPhase` (deterministic).
- **Blooms:** instanced ring sprites, scale/alpha = `f(t − hitT)` decay
  (0.35 s), overshoot pop on `station.reveal`.
- Everything through `EventCursor` / `runtime.on|during` — no scene-local
  timeline logic.

### 5. Sync verification
- Wire metro event types into the shared **sync-invariant test**: every event
  carrying `hitT` must pay off within 1 frame (train arrival = `tEnd`,
  bloom = `t`).
- Dev overlay: confirm `hitT` markers coincide with beat flashes on a real
  project (human check, 60 seconds of watching).
- Add a **sync-readability audit** mode before tuning visuals further:
  current/next hit time, bar.beat, source track, line name, pitch/station id,
  source type (`midi` vs `audio-activity`), and event type. The overlay is
  development-only, but it is required to diagnose whether a weak result is a
  timing bug, a subtle cue, or missing project data.
- Strengthen note payoffs until a non-technical watcher can see the cause:
  train brake/glow, station bloom, optional line pulse, and label flash should
  all be evaluated as perceptual sync aids rather than decorative polish.

## Acceptance criteria

- [ ] Sync-invariant test green across all fixtures.
- [ ] `TrainSchedule.arriveT` exactly equals source note times (unit test).
- [ ] Scrub test: seek to random `t` = identical frame to playing through
      (EventCursor seek-safety exercised with accumulating reveals — reveal
      state must derive from `t`, not from fired-event history).
- [ ] A 30-second real-project preview *feels* locked (human check with audio):
      the reviewer can point to the line/station responding to prominent MIDI
      notes without inspecting JSON.
- [ ] Dev audit overlay explains every visible payoff: line, source track,
      pitch/station, source type, and `hitT`.
- [ ] Blooms fire per merged note, not per station.

## Tests added

Train kinematics unit tests (dwell clamps, sprint threshold, arrival
exactness); reveal back-solve test (head arrival == note time); scrub/seek
frame-hash equivalence test (the statelessness gate for this scene).

## Notes & risks

Implementation status (2026-07-03): train schedules now preserve source
arrival times, clamp dwell intervals, flag sprints, and emit reveal/bloom
events with `hitT`. The scene derives edge reveal, train position, and bloom
decay directly from the requested frame time, keeping scrubbing stateless. On
the current audio-only export, the same machinery uses beat-sampled activity
stations; MIDI exports retain exact note arrivals. Automated build, arrival,
bloom, octilinearity, determinism, and schema checks pass. The 60-second
audio/visual human sync check remains pending.

- The scrub requirement forces the right architecture *now*: reveal progress
  must be computed from `revealT` vs `t`, never from "events I've seen." Get
  this wrong and M5's export is fine but dev scrubbing lies.
- Trains during dense runs will look frantic at full-map zoom — don't tune
  this yet; M3's camera follow fixes the perceived speed.
- A green timing suite is necessary but insufficient. If train arrivals are
  correct but too small/subtle to read, treat it as an unfinished M2 cue-design
  problem, not as "randomness" or user confusion.
