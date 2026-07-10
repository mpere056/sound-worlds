# Marble live-control performance implementation plan

Status: in progress (P0-P2 complete; P3 next)

Last updated: 2026-07-10

## Goal

Make Marble Music respond smoothly to continuously changing motion percentages,
including future hand-tracking input, without weakening the guarantees already
earned by the offline compiler:

- exact note-time impacts;
- continuous marble motion;
- collision-safe marble/platform placement;
- no platform intersections;
- deterministic playback and seeking;
- stable camera framing;
- honest requested and measured motion percentages.

The immediate problem is not rendering throughput during ordinary playback. It
is the synchronous control-change path:

```text
slider input
  -> six-pass compile on the UI thread
  -> destroy MarbleScene and WebGLRenderer
  -> recreate meshes, materials, rails, rods, lights, and SVG
  -> render the new route at the current audio time
```

That path cannot support high-rate gesture control. The replacement architecture
must separate immediate visual response from slower collision-safe planning.

## Current measured baseline

Reference project: `untitled-project-418cb58f`, 19 note impacts.

Warm Node compile measurements from 2026-07-10:

| Motion mix | Median compile | Observed range |
| --- | ---: | ---: |
| 20/20/60 | 40 ms | 37-45 ms |
| 10/10/80 | 175 ms | 170-189 ms |
| 45/10/45 | 248 ms | 246-267 ms |
| 10/80/10 | 1,938 ms | 1,911-1,947 ms |

The compiler cost varies sharply by layout because candidate target orientation,
route-clearance, and overlap searches do more work for difficult profiles. The
current app then adds renderer and scene reconstruction cost and garbage
collection pressure.

P0 browser baseline for one 10/80/10 live rebuild in the development preview:

| Measurement | Result |
| --- | ---: |
| Total compile | 5,299 ms |
| Target placement | 5,289 ms |
| Scene replacement | 9.3 ms |
| First render | 115.6 ms |
| Target candidates | 14,451 |
| Route-clearance samples | 8,502,000 |
| Scene objects | 192 |
| Geometries | 118 |
| Draw calls | 185 |

The browser compile is materially slower than the warm Node benchmark, but both
profiles identify the same hot phase and deterministic work explosion. Motion
solving is below 2 ms; target placement accounts for essentially all extreme
compile time.

P0 records equivalent browser measurements for:

- compiler phase timings;
- scene construction and destruction;
- first render after replacement;
- main-thread long tasks;
- frame interval during a slider change;
- `renderer.info` geometries, textures, programs, triangles, and draw calls;
- input-to-visible-response and input-to-validated-route latency.

## Architecture decision

Use two asynchronous loops and one activation boundary:

```text
                  FAST CONTROL LOOP (60 FPS)
slider/gesture -> filtering -> desired mix -> visual interpolation
                                      |
                                      | coalesced requests
                                      v
                 SAFE PLANNER LOOP (worker, latest request wins)
                              compile + validate route
                                      |
                                      v
                    ACTIVATION AT A SAFE FUTURE IMPACT
```

The fast loop must never wait for collision planning. The planner must never
mutate Three.js objects or audio state. The scene must keep one renderer and
apply validated plans through a controlled transition.

### State model

Keep these values distinct:

- `desiredMix`: latest filtered input shown by the controls;
- `requestedMix`: newest mix submitted to the planner;
- `plannedMix`: mix attached to the newest validated performance;
- `activeMix`: route currently controlling the marble;
- `displayMix`: smoothly interpolated visual state;
- `requestId`: monotonically increasing planner generation;
- `activationImpact`: first impact owned by the new route.

This prevents a responsive control from falsely implying that an expensive
physical route has already become active.

## Non-goals

- Do not rewrite the application or renderer in C++.
- Do not make a free-running rigid-body engine the timing authority.
- Do not let MediaPipe call compiler functions directly.
- Do not recompile on every camera frame or hand landmark result.
- Do not interpolate through visibly intersecting platform layouts.
- Do not sacrifice deterministic offline export for live preview smoothness.
- Do not port code to WebAssembly without a measured post-optimization need.

## Performance budgets

These are acceptance targets, not aspirations:

| Metric | Current milestone target |
| --- | ---: |
| Main-thread control handler | <= 2 ms p95 |
| Main-thread validated-plan application | <= 4 ms p95 |
| Playback frame interval while controlling | <= 20 ms p95 |
| Visible control response | <= 50 ms p95 |
| Default 19-note worker compile | <= 50 ms p95 |
| Extreme 19-note worker compile | <= 200 ms p95 |
| Route morph duration | 250-500 ms |
| Stale plan activation | 0 |
| Renderer recreation per control change | 0 |
| Visible marble/target teleport at activation | 0 |
| Console warnings/errors during 5-minute control run | 0 |

The worker removes UI freezes even before the compile budgets are reached. The
compile targets remain important because a gesture controller can otherwise
produce stale results that arrive seconds after the hand has moved elsewhere.

## Phase P0 - Instrumentation and repeatable benchmark (complete)

### Work

- Add named timings around route solving, target candidate generation, platform
  overlap checks, route-clearance checks, path enrichment, validation, scene
  construction, and first render.
- Add `tools/benchmark-marble-live.mjs` with the reference mix matrix above.
- Include cold run, warm median, p95, candidate count, clearance sample count,
  and rejected-candidate count.
- Add browser frame/long-task instrumentation behind a development flag.
- Capture `renderer.info` before and after 100 route changes.
- Record results in the implementation status document.

### Gate

- One command reproduces compiler measurements.
- Browser instrumentation identifies compile, scene construction, and GPU
  resource costs separately.
- Benchmark output is deterministic except for durations.
- No production UI diagnostics are added.

### Commit point

Commit and push instrumentation before changing behavior.

### Implemented result

- `corepack pnpm benchmark:marble-live` runs the reference profile matrix and
  reports warm min/median/p95/max, phase medians, and deterministic work counts.
- Compiler instrumentation uses an injected clock, so deterministic modules do
  not access ambient time and compiled output remains byte-identical.
- `?profileMarble=1` enables hidden browser JSON diagnostics for frame intervals,
  render cost, long tasks, compile phases, scene replacement, first render, and
  Three.js resources without adding production UI.
- The P0 evidence changes P2 priority: target candidate pruning and route
  clearance broad-phase come before motion-solver optimization.

## Phase P1 - Dedicated route-planner worker (complete)

### Work

- Add a module worker owned by the app, not by `MarbleScene`.
- Load and retain the parsed song in the worker once per project.
- Define a versioned message protocol:

```ts
type PlannerRequest = {
  type: "plan";
  requestId: number;
  projectGeneration: number;
  sourceTrackId: string;
  motionMix: MarbleMotionMix;
};

type PlannerResult = {
  type: "planned" | "failed";
  requestId: number;
  projectGeneration: number;
  performance?: MarblePerformance;
  timings?: MarblePlannerTimings;
  error?: string;
};
```

- Keep at most one running request and one latest pending request.
- Discard results whose request or project generation is stale.
- Preserve the currently active valid route when planning fails.
- Ensure project/world switching terminates or resets worker state.
- Keep a synchronous test adapter for compiler unit tests, not for production
  slider handling.

### Gate

- A 10/80/10 request no longer blocks animation or timeline updates despite its
  current high compile time.
- Rapidly issuing 100 mixes activates only the newest valid result.
- Switching projects while a plan is running cannot apply the old project.
- Worker errors leave the previous world usable.
- Determinism and all compiler tests remain green.

### Commit point

Commit and push the worker protocol and non-blocking planner integration.

### Implemented result

- A module worker owns browser-side `compileMarble` work and retains the parsed
  song for the active project generation.
- Structured-cloneable initialize/plan/planned/failed messages carry project
  generations, monotonically increasing request IDs, and optional compile
  profiles.
- The client rejects stale project generations and request IDs; raw control
  input invalidates outstanding requests before the debounced final request.
- Scene activation additionally checks the compiled mix against the current
  desired mix and waits for a short input quiet period.
- A 100-request unit burst activates only request 100.
- In the development browser, 10/80/10 compiled in the worker in 2,254 ms with
  2,384 ms request-to-application latency while the UI maintained a 16.8 ms p95
  frame interval and preserved the 3.500 s timeline position.
- The remaining measured hitch is isolated to scene application: 9.8 ms scene
  replacement plus 119 ms first render. P3 owns that cost, while P2 still owns
  the 14,451-candidate target-placement compile.

## Phase P2 - Incremental and warm-started compiler (complete)

### Work

Use P0 evidence to optimize the actual hot phases. Expected work, in priority
order:

1. Cache the song/default baseline used by the trajectory-budget solver.
2. Warm-start physical parameters and route choices from the previous valid mix.
3. Add an adaptive solver stop when all measured axes are within tolerance;
   keep six passes only as a maximum.
4. Replan only impacts at or after the selected activation boundary.
5. Reuse route-sample storage with typed arrays.
6. Add broad-phase AABBs or a spatial hash before expensive OBB/SAT and
   target-route clearance checks.
7. Cache invariant target variants, rotations, dimensions, and material choices.
8. Coalesce nearby requested mixes to a configurable planning precision, while
   preserving exact values for the final settled request.
9. Investigate continuous swept route/OBB rejection if profiling shows 120 Hz
   point sampling dominates cost; do not replace the proven check speculatively.

Interactive and settled planning may use different schedules:

- moving input: warm-started, latest-only planning;
- input idle for 150-250 ms: full 120 Hz validation and exact percentage audit.

An interactive result must still satisfy collision safety. Lower validation
quality is not an acceptable way to hit the budget.

### Gate

- Default reference compile is <= 50 ms p95.
- Every allowed extreme reference mix is <= 200 ms p95.
- Motion solving remains <= 2 ms and is no longer a material part of request latency.
- Requested versus actual mix remains within the existing tolerance.
- Exact impacts, route clearance, target overlap, and deterministic output stay
  green for all profile fixtures.

### Commit point

Commit and push each independently measurable optimization; do not combine all
compiler changes into one difficult-to-review commit.

### Implemented result

- Route samples are indexed in a deterministic 3D spatial hash, so target
  clearance checks inspect only cells intersecting the target's enclosing
  sphere instead of scanning the full song route.
- Orientation feasibility is calculated once per note. Candidate search uses an
  adaptive fast path, then preflights the smallest contained platform before
  evaluating a scale family; if that platform cannot fit, all larger members of
  the family are safely skipped.
- Route rejection stops at the first sample below the clearance threshold. The
  rare no-fit path still performs an exact minimum-clearance comparison before
  choosing its deterministic fallback.
- The existing six-pass trajectory solver remains in place because profiling
  measures it below 1 ms for the reference extremes. Warm-start and adaptive
  iteration would add state and determinism risk without addressing a current
  bottleneck.
- In 12 warm Node runs, default 20/20/60 compiles at 20.6 ms median and 33.2 ms
  p95. Extreme 10/80/10 compiles at 92.2 ms median and 105.8 ms p95, down from
  1,938 ms median before P2.
- The extreme profile now evaluates 3,207 candidates and 142,961 clearance
  samples, down from 14,451 candidates and 8,502,000 samples. All existing
  exact-impact, 120 Hz route-clearance, target-overlap, motion-mix, and
  determinism tests remain green.

## Phase P3 - Persistent Three.js scene and resource pooling

### Work

- Keep one `WebGLRenderer`, scene, camera, light rig, wall, marble, SVG overlay,
  and material library for the lifetime of the Marble concept.
- Replace `destroy -> new MarbleScene` with a scene API such as:

```ts
preparePerformance(performance: MarblePerformance): PreparedMarblePlan;
queuePerformance(plan: PreparedMarblePlan, transition: RouteTransition): void;
```

- Pool target mesh groups by stable target ID and hardware kind.
- Share immutable geometry and materials where dimensions permit; use transforms
  for size and orientation.
- Preallocate rail/rod `BufferGeometry` capacity and update attribute contents
  plus draw ranges rather than recreating buffers.
- Keep old and incoming route data in CPU-side double buffers.
- Dispose pooled resources only when leaving Marble Music or loading an
  incompatible project, not for each motion change.
- Add development assertions for one SVG overlay and one renderer.

### Gate

- Renderer identity remains constant through 100 motion changes.
- Geometry/program counts remain bounded after 100 changes.
- Applying a prepared plan costs <= 4 ms p95 on the main thread.
- No duplicate overlays, lights, event handlers, meshes, or audio elements.
- Project/world switching still releases resources correctly.

### Commit point

Commit and push persistent renderer ownership first, then mesh/geometry pooling.

## Phase P4 - Smooth, collision-aware route transitions

### Transition policy

Do not replace the marble's current flight in midair.

1. Freeze the active route through the current impact interval.
2. Choose the next feasible impact as `activationImpact`.
3. Keep the current target and any already-played targets unchanged.
4. Morph future targets over 250-500 ms with smoothstep position/scale and
   quaternion slerp rotation.
5. Activate the new marble path exactly at the agreed impact.
6. If a safe transition cannot be proven, defer by one impact.

### Work

- Key targets by note index/target ID so old and new plans pair deterministically.
- Add old/new transforms and transition timing to pooled target state.
- Morph only targets sufficiently ahead of the marble.
- Validate intermediate target OBBs at transition samples.
- Stagger or defer individual targets whose straight transform path intersects
  another platform or the active marble corridor.
- Rebuild rails into the inactive buffer, then crossfade or reveal them without
  resizing the layout.
- Preserve camera continuity using the existing weighted pose sampler and blend
  old/new camera focus over the same transition window.
- If activation requires different current pose/velocity, compile a bounded
  Hermite/ballistic bridge from the active impact to a future new target and run
  the same clearance checks over it.

### Gate

- No marble position jump greater than 0.02 world units at activation.
- No camera position jump greater than the existing continuity threshold.
- No target intersections at sampled transition states.
- The marble never intersects a transitioning platform.
- The next activated impact still occurs at the exact note time.
- Scrubbing remains deterministic; live transition state is not serialized into
  offline export unless explicitly designed later.

### Commit point

Commit and push target morphing, route activation, and bridge validation as
separate slices with visual evidence for each.

## Phase P5 - High-rate control coordinator

### Work

- Decouple Tweakpane values from active physics values using the state model.
- Apply a low-latency filter, deadband, and percentage slew limit.
- Update displayed controls and the visual proxy at 60 FPS.
- Submit planner requests at a bounded cadence, initially 8-12 Hz maximum.
- Submit immediately after input becomes idle so the exact final value is not
  lost to quantization.
- Expose desired, planning, and active states to development diagnostics.
- Add adapters behind one interface:

```ts
interface MarbleMotionInput {
  start(onMix: (mix: MarbleMotionMix, timestamp: number) => void): Promise<void>;
  stop(): void;
}
```

- Keep slider input as the first adapter and test oracle.

### Gate

- Continuous synthetic input for five minutes causes no unbounded queue,
  allocation growth, or stale activation.
- The control moves immediately even if planning is still running.
- Active route catches the final desired value after input settles.
- Audio time remains monotonic and playback has no audible pause.

### Commit point

Commit and push the coordinator before adding camera access or MediaPipe.

## Phase P6 - MediaPipe hand-control adapter

### Design

The three percentages have only two independent degrees of freedom because they
must total 100. Represent them as barycentric coordinates inside a triangular
control surface rather than trying to infer three unrelated hand dimensions.

Suggested first mapping:

- index fingertip/palm horizontal motion selects lateral versus depth emphasis;
- vertical motion selects vertical emphasis;
- the triangle conversion produces all three percentages summing to 100;
- pinch engages control;
- open hand releases and holds the last stable mix;
- loss of tracking holds the last value and times out safely;
- optional second-hand gestures switch mapping modes only after the one-hand
  interaction is accepted.

### Work

- Use `@mediapipe/tasks-vision` Hand Landmarker in video mode.
- Run inference in a dedicated vision worker. The official web API's
  `detectForVideo()` is synchronous and otherwise blocks the UI thread.
- Keep the vision worker separate from the planner worker so slow planning does
  not delay hand inference.
- Transfer frames efficiently where supported; do not send camera frames to a
  server.
- Filter landmark noise with a One Euro filter or equivalent low-latency filter.
- Add confidence thresholds, hysteresis, mirroring, calibration, and no-hand
  behavior.
- Map landmarks to the existing `MarbleMotionInput` interface.
- Request camera permission only from an explicit user action.
- Keep camera input local and stop tracks when the adapter is disabled.

References:

- [MediaPipe Hand Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [MDN: Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [Three.js: How to update things](https://threejs.org/manual/en/how-to-update-things.html)

### Gate

- Median hand-to-visible-control latency <= 80 ms.
- p95 hand-to-visible-control latency <= 140 ms.
- No main-thread inference long tasks.
- A stationary hand produces no visible platform jitter.
- A five-minute hand-control session has no stale plan activation, queue growth,
  renderer recreation, or console errors.
- Camera disable/re-enable and permission denial leave slider control usable.

### Commit point

Commit and push the worker-based detector, then gesture mapping, then UX/safety
states. Do not land MediaPipe as one opaque commit.

## Phase P7 - C++/Rust WebAssembly decision gate

C++ or Rust is not rejected forever. It is deferred until the TypeScript worker
and algorithmic work are measured.

Consider a WebAssembly numeric kernel only if all are true:

- P1-P3 are complete;
- the current 19-note default still exceeds 50 ms p95 or extremes exceed 200 ms;
- profiling attributes at least 70% of worker time to numeric route/collision
  loops rather than allocation, candidate explosion, or serialization;
- the expected song scale justifies the maintenance cost;
- a prototype demonstrates a material end-to-end gain including data transfer.

If the gate opens, port only flat numeric kernels such as route sampling,
sphere/OBB clearance, SAT projection, and candidate scoring. Keep TypeScript for
song selection, worker orchestration, Three.js, UI, MediaPipe integration,
testing, and plan activation.

### WASM acceptance requirements

- TypeScript and WASM implementations pass the same golden fixtures.
- Requested/actual percentages and exact impacts remain equivalent.
- No browser-specific nondeterminism is introduced.
- Transfer/serialization cost is included in benchmarks.
- A non-WASM fallback remains available until browser support and deployment are
  proven.

## Test matrix

Run every phase against:

- mixes: 20/20/60, 10/10/80, 45/10/45, 10/80/10, and rapid random valid mixes;
- states: paused, playing, scrubbing, song end, project switch, world switch;
- timing: sparse notes, dense clusters, same-time notes, long gaps, audible tail;
- transitions: request during flight, at impact, near final note, and while a
  previous plan is still running;
- input: mouse slider, keyboard slider, synthetic 60 Hz stream, no hand, noisy
  hand, tracking loss, camera denial;
- viewports: reference portrait stage plus desktop and narrow mobile shell;
- resources: renderer/program/geometry counts before and after 100 and 1,000
  requests;
- determinism: repeated compile bytes and exact pose at every impact.

## Rollout order

Implement in this order:

1. P0 instrumentation.
2. P1 planner worker.
3. P2 warm-start/incremental compiler optimization.
4. P3 persistent scene and pooling.
5. P4 safe route morphing.
6. P5 high-rate control coordinator.
7. P6 MediaPipe adapter.
8. P7 WASM decision only if the measured gate opens.

Do not begin MediaPipe before P1, P3, and P5. Hand tracking would only amplify
the existing freeze by producing input faster than the app can safely consume.

## Definition of done

This plan is complete when:

- dragging sliders or moving a tracked hand never freezes playback;
- controls respond immediately and the physical world catches up smoothly;
- only the newest desired mix can become active;
- the marble continues its current flight and changes route at a safe impact;
- targets, rails, camera, and marble transition without visible teleportation;
- exact musical arrivals and collision guarantees remain proven;
- one renderer and bounded pooled resources survive long sessions;
- MediaPipe runs off the UI thread with measured latency and stable filtering;
- profiling shows that TypeScript/worker performance meets the budgets, or the
  WASM decision gate has been evaluated with evidence.
