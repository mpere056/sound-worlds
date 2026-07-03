# Ecosystem

**One-line pitch:** A barren valley comes alive over the course of the song —
every track is a species, every note is a living act, and by the final chord the
whole biome is glowing and breathing in time with the music.

## The hook

This is a nature documentary where the wildlife *is* the arrangement. The melody
literally flies. The bass walks through frame. The hi-hats are fireflies. People
watch because it's beautiful; musicians rewatch because they can *see their own
stems living*. The ending credits each species by track name — a shareable
"meet the band" tableau.

## Visual identity

- **Style:** painterly 2.5D — hand-painted parallax layers (5–7 depth planes),
  soft rim light, Studio-Ghibli-adjacent color scripts. No hard UI, no HUD.
- **Scene:** a single valley — rock face left, meadow center, pond right,
  ridgeline behind. **No cuts for the whole video**; one slow drifting camera
  with choreographed push-ins per section. Coherence of place is the identity.
- **Format:** 9:16. Valley composed vertically: sky ~45%, meadow ~35%, pond/foreground ~20%.
- **Light is the language:** every creature emits light on the hits of *its own
  instrument*. In the finale the valley becomes a visible orchestra.

## Track → species mapping

| Role | Species / element | Behavior |
|---|---|---|
| Lead | **Songbirds** | Each note = a call + a flight arc to a perch at pitch height; sustained notes = glides; runs = swooping chains. Flight paths literally draw the melody's contour. Population grows with cumulative note count (capped ~12). |
| Bass | **The Guide** — an elk/bison silhouette | Walks the valley floor; one step per bass note; antlers glow with pitch (low = deep amber, high = pale gold). Long notes = it stops and bugles (breath mist). |
| Hats / shakers | **Insects** | Butterflies by day, fireflies by night; particle density tracks hat rate; each hit = one wing-flash. |
| Snare | **Frogs** | Leap between lily pads — leaps are back-solved to *land* exactly on the snare. Ripple ring on landing. |
| Kick | **The valley's pulse** | A soft moss-light ring expands from the ground on every kick; subtle grass press-down. The heartbeat of the place. |
| Toms | **Mushrooms** | Pop up in clusters on tom hits; fill = a fairy ring blooming in sequence. |
| Keys / pads | **Flora & sky** | Each chord blooms a flower cluster — petal count = chord size, hue = root pitch class (circle of fifths → color wheel). Pad energy drives sun height, grass sway, cloud cover. |
| FX | **Weather events** | Riser = wind gust + a distant murmuration crossing the ridge; downlifter = brief rain shower followed by a bloom burst. |
| Vocals | **The Spirit** | A soft aurora-wisp drifting the valley; brightness follows vocal amplitude; it leans toward whichever species is most active. |

## Song structure → scene arc

| Section (Reaper region) | Valley state |
|---|---|
| Intro | Pre-dawn. Barren rock, mist. The very first note spawns the very first life (one moss glow, one bird). |
| Verse 1 | Meadow growth — grass spreads, first flowers, Guide enters frame. |
| Chorus 1 | Full daylight bloom. All active species present; peak color saturation. |
| Verse 2 | Golden afternoon; population matured; behaviors overlap in polyphony. |
| Bridge | Dusk → night. Butterflies hand off to fireflies; pond turns to mirror; pace slows. |
| Final chorus / drop | **The aurora finale** — night sky ignites; every species bioluminesces on its own instrument's hits. The biome is the orchestra, visualized. |
| Outro | Pre-dawn again. Creatures settle, lights dim one species at a time as tracks drop out of the mix. |
| Final chord | Camera pulls up: the flowering pattern across the valley is revealed to trace the song's energy envelope. |

## Signature moments (the clips people share)

1. **The frog leap** landing dead on a snare, three times in a row.
2. **The melody drawn in birds** — a fast lead run rendered as a swooping chain of flight arcs.
3. **The aurora finale** — the whole valley pulsing per-stem in the dark.
4. **The credits tableau:** every species gathers at the pond; caption cards:
   *"Lead Synth — the Wren · Bass — the Guide · Hats — the Fireflies…"*

## Technical approach

- **Renderer:** 2D WebGL (PixiJS or regl), painted parallax planes, sprite/skeletal
  creatures (bird = 3-bone flap cycle; Guide = 8-frame walk with IK-free spline hips).
- **Choreographer:** consumes `song.json`, emits `performance.json`:
  - Flight arcs and frog leaps **back-solved** (depart at `t_hit − travel`).
  - Population manager: spawn curves per role driven by cumulative activity, hard caps for composition.
  - Bloom placement uses a low-discrepancy scatter (seeded) with a density budget so the meadow never clutters.
- **Lighting:** additive glow pass + day-night LUT ramp keyed to section map and pad energy.
- **Camera:** spline with section keyframes; max drift speed capped for calm.

## Data requirements

Roles: lead (MIDI or pitch track), bass (MIDI ideal), kick/snare/hats/toms onsets,
pad chord track (MIDI or chromagram), FX onsets, vocal RMS. Regions strongly
recommended (drive the day-night arc); fallback = automatic segmentation.

## MVP → stretch

- **MVP:** birds + Guide + fireflies + frogs, flowers per chord, day-night ramp,
  kick pulse, one camera spline, aurora finale as a color/glow mode.
- **Stretch:** murmuration flyby, rain event, credits tableau generator,
  waveform-shaped flora reveal, per-song palette solver from key/mode.

## Risks & mitigations

- **Clutter at high polyphony** → density budgets + population caps + size hierarchy (one big Guide anchors the frame).
- **Kitsch** → restrained palette (5 hues max per scene), no cartoon faces, silhouette-first creature design.
- **Long ambient sections feel empty** → idle behaviors (grazing, drifting spores) driven by RMS floor, never dead air.

## Open questions

- Painted-layer art: commission/hand-make once (one valley reused for every song) or procedural terrain per song?
- Should species palette follow the song's key (minor = cooler valley) or stay fixed for brand consistency?
