# Sound Worlds documentation

This directory contains both the creative specifications for Sound Worlds and
the engineering record for the implementation. Start with
[Current implementation status](implementation-status.md) when you want to know
what works today, what was verified, and what should be built next.

## Current state and build plans

- [Current implementation status](implementation-status.md) — canonical
  shipped/in-progress/not-started matrix, verification record, and next steps.
- [Master implementation roadmap](implementation/master-implementation-roadmap.md)
  — execution order from the current state to shipped Runner and Metro.
- [Quality gap analysis](implementation/quality-gap-analysis.md) — why the
  current previews do not yet read like the concept docs.
- [Visual recovery plan](implementation/visual-recovery-plan.md) — prioritized
  look-critical fixes.
- [Math audit](implementation/math-audit.md) — verified math, flagged defects,
  and the numeric test battery to wire into CI.
- [Song authoring guide](implementation/song-authoring-guide.md) — the REAPER
  project contract for getting useful visual data.
- [Phase 0 foundations](implementation/phase-0-foundations.md) — shared
  analyzer, schemas, runtime, preview app, and export foundation.
- [REAPER extractor implementation](implementation/reaper-extractor-implementation.md)
  — the Lua snapshot/full-package workflow and its acceptance state.
- [Waveform Runner implementation](implementation/waveform-runner-implementation.md)
  — the compiled runner architecture and R1–R5 build order.
- [Metro Map implementation](implementation/metro-map-implementation.md) — the
  map compiler architecture and M1–M5 build order.

## Implemented concept work orders

### Waveform Runner

- [R1 — The World](implementation/waveform-runner/R1-world.md)
- [R2 — The Jumps](implementation/waveform-runner/R2-jumps.md)
- [R3 — The Music](implementation/waveform-runner/R3-music.md)
- [R4 — The Identity](implementation/waveform-runner/R4-identity.md)
- [R5 — Ship](implementation/waveform-runner/R5-ship.md)

R1 and R2 are implemented. R3 is in progress: melody/activity glyph
collection, section gates, base scene palette wiring, camera/trail/glow, gait,
real strata, and section palette transitions are implemented, while vocal halo
and float segments remain.

### Metro Map

- [M1 — Static Map](implementation/metro-map/M1-static-map.md)
- [M2 — Alive](implementation/metro-map/M2-alive.md)
- [M3 — Cartography](implementation/metro-map/M3-cartography.md)
- [M4 — Topology](implementation/metro-map/M4-topology.md)
- [M5 — Ship](implementation/metro-map/M5-ship.md)

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
- [Metro Map](metro-map.md)
- [City Builder](city-builder.md)
- [Corridor Shooter](corridor-shooter.md)
- [Waveform Runner](waveform-runner.md)

Concept specifications describe the intended finished experience. They are not
evidence that a feature is implemented; use the implementation status and work
orders for that.

## Documentation convention

The documentation uses three status levels:

- **Implemented** — code exists and automated verification passes.
- **In progress** — a milestone has a usable implemented slice but still has
  open acceptance criteria.
- **Planned** — design exists, but the implementation has not started.

When implementation changes, update the relevant work order and
`implementation-status.md` in the same change.

Visual quality is tracked separately from implementation state. A feature can
be implemented and still be `engineering-preview` until it matches the art
direction on a properly authored reference song.
