# Sound Worlds preview app

The Vite preview shell discovers analyzed packages under the ignored
`projects/` directory and opens them without copying audio into source control.

```powershell
python -m analyzer projects\your-export
corepack pnpm dev
```

Then open `http://127.0.0.1:5173/`.

## Current preview features

- Project discovery through a development-only local API.
- Range-enabled master WAV streaming for responsive seeking.
- Audio-clock-driven rendering and millisecond scrub control.
- A deterministic 1080×1920 PixiJS test-pattern scene driven by real master
  energy, beats, bars, and sections.
- Beat sync flash, platform safe-area overlay, and live Tweakpane controls.
- Three-second deterministic silent MP4 previews and current-frame PNG stills.
- Responsive desktop and narrow-screen layouts.

The app deliberately reads only `song.json` and `master.wav`. It does not make
ignored project exports part of the Vite bundle or Git repository.
