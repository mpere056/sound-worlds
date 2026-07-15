# Music-synchronized ecosystem worlds roadmap

This document records a future family of active worlds: cities, habitats,
natural ecosystems, and fantasy ecologies whose inhabitants have coherent
roles, needs, resources, movement, and consequences before music is applied.
Music then operates through two deliberately different channels: it can
choreograph valid ecological behavior, and it can introduce authored spectacle
that bends or breaks the world's normal rules for musical impact.

This is a planning document only. Do not add ecosystem runtime code until a
small headless vertical slice and its invariants are approved.

## Product invariant

At song time zero, the world must already make sense as a deterministic system.
Every visible agent belongs to at least one causal loop:

```text
resource -> producer -> transporter/consumer -> waste -> recovery -> resource
```

An agent may be decorative only when it communicates a real process such as
weather, current, heat, traffic density, pollination, or power flow. The
ecological choreography channel may retime an action inside its feasible window,
select among valid actions, or amplify its consequence. That channel may not
teleport agents, erase needs, create impossible collisions, or make unrelated
objects twitch on every beat. The spectacle channel is intentionally allowed to
violate ordinary appearance, geometry, scale, time-of-day, lighting, or physics
when the violation is authored as the musical event.

The two music channels must remain explicit in plans, schemas, diagnostics, and
review language:

1. **Ecological choreography** selects or retimes behavior the world could
   already perform. It preserves needs, causality, collision, and resource
   accounting.
2. **Expressive spectacle** is allowed to violate ordinary appearance, geometry,
   time, scale, or physics. It has explicit ownership, coupling, restoration,
   and camera-safety contracts.

Do not weaken spectacle until it becomes ordinary ecology, and do not disguise
an impossible ecological action as choreography. Both channels are valuable
because they do different jobs.

The shared lessons in
[Sound Worlds engineering and design learnings](sound-worlds-engineering-learnings.md)
apply to every ecosystem. Music is not an after-the-fact pulse layer, shaders
are optional tools rather than a required foundation, and dense music should
accumulate bounded pressure instead of resetting the world.

## Shared architecture

### 1. World truth layer

Use a deterministic fixed-step simulation with explicit components:

- agents: identity, role, needs, inventory, state, destination, capabilities;
- resources: amount, location, production, consumption, decay, regeneration;
- environment: light, temperature, weather, current, terrain, hazards;
- spatial graph: roads, paths, territories, habitats, work zones, transfer nodes;
- processes: schedules, growth, feeding, trade, maintenance, decomposition;
- relationships: ownership, pursuit, avoidance, cooperation, dependence;
- diagnostics: conservation errors, starvation, deadlock, congestion, and churn.

The baseline simulation must run without music and pass domain invariants.

Use multiple timescales rather than forcing every process into one expensive
tick. Fast motion, schedules, resource transfer, population trends, and climate
may use different deterministic update cadences with declared handoff rules.
Background populations may be aggregated only when totals, causal pressure, and
hero-agent affordances remain equivalent.

### 2. Musical intent layer

Separate discrete hero voices from continuous track influence:

- Up to four stable prominent note voices own exact visible actions.
- Other notes and tracks contribute bounded continuous curves such as energy,
  brightness, density, tension, weather, color temperature, or activity rate.
- Voice assignment uses salience, track role, pitch continuity, sustain, and
  hysteresis so visual identities do not flicker between tracks.
- Notes become `ActionIntent` records; they do not directly mutate entities.
- Voice handoff occurs only at musically and behaviorally valid boundaries.
- Velocity changes effort, urgency, group size, material response, or consequence
  according to the domain action; a loud note is not merely more glow.
- Silence restores idle ecology and environmental motion; it does not pause the
  world clock.

```ts
interface ActionIntent {
  voiceId: string;
  trackId: string;
  deadline: number;
  pitch: number;
  velocity: number;
  duration: number;
  salience: number;
}
```

### 3. Affordance and choreography layer

The simulation exposes feasible future actions:

```ts
interface Affordance {
  agentId: string;
  action: string;
  earliest: number;
  latest: number;
  contactRegion: string;
  preconditions: string[];
  consequences: string[];
  physicsFamily: string;
}
```

Assign intents to affordances with deterministic min-cost matching:

```text
cost = deadlineError
     + voiceIdentityChange
     + physicalEffort
     + collisionRisk
     + ecologicalDisruption
     + cameraOcclusion
     + repetition
```

Deadline error is a hard constraint for explicitly synchronized actions. If no
valid affordance exists, do not force an ecological agent into an impossible
action. Route the musical intent to the separately authored spectacle layer,
which may be compatible with the world or intentionally reality-breaking.

### 4. Expressive spectacle layer

Spectacle is not constrained to behavior the ecosystem would perform on its
own. It has three explicit modes:

```ts
interface SpectacleIntent {
  mode: "render-override" | "reversible-world" | "authored-transition";
  start: number;
  end: number;
  affectedIds: string[];
  simulationCoupling: "none" | "bounded" | "commit";
  restoration?: "exact" | "new-certified-state";
}
```

- `render-override` may rapidly change sun position, day/night, color, building
  lights, apparent gravity, scale, or sky without feeding those impossible
  values into the ecological simulation.
- `reversible-world` may disassemble buildings, fold streets, suspend agents,
  liquefy architecture, or send geometry waves through the scene. It owns
  collision-safe transforms and restores exact authoritative state afterward.
- `authored-transition` may permanently damage, rebuild, transform, or relocate
  part of the world. It commits a new certified simulation state at a declared
  boundary and defines how displaced agents and resources are reconciled.

Spectacle may be surreal and physically impossible. It still needs deterministic
timing, bounded geometry, camera safety, and explicit state ownership so a visual
effect does not accidentally corrupt unrelated simulation data.

Every spectacle defines anticipation, attack, sustain, restoration, and tail.
A reversible event must prove exact restoration under forward playback, random
seeking, cancellation, and overlap with another spectacle. A committed
transition emits the new authoritative state and a reconciliation report for
agents, resources, paths, and cameras.

### 5. Physics retiming layer

Back-solve bounded motion so the selected action arrives exactly on its note:

```text
p1 = p0 + v0*dt + 0.5*a*dt^2
v1 = v0 + a*dt
```

Road agents use jerk-limited speed profiles; pedestrians and creatures use
navmesh paths plus acceleration-bounded steering; swimmers use drag and flow;
flying agents use lift/turn-radius constraints; orbital agents use closed-form
or numerically certified trajectories. Every planned motion reserves a
space-time corridor, and conflicts among the four hero voices use prioritized
planning followed by deterministic conflict repair.

### 6. Multi-scale synchronization

- note: footsteps, arrivals, bites, turns, door actions, flashes, impacts;
- beat: local traffic/light phases, flock compression, machinery cycles;
- bar: crowd flow, tide pulses, weather cells, district activity waves;
- section: ecological shifts such as migration or work schedules, plus spectacle
  such as rapid day/night cycling, impossible weather, or global scale changes;
- final note: a causally prepared world-resolution event, never an arbitrary cut.

World-scale shader or geometry waves may disassemble and reassemble structures.
Reversible spectacles retain indexed home transforms and exact restoration;
authored transitions instead produce an explicit new world state.

### 7. Rendering and visual hierarchy policy

Choose rendering from the domain rather than forcing all worlds into one style:

- cities and dungeons are primarily object/agent worlds with selective material
  and spectacle shaders;
- reefs and canopies may use shared water, wind, light, or nutrient shaders
  while agents remain semantic objects;
- orbital habitats use object geometry plus bounded field visualization for
  power, atmosphere, and windows;
- a shader may visualize authoritative state but may not invent agent state or
  hide failed choreography.

Every frame needs a hierarchy: current hero action, next affordance, local causal
context, ecosystem state, then spectacle and background population. Dense
passages reduce background articulation before hero readability.

The camera follows places and processes more often than individual agents. Use
stable district, habitat, or territory framing with bounded transitions. Exact
hero actions remain visible without four tracking cameras fighting for control.

### 8. Offline compilation, checkpoints, and seeking

The first ecosystem products are prerecorded. Run the baseline simulation,
extract affordances, assign music, back-solve hero actions, reserve space-time,
and compile spectacle before playback. Store deterministic checkpoints and
event logs so arbitrary seeking restores authoritative state and visual history.

Runtime agents may animate locally from compiled state, but runtime simulation
does not own musical deadlines. Live ecosystem performance is a separate later
architecture with rolling affordance windows and explicit uncertainty.

## Five example worlds

### 1. Pulse District

A dense city district with residents, cars, buses, deliveries, shops,
construction, utilities, and building occupancy. The causal loops are commute,
commerce, delivery, waste collection, maintenance, and power demand.

Physics and systems:

- lane graphs, car-following, braking distance, traffic-light reservations;
- acceleration-bounded pedestrian navigation and reciprocal avoidance;
- transit timetables, curb capacity, delivery inventory, and power load;
- structural facade pieces with indexed rest poses for traveling beat waves.

Music bindings:

- prominent voices own intersection arrivals, transit stops, door events, and
  construction actions;
- rhythm controls valid signal phases and district activity waves;
- section energy moves sunrise, office occupancy, evening lights, and nightlife;
- a building can disassemble/reassemble as a certified spatial wave while its
  entrances, occupants, and structural rest state remain coherent.
- spectacle may rapidly cycle day/night, flicker entire facades, fold roads, or
  send impossible masonry waves through the skyline independently of schedules.

Multi-voice suitability: excellent. Road, pedestrian, transit, and utility
voices can remain distinct while sharing reservations at intersections.

World invariant: every visible trip, light phase, delivery, construction action,
and utility response belongs to a schedule, demand, inventory, or maintenance
loop. Cars do not circulate solely to fill the frame.

Rendering architecture: object-first agent world with instanced traffic and
pedestrians, authored buildings, and selective shaders for windows, power flow,
weather, and reversible masonry spectacle.

First vertical slice: one four-way intersection, two shops, one bus stop, one
delivery loop, one waste pickup, and one power feeder with fewer than 40 agents.
Compile four hero voices into a signal phase, bus arrival, pedestrian door
event, and delivery contact without deadlock.

Acceptance gates:

- no-music traffic completes purposeful trips without collision or gridlock;
- signal retiming remains legal and preserves downstream capacity;
- every synchronized arrival has a visible cause and consequence;
- a facade wave restores every indexed piece and never blocks an authoritative
  entrance;
- camera framing shows the intersection process rather than chasing one car.

Principal risk: a busy city can look active while its agents are meaningless.
Audit trip purpose, inventory transfer, and occupancy before adding population
or lighting spectacle.

### 2. Tidal Reef

A coral reef where sunlight supports algae and plankton, grazers feed, predators
hunt, cleaners remove parasites, waste returns nutrients, and currents transport
food and larvae. Population behavior follows energy and habitat, not random
boid motion.

Physics and systems:

- divergence-limited current field, buoyancy, drag, turn radius, schooling, and
  obstacle avoidance around coral volumes;
- energy budgets, feeding zones, predator risk, cleaning stations, shelter,
  spawning windows, nutrient transport, and day/night behavior;
- deterministic population caps and lifecycle abstraction rather than expensive
  individual reproduction simulation for every background agent.

Music bindings:

- voices own feeding arrivals, coordinated turns, cleaning contacts, and
  bioluminescent signaling;
- bass and low-frequency energy shape currents and large-animal motion;
- higher notes drive plankton sparkle and small-school articulation;
- sections control tide, sunlight depth, nocturnal emergence, and spawning glow.
- spectacle may part the water, turn the reef into luminous ribbons, reverse the
  apparent current, or temporarily suspend the ocean as layered geometry.

Multi-voice suitability: good. Four hero swimmers can share a passive current,
but current edits must be globally validated because they affect every swimmer.

World invariant: movement transfers energy, food, risk, parasites, larvae, or
nutrients. Schooling is a strategy inside current and predator constraints, not
decorative boid noise.

Rendering architecture: hybrid agent/field world. Fish and coral remain
semantic geometry; current, suspended nutrients, caustic light, and
bioluminescence use shared field shaders driven by authoritative environment.

First vertical slice: one coral shelter, one grazing patch, one cleaning station,
one current loop, two grazer species, one cleaner, and one predator. Four hero
actions cover feeding, coordinated turning, cleaning contact, and shelter entry.

Acceptance gates:

- current remains bounded and divergence-limited around coral obstacles;
- feeding energy and motion cost remain within the declared ledger;
- hero paths reserve swept volumes and do not cut through coral or schools;
- current visuals, particles, and fish drift agree on direction;
- water-parting spectacle decouples simulation exactly or commits a separately
  certified state.

Principal risk: current edits have global consequences. Prefer local behavior
retiming and render-only current spectacle until whole-population revalidation
is fast and reliable.

### 3. Mycelial Canopy

A layered rainforest with water, light competition, plant growth, pollination,
seed dispersal, herbivory, predation, decay, and a visible underground fungal
network returning nutrients to roots.

Physics and systems:

- branch and vine spring systems, wind fields, rain particles, canopy collision,
  climbing/flying navigation, and soil-water transport;
- plant energy, flowering windows, pollinator routes, fruit/seed transfer,
  decomposition, fungal exchange, and regeneration after damage;
- slow ecological state separated from fast visible motion.

Music bindings:

- voices own pollinator arrivals, seed releases, branch landings, and fruit
  transfers;
- rhythm launches canopy wind waves and rain patterns with physical propagation;
- sustained notes illuminate nutrient movement through the mycelial network;
- sections move dawn, heat, storms, flowering, and nocturnal activity.
- spectacle may make the canopy breathe as one structure, expose glowing roots,
  reverse rainfall, or fold the forest into impossible repeating layers.

Multi-voice suitability: good. Separate canopy layers reduce collisions, while
the nutrient and water systems provide meaningful shared modulation.

World invariant: visible growth and animal activity arise from light, water,
nutrient, pollination, predation, and decay flows. The underground network is a
resource exchange system, not merely glowing lines.

Rendering architecture: multi-timescale hybrid. Plants, branches, creatures,
and transfers are semantic objects; wind, rain, dappled light, and mycelial
transport use shaders fed by authoritative spring, weather, and resource fields.

First vertical slice: two plants competing for light, one fungal exchange link,
one flowering/pollination loop, one decomposer patch, and one branch corridor.
Four hero actions cover pollinator arrival, seed release, branch landing, and
nutrient transfer.

Acceptance gates:

- slow growth is identical across checkpoint cadence;
- water and nutrient totals close within declared regeneration and decay;
- fast wind and creature motion cannot retroactively change compiled slow state;
- glowing mycelium follows measured transfer direction and amount;
- canopy-breathing spectacle restores branch collision and plant anchors.

Principal risk: slow ecology is difficult to perceive within one song. Use a
pre-song equilibrium and section-scale compiled changes, not unrelated
note-by-note spawning disguised as growth.

### 4. Emberdeep Dungeon

A fantasy dungeon treated as an ecology rather than a room of unrelated
monsters. Slimes consume residue, fungi process waste, small creatures move
spores and scavenged items, territorial creatures control passages, traps defend
resources, torches consume fuel, and occasional explorers alter the balance.

Physics and systems:

- navmesh territories, pursuit/avoidance, line of sight, soft-body slime motion,
  rigid-body traps, projectile arcs, doors, fluids, heat, and light;
- food/residue, territory, treasure transport, trap reset, torch fuel, fungal
  growth, scavenging, rest, injury, and recovery loops;
- explicit rules for why each creature occupies its region and what it consumes.

Music bindings:

- voices own patrol turns, trap releases, slime compressions, door actions, and
  spell contacts when their preconditions are valid;
- beats propagate rune light, torch ignition, and masonry waves;
- sections alter alertness, magical pressure, explorer presence, and dungeon
  power without spawning arbitrary encounters.
- spectacle may rotate rooms, dissolve walls into runes, reverse gravity, or
  rebuild masonry in a beat wave without pretending those are ordinary ecology.

Multi-voice suitability: medium. Strong interactions are expressive, but
combat, soft bodies, projectiles, and narrow corridors create costly conflicts.

World invariant: every creature, trap, flame, fungus, item, and passage exists
inside a resource, territory, defense, maintenance, or decomposition loop.
Fantasy rules remain consistent until an explicit spectacle breaks them.

Rendering architecture: object-first simulation with selective soft-body,
fluid, heat, rune, and lighting shaders. Rooms, routes, creature roles, and trap
mechanics take priority over generalized magical fog.

First vertical slice: two connected rooms containing one slime-residue loop,
one fungal decomposer, one scavenger route, one territorial guardian, one
fuel-consuming torch, and one resettable trap. Hero actions are patrol turn,
trap release, slime compression, and door transfer.

Acceptance gates:

- no-music simulation reaches a bounded ecology instead of eliminating agents;
- corridor reservations prevent creature, projectile, and door conflicts;
- trap reset and torch fuel are explicit processes;
- rune effects have local ownership rather than becoming generic beat flashes;
- room rotation restores navmesh, doors, colliders, and agents exactly.

Principal risk: the domain invites feature explosion. Do not add procedural
rooms, broad combat, or many species before the two-room loop passes seeking and
musical choreography.

### 5. Halo Habitat

A rotating orbital habitat with residents, farms, water recovery, oxygen,
energy storage, maintenance drones, cargo, transit, docking spacecraft, and a
simulated day/night cycle. Every visible machine supports habitation.

Physics and systems:

- rotating-frame gravity, Coriolis-aware motion where visible, rail transit,
  docking trajectories, drone steering, pressure zones, and solar orientation;
- oxygen/carbon dioxide, crops, water, waste recovery, power generation/storage,
  maintenance tasks, cargo transfer, and resident schedules;
- subsystem failures remain bounded and recoverable in a visualization context.

Music bindings:

- voices own docking contacts, drone maintenance arrivals, transit stops, and
  greenhouse operations;
- rhythm drives power-routing waves, solar-panel articulation, and habitat lights;
- sections control the artificial sun, work shifts, orbital shadow, and energy
  reserve states;
- the final note may complete a docking, restore a subsystem, or reveal the
  fully illuminated habitat after causally scheduled preparation.
- spectacle may open the habitat ring, multiply the artificial sun, reverse
  apparent rotation, or disassemble whole decks into synchronized light grids.

Multi-voice suitability: excellent. Transit, docking, maintenance, and life
support provide naturally separate voices joined by shared power and schedules.

World invariant: every visible machine and schedule supports habitation through
air, water, food, power, maintenance, transport, or cargo. Rotation and
artificial day/night affect the same authoritative environment.

Rendering architecture: object-first systems world with compiled orbital and
transit motion plus selective shaders for atmosphere, greenhouse light, power
flow, windows, and reversible habitat spectacle.

First vertical slice: one rotating segment with a greenhouse, water recovery
unit, battery, maintenance drone, rail stop, and docking port. Four hero voices
own docking, repair arrival, transit stop, and crop/water operation.

Acceptance gates:

- air, water, crop, waste, and power ledgers remain bounded;
- rotating-frame motion and docking use declared reference frames;
- synchronized loads cannot consume unavailable power or bypass maintenance;
- artificial-day spectacle is render-decoupled unless climate is recompiled;
- habitat-opening spectacle preserves pressure zones and occupants through exact
  decoupling or a certified transition.

Principal risk: dashboards disguised as scenery can overwhelm the world. Keep
resource truth in diagnostics while visualizing it through inhabitants, light,
machinery, and spatial consequence rather than labels.

## Implementation work orders

### E0 - Domain invariants and headless toy world

- Choose one world, recommended Pulse District, and model one closed causal loop
  with fewer than 50 agents and no music.
- Define conservation, capacity, liveness, deadlock, and determinism diagnostics.
- Gate: one simulated hour is deterministic and no agent lacks a valid role.
- Add a no-music causal audit tracing each visible agent to a resource, schedule,
  relationship, or environmental process.

### E1 - Fixed-step simulation and checkpoints

- Build an ECS-like state model, deterministic RNG streams, spatial index,
  scheduled processes, and fixed checkpoints for arbitrary seeking.
- Gate: checkpoint restore matches uninterrupted simulation byte-for-byte.
- Separate fast motion, schedules, resource transfer, and population timescales;
  render quality and frame rate must not alter any layer.

### E2 - Affordance extraction

- Predict bounded future action windows without mutating world state.
- Emit preconditions, consequences, physical family, and camera relevance.
- Gate: accepting an affordance preserves all domain invariants.
- Record why rejected affordances fail and how long each valid window remains
  feasible under neighboring plans.

### E3 - Music intent and four-voice assignment

- Add cross-track salience, sustain-aware top-four selection, hysteresis, stable
  voice IDs, and deterministic min-cost intent-to-affordance matching.
- Gate: shuffled tracks and near-equal salience do not cause voice flicker.

### E4 - Physics back-solving and space-time reservations

- Implement domain motion solvers and shared 4D reservations.
- Use prioritized planning, then conflict-based repair for the four hero voices.
- Gate: exact deadlines, no collisions, bounded acceleration, and no teleporting.

### E5 - Environmental music and spectacle layers

- Map non-hero tracks to bounded, filtered curves for weather, light, activity,
  shader fields, and systemic rates.
- Add separately typed render overrides, reversible-world effects, and authored
  transitions with explicit coupling and restoration policies.
- Gate: ecological modulation preserves invariants; spectacle may violate normal
  world logic but cannot ambiguously mutate authoritative simulation state.
- Add overlap, interruption, random-seek, exact-restoration, and committed-state
  reconciliation tests for every spectacle family.

### E6 - Rendering, shaders, and scalable populations

- Use instancing, animation atlases, LOD, pooled agents, and deterministic crowd
  aggregation. Hero agents retain full trajectories; background populations may
  use statistically equivalent groups while preserving resource totals.
- Gate: 60 FPS target with unchanged simulation results across visual quality.
- Require an architecture declaration per world: object-first, field-first, or
  hybrid, including which shader inputs are authoritative and which are visual.

### E7 - Acceptance

- Run no-music coherence, exact-sync, multi-voice, lifecycle, collision,
  arbitrary-seek, full-song, camera, performance, and human legibility audits.
- Require reviewers to explain each visible agent's role and each musical event's
  causal meaning before the world is promoted beyond engineering preview.
- Review choreography and spectacle separately: ordinary behavior remains
  internally valid, while reality-breaking effects are intentional, reversible
  or explicitly committed, and visually consequential.

## Recommended order

1. Pulse District: best scheduling primitives and easiest causal loops to audit.
2. Halo Habitat: reuses transit/logistics while adding closed resource systems.
3. Tidal Reef: introduces shared flow and population ecology.
4. Mycelial Canopy: adds slow/fast timescales and distributed resource exchange.
5. Emberdeep Dungeon: combines the widest range of interactions and conflicts.

Do not build a universal ecosystem framework first. Complete one small Pulse
District vertical slice, then extract only the abstractions proven common by a
second world.
