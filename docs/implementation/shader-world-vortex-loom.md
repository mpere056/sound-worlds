# Vortex Loom implementation plan

## Concept thesis

Vortex Loom is a deterministic fluid-field world in which music weaves one
persistent material history. A compact luminous shuttle is carried through a
bounded incompressible flow. Every grouped note is the shuttle's first legal,
correctly oriented entry into the interaction annulus of one compiled vortex.
That same vortex stretches the visible fibers, pigment, and particulate field.

The audience should perceive a single causal chain:

```text
future note
  -> fibers begin to part and tension
  -> circulation bends the shuttle and the surrounding material
  -> exact annulus entry occurs on the note
  -> pigment is pulled into a lasting woven trace
  -> the trace continues advecting through later phrases
```

The world is not a marble route underwater, Aurora Cyclotron with teal clouds,
Phaseglass with circular distortions, or a generic fluid simulation reacting to
audio amplitude. Fluid transport and accumulated textile memory are the visual
instrument.

## One-sentence product invariant

Every grouped note is an exact vortex encounter that visibly weaves persistent
material into a continuously transported composition.

## Distinction from existing worlds

| World | Authoritative phenomenon | Persistent evidence | Event grammar |
|---|---|---|---|
| Aurora Cyclotron | charged motion in electromagnetic fields | volumetric wake and deformed shared field | charged trajectory crossing compiled field operators |
| Phaseglass | light passing through a changing optical medium | refractive aberration and caustic structure | bounded optical state written into continuous glass |
| Vortex Loom | material transported by incompressible flow | stretched fibers, pigment parcels, and accumulated weave | first oriented entry into a vortex annulus |

Vortex Loom fails its identity test if it can be made to look like Aurora by
changing only its palette. With bloom and particles disabled, the viewer must
still see material being stretched, braided, folded, and retained by a flow.

## Scope and terminology

The first implementation is one prerecorded note-bearing track with grouped
simultaneous notes. It is a planar physical solve with layered presentation:

- `2D physics` means the shuttle, vortices, ownership zones, and structural
  transport are solved in one bounded plane.
- `2.5D presentation` means several related material strata are offset in depth
  for occlusion and parallax. They do not create unsolved out-of-plane forces.
- `field state` means the velocity field plus persistent transported material.
- `structural transport` means deterministic Lagrangian fibers and landmarks.
- `microtransport` means expendable pigment grain, shimmer, and subpixel detail.

Four-voice or multi-track behavior is deferred. The artifact reserves voice and
track IDs, but the first solver must not introduce multiple shuttles or unrelated
flow systems.

## Product invariants

### Timing and ownership

- The shuttle trajectory is continuous and sampled from absolute score time.
- Every grouped deadline owns exactly one first oriented annulus entry.
- Every owned entry is within `1e-6` seconds of its musical deadline.
- A future annulus cannot be entered early, even when its vortex has begun a
  visible anticipation envelope.
- An old annulus cannot accidentally reclaim a later deadline.
- The final note owns a prepared final weave operation and a valid audio tail.

### Physics

- The steering field is divergence-free within a documented numerical tolerance.
- Vortex activation is smooth in value and first derivative.
- The shuttle never crosses a forbidden core or leaves the certified domain.
- Speed, acceleration, curvature, vorticity, and strain remain bounded.
- All helper flow is represented by declared stream-function terms. The solver
  cannot hide impulses, teleports, or per-interval gravity-like corrections.
- Depth strata may alter visual strength and parallax but cannot change event
  timing or claim independent physics.

### Visual causality

- Structural fibers, pigment, the shuttle, and reservations derive from the same
  velocity field or from declared transported coordinates.
- Dense notes accumulate bounded phrase strain. They do not reset the field,
  replace shader scenes, or cause camera cuts.
- Silence allows material to coast, relax, and settle while retaining history.
- A note is legible through deformation and transport, not only through glow.
- Future preparation is visible as parted or tensioned material, never as a
  floating target ring.

### Determinism and seeking

- Repeated compilation is byte-identical for the same input and version.
- Seed physics is independent of render frame rate and playback history.
- Structural transport can restore from a checkpoint and replay to any time.
- Adaptive rendering may remove microdetail but cannot alter the shuttle,
  ownership, structural fibers, camera plan, or final composition.
- Seeking cannot produce a black frame, stale checkpoint, material pop, or
  different event result.

## System architecture

Vortex Loom is field-first because transported material is the subject. It is a
hybrid implementation rather than a monolithic feedback shader:

```text
song package
  -> grouped deadlines and continuous musical features
  -> deterministic inverse flow solver
  -> certified shuttle and vortex plan
  -> deterministic structural transport checkpoints
  -> absolute-time field sampler
  -> GPU material accumulation and restrained optical resolve
```

Authority is deliberately divided:

| Layer | Authority | May be approximate? |
|---|---|---|
| deadline grouping | compiler | no |
| shuttle trajectory | compiler kernel | no |
| annulus ownership | compiler certification | no |
| structural fiber landmarks | fixed-step transport and checkpoints | only within declared tolerance |
| coarse pigment parcels | fixed-step transport and checkpoints | bounded |
| subpixel grain and glints | renderer | yes |
| bloom, chromatic fringe, film grain | renderer | yes |

The scene consumes the compiled plan. It never moves a vortex to repair a miss
and never changes physics in response to GPU load.

## Coordinate system and bounded chamber

Use normalized world coordinates with a `9:16` safe chamber centered at the
origin. Initial feasibility bounds are:

```text
x in [-1.0, 1.0]
y in [-1.70, 1.70]
safe inset = 0.08
shuttle visual radius <= 0.035
structural depth strata = 4 to 7
```

The exact production bounds remain schema values, not constants spread through
the solver. All physics diagnostics use world units; projected-size diagnostics
use pixels at the target viewport.

The chamber boundary is a streamline. Define every velocity contribution from
a stream function that is constant on the boundary, or multiply unconstrained
basis functions by a smooth confinement envelope before taking derivatives.
This prevents normal flow through the wall without adding collision impulses.

## Flow model

### Divergence-free velocity

Define velocity from a scalar stream function:

```text
u(x, t) = (d psi/dy, -d psi/dx)
div(u) = 0
```

The complete stream function is:

```text
psi(x, t) = psiBase(x, t)
          + sum activation_j(t) * psiVortex_j(x)
```

The base field uses a small declared basis of smooth chamber-confined modes. Its
coefficients vary only through compiled low-frequency envelopes. Base flow
provides continuity and keeps sparse passages alive; it cannot create a hidden
note event.

### Regularized vortices

For vortex `j`, with `r = x - center_j`:

```text
psiVortex_j(x) = Gamma_j/(4*pi) * log(dot(r,r) + core_j^2)
uVortex_j(x)   = Gamma_j/(2*pi*(dot(r,r) + core_j^2)) * perpendicular(r)
```

The implementation must derive velocity and the spatial Jacobian from the same
formula. Do not separately tune a shader swirl that disagrees with shuttle or
fiber transport.

Regularization keeps velocity finite, but the core remains a forbidden region
for the shuttle. The visual material may thin near the core instead of implying
that the shuttle can pass through it.

### Activation envelopes

Each vortex has a score-time envelope with preparation, contact, release, and
residual transport phases. Use a quintic smoothstep or equivalent polynomial
with zero first derivative at every handoff:

```text
s(q) = 6*q^5 - 15*q^4 + 10*q^3
```

Circulation may begin before the note because the prerecorded world knows the
future. That early force must also create the visible reservation. There can be
no physically active but visually unexplained target.

Dense passages use overlapping bounded envelopes and phrase pressure. They do
not shorten every envelope until the field flickers.

### Integration and dense output

Use deterministic fixed-step RK4 for the authoritative shuttle and structural
tracers. Start with a `1/240 s` physics step during certification; permit a
validated `1/120 s` production step only when half-step convergence passes.

Store cubic Hermite dense-output data for the shuttle so event roots, camera
sampling, and arbitrary-time playback do not depend on rendered frame times.
The velocity is `u(x,t)` and therefore remains continuous when field envelopes
are continuous.

## Event geometry and exact ownership

Each note-owned vortex has:

- forbidden core radius `a_i`;
- interaction radius `R_i > a_i + shuttleClearance`;
- admissible entry sector centered on `entryDirection_i`;
- required circulation handedness;
- anticipation, ownership, and release windows.

The geometric root is:

```text
f_i(t) = dot(x(t) - center_i, x(t) - center_i) - R_i^2
```

An owned contact is valid only when all conditions hold:

```text
f_i(t_i) = 0
df_i/dt < -radialEntryEpsilon
dot(normalize(x-center_i), entryDirection_i) >= cos(entryHalfAngle_i)
handedness_i * dot(perpendicular(x-center_i), u(x,t_i)) > tangentEpsilon
```

The event detector brackets every sign change over dense-output spans and uses a
deterministic safeguarded Newton or Brent solve. It reports all roots, not just
the expected one. Ownership certification then proves that the assigned root is
the first admissible entry and that no unassigned annulus produces an admissible
entry at the same time.

Annulus entry is not a solid collision. The seed remains a passive material
shuttle. The perceived payoff comes from maximum local strain, pigment capture,
and a trajectory turn around the note time.

## Inverse compiler

### Unknowns

For each interval, the bounded unknown vector may include:

```text
center_i.x, center_i.y
core_i
interactionRadius_i
circulationPeak_i
preparationLead_i
releaseDuration_i
entryDirection_i
baseModeCorrections_i[0..k]
```

Depth stratum, pigment family, and visual mappings are discrete choices attached
after physical feasibility. They cannot rescue an invalid route.

### Objective

Hard constraints are never converted into attractive soft penalties. For a
feasible candidate, minimize a weighted objective containing:

- event-time residual;
- interval continuity residual;
- deviation from musical target circulation and core scale;
- peak speed, strain, and curvature regularization;
- chamber-edge and future-annulus proximity;
- camera crowding and projected overlap;
- unnecessary base-flow correction;
- visual repetition across consecutive events.

### Deterministic candidate generation

Generate a stable candidate lattice before nonlinear refinement:

1. derive preferred handedness from melodic direction;
2. derive core and interaction-radius bands from register;
3. enumerate entry sectors around the predicted shuttle heading;
4. enumerate center offsets on bounded radial bands;
5. estimate circulation from desired heading change and interval duration;
6. reject obvious core, chamber, speed, and future-ownership failures;
7. sort by a stable tuple of score, family ID, and candidate index.

No random restart may depend on thread scheduling. Any stochastic exploration
uses a named deterministic seed derived from project, track, and event IDs.

### Solve stages

The compiler uses four stages:

#### Stage A - local feasibility

Solve one interval at a time against a frozen incoming state. Use bounded
Levenberg-Marquardt or trust-region least squares with analytic Jacobians where
available. Retain several physically distinct candidates, not just the lowest
local residual.

#### Stage B - beam assembly

Assemble candidate intervals with a deterministic beam search. The beam state
includes shuttle state, active residual vortices, future-annulus clearance,
field bounds, camera occupancy, and accumulated visual repetition.

#### Stage C - multiple shooting

Refine the assembled route globally. Introduce interval boundary positions as
shooting variables and minimize propagation mismatch while keeping every event
root owned. This is where small corrections are distributed across several
vortices instead of forcing one late interval into an extreme turn.

#### Stage D - certification and fallback

Run the independent high-resolution validator. If certification fails, try
bounded fallbacks in this order:

1. broaden the entry sector within the musical mapping range;
2. extend preparation lead without moving the deadline;
3. select another retained center family;
4. reduce decorative depth variation;
5. enlarge chamber scale within camera limits;
6. rerun beam assembly with a larger deterministic beam.

The compiler may not skip a note, teleport the shuttle, silently weaken
ownership, or add an undeclared impulse. Exhaustion returns a structured failure
with the earliest impossible interval and its limiting constraints.

## Global certification

The final plan must pass an independent validator using a half-step or adaptive
high-resolution oracle. Certification covers:

### Event certification

- exactly one owned admissible annulus entry per deadline;
- no early entry into any future annulus;
- no double ownership within the grouping epsilon;
- no ambiguous exit/re-entry near a deadline;
- final note and tail ownership;
- deadline error below `1e-6 s`.

### Field certification

- sampled and analytic divergence within tolerance;
- finite velocity and Jacobian throughout the safe chamber;
- bounded peak speed, acceleration, curvature, strain, and vorticity;
- smooth activation handoffs;
- no forbidden core crossing;
- no chamber exit or prolonged stagnation.

### Visual-readability certification

- shuttle remains within the camera safe area;
- shuttle projected diameter remains above the minimum readable size;
- current deformation and next reservation do not collapse into one blob;
- no more than the allowed fraction of structural fibers become subpixel;
- no depth stratum fully occludes the current event;
- sparse and dense fixtures retain calm negative space;
- the final woven structure remains visible through the audio tail.

## Musical feature model

The compiler consumes notes plus continuous phrase features. Every mapping has a
physical or material meaning and a bounded production range.

| Musical feature | Physical mapping | Material mapping | Perceptual purpose |
|---|---|---|---|
| register | core and interaction-radius band | dominant depth stratum and fiber gauge | low notes feel broad and deep; high notes feel fine and near |
| pitch class | preferred entry/strain axis using circle-of-fifths order | pigment bias within the fixed family | related pitch classes create related geometry |
| melodic direction | preferred circulation handedness and approach side | braid direction | interval direction is visible without relying on color |
| interval magnitude | bounded heading-change target | fold depth and fiber separation | large leaps produce broader spatial redirection |
| velocity | circulation target within certified limits | pigment concentration and local contrast | stronger notes create stronger but not larger generic flashes |
| duration | release envelope and residual circulation | woven-tail length and settling time | sustained notes leave longer organized material |
| local note density | low-pass phrase pressure | strand density and particulate occupancy | fast phrases intensify one process instead of resetting it |
| silence duration | base-flow relaxation target | settling, opening, and reveal | rest remains active and preserves memory |

Initial normalized bounds, to be tuned only through fixtures, are:

```text
core radius             0.045 to 0.14 world units
interaction radius      core + 0.07 to core + 0.22
circulation magnitude   0.20 to 1.40 worldUnits^2/s
preparation lead        0.35 to 3.00 s
release duration        0.30 to 2.40 s
entry half-angle        18 to 55 degrees
phrase-pressure boost   0 to 25 percent above isolated-note target
```

The solver can return values anywhere inside these bounds to achieve exact
timing. The diagnostics compare achieved values with the musical targets so
physical concessions remain visible to authors.

## Anticipation, dense phrases, silence, and ending

### Anticipation

For up to three seconds before a future deadline, backward-integrate a sparse
set of material landmarks from the future interaction neighborhood. Use their
influence corridor to lower pigment density and tension nearby fibers. This
creates a parted path that is causally connected to the coming flow.

The reservation must:

- remain subordinate to the current event;
- carry pitch-axis and register information;
- begin and end at zero-value handoffs;
- fill continuously at contact;
- avoid circles, portal outlines, and target icons.

### Dense phrases

Compute note density with an absolute-time attack/release filter. Fast notes
raise phrase pressure, increase local strand packing, and allow nearby vortices
to share deformation. Individual event roots remain exact, but the medium reads
as one intensifying woven passage instead of repeated independent splashes.

### Silence

During silence, active circulation decays according to compiled envelopes while
the base flow continues. Pigment coasts, tension redistributes, glints become
sparser, and old structure becomes easier to inspect. Silence cannot freeze the
field or fade the scene to an empty background.

### Final resolution

The last three to five notes should prepare a deterministic closure family. The
last vortex gathers previously separated fibers into a legible finishing fold,
selvedge, knot, or braided closure chosen during compilation. It must be a
consequence of preceding transport. After the final entry, residual flow slows
without reversing the completed structure, and the camera holds the result
through the audio tail.

## Persistent material representation

The first implementation should not rely on an opaque GPU dye feedback texture
for its core identity. Seeking and cross-device determinism are easier to prove
with explicit transported structure.

### Structural fibers

- Initialize 48 to 96 long warp fibers, each with 32 to 64 Lagrangian landmarks.
- Add a smaller perpendicular weft family only after warp readability passes.
- Advect every landmark with the authoritative velocity sampler.
- Maintain arc-length metadata and deterministic remeshing when adjacent points
  become too compressed or stretched.
- Preserve fiber IDs and material age across remeshing.
- Render fibers as variable-width ribbons generated from transported landmarks,
  not as screen-space spiral lines.

### Pigment parcels

- Emit bounded event-owned pigment parcels around contact corridors.
- Advect parcel centers with the same field and age them in score time.
- Carry concentration, mineral family, source event, and depth stratum.
- Accumulate parcels into a half-resolution density target for soft material
  body, but retain parcel checkpoints for deterministic replay.

### Microdetail

Procedural fibers, dust, and glints may be derived in the shader from structural
coordinates and stable hashes. They are non-authoritative and are the first
features removed by adaptive quality.

### Optional Eulerian dye

A MacCormack or BFECC dye pass may be added after structural transport passes
Q2. It must be driven by the certified field, use monotonicity clamping, report
mass loss, and remain visually secondary to the deterministic weave. A
semi-Lagrangian blur cannot become the main product merely because it is easy to
render.

## Checkpoint and seek design

Persistent transport requires explicit state restoration. Store structural
checkpoints at a compiled cadence selected from measured replay cost, initially
every `0.5 to 1.0 s`.

A checkpoint contains:

- score time and field-plan version;
- structural fiber landmark positions and arc-length metadata;
- active pigment parcels and ages;
- deterministic remeshing counters;
- phrase-pressure and material-relaxation state;
- checksum of the preceding checkpoint and plan ID.

Seek procedure:

1. select the latest checkpoint at or before target time;
2. verify plan ID and checksum;
3. restore structural state in a worker;
4. replay fixed physics steps to target time;
5. upload one coherent render snapshot;
6. swap snapshots only when the complete target state is ready.

Do not crossfade between incompatible transported states. The old coherent
frame may remain briefly held during a long restore, with transport controls
disabled, but partial new fibers cannot appear over old pigment.

Forward playback may increment checkpoints efficiently, but the result at time
`t` must agree with restore-and-replay to `t` within tolerance.

## Rendering design

### Pass structure

Use a small explicit render graph:

```text
1. structural ribbon pass        full or three-quarter resolution
2. pigment parcel accumulation   half resolution, floating point
3. field shading and absorption  half resolution
4. particulate glints            adaptive, full resolution
5. restrained optical resolve    full resolution
```

The primary image must survive with passes 4 and 5 disabled. Bloom and glints
are polish, not the synchronization language.

### Shared coordinates

All visual layers sample the same compiled flow potential, transported
coordinates, or structural state. Shader turbulence can perturb material at a
small scale, but it cannot produce a second unrelated flow direction.

The shuttle is not a sphere. It should emerge as a compact convergence of bright
fiber tips and dense pigment, elongated along local velocity and compressed by
local strain. In Q0 it may be a diagnostic point; in the finished scene it reads
as a woven shuttle-knot belonging to the medium.

### Material and optical language

The installation should resemble museum-scale silk, ink, and mineral pigment
moving through a dark liquid chamber. Use:

- anisotropic highlights aligned with fiber tangents;
- absorption through pigment density rather than unrestricted additive glow;
- restrained depth haze tied to actual strata;
- occasional mineral glints with stable material ownership;
- subtle chromatic separation only at high-strain contact edges;
- a filmic resolve that preserves black level and fiber detail.

Graphite black, oxidized cyan, muted vermilion, bone white, and rare gold form
one controlled family. Pitch changes bias relationships inside that family; it
does not rotate through a rainbow.

### Visual hierarchy

1. shuttle and current woven contact;
2. locally strained fibers and captured pigment;
3. next reserved channel;
4. older woven history;
5. calm chamber and distant strata.

At least one large calm region should remain in most frames. Full-screen equal
detail destroys scale, direction, and anticipation.

### Anti-goals

- visible annulus rings, target toruses, portals, or repeated water ripples;
- Aurora-like volumetric clouds, central singularity knots, or electrical arcs;
- Phaseglass-like lens circles or chromatic refraction as the main structure;
- full-screen curl noise with no persistent material hierarchy;
- shader streamlines that disagree with fiber or shuttle motion;
- disconnected dye, particles, ribbons, and glow layers;
- a generic glowing sphere used as the shuttle;
- per-note resets, palette cuts, camera snaps, or shader-slot replacement;
- decorative z offsets described as solved 3D fluid dynamics;
- muddy additive blending and unrestricted rainbow pigment.

## Camera and composition

Use a stable macro-observation camera with bounded drift. It observes the weave
instead of chasing every eddy.

The compiler emits a look-at path and a framing scale derived from the shuttle,
current interaction corridor, next reservation, and accumulated composition.
Apply a seek-safe critically damped filter offline, then store camera keys. The
runtime samples those keys; it does not run an incremental follow camera.

Camera certification includes:

- shuttle safe-area containment at 120 Hz;
- current and next interaction visibility;
- bounded angular and zoom velocity;
- no focus pumping on dense phrases;
- depth parallax sufficient to read strata without hiding the planar truth;
- stable final framing through the audio tail.

## Compiler artifact

The compiler emits a strict versioned performance artifact. A representative
shape is:

```ts
interface VortexLoomPerformance {
  schemaVersion: number;
  compilerVersion: string;
  projectId: string;
  sourceTrackId: string;
  durationSeconds: number;
  physics: {
    fixedStepSeconds: number;
    chamber: ChamberBounds;
    initialShuttle: Vec2;
    baseFlow: StreamFunctionMode[];
    vortices: CompiledVortex[];
    shuttleSpans: HermiteSpan2D[];
  };
  interactions: VortexInteraction[];
  transport: {
    fiberSeeds: FiberSeed[];
    pigmentEmissions: PigmentEmission[];
    checkpointCadenceSeconds: number;
    checkpoints: TransportCheckpointRef[];
  };
  music: {
    groupedDeadlines: GroupedDeadline[];
    phraseCurves: ScalarCurve[];
    mappings: VortexMusicalMapping[];
  };
  camera: CameraKey[];
  ending: VortexEndingPlan;
  certification: VortexLoomCertification;
  diagnostics: VortexLoomDiagnostics;
}
```

Large checkpoint payloads may be stored in a companion binary file with offsets
and checksums in JSON. The browser must validate both versions before creating
the scene.

## Package and command plan

```text
packages/compiler-vortex-loom/
  src/grouping.ts
  src/field.ts
  src/integrator.ts
  src/events.ts
  src/candidates.ts
  src/solver.ts
  src/certify.ts
  src/transport.ts
  src/checkpoints.ts
  src/schema.ts
  src/diagnostics.ts

packages/scene-vortex-loom/
  src/VortexLoomScene.ts
  src/TransportWorker.ts
  src/StructuralRenderer.ts
  src/PigmentRenderer.ts
  src/shaders/

projects/<id>/
  performance.vortex-loom.json
  transport.vortex-loom.bin
  diagnostics.vortex-loom.json
```

Root commands:

```text
compile:vortex-loom
test:vortex-loom
diagnose:vortex-loom
```

The app lists Vortex Loom only when the performance artifact and any referenced
checkpoint binary both exist and pass schema validation.

## Diagnostics and authoring feedback

The compiler must explain failures numerically. Emit:

- per-note deadline, root time, timing error, radial speed, and tangential sign;
- candidate counts and rejection reasons by stage;
- peak speed, curvature, vorticity, strain, and boundary proximity;
- nearest future-annulus and forbidden-core clearance;
- musical target versus achieved core, circulation, and entry axis;
- beam width, retained families, solve iterations, and limiting constraints;
- transport mass, fiber stretch ratio, remesh count, and replay error;
- camera safe-area and projected-size minima;
- checkpoint bytes, restore time, replay time, and checksum failures;
- GPU pass timings, resolution tier, and disabled adaptive features.

Diagnostic mode may display annuli, cores, velocity vectors, divergence heat,
ownership labels, flow Jacobians, checkpoint age, and fiber IDs. None of this
debug geometry appears in production captures.

For impossible songs, report actionable concessions such as "event 27 requires
circulation 1.63 above the 1.40 bound" or "events 41 and 42 leave no legal
future-annulus clearance at the current chamber scale."

## Test strategy

### Unit tests

- analytic velocity against finite differences of the stream function;
- analytic Jacobian against central differences;
- divergence over randomized chamber points and envelope times;
- envelope endpoint value and derivative continuity;
- RK4 and Hermite interpolation against closed or manufactured solutions;
- bracketed first-entry root detection, tangencies, and multiple roots;
- remeshing ID stability and arc-length preservation;
- schema round-trip and binary checkpoint checksum.

### Property and randomized tests

- repeated compilation under shuffled input order;
- worker-count and candidate-order determinism;
- half-step convergence across production parameter ranges;
- no forbidden-core or future-annulus entry across seeded random plans;
- checkpoint replay versus uninterrupted transport;
- arbitrary seek permutations reaching the same structural state;
- adaptive-quality changes leaving authoritative state untouched.

### Song fixtures

1. one isolated note;
2. alternating ascending and descending intervals;
3. repeated pitch with changing velocity;
4. fast dense run;
5. long sustain;
6. long silence followed by a strong return;
7. abrupt register leap;
8. circulation-polarity reversal;
9. tightly grouped simultaneous notes;
10. final-note closure with a long audio tail;
11. 100-note stress song;
12. intentionally impossible route.

### Visual tests

- deterministic golden captures for sparse, dense, silent, and ending moments;
- black-frame and shader compile/link diagnostics;
- canvas pixel variance and luminance-range checks;
- optical-flow comparison between shuttle, fibers, and pigment direction;
- 9:16 desktop and mobile viewport captures;
- still-frame identity review with bloom, particles, and color disabled;
- full-song watch-through with audio and exact-note scrubs.

## Performance and memory budgets

Initial budgets are gates, not permission to weaken physics:

| Operation | Target | Hard diagnostic threshold |
|---|---:|---:|
| 20-note reference compile | `<= 2 s` p95 | `5 s` |
| 100-note stress compile | `<= 8 s` p95 | `15 s` |
| checkpoint restore and replay | `<= 75 ms` p95 | `150 ms` |
| forward structural update | `<= 2 ms/frame` | `4 ms/frame` |
| total GPU frame at 1080 x 1920 | `<= 16.7 ms` p95 | `25 ms` |
| checkpoint storage for 3 minutes | `<= 48 MB` | `96 MB` |

Adaptive quality order:

1. reduce glint count;
2. reduce subpixel grain octaves;
3. lower pigment accumulation resolution;
4. reduce non-authoritative parcel count;
5. reduce distant depth strata;
6. reduce optional Eulerian dye quality.

Never reduce structural fibers below the readability floor, change the fixed
physics step, alter a vortex, move an event, or remove the current reservation.

## Implementation work orders

### V0 - Contracts, fixtures, and package scaffold

- Add compiler and scene packages, commands, schemas, stable IDs, and strict
  `2D` versus `2.5D` terminology.
- Implement source-track selection and deterministic grouped deadlines.
- Add all twelve song fixtures and an empty/silent fallback fixture.
- Emit a minimal artifact and structured unsupported-input errors.
- Gate: shuffled input and repeated builds are byte-identical.

### V1 - Stream-function and integration kernel

- Implement the confined base-flow basis, regularized vortices, analytic
  velocity, Jacobian, and activation envelopes.
- Implement RK4, Hermite dense output, and manufactured-solution tests.
- Add divergence, boundary, near-core, and half-step diagnostics.
- Gate: kernel tests pass across randomized production bounds with no NaN,
  infinity, boundary leak, or unexplained derivative discontinuity.

### V2 - Event detector and ownership oracle

- Implement root bracketing, safeguarded root refinement, orientation tests,
  and complete root reporting.
- Build an independent high-resolution ownership oracle.
- Cover tangent touches, repeated roots, overlapping windows, grouped notes,
  and final-tail ownership.
- Gate: production detector and oracle agree on every seeded fixture; valid
  deadline errors are below `1e-6 s`.

### V3 - Single-interval inverse solve

- Implement candidate lattice generation, circulation estimates, bounded local
  refinement, stable sorting, and rejection diagnostics.
- Solve isolated, ascending, descending, velocity-varied, and register-leap
  fixtures without global relaxation.
- Gate: at least three physically distinct candidates survive for ordinary
  intervals, and impossible intervals fail with limiting constraints.

### V4 - Global route compiler

- Implement deterministic beam assembly, retained candidate families, multiple
  shooting, and bounded fallback order.
- Add future-annulus, forbidden-core, chamber, stagnation, curvature, and visual
  crowding constraints.
- Compile phrase curves and final closure families.
- Gate: all reference fixtures pass independent global certification with no
  skipped events or hidden corrections.

### V5 - Structural transport and checkpoint feasibility spike

- Implement warp-fiber seeding, landmark advection, deterministic remeshing,
  pigment parcels, checkpoint serialization, worker replay, and checksums.
- Measure storage and restore time on the 100-note and three-minute fixtures.
- Compare uninterrupted playback with randomized seek/replay permutations.
- Gate: structural state matches within tolerance and p95 restore remains under
  the hard threshold. Do not begin visual polish if this gate fails.

### V6 - Q0 graybox scene and app routing

- Add world selection, artifact loading, lifecycle cleanup, transport worker,
  plain fibers, diagnostic shuttle point, annulus debug view, and camera keys.
- Render from absolute song time and support play, pause, seek, restart, resize,
  PNG capture, and silent preview.
- Gate: every fixture is inspectable without black frames, duplicate scenes,
  stale workers, or seek-order differences.

### V7 - Anticipation and musical-material grammar

- Implement backward influence corridors, fiber parting, phrase pressure,
  register strata, pitch-axis mapping, velocity concentration, duration tails,
  silence behavior, and final closure.
- Add diagnostics comparing musical targets with achieved physics.
- Gate: monochrome captures distinguish register, direction, velocity, density,
  duration, and silence without labels or generic flashes.

### V8 - Unified material renderer

- Implement structural ribbon shading, pigment accumulation, absorption,
  material-owned contact light, restrained glints, depth strata, and filmic
  resolve.
- Make the shuttle emerge from fiber convergence rather than a sphere mesh.
- Add optional Eulerian dye only after structural readability passes.
- Gate: sparse, dense, silent, and final captures read as one transported medium
  with particles, bloom, and chromatic fringe disabled.

### V9 - Composition, camera, and visual-quality promotion

- Complete Q1 art-direction lock, Q2 composition and anticipation, Q3 material
  coherence, and Q4 musical expression.
- Tune calm-area ratio, current/next hierarchy, camera drift, projected sizes,
  palette, exposure, and tail framing on the authored reference song.
- Gate: review finds no Aurora clouds, Phaseglass lens circles, water ripples,
  target rings, or disconnected effect layers.

### V10 - Performance, export, and Q5 acceptance

- Profile compiler stages, transport replay, memory, and every render pass.
- Implement adaptive-quality tiers in the approved order and record active
  compromises in captures.
- Run the complete deterministic, physics, seek, viewport, audio watch-through,
  export, and final-tail matrix.
- Gate: Q5 passes on reference hardware and the world remains honest at the
  minimum supported quality tier.

## Recommended execution order

V1 and V5 contain the two largest independent risks: certified flow physics and
persistent deterministic seeking. Build a thin V5 checkpoint spike as soon as
the V1 sampler exists, before investing in the global solver or polished shader.

```text
V0
 -> V1 kernel
 -> thin V5 checkpoint spike
 -> V2 event oracle
 -> V3 local solve
 -> V4 global solve
 -> complete V5 transport
 -> V6 graybox
 -> V7 musical grammar
 -> V8 materials
 -> V9 visual promotion
 -> V10 ship gate
```

The first meaningful milestone is not a beautiful swirl. It is an eight-note
monochrome proof where the shuttle enters every annulus exactly, fibers visibly
deform under the same field, and arbitrary seeks reproduce the same weave.

## Promotion gates

Follow the [shared visual-quality standard](shader-worlds-visual-quality-standard.md)
and [cross-world engineering learnings](sound-worlds-engineering-learnings.md).

- `Q0`: exact owned encounters, bounded field, structural transport, and seek
  determinism in a monochrome graybox.
- `Q1`: museum textile/fluid art direction and anti-goals locked.
- `Q2`: current event, future reservation, negative space, camera, and ending
  composition proven.
- `Q3`: fibers, pigment, depth, absorption, and light read as one material.
- `Q4`: pitch, direction, velocity, duration, density, silence, and anticipation
  are perceptually distinct but continuous.
- `Q5`: full-song audio review, golden captures, viewport checks, performance,
  export, diagnostics, and final-tail acceptance pass.

## Principal risks and stop conditions

### Deterministic transport risk

If checkpoint replay cannot meet tolerance and budget with explicit structural
state, stop before adding GPU feedback dye. Reduce structural complexity or
improve checkpoint encoding; do not hide the problem with crossfades.

### Inverse-solve risk

If dense deadlines require circulation or strain beyond the declared bounds,
the route is impossible under the current chamber and mapping. Report the
limiting event and use bounded fallbacks. Do not silently make the shuttle jump.

### Visual-identity risk

If the scene reads as smoke, water ripples, portals, glowing rings, or generic
curl noise in monochrome, stop Q3. Strengthen persistent fiber reference and
material transport before adding more effects.

### Performance risk

If the field renderer consumes the budget before structural transport is
visible, remove high-frequency volume and optical work. Vortex Loom's identity
is the weave, not shader complexity.

### Complexity risk

Do not begin multi-track flow, several independent shuttles, live MIDI, full 3D
Navier-Stokes, fluid-solid coupling, or editable runtime vortices in this plan.
Those are later research tracks after the one-track prerecorded Q5 gate.
