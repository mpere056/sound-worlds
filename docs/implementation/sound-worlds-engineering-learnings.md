# Sound Worlds engineering and design learnings

This is the project-wide field guide for designing future Sound Worlds. It
records lessons learned while building and revising Marble Music, Music-Synced
Brick Breaker, Aurora Cyclotron, and Phaseglass. It is intentionally more than
a success summary: rejected approaches are documented so later worlds do not
repeat failures that already produced clear perceptual evidence.

The central lesson is that music synchronization is not an effect layer. It is
the temporal and physical structure of the world. Shaders, rigid bodies,
particles, cameras, trails, and post-processing are tools chosen in service of
that structure. No one tool is mandatory for every world.

## 1. Start with one world invariant

Every Sound World needs one sentence that explains what the music physically
does. Examples:

- Marble Music: each note is an exact marble-platform impact.
- Brick Breaker: each beat is a legal collision, and note-assigned beats destroy
  bricks.
- Aurora Cyclotron: each note changes a charged trajectory and the shared
  electromagnetic medium.
- Phaseglass: each note writes a bounded optical aberration into one continuous
  refractive field.

This sentence is the product invariant. Physics, layout, shader language,
camera, and effects must reinforce it. If several unrelated visual systems are
needed to explain the world, the concept is probably not yet unified.

Before implementation, also define anti-goals. Aurora explicitly rejects
literal spheres and toruses as its main visual language. Phaseglass rejects
water ripples, note-to-object assignment, and generic portals. Anti-goals make
visual review decisive instead of subjective and open-ended.

## 2. Music synchronization has two contracts

### Numeric synchronization

Source events, compiled deadlines, collision times, shader impulses, playback,
seeking, and export must agree in absolute seconds. Use the audio clock as the
render authority and sample the world with `renderFrame(t)` or an equivalent
absolute-time function.

### Perceptual synchronization

The world must remain musically intelligible before and after the exact event.
A contact can be numerically perfect and still feel wrong when:

- an object leaves while the note is sustaining;
- a dense phrase repeatedly resets the scene;
- a camera move hides the contact;
- a bright flash is the only connection to the note;
- silence freezes a procedural world unnaturally;
- every note has the same shape with a slightly different color.

Model anticipation, attack, sustain, release, rest, and tail deliberately.
Back-solve preparation from the next deadline rather than starting arbitrary
motion at the previous deadline.

## 3. Compile deadlines; do not entrust them to runtime simulation

For prerecorded worlds, a free-running physics engine must not own musical
timing. Small integration errors, frame-rate variation, collision-order changes,
and seeking make that architecture unsuitable for exact authored contacts.

The reliable pipeline is:

```text
musical events
  -> immutable deadlines and continuous musical features
  -> deterministic inverse solve
  -> certified trajectory / field plan
  -> absolute-time sampler
  -> renderer
```

Use a physics engine or numeric integrator to validate candidates when useful,
but compile the accepted result. The same timestamp and seed must reproduce the
same frame regardless of playback history or seek order.

### Back-solve from the payoff

Given a required event time, solve backward for the state that makes the event
possible. Useful unknowns include:

- launch velocity and departure time;
- contact normal and platform orientation;
- brick position and wall/paddle itinerary;
- field axis, field magnitude, and helical turn count;
- membrane normal, refractive index, or phase gradient;
- camera look-ahead and framing bounds.

Do not place attractive geometry first and then force an object to reach it.
Placement is an output of the timing and physics solve.

## 4. A trajectory is not valid until the whole interval is certified

Endpoint agreement is not collision safety. Validate continuous spans with
swept tests or conservative subdivision. Certification should cover:

- exact contact at every owned deadline;
- no tunneling through thin geometry;
- no premature contact with future targets;
- no collision with old or unrelated targets;
- no target-target overlap;
- legal incidence and outgoing direction;
- bounded speed, acceleration, curvature, and angular velocity;
- camera containment and readable projected size;
- final-event ownership and a valid post-event tail.

The validator must use the actual collision geometry, including the marble or
ball radius. Rendering a sphere center on a platform surface creates visible
penetration even if the center trajectory is mathematically neat.

## 5. Reusable mathematical patterns

### Ballistic deadline solve

For constant gravity and a flight duration `dt`:

```text
p(dt) = p0 + v0*dt + 0.5*g*dt^2
v(dt) = v0 + g*dt
v0 = (pTarget - p0 - 0.5*g*dt^2) / dt
```

This gives an exact arrival candidate, not a complete route. Reject it when
speed, apex, incidence, occupancy, or camera readability is outside bounds.
Change target placement or choose another transition family instead of silently
changing gravity from one span to the next.

### Reflection and contact orientation

For an ideal static surface with unit normal `n`:

```text
vOut = vIn - 2*dot(vIn, n)*n
```

When incoming and outgoing speeds are equal, a candidate contact normal is
parallel to `vIn - vOut`, with sign chosen to face the incoming body. Restitution,
friction, paddle steering, or an active platform impulse must be explicit terms;
do not render one normal while applying an unrelated outgoing velocity.

### Radius-aware and swept occupancy

Collision planning should use configuration-space expansion: expand each solid
by the moving body's radius, then test the body's center path against the
expanded solid. For a moving segment, solve the earliest time of impact or use
adaptive conservative advancement. Sampling only rendered frame endpoints is
not sufficient.

### Force budgets versus visual percentages

A control labeled left/right, up/down, or front/back cannot describe only target
displacement while gravity and bounce impulses remain outside the budget. The
displayed mix should govern the resulting trajectory variance or bounded force
allocation across all contributors:

```text
aTotal = wHorizontal*aHorizontal
       + wVertical*(gravity + bounceControl)
       + wDepth*aDepth
```

The weights do not need to be literal percentages of every frame's displacement,
but the measured route statistics should approximately match the requested
creative balance. Recompile geometry to satisfy the mix rather than applying
unbounded forces after placement.

### Electromagnetic propagation

Aurora's physical foundation uses:

```text
m*dv/dt = q*(E + v cross B)
omega = q*|B|/m
radius = |vPerpendicular|/|omega|
```

Constant fields have closed-form solutions and are preferable for inverse
initial guesses. Finite fringe fields use a bounded Boris integration and a
deterministic shooting correction. Validate that magnetic work is approximately
zero and electric work matches kinetic-energy change.

### Refraction and phase gradients

For passive vector Snell refraction:

```text
k = 1 - eta^2*(1 - dot(n, i)^2)
t = eta*i - (eta*dot(n, i) + sqrt(k))*n
```

Reject `k < 0` unless total internal reflection is an authored interaction. An
active phase-gradient membrane instead changes tangential momentum while
preserving the declared magnitude. Keep passive refraction and active steering
separate in schemas and diagnostics.

### Damped camera and transform activation

Use a frame-rate-independent critically damped spring or an equivalent bounded
filter for camera and regenerated transforms. A useful conceptual form is:

```text
x'' + 2*omega*x' + omega^2*(x - target) = 0
```

Clamp extreme target changes and preserve velocity across plan activation.
Opacity crossfades are not a substitute for moving persistent geometry to its
new certified transform.

### Seek-safe envelopes

Effects should be functions of absolute score time, such as a smooth attack and
exponential or polynomial decay:

```text
age = t - eventTime
strength = attack(age) * decay(age, duration)
```

Window-entry and handoff envelopes should begin at zero and preferably meet with
zero slope. Do not keep hidden mutable tween state that produces a different
frame after seeking.

## 6. Object-physics lessons

### Marble Music

The successful Marble model came from treating note times as real ballistic
contacts rather than keyframes.

- Use one bounded gravity model across the route.
- Solve each flight from contact state to the next deadline.
- Derive the platform normal from incoming and desired outgoing velocity.
- Offset contact by the marble radius so only the sphere surface touches.
- Reserve the entire swept route, not just platform centers.
- Allocate real depth and vary yaw/roll so 3D motion is visible in projection.
- Keep platform dimensions within authored physical and projected-size bounds.
- Damp camera position, target, distance, and roll separately; never derive zoom
  directly from a noisy bounce.
- Use a subtle world-space trail to reveal front/back travel.

Early failures and their replacements:

| Failed approach | Why it failed | Better model |
|---|---|---|
| Move only on notes | Read as teleportation | Continuous ballistic flight between deadlines |
| Exaggerate force to reach fixed targets | Produced implausible speed changes | Reposition and reorient targets through inverse solving |
| Center sphere on platform | Visible penetration | Radius-aware surface contact |
| Solve only adjacent platforms | Other platforms overlapped the route | Global or rolling occupancy certification |
| Crossfade regenerated layouts | Produced doubles, missing platforms, and pops | Move persistent platform identities through continuous transforms |
| Instant slider recompilation | Froze or snapped the world | Coalesced planning plus smooth plan activation |

For prerecorded mode, it is acceptable to pause while a complete certified
plan is rebuilt. For live mode, use a rolling horizon of approximately five to
eight committed interactions and keep later possibilities visibly unresolved.
These are different products and should not share one compromised planner.

### Music-Synced Brick Breaker

Brick Breaker improved when it became a collision itinerary rather than a list
of brick coordinates.

```text
brick -> wall -> paddle -> brick -> wall -> brick ...
```

Key rules:

- Reflection obeys `vOut = vIn - 2 * dot(vIn, n) * n`.
- Every beat owns a collision with a brick, wall, or paddle.
- Brick hits happen only on assigned musical deadlines.
- Wall and paddle contacts can be inserted between notes to make the route legal.
- Live-brick occupancy is time-dependent: destroyed bricks stop blocking later
  spans, but every unplayed brick remains solid.
- The paddle is a compiled actor with bounded position, speed, and acceleration.
- Dense passages use compact legal chains, not unbounded ball speed.
- The final note destroys the final brick; the ending is solved from the start.

The recognizable game grammar matters. Even a collision-valid path feels wrong
if it resembles straight-line target hopping rather than wall, paddle, and brick
reflection. Domain physics and audience expectation are both acceptance gates.

## 7. Continuous-field and shader lessons

Shaders are appropriate when the world invariant is a continuously changing
medium: electromagnetic density, refraction, fluid-like advection, interference,
volumetric light, procedural terrain, or another field whose identity is richer
than a set of meshes.

Shaders are not required when readable objects, collision ownership, character
behavior, or architectural interaction is the main idea. Marble Music and Brick
Breaker benefit from ordinary geometry and compiled motion. They may use shaders
for materials, trails, impact light, or atmosphere without making a fullscreen
shader the foundation.

### Choose the rendering architecture intentionally

| World requirement | Recommended foundation |
|---|---|
| Exact visible contacts between recognizable objects | Compiled geometry and analytic motion |
| A continuous medium is the subject | Field or raymarch shader |
| Objects drive a surrounding medium | Hybrid compiled physics plus shader field |
| Large ecosystem with many semantic actors | Agent simulation plus selective materials/effects |
| UI-like schematic or map | Vector/raster layout, not a volumetric shader |

### One shared field is stronger than stacked effects

Aurora initially looked like unrelated spheres, cloud streaks, spiral lines,
and flashes layered together. The successful correction made them consequences
of one accumulated potential:

- density basins create broad form;
- transported density creates mist;
- illuminated contours create filaments;
- note energy travels through those existing contours;
- history deforms the same medium into a wake;
- the reference weave uses the same coordinates and phase.

If an effect has independent coordinates, timing, palette, and motion, it will
usually look pasted on. Secondary detail should be gated by and warped through
the primary field.

### A shader must embody the concept, not decorate basic geometry

When Aurora was supposed to be fundamentally shader-driven, lit spheres and
toruses remained visibly basic objects regardless of material complexity. The
rebuild succeeded by making procedural density, folding, turbulence, and
integration produce the primary image. Conversely, a future object-centric
world should not hide readable mechanics merely to demonstrate shader skill.

### Dense notes should accumulate, not reset

Rapid notes looked abrupt when each onset retuned or replaced the field. A
better model keeps decaying note memory and derives phrase pressure from recent
event density. Attacks articulate an existing flow; they do not restart it.

- Interpolate continuous musical state between events.
- Accumulate bounded pressure, turbulence, or refractive strength.
- Simplify secondary detail as density rises.
- Keep a quiet baseline moving through silence.
- Reserve hard discontinuities for rare, authored structural moments.

### Anticipation needs negative space and a persistent reference

Aurora became more legible when future notes reserved space before they arrived
and a permanent world-anchored weave made deformation and travel perceptible.
An empty region, aperture, crease, or reduced-energy volume can preview a note
without drawing a literal target.

The preview envelope must be derived from absolute score time and have smooth
entry/exit behavior. Rotating a bounded shader-note window must not cause slot
replacement pops.

### Refraction is visible only against something that can bend

Phaseglass exposed a crucial optical lesson: glowing phase contours are not
refraction. Without a persistent background reference, the audience cannot see
light bending. Convincing glass requires:

- stable background structure with depth and high-frequency detail;
- a smooth phase gradient that displaces sampled rays;
- wavelength-dependent displacement for restrained chromatic separation;
- magnification, compression, shear, and focal movement;
- transmission and absorption that preserve the background relationship;
- caustics derived from ray convergence, not arbitrary bright rings.

Rendering the phase function as repeated bright contours made the result look
like water ripples. The correction was to use the phase gradient as a lens and
demote or remove the visible contour. Spherical aberration should appear as
depth-dependent focal displacement and bulging distortion, not as circles.

### Map musical dimensions through one coherent spectrum

Assigning arbitrary shapes to pitch ranges creates categories, not an
interconnected visual instrument. Phaseglass improved by mapping note data to
continuous optical modes:

- register -> defocus and spherical aberration;
- pitch class -> astigmatism axis;
- melodic interval -> signed coma and asymmetric shear;
- velocity -> phase depth, focus strength, and sharpness;
- duration -> aperture and persistence;
- onset spacing -> isolation versus interference.

The exact mapping will differ by world, but the principle is general: musical
features should control related dimensions of one material or physical model.
A soft note should not merely be a loud note with lower opacity.

## 8. Effects and camera lessons

Effects must have physical ownership. Their origin, direction, propagation,
and decay should come from the compiled contact or field state.

- Trails reveal direction and depth; they should not become opaque ribbons.
- Glow communicates energy but cannot substitute for form or synchronization.
- Impact flashes need bounded attack and decay and should preserve silhouettes.
- Fragments inherit collision velocity and normal; they do not explode in an
  arbitrary radial pattern unless the world justifies it.
- Background motion provides scale and reference, particularly in abstract
  scenes.
- Camera shake is rare, short, and bounded.

The camera is part of the synchronization system. Use critically damped or
similarly stable tracking with limits on position, angular speed, acceleration,
distance, roll, and field of view. Always preserve the hero interaction and
enough upcoming context. Scrubbing must reconstruct the same camera state or a
deterministic approximation without a jump.

## 9. Performance architecture

Optimization should preserve the world contract.

- Prefer closed-form propagation over per-frame integration when fields are
  constant or analytically solvable.
- Precompute prerecorded plans and sample them cheaply at runtime.
- Move expensive replanning to workers and coalesce rapidly changing inputs.
- Keep persistent entity identities when activating a new plan.
- Use bounded local windows for live or shader data.
- Limit raymarch resolution, step count, and active operators independently.
- Let adaptive quality remove secondary detail, not timing, silhouettes,
  collision geometry, or camera composition.
- Measure compiler latency and GPU frame time separately.

Moving code to C++ or WebAssembly is not the first optimization. First remove
unnecessary global recomputation, use analytic solutions, bound candidate sets,
cache invariant work, and profile the actual bottleneck. A language change is
justified only after those steps leave a measured hot kernel that cannot meet
its budget in the current architecture.

## 10. Diagnostics and acceptance

### Headless certification

Every compiler should emit a report containing timing errors, physical bounds,
occupancy clearance, rejected-candidate reasons, final-event ownership, and
determinism information. Randomized forward/inverse round trips are valuable
for analytic kernels.

### GPU and shader diagnostics

Black screens must produce evidence, not rollbacks by guesswork. Capture:

- shader compile and link logs with source and stage;
- WebGL error state;
- context-loss events;
- representative framebuffer pixel samples for black-frame detection;
- camera and musical uniforms at failure time;
- GPU quality tier and render-target dimensions.

### Human visual acceptance

Automated math cannot certify the metaphor. Review opening, sparse, dense,
transition, climax, final-note, and silent frames. Watch the complete track and
scrub exact deadlines. Validate 9:16 first, then desktop.

When screenshots repeatedly reveal the same wrong reading, change the
underlying visual model. Do not keep tuning opacity around a metaphor that reads
as the wrong material, such as water ripples in a glass world.

## 11. Failure patterns to reject early

| Pattern | Typical symptom | Required correction |
|---|---|---|
| Keyframed target hopping | Teleportation or straight-line motion | Back-solved continuous dynamics |
| Free runtime physics as clock | Drift and seek inconsistency | Compiled absolute-time plan |
| Endpoint-only checks | Tunneling and hidden collisions | Swept continuous certification |
| Geometry placed before physics | Implausible speed/force | Solve placement from deadlines |
| Crossfading world plans | Doubles, disappearances, sudden swaps | Persistent identities and transform activation |
| One flash per note | Technically synced but emotionally weak | Full event lifecycle |
| Per-note scene reset | Abrupt dense phrases | Decaying memory and accumulated pressure |
| Independent shader layers | Several unrelated visualizers | Shared coordinates, potential, and palette |
| Bright phase contours | Water-ripple reading | Bend a persistent reference field |
| Raw pitch-to-rainbow mapping | Arbitrary, inexpensive look | Authored multidimensional material spectrum |
| Bloom used as form | Milky image with no hierarchy | Preserve edges, values, and structure |
| Camera derived from raw bounce | Sudden position and zoom changes | Bounded damped camera state |
| Optimization by language rewrite | High cost with uncertain benefit | Profile and fix architecture first |

## 12. Multiple-note and multitrack preparation

Do not simply duplicate a successful one-note visual four times. First decide
whether the world represents simultaneous notes as agents, field modes, spatial
regions, or a compound event.

- Object worlds need collision and occupancy ownership for every agent.
- Shared-field worlds can superpose bounded modes, but must prevent uncontrolled
  brightness and frequency noise.
- Chords may become compound targets when simultaneous independent contacts are
  physically impossible.
- Track roles should control semantically different parameters only when those
  roles are stable and musically meaningful.
- Start with at most four prominent voices and document the voice-selection and
  handoff policy.

Dense polyphony should preserve one dominant world identity. Four tracks do not
justify four disconnected shaders.

## 13. New-world decision checklist

Before coding:

1. Write the one-sentence product invariant and anti-goals.
2. Identify immutable musical deadlines and continuous musical features.
3. Decide whether the subject is an object system, a continuous field, an
   ecosystem, a schematic, or a hybrid.
4. Name the physical law or clearly label the authored pseudo-physics.
5. Define the inverse problem and its bounded candidate variables.
6. Define continuous occupancy and certification requirements.
7. Map pitch, velocity, duration, spacing, and track role into related dimensions
   of one coherent model.
8. Define anticipation, attack, sustain, release, silence, and final resolution.
9. Define the persistent spatial reference and camera contract.
10. Set compiler, GPU, viewport, seeking, and export budgets.
11. Build a graybox that makes sync and physics easy to judge.
12. Promote visual quality only after the physical contract passes.

During iteration:

1. Diagnose whether a complaint is timing, behavior, physics, composition,
   material, performance, or metaphor.
2. Change one conceptual layer at a time.
3. Treat user screenshots and watch-through observations as acceptance evidence.
4. Preserve successful behavior while replacing the failed mechanism.
5. Record rejected approaches in the relevant implementation plan.
6. Keep the preview server, diagnostics, tests, production build, commits, and
   remote branch current.

## 14. Final principle

A successful Sound World makes the music feel causally responsible for a world
that would still have coherent space, material, and behavior without decorative
audio reactions. Exact mathematics establishes trust. Behavioral phrasing makes
the synchronization perceptible. Art direction makes it memorable. Choose
physics, shaders, geometry, simulation, and effects only in the combination that
best serves that particular world.
