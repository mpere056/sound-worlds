# Storm Lifecycle

**One-line pitch:** The song is one storm — from first haze to supercell to
clearing sky — with every drum hit a lightning bolt whose shape is generated
from that hit's actual audio spectrum, and a final rainbow whose bands are the
notes of the last chord.

## The hook

Storms are nature's drop. The build/release grammar of weather maps one-to-one
onto the build/release grammar of a song, so the visual arc needs no
explanation. The signature tech — **spectral lightning** (no two bolts alike,
because no two hits are alike) — is the "how did they do that" detail that
earns comments.

## Visual identity

- **Framing:** one fixed wide landscape — a dark plain, one lone hero tree
  off-center, a strip of water for reflections. Sky owns ~70% of the vertical
  frame (9:16 loves sky).
- **Style:** 2.5D cinematic — layered cloud sprites with internal lighting,
  silhouette land, desaturated palette that the storm progressively steals the
  color from (and the rainbow gives back).
- **No cuts.** Weather does all the drama.

## Song structure → storm phases

| Section | Weather |
|---|---|
| Intro | Golden calm. Heat haze. First cirrus wisps drawn by pad attacks. |
| Verse 1 | Cumulus growth — cloud mass accretes with cumulative energy; shadows crawl across the plain. |
| Pre-chorus | Wind rises (grass/tree lean from FX automation), color temperature drops, pressure visibly dims the scene. |
| Chorus 1 | First rain + first bolts. |
| Verse 2 | Rotation begins — cloud base develops slow mesocyclone swirl. |
| Bridge / riser | Green-black supercell; rain stalls ominously (updraft); the riser tightens the rotation. |
| Drop / final chorus | Full fury: bolt per drum hit, sheet lightning inside the clouds, driven rain shear. |
| Outro | Breaking clouds, sunbeams, steam off the grass. |
| Final chord | **The rainbow:** its bands are the chord — each chord tone lights one band (a 4-note chord = 4 vivid bands, others faint). Hold as end-card with title. |

Phase boundaries snap to Reaper regions; intensity within a phase follows the
master energy curve.

## Track → weather mapping

| Role | Weather element |
|---|---|
| Kick | **Trunk bolts** — thick, few branches, ground strike; also a low cloud-belly flash and camera micro-shake. |
| Snare | **Crackle bolts** — wide, many-branched, cloud-to-cloud; plus a rain-intensity spike for one beat. |
| Toms | **Slanted forks** walking across the horizon (a tom fill = a stepping bolt sequence). |
| Hats | Drizzle particle density; distant heat-lightning flickers below the horizon. |
| Bass | Cloud-roll speed + ground rumble (subtle vertical scene oscillation at note pitch's beat rate); pitch = how low the cloud base hangs. |
| Lead | **Luminous rain** — each note a bright streak landing at x = pitch, ringing a ripple on the water strip. Melodic runs = arpeggios of splashes. |
| Keys / pads | Sky base color, cloud coverage %, light temperature. |
| FX | Wind gusts (grass/tree/rain shear), riser = rotation tightening, downlifter = pressure-drop dimming. |
| Vocals | **Sheet lightning** — soft whole-sky luminance following vocal phrasing (the sky "sings"). |

## Spectral lightning (the centerpiece)

For every drum onset, take that hit's short FFT from its own stem and grow a
fractal bolt from it deterministically:

- Low-band energy → trunk thickness and how far the leader travels before branching.
- Mid bands → branch angles per depth level (band `k` sets the fork angle at depth `k`).
- High-band energy → number and sparkle-life of terminal filaments.
- Hit velocity → overall luminance + afterglow decay.

Result: a kick bolt *looks heavy*, a snare bolt *looks bright and wide*, and the
same hit always produces the same bolt (deterministic, re-renderable). Bolts
illuminate cloud interiors via a radial light splash into the cloud layer's
normal maps — the flash comes from *inside* the sky.

## Signature moments

1. **First bolt** of chorus 1 — held back until then, no matter what.
2. **The stalled rain** in the bridge (rain hangs mid-air during the riser,
   released on the drop's first kick).
3. **A tom fill** rendered as a bolt walking left-to-right across the horizon.
4. **The rainbow chord** end-card.

## Technical approach

- **Renderer:** 2D WebGL, 4–6 cloud parallax layers (sprite clusters with
  normal maps for internal illumination), particle rain with shear vector, hero
  tree with 3-bone wind rig, water strip = screen-space reflection of the sky
  buffer.
- **Bolts:** recursive polyline generator (seeded by hit spectrum), rendered
  with core + glow passes, 90–150 ms lifetime + afterglow.
- **Compiler:** phase map from regions; per-hit FFT extraction happens in the
  analyzer so the renderer stays dumb.
- Stalled-rain and release are back-solved so release lands on the drop's beat 1.

## Data requirements

Per-hit spectra for drum stems (analyzer addition: 2048-sample FFT at each
onset), drum onsets + velocity, lead pitch, pad chords + energy, FX automation
curves, final chord voicing (from MIDI or chromagram at last downbeat), regions.

## MVP → stretch

- **MVP:** 4 phases (calm, build, storm, clearing), spectral bolts for
  kick/snare, luminous rain, rainbow chord.
- **Stretch:** mesocyclone rotation, stalled-rain riser, tom walking-bolts,
  vocal sheet lightning, hero-tree lightning strike on the single loudest hit
  of the song (scorched + smoking for the outro — dramatic, optional).

## Risks & mitigations

- **Flat clouds** → internal bolt illumination + normal maps do the heavy
  lifting; never show clouds unlit for long.
- **Strobe fatigue on dense drums** → bolt budget (max n per bar; overflow hits
  become in-cloud flashes instead of full bolts).
- **Kitsch rainbow** → keep it desaturated except the chord-tone bands; it's an
  end-card, not a scene.

## Open questions

- Lone-tree strike (stretch) — too dark for some songs, perfect for others; make
  it a per-song toggle?
- Ocean horizon variant vs. plain+tree as the default scene?
