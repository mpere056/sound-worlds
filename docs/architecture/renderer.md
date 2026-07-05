# Renderer

TypeScript, in-browser (Vite). One shared runtime (`packages/render`) hosts
per-concept **scene modules** (`scenes/<concept>/`). The same scene code runs in
two modes:

- **Dev mode** — realtime preview with the master WAV playing, a scrub bar,
  beat-flash sync overlay, and Tweakpane parameter panels.
- **Render mode** — no audio, no realtime: frames are stepped `0..N` and handed
  to the export harness ([export.md](export.md)).

The reason one codebase can do both: **scenes are functions of `t`.**

## The core contract

```ts
interface SceneContext {
  backend: ThreeBackend | PixiBackend;   // whichever the scene declares
  performance: Performance;              // validated performance.<concept>.json
  tuning: TuningParams;                  // live-bound in dev, frozen in render
  size: { w: number; h: number };
  rng: Rng;                              // seeded; forkable
}

interface SceneModule {
  backendKind: 'three' | 'pixi';
  init(ctx: SceneContext): Promise<void>;      // build statics, load assets
  renderFrame(t: number): void;                // draw the world AT time t
  renderStill?(t: number, scale: number): void; // hi-res artifact export
  dispose(): void;
}
```

`renderFrame(t)` must produce the same pixels for the same `t` regardless of
what was rendered before — that's what makes scrubbing, preview, and export the
same code path. There is deliberately **no** `update(dt)`.

### Stateless vs. accumulative scenes

Most scenes derive everything from `t` directly (position of a train =
arc-length along its schedule at `t`). Two concepts are inherently
*accumulative* — the Painting's canvas and the Runner's dissolving world carry
history. The contract for those:

- The scene keeps an internal `simulatedUpTo` cursor and an **event replay**
  path: `seek(t)` re-applies all events from a checkpoint ≤ t.
- Checkpoints (FBO snapshots) every N seconds bound replay cost, so dev-mode
  scrubbing stays interactive.
- In render mode frames only ever move forward, so accumulation is free.

## Event runtime (`render/events`)

The shared machinery every scene uses instead of hand-rolling timeline logic:

```ts
const cursor = new EventCursor(performance.events);

// per frame:
for (const e of cursor.instantaneousAt(t)) scene.fire(e);      // t crossed e.t
for (const e of cursor.activeAt(t)) scene.drive(e, progress(e, t)); // spans

// declarative alternative most scenes prefer:
runtime.on('station.bloom', (e, ctx) => { ... });
runtime.during('train.travel', (e, progress01) => { ... });
```

`EventCursor` is seek-safe (binary search on sorted events) — scrubbing
backwards just repositions it. Curves are sampled directly:
`sampleCurve(perf.curves.energy, t)`.

## Backends

**ThreeBackend** (Descent, Corridor, City):

- `WebGLRenderer` with fixed-size drawing buffer (render resolution ≠ CSS size),
  color management on, `preserveDrawingBuffer` **off** (export reads frames
  synchronously after render).
- Shared **post chain** (EffectComposer): bloom, chromatic aberration, vignette,
  film grain — all parameters driven per-frame from events/curves, defaulting to
  0. Scenes request passes; nothing is on by default.
- Camera rig: interprets `performance.camera` keyframes (position, zoom,
  optional normalized viewport anchor, roll + easing), plus a shake bus
  (impulses decay deterministically as `f(t − hitT)`, never via accumulated
  state).
- Asset loading in `init()` only; loaders awaited so render mode never sees a
  half-loaded scene. Instancing helpers for crowds (plankton, drones, windows).

**PixiBackend** (Metro, Painting, Runner, Storm, Ecosystem):

- Pixi v8 WebGL, same fixed-buffer discipline.
- Helpers: layered parallax container, polyline ribbon mesh (terrain, metro
  lines), stamp-into-RenderTexture (the Painting's accumulation buffer, with
  snapshot/restore for checkpoints), additive glow container, vector text.

Both backends expose `readPixelsInto(buffer)` for the export harness and a
`renderAtScale(scale)` path for poster stills.

## Dev harness (`packages/app`)

- **Project/concept picker** reading `projects/` via a tiny Vite dev-server
  plugin (filesystem API), hot-reloads on recompile of a performance file.
- **Transport:** play/pause/scrub. In dev mode the clock is *slaved to the
  audio element* (`audio.currentTime`) so what you hear is exactly what drives
  `renderFrame` — sync issues are visible immediately, not discovered after a
  30-minute export.
- **Sync overlay** (toggle): beat/downbeat flashes from the grid, event
  `hitT` markers, current bar/section readout — the "is it actually on the
  beat" instrument.
- **Tweakpane** panels are generated from each scene's declared `TuningSchema`
  (name, range, default). "Save" writes `tuning.<concept>.json` into the
  project dir; render mode loads the same file. Tuning changes never require
  recompiling.
- **Safe-area guides:** 9:16 frame with TikTok/IG UI overlays (caption zone,
  side icon rail) so compositions avoid platform chrome.

## Determinism in the renderer

- Time enters scene code exclusively as the `t` argument. `Date.now`,
  `performance.now`, and `Math.random` are lint-banned in `scenes/` and
  `render/`.
- Anything "random-looking" at render time (grain, flicker) is a hash of
  `(seed, entityId, floor(t * rate))` — stable per frame, scrub-safe.
- GPU nondeterminism (driver AA differences) is accepted: exports happen on one
  machine; golden-frame tests use perceptual tolerance, not exact equality.

## Performance budget

1080×1920@60 must render *faster* than realtime in render mode on an M-series
Mac. Rules of thumb: instancing for anything > 50 copies, no per-frame
allocation in `renderFrame` (pooled vectors), curves pre-sampled into typed
arrays at init, post chain ≤ 3 passes. Dev mode may drop to 30 fps preview
without affecting export quality — the clock, not the frame rate, is the truth.
