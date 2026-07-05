# Compilers

One compiler per concept: `song.json` → `performance.<concept>.json`. This is
where all musical intelligence lives — the renderer downstream is deliberately
dumb. Compilers are plain TypeScript packages in `compilers/<concept>/`, run
via:

```bash
pnpm compile --project mysong --concept metro
```

They run in Node (no DOM, no WebGL) so they're unit-testable and fast.

## Implemented concept compilers

As of 2026-07-04:

- **Waveform Runner, compiler version 3:** monotone motion and inverse curves,
  slope-limited terrain, closed-form ground/air trajectory, musical jump
  events, camera keys, exact-pose melody/activity glyph merges, and compiled
  `runner.step` gait events.
- **Metro Map, M3 in progress:** MIDI or explicitly tagged audio-activity
  lines, stations/clusters/interchanges, octilinear edges, trains, reveals,
  blooms, labels, legend data, frontier/final-fit camera, and deterministic
  parallel-corridor separation.

See [Current implementation status](../implementation-status.md) for the
verified feature matrix and open work.

## What a compiler owns

1. **Casting** — map roles to concept entities (lead → jellyfish, bass → the
   Whale) using role queries from `core`.
2. **Layout / world-building** — everything static: the metro map geometry, the
   runner's terrain polyline, city lots, coral positions. Emitted under
   `statics` so the renderer never computes placement.
3. **Choreography** — convert musical events to visual events, back-solved so
   payoffs land on hits (see below).
4. **Arc mapping** — sections → scene phases, camera keyframes, palette ramps.
5. **Budgeting** — density caps (max jumps/bar, bolt budget, station merging).
   Overflow policies are compiler logic, never renderer improvisation.

## The back-solve library (`core/backsolve`)

The shared trick: schedule causes so effects land on musical hits.

```ts
// Launch state so a ballistic arc lands at (xT, yT) exactly at tImpact
ballisticArrival(target: Vec2, tImpact: number, opts: { apex?: number; g?: number })
  → { launchPos, launchVel, tLaunch }

// Departure time along a path so arrival hits tArrive with the given easing
arriveAt(path: Path, tArrive: number, speedProfile: Ease)
  → { tDepart, duration }

// Assign N approachers to a list of onsets, respecting per-bar budgets,
// min spawn separation, and approach-duration bounds
scheduleApproaches(onsets: Event[], opts: ApproachOpts)
  → Array<{ spawnT, hitT, lane }>
```

Every produced event carries `params.hitT` (the musical hit it was solved
against). This is load-bearing: it's what sync tests assert on, and what the
dev overlay renders as beat-flash markers.

## Determinism rules (enforced, not suggested)

- **PRNG:** all randomness through `core/rng` (xoshiro128**), seeded
  `hash(project.seed + ':' + concept)`. Sub-streams via named forks:
  `rng.fork('flowers')` — so adding a random call in one system never reshuffles
  another. An ESLint rule bans `Math.random` and `Date.now` repo-wide.
- **No iteration-order traps:** never derive behavior from object key order;
  sort before sampling.
- **Closed-form or precomputed motion only.** If something needs simulation
  (flocking impulses, paint advection), the *compiler* runs it at a fixed
  timestep and bakes keyframes/curves into the performance. The renderer never
  integrates anything it couldn't re-evaluate at an arbitrary `t`.

## Musical-time utilities (`core/mtime`)

The vocabulary compilers think in:

```ts
mt.beatAt(t)  mt.barAt(t)  mt.timeOfBar(n)  mt.quantize(t, '1/8')
mt.sections()  mt.sectionAt(t)  mt.repeatsOf(section)
mt.events({ role: 'snare', within: section })
mt.phase(t, 'bar')          // 0–1 position within the current bar
mt.energyAt(t)              // master energy curve sample
```

Built once from `song.json`'s grid + tempo map; handles tempo changes so
concepts never do beat math themselves.

## Palette solver (`core/palette`)

Key/mode → base palette family (major = warm/bright, minor = cool/desaturated,
low key-confidence = neutral). Roles get fixed colors under contrast
constraints (min ΔE between any two roles, background separation). Deterministic;
output goes in `performance.palette` and tuning files may override hues without
recompiling.

## The compiler interface

```ts
export interface ConceptCompiler {
  concept: string;
  compile(song: Song, opts: CompileOpts): Performance;
}
```

Compilers share a pipeline skeleton (`core/compilerKit`): load + validate →
build MusicalTime → cast roles → statics → events (per system) → budget pass →
camera → validate + write. A new concept implements the middle and inherits
the rest.

## Testing (this is where sync quality is guaranteed)

Compilers are pure functions of JSON → JSON, so testing is cheap and strict:

- **Sync invariant test (shared, runs for every concept):** every event with
  `params.hitT` must satisfy `|payoffTime(event) − hitT| ≤ 1/fps`. The payoff
  time is event-type-declared (e.g., `train.travel` pays off at `tEnd`).
- **Budget tests:** no bar exceeds its declared caps.
- **Determinism test:** compile twice, byte-identical output.
- **Golden performances:** small fixture songs (8-bar synthetic `song.json`
  files, hand-checkable) with committed expected outputs — schema drift and
  logic regressions show up as diffs.
- **Fixture generator:** `core/fixtures` builds synthetic songs ("4-on-floor
  kick, I–V–vi–IV keys, one 8-bar chorus repeated twice") so concept features
  like repetition handling are testable without real projects.
