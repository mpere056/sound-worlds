# City Builder Timelapse

**One-line pitch:** The song constructs a city in timelapse — cranes swing on
snares, foundations thump on kicks, windows light per melody note — and the
final aerial pull-back reveals a skyline whose silhouette is the song's energy
envelope, with the tallest towers standing where the hook repeated most.

## The hook

Construction timelapses are already beloved content; this one is *composed*.
The structural rhyme is the sell: **repeated choruses grow the same district
taller** — so the most-repeated musical material becomes the literal downtown.
By the end, you can point at the skyline and say "that tower is the hook."
Ends on a poster-grade skyline artifact.

## Visual identity

- **Style:** cozy-epic isometric (or 2.5D orthographic) — clean geometric
  buildings, warm emissive windows, tilt-shift depth of field for the miniature
  feel, day-night cycle doing the color work.
- **Layout:** the city grows along a main avenue that winds up the 9:16 frame —
  time flows along the avenue. Each Reaper region = a **district** with its own
  architectural kit.
- **Camera:** slow dolly following the construction frontier up the avenue;
  three planned wide push-outs (chorus 1, drop, finale).

## Track → construction mapping

| Role | City element |
|---|---|
| Kick | **Pile drivers** — a foundation slab stamps down with a dust puff on every kick. The construction heartbeat. |
| Snare | **Crane swings** — a crane arm swings and places a floor slab exactly on the snare (swing starts early; placement back-solved). Fills = multiple cranes in canon. |
| Hats | Scaffold lights ticking, welding sparks. |
| Toms | Girder drops — skeletal steel frames appearing a level at a time. |
| Bass | **The subway** — a glowing tunnel bores ahead of construction beneath the avenue; pitch = tunnel depth undulation; bass notes light passing subway cars. The low end literally underpins the city. |
| Lead | **Windows** — each note lights one window: pitch = floor height, so a rising melody climbs a tower with light. Legato runs = window cascades. |
| Keys / pads | Sky, weather, sun position — pad energy drives time-of-day; chord changes shift the light temperature across the whole scene. |
| FX | Risers = crane ballet speeds up + timelapse clouds accelerate; downlifter = rain interlude with wet-street reflections. |
| Vocals | Street life — tiny lit figures and vehicles appear with vocal presence (the city sounds inhabited when the voice is in). |

## Song structure → city arc

| Section | District / event |
|---|---|
| Intro | Empty lot at dawn. Survey stakes appear on the beat grid. First foundation on the first downbeat. |
| Verse 1 | **Residential district** — low-rise, warm, gentle density. |
| Chorus 1 | **Downtown begins** — first tower rises; camera pushes out. |
| Verse 2 | Market/industrial district; subway line extends. |
| Chorus 2 | Downtown *again*: the same towers gain floors (repetition = height). |
| Bridge | Night rain interlude — construction pauses, city reflects in wet streets, only windows and subway alive. |
| Drop / final chorus | **Grand opening** — the whole downtown lights floor-cascades per hit, fireworks on drum accents, every crane placing at once. |
| Outro | Dawn again. Cranes fold and bow out one at a time as tracks leave the mix. Birds cross frame. |
| Final chord | Aerial pull-back: the full city. Skyline silhouette = the song's energy envelope. Title on a water tower. Hold as end-card. |

## Signature moments

1. A crane swing landing its slab dead on a snare — three in a row.
2. A melody run climbing a tower as a cascade of lit windows.
3. Chorus 2 revealing the *same district* growing taller — the structural rhyme.
4. The final skyline reveal.

## Technical approach

- **Renderer:** Three.js orthographic (isometric) — box-morph buildings
  (floors are stacked scaled cubes; placement animation = drop + squash),
  instanced windows with emissive palette, tilt-shift via post DoF, one
  directional light animated by the day cycle.
- **City compiler:** allocates bars → lots along the avenue spline; assigns
  district kits from regions; computes final tower heights from repetition
  counts + section energy so the skyline-equals-envelope reveal is guaranteed;
  schedules every foundation/slab/window event back-solved to its hit.
- **Crane choreography:** cranes are kinematic rigs; swing durations solved
  from inter-snare gaps (fast passages = shorter, snappier swings).
- Deterministic: street layout + kit variation seeded from project hash.

## Data requirements

Drum onsets (kick/snare/toms/hats), lead MIDI (window mapping wants real
pitches), bass pitch, pad energy + chords, FX automation, vocal RMS, regions
with names, master energy envelope, repetition/similarity info for the
height-by-repetition rule (region names suffice: same name = same district).

## MVP → stretch

- **MVP:** one avenue, three district kits, pile-driver kicks, crane snares,
  window melodies, day-night cycle, final pull-back.
- **Stretch:** subway bore, rain interlude, fireworks drop, street life,
  crane-fold outro, skyline poster export, per-key architectural palette.

## Risks & mitigations

- **Grid monotony** → avenue curvature + lot size jitter + 3 kit silhouettes
  per district; never two identical adjacent buildings.
- **Sync legibility** (is that crane really on the snare?) → exaggerated
  anticipation/settle animation on placements; dust puffs are the visual
  transient.
- **Slow songs = sparse city** → lot sizes scale up so low note-density songs
  build fewer, grander structures (a cathedral town instead of a metropolis —
  honestly a feature).

## Open questions

- Isometric 3D (richer, more effort) vs. 2.5D facade style (faster, flatter
  charm) for v1?
- Should district architecture follow genre presets (lo-fi = brick walk-ups,
  synthwave = glass towers), selectable per song?
