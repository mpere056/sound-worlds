# Architecture

TypeScript + WebGL system that turns a Reaper project into a rendered vertical
video. This doc is the overview; details live in [`docs/architecture/`](docs/architecture/).

> **Scope note:** the Reaper/ReaScript extractor is a separately installable
> companion subsystem, documented in
> [reaper-extractor.md](docs/architecture/reaper-extractor.md). The analyzer and
> renderer remain decoupled from REAPER and consume only its versioned export
> package.

## The five stages

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. EXTRACT (Lua inside REAPER + native REAPER rendering)               │
│    → manifest.json + export-report.json + stems/*.wav + master.wav     │
├────────────────────────────────────────────────────────────────────────┤
│ 2. ANALYZE (Python · librosa)                                          │
│    audio features + MIDI merged into one musical timeline              │
│    → projects/<song>/song.json                                         │
├────────────────────────────────────────────────────────────────────────┤
│ 3. COMPILE (TypeScript, one compiler per concept)                      │
│    musical events → fully scheduled visual events (back-solved)        │
│    → projects/<song>/performance.<concept>.json                        │
├────────────────────────────────────────────────────────────────────────┤
│ 4. RENDER (TypeScript · Three.js / PixiJS, in-browser via Vite)        │
│    Dev mode: realtime preview, audio playback, scrubbing, Tweakpane    │
│    Render mode: deterministic frame stepping → WebCodecs → video file  │
├────────────────────────────────────────────────────────────────────────┤
│ 5. MUX (ffmpeg script)                                                 │
│    video + Reaper master WAV → final.mp4 (1080×1920 @ 60fps)           │
└────────────────────────────────────────────────────────────────────────┘
```

Each stage has a JSON control file on disk, with large audio or feature-matrix
sidecars referenced by path. Every stage can be run, inspected, and re-run
independently — debugging starts with the JSON and its validation report.

## Design principles

1. **Deterministic everything.** Time comes only from the frame index
   (`t = frame / fps`), all randomness from a seeded PRNG (extractor content
   hash + concept name). Same inputs → identical video, forever. No `Math.random`, no
   `Date.now`, no physics engines.
2. **Smart compiler, dumb renderer.** All musical intelligence (what happens
   when, back-solving arrival times onto beats) lives in the compiler. The
   renderer just executes a schedule. This keeps scenes simple and makes sync
   bugs findable in JSON rather than in shaders.
3. **The renderer is a function of `t`.** Scenes render "the state of the world
   at time t," which is what makes scrubbing, previewing, and frame-stepped
   export all the same code path. (Accumulative scenes like Painting replay
   their event prefix — see [renderer.md](docs/architecture/renderer.md#stateless-vs-accumulative-scenes).)
4. **Artifact-grade endings.** Concepts that end on a poster (painting, metro
   map, skyline) get a separate high-resolution still export path.

## Tech choices (and why)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) everywhere JS-side | One language across compilers, renderer, export |
| Analyzer | Python 3.12 + librosa + pydantic (managed with `uv`) | Best-in-class audio analysis; JSON is the bridge |
| 3D scenes | Three.js (+ EffectComposer post chain) | Descent, Corridor, City |
| 2D scenes | PixiJS v8 (or raw WebGL where simpler) | Metro, Painting, Runner, Storm, Ecosystem |
| Dev server | Vite | Instant reload — the art-tuning loop |
| Schemas | Zod (TS) + pydantic (Py), from one JSON-Schema source | Every stage boundary validated |
| Param tuning | Tweakpane | Live sliders in dev mode; saved to `tuning.<concept>.json` |
| Encoding | WebCodecs `VideoEncoder` + `mp4-muxer` | Fast in-browser H.264, no server needed |
| Mux / delivery | ffmpeg CLI | Attach master WAV, platform-spec output |
| Workspace | pnpm workspaces monorepo | Shared `core`/`render` packages, per-concept packages |
| No React | — | An offline renderer is one imperative loop; UI needs are met by Tweakpane |

## Repository layout

```
reaper-viz/
├── README.md / ARCHITECTURE.md
├── docs/
│   ├── <concept>.md              ← the 8 concept documents
│   └── architecture/             ← detailed architecture docs (below)
├── analyzer/                     ← Python package (uv): `analyze <projectDir>`
├── packages/
│   ├── core/                     ← types, schemas, PRNG, MusicalTime, curves,
│   │                               back-solve lib, palette solver
│   ├── render/                   ← RenderClock, SceneModule, event runtime,
│   │                               three/pixi bases, post chain, export harness
│   └── app/                      ← Vite app: project picker, preview, render UI
├── compilers/
│   └── <concept>/                ← song.json → performance.<concept>.json
├── scenes/
│   └── <concept>/                ← SceneModule implementation per concept
├── scripts/                      ← mux.sh, render-all.sh, new-concept scaffold
└── projects/                     ← per-song data (gitignored)
    └── <song>/
        ├── manifest.json  export-report.json      (from REAPER extractor)
        ├── stems/  master.wav                     (from REAPER extractor)
        ├── song.json  features/                   (from analyzer)
        ├── performance.<concept>.json             (from compiler)
        ├── tuning.<concept>.json                  (saved Tweakpane params)
        └── out/                                   (rendered video, stills)
```

## The end-to-end workflow

```bash
# 1. Run the companion extractor from the open REAPER project
#    → projects/mysong/manifest.json + report + aligned audio

# 2. Analyze
uv run analyze projects/mysong

# 3. Compile a concept
pnpm compile --project mysong --concept metro

# 4. Tune (dev mode: audio preview + scrub + Tweakpane; saves tuning.metro.json)
pnpm dev

# 5. Render (frame-stepped, no audio, WebCodecs → out/metro.mp4)
pnpm render --project mysong --concept metro

# 6. Mux with the Reaper master + platform spec
scripts/mux.sh projects/mysong/out/metro.mp4 projects/mysong/master.wav final.mp4
```

## Detailed docs

| Doc | Covers |
|---|---|
| [reaper-extractor.md](docs/architecture/reaper-extractor.md) | REAPER snapshot, track selection, stem rendering, automation, safety, validation |
| [data-contracts.md](docs/architecture/data-contracts.md) | `manifest.json`, `song.json`, `performance.json` schemas, TimedCurve, roles, versioning |
| [analyzer.md](docs/architecture/analyzer.md) | The Python stage: onsets, curves, pitch, chords, key, per-hit spectra, section normalization |
| [compilers.md](docs/architecture/compilers.md) | Compiler pattern, back-solve library, determinism rules, testing sync |
| [renderer.md](docs/architecture/renderer.md) | SceneModule interface, RenderClock, event runtime, dev harness, post chain |
| [export.md](docs/architecture/export.md) | WebCodecs pipeline, muxing, platform specs, hi-res artifact stills |
