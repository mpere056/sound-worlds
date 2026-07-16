# Lumenfall

## Concept

Lumenfall is a one-note-at-a-time world in which a small luminous body travels
through a pre-existing nocturnal environment. Every selected note is an exact
surface contact. Between notes, the body follows a continuous gravity arc. At
each contact it reflects, receives a bounded musical impulse, and begins the
next certified arc.

The body is called *light* in the visual language, but it is not presented as
a literal photon. It is a radiant physical body: gravity and collision explain
its motion, while physically based lighting explains how the surrounding world
is revealed.

## What the audience sees

Silence does not remove the world. A dark, wet landscape already exists:
fractured basalt terraces, shallow water seams, worn edges, and distant forms
barely held above black. The environment is quiet and spatially legible, but
most of it remains unseen until the moving light reaches it.

When the music begins:

1. a compact white luminous body crosses the frame on a readable parabola;
2. its position illuminates nearby stone, water, ridges, and recesses;
3. it reaches a real surface exactly when the note sounds;
4. the impact creates a brief, material-aware light response;
5. it leaves the surface continuously and arcs toward the next note;
6. previously revealed terrain falls back into darkness as distance increases.

The result should feel like the song is discovering a real place one collision
at a time. The landscape supplies scale and consequence. The light supplies
attention, motion, and musical timing.

## World invariant

The world exists before route compilation and is not rearranged for the song.
Its render mesh, collision mesh, materials, wetness, contact patches, and major
silhouette are generated or authored from a world seed independent of note
events. The compiler may choose where the light travels, but it may not create,
move, hide, or rotate a surface to rescue an infeasible route.

The first environment is the **Nocturne Causeway**:

- dark fractured basalt plates and low terraces;
- shallow reflective water channels;
- varied but plausible surface normals;
- a restrained distant silhouette for spatial reference;
- hundreds of pre-certified contact patches distributed through depth;
- no visible platforms, rails, targets, or game-like route markers.

Future skins may replace the causeway, but every skin must expose the same
static-world contract to the route compiler.

## Physical motion

The light has continuous position. Velocity may change discontinuously only at
an owned surface contact. Every airborne segment uses one global gravity vector
and an analytic ballistic equation. There are no mid-air steering forces,
teleports, hidden splines, or animation easing masquerading as physics.

A purely passive rigid-body bounce cannot generally satisfy arbitrary musical
deadlines in a fixed world. Lumenfall therefore defines each note as both a
collision and a bounded energy transfer. The passive reflected velocity is
computed first. A small musical impulse may then alter the launch velocity,
but it must remain mostly surface-normal and within documented energy and
tangential limits. If a candidate requires a visually implausible impulse, the
compiler rejects the candidate and searches another surface sequence.

This is the central honesty rule: exact sync may choose among plausible arcs,
but it may not disguise an impossible arc as realistic physics.

## Musical mapping

| Musical property | Primary visual/physical ownership |
|---|---|
| note onset | exact surface-contact time |
| interval to next note | available ballistic flight time |
| pitch | preferred world zone, travel bearing, height class, subtle color temperature |
| pitch direction | preferred left/right, near/far, and ascending/descending route tendency |
| velocity | impact radiance, allowed launch impulse budget, contact response strength |
| note duration | bounded material afterglow and trail persistence |
| phrase density | preference for compact versus expansive contact neighborhoods |
| phrase ending | longer settling arc, wider reveal, or prepared final resting contact |

These mappings are preferences inside the physical search, not permissions to
violate collision or timing. Timing always owns contact. Surface feasibility
always owns the final route.

## Illumination thesis

The world must look illuminated, not merely colorized near the body.

The luminous body drives a real inverse-square scene light. Nearby surfaces
receive light according to distance, orientation, roughness, metalness,
wetness, and shadow occlusion. Water and polished stone produce stronger,
narrower reflections; rough stone produces broader response. A ridge between
the light and a receiver must cast a shadow. A surface facing away from the
light must not glow as though it were facing toward it.

At impact, a short secondary bounce-light approximation may be emitted from
the contact patch. Its energy is derived from incident radiance, material
albedo, surface normal, and an explicit energy-conservation cap. It is not a
free artistic flash. Bloom, lens response, trail, and impact particles are
post-lighting derivatives and can never substitute for the environment being
correctly lit.

## Visual direction

- portrait-first, low cinematic camera;
- large areas of controlled black rather than uniformly visible scenery;
- white core light with restrained pitch-dependent warmth or coolness;
- wet graphite, blue-black stone, and sparse reflected silver;
- one dominant light source and one readable arc;
- a tapered trail that exposes direction without becoming a drawn route line;
- contact reflections and micro-spray that inherit the struck material;
- stable exposure with highlight rolloff, not repeated full-frame flashing.

The final look should be intimate, expensive, and photographic. The light is
small; its effect on the world is large.

## Distinction from existing worlds

- **Marble Music** constructs a visible machine around exact impacts.
  Lumenfall routes through one permanent natural environment.
- **Brick Breaker** presents a planar game and discrete obstacle destruction.
  Lumenfall presents cinematic 3D flight and material illumination.
- **Aurora Cyclotron** and **Phaseglass** make fields or optical media the
  subject. Lumenfall keeps one readable body and one grounded environment.
- **Spectral Bloom** and **Waveform Halo** consume continuous master waveform
  data. Lumenfall is authored around discrete one-note collision deadlines.
- **Pendulum Cathedral** is constrained by visible mechanisms. Lumenfall is
  unconstrained between contacts and governed by ballistic flight.

## Anti-goals

- No song-generated platforms or surfaces.
- No white streak moving over an otherwise unlit background.
- No arbitrary Bézier path presented as a gravity arc.
- No collision where incoming and outgoing directions contradict the normal.
- No note flash that illuminates through solid terrain.
- No per-note camera cuts, exposure pumping, or zoom punches.
- No excessive trail that hides the body or makes old motion authoritative.
- No uniformly glossy floor; material variation must explain reflections.
- No claim of literal photon physics.

## Product acceptance

Lumenfall reaches concept parity only when a viewer can pause on any note and
answer all of these questions from the frame:

1. Where did the light come from?
2. What real surface did it contact?
3. Why did it leave in its outgoing direction?
4. Which nearby forms are illuminated, reflected, and shadowed?
5. Where is it likely to travel next?

The collision must feel inseparable from the heard note, and the environment
must remain convincing with bloom and trail disabled.
