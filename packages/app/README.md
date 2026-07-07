# Sound Worlds preview app

The Vite preview shell discovers analyzed packages under the ignored
`projects/` directory and opens them without copying audio into source control.

```powershell
python -m analyzer projects\your-export
corepack pnpm compile:runner -- projects\your-export
corepack pnpm compile:metro -- projects\your-export
corepack pnpm compile:painting -- projects\your-export
corepack pnpm dev
```

Then open `http://127.0.0.1:5173/`.

## Current preview features

- Project discovery through a development-only local API.
- Range-enabled master WAV streaming for responsive seeking.
- Audio-clock-driven rendering and millisecond scrub control.
- A world selector that defaults to Waveform Runner when its compiled
  performance is present and keeps unimplemented concepts visibly disabled.
- Waveform Runner R3 (in progress): deterministic motion, slope-limited
  waveform terrain, compiled musical jumps, parallax layers, a humanoid
  runner, exact-time melody/activity glyph collection, note-timed route
  platforms, section gates, compiled strata, beat-locked gait, section palette
  shifts, palette-derived colors, vocal halo rendering, conservative
  downlifter float rendering, and additive glow layers with a live Glow tuning
  control.
- Metro Map M3: a progressively drawn octilinear network with timestamped
  trains, station blooms, terminal/downbeat labels, separated parallel
  corridors, and a frontier-follow camera that pulls back for the complete
  map.
- Painting P2: deterministic non-linear artifact-canvas rendering with paper
  texture, centered construction rings, whole-canvas glow washes, low-note
  ripple rings, symmetric note blooms, mirrored rhythm drops, varnish sweep,
  and final song-title signature.
- A separately labeled pipeline test pattern driven by master energy, beats,
  bars, and sections. It is not the Metro Map scene.
- Beat sync flash, platform safe-area overlay, and live Tweakpane controls.
- Three-second deterministic silent MP4 previews and current-frame PNG stills.
- Responsive desktop and narrow-screen layouts.

The app reads `song.json`, compiled `performance.*.json` files, and
`master.wav` through its development-only API. It does not make ignored project
exports part of the Vite bundle or Git repository.

## Development server troubleshooting

Only one preview server should own port 5173. If Vite reports that the port is
already in use, use the existing preview or stop its terminal with `Ctrl+C`
before running `corepack pnpm dev` again.

If the page is blank and Vite reports an outdated or failed optimized
dependency, stop the server, remove only `node_modules\.vite`, and restart the
dev command. The dependency versions remain locked; this clears generated
prebundle output, not project source.
