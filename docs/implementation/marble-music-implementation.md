# Marble Music implementation plan

Marble Music is the first track-count-specific generator. Its job is not to
make every exported song work. Its job is to make a **single note-bearing track**
feel physically, obviously, satisfyingly synchronized.

The initial target is one track only. Do not generalize to two tracks or larger
arrangements until the one-track machine passes the acceptance checklist.

For the reasoning behind these choices, read the
[Marble Music deep design review](marble-music-deep-design-review.md) alongside
this implementation plan. Also read the project-wide
[music visualization sync principles](music-visualization-sync-principles.md);
the first Marble Music breakthrough established that exact hit timestamps are
not enough unless the object also behaves musically between hits. The next
renderer/motion work order is
[Marble Music 3D physics-feel implementation](marble-music-3d-physics-implementation.md).

## Current implementation slice

As of 2026-07-09, the first implementation slice exists:

- `@reaper-viz/compiler-marble` compiles `song.json` to
  `performance.marble.json`;
- `@reaper-viz/scene-marble` renders a minimal Three.js wall machine;
- the preview app discovers `performance.marble.json` and can mount Marble
  without reusing the Pixi backend;
- existing Pixi scenes declare `backendKind: "pixi"` and Marble declares
  `backendKind: "three"`;
- camera keys are compiler-authored from the selected impacts, dense clusters,
  and final settle, and the Three.js scene samples those keys directly;
- `compile:marble -- projects\untitled-project-6d2e04f7` emits 20 low-track
  impacts, 0 dropped notes, 0 timing mismatches, 0 teleport segments, and a
  final tail resonance span.
- the new one-track package `projects\untitled-project-418cb58f` compiles to
  one-marble motion where note impacts remain exact and every adjacent pair is
  joined by a continuous full-interval trajectory with no stationary hold.

This is an engineering-preview slice. It proves the compiler/app/Three.js path,
but it does not yet satisfy the final aesthetic or human sync-readability gate.

## North-star behavior

When the source track plays a note, the marble visibly hits something at that
exact moment.

Everything else exists to support that:

- the machine is a tactile Three.js wall sculpture;
- timing is compiled, not hoped-for through runtime physics;
- close notes become rattles, rolls, and cascades;
- long gaps become visible travel, camera motion, or held resonance;
- the final audio tail remains visually alive through glow, wobble, and decay.

If the viewer cannot connect heard notes to visible impacts without reading an
overlay, the implementation is not done.

The important 2026-07-09 sync finding is that impacts can be numerically exact
while the motion still feels wrong. Holding the marble for most of a note gap
and compressing travel into the final fraction of the interval reads as a
teleport. For one-note-at-a-time tracks, the correct lifecycle is:

```text
land exactly on note onset
let the struck target resonate independently
continue moving immediately through the full note interval
arrive exactly on the next note onset
```

## Scope

### In for the one-track slice

- `@reaper-viz/compiler-marble`;
- `@reaper-viz/scene-marble`;
- a `performance.marble.json` contract;
- a one-track automatic selector plus manual override path;
- deterministic marble targets, path segments, impact events, and camera keys;
- a Three.js renderer mounted by the preview app;
- exact note-hit timing;
- dense-note grouping;
- tail resonance after the final note when the master audio still has energy;
- compiler tests for timing, determinism, dense clusters, and path continuity;
- a human watch-through checklist.

### Out for the one-track slice

- full-song role inference;
- multi-track arrangements;
- real physics as the timing authority;
- Blender-authored assets;
- physically perfect collision simulation;
- final cinematic post-processing;
- export/audio mux polish beyond existing app support.

## Package layout

Use the existing workspace pattern:

```text
compilers/marble/
  package.json
  tsconfig.json
  src/
    cli.ts
    index.ts
    types.ts
    select-track.ts
    metrics.ts
    clusters.ts
    layout.ts
    path.ts
    camera.ts
    tail.ts
    validate.ts
    *.test.ts

scenes/marble/
  package.json
  tsconfig.json
  src/
    index.ts
    MarbleScene.ts
    three-backend.ts
    materials.ts
    geometry.ts
    sampling.ts
```

Root scripts should mirror the existing concepts:

```json
{
  "compile:marble": "corepack pnpm --filter @reaper-viz/compiler-marble build && corepack pnpm --filter @reaper-viz/compiler-marble compile"
}
```

The preview app should depend on `@reaper-viz/scene-marble` and expose
`Marble Music` in the concept picker once a `performance.marble.json` exists.

## Performance data contract

The exact TypeScript may evolve, but these concepts should remain stable.

```ts
interface MarblePerformance extends Performance {
  concept: "marble";
  statics: {
    compilerVersion: 3;
    source: MarbleSource;
    metrics: MarbleTrackMetrics;
    targets: MarbleTarget[];
    path: MarblePathSegment[];
    clusters: MarbleCluster[];
    tail: MarbleTail;
    diagnostics: MarbleDiagnostics;
  };
}

interface MarbleSource {
  trackId: string;
  trackName: string;
  role: string;
  selectionMode: "auto" | "manual";
  noteCount: number;
}

interface MarbleTrackMetrics {
  firstNoteT: number;
  lastNoteT: number;
  pitchMin: number;
  pitchMax: number;
  pitchRange: number;
  velocityMin: number;
  velocityMax: number;
  gapMin: number | null;
  gapMedian: number | null;
  gapMean: number | null;
  gapMax: number | null;
  denseClusterCount: number;
}

interface MarbleTarget {
  id: string;
  kind: "plate" | "peg" | "chime" | "resonator" | "gate";
  pitch: number;
  pitchClass: number;
  pos: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
  color: string;
  material: "painted-metal" | "brass" | "glass" | "rubber" | "glow";
  familyId: string;
}

interface MarbleImpact {
  id: string;
  noteIndex: number;
  t: number;
  pitch: number;
  velocity: number;
  duration: number;
  targetId: string;
  clusterId?: string;
}

interface MarbleCluster {
  id: string;
  kind: "single" | "rattle" | "cascade" | "roll";
  noteIndices: number[];
  t0: number;
  t1: number;
  targetIds: string[];
}

interface MarblePathSegment {
  id: string;
  t0: number;
  t1: number;
  from: [number, number, number];
  to: [number, number, number];
  kind: "spawn" | "drop" | "rail" | "arc" | "rattle" | "cascade" | "hold" | "settle";
  easing: "linear" | "smoothstep" | "easeIn" | "easeOut" | "ballistic";
  control?: [number, number, number];
  targetId?: string;
  clusterId?: string;
}

interface MarbleTail {
  audioEndT: number;
  finalNoteT: number;
  hasAudibleTail: boolean;
  resonanceTargets: string[];
}

interface MarbleDiagnostics {
  droppedNotes: number;
  timingMismatches: number;
  teleportSegments: number;
  impossibleGaps: Array<{ noteIndex: number; gap: number; resolution: string }>;
  compileLog: string[];
}
```

Events should include at least:

```ts
{ type: "marble.impact", t: note.t, params: { hitT: note.t, targetId, noteIndex } }
{ type: "marble.cluster", t, tEnd, params: { clusterId, kind } }
{ type: "marble.tail", t, tEnd, params: { targetIds } }
```

Invariant: for every selected note, either one `marble.impact` exists with
`params.hitT === note.t`, or the note belongs to a cluster that contains a
visible hit at that note time.

## Timing model

Marble Music must use a compiled kinematic path, not runtime physics.

The compiler owns:

1. note selection;
2. target assignment;
3. target placement;
4. path timing;
5. impact events;
6. camera keys.

The scene owns:

1. sampling the compiled path at time `t`;
2. drawing the marble at the sampled position;
3. activating targets from compiled events;
4. lighting, wobble, glow, and material response.

The scene must not advance a physics simulation with `dt` and hope the marble
arrives. Scrubbing to time `t` must produce the same frame as playing to time
`t`.

### Continuous impact-to-impact path timing

The compiler treats each note onset as a collision deadline. Source duration
may control target resonance, but it must not pin the hero marble in place. For
each pair of notes:

1. place the marble exactly at the current target on the current note onset;
2. launch the next path segment at that same onset;
3. use the entire interval for rail motion, a gravity-shaped arc, or a compact
   dense-note mechanism;
4. arrive exactly on `nextHitT` without a zero-velocity easing stop.

Dense passages should become local rattle/cascade mechanisms instead of
impossible large jumps. A delayed first note receives a compiled accelerating
drop so the marble enters the world before the first impact rather than
appearing on its target.

### Frame-accuracy detail

The source note time is continuous seconds, while preview/export frames land on
`n / fps`. Therefore the visual response must be a short envelope centered on
`hitT`, not a single boolean frame.

Rules:

- the marble pose must be exactly at the target at `t === hitT`;
- the impact envelope should peak at `hitT`;
- the envelope should be visible for roughly `80-180 ms`, depending on velocity;
- a rendered 60 fps frame is accepted when its sampled time is within half a
  frame of `hitT` and the impact envelope is visibly active;
- tests should compare source note times to event `hitT`, not to rounded frame
  indices.

This prevents false sync bugs caused by expecting a continuous note time to
always equal an exact 60 fps frame boundary.

## Track selection

The first implementation can auto-select a track, but the architecture must
allow manual override later.

Recommended auto-score:

```text
score =
  noteCountScore
  * pitchRangeScore
  * densityScore
  * durationCoverageScore
  * roleConfidenceScore
```

Guidelines:

- prefer 8-80 notes for the first one-track machine;
- prefer pitch ranges wide enough to create shape, but not so wide that the
  machine becomes scattered;
- penalize tracks where most gaps are below 90 ms unless dense handling is the
  explicit test;
- prefer MIDI/note-bearing tracks over audio-only fallback;
- do not pretend a keys-only export has drums/bass/lead roles.

For `untitled-project-6d2e04f7`, start with the low repeating keys track, then
use the high keys track as the dense-cluster stress test.

## Compiler pipeline

### 1. Load and validate source notes

- Read `song.json`.
- Choose one source track.
- Sort notes by start time, then pitch.
- Normalize velocity to `0..1`.
- Reject or log empty tracks.

### 2. Compute metrics

Compute:

- note count;
- first/last note time;
- pitch min/max/range;
- velocity min/max;
- min/median/mean/max gaps;
- repeated pitch and pitch-class counts;
- dense cluster count;
- master-audio tail after final note.

These metrics should be saved into `statics.metrics` so the preview/debug UI can
explain what the compiler chose.

### 3. Classify gaps and clusters

Use these first thresholds:

| Gap | Class | Visual treatment |
|---:|---|---|
| `< 90 ms` | rattle | same local object, rapid peg/chime flashes |
| `90-220 ms` | cascade | tight stepped peg/plate sequence |
| `220-700 ms` | normal | rail, short arc, or drop |
| `> 700 ms` | cinematic | full-interval gravity arc, camera drift, visible setup |

Dense notes are not a failure. They are an instruction to design a mechanism
that can visibly articulate them.

### 4. Place target families

Target placement should read as a physical wall sculpture, not a chart.

Rules:

- time generally progresses downward and/or around a central route;
- pitch controls vertical/lateral offset within a bounded wall area;
- repeated pitches reuse nearby `familyId` positions;
- pitch class can choose material/color family;
- low pitches should feel heavier/larger;
- high pitches can use smaller/brighter targets;
- dense clusters should become compact arrays, not spread-out zigzags.

The compiler may use a deterministic relaxation pass to avoid overlaps, but it
must preserve note order and readable route flow.

### 5. Back-solve path segments

For each note or cluster:

- the segment ending at the target must end at the note hit time;
- `segment.t1` must equal the impact time for that target;
- segment lengths must be plausible for the available gap;
- impossible transitions must be converted into compact rattle/cascade logic,
  never teleportation.

Path sampling must be pure:

```ts
sampleMarblePath(performance.statics.path, t): MarblePose
```

No result may depend on previous frames.

Recommended path-solver constraints:

- `t0 < t1` for every moving segment;
- adjacent segments must connect within a small epsilon, e.g. `0.001` world
  units;
- long travel should prefer rails/arcs over sudden straight-line interpolation;
- extremely short gaps should collapse into local mechanisms, not high-speed
  travel;
- each impossible transition should be logged in `diagnostics.impossibleGaps`
  with the fallback that resolved it;
- the final generated path should cover `0..song.meta.durationSec`, including
  spawn and tail settle segments.

### 6. Compile camera

The first camera can be simple but must be authored by the compiler and sampled
by the scene as part of the performance contract:

- close enough to see contact;
- wide enough to understand the next few targets;
- deterministic follow on the marble;
- brief hit emphasis on important notes or clusters;
- no frantic cuts for dense passages;
- final settle frames the completed sculpture while the audio tail decays.

The current implementation creates keys from the first selected impact, dense
cluster starts, regular note groups, the final selected impact, and the audio
end. This is still an engineering-preview camera, but it establishes the
important rule: camera motion is compiled from song/target timing rather than
free-running in the renderer.

### 7. Compile tail resonance

If the master audio continues after the final selected note:

- keep the final resonators glowing or wobbling;
- add slow plate decay;
- let the marble settle or roll gently;
- do not create fake new impacts unless backed by master energy/onsets.

This solves the recurring problem where visuals go inert while music is still
audible.

## Three.js renderer plan

### M0 renderer foundation

The repo is currently Pixi-first in implemented scenes. Marble Music should add
Three.js deliberately.

The current preview app creates a `PixiBackend` singleton and all implemented
scenes use that backend. Marble Music must not be squeezed into that shape by
pretending to be Pixi. The app needs an explicit backend boundary.

M0 tasks:

1. Add `three` to the scene/app dependency path.
2. Create `@reaper-viz/scene-marble`.
3. Refactor the app's active backend ownership so it can mount either Pixi or
   Three scenes.
4. Add a minimal Three.js canvas mount that supports:
   - create;
   - resize;
   - render frame at time `t`;
   - dispose.
5. Destroy or release the previous backend before switching backend families.
6. Prevent WebGL leaks when switching between concepts.
7. Keep Pixi scenes unchanged except for app routing.

If a reusable `ThreeBackend` is quick and clean, build it in `packages/render`.
If that would slow the first slice down, start with a scene-local backend and
extract it later.

Minimum app contract:

```ts
interface ActiveScene {
  tuning: object;
  renderFrame(t: number): void;
  destroy(): void;
  backendKind: "pixi" | "three";
}
```

The implementation may choose a stronger shape, but backend ownership must be
explicit. Otherwise concept switching will leak WebGL contexts or try to reuse a
Pixi renderer for a Three.js scene.

### M2 scene geometry

First slice geometry can be primitive but must be composed well:

- wall plane with subtle rough texture/noise;
- colored impact plates from boxes;
- rods/pegs from cylinders;
- chimes/resonators from cylinders/boxes;
- marble from sphere geometry;
- contact shadows or shadow-like dark ellipses;
- small screws/brackets to make the machine feel mounted;
- glow planes or emissive materials for note response.

Avoid:

- flat 2D plotting;
- left-to-right graph layout;
- abstract dots with no physical target;
- decorative effects that are not tied to notes.

### Material direction

Start with a small palette:

- matte dark wall or painted board;
- brass/painted metal plates;
- black or chrome rods;
- glassy marble with a colored internal swirl;
- cyan/magenta/amber accent glow by pitch family.

The marble should be the hero object. It needs visible spin/shine even before
post-processing exists.

### Renderer sampling

Every frame:

1. sample path segment for marble pose;
2. sample camera keys;
3. compute active impacts/clusters/tail spans from absolute time;
4. set target transforms/material intensity from event age;
5. render.

No per-frame allocation-heavy rebuilds. Static geometry should be created in
`init`; frame work should update transforms/material uniforms.

## Deep design risks and mitigations

| Risk | Why it would break the concept | Mitigation |
|---|---|---|
| Note hits look late or early | The whole concept depends on perceived sync | Compile `hitT` from source note times, peak visual envelopes at `hitT`, and use audio-clock `renderFrame(t)` in preview. |
| Dense notes force impossible movement | Piano/trill notes can be closer than a believable marble jump | Convert gaps below threshold into local rattle/cascade mechanisms. |
| Marble path becomes a plotted graph | The user explicitly wants tactile/non-linear 3D visuals | Use wall-sculpture layout, brackets, plates, rods, and camera parallax; avoid left-to-right line language. |
| App backend assumes Pixi only | Current preview app is Pixi-first | Add an explicit backend-kind boundary before real scene integration. |
| A note disappears silently | This recreates the original sync-trust problem | Compiler validation fails if any selected note lacks an impact or cluster membership. |
| Tail goes visually dead | Existing concepts repeatedly failed when audio continued after visible events | Compile a tail span from last selected note to audio end when master energy remains. |
| Auto-selected track is musically wrong | The wrong track can make a technically correct render feel unrelated | Save source metrics/selection reason and add manual override after the first auto path. |
| Three.js polish consumes the first slice | Over-polishing can delay proving sync | M0/M1/M2 must prove backend, compiler, and synchronized impacts before material polish. |

The highest-risk dependency is the app/backend boundary, not the marble math.
The marble math can be kept deterministic and testable; backend ownership needs
to be made explicit before the scene can be reliable.

## Milestones

### M0 - Foundation

Done when:

- `@reaper-viz/scene-marble` builds;
- Three.js mounts in the preview app;
- empty/mocked Marble scene renders a wall, marble, and one target;
- concept switching does not leak or crash;
- `corepack pnpm build` passes.

### M1 - Compiler

Done when:

- `@reaper-viz/compiler-marble` builds;
- `compile:marble` writes `performance.marble.json`;
- one source track is selected deterministically;
- all selected notes become impacts or dense-cluster hits;
- path segments are monotonic in time and continuous in position;
- performance validates through shared schema or Marble-specific validation;
- compiler unit tests pass.

### M2 - Synchronized scene

Done when:

- preview app loads real `performance.marble.json`;
- marble position comes from compiled path;
- plates activate exactly on compiled impact times;
- scrubbing remains deterministic;
- low repeating keys track visibly maps to note impacts.

### M3 - Dense-note and tail pass

Done when:

- high keys track dense 0.051 s gap becomes a readable rattle/cascade;
- no teleportation occurs;
- the final 2 s audio tail has visible resonance/settling;
- diagnostics report zero dropped notes and zero timing mismatches.

### M4 - Aesthetic pass

Done when:

- the wall sculpture looks intentionally designed;
- camera composition is close and tactile;
- target materials, glow, shadows, and marble shine are pleasing;
- repeated pitches feel related;
- the user can watch without debug overlays and still perceive synchronization.

### M5 - Two-track design gate

Do not begin implementation until M1-M4 pass for one track.

At this gate, decide whether two-track Marble Music should use:

- two marbles;
- one marble plus bass/frame/gates;
- one marble plus resonator/light track;
- call-and-response handoffs.

## Tests and verification

### Unit tests

Compiler tests should cover:

- deterministic output for same `song.json`;
- selected track is stable;
- every note maps to impact or cluster;
- `marble.impact.params.hitT === sourceNote.t`;
- path segments are time-ordered;
- adjacent path segments connect within epsilon;
- dense gaps create rattle/cascade clusters;
- no dropped notes unless explicitly logged with a reason;
- final tail span reaches audio end when master energy exists.

### Fixture tests

Use at least:

- synthetic single-note song;
- synthetic regular 16-note pattern;
- synthetic dense trill;
- synthetic long-rest pattern;
- `untitled-project-6d2e04f7` low repeating keys track;
- `untitled-project-6d2e04f7` high keys dense stress track.

### Human acceptance

Use the separate
[Marble Music acceptance checklist](marble-music-acceptance-checklist.md).

No automated test can fully prove "satisfying," but tests can prevent false
confidence about sync and dropped notes.

## Integration checklist

- Add `compilers/marble` to workspace.
- Add `scenes/marble` to workspace.
- Add `compile:marble` root script.
- Add app dependency on `@reaper-viz/scene-marble`.
- Add concept picker entry.
- Add project discovery for `performance.marble.json`.
- Add README/runbook note.
- Add implementation status update when code lands.
- Keep generated `performance.marble.json` ignored unless fixtures are
  intentionally committed.

## Non-negotiables

- No runtime physics as timing truth.
- No note may silently disappear.
- No broad all-track generalization before one-track acceptance.
- No fake drums/bass/lead roles on keys-only exports.
- No visual silence while audible tail remains.
- No left-to-right plotted waveform/terrain language.
- No Blender dependency for generated scenes.

## Current first fixture

Use `projects/untitled-project-6d2e04f7`.

First pass:

- low repeating keys track;
- 20 notes;
- pitch 26-38;
- regular gap around 0.43 s.

Second pass:

- high keys track;
- 18 notes;
- pitch 57-72;
- includes a 0.051 s dense gap.

The first pass proves basic one-track satisfaction. The second pass proves the
generator can handle piano-like close notes without visual nonsense.
