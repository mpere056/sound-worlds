# Lumenfall implementation plan

> Status: L0-L1 foundation and a preliminary L2-L5 engineering slice were
> implemented on 2026-07-16. Pair-state route search, full mesh CCD, final
> materials, and production lighting acceptance remain.

## Current engineering checkpoint

Implemented packages:

- `@reaper-viz/compiler-lumenfall` with monophonic deadline grouping, analytic
  launch solves, passive reflection, bounded impulse diagnostics, a frozen
  192-slab Nocturne Causeway graybox, exact contact artifacts, deterministic
  sampling, and contact-plane clearance certification;
- `@reaper-viz/scene-lumenfall` with generated basalt texture assets, separate
  wet/dry PBR materials, dark water, an inverse-square point source, a coupled
  wide shadow spotlight, analytic contact light, velocity-aligned luminous
  streak, bounded trail, and absolute-time camera following;
- app discovery, controls, timestamp query links, and reference-project
  compilation through `performance.lumenfall.json`.

The 19-note reference compiles to 19 exact contacts with approximately
`1.4e-15` maximum endpoint error, zero contact-plane penetrations, maximum
speed below `6.1 m/s`, and effectively zero tangential impulse ratio after the
continuous contact-point correction.

This does **not** complete L2-L5. The current route uses one broad horizontal
contact family and a continuous-forward heuristic. It does not yet implement
pair-state beam search across varied surface normals or BVH swept-sphere tests
against final terrain. The renderer proves the data path and lighting
architecture, not final realism or concept parity.

## 1. Architecture

```text
song.json selected one-note track
          +
worlds/lumenfall/nocturne-causeway world artifact
          |
          v
@reaper-viz/compiler-lumenfall
  deadline grouping
  contact-candidate graph
  inverse ballistic solve
  reflection + bounded impulse solve
  swept collision certification
  camera compilation
          |
          v
performance.lumenfall.json
          |
          v
@reaper-viz/scene-lumenfall
  analytic trajectory sampling
  PBR world rendering
  dynamic scene light + shadows
  constrained contact bounce light
  trail / impact derivatives
```

The world artifact is built before the song route. The compiler consumes it
but never edits it. The scene consumes compiled state and never re-solves
physics during playback.

## 2. Proposed package and artifact shape

```text
worlds/lumenfall/                  authored/generated static environment
compilers/lumenfall/               route search and certification
scenes/lumenfall/                  Three.js playback and lighting
projects/<id>/world.lumenfall.json cached world reference and hash
projects/<id>/performance.lumenfall.json
```

The production world geometry should be stored in glTF/GLB with KTX2 textures.
The JSON world artifact stores compiler-facing contact and collision metadata,
not duplicated render vertices.

### World contract

```ts
interface LumenfallWorld {
  schemaVersion: 1;
  worldId: "nocturne-causeway";
  worldSeed: string;
  renderAsset: string;
  collisionAsset: string;
  bounds: Aabb3;
  gravity: Vec3;
  materials: LumenfallMaterial[];
  contactPatches: LumenfallContactPatch[];
  cameraVolumes: CameraVolume[];
  hash: string;
}

interface LumenfallContactPatch {
  id: string;
  center: Vec3;
  normal: Vec3;
  tangentU: Vec3;
  tangentV: Vec3;
  halfSize: Vec2;
  materialId: string;
  edgeClearance: number;
  neighborhoodId: string;
}
```

Contact patches are compiler affordances on existing geometry. They are never
rendered. Every patch must lie on the collision mesh, match its normal within a
small angular tolerance, and contain a hero-radius inset.

### Performance contract

```ts
interface LumenfallImpact {
  id: string;
  noteId: string;
  t: number;
  patchId: string;
  point: Vec3;
  normal: Vec3;
  incomingVelocity: Vec3;
  passiveVelocity: Vec3;
  outgoingVelocity: Vec3;
  restitution: number;
  friction: number;
  musicalImpulse: Vec3;
  impactEnergy: number;
  lightIntensity: number;
  colorTemperatureK: number;
  afterglowSec: number;
}

interface LumenfallSegment {
  t0: number;
  t1: number;
  p0: Vec3;
  v0: Vec3;
  gravity: Vec3;
  minimumClearance: number;
  apexT: number;
  apexHeight: number;
}
```

The artifact also contains world/hash references, selected-track diagnostics,
camera keys, quality-independent lighting curves, trail bounds, and a complete
certification report.

## 3. Ballistic kernel

For contact position `p_i`, outgoing velocity `v_i+`, gravity `g`, and local
segment time `s`:

```text
p(s) = p_i + v_i+ s + 0.5 g s^2
v(s) = v_i+ + g s
```

For a proposed next contact `p_j` at deadline interval `dt`:

```text
v_required = (p_j - p_i - 0.5 g dt^2) / dt
```

This is the authoritative solve. The renderer samples the same equation using
absolute song time. It must not integrate frame-to-frame.

### Collision response

Split incoming velocity into surface-normal and tangential components:

```text
v_n = dot(v_in, n) n
v_t = v_in - v_n
v_passive = (1 - friction) v_t - restitution v_n
J_music = mass (v_required - v_passive)
```

A transition is feasible only when:

- incoming velocity points into the surface by the minimum incidence angle;
- restitution stays within the patch material's declared range;
- friction stays within its declared range;
- `J_music` points predominantly away from the surface;
- tangential impulse is at most 35 percent of normal impulse in the first
  tuning target;
- total impulse and outgoing speed stay below velocity-scaled limits;
- the body separates from the surface immediately after contact;
- the complete following segment is collision-free.

The 35-percent limit is a product gate, not a universal physical constant. It
may be revised only after human review of neutral-material graybox arcs.

## 4. Deadline and note preparation

L0 supports one monophonic MIDI stream. Simultaneous or overlapping notes are
resolved by the existing deterministic track policy and a documented chord
epsilon. The compiler emits one owned impact per grouped deadline.

Preparation fields per deadline:

- normalized pitch and pitch class;
- pitch interval and direction;
- normalized velocity;
- note duration;
- time to previous and next deadline;
- local density and phrase boundary confidence.

Pitch and density rank candidate neighborhoods. They do not move contacts.
Velocity affects the allowed impulse budget and radiance after a candidate has
already passed geometry and timing checks.

## 5. Static world foundation

### Nocturne Causeway graybox

Build one deterministic 40 m by 80 m environment with:

- 12-20 large basalt terraces;
- connecting broken slabs and low ramps;
- three shallow water channels;
- height variation sufficient for upward, downward, near, and far arcs;
- at least 320 certified contact patches;
- no corridor narrower than the hero diameter plus clearance;
- a low-angle camera volume that preserves depth and next-contact visibility.

Render and collision meshes derive from the same authored source. A simplified
collision mesh may remove micro-detail, but it may not alter silhouettes or
contact planes enough to make visible collisions disagree.

### World validation

Automated validation must prove:

- every patch projects onto a collision triangle;
- patch and triangle normals differ by at most 2 degrees;
- the hero-radius inset remains inside patch boundaries;
- no patch begins intersecting neighboring geometry;
- candidate neighborhoods have enough directional and normal diversity;
- world hash changes when any route-relevant geometry changes.

## 6. Route search

The outgoing requirement at one impact depends on the next contact, while the
quality of that outgoing response depends on the previous incoming velocity.
Search therefore operates on contact pairs, not isolated contacts.

### Candidate generation

For each deadline:

1. rank spatial neighborhoods from pitch, interval direction, density, and
   camera continuity;
2. query patches reachable within the note interval and speed bound;
3. reject patches with impossible incidence, edge margin, or apex bounds;
4. retain diverse candidates across bearing, depth, height, and normal.

### Deterministic beam search

Each beam state owns the last two contacts, incoming velocity, accumulated
impulse cost, camera cost, spatial repetition cost, and minimum clearance.
Expansion evaluates the complete reflection and next ballistic segment.

Suggested lexicographic priorities:

1. exact deadline ownership;
2. collision and response feasibility;
3. minimum clearance margin;
4. minimum musical impulse and tangential ratio;
5. readable apex and travel distance;
6. pitch-direction agreement;
7. camera continuity and environment coverage;
8. avoidance of immediate patch reuse.

Beam width and candidate count must be profile-driven and reported. A failed
route returns structured diagnostics identifying the first impossible deadline;
it does not silently loosen physical limits.

## 7. Continuous collision certification

Treat the light body as a sphere, not a point. Use a BVH over the static
collision mesh and conservative continuous collision detection for each
parabolic segment.

Certification requires:

- the owned patch is reached at `t_i` within `1e-6` seconds;
- sphere-to-surface contact distance equals the hero radius;
- no triangle is touched before the owned deadline;
- no unowned contact occurs between deadlines;
- contact points retain an edge-clearance margin;
- post-impact motion separates for a fixed epsilon interval;
- analytic samples and the high-rate audit sampler agree;
- final rest or exit remains collision-safe through the audio tail.

Broad phase uses the swept parabola AABB. Narrow phase adaptively subdivides by
curvature and triangle distance until the conservative error bound is below the
clearance tolerance.

## 8. Physically based illumination

### Primary light

The radiant body and scene light share the exact sampled position. Use a
photometric inverse-square point light with:

- physically correct decay;
- stable song-level exposure;
- cubemap shadows in the high-quality tier;
- a small visible emissive core;
- intensity derived from bounded velocity and note energy;
- subtle 3600-6800 K pitch mapping, centered near neutral white.

The emissive core, bloom, and trail do not illuminate the world by themselves.
The scene light is authoritative.

### Materials

Nocturne Causeway uses PBR basalt and water materials with shared texture
scale, measured roughness ranges, tangent-space normals, and restrained
displacement. Wetness changes roughness and specular response rather than
painting blue highlights onto geometry.

Initial material targets:

| Material | Roughness | Metalness | Special response |
|---|---:|---:|---|
| dry basalt | 0.62-0.88 | 0 | broad diffuse return |
| wet basalt | 0.12-0.38 | 0 | sharp grazing reflection |
| shallow water | 0.03-0.12 | 0 | planar/environment reflection, absorption |
| mineral seam | 0.28-0.50 | 0.05 | restrained sparkle at grazing angles |

### Contact bounce light

Approximate one indirect bounce at impact only:

```text
incident = intensity * max(0, -dot(v_in_normalized, n)) / distance^2
bounceEnergy = min(cap, incident * materialAlbedo * bounceFraction)
```

Emit the approximation from the contact point along the surface normal with a
short analytic decay. The total energy must stay below the configured fraction
of incident energy. Occlusion still applies. Disable this pass in a diagnostic
mode so reviewers can distinguish direct light from the approximation.

### Reflection and post-processing

- prefiltered environment map for stable dark reflections;
- planar reflection only for the largest water channel in the first vertical
  slice;
- ACES-style highlight rolloff and fixed exposure;
- restrained bloom after tone mapping validation;
- optional depth of field only after collision readability passes;
- no screen-space glow painted through occluders.

## 9. Trail and impact derivatives

The trail is an analytic sample of the recent authoritative trajectory over a
bounded 120-240 ms window. Width and opacity decrease monotonically with age.
It may illuminate only through a separately budgeted low-energy line-light
approximation in a future tier; the first implementation does not let the
trail light the world.

Impact derivatives inherit physical data:

- count and speed from impact energy;
- launch hemisphere from contact normal;
- drag and lifetime from material type;
- reflection color from local material and light temperature;
- optional water ripple only on water material;
- no generic radial explosion on every surface.

All derivatives are pure functions of absolute time since impact and disappear
after bounded lifetimes.

## 10. Camera system

Compile the camera after the route is certified. It should feel observational,
not musically punched.

Camera objectives:

- keep the body inside a central 60-percent safe region;
- show current surface and enough of the outgoing arc to imply direction;
- retain one or two dim world landmarks for motion reference;
- prefer low 35-65 mm-equivalent lenses;
- limit angular velocity, angular acceleration, zoom rate, and target drift;
- avoid per-note cuts and abrupt distance changes;
- end on a prepared composition rather than following the body off-screen.

Solve a smooth constrained spline through candidate camera poses. Camera keys
are compiler output and are sampled by absolute time.

## 11. Scene controls

Controls may tune presentation but cannot invalidate physics:

- `Exposure`
- `Light intensity`
- `Light radius`
- `Shadow quality`
- `Wetness response`
- `Bounce light`
- `Trail length`
- `Trail width`
- `Bloom`
- `Camera distance`

There are no gravity, restitution, route, or collision sliders in the normal
preview. Those belong in a compiler diagnostic tool because changing them
requires a new certified performance.

## 12. Work orders

### L0 - Contract and fixtures

- Freeze schemas, units, tolerances, material bounds, and seeded fixtures.
- Add flat plane, slope, terrace, wall, and occluder test worlds.
- Implement analytic position/velocity, inverse launch solve, reflection, and
  impulse decomposition.

**Done when:** numeric fixtures pass at known times and deterministic output is
byte-identical.

### L1 - Pre-existing world graybox

- Build Nocturne Causeway graybox and shared render/collision export.
- Generate and validate contact patches and camera volumes.
- Add a neutral material world viewer with collision/normal diagnostics.

**Done when:** the world reads as one place without music, every patch validates,
and no route geometry is visible in the normal view.

### L2 - Inverse route compiler

- Prepare one-note deadlines and candidate neighborhoods.
- Implement pair-state deterministic beam search.
- Emit exact segments, impacts, structured failure diagnostics, and profiles.

**Done when:** five-, nineteen-, and 100-note fixtures compile with exact
contacts and bounded impulses.

### L3 - Collision certification

- Build BVH broad phase and adaptive parabolic narrow phase.
- Certify owned contact, no early contacts, edge margin, and tail safety.
- Add randomized terrain and dense-deadline regression fixtures.

**Done when:** intentional tunneling, grazing, hidden-wall, edge, and false-rest
fixtures all fail for the correct reason.

### L4 - Lighting proof

- Render one static light over dry basalt, wet basalt, water, and an occluder.
- Add inverse-square light, shadows, PBR materials, environment reflection,
  tone mapping, and diagnostic toggles.
- Add image-based luminance and occlusion checks.

**Done when:** light falloff is monotonic, blocked receivers are darker than
unblocked controls, facing surfaces out-light back-facing surfaces, and the
world remains readable with bloom disabled.

### L5 - Five-impact vertical slice

- Join a certified five-contact route to the lighting proof.
- Add analytic trail, material-specific impact response, and one smooth camera.
- Use a static neutral-white light before pitch color mapping.

**Done when:** all five impacts look physically connected to their incoming and
outgoing arcs and each note visibly owns one contact.

### L6 - Full-song one-track preview

- Compile the reference 19-note song.
- Add pitch/velocity/duration preferences and final resolution.
- Add app discovery, controls, diagnostics, PNG, and deterministic MP4 preview.

**Done when:** full random seeking is exact, every note is visible, and the
camera has no abrupt transition.

### L7 - Cinematic material pass

- Replace graybox with final basalt/water assets.
- Refine reflections, one-bounce impact light, micro-spray, trail, exposure,
  composition, and restrained pitch temperature.
- Build desktop and mobile quality tiers without changing physics.

**Done when:** Q1-Q4 visual gates pass and the world looks convincing in still
frames with post-processing selectively disabled.

### L8 - Production acceptance

- Profile CPU, GPU, memory, shadow maps, and export.
- Run two contrasting monophonic songs and a 100-note stress fixture.
- Complete full watch-through, random seek, determinism, black-frame, and
  visual-regression gates.

**Done when:** Q5 passes and no remaining feature is described as complete only
because an engineering preview exists.

## 13. Test matrix

| Layer | Required tests |
|---|---|
| math | inverse launch, apex, velocity, reflection, impulse decomposition |
| route | deterministic search, exact deadlines, impulse bounds, spatial diversity |
| collision | swept sphere, grazing, edge margin, early ownership, final tail |
| world | patch projection, normal agreement, hash invalidation, neighborhood diversity |
| lighting | inverse-square falloff, orientation response, occlusion, energy cap |
| scene | absolute-time sampling, seek order, trail lifetime, impact lifetime |
| camera | containment, angular speed/acceleration, no abrupt zoom, final framing |
| rendering | nonblank canvas, shadow presence, wet/dry distinction, no shader errors |
| performance | p95 CPU/GPU time, shadow cost, memory, export throughput |

## 14. Performance budgets

Initial desktop targets at 1080 x 1920:

| Metric | Target |
|---|---:|
| route compilation, 100 notes | at most 5 s release profile |
| scene CPU p95 | at most 2.5 ms |
| GPU frame p95 | at most 16.7 ms |
| hard GPU frame ceiling | 25 ms outside capture stalls |
| collision artifact | at most 20 MB compressed |
| runtime scene memory | at most 256 MB |
| dynamic shadow lights | one primary, one bounded contact approximation |

Quality tiers may reduce shadow-map resolution, reflection resolution, impact
particles, and trail subdivisions. They may not alter route, contact timing,
light position, or collision truth.

## 15. Primary risks and decisions

### Risk: arbitrary songs overconstrain passive physics

**Decision:** use bounded musical impulse at owned contacts and reject candidates
outside visual limits. Never add mid-air steering.

### Risk: the world becomes another hidden platform generator

**Decision:** hash and freeze the world before note preparation. The compiler
selects patches only.

### Risk: bloom disguises incorrect illumination

**Decision:** lighting acceptance is performed with bloom, trail, and bounce
light independently disabled.

### Risk: point-light shadows are too expensive

**Decision:** prove one shadowed primary light first, profile it, then choose
shadow resolution or a measured hybrid. Do not move to C++ or WebGPU without a
named failed budget.

### Risk: exact contacts are hidden by cinematic framing

**Decision:** camera containment and impact visibility are compiler gates, not
late editorial preferences.

## 16. First implementation slice

Start with L0 and L1 in parallel, then build one five-impact L5 slice through
L2-L4. Use neutral gray materials and no bloom until:

1. all five contact times are exact;
2. incoming/outgoing motion agrees with visible normals;
3. no arc intersects the static world early;
4. the moving point light casts a real shadow;
5. wet and dry surfaces respond differently for material reasons;
6. the camera shows each contact and outgoing direction.

Only after that gate should final textures, color temperature, spray, depth of
field, and cinematic polish begin.
