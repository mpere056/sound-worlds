# The Song Paints a Painting

**One-line pitch:** A blank canvas paints itself in timelapse. Every track
becomes a painterly force, and the final frame is a finished artwork that feels
like the song rather than a plotted timeline.

## The hook

The end-card is the whole game: "my song painted this." The viewer watches for
the process, stays for the reveal, and the musician gets a poster/print they
can actually sell. Repetition in the music becomes form in the image, which
means the painting is not random: it encodes the composition.

## Visual identity

- **Style default:** centered cymatic impressionism: rings, blooms, glow fields,
  mirrored drops, water-ripple diffusion, canvas texture, and subtle impasto
  lighting.
- **Important art-direction rule:** avoid obvious left-to-right notation,
  terrain strips, staff-like lines, and melodic streaks. A circle around the
  center, a full-screen glow, a symmetric bloom, a drop, or a ripple can work;
  a line travelling across the canvas usually cannot.
- **Alt style presets:** sumi-e ink wash for sparse/minor songs; bold gouache
  poster for pop/electronic.
- **Format:** 9:16 portrait canvas, full-bleed. Camera stays mostly full-canvas
  with 2-3 slow push-ins on active regions and one final pull-back reveal.

## Composition: roles own layers

The painting reads as a composed image because each role owns a layer, painted
in the order a painter would:

| Role | Layer | Stroke behavior |
|---|---|---|
| Keys / pads | **Glow fields** | Broad translucent full-canvas blooms; hue from chord/root estimate, brightness from energy. Chord changes shift the field, not a left-to-right wash. |
| Bass | **Ripple rings** | Centered water-drop/cymatic rings; pitch and velocity control radius, width, and depth. No lower-third terrain/horizon line. |
| Lead | **Symmetric subject blooms** | Notes create radial petals and mirrored blooms around the center; pitch = radius/depth, velocity = size. No calligraphic timeline ribbon. |
| Kick | **Structure drops** | Heavy impasto drops mirrored around the center so rhythm feels architectural instead of scattered. |
| Snare | **Splatter ripples** | Small splash clusters and expanding rings at symmetric positions; size from velocity. |
| Hats | **Stipple orbit** | Fine speckle texture distributed around circular/radial bands; density = hat rate. |
| FX / risers | **The field** | Temporarily brightens and expands existing glow/ripple fields during builds. |
| Vocals | **Glaze aura** | A luminous semi-transparent centered pass following phrasing; adds light from within wherever the voice sits. |

## The key mechanism: repetition becomes form

- While a section plays, its marks stay wet: blooms diffuse, rings expand, and
  glow fields breathe. When the section ends, the layer dries into the canvas.
- Repeated sections repaint their own geometry. Chorus 2 reinforces chorus 1's
  rings and blooms; chorus 3 is stronger still. The most-repeated material
  becomes the most defined form in the painting.

## Song structure -> painting arc

| Section | Painting act |
|---|---|
| Intro | Faint construction rings fade in; the song tunes the canvas before paint lands. |
| Verses | Layer building: glow fields, bass ripples, first symmetric note blooms. |
| Choruses | Saturation jumps; larger rings and stronger mirrored blooms; repainting/reinforcement pass. |
| Bridge | Palette pivot; the one risk the painting takes. |
| Drop | Splatter/ripple climax plus full-field surge. |
| Outro | Marks taper; a varnish sheen pass sweeps once. |
| Final chord | Camera pulls back; painted signature appears; hold the artifact. |

## Color system

- Song key picks the base palette; a small palette solver assigns each role a
  fixed color so the painting remains harmonious.
- Hue never becomes fully free: marks sample from the solved palette with a
  narrow variation range to avoid mud.

## Signature moments

1. **The center ring** expanding exactly on a low-note/bass hit.
2. **The build**: the whole wet canvas visibly brightening and swelling as the
   riser tightens the field.
3. **The reveal**: pull-back plus signature.

## Technical approach

- **Current implementation:** deterministic Pixi vector painting with centered
  rings, whole-canvas glow fields, symmetric note blooms, mirrored drops,
  paper grain, wet highlights, varnish sweep, and final signature.
- **Target renderer:** 2D WebGL accumulation buffer. Strokes are stamped splats
  into an FBO; a height channel drives cheap normal-mapped impasto lighting;
  wetness enables diffusion/advection.
- **Compiler:** converts `song.json` into a deterministic mark list with
  position/depth, layer, time, width, color, radius, and wet-life.
- **Anti-mud safeguards:** per-region coverage budget, per-section drying,
  palette solver, and a maximum number of wet layers.
- Fully deterministic: the exact final painting is reproducible and exportable
  at print resolution.

## Data requirements

Chord track or chromagram, bass pitch, lead/vocal pitch where available, drum
onsets with velocity, FX automation, vocal RMS, key estimate, regions.

## MVP -> stretch

- **MVP:** centered glow/ripple/bloom system plus 5 role layers
  (pads/bass/lead/kick/snare), drying, palette solver, reveal, and signature.
- **Stretch:** impasto lighting, style presets, chorus-reinforcement repainting,
  4x print export, and time-lapse-of-the-timelapse bonus clip.

## Risks and mitigations

- **Mud:** budgets, drying, and palette clamp.
- **Screensaver accusations:** repetition-becomes-form plus strong radial
  composition gives the artifact intent.
- **Linear-data relapse:** reject terrain strips, staff lines, and note ribbons
  unless a future style explicitly calls for them.
- **Slow songs = sparse canvas:** mark size auto-scales inversely with note
  density so sparse songs paint big and bold.

## Open questions

- Should the centered form remain purely abstract, or should there be selectable
  subject presets such as mandala, flower, planet, eye, or stained glass?
- Signature: song title, artist name, waveform glyph, or project date?
