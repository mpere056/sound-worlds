# @reaper-viz/core

Shared deterministic data and musical-time primitives for compilers and scene
runtimes.

## Included

- Strict Zod loaders for `song.json`, performance envelopes, and tuning files.
- `TimedCurve` sampling, resampling, integration, and smoothing.
- String-seeded xoshiro128** random streams with consumption-independent named
  forks.
- `MusicalTime` beat/bar/section/event queries and energy sampling.
- Closed-form ballistic and path-arrival back-solving plus budgeted approach
  scheduling.
- Deterministic role palette generation.
- Synthetic eight-bar fixture songs with repeated verse/chorus sections and
  configurable per-role patterns.

## Commands

From the repository root:

```powershell
corepack pnpm check
corepack pnpm build
```

`check` runs the determinism guard, strict TypeScript checking, and unit tests.
