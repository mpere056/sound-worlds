# Corridor Shooter

**One-line pitch:** An on-rails first-person glide through the inside of the mix
itself — walls built from the song's live spectrogram — where every enemy is a
stem-spawned construct that dies *exactly* on a hit of its own instrument, and
the boss is the song's title glyph defeated across the final chorus.

## The hook

It's the highest-energy concept in the set: FPS spectacle with zero gameplay
slop, because nothing is simulated — it's **choreographed ballet wearing a
shooter's clothes**. The premium detail: the corridor isn't decorated with the
music, it's *made of it* — the walls are the actual scrolling spectrogram of the
track, so bass swells physically widen the tunnel floor glow and a vocal line
ripples past you as a bright band at head height.

## Visual identity

- **Style:** dark sci-fi interior, neon-emissive on near-black, volumetric-ish
  light shafts, heavy bloom, scanline/chromatic post FX rationed to hits.
- **Camera:** root-motion on rails, speed = master RMS; FOV kicks +2° on kick,
  chromatic aberration ticks on snare, quarter-second slow-mo on the loudest
  single hit of the song. Weapon viewmodel bobs on the beat grid.
- **Format:** 9:16 — corridors are framed tall; vertical shafts (see the drop)
  exploit the format fully.

## The corridor is the spectrogram

Both walls are scrolling frequency surfaces from the master (or a stem sum):
height on the wall = frequency band, brightness/extrusion = band energy,
scrolling past at playhead speed. Consequences for free:

- Bass = the glowing floor channel; kicks light the whole floor for a frame.
- Vocals = a bright rippling band at eye level you fly *through*.
- Hi-hats = ceiling sparkle strip.
- A breakdown visibly *narrows and darkens* the architecture; the final chorus
  blows the walls wide.

## Track → combat mapping

| Role | Enemy / weapon |
|---|---|
| Hats | **Drones** — small darting constructs; one pops per hat hit (SMG ticks). |
| Snare | **Shield crabs** — armored units whose shields shatter precisely on their own snare (railgun crack + white flash). |
| Kick | **The shotgun pulse** — a concussive radial blast; also doors: bulkheads iris open on every bar-1 kick. |
| Bass | **Juggernauts** — massive slow floor-fillers; each bass note lands a heavy cannon round into one; they fall on phrase ends. |
| Lead | **Sirens** — weaving fliers at pitch height (the melody drawn in enemy flight paths); each note is one landed shot on one siren. |
| Toms | Turret emplacements destroyed in sequence during fills — a fill = a strafing run. |
| Keys / pads | Environment mood — fog color, light shafts, ambient panel glow. |
| FX | Risers = alarm state (red rotating lights, klaxon strobes accelerating); downlifter = power-down (lights die section by section). |
| Vocals | The wall-band ripple + a "commander voice" light on the HUD rim that pulses with phrasing. |

**The invariant that makes it feel supernatural:** every enemy's death frame is
an onset of its own stem. The gun never misses because the gun *is* the drum
track. Spawns are back-solved (`spawn = t_hit − approach_time`) so approach
animations are always complete exactly on the kill beat.

## Song structure → mission arc

| Section | Set piece |
|---|---|
| Intro | Boot sequence: HUD elements come online per instrument as each track first plays (track name = weapon/system name). |
| Verse 1 | Corridor cruise, drones + crabs. |
| Chorus 1 | First juggernaut wall; wider architecture, full weapon kit. |
| Verse 2 | Rotating gravity ring section (visual novelty, same choreography). |
| Bridge / breakdown | **Weapons down.** Lights dead, drift through wreckage of everything destroyed so far, only pad-glow and the spectrogram walls breathing. Tension = silence made visible. |
| Riser | Alarm state builds — strobes accelerate with the riser envelope. |
| Drop | **The shaft** — the corridor turns vertical and you free-fall, enemies streaming up past you, every hit a muzzle flash lighting the walls (gravity drops on the drop). |
| Final chorus | **Boss:** the song's title glyph, assembled from every enemy archetype, fills the corridor. Each hit of the chorus strips one layer; its parts die on their own stems' hits. |
| Last hit | Boss detonates into the title card. Hold as end-card. |

## Signature moments

1. The **spectrogram walls** registering as "wait, that's the actual song" —
   a vocal run visibly rippling past.
2. A tom fill as a **strafing run** across four turrets.
3. The **breakdown drift** through your own wreckage.
4. The vertical **free-fall drop**.
5. The boss **title-card detonation**.

## Technical approach

- **Renderer:** Three.js. Corridor = tube geometry with a spectrogram texture
  (from the analyzer, precomputed) scrolled in the shader + emissive extrusion.
  Enemies = instanced low-poly meshes with baked approach/death animations.
  Post: bloom, chromatic aberration, scanlines — all parameter-driven by events.
- **Zero AI, zero collision:** everything kinematic from `performance.json`.
  Death VFX = shader dissolve + light burst at the enemy's position on its beat.
- **Boss glyph:** title text → SDF → point-scatter → enemy-archetype meshes
  assigned per point; destruction order maps final-chorus onsets to points.
- Enemy budget per bar prevents overdraw on dense drums (overflow hits become
  wall-panel explosions instead of enemies).

## Data requirements

Per-stem onsets + velocities, lead pitch, bass notes, precomputed master
spectrogram (analyzer: mel bands × time), FX/riser envelopes, vocal RMS,
regions, the single loudest-hit timestamp, song title string.

## MVP → stretch

- **MVP:** spectrogram corridor, drones + crabs + sirens, kick doors,
  breakdown blackout, end title card (no boss assembly — title just forms from
  the last explosion).
- **Stretch:** juggernauts, gravity ring, vertical drop shaft, full boss glyph
  assembly/destruction, HUD boot sequence, weapon viewmodels.

## Risks & mitigations

- **Highest art bar in the set** → lean on emissive-on-black (hides low poly),
  instancing, and post FX; three enemy archetypes are enough for the MVP.
- **Sensory overload** → strict FX rationing (aberration only on snare, shake
  only on kick), and the breakdown blackout is the palate cleanser.
- **Violence tone for brand-safe platforms** → constructs/drones only, no
  gore, deaths are light dissolves — it reads as fireworks, not combat.

## Open questions

- Visible weapon viewmodel (more "game," more art) vs. pure first-person light
  ballet (cleaner, faster to build)?
- Boss = title text glyph vs. artist logo?
