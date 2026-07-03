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

Pixi and Three backends, asset loading, accumulation checkpoints, and pixel
readback are the next render phases.
