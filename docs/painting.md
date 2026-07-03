# The Song Paints a Painting

**One-line pitch:** A blank canvas paints itself in timelapse — every track is a
brush, every note a stroke — and the final frame is a finished artwork that
*is* the song, different for every song.

## The hook

The end-card is the whole game: "my song painted this." It's the strongest
artifact-reveal of all the concepts — the viewer watches for the process, stays
for the reveal, and the musician gets a poster/print they can actually sell.
Repetition in the music becomes *form* in the image (see below), which means the
painting isn't random — it genuinely encodes the composition.

## Visual identity

- **Style default:** flow-field impressionism — strokes advected along a curl-noise
  field, wet-on-wet smearing, canvas texture, subtle impasto lighting (height from
  accumulated paint). Van Gogh / Kandinsky energy (Kandinsky literally painted music).
- **Alt style presets:** sumi-e ink wash (minor keys / sparse songs), bold
  gouache poster (pop/electronic).
- **Format:** 9:16 portrait canvas, full-bleed. Camera: mostly full-canvas with
  2–3 slow push-ins on the active region, and one final pull-back reveal.

## Composition: roles own layers

The painting reads as a composed image (not a data dump) because each role owns
a compositional layer, painted in the order a painter would:

| Role | Layer | Stroke behavior |
|---|---|---|
| Keys / pads | **Background washes** | Broad translucent gradients; hue from chord root (circle of fifths → color wheel), brightness from spectral centroid. Chord changes tilt the wash direction. |
| Bass | **Horizon / terrain** | Thick dark strokes across the lower third; pitch = elevation contour — the bassline literally draws the landscape's skyline. |
| Lead | **The subject** | One continuous calligraphic ribbon in the upper-middle focal zone; y = pitch, width = velocity, curvature from interval jumps. The melody is the painting's protagonist. |
| Kick | **Structure dabs** | Heavy impasto dabs at seeded anchor points near golden-ratio intersections — the painting's rhythm section, felt as texture. |
| Snare | **Splatter** | Pollock flicks radiating from the current focal region; size from velocity. |
| Hats | **Stipple** | Fine speckle texture in the currently active layer; density = hat rate. |
| FX (risers) | **The wind** | Temporarily tightens the flow field's curl — existing wet paint visibly swirls during builds. |
| Vocals | **Glaze** | A luminous semi-transparent pass following vocal phrasing; adds "light from within" wherever the voice sits. |

## The key mechanism: repetition becomes form

- While a section plays, its strokes stay **wet** — they advect and smear with
  the flow field. When the section ends, the layer **dries** (locks) into a
  stratum. Sections leave permanent geological layers of paint.
- **Repeated sections repaint their own strokes.** Chorus 2 re-traces chorus 1's
  geometry with bolder weight; chorus 3 bolder still. The most-repeated material
  becomes the most defined form in the painting — the hook is literally the
  focal point. This is what makes each painting *about* its song's structure.

## Song structure → painting arc

| Section | Painting act |
|---|---|
| Intro | Pencil construction lines fade in (light gray guides — later painted over but ghost-visible; storytelling: the song "sketches" first). |
| Verses | Layer building — washes, terrain, first ribbon passes. |
| Choruses | Saturation jumps; boldest strokes; repainting/reinforcement pass. |
| Bridge | Palette pivot (relative-key hue rotation); the one "risk" the painting takes. |
| Drop | Splatter climax + flow-field surge. |
| Outro | Strokes taper; a varnish sheen pass sweeps once. |
| Final chord | Camera pulls back; painted signature appears (song title + date in a corner, drawn stroke-by-stroke); hold the artifact 2s. |

## Color system

- Song **key** picks the base palette (major = warm/bright families, minor =
  desaturated/cool); a small palette-solver assigns each role a fixed color
  (triadic/complementary constraints) so any song is guaranteed harmonious.
- Hue never fully free: all strokes sample from the solved palette ±10° —
  the anti-mud rule.

## Signature moments

1. **The melody ribbon** drawing a fast run in one unbroken calligraphic gesture.
2. **The build** — the whole wet canvas visibly swirling as the riser tightens the field.
3. **The reveal** — pull-back + signature. The rewatch trigger.

## Technical approach

- **Renderer:** 2D WebGL (regl). Strokes are stamped splats into an accumulation
  FBO; a height channel drives cheap normal-mapped impasto lighting; wetness is a
  per-layer flag enabling advection by the curl-noise velocity field.
- **Compiler:** converts `song.json` into a stroke list (position, layer, time,
  width, color, wet-life). Anchor scatter and field seeds from project hash.
- **Anti-mud safeguards:** per-region coverage budget (density map caps deposits),
  per-section drying, palette solver, max 2 wet layers at once.
- Fully deterministic → the exact final painting is reproducible and exportable
  at print resolution (re-render at 4×).

## Data requirements

Chord track (MIDI keys or chromagram), bass pitch, lead pitch (MIDI ideal),
drum onsets w/ velocity, FX automation, vocal RMS, key estimate, regions.

## MVP → stretch

- **MVP:** flow field + 5 role layers (pads/bass/lead/kick/snare), drying,
  palette solver, reveal + signature.
- **Stretch:** impasto lighting, style presets, chorus-reinforcement repainting,
  4× print export, time-lapse-of-the-timelapse bonus clip (whole painting in 3s
  for loops).

## Risks & mitigations

- **Mud** (the death mode) → budgets, drying, palette clamp (above).
- **"Screensaver" accusations** → the repetition-becomes-form mechanism +
  layer composition give it intent; the sketch-lines intro signals authorship.
- **Slow songs = sparse canvas** → stroke width auto-scales inversely with note
  density so sparse songs paint big and bold.

## Open questions

- Portrait subject presets (landscape/abstract/figure silhouette) selectable per
  song, or always abstract-landscape?
- Signature: song title, artist name, or waveform glyph?
