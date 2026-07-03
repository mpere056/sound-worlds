# Waveform Runner

> **Implementation plan:** [implementation/waveform-runner-implementation.md](implementation/waveform-runner-implementation.md)

**One-line pitch:** A being of light — *the playhead itself* — runs across
terrain built from the song's own waveforms; the world renders into existence
ahead of it and dissolves behind it, because music that has already played is
gone.

## The hook (what makes this one not just another runner)

The creative upgrade over a generic auto-runner is the central conceit:
**the runner IS the playhead.** Everything follows from that:

- The world **un-renders behind the runner** — terrain crumbles into drifting
  particles a beat after passage. You are watching the present moment of the
  song sprint between a future that doesn't exist yet and a past that's
  evaporating. That's a visual idea, not just a level skin.
- The terrain is a **stratigraphy of the mix** — layered geological strata, one
  per stem, each stratum's edge being that stem's actual waveform history.
- **Choruses are déjà vu:** repeated sections re-use their terrain shape, and a
  ghost of the runner's previous chorus run plays in the background doing the
  same moves — repetition made literal.

## Visual identity

- **Style:** stylized 2D — dark world, luminous terrain edges, the runner as a
  comet-like spark with a trailing ribbon. High contrast, few colors: world in
  deep neutrals, each stem stratum in its role color, runner in white-hot.
- **Camera:** side-scroll, locked X-offset ahead of the runner; subtle speed
  swell with local RMS; screen-shake budgeted to kicks only.
- **Format:** 9:16 — terrain occupies the lower half; sky events (notes,
  section gates) use the upper half.

## Track → world mapping

| Role | World element |
|---|---|
| Bass | **The ground** — terrain elevation follows bass pitch; note onsets are ridgeline vertices. Long notes = plateaus, runs = staircases. |
| Kick | Ground pulse rings underfoot + the runner's footfall flashes (footfalls quantized to kicks). |
| Snare | **Jumps** — every snare is a landing. Arcs are back-solved: takeoff time/velocity computed so touchdown hits the snare exactly. Fills = double/triple-jump chains. |
| Hats | Sparkline particles ticking along the terrain edge. |
| Lead | **Note glyphs** — floating collectibles at pitch height; collecting one emits its ripple ring and a shard of the trail ribbon changes to the lead color. Fast runs = glyph chains collected in one arc. |
| Keys / pads | Sky gradient, aurora bands, parallax density — the atmosphere. |
| FX | Risers = the world tilts uphill + wind streaks; downlifter = slow-motion float (time-dilation frames). |
| Vocals | A halo around the runner that brightens with vocal amplitude. |

## Song structure → journey

| Section | World state |
|---|---|
| Intro | The runner materializes from the first transient; terrain renders only a few meters ahead. |
| Verse 1 | Steady run; world palette 1. |
| Chorus 1 | **Section gate** — a monumental arch labeled from the region name; palette flip; terrain doubles its glow. |
| Verse 2 | New biome stratum surfaces (a different stem's waveform becomes the visible top layer). |
| Bridge | The path fractures — runner leaps between floating waveform islands. |
| Drop | Gravity flip or a **bass-rail grind**: the runner rides the bassline itself as a rail of light, sparks on every note. |
| Final chorus | Chorus terrain returns + ghost-runner déjà vu in the background. |
| Outro | World stops un-rendering — the past finally persists; the runner slows. |
| Final chord | The **cadence gate**: a door of light that closes behind the runner on the last hit; end-card = the full route silhouette (the whole song's terrain as one skyline strip). |

## Signature moments

1. Three consecutive snare landings, dead on the beat, with ripple rings.
2. **The bass-rail grind** at the drop.
3. The ghost-runner déjà vu in the final chorus.
4. The un-rendering world glimpsed in a slow section — past crumbling away.

## Technical approach

- **Renderer:** 2D WebGL (PixiJS/regl), 4–6 parallax layers; terrain =
  polyline extruded ribbon per stratum with emissive edge; dissolution =
  particle emission along a trailing "erasure front."
- **Kinematic, not simulated:** the runner is fully choreographed by the
  compiler. Jump arcs are closed-form ballistics solved backwards from snare
  times; footfalls quantized to kicks; no physics engine, no failure states.
- **Level compiler:** builds terrain from bass pitch + waveform summaries,
  places glyphs at (time, pitch), inserts gates at regions, schedules jump/grind
  segments, validates reachability (max slope/jump constraints auto-relax
  terrain where needed).
- Easiest full concept after Metro Map; the whole thing is one long spline plus
  events.

## Data requirements

Bass pitch (MIDI ideal), snare/kick/hat onsets, lead notes, pad energy, FX
automation, regions, per-stem waveform summaries (analyzer already produces
these for the strata edges).

## MVP → stretch

- **MVP:** terrain from bass, snare-solved jumps, lead glyphs, section gates,
  un-rendering trail, cadence gate ending.
- **Stretch:** strata biomes, bass-rail grind, gravity flip, ghost déjà vu,
  route-silhouette end-card.

## Risks & mitigations

- **"Seen it before"** → the playhead conceit (un-rendering past) and strata
  terrain are the differentiators; make the erasure front visually loud early
  in the video so the premise registers in the first 5 seconds.
- **Busy drum tracks = jump spam** → jump budget per bar; excess snares become
  ground-slide pulses instead.
- **Flat visual middle** → biome/stratum rotation every 8 bars minimum even
  within a section.

## Open questions

- Runner form: abstract spark (safe, timeless) vs. tiny character silhouette
  (more relatable, more art cost)?
- Should the end-card route silhouette double as a purchasable print like
  painting/metro's artifacts?
