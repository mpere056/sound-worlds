# Waveform Runner compiler

Compile an analyzed project from the repository root:

```powershell
corepack pnpm compile:runner -- projects\your-project
```

The compiler reads `song.json` and atomically writes the ignored
`performance.runner.json`. Output includes deterministic `x(t)` and inverse
`t(x)` curves, smoothed speed and energy curves, slope-limited terrain,
track-derived stratum edge heightfields, closed-form ground/air trajectories,
musical landing events, and camera keys. R3 output also includes deterministic
melody glyphs, exact trajectory merge positions, `glyph.merge` events, and
`runner.step` footfall events. Section boundaries compile to `statics.gates`
and `gate.open` spans.

Terrain uses the first available source in this order: bass MIDI, bass pitch,
then the master waveform and energy envelope. The compiler records the chosen
source in `statics.terrain.source` so the preview never implies richer musical
input than it actually received.

Strata use the loudest available track RMS curves, resampled over the runner's
world x-axis, normalized per track, and stored as precomputed `edge`
heightfields under `statics.strata`. The scene renders those edges directly;
it does not invent decorative sine geology.

Jump landings use snare, clap, percussion, kick, then bar downbeats. Gravity is
tempo-scaled and each parabola is solved from its takeoff and landing heights.
The compiler validates terrain clearance at 120 Hz and records any deterministic
clearance boost in `statics.jumpReport`.

Glyphs prefer MIDI from lead/melody/keys/piano/synth/vocal-like tracks. When
the analyzed export has no usable MIDI, the compiler creates beat-synchronous
`audio-activity` glyphs from track RMS instead of pretending to know pitch.
`statics.glyphSource` records the selected path. Each beam begins 300 ms before
its merge and targets the exact compiled runner pose; at most six collection
beams overlap, with excess notes preserved as synchronized sparkles.

Footfalls prefer compacted kick/percussion events and fall back to the beat
grid when no percussion exists. The scene consumes those `runner.step` events
for beat-locked gait instead of running an independent animation clock.

Gates are emitted for section starts after time zero. Each gate stores the
section name/kind, world position, terrain height, boundary time, and the start
of the previous bar. The matching `gate.open` event spans that previous bar and
carries `params.hitT` equal to the section downbeat.

Section palette variants are stored in `statics.sectionPalettes`.
`palette.shift` events span half a beat before to half a beat after each
section boundary and carry `hitT` at the boundary. The scene samples those
events so every palette-derived layer transitions together.
