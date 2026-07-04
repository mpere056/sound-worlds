# reaper-viz

Generated music visualizers built from Reaper projects. Each visualizer reads the
tracks of a song, compiles them into a deterministic "performance," and renders a
vertical video (1080×1920 @ 60fps) that plays from the first bar to the last —
made for TikTok / Instagram.

Not a screen-recorded game: every visualizer is an **offline, frame-perfect
render** synced to the song's own stems and MIDI.

## The shared pipeline

Full technical design in [ARCHITECTURE.md](ARCHITECTURE.md) and
[docs/architecture/](docs/architecture/). Every visualizer concept in `docs/`
is a different front-end on the same spine:

```
Reaper project
   │  Lua ReaScript extractor + REAPER-native rendering
   ▼
manifest.json + export-report.json + stems/*.wav + master.wav
   │  Analyzer (Python: librosa/aubio)
   ▼
song.json  — the unified event timeline
   │  Visualizer compiler (per concept)
   ▼
performance.json — every visual event, pre-scheduled
   │  Renderer (WebGL/Canvas/Three.js, headless)
   ▼
frames → ffmpeg mux with master WAV → final.mp4 (9:16)
```

### What the extractor pulls from REAPER

- Tempo map, time signature changes
- **Regions & markers** — your section labels (`Verse`, `Chorus`, `Drop`…) drive scene changes
- Track list: names, MIDI items (pitch / velocity / start / duration), automation envelopes
- Per-track stem render + master render (Reaper native)

The extractor is a separate companion subsystem: Lua runs inside REAPER to
snapshot the authoritative open project and coordinate native renders; Python
remains outside REAPER for audio analysis. See the
[extractor architecture](docs/architecture/reaper-extractor.md) and
[implementation plan](docs/implementation/reaper-extractor-implementation.md).

The first complete extractor path is now implemented: a REAPER action writes a
persisted export plan, aligned native stems and master audio, flattened MIDI,
semantic automation, checksums, `manifest.json`, and a validation report. See
the [extractor runbook](extractor/README.md) for the exact REAPER steps.

The first analyzer path is also implemented. It validates that package and
writes a schema-checked `song.json` with the musical grid, sections, MIDI,
per-track RMS/centroid curves, drum onsets, and master waveform/energy. See the
[analyzer runbook](analyzer/README.md). Pitch, chords, automatic segmentation,
and the HTML analysis report remain later phases.

The shared TypeScript core is implemented under [`packages/core`](packages/core):
strict stage loaders, timed curves, deterministic forkable random streams,
musical-time queries, back-solving, palette generation, and synthetic fixture
songs. `corepack pnpm check` runs its determinism guard, typecheck, and tests.

The renderer-neutral runtime is implemented under
[`packages/render`](packages/render): frame-indexed timing, seek-safe event
dispatch, span progress, and camera interpolation. Graphics backends and the
preview application are the next layer. The PixiJS backend and
[`packages/app`](packages/app) preview shell now load real analyzed exports,
stream their master WAV, switch between compiled worlds, scrub, flash beats,
expose safe-area guides, and export short H.264 MP4 previews or PNG stills.

Waveform Runner R2 is the first animated compiled world. Its compiler turns master
energy and waveform data into monotone motion, slope-limited terrain, a ground
and airborne trajectory, exact musical landings, and camera keys; its Pixi
scene renders that data as a runner jumping across a layered waveform
landscape. Metro Map now compiles MIDI or honest
audio-activity fallback lines into an octilinear network that draws itself,
runs timestamped trains, labels key stops, follows the drawing frontier, and
blooms stations on musical arrivals. The
glowing orb is a pipeline diagnostic scene and is explicitly labeled as such
in the app.

### What the analyzer adds (for audio-only tracks)

- Per-stem onsets, RMS energy curve, spectral centroid curve
- Monophonic pitch tracks where possible (pYIN)
- Master: beat grid confirmation, key estimate, chord track (chromagram), global energy envelope

### Track roles

Visualizers consume **roles**, not raw tracks. Roles are assigned from track
names with a config override:

`kick · snare · hats · toms · percussion · bass · lead · keys/pads · fx · vocals`

Name your Reaper tracks sensibly and everything maps automatically.

### The two tricks every concept uses

1. **Back-solving** — visual events are scheduled *backwards* from musical hits
   (a shard/jump/train departs at `t_hit − travel_time`), so impacts land
   frame-perfect on the beat. Nothing is simulated and hoped for.
2. **Determinism** — all randomness is seeded from the extractor's content
   hash. Same exported package → same video, re-renderable forever; changed
   structure or audio → a new deterministic world.

## The concepts

| Doc | Concept | Vibe | Renderer | Effort | Ending artifact |
|---|---|---|---|---|---|
| [ecosystem.md](docs/ecosystem.md) | A valley comes alive; each track is a species | Painterly, natural, emotional | 2.5D parallax WebGL | ●●●○ | Species "credits tableau" |
| [descent.md](docs/descent.md) | One continuous dive to the seafloor | Bioluminescent, cinematic | Three.js | ●●●○ | Seafloor "coral organ" finale |
| [painting.md](docs/painting.md) | The song paints a canvas in timelapse | Fine-art, impressionist | 2D WebGL (stroke FBO) | ●●○○ | The finished painting |
| [storm.md](docs/storm.md) | One storm, birth to rainbow | Dramatic, weather-cinematic | 2.5D layered WebGL | ●●●○ | Rainbow chord end-card |
| [metro-map.md](docs/metro-map.md) | A transit map of the song draws itself | Clean flat design, clever | 2D vector Canvas | ●○○○ | Poster-grade map (PNG/SVG) |
| [city-builder.md](docs/city-builder.md) | A city constructs itself; skyline = the song | Isometric, cozy-epic | Three.js / 2.5D | ●●●○ | Skyline poster |
| [corridor-shooter.md](docs/corridor-shooter.md) | On-rails glide through the inside of the mix | Neon, high-energy FPS ballet | Three.js | ●●●● | Boss title-card explosion |
| [waveform-runner.md](docs/waveform-runner.md) | The playhead as a runner crossing the song | Stylized 2D, kinetic | 2D WebGL parallax | ●●○○ | Cadence gate finish |

## Suggested build order

1. **Extractor contract E0 + shared pipeline P0** — freeze manifest v2 and use
   package fixtures to build and test the analyzer/runtime without waiting for
   REAPER automation.
2. **Extractor E1–E3 + Metro Map M1–M2** — produce the first real aligned
   package, then prove structure and sync with the simplest visualizer. P0 can
   use fixtures before E3, but its real-project demo requires an E3 export.
3. **Finish Metro Map** — validates roles, regions, MIDI, back-solving, export,
   and artifact rendering end to end, and already produces a postable result.
4. **Ecosystem** — the flagship. Reuses the whole spine; effort goes into art
   and the species choreographer.
5. Everything else becomes a new compiler + skin on a proven pipeline.

## Repository layout

```
reaper-viz/
├── README.md / ARCHITECTURE.md
├── extractor/             ← separately installable REAPER companion
├── schemas/               ← versioned package contracts
├── fixtures/ + tests/     ← contract and alignment fixtures
├── tools/                 ← standalone package validation
├── docs/
│   ├── <concept>.md       ← the 8 concept documents
│   └── architecture/      ← data contracts, analyzer, compilers, renderer, export
├── analyzer/              ← Python analyzer foundation: stems → song.json
├── packages/
│   ├── core/              ← implemented schemas, PRNG, musical time, back-solve, palette
│   ├── render/            ← scene runtime, three/pixi backends, export harness
│   └── app/               ← Vite dev app (preview, tuning, render mode)
├── compilers/<concept>/   ← song.json → performance.<concept>.json
├── scenes/<concept>/      ← SceneModule per concept
├── scripts/               ← mux.sh, render-all.sh
└── projects/              ← manifest/report, stems, features, outputs (gitignored)
```

The Reaper/ReaScript extractor is a separately installable companion tool. It
does not share code or runtime state with Vital Vision. Its boundary with this
repo is the versioned
[manifest contract](docs/architecture/data-contracts.md#manifestjson-extractor--analyzer).
