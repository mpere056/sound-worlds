# Waveform Runner compiler

Compile an analyzed project from the repository root:

```powershell
corepack pnpm compile:runner -- projects\your-project
```

The compiler reads `song.json` and atomically writes the ignored
`performance.runner.json`. Output includes deterministic `x(t)` and inverse
`t(x)` curves, smoothed speed and energy curves, slope-limited terrain,
closed-form ground/air trajectories, musical landing events, and camera keys.
R3 output also includes deterministic melody glyphs, exact trajectory merge
positions, `glyph.merge` events, and `runner.step` footfall events.

Terrain uses the first available source in this order: bass MIDI, bass pitch,
then the master waveform and energy envelope. The compiler records the chosen
source in `statics.terrain.source` so the preview never implies richer musical
input than it actually received.

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
