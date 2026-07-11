# Sound Worlds documentation

This directory contains both the creative specifications for Sound Worlds and
the engineering record for the implementation. Start with
[Current implementation status](implementation-status.md) when you want to know
what works today, what was verified, and what should be built next.

## Current state and build plans

- [Current implementation status](implementation-status.md) - canonical
  shipped/in-progress/not-started matrix, verification record, and next steps.
- [Master implementation roadmap](implementation/master-implementation-roadmap.md)
  - execution order from the current state to shipped concepts.
- [Quality gap analysis](implementation/quality-gap-analysis.md) - why the
  current previews do not yet read like the concept docs.
- [Visual recovery plan](implementation/visual-recovery-plan.md) - prioritized
  look-critical fixes.
- [Math audit](implementation/math-audit.md) - verified math, flagged defects,
  and the numeric test battery to wire into CI.
- [Song authoring guide](implementation/song-authoring-guide.md) - the REAPER
  project contract for getting useful visual data.
- [Track-count generator strategy](implementation/track-count-generator-strategy.md)
  - why Sound Worlds should start with one-track and two-track generators
  before judging broad full-arrangement worlds.
- [Music visualization sync principles](implementation/music-visualization-sync-principles.md)
  - the project-wide lesson from the first successful one-track Marble pass:
  numeric hit timing is necessary, but visible behavior between hits must also
  match the musical sustain/release.
- [Visual brief: untitled-project-6d2e04f7](implementation/project-brief-untitled-project-6d2e04f7.md)
  - what the current reference export actually contains and why it is best used
  as a Marble Music/small-generator testbed.
- [Phase 0 foundations](implementation/phase-0-foundations.md) - shared
  analyzer, schemas, runtime, preview app, and export foundation.
- [REAPER extractor implementation](implementation/reaper-extractor-implementation.md)
  - the Lua snapshot/full-package workflow and its acceptance state.
- [Marble Music implementation](implementation/marble-music-implementation.md)
  - the new track-count-specific plan: one-track Three.js marble machine first,
  then two-track duet, then larger arrangements.
- [Marble Music 3D physics-feel implementation](implementation/marble-music-3d-physics-implementation.md)
  - the next Marble slice: deterministic 3D pseudo-physics, realistic-looking
  weight/spin/contact, and camera-ready depth without giving timing to a
  free-running physics engine.
- [Marble Music deep design review](implementation/marble-music-deep-design-review.md)
  - the reasoning, highest-risk failure modes, and risk-minimizing build order
  for making Marble Music feel truly synced.
- [Marble Music acceptance checklist](implementation/marble-music-acceptance-checklist.md)
  - the sync, motion, visual, and tail gates before moving from one-track to
  two-track Marble Music.
- [Realtime Marble Music future plan](implementation/realtime-marble-music.md)
  - a later live-performance mode using REAPER MIDI telemetry, a continuously
  falling marble, and note-spawned physics platforms; not part of the current
  offline implementation.
- [Music-Synced Brick Breaker future plan](implementation/brick-breaker-implementation.md)
- [Music-Synced Brick Breaker work orders](implementation/brick-breaker-work-orders.md)
  - a deterministic one-ball generator that compiles exact note-time brick
  destruction, legal brick/wall/paddle itineraries, and a final-note final hit.
- [Waveform Runner implementation](implementation/waveform-runner-implementation.md)
  - the compiled runner architecture and R1-R5 build order.
- [Metro Map implementation](implementation/metro-map-implementation.md) - the
  map compiler architecture and M1-M5 build order.

## Implemented concept work orders

### Waveform Runner

- [R1 - The World](implementation/waveform-runner/R1-world.md)
- [R2 - The Jumps](implementation/waveform-runner/R2-jumps.md)
- [R3 - The Music](implementation/waveform-runner/R3-music.md)
- [R4 - The Identity](implementation/waveform-runner/R4-identity.md)
- [R5 - Ship](implementation/waveform-runner/R5-ship.md)

R1 and R2 are implemented. R3 is in progress: melody/activity glyph
collection, section gates, base scene palette wiring, camera/trail/glow, gait,
real strata, note-timed route platforms, section palette transitions, vocal
halo plumbing, and conservative downlifter-labeled float segments are
implemented, while authored-song visual acceptance remains.

### Metro Map

- [M1 - Static Map](implementation/metro-map/M1-static-map.md)
- [M2 - Alive](implementation/metro-map/M2-alive.md)
- [M3 - Cartography](implementation/metro-map/M3-cartography.md)
- [M4 - Topology](implementation/metro-map/M4-topology.md)
- [M5 - Ship](implementation/metro-map/M5-ship.md)

M1 and M2 are implemented. M3 is in progress: labels, legend, frontier camera,
final reveal, deterministic corridor separation, train alignment, and
interchange sizing are implemented; district bands and more complete
label/corridor conflict handling remain.

## Architecture

- [Analyzer](architecture/analyzer.md)
- [Compilers](architecture/compilers.md)
- [Data contracts](architecture/data-contracts.md)
- [Export](architecture/export.md)
- [REAPER extractor](architecture/reaper-extractor.md)
- [Renderer](architecture/renderer.md)

The root [ARCHITECTURE.md](../ARCHITECTURE.md) is the high-level system view.
These documents own the detailed contracts for individual stages.

## Concept specifications

- [Ecosystem](ecosystem.md)
- [Descent](descent.md)
- [Painting](painting.md)
- [Storm](storm.md)
- [Marble Music](marble-music.md)
- [Metro Map](metro-map.md)
- [City Builder](city-builder.md)
- [Corridor Shooter](corridor-shooter.md)
- [Waveform Runner](waveform-runner.md)

Concept specifications describe the intended finished experience. They are not
evidence that a feature is implemented; use the implementation status and work
orders for that.

## Documentation convention

The documentation uses three status levels:

- **Implemented** - code exists and automated verification passes.
- **In progress** - a milestone has a usable implemented slice but still has
  open acceptance criteria.
- **Planned** - design exists, but the implementation has not started.

When implementation changes, update the relevant work order and
`implementation-status.md` in the same change.

Visual quality is tracked separately from implementation state. A feature can
be implemented and still be `engineering-preview` until it matches the art
direction on a properly authored reference song.
