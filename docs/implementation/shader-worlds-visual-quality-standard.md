# Sound Worlds visual-quality and acceptance standard

This standard applies to every Sound World, including object-physics scenes,
shader-first fields, ecosystems, schematics, and hybrids. The filename remains
stable because existing implementation plans already link to it.

A rough first draft is expected while timing, inverse physics, occupancy,
seeking, and world invariants are unsettled. A world is not visually complete
because it is colorful, technically complex, physically certified, or built
with shaders.

Use this standard with the
[Sound Worlds engineering and design learnings](sound-worlds-engineering-learnings.md).

## Quality contract

Professional visual quality in Sound Worlds has six simultaneous requirements:

1. **Causal legibility** - the viewer can understand what the music is doing to
   this particular world.
2. **Temporal continuity** - anticipation, attack, sustain, release, silence,
   seeking, and dense phrases remain visually coherent.
3. **Physical or systemic credibility** - motion, material, fields, agents, and
   effects obey the declared model unless a spectacle explicitly breaks it.
4. **Compositional hierarchy** - current action, next action, context, history,
   and secondary detail have stable visual priority.
5. **Material and spatial identity** - the image has authored scale, depth,
   palette, light, surface, and atmosphere rather than generic glow.
6. **Technical durability** - the result survives still frames, full playback,
   seeking, export, target viewports, and the performance budget.

Failure in one category cannot be compensated for by strength in another.

## Architecture declaration

Before Q0, every concept declares one rendering foundation:

| Foundation | Primary evidence | Examples |
|---|---|---|
| Object-first | readable mechanics, contact, silhouette, material | Marble Music, Brick Breaker, Pendulum Cathedral |
| Field-first | one coherent procedural medium and reference frame | Aurora Cyclotron, Vortex Loom |
| Ecosystem-first | causal agents, resources, affordances, consequence | Pulse District, Tidal Reef |
| Schematic-first | topology, labels, flow, hierarchy | Metro Map |
| Hybrid | certified objects/systems plus authoritative field rendering | Phaseglass, Singularity Slalom, Halo Habitat |

The declaration identifies which state is authoritative, which effects are
derived, and what remains understandable when secondary effects are disabled.
Do not use shader-first rendering by habit. Do not use literal meshes when the
continuous medium is the concept.

## Promotion stages

### Q0 - Invariant and synchronization graybox

- Prove exact deadlines, behavioral synchronization, continuity, occupancy,
  seeking, final-event ownership, and camera containment.
- Use neutral materials and one diagnostic trail or field reference.
- Show contact normals, force/field axes, affordances, reservations, rejected
  candidates, and error bounds outside the exported frame.
- For ecosystems, run and inspect the no-music baseline before choreography.
- For field worlds, show that all visible layers share the same coordinates and
  authoritative potential.
- No final visual judgment is made beyond legibility and absence of rendering
  defects.

Promotion gate: a reviewer can explain the world invariant and identify every
test event without relying on color or labels.

### Q1 - Art-direction lock

Approve one concise visual thesis containing:

- architecture foundation and one dominant visual idea;
- material families and scale references;
- value hierarchy and brightest-value ownership;
- restrained palette and section-level color/exposure script;
- treatment of silence, dense phrases, and final resolution;
- explicit anti-goals based on likely category errors;
- three target frames: sparse, dense, and ending.

Pitch and velocity require multidimensional mappings within one authored model.
Pitch must not default to an unrestricted hue wheel. Velocity must change
appropriate energy, effort, deformation, scale, sharpness, group behavior, or
material response rather than opacity alone.

Promotion gate: still frames are recognizably the intended world and not a
generic game, sci-fi scene, particle demo, or shader experiment.

### Q2 - Composition, camera, and anticipation

Every frame establishes this hierarchy when the concept supports it:

1. current hero action or dominant field change;
2. next interaction, affordance, or reserved space;
3. recent trajectory, consequence, or memory;
4. environment and causal context;
5. secondary effects and background population.

Requirements:

- Validate 9:16 first, then desktop and export crops.
- Keep important subjects above minimum projected-size thresholds.
- Use overlap, parallax, scale, shadows, atmospheric perspective, trails, and a
  persistent reference to communicate depth.
- Compile or deterministically reconstruct camera position, target, distance,
  field of view, and roll.
- Bound camera angular velocity, acceleration, zoom rate, and shake.
- Anticipation is visible without drawing an arbitrary target marker: use route,
  composition, deformation, vacancy, affordance, gaze, or environmental setup.
- Dense passages simplify low-priority detail instead of hiding exact events.

Promotion gate: muted playback still communicates where attention should move;
audio playback makes that movement feel causally synchronized.

### Q3 - Materials, fields, lighting, and spatial coherence

Shared requirements:

- Use linear-light calculations, explicit color-space handling, controlled
  exposure, filmic tone mapping, and bloom thresholds that preserve form.
- Materials have coherent roughness, transmission, absorption, emission, shadow,
  and scale response.
- Eliminate clipping, temporal swimming, unstable normals, NaNs, banding,
  disocclusion artifacts, halos, and visible render-resolution seams.
- Darkness and negative space remain intentional; black frames do not.
- Adaptive quality changes samples and secondary detail, never authoritative
  state, event timing, collision geometry, semantic silhouettes, or composition.

Architecture-specific requirements appear below.

Promotion gate: representative frames remain strong with motion paused, bloom
reduced, and diagnostic overlays disabled.

### Q4 - Musical expression, effects, and spectacle

- Every effect has physical or systemic ownership: origin, direction,
  propagation, attack, sustain, decay, and brightness cap.
- Rapid notes accumulate bounded phrase pressure or coordinated activity rather
  than resetting the scene.
- Silence preserves baseline world motion while opening visual space.
- Sustained notes remain visually attached to their sound.
- Large spectacle is prepared and reserved for meaningful musical structure.
- Ordinary notes receive precise, elegant responses rather than equal maximum
  intensity.
- Trails reveal direction and depth without becoming opaque ribbons.
- Ecosystem choreography and reality-breaking spectacle are reviewed separately.
- Reversible spectacle proves exact restoration; committed spectacle proves new
  state reconciliation.

Promotion gate: a reviewer can describe how pitch, velocity, duration, spacing,
and phrase density shape the world without listing arbitrary disconnected
effects.

### Q5 - Final acceptance

- Watch the complete track with audio and then in silence.
- Scrub exact events, random times, loop boundaries, section changes, and the
  final audio tail.
- Capture opening, sparse, dense, transition, climax, final-note, and silent
  reference frames at every target viewport.
- Capture short motion clips for anticipation, impact, dense phrases, camera
  transitions, and ending resolution.
- Verify full-song frame time, memory, compiler latency, checkpoint/replay cost,
  and export consistency.
- Remove diagnostics, placeholder geometry, debug palettes, accidental UI, and
  effects justified only by technical novelty.
- Record known compromises for every adaptive quality tier.

Promotion gate: physics/system certification, visual review, performance, and
the full audio watch-through all pass. Engineering completion alone is not
visual completion.

## Object-first world requirements

- The neutral-material scene explains every interaction without glow.
- Contact geometry is radius-aware and never visibly penetrates.
- Rendered normals and outgoing trajectories agree.
- Compound object parts share stable local transforms and never float apart.
- Materials reinforce function: impact surface, support, mechanism, and
  decoration remain distinguishable.
- Regenerated plans move persistent identities through continuous transforms;
  they do not crossfade duplicate worlds.
- Effects inherit contact position, velocity, normal, and material.

Stop promotion if the motion reads as teleportation, target hopping, weightless
keyframes, or unexplained acceleration even when deadlines are exact.

## Field-first and shader requirements

- One accumulated field, coordinate system, or transported state owns the image.
- Secondary filaments, mist, particles, contours, and flashes are warped and
  gated by that field rather than layered independently.
- A persistent spatial reference makes deformation, travel, scale, and
  anticipation visible.
- Dense phrases accumulate into one medium instead of retuning or replacing it.
- Shader-note windows use smooth absolute-time entry and handoff envelopes.
- Refraction bends a reference field; bright phase contours alone are not glass.
- Caustics arise from convergence or the declared optical model, not decorative
  rings.
- Screen-space detail cannot contradict the depth or motion of the field pass.
- The primary concept remains visible with post-process bloom disabled.

Stop promotion when the result looks like unrelated shaders stacked together,
basic meshes wearing procedural materials, water ripples in a non-water world,
or a generic nebula unrelated to the compiled physics.

## Ecosystem-first requirements

- The no-music world is coherent, alive, and deterministic.
- Every prominent agent has a role, need, capability, and causal consequence.
- Resource, schedule, capacity, and population diagnostics stay within bounds.
- Music selects feasible affordances rather than directly puppeting agents.
- Up to four hero voices retain stable identity and space-time reservations.
- Background aggregation preserves totals and causal pressure.
- Environmental shaders consume authoritative water, wind, light, heat, power,
  or nutrient state.
- Reality-breaking spectacle has explicit simulation coupling and restoration.
- The camera shows places and processes rather than rapidly chasing agents.

Stop promotion when agents appear busy but purposeless, every creature reacts to
every beat, the shader invents ecology, or spectacle silently corrupts world
state.

## Schematic-first requirements

- Topology and semantic hierarchy remain correct at every quality tier.
- Labels, routes, symbols, and moving agents never overlap incoherently.
- Color is redundant with shape, pattern, motion, or label where meaning matters.
- Musical motion follows the data structure rather than decorative screen paths.
- Camera and zoom preserve legibility and stable scale transitions.

Stop promotion when polish obscures topology or motion implies connections that
the compiled data does not contain.

## Hybrid-world requirements

- Authoritative object/system state and visual field state have an explicit
  boundary.
- The shader derives from compiled mass, force, refraction, current, atmosphere,
  power, or another named quantity.
- Geometry remains readable when field detail is reduced.
- Field response remains spatially attached to geometry and does not become a
  separate full-screen visualizer.
- Depth integration, occlusion, and color/exposure are coherent across passes.

Stop promotion when neither the objects nor the field can explain the event on
their own terms, or when reducing shader quality changes apparent physics.

## Palette, exposure, and material discipline

- Define a small base palette plus rare accents with explicit ownership.
- Use pitch to move within a material/palette manifold, not across every hue.
- Reserve white and highest luminance for current musical/causal importance.
- Keep exposure stable across ordinary notes; avoid per-note automatic-exposure
  pumping.
- Distinguish emission from reflected light and preserve shadow information.
- Validate color on dark, midtone, and highlight frames and under common display
  brightness conditions.
- Avoid one-note palettes dominated by one hue family unless the concept demands
  it and material/value contrast remains strong.

## Effects and transition discipline

- Effects never repair unclear physics or composition.
- Opacity crossfades do not replace continuous geometry or state transitions.
- Camera shake, chromatic separation, lens distortion, particles, and bloom are
  bounded accents.
- Anticipation does not prematurely trigger the payoff effect.
- Final-note effects begin from a prepared state and resolve through the tail.
- Section transitions preserve world identity even when spectacle breaks normal
  rules.

## Technical diagnostics

Every promoted world records:

- compiler and certification report;
- camera position, target, distance, and angular-rate traces;
- effect attack/sustain/release envelopes;
- GPU frame-time and memory traces;
- shader compile/link logs and context-loss handling where applicable;
- black-frame pixel sampling for shader passes;
- checkpoint/replay or arbitrary-seek equivalence;
- projected-size and safe-area violations;
- adaptive-quality state and compromises.

## Review stop conditions

Pause visual iteration and revisit the underlying model when:

- repeated screenshots evoke the wrong material or genre;
- exact notes are hidden by camera, bloom, or secondary effects;
- dense notes produce cuts, resets, or shader-slot pops;
- every note appears structurally identical despite different musical data;
- several effects look disconnected from one another;
- refraction, gravity, current, or another named physical idea is not perceptible;
- the no-music ecosystem does not make sense;
- performance fixes alter timing, silhouettes, or world state.

Do not spend multiple passes tuning opacity around a failed metaphor.

## Required artifacts

Every concept promoted beyond Q0 adds:

- one-page product invariant and rendering-architecture declaration;
- one-page art-direction brief with explicit anti-goals;
- music-to-visual/material mapping table;
- palette, exposure, and section script;
- camera and effect-envelope diagnostics;
- seven approved reference frames and five short motion clips;
- no-audio and full-audio review notes;
- full-song compiler/GPU/memory trace;
- seeking and final-tail verification;
- adaptive-quality compromise list;
- rejected-approach log when visual review changes the underlying model.

The approved artifacts are part of the implementation contract, not optional
marketing material.
