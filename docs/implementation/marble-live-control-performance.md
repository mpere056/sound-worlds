# Marble live-control performance implementation plan

Status: in progress (P0-P3 complete; P4 transitions and P5 live input in progress)

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

## Phase P3 - Persistent Three.js scene and resource pooling (complete)

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

### Implemented slices: persistent renderer and primitive pooling

- `MarbleScene.replacePerformance()` now keeps the WebGL renderer, context,
  Three.js scene, camera, lights, wall, marble, tuning object, and SVG overlay
  alive across validated planner results.
- Performance-owned targets, rods, rails, SVG target nodes, and impact lookups are
  disposed and rebuilt inside the existing scene. Full disposal still occurs
  when leaving Marble Music or switching projects.
- Development snapshots expose a stable renderer identity and performance-update
  count so repeated-change tests can detect accidental renderer recreation.
- In a browser run across 10/80/10 and 45/45/10 plans, renderer identity remained
  `1`, update count advanced from `1` to `2`, and the overlay count remained `1`.
  Scene application measured 8.8-11.7 ms and first render measured 20.3-24.7 ms,
  down from the P1 119 ms first-render baseline.
- Unit box, cylinder, sphere, and circle geometry is shared across target bases,
  hardware, rods, rail ties, and supports. Static hardware, target-color, rod,
  rail, tie, and support materials are cached for the scene lifetime; plan-
  specific route tubes and animated glow/shadow materials remain owned by the
  active performance.
- The browser extreme now applies in 2.2 ms and first-renders in 14.6 ms with 11
  live geometries instead of 54. A subsequent balanced route retained the same
  renderer and 11 geometries, applied in 4.5 ms, and first-rendered in 5.8 ms.
- A 100-update settled-input browser run retained renderer identity `1`, one SVG
  overlay, 7 programs, and 11 geometries. The update counter reached 100, final
  application cost was 1.3 ms, render p95 was 12.7 ms, and frame p95 was 17.1 ms.
  Hidden diagnostics now publish application/first-render p95 plus renderer,
  geometry, and program ranges for repeatable durability checks.
- A fresh enhanced-profiler run across 100 accepted updates measured 1.8 ms
  scene-application p95, 13 ms first-render p95, 12.7 ms render p95, and 17.3 ms
  frame p95. Geometry stayed exactly 11, programs exactly 7, renderer identity
  exactly `1`, and the update counter reached 100.
- The measured gates do not justify further P3 object-pool complexity now.
  Stable target IDs and retained primitives provide the foundation P4 needs;
  route-buffer reuse remains an evidence-triggered optimization if future songs
  introduce rail-heavy application cost.

## Phase P4 - Smooth transform-only route transitions

### Transition policy

Use one visible platform set. Never use opacity, duplicate geometry, or a hidden
transform switch to move between generated maps.

1. Hold transport and marble time at the current song position when a validated
   worker plan arrives.
2. Rigidly align the incoming route to the held marble center.
3. Smoothstep every paired platform's position, shortest-path rotation, collision
   body dimensions, colored carrier, support rod, and generated route rail over
   a displacement-aware 450-1400 ms window.
4. If another slider plan arrives, sample the transforms currently on screen and
   use them as the next transition's starting state.
5. Install the validated incoming physics only after all visible platforms reach
   their destinations, then resume transport automatically when it was playing.
6. Keep scrubbing locked during the brief re-layout so route alignment cannot be
   invalidated halfway through the movement.

### Gate

- Exactly one visible platform group exists per target throughout re-layout.
- Platform opacity never participates in route transition state.
- The marble and audio timeline remain fixed while platforms are moving.
- A repeated slider update starts from the currently displayed transform with no
  reset to an older endpoint.
- Final platform positions, collision bodies, route clearances, and note timings
  come only from the validated incoming compiler plan.
- Backward seeking after re-layout shows the complete active platform set.

### Implemented slice: held transform-only re-layout

- `prepareMarblePerformanceTransition()` samples active and incoming routes at
  the held song time and rigidly translates the incoming path, targets, contact
  points, controls, and camera keys so the marble center is continuous.
- `MarbleScene.transitionPerformance()` stores one old/new target pair per stable
  ID and drives a displacement-aware wall-clock smoothstep. Position, shortest-
  path rotation, base size, marble-relative colored carrier size, and target
  support rods all move continuously. Small corrections use 450 ms; larger
  distance, angle, or carrier changes scale up to a 1400 ms ceiling. No target
  material is cloned and no transition opacity, reveal, ghost, or duplicate
  target group exists.
- The app pauses audio only when it was already playing, renders the held marble
  while the platforms move, disables play/scrub for the bounded re-layout, and
  resumes automatically after the validated plan is installed.
- Continuous slider input retargets from the displayed interpolation state. The
  final plan therefore catches up within the bounded settle window after release
  without snapping back to any intermediate worker result.
- Decorative rails now use pooled cylinder segments instead of disposable tube
  geometry. Stable path IDs interpolate rail samples, ties, collars, and supports
  through the same transition without allocating geometry per frame.
- Tests prove arbitrary-time marble-center alignment, incoming-plan immutability,
  exact easing endpoints/midpoint, shortest-path rotation, all-target ID pairing,
  and displayed-state retargeting.

### Intermediate-overlap routing architecture

Direct endpoint interpolation is not sufficient as the final P4 policy: two
valid non-overlapping layouts can still intersect between endpoints. This must
be solved with the same oriented-box SAT geometry used by the compiler, but the
search must not execute synchronously inside `transitionPerformance()`.

A 2026-07-10 spike tested deterministic radial staging arcs, 3D SAT sampling,
and local conflict repair. Synthetic crossings and compiled extreme mixes could
be made overlap-free, but a sustained 19-platform browser run produced repeated
466-602 ms main-thread tasks and frame maxima up to 975 ms. Precomputing one OBB
per platform/sample improved unit cost but did not meet the browser gate. The
spike was rejected and removed; none of that synchronous search is in the
runtime.

Implement this as a prepared-transition worker stage:

1. Freeze audio and wall-clock platform interpolation at the currently displayed
   transforms, not at an older active endpoint.
2. Serialize flat target transforms and dimensions plus the aligned destination
   into a dedicated transition-routing worker. Do not bundle Three.js objects.
3. Search deterministic waypoint/staging arcs and validate the complete morph
   with precomputed OBBs. Latest request wins and stale routes are discarded.
4. Return flat per-target waypoints and a sampled zero-overlap certificate.
5. Start the visible transform only after the newest certificate arrives. The
   marble remains held during this bounded preparation period.
6. If no route is found within the worker budget, keep the current layout and
   continue searching/coalescing; never fall back to an intersecting visible
   morph.

Worker routing gates:

- Main-thread route preparation and result installation <= 4 ms p95.
- No transition-routing long task on the UI thread.
- Zero SAT overlaps across at least 120 uniformly spaced morph samples for the
  default/extreme mix matrix and direct-swap fixtures.
- Route-worker p95 <= 100 ms for 19 targets and <= 250 ms for the supported
  maximum target count.
- Repeated input while routing activates only the newest certified route.
- Platform position is continuous when a route request supersedes an active
  morph.

### Implemented slice: prepared-transition routing worker

- The app now captures a `MarblePreparedTransition` from the exact displayed
  target, carrier, and rail transforms. Any active morph is frozen at that
  sampled state while audio and marble time remain held.
- A dedicated transition-routing worker receives flat `MarbleTarget` arrays,
  never Three.js objects. It samples oriented target boxes, searches
  deterministic 3D staging arcs, and returns per-target offsets plus a
  120-sample overlap certificate.
- Visible movement starts only when the newest worker result reports zero
  overlaps. An uncertified result holds the current map instead of animating an
  intersecting fallback.
- A superseding request terminates the old routing worker and creates a fresh
  one. This is necessary because a synchronous worker calculation cannot process
  a cancellation message until it returns.
- Unit tests cover a direct platform swap, a compiled vertical-heavy extreme,
  route certification, arc endpoint continuity, and stale-worker termination.
- In a clean 19-platform browser run, 35/20/45 routing took 27.3 ms in the
  worker. A rapid change ending at 60/20/20 took 1,890.7 ms in the worker but
  caused no new main-thread long task: frame p95 stayed 16.8 ms and frame max
  42.7 ms, then the exact final state activated.
- Remaining routing work: reduce difficult-route worker p95 toward 100 ms,
  broaden zero-overlap certification to lateral- and depth-heavy extremes, and
  add a worker timeout/retry policy before enabling webcam input.

### Implemented slice: staged route-search optimization

- Candidate search now uses a 24-sample ranking pass and reserves the 120-sample
  SAT pass for promising candidates and final certification. Local repairs run
  only on the platforms implicated in coarse conflicts.
- The router can emit per-target movement windows, allowing certified temporal
  staggering when spatial arcs alone are insufficient. Target transforms and
  colored carriers use the same local progress window.
- Transition certification now uses a 0.002-unit numerical contact tolerance
  instead of the compiler's 0.025-unit planning cushion. Final generated maps
  keep their larger compiler clearance; the transition worker no longer spends
  seconds routing around near-misses where visible OBBs never touch.
- The previously slow 20/20/60 -> 60/20/20 browser case now plans in 78.3 ms,
  down from 1,890.7 ms, and activates successfully. Frame p95 remained 17 ms
  and frame max 43.6 ms. The same 120-sample zero-contact certificate remains
  required before movement starts.
- Remaining routing work: benchmark a larger mix matrix and long sessions, then
  add the worker timeout/retry policy before webcam input.

## Phase P5 - High-rate control coordinator (in progress)

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

### Implemented slice: continuous validated planning

- Slider changes now use a fixed 100 ms maximum request interval with a trailing
  request instead of a release-style 100 ms debounce. Continuous input therefore
  submits the latest mix at roughly 10 Hz while a final settled value is never
  stranded.
- Raw pointer/input events no longer invalidate valid in-flight work. The planner
  client's request IDs and latest-pending coalescing remain the authority for
  rejecting stale results; project/world changes still invalidate explicitly.
- The newest completed request may become the next safe queued plan even if the
  displayed slider has advanced slightly, allowing the physical world to follow
  progressively instead of waiting for exact desired/planned equality.
- A newly validated plan samples the platform transforms currently visible in an
  existing morph and retargets from those values. Morphing begins at the current
  transport time, avoiding both delayed movement and snap-back during a drag.
- Unit tests cover immediate first submission, fixed-cadence scheduling, and the
  final settled request. In a browser drag of 18 changes spaced 85 ms apart, 16
  distinct validated plans appeared before release, progressing from 20/25/55
  through 20/41/39 while frame p95 remained 16.8 ms.
- Remaining P5 work: desired/planning/active diagnostic state, deadband and
  optional low-latency filtering for noisy gesture input, plus the five-minute
  synthetic stream and final-value catch-up gates.

### Implemented slice: gesture-ready coordinator state

- Percentage compensation now lives in a pure bounded projection function
  rather than the Tweakpane event handler. Direct control of any axis preserves
  the 10-80 range and an exact integer total of 100, including boundary cases.
- A pure input filter provides a 0.75-point default deadband and a configurable
  percentage-per-second slew limit. Slider input remains direct; the filter is
  ready for the future hand adapter without coupling MediaPipe to planning.
- Development profiling publishes separate `desired`, `requested`, `planned`,
  and `active` mixes. The visible profiling status uses the same state so stale
  or lagging stages can be identified during sustained control.
- Coordinator tests cover projection at ordinary and constrained extremes,
  stationary-noise rejection, slew-limited movement, exact totals, and a
  five-minute synthetic 60 Hz stream bounded to roughly 10 planner requests per
  second.
- Remaining P5 work: browser resource/latency gates for the sustained stream,
  final-value catch-up under real worker load, and deciding whether the gesture
  filter requires One Euro velocity adaptation after webcam measurements.

### Implemented slice: visible transform continuity and size bounds

- All targets use one transform-only transition. Every platform remains fully
  visible while position, shortest-path rotation, base size, colored carrier,
  hardware group, and support rod move toward the latest validated plan.
- A new worker result samples the transforms currently displayed by an active
  transition before retargeting. Repeated slider changes therefore preserve
  position continuity instead of restarting from an old map.
- Transport and marble time are held for the 450-1400 ms settle window. The incoming
  path is aligned at that held timestamp, installed only after platform movement
  finishes, and playback resumes automatically when it was previously running.
- The runtime contains no map-transition opacity, duplicate target geometry,
  ghost target, reveal state, or invisible transform switch.
- The final-note fallback now synthesizes an upward rebound velocity. This gives
  the screenshot's 15/26/59 final impact a regular visible target instead of the
  old 0.048 x 0.024 x 0.048 emergency speck.
- Collision pads that must remain tiny in mathematically dense extreme layouts
  are mounted on colored bounded carriers behind the contact surface. Compact
  mechanisms use 0.58 x 0.11 x 0.28 minimum and 0.82 x 0.2 x 0.46 maximum
  carriers; full platforms use 0.68 x 0.12 x 0.32 minimum and 1.35 x 0.28 x
  0.7 maximum carriers. The compact minimum is wider than the 0.56-unit marble,
  so a valid target cannot collapse into a dot beside the ball. Base rendering
  remains capped at the corresponding maximum under tuning.
- The reported 12/78/10 project profile contains 18 compact fallbacks as small
  as 0.024 x 0.0072 x 0.0176. The previous 0.22-unit carrier was therefore also
  smaller than the marble and could disappear in perspective. Browser checks at
  12/78/10 and 5.728 s plus 43/47/10 and 1.381 s now retain clearly colored,
  marble-scale platform faces.
- Backward timeline seeks no longer interact with transition state because the
  re-layout is complete before scrub is unlocked. A slider-change regression
  can settle, advance to 4.0 s, and seek to 1.589 s with the same complete,
  fully opaque active platform set.
- A proposed global route expansion was rejected because it raised marble speed
  to 5.78 world units/s, beyond the proven 3.3 realism ceiling. Bounded carriers
  preserve the exact collision pad and route instead of hiding a physics change.
- Tests cover transform easing, displayed-state retargeting, arbitrary-time path
  alignment, final rebound size, visual carrier bounds, and unchanged collision
  target data.

## Phase P6 - MediaPipe hand-control adapter

### Design

The three percentages have only two independent degrees of freedom because they
must total 100. Expose three direct relative controls, but project every update
back onto the bounded 100% simplex instead of treating the sliders as three
independent values.

Current one-hand mapping:

| Pinch | Controlled percentage | Motion |
| --- | --- | --- |
| Thumb + index fingertip | 3D motion mix | Mirrored horizontal motion controls left/right, vertical motion controls up/down, and palm-scale change controls front/back |
| Thumb + middle fingertip | Camera orbit | Horizontal and vertical motion control yaw/pitch; palm-scale change controls distance while look-at remains locked to the marble |

Each pinch is a relative grab, not an absolute screen coordinate. On index
engagement, capture palm position, palm scale, and the current desired mix. Map
the three simultaneous deltas onto the bounded 100% simplex without sequential
axis bias. On middle engagement, capture the current orbit pose and update only
camera yaw, pitch, and distance; this path never invokes platform planning.

Only one pinch owns control at a time. Determine the active finger from
thumb-tip distance normalized by palm size, require a short stable engagement,
and use separate engage/release thresholds. If two pinches are ambiguous, retain
the current owner or remain disengaged; never alternate controls frame by frame.
Releasing the pinch holds the last stable mix. Tracking loss also holds, then
disengages after a bounded timeout without inventing a final movement.

The camera preview is mirrored for the performer, while landmark coordinates
are normalized explicitly so mirroring cannot reverse the vertical control.
Provide a brief neutral-position and motion-range calibration. Keep gain,
direction, pinch thresholds, and handedness configurable in development rather
than baking one person's hand geometry into the interaction.

Use Hand Landmarker landmarks directly for the first release. The stock Gesture
Recognizer does not provide these three application-specific pinch controls;
distance and joint geometry are simpler to test, calibrate, and tune than a
custom trained gesture classifier. Reconsider a custom model only if real-user
recordings show that geometric recognition cannot meet the false-switch gate.

### Architecture

Keep TypeScript for the application, gesture state machine, filtering, workers,
and slider integration. MediaPipe already executes its model through its web
runtime/WASM, so moving the surrounding control code to C++ would add a second
toolchain without reducing the dominant inference cost.

```text
webcam -> frame sampler -> vision worker -> landmarks
       -> pinch state machine -> relative delta -> bounded mix projection
       -> One Euro filter/deadband -> MarbleMotionInput coordinator
       -> immediate control display + coalesced planner worker
```

Run at most one inference at a time and drop superseded camera frames rather
than queueing them. Start with a 30 FPS, 640x480 camera stream and measure before
raising either value. Use `requestVideoFrameCallback()` when available, transfer
an `ImageBitmap` or `VideoFrame` to the dedicated vision worker, and retain a
portable canvas/image fallback. Close transferred frame resources immediately
after inference. The planner worker remains separate so route compilation can
neither delay hand tracking nor consume its frame queue.

### Work

- Use `@mediapipe/tasks-vision` Hand Landmarker in video mode.
- Run inference in a dedicated vision worker. The official web API's
  `detectForVideo()` is synchronous and otherwise blocks the UI thread.
- Keep the vision worker separate from the planner worker so slow planning does
  not delay hand inference.
- Transfer frames efficiently where supported; do not send camera frames to a
  server.
- Add a pure, unit-tested pinch recognizer using palm-normalized thumb-to-index,
  thumb-to-middle, and thumb-to-ring distances plus finger joint geometry.
- Add an explicit gesture state machine: `idle -> candidate -> engaged ->
  releasing -> idle`, with stable ownership and timestamps.
- Filter the controlling hand coordinate with a One Euro filter. Apply a small
  output deadband and percentage slew limit after mix projection; do not filter
  pinch ownership so heavily that engagement feels delayed.
- Implement bounded mix projection as a shared pure function used by both hand
  input and slider tests.
- Add confidence thresholds, engage/release hysteresis, mirrored preview,
  calibration, handedness selection, and no-hand behavior.
- Map landmarks to the existing `MarbleMotionInput` interface.
- Request camera permission only from an explicit user action.
- Keep camera input local and stop tracks when the adapter is disabled.
- Expose a compact camera status and active-control indicator, but keep the
  webcam preview optional so the marble remains the primary visual.

References:

- [MediaPipe Hand Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)
- [MDN: Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [MDN: `getUserMedia()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN: `requestVideoFrameCallback()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
- [MDN: `VideoFrame`](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame)
- [Three.js: How to update things](https://threejs.org/manual/en/how-to-update-things.html)

### Gate

- Median hand-to-visible-control latency <= 80 ms.
- p95 hand-to-visible-control latency <= 140 ms.
- No main-thread inference long tasks.
- A stationary hand produces no visible platform jitter.
- A pinch engages only after 3 consecutive confident results or 80 ms,
  whichever requires more evidence; release uses independent hysteresis.
- Wrong-control switches during a two-minute scripted gesture fixture: 0.
- Every emitted mix remains within 10-80 per axis and sums exactly to 100.
- A 10% hand movement can be held within 1 percentage point after settling.
- A five-minute hand-control session has no stale plan activation, queue growth,
  renderer recreation, or console errors.
- Camera disable/re-enable and permission denial leave slider control usable.

### Delivery slices

1. Finish P5 diagnostics, filtering hooks, synthetic 60 Hz durability test, and
   intermediate platform-overlap routing before introducing camera input.
2. Add camera lifecycle and a worker benchmark with recorded/synthetic frames;
   no gesture-to-slider behavior yet.
3. Add the pure pinch state machine, bounded mix projection, and prerecorded
   landmark fixtures for all three fingers, ambiguity, and tracking loss.
4. Connect landmarks to the existing coordinator and show active control,
   calibration, and permission/error states.
5. Tune with the actual webcam under stationary, slow, fast, partial-hand,
   crossed-finger, and poor-light conditions; run the latency and five-minute
   resource gates.
6. Only after those gates pass, evaluate two hands, horizontal gestures, or a
   custom recognizer as separate enhancements.

### Implemented slices: pinch controller and webcam worker

- A pure `MarbleHandController` now consumes MediaPipe-shaped 21-point landmark
  arrays without importing or requesting camera access.
- Thumb/index now owns the complete 3D motion mix, while thumb/middle owns camera
  orbit. Pinch distances are normalized by palm width so thresholds do not depend
  directly on camera distance or hand size.
- Engagement requires both three confident frames and 80 ms. Separate engage
  and release thresholds provide hysteresis, while an ambiguity margin prevents
  two nearby fingertips from alternating ownership.
- The fingertip pair selects the control, but filtered palm-center vertical
  movement supplies the value delta. Engagement captures the current mix and
  palm height, so the slider never jumps to an absolute camera coordinate.
- Updates use the existing bounded projection function, retain 10-80 limits,
  and sum exactly to 100. Tracking loss holds ownership for 220 ms before safely
  disengaging.
- Fixtures cover all three mappings, current-value-relative movement, exact
  totals, ambiguous multi-pinches, noisy release hysteresis, and temporary versus
  sustained tracking loss.
- `@mediapipe/tasks-vision` 0.10.35 now runs the Hand Landmarker in a dedicated
  CPU module worker with locally served ESM WASM assets and a float16 model. The
  app starts at 640x480 and
  30 FPS, transfers one `ImageBitmap` at a time, and drops frames while inference
  is busy so camera input cannot build an unbounded queue.
- Camera access requires the explicit Enable camera action. The mirrored preview
  remains compact, all frames stay local, tracks stop on disable/world switch/HMR,
  and an ignored permission prompt restores the control after 12 seconds.
- Worker landmarks feed the pure controller, then the existing bounded
  deadband/slew filter and live coordinator. The Tweakpane values update from the
  same desired mix used by the planner, preserving one control path for mouse and
  hand input.
- The current worker reports inference duration, confidence, handedness, and
  landmarks through a typed protocol. CPU is the conservative first delegate
  because worker GPU support varies across browsers; measure the user's machine
  before considering a GPU/main-thread fallback.
- Palm x/y and apparent hand scale now pass through independent timestamp-aware
  One Euro filters before spatial deltas are calculated. The adaptive cutoff
  suppresses stationary landmark noise while preserving faster intentional
  movement; pinch ownership remains raw and hysteretic so engagement stays crisp.
- Remaining P6 gate: validate successful permission and sustained inference with
  the actual webcam, capture median/p95 hand-to-visible latency, and tune pinch
  thresholds, gain, filtering, and low-light behavior from observed recordings.

### Commit point

Commit and push camera lifecycle, worker inference, geometric recognition,
coordinator integration, and UX/safety states separately. Do not land MediaPipe
as one opaque commit.

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
