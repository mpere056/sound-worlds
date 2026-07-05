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
and `gate.open` spans. Vocal-like tracks compile to a normalized
`curves.vocalHalo` RMS envelope, with `statics.vocalHaloSource` recording
whether the curve came from vocal RMS or an explicit silent fallback.
Sustained downlifter-like events compile to `float` trajectory spans and
`runner.float` events when they do not collide with jump arcs.

Terrain uses the first available source in this order: bass MIDI, bass pitch,
general MIDI pitch contour, then the master waveform and energy envelope. The
compiler records the chosen source in `statics.terrain.source` so the preview
never implies richer musical input than it actually received. This matters for
keys-only REAPER exports: if MIDI note data exists, the large hills follow that
pitch contour instead of hiding the music inside a smoothed loudness fallback.
The MIDI contour also carries note-onset pulses and master-energy motion so the
route does not become a dead-flat runway while the exported audio tail is still
audibly moving.

Strata use the loudest available track RMS curves, resampled over the runner's
world x-axis, normalized per track, and stored as precomputed `edge`
heightfields under `statics.strata`. The scene renders those edges directly;
it does not invent decorative sine geology.

Jump landings use snare, clap, percussion, kick, budgeted MIDI note starts,
then bar downbeats. Gravity is tempo-scaled and each parabola is solved from
its takeoff and landing heights. The compiler validates terrain clearance at
120 Hz and records any deterministic clearance boost in `statics.jumpReport`.

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

Vocal halo uses the loudest vocal-like track RMS at each frame, normalized
against the vocal performance, then lightly smoothed. Exports with no vocal
role still include a zero-valued halo curve so the scene contract is stable
without pretending the song contains a singer.

Float spans are intentionally conservative until the extractor carries richer
FX labels: the compiler looks for sustained events on downlifter/falling-like
tracks, snaps the span end to the nearest downbeat/end, skips spans that
overlap jumps, and evaluates the lift as a pure function of time. That keeps
slow-motion drift scrub-safe without inventing downlifters in unrelated audio.
