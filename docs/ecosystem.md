# Ecosystem Worlds

**One-line pitch:** Sound Worlds ecosystems are active cities, habitats, natural
biomes, and fantasy ecologies that make causal sense before music is applied;
music then choreographs valid behavior and can also trigger explicitly authored
spectacle that bends or breaks ordinary world logic.

The implementation source of truth is the
[Music-synchronized ecosystem worlds roadmap](implementation/ecosystem-worlds-roadmap.md).

## The two musical channels

### Ecological choreography

Music may select, retime, or emphasize actions already possible in the world:
arrivals, feeding, pollination, traffic phases, maintenance, hunting, cleaning,
docking, growth, or resource transfer. These actions preserve agent needs,
collision, schedules, conservation, and causal consequences.

### Expressive spectacle

Music may deliberately exceed ordinary rules: buildings can disassemble in a
wave, day and night can cycle rapidly, water can part, a forest can breathe as
one structure, dungeon rooms can rotate, or a habitat can unfold. These are not
disguised ecological behaviors. They are typed render overrides, reversible
world transformations, or committed authored transitions with exact state
ownership and restoration rules.

## Planned worlds

### Pulse District

A city ecosystem of commuting, commerce, delivery, waste, construction,
maintenance, transit, occupancy, and power. It is the recommended first slice
because schedules, capacity, and intersection reservations are easy to audit.

### Tidal Reef

A reef ecology of current, algae, plankton, grazing, predation, cleaning,
shelter, spawning, waste, and nutrient transport. It introduces authoritative
flow fields shared by multiple agents.

### Mycelial Canopy

A layered rainforest coupling light and water competition, pollination, seed
dispersal, herbivory, predation, decay, and underground fungal exchange. It
tests slow ecological state against fast visible motion.

### Emberdeep Dungeon

A fantasy ecology where slimes, fungi, scavengers, guardians, traps, torches,
doors, residue, territory, fuel, and recovery form a coherent system. It is the
most interaction-heavy and should be built last.

### Halo Habitat

A rotating orbital habitat connecting residents, farms, oxygen, water, waste,
power, transit, drones, cargo, maintenance, docking, and artificial day/night.
It combines closed resource loops with precise mechanical choreography.

## Rendering policy

There is no mandatory style for the family. The domain determines the
architecture:

- cities and dungeons are primarily object/agent scenes;
- reefs and forests are hybrids with authoritative environmental fields;
- orbital habitats combine object systems, compiled trajectories, and selective
  atmosphere and power shaders.

Shaders clarify water, wind, light, nutrients, heat, power, or spectacle when
appropriate. They are not required merely because Aurora Cyclotron and
Phaseglass proved shader-first worlds can be compelling.

Every world needs a stable hierarchy: current hero action, next feasible action,
local causal context, ecosystem state, then background population and spectacle.
The no-music world remains alive through purposeful idle behavior,
environmental motion, and slow causal change.

## Synchronization model

- Up to four prominent voices own exact visible actions.
- Remaining music drives bounded environmental and systemic curves.
- Voice identity uses salience, continuity, sustain, and hysteresis.
- Actions match feasible affordance windows and are back-solved to deadlines.
- Dense passages simplify background articulation and accumulate activity rather
  than resetting simulation.
- The final event resolves a prepared causal or spectacle arc.

## Initial implementation order

1. Pulse District headless causal loop and one intersection.
2. Halo Habitat closed resources and logistics.
3. Tidal Reef shared current and population ecology.
4. Mycelial Canopy multi-timescale exchange.
5. Emberdeep Dungeon mixed mechanics and narrow-space conflicts.

Do not build a universal ecosystem engine first. Prove one small world, then
extract only abstractions that remain useful in the second.

## Acceptance principle

A reviewer should be able to explain why every prominent agent is present, what
it needs, what it is doing, and what changes because of that action. The reviewer
should also be able to identify which moments are valid ecological choreography
and which are intentionally reality-breaking spectacle.
