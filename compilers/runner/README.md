# Waveform Runner compiler

Compile an analyzed project from the repository root:

```powershell
corepack pnpm compile:runner -- projects\your-project
```

The compiler reads `song.json` and atomically writes the ignored
`performance.runner.json`. Output includes deterministic `x(t)` and inverse
`t(x)` curves, smoothed speed and energy curves, slope-limited terrain, a
ground-only trajectory, and camera keys.

Terrain uses the first available source in this order: bass MIDI, bass pitch,
then the master waveform and energy envelope. The compiler records the chosen
source in `statics.terrain.source` so the preview never implies richer musical
input than it actually received.
