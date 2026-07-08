# Current implementation status

**Status date:** 2026-07-07

This is the canonical snapshot of what Sound Worlds currently does. The concept
and implementation-plan documents describe the intended destination; this page
records the code that exists now, how it behaves on the first real REAPER
export, what has been verified, and what remains.

## End-to-end path

The working path is:

```text
REAPER project
  -> ReaperViz_Export_Full_Package.lua
  -> manifest.json + export-report.json + stems + master.wav
  -> python -m analyzer <project-directory>
  -> song.json
  -> Waveform Runner, Metro, and/or Painting compiler
  -> performance.runner.json / performance.metro.json / performance.painting.json
  -> Vite preview app + PixiJS scene
  -> deterministic short MP4 or PNG preview
```

The current local reference package is
`projects/untitled-project-6d2e04f7`. Generated project media, analyzed
`song.json`, and compiled performances remain ignored by Git.

That project is useful for fallback and pipeline validation, but it is not a
visual-quality benchmark: it is an 11.056-second, 5-bar export with four
`keys` tracks, no drums, no bass role, no dedicated lead/vocal role, and no
named section structure beyond the analyzer's default whole-song section.
For Metro specifically, it is a valid MIDI sync and line-identity fixture, but
not a valid M4 chorus-ring fixture.

The first one-track Marble sync fixture is
`projects/untitled-project-418cb58f`, a 12.5-second package with one source
stem and one note-bearing MIDI track. It is the current best fixture for testing
whether one hero object can feel attached to the heard notes.

## Milestone matrix

| Area | State | Visual quality | Implemented now | Important remaining work |
|---|---|---|---|---|
| REAPER extractor E0–E4 | Implemented | n/a | Snapshot/full-package Lua actions, aligned native stems and master, MIDI and automation export, checksums, manifest, report, validation | E5 cancellation and analyzer launch |
| Analyzer foundation | Implemented | n/a | Package validation, musical grid and sections, MIDI passthrough, track RMS/centroid/gain, sample-accurate drum onsets, master waveform/energy, schema-valid `song.json` | Pitch/chord analysis, automatic segmentation, HTML report |
| Shared TypeScript core/runtime | Implemented | n/a | Strict loaders, deterministic random streams, musical time, curve sampling, back-solving, palettes, fixtures, frame clock, seek-safe events, camera interpolation | Continue extending shared facilities only as concepts need them |
| Preview/export shell | Implemented foundation | engineering-preview | Project/world discovery, WAV streaming, audio-clock playback, scrub, overlays, tuning, PNG and short H.264 preview export | Full-song orchestration, direct project-output writing, audio mux |
| Painting P3 | Implemented | engineering-preview | Deterministic persistent non-linear compiler and Pixi scene, centered construction rings, whole-canvas glow washes, bass/low-note ripple rings, symmetric note blooms, mirrored rhythm drops/splatters, master-tail stains, dry paint persistence, wet diffusion, cymatic ring scalloping, paper grain, varnish sweep, signature reveal, preview app integration | True accumulation/FBO paint buffer, impasto lighting, anti-mud density budgets, chorus reinforcement repainting, 4x print export, human visual acceptance on a richer reference |
| Marble Music M0-M1.5 | In progress | engineering-preview | `@reaper-viz/compiler-marble`, `@reaper-viz/scene-marble`, `compile:marble`, Three.js app routing, Pixi/Three backend ownership, one-track auto-selection, compiled note impacts/path/tail, authored camera keys, and compiler tests are implemented. `untitled-project-418cb58f` proves the first mostly-successful one-track sync behavior: one marble, exact note impacts, sustain-aware holds, and back-solved travel into the next onset. M1.5 has begun with deterministic physical pose metadata: 3D tangents/normals, arc-length samples, distance-based spin, normalized quaternions, and exact-impact pose tests. `untitled-project-6d2e04f7` compiles to 20 low-track impacts with zero dropped notes and audible-tail resonance | Continue [Marble Music 3D physics-feel](implementation/marble-music-3d-physics-implementation.md): real 3D machine geometry, contact response, target recoil, camera parallax, then dense high-track manual stress review and two-track duet planning |
| Waveform Runner R1 | Implemented | engineering-preview | Monotone `x(t)`, inverse `t(x)`, energy speed, slope-limited terrain, camera keys, stateless Pixi world | Richer bass-derived results need a MIDI/pitch-bearing export and the visual recovery pass |
| Waveform Runner R2 | Implemented | engineering-preview | Budgeted musical landings, tempo-scaled closed-form jumps, clearance validation, deterministic boost fallback, takeoff/landing events | Double-jump mid-impulses, terrain-concession fallback, and beat/character polish |
| Waveform Runner R3 | In progress | engineering-preview | MIDI melody glyphs, honest beat/activity fallback, role-colored exact-pose merge targets, note-timed route platforms, 300 ms beams, six-beam cap, overflow sparkles, merge ripples, section gates with `gate.open` spans, section palette shifts, compiled vocal-halo curve with silent fallback, conservative sustained-downlifter float spans, compiled step events for beat-locked gait, compiled track strata, compiled-camera scene framing, trajectory-sampled trail, palette-sourced background/terrain/runner/ripples, additive glow layers, no in-canvas debug title/status | Authored-song gate/palette/vocal/float acceptance, golden-frame visual verification |
| Waveform Runner R4–R5 | Planned | planned | Design and work orders | Erasure/crumbs/identity, rail, ghost, cadence gate, final export polish |
| Metro M1 | Implemented | engineering-preview | Deterministic MIDI stations, clusters, interchanges, octilinear edges, honest audio-activity fallback | More varied MIDI-bearing real-project validation and map-field presentation polish |
| Metro M2 | Implemented | engineering-preview | Timestamped trains, progressive edge reveal, station blooms, stateless seeking, v5+ sync-readability diagnostics (`lineAudits`, `syncHits`), stronger station/train/label payoff cues | Human audio watch-through on a richer/longer real project |
| Metro M3 | In progress | engineering-preview | Terminal/downbeat labels, screen-pinned legend, monotone frontier camera, compiled viewport anchors, music-locked preview camera, stable corridor offsets, offset train paths, interchange ring sizing, compiler-owned cluster span geometry, init-time edge arc-length tables, cleaner map-field background, no in-canvas debug header, Metro audit overlay, train identity pips, `Cues` tuning, section district bands, v7 master-tail energy pulses, stronger line/station/train glow | Occupancy-specific joint healing, full label-overlap pass, authored-song district/ring visual acceptance, post-audio end-card pullback in export pipeline |
| Metro M4–M5 | Planned | planned | Design and work orders | Chorus rings/laps require repeated authored regions; bridge bypass, polish, night mode, poster/SVG shipping |

Visual quality terms:

- `engineering-preview`: functionally useful, but still has visible debug or
  placeholder presentation and should not be judged against concept art.
- `styled`: the scene uses the intended art direction and palette discipline,
  but still lacks final hero moments or artifact polish.
- `concept-parity`: the implemented scene reads like the concept document on a
  properly authored reference song.

## Implementation history

The main implementation slices currently on `main` are:

| Commit | Slice |
|---|---|
| `deefde3` | Waveform Runner R1 world compiler, scene, app integration, and tests |
| `2200441` | Metro M1 static-map compiler, scene, app integration, and tests |
| `fe048a8` | Metro M2 progressive reveal, trains, blooms, and timing tests |
| `b7944b0` | Runner R2 compiled jump trajectory, scene motion, and tests |
| `2846d53` | Metro M3 labels/camera/cartography slice plus preview dependency repair |
| `e003a07` | Deterministic Metro corridor separation and offset train paths |

The Runner R3 glyph slice documented below is the next source change after
`e003a07`.

## Waveform Runner R3 glyph contract

R3 adds a deterministic compiler stage after the final jump trajectory:

1. Prefer note events from lead, melody, keys, piano, synth, and vocal-like
   tracks.
2. If no usable MIDI exists, create beat-synchronous `audio-activity` glyphs
   using the preferred track RMS (or master energy when necessary). The output
   is explicitly tagged and never presented as inferred pitch.
3. Place each glyph over the terrain at `x(mergeT)`, with pitch or activity
   controlling height.
4. Evaluate the final runner trajectory at `mergeT` and store that exact pose
   as `mergePos`.
5. Back-solve a 300 ms approach beam. At most six beams may overlap; additional
   dense notes become merge sparkles rather than being dropped.
6. Emit one `glyph.merge` event per source event with
   `params.hitT === mergeT`.

The scene evaluates beams and merge ripples directly from the requested time,
so playback and arbitrary scrubbing produce the same frame. Runner performance
output now uses `statics.compilerVersion = 3` and records `glyphs` plus
`glyphSource`.

On `untitled-project-6d2e04f7`, the current MIDI-keyboard path compiles 48
MIDI glyphs and 48 corresponding merge events. Because the project has no
dedicated lead role, those glyphs prove timing/collection behavior but should
not be treated as a finished melody art direction.

## Painting P3 persistent non-linear artifact-canvas contract

Painting is now a first-class compiler/scene path. The P3 implementation is
deliberately a persistent non-linear artifact-canvas slice rather than a full
fluid paint simulator:

1. Compile deterministic paint marks from `song.json` into
   `performance.painting.json`.
2. Do not map time to left-to-right drawing. Time selects phase around a centered
   radial composition.
3. Use sections and track entrances for full-canvas glow fields, not horizontal
   washes.
4. Use bass, or the lowest note-bearing track when no bass role exists, for
   centered ripple rings.
5. Use lead/vocal tracks, or note-bearing musical tracks as a fallback, for
   symmetric note blooms rather than calligraphic ribbons.
6. Use drum/onset roles for mirrored dabs, splatter, stipple, and ripple marks;
   when no drums exist, create rhythm marks from prominent note/onset events so
   keys-only exports still produce texture.
7. Add master-energy tail stains after the last extracted note/onset when the
   rendered master audio still has energy.
8. Treat paint as permanent: wet highlights and diffusion can move/settle, but
   every landed mark keeps a visible dry stain.
9. Render paper grain, wet highlights, a varnish sweep, and a final song-title
   signature in the Pixi scene.

On `untitled-project-6d2e04f7`, the current all-keys export compiles to
Painting performance version 3 with 103 marks: 30 rings, 5 washes, 50 blooms,
16 rhythm drops, 1 glaze, and 1 signature. Five explicit `master-tail` stains
land from 9.64 s through 9.96 s and their wet expansion runs to the 11.056 s
audio end, so the canvas no longer goes inert while the master WAV is still
playing. Every compiled paint mark remains a single-point field/drop/ring/bloom
anchor; the generated performance still contains zero visible path-like ribbon,
terrain, or guide strokes.

## Metro cartography implemented so far

Metro now moves beyond the initial node-graph appearance:

- stations are labeled from MIDI pitch or, for the honest audio fallback, bar
  position;
- terminals and interchanges remain visually prominent;
- the legend is pinned to screen space while geometry follows the compiled
  camera;
- the camera follows a monotone drawing frontier, then eases to a complete
  map fit;
- coincident routes receive deterministic global-rank offsets while retaining
  horizontal, vertical, or 45-degree segments;
- edge lengths are recalculated after offsetting, so trains ride the visible
  route rather than the pre-offset center line;
- interchange rings expand according to the number of member lines.
- after the final extracted MIDI station hit, master-energy tail attacks can
  drive explicit `tailPulses` instead of letting the map go visually silent
  while the rendered audio is still active.

The next Metro slice should continue M3 before moving to chorus rings on the
current export: heal corridor membership transitions and run a complete
tier-0 label-overlap pass. The new sync-readability diagnostics, first-pass
cue strengthening, and section district bands are implemented, but still need
a human audio watch-through and an authored-region reference before the
perceptual gate should be called complete. If a richer reference song with
repeated same-name regions arrives first, M4 can start after the M3
readability/line-identity gate because rings are the Metro identity feature.

## Verification record

The current implementation was verified on 2026-07-07:

- `corepack pnpm check` passed with escalation for the Vite/esbuild build step,
  including the determinism guard, production build, and 78 TypeScript tests
  across 14 files.
- `corepack pnpm --filter @reaper-viz/compiler-marble test` passed 4 Marble
  compiler tests covering exact note-hit mapping, dense-note clustering, and
  path/tail/camera coverage.
- `corepack pnpm --filter @reaper-viz/compiler-painting test` passed 3
  Painting compiler tests covering deterministic output, role fallbacks, and
  event/stroke timing invariants.
- `corepack pnpm --filter @reaper-viz/compiler-runner test` passed 27 Runner
  compiler tests after the jump, motion, terrain, glyph, step, strata, gate,
  section palette, vocal-halo, float-segment, MIDI-contour terrain, and
  MIDI-note landing contracts were added, including energetic audio-tail
  terrain coverage and note-platform coverage.
- `corepack pnpm --filter @reaper-viz/compiler-metro test` passed 16 Metro
  compiler tests after the master-tail pulse regression was added.
- `python -m unittest discover -s tests` passed 12 tests after the analyzer
  S0 fixes.
- `projects/untitled-project-6d2e04f7` analyzed successfully to a 4-track,
  5-bar, 11.056-second `song.json`.
- That export compiled successfully to Runner performance version 3: 48 MIDI
  glyphs, 48 merge events, 48 route note platforms, 16 MIDI-note jumps plus 9
  ground pulses, `midi-contour` terrain, track strata, section palettes, a
  silent vocal halo fallback, no float segments because the export has no sustained
  downlifter-like role, and an empty `gates` array because the export has no
  authored region boundaries. The route tail no longer flattens: the last 40
  terrain samples retain about 3.57 world units of height motion from the
  exported audio energy.
- That export compiled successfully to Metro performance version 7: 4 MIDI
  lines, 40 stations, 42 edges, 48 `syncHits`/note payoffs, 4 `lineAudits`,
  1 default whole-song district band, 3 `tailPulses` at 9.36 s, 9.64 s, and
  10.34 s after the final 8.969 s station hit, 0 audio fallback lines, and a
  constant preview camera zoom of 1.35 through the full 11.056 s audio
  duration. The final poster pullback is now logged as deferred until a
  post-audio end-card hold exists.
- That export compiled successfully to Painting performance version 3: 103
  deterministic paint marks, 260 paper-grain marks, role fallback from four
  `keys` tracks, 30 rings, 5 glow washes, 50 symmetric blooms, 16 mirrored
  rhythm drops, 1 glaze, 5 master-tail stains spanning the post-MIDI audio tail,
  a final `Untitled Project` signature, and zero path-like ribbon/terrain/guide
  marks in the generated performance.
- That export compiled successfully to Marble performance version 1: the
  auto-selector chose the low repeating `keys` track, emitted 20 exact
  `marble.impact` events, dropped 0 notes, produced 0 timing mismatches,
  produced 0 teleport segments, authored note/cluster/final camera keys, and
  added final-target resonance from the 8.832 s final selected note through
  the 11.056 s audio end.
- The existing dev server at `http://127.0.0.1:5173/` responded to the project
  API and reported Marble availability for `untitled-project-6d2e04f7`. A
  follow-up human/browser watch-through should confirm the Marble scene reads as
  synchronized and physical in motion.

S0 math hygiene progress:

- Fixed Metro train dwell so fast runs cannot depart after the next arrival;
  the 60 ms gap vector now dwells for 30 ms and remains a sprint.
- Fixed analyzer bar generation so pure tempo changes do not restart bar
  numbering; bars now segment by time-signature runs.
- Fixed analyzer section generation so partial region coverage is filled with
  `unknown` sections instead of leaving timeline gaps.
- Fixed analyzer drum onset detection so timing comes from sample-domain
  threshold crossings rather than the 20 ms RMS animation curve.
- Added optional per-track `gain` metadata with pre-normalization `peakRms` and
  `meanRms` values.
- Added compiler numeric-audit coverage for Runner gravity/jump vectors,
  constant-energy motion/inverse mapping, bass-MIDI terrain calibration/slope,
  and Metro lane/corridor constants.
- Updated Metro corridor spacing from the accidental 6 px implementation to the
  documented 7 px contract.
- Began the Runner visual-recovery pass by replacing fake straight speed lines
  with a trajectory-sampled history trail; jumps now leave an actual arc-shaped
  trail in scene code.
- Adopted the compiled Runner camera in the scene projection path, added a
  small deterministic land/pulse zoom impulse, and removed in-canvas Runner
  debug title/status text from exported artwork frames.
- Began the Metro visual-recovery pass by removing the in-canvas debug header
  and replacing the heavy rounded dashboard panel with a lighter map-field
  background and faint grid.
- Moved Metro framing out of the scene's zoom-threshold branch and into
  compiled `camera.anchor` keyframes; cluster span geometry now arrives as
  compiler-owned world coordinates instead of scene-side lane math.
- Cached Metro scene line/station/edge lookups and edge arc-length tables at
  scene construction so reveal heads and trains no longer recompute polyline
  segment lengths every frame.
- Runner glyphs now carry their source role through the compiler, and the
  scene colors glyph beams/ripples from `performance.palette.roles` with a
  pitch-class tint instead of the previous hardcoded 12-color wheel.
- Extended Runner palette sourcing across the scene background, stars,
  parallax terrain, strata, surface glow, speed lines, runner body/trail, and
  jump/ground event ripples.
- Added additive Runner glow layers for terrain edges, speed lines, glyph
  beams/ripples, the runner halo/trail, and jump/ground pulses, plus a live
  `Glow` tuning control in the preview app.
- Added compiled `runner.step` events from kick/percussion timing with
  beat-grid fallback, and changed the Runner scene gait phase to use those
  events instead of a free-running sine clock.
- Added compiler-owned Runner strata from track RMS curves and changed the
  scene to render those stratum edge heightfields instead of decorative sine
  ripples. Compiler tests now assert one changed track changes its stratum.
- Added Runner section gates: compiler-owned gate statics at section
  boundaries, `gate.open` spans over the previous bar with `hitT` at the
  boundary, and scene-rendered glowing arch/door graphics with section labels.
- Added section palette variants and `palette.shift` events spanning ±0.5 beat
  around section boundaries; Runner scene color sampling now interpolates all
  palette-derived layers through those shifts.
- Added a compiler-owned Runner vocal halo curve from vocal-like track RMS with
  an explicit silent fallback; the scene samples it as an additive runner aura.
- Added conservative Runner float trajectory spans for sustained
  downlifter-like events, with continuity/no-penetration test coverage and
  scene-rendered FX drift rings/streaks.
- Changed Runner's drumless MIDI fallback so the big visible motion is no
  longer generic: MIDI-rich songs now drive terrain from a MIDI pitch/onset
  contour plus audio-tail energy, and land jumps/pulses on budgeted MIDI note
  starts before falling back to bar downbeats.
- Added explicit Runner note-platform statics and scene rendering so every
  glyph/note timing produces a visible route pad on the terrain, with foot-level
  MIDI impact rings.
- Reworked Painting from the P1 line-heavy artifact canvas into the P3 centered
  cymatic language: construction rings, glow fields, bass/low-note ripples,
  symmetric note blooms, mirrored drops/splatters, master-tail stains, dry paint
  persistence, wet diffusion, cymatic ring scalloping, and renderer support for
  depth-projected fields without compiled path strokes.

Generated performance files are intentionally not committed. The compiler,
tests, scene, app labels, and documentation are the durable source changes.

## Development workflow notes

From the repository root:

```powershell
python -m analyzer projects\your-export
corepack pnpm compile:runner -- projects\your-export
corepack pnpm compile:metro -- projects\your-export
corepack pnpm compile:painting -- projects\your-export
corepack pnpm dev
```

Open `http://127.0.0.1:5173/`. Vite uses `strictPort` on port 5173 so a second
server cannot silently move to another port. If the port is already in use,
use the existing preview or stop the terminal that owns it with `Ctrl+C`
before starting another server.

## Recommended next implementation order

1. Follow the
   [Track-count generator strategy](implementation/track-count-generator-strategy.md):
   do not judge broad all-track worlds from sparse one-/small-track exports.
2. Review Marble Music M0-M1 in the browser, following
   [Marble Music implementation](implementation/marble-music-implementation.md)
   and the
   [Marble Music deep design review](implementation/marble-music-deep-design-review.md).
   The first code slice now exists; the next gate is whether the low-track
   machine reads as synchronized and physical enough without debug overlays.
3. Use
   [the `untitled-project-6d2e04f7` visual brief](implementation/project-brief-untitled-project-6d2e04f7.md)
   as the acceptance fixture: try the low repeating keys track first, then the
   high denser keys track as the dense-note stress case.
4. Only after the one-track marble generator feels good, design Marble Music M2
   for two tracks. Do not return to broad all-track procedural generation until
   the [Marble Music acceptance checklist](implementation/marble-music-acceptance-checklist.md)
   passes for one-track Marble Music and the two-track generator is satisfying.
5. Keep Painting P3 available as an engineering-preview reference, but do not
   keep polishing it blindly without a stronger visual brief.
6. Execute the early
   [Visual Recovery Plan](implementation/visual-recovery-plan.md) items:
   Runner glow/beat-gait/real-strata polish and Metro field/panel cleanup.
7. Keep extending the [Math Audit](implementation/math-audit.md) test battery
   as future-only systems land, especially double-jump, clearance rejection
   vectors, and camera impulse/follow behavior.
8. Verify Runner R3 gates/palettes/vocals/floats on an authored-region,
   vocal-bearing, FX-bearing reference song.
9. Complete Metro M3 joint healing and label overlap handling; run a human
   audio watch-through for the new sync-readability cues and verify districts
   on an authored-region song. Keep the preview camera music-locked until the
   export pipeline adds true post-audio end-card time.
10. Start Metro M4 only on a region-bearing export with repeated same-name
   sections; on `untitled-project-6d2e04f7`, the correct M4 result is no rings.
