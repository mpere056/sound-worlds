# P0 — Foundations (shared by both games)

**Depends on:** nothing for fixture-driven development; extractor E3 for the
real-project exit demo
**Unlocks:** M1 (Metro) and R1 (Runner) — both games build on exactly this
**Est. size:** ~2,000 LOC TS + ~400 LOC Python
**Exit demo:** a test-pattern scene previews in the dev app with the master WAV
playing and scrub working, beat flashes land on the beat, and a 10-second clip
exports to an `.mp4` muxed with audio.

## Implementation status

The analyzer foundation is implemented and has produced a schema-valid
`song.json` from the first real five-track REAPER export. The TypeScript
workspace and shared core are also implemented: strict stage contracts,
TimedCurve operations, deterministic forkable PRNG, musical-time queries,
back-solving, palettes, synthetic fixtures, and an enforced determinism check.
The real generated song passes through the built core loader and query layer.
The renderer-neutral clock, seek-safe event runtime, and camera interpolation
are implemented and tested. PixiBackend and the responsive Vite dev shell now
load the first real export, stream its WAV, render the energy/beat-driven test
pattern, expose tuning controls, and provide sync/safe-area overlays. A first
encoded export slice now produces deterministic three-second H.264 MP4 previews
and PNG stills in supported browsers. Full-song render orchestration, direct
project-output writing, and audio muxing remain.

## Goal

Build the shared spine once, so every concept afterwards is "a compiler + a
scene." Nothing game-specific in this phase — but the exit demo already proves
the entire pipeline (analyze → validate → preview → export → mux) end to end.

## Scope

**In:** workspace tooling, `packages/core`, minimal analyzer, `packages/render`
runtime + PixiBackend, dev app shell, export harness, mux script.
**Out:** REAPER extractor implementation (planned separately), ThreeBackend
(no concept needs it until Descent), full audio analysis
(pitch tracking, chords, per-onset spectra), any game logic.

## Work breakdown

### 1. Workspace & tooling
- pnpm workspaces (`packages/*`, `compilers/*`, `scenes/*`, `analyzer` excluded
  from TS build), TypeScript strict, Vitest.
- ESLint config including the custom **determinism rule**: `Math.random`,
  `Date.now`, `performance.now` banned in `scenes/`, `compilers/`,
  `packages/render`, `packages/core`.
- `scripts/` skeleton: `mux.sh`, `new-concept.sh` scaffolder.

### 2. `packages/core`
- **Schemas** (`core/schema/*.json` + Zod mirrors): `manifest`, `song`,
  `performance` envelope (concept payloads typed per-concept later),
  `tuning`. Loaders that validate-or-throw with readable errors.
- **`TimedCurve`**: type + `sample(curve, t)` (lerp, clamped) +
  `resample`, `integrate` (needed for `x(t)`), `smooth` (box/critically-damped).
- **`rng`**: xoshiro128\*\*, string-seeded, `fork(name)` sub-streams.
- **`mtime`**: built from `song.grid` + tempo map — `beatAt/barAt/timeOfBar/
  quantize/phase/sectionAt/repeatsOf/events(query)`.
- **`backsolve`**: `ballisticArrival`, `arriveAt`, `scheduleApproaches`
  (signatures per [compilers.md](../architecture/compilers.md)).
- **`palette`**: key/mode → palette family, role color assignment with min-ΔE
  constraint. Basic version — refined later per concept.
- **`fixtures`**: synthetic `song.json` builder (tempo, sections with
  repeatGroups, note patterns per role). Used by every test suite after this.

### 3. `analyzer/` (Python, uv) — MVP cut
- `manifest.json` validation (pydantic) → `song.json`:
  - MIDI passthrough → `events` (kind `note`).
  - Grid from tempo map; sections from regions + name normalization +
    repeatGroup detection.
  - Master energy curve + waveform summary (librosa RMS / peaks).
  - Per-stem onsets for **drum roles only** (Runner needs snare/kick even in
    audio-only projects).
- Deferred to later phases (documented in the code): pitch tracking, chords,
  per-onset spectra, segmentation fallback, HTML report.

### 4. `packages/render`
- `SceneModule` + `SceneContext` interfaces; `RenderClock` (frame-indexed).
- `EventCursor` (sorted events, `instantaneousAt`/`activeAt`, seek-safe) +
  the declarative `runtime.on/during` wrapper.
- **PixiBackend**: fixed-size drawing buffer (1080×1920 render target
  independent of CSS size), layer containers, `readPixelsInto`,
  `renderAtScale` stub.
- Camera rig for 2D: keyframe interpolation from `performance.camera`.

### 5. `packages/app` (dev shell)
- Project/concept picker (Vite plugin exposing `projects/` listing).
- Transport: play/pause/scrub; **clock slaved to `audio.currentTime`** in dev.
- **Sync overlay**: beat/downbeat flashes from `song.grid`, event `hitT`
  markers, bar/section readout.
- Tweakpane panel generated from a scene's `TuningSchema`; save/load
  `tuning.<concept>.json`.
- 9:16 safe-area guides toggle.

### 6. Export harness
- Render mode: frame-indexed loop → Mediabunny `CanvasSource` → WebCodecs H.264
  with awaited backpressure → fast-start MP4. The implemented preview writes a
  browser download; the full File System Access path into
  `projects/<song>/out/` remains.
- `scripts/mux.sh`: ffmpeg `-c:v copy` + AAC audio + duration sanity warning.
- **Test-pattern scene** (`scenes/_testpattern`): beat-flash grid + moving
  gradient — exists purely to prove preview + export + sync.

## Acceptance criteria

- [x] `python -m analyzer projects/<fixture>` produces schema-valid `song.json`.
- [x] A package fixture conforming to extractor manifest v2 validates before
      analysis; real-project testing uses an E3 export rather than hand-edited
      files.
- [x] Fixture builder can express: 8-bar song, chorus repeated 2×, per-role patterns.
- [ ] Dev app: pick project → test-pattern scene plays with audio; scrubbing to
      any `t` renders the identical frame as playing through to `t`.
- [ ] Beat flashes visibly land on the beat with real audio (human check).
- [ ] `pnpm render` produces an mp4; `mux.sh` attaches audio; file plays in
      QuickTime at 1080×1920@60.
- [ ] Determinism: two renders of the test pattern → identical frame hashes at
      10 sampled frames.
- [x] The determinism check fails on `Math.random`, `Date.now`, or
      `performance.now` in core/render/compiler/scene code.

## Tests added

`core`: TimedCurve sample/integrate properties; rng determinism + fork
independence; mtime quantize/section lookup against fixtures; backsolve
ballistics (analytic cases: flat jump apex = gT²/8); schema round-trips.
`render`: EventCursor seek/replay equivalence. `analyzer`: pydantic golden
`song.json` for one fixture manifest.

## Notes & risks

- Extractor E0 owns manifest v2. P0 consumes that schema and fixture packages;
  it must not create a competing temporary manifest shape.
- WebCodecs/File System Access = **Chrome on macOS is the supported render
  environment**; assert and fail loudly elsewhere.
- Keep the analyzer's deferred features as explicit stubs raising
  `NotImplemented` with the phase that adds them — no silent absence.
