# @reaper-viz/render

Renderer-neutral deterministic runtime shared by preview and frame-stepped
export.

The current foundation includes:

- `RenderClock`: derives timeline time only from frame index and FPS.
- `EventCursor`: sorted instantaneous-event crossings and direct active-span
  queries with backward-seek replay.
- `EventRuntime`: declarative `on` and `during` handler dispatch.
- `eventProgress`: clamped span progress.
- `sampleCamera`: deterministic camera-keyframe interpolation.
- `PixiBackend`: fixed 1080×1920 WebGL drawing buffer, named layers, explicit
  frame rendering, and RGBA pixel extraction.

ThreeBackend, accumulation checkpoints, and the encoded export harness are the
next render phases.
