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

### 2. Musical intent layer

Separate discrete hero voices from continuous track influence:

- Up to four stable prominent note voices own exact visible actions.
- Other notes and tracks contribute bounded continuous curves such as energy,
  brightness, density, tension, weather, color temperature, or activity rate.
- Voice assignment uses salience, track role, pitch continuity, sustain, and
  hysteresis so visual identities do not flicker between tracks.
- Notes become `ActionIntent` records; they do not directly mutate entities.

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

## Implementation work orders

### E0 - Domain invariants and headless toy world

- Choose one world, recommended Pulse District, and model one closed causal loop
  with fewer than 50 agents and no music.
- Define conservation, capacity, liveness, deadlock, and determinism diagnostics.
- Gate: one simulated hour is deterministic and no agent lacks a valid role.

### E1 - Fixed-step simulation and checkpoints

- Build an ECS-like state model, deterministic RNG streams, spatial index,
  scheduled processes, and fixed checkpoints for arbitrary seeking.
- Gate: checkpoint restore matches uninterrupted simulation byte-for-byte.

### E2 - Affordance extraction

- Predict bounded future action windows without mutating world state.
- Emit preconditions, consequences, physical family, and camera relevance.
- Gate: accepting an affordance preserves all domain invariants.

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

### E6 - Rendering, shaders, and scalable populations

- Use instancing, animation atlases, LOD, pooled agents, and deterministic crowd
  aggregation. Hero agents retain full trajectories; background populations may
  use statistically equivalent groups while preserving resource totals.
- Gate: 60 FPS target with unchanged simulation results across visual quality.

### E7 - Acceptance

- Run no-music coherence, exact-sync, multi-voice, lifecycle, collision,
  arbitrary-seek, full-song, camera, performance, and human legibility audits.
- Require reviewers to explain each visible agent's role and each musical event's
  causal meaning before the world is promoted beyond engineering preview.

## Recommended order

1. Pulse District: best scheduling primitives and easiest causal loops to audit.
2. Halo Habitat: reuses transit/logistics while adding closed resource systems.
3. Tidal Reef: introduces shared flow and population ecology.
4. Mycelial Canopy: adds slow/fast timescales and distributed resource exchange.
5. Emberdeep Dungeon: combines the widest range of interactions and conflicts.

Do not build a universal ecosystem framework first. Complete one small Pulse
District vertical slice, then extract only the abstractions proven common by a
second world.
