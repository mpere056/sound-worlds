# Sound Worlds preview app

The Vite preview shell discovers analyzed packages under the ignored
`projects/` directory and opens them without copying audio into source control.

```powershell
python -m analyzer projects\your-export
corepack pnpm compile:runner -- projects\your-export
corepack pnpm compile:metro -- projects\your-export
corepack pnpm dev
```

Then open `http://127.0.0.1:5173/`.

## Current preview features

- Project discovery through a development-only local API.
- Range-enabled master WAV streaming for responsive seeking.
- Audio-clock-driven rendering and millisecond scrub control.
- A world selector that defaults to Waveform Runner when its compiled
  performance is present and keeps unimplemented concepts visibly disabled.
- Waveform Runner R1: deterministic motion, slope-limited waveform terrain,
  parallax layers, and a humanoid ground runner.
- Metro Map M1: a complete static octilinear network with MIDI stations,
  transfers and chord clusters, plus labeled audio-activity fallback lines.
- A separately labeled pipeline test pattern driven by master energy, beats,
  bars, and sections. It is not the Metro Map scene.
- Beat sync flash, platform safe-area overlay, and live Tweakpane controls.
- Three-second deterministic silent MP4 previews and current-frame PNG stills.
- Responsive desktop and narrow-screen layouts.

The app reads `song.json`, `performance.runner.json`, and `master.wav` through
its development-only API. It does not make ignored project exports part of the
Vite bundle or Git repository.
