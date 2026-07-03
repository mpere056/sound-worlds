# The Descent

**One-line pitch:** One continuous, uncut camera dive from the sunlit surface to
the bioluminescent seafloor — depth mapped to song position, sea life mapped to
tracks, and the drop landing exactly where the light of the sun is replaced by
the light of living things.

## The hook

A single unbroken shot falling the entire length of a song is inherently
hypnotic — there's no edit to release the tension. Darkness does the art
direction for you: by the midpoint the only light in frame is *the music*
(every glow belongs to a stem). It's the most cinematic concept in the set.

## Visual identity

- **Style:** near-monochrome deep blues sliding to black; all color is emissive
  and belongs to creatures. Additive glow, gentle depth-of-field, marine snow.
- **Camera:** locked descent, slight drift and roll breathing with the energy
  curve. Descent *rate* is eased per section (verses sink steadily, pre-chorus
  accelerates, breakdown near-stalls in the void). Total depth = song duration.
- **Format:** 9:16 — a vertical dive is the native format; falling fills the frame.

## Depth zones (song structure → biome)

| Section | Zone | Look |
|---|---|---|
| Intro | Surface / god rays | Sun shafts, bubbles, warm ceiling of light overhead. |
| Verse 1 | Sunlit reef | Silhouetted fish schools, caustics on particulate. |
| Chorus 1 | Twilight edge | Last blue light; first self-luminous creatures appear. |
| Verse 2 | Midnight zone | Blackness; creatures are the only geometry. |
| Bridge / breakdown | The void | Near-stall. Sparse. One distant unexplained light. |
| Final chorus / drop | **Seafloor garden** | Bioluminescent coral plain ignites — the destination. |
| Outro | Settle | Camera comes to rest among slow pulsing life; or begins a slow rise as the mix thins. |

Zone boundaries snap to Reaper regions; each zone is a creature/palette kit.

## Track → sea life mapping

| Role | Creature / element | Behavior |
|---|---|---|
| Lead | **Jellyfish** | One bell contraction per note; screen-x = pitch; hue = scale-degree tension (tonic/consonant = teal, leading tones = magenta). Runs = a chain of jellies pulsing in sequence. |
| Bass | **The Whale** | A vast silhouette accompanying the descent; one spine undulation per bass note; body emits slow sonar rings (ring radius = note length, depth offset = pitch). It is the guide and the scale reference. |
| Hats / shakers | **Plankton sparkle** | Instanced particle field; each hit ticks a brightness burst through a local cluster. |
| Snare | **Fish school snap-turn** | A silver school executes a synchronized burst-turn on every snare — the visual backbeat. |
| Kick | **Pressure pulse** | Radial light bloom from below + a few centimeters of extra camera sink; in dark zones it also blinks distant anglerfish lures. |
| Keys / pads | **Water itself** | Turbidity, hue temperature, caustic intensity near surface; in deep zones, faint aurora-like veils. |
| FX | **Motion tells** | Risers = marine snow streaks accelerating upward past camera (sells the plunge); downlifters = bubble columns. |
| Vocals | **The Siren light** | A soft directional beam that wanders ahead-below, flickering with vocal amplitude — the thing you're following. |

## The finale: the coral organ

At the drop, the camera lands over a coral plain wired like an instrument:
each melody note lights a coral head at its pitch position (a reef played like
piano keys), drums fire synchronized polyp bursts, the Whale passes overhead
eclipsing the scene once, and the final chord holds every coral lit at once,
then decays to a single heartbeat polyp.

## Signature moments

1. **The light handoff** at the twilight edge — sun fades out just as the first
   creature fades in, timed to chorus 1's last bar.
2. **The Whale reveal** — bass drops out for 2 bars in the bridge; when it
   returns, the Whale surfaces out of the black inches from camera.
3. **The drop landing** — void → full coral organ ignition on beat 1.

## Technical approach

- **Renderer:** Three.js. Exponential fog is the workhorse; every creature is
  emissive + additive bloom. Instancing for plankton/schools (boids with a
  choreographed impulse on snare). Jellies = vertex-displaced hemispheres.
  Whale = low-poly mesh swimming along a spline with per-note undulation phase.
- **God rays:** billboard shafts (cheap) near surface only.
- **Choreography:** all creature events back-solved so pulses/turns/blinks land
  on their stems' onsets. Camera depth is a monotonic eased function of song
  time — the one master parameter.
- **Determinism:** creature placements seeded per project hash; zone kits data-driven.

## Data requirements

Lead pitch (MIDI ideal), bass notes, kick/snare/hats onsets, pad energy +
chord roots, FX onsets, vocal RMS, regions for zone boundaries, master energy
curve for descent easing.

## MVP → stretch

- **MVP:** 3 zones (surface, midnight, seafloor), jellies + plankton + whale +
  pressure pulses + snap-turn school, coral organ as glow-mapped plane.
- **Stretch:** anglerfish lures, siren beam, whale eclipse moment, full
  5-zone kit system, rise-reversal outro.

## Risks & mitigations

- **Mid-song darkness monotony** → the Siren light + anglerfish keep one moving
  point of interest; never more than 4 bars without an event.
- **Cheap-looking water** → lean into dark + emissive (avoids needing real
  volumetrics); marine snow everywhere sells the medium.
- **Whale believability** → silhouette + slow parallax only; never fully lit.

## Open questions

- Should total depth be labeled (subtle depth-meter etching, "−200 m") for
  narrative, or stay purely abstract?
- One fixed creature kit for brand consistency vs. per-key palette shifts?
