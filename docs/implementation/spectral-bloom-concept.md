# Spectral Bloom concept

> Status: concept approved for detailed planning. Implementation has not started.
> Use the companion [implementation plan](spectral-bloom-implementation.md)
> before writing production code.

## Reference reading

The supplied references show one coherent three-dimensional body made from a
dense field of luminous points. It can gather into a compact rounded membrane,
fold into overlapping petal-like lobes, stretch into asymmetric fins, or loosen
into a cloud of escaping particles. These are not separate objects or randomly
selected presets. They are different states of the same persistent material.

The form should feel simultaneously like:

- a flexible membrane;
- a volumetric particle cloud;
- a flower opening and closing;
- a living spectral organism;
- a sculptural visualization of pressure moving through sound.

The reference identity comes from thousands of stable points describing a
changing surface, bright density along folds and silhouettes, a luminous inner
focus, sparse transient spray, and large calm negative space around one hero
form.

## Working title

`Spectral Bloom` is the working title. The name describes both the source of the
motion and the way the body can unfold. It can be renamed without changing the
concept.

## One-sentence product invariant

One persistent particle body continuously changes shape according to the full
audio spectrum, so every visible deformation belongs to the same material and
every simultaneous sound can contribute at once.

## Fundamental distinction

This is not a one-note-at-a-time world. It does not select a lead note, create a
target for every MIDI event, or move a hero object between musical deadlines.
It consumes the mastered waveform and its time-frequency analysis. A solo note,
a chord, drums, a dense mix, noise, and silence all use the same grammar.

This is also not Vortex Loom with particles. There is no shuttle, route,
interaction-annulus chain, line field, or accumulated trajectory. The particle
body itself is the instrument.

## Authoritative audio input

A raw waveform is necessary but insufficient. It describes amplitude over time,
but cannot explain why a bass note, cymbal, chord, and vocal with similar volume
should shape the body differently. The primary analysis should therefore be a
deterministic spectral representation derived directly from the master audio.

The first analysis contract should contain:

- short-time RMS and peak amplitude;
- 32 to 64 logarithmically spaced spectral-energy bands;
- a multi-resolution transient/onset envelope;
- spectral flux, measuring how quickly the spectrum changes;
- spectral centroid and rolloff, describing brightness;
- spectral spread, describing how broad the active spectrum is;
- spectral flatness or noisiness;
- low, low-mid, high-mid, and high-band aggregate energy;
- stereo balance, width, and correlation when stereo audio is available;
- smoothed derivatives for rising, falling, and sustained energy.

For prerecorded audio, all curves are compiled before playback and may use a
small bounded lookahead so the material can tense before a major arrival. A
future live version would use the same grammar with causal filters and measured
latency. MIDI, pitch tracking, and stem roles may enrich later versions, but the
world must remain complete without them.

## Stable particle body

The form begins from a deterministic spherical or rounded manifold. Candidate
foundations are a subdivided icosphere or Fibonacci-distributed sphere with
stable particle IDs. The authoritative body includes:

1. a dense surface population that defines the visible membrane;
2. a smaller interior population that gives folds volume and produces the
   luminous core;
3. a bounded transient population that may detach and later rejoin.

Particles do not respawn at random locations each frame. A particle keeps its
identity, neighborhood, phase offsets, and material role through the song.
This persistence is what allows the viewer to understand that the compact orb,
open flower, twisted shell, and transient spray are one object.

## Acoustic geometry, not a bubble simulation

The new reference adds an important physical idea: sound should appear to shape
the geometry itself. The body should have coherent lobes, nodes, folds, and
symmetries that feel like the visible result of resonant pressure patterns. It
must not look like arbitrary noise attached to an audio amplitude meter.

Bubble cymatics is useful as conceptual evidence that sound can organize a
closed three-dimensional domain into complex standing-wave geometry. It is not
the subject or material of this world. Spectral Bloom will not render a soap
film, liquid surface, transparent bubble, or scientifically literal droplet.
It remains a dense luminous particle organism with its own synthetic material
laws.

The mathematical interpretation is:

1. The stable particle body is a closed deformable domain.
2. Its available motions are a bank of spatial resonance modes with nodal
   regions and coherent lobes.
3. Signed, phase-aware spectral controls excite those modes through damped
   oscillators.
4. Simultaneous frequencies superpose and interfere, creating one compound
   geometry rather than several unrelated effects.
5. Transients inject momentum into the same body and may detach a bounded
   amount of its existing material.

Real spherical harmonics are the preferred first basis because they provide a
continuous family of ordered modes on a sphere: low degree produces broad
lobes, while higher degree produces finer nodal structure. Surface gradients
and curls of those modes add tangential folds and torsion so the result does
not merely inflate and deflate radially. The harmonics are a controllable
mathematical basis, not a claim that the artwork reproduces one particular
real-world object or exact material equation.

The renderer should make this causality legible. A narrow sustained tone should
settle into an organized resonant figure. Related frequencies should reinforce
or slowly rotate that figure. Chords should produce compatible superposed
lobes. Broadband noise should weaken order and increase fine structure. A
transient should visibly transfer stored energy through the same geometry,
not paste an independent burst over it.

## Spectral-to-form grammar

The complete shape is a superposition of bounded deformation modes. Several
frequency regions may be active simultaneously, so polyphony naturally creates
a richer shape instead of forcing the system to choose one note.

### Overall loudness

- Controls global breath, average radius, core luminance, and particle
  visibility.
- Uses asymmetric attack and release so strong arrivals feel immediate while
  decays remain graceful.
- Does not simply scale the entire object uniformly; it also increases membrane
  pressure and the depth of existing folds.

### Sub-bass and bass

- Move the largest amount of mass.
- Drive slow breathing, deep radial displacement, whole-body compression, and
  broad low-order lobes.
- Strong bass can make the body feel heavy and rounded rather than spiky.

### Low mids

- Create large folds, bowls, and overlapping petal foundations.
- Control the balance between compact shell and open flower states.
- Their slower release leaves readable material memory between transients.

### High mids

- Add smaller lobes, creases, twisting fins, and directional asymmetry.
- Help vocals, guitars, keys, and dense harmonic material articulate the
  silhouette without breaking the body apart.

### High frequencies

- Add fine membrane ripples, point scintillation, bright edge density, and
  delicate local spray.
- Never control the large-scale silhouette by themselves.
- Sustained highs shimmer; sharp highs may release a small amount of particulate
  material.

### Spectral centroid and rolloff

- Shift tension from rounded and weighty toward sharp and elevated.
- Raise the apparent center of brightness and increase edge brilliance.
- May bias the body toward upward folds, but do not directly rotate through a
  rainbow palette.

### Spectral spread

- A narrow spectrum produces a more singular, organized deformation.
- A broad spectrum activates several compatible lobes and makes the sculpture
  spatially complex.
- This is the main reason a chord or full mix can look richer than one tone
  without needing explicit note detection.

### Spectral flux and transients

- Apply a short pressure impulse to existing modes.
- Open petals, invert a fold, launch a bounded spray, or briefly expose the
  luminous core.
- Repeated fast transients accumulate intensity smoothly; they do not reset the
  geometry or trigger unrelated explosions.

### Noisiness and spectral flatness

- Reduce local cohesion and increase micro-scale particle freedom.
- Clean harmonic material produces ordered membranes and smooth folds.
- Noisy material produces porous edges, granular turbulence, and controlled
  detachment.

### Stereo information

- Stereo balance biases deformation toward the corresponding side.
- Width controls how far opposing lobes separate.
- Correlation influences symmetry: highly correlated sound remains centered,
  while decorrelated ambience can broaden and twist the outer membrane.
- Mono input receives a centered deterministic treatment and loses no core
  behavior.

## Spatial mode system

Frequency bands should not be assigned to random directions every frame. The
compiler creates a stable bank of spatial deformation modes, preferably based
on low-order spherical harmonics plus a small number of deterministic curl and
torsion modes.

Each spectral band owns a reproducible weighted combination of modes. Nearby
frequency bands share related directions and shapes; distant bands differ more.
The mapping should be smooth across frequency, so a rising sound visibly moves
pressure through the body rather than jumping between unrelated regions.

The deformation at particle `i` and time `t` is conceptually:

```text
base position
  + global loudness breath
  + sum(spectral band energy * stable spatial mode)
  + transient pressure displacement
  + bounded curl/torsion displacement
  + high-frequency surface detail
```

The result is constrained by maximum stretch, bounded acceleration, approximate
volume preservation, and center-of-mass correction. These constraints prevent
the sculpture from collapsing into noise or drifting off screen.

## Motion and continuity

All authoritative audio features pass through continuous attack/release filters
or damped mode dynamics. No visual parameter reads an unsmoothed FFT bin.

- Fast attack preserves musical precision.
- Frequency-dependent release preserves body and phrase memory.
- Mode inertia prevents shape flicker during dense passages.
- Neighbor constraints keep the membrane coherent.
- Transient particles inherit local surface velocity and have explicit return,
  dissolve, or reattachment behavior.
- Silence gradually gathers the object into a calm, breathing state rather than
  freezing it or resetting it instantly.

For prerecorded rendering, absolute-time checkpoints make arbitrary seeking
deterministic. A frame at time `t` must not depend on the order in which earlier
frames were visited.

## Anticipation

Because the first version is prerecorded, a short lookahead may prepare major
spectral changes. The body can tighten, gather negative space, or draw particles
toward a future fold before an arrival. This should feel like physical
pre-tension, not like showing a target or predicting a note.

Lookahead is bounded and derived only from future audio features. It cannot
change the timing of the visible impact or make the body react fully before the
sound.

## Visual design

The first art direction follows the references closely:

- one centered or slightly offset hero body;
- a very dark navy-black environment with restrained depth haze;
- silver, pearl, and soft white particles;
- controlled spectral tint only in dense folds, transient cores, or edge light;
- brighter particle density at silhouettes, folds, and compressed regions;
- a soft luminous interior visible when the body opens;
- sparse escaped particles that preserve the direction of the transient;
- subtle perspective and slow camera drift that reveal the object as 3D;
- substantial negative space around the body.

The point cloud must be fine enough to read as material, not as a low-resolution
game mesh. Particle size may respond slightly to depth and energy, but the
surface should remain inspectable. Bloom supports compressed density; it does
not replace particle detail.

## Expected musical states

### Silence or near-silence

The body is compact, dim, and gently breathing. A faint interior and stable
particle topology remain visible.

### Sustained harmonic sound

The membrane holds broad smooth lobes. Internal energy circulates slowly, and
related frequencies reinforce a stable silhouette.

### Chord or dense polyphony

Several compatible modes coexist. The form becomes multilobed and sculptural,
with richer folding rather than more random movement.

### Percussive transient

Stored pressure releases into a rapid opening, fold inversion, or directional
particle spray. The body recoheres continuously afterward.

### Bright noisy passage

The outer membrane becomes porous and highly detailed, with scintillation and
bounded particulate shedding while the low-frequency body remains coherent.

### Bass-heavy passage

The sculpture becomes weightier, rounder, and more deeply displaced. Large
lobes dominate while high-frequency detail rides on their surface.

## Camera and composition

The camera observes the sculpture; it does not chase individual particles.
Use a slow deterministic orbit or bounded parallax drift with no beat cuts,
snap zooms, or focus pumping. The whole body remains visible, but occasional
folds may approach the camera enough to reveal depth.

Camera motion should be much slower than audio deformation. Stereo balance may
influence a small lateral bias, but must not make the framing unstable.

## Anti-goals

- no hero object following note targets;
- no Vortex Loom shuttle, fibers, annuli, or route history;
- no literal waveform line, frequency bars, or circular spectrum display;
- no random new shape on every beat;
- no independent particle emitters that look layered over the body;
- no generic explosion for every transient;
- no full-body scale pulse as the only loudness response;
- no per-frame random particle positions;
- no hard cuts between compact, flower, and cloud states;
- no uncontrolled rainbow cycling;
- no camera motion that competes with the sculpture;
- no claim that a waveform alone provides spectral or timbral information.

## First proof

The first implementation should be deliberately narrow:

1. Analyze one mastered WAV into deterministic spectral curves.
2. Render one stable spherical particle topology.
3. Drive global breath, four broad frequency-mode groups, spectral flux, and
   noisiness.
4. Demonstrate compact, sustained-fold, dense-polyphonic, transient-bloom, and
   silence-recovery states.
5. Support absolute-time seeking and deterministic frame capture.
6. Use the reference silver-on-dark art direction without final polish.

The first gate is not maximum particle count. It is whether a viewer can watch
the same body continuously become compact, folded, flower-like, and dispersed,
and can correctly feel the difference between bass, harmonic density, bright
detail, transients, and silence without labels.

## Confirmed interpretation

The planning work proceeds with these choices:

- one persistent body rather than several independent clouds;
- spectral analysis as the primary input rather than note tracking;
- silver/white on dark as the first art direction;
- transient spray is bounded and returns or dissolves coherently;
- the body may become strongly flower-like but should remain abstract;
- slow observational camera rather than a fixed camera or aggressive orbit.
