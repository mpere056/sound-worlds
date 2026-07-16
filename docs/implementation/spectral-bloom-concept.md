# Spectral Bloom concept

> Status: direct-waveform interpretation implemented as an engineering preview.
> The earlier resonant-force interpretation is superseded and must not be
> restored.

## Product invariant

Spectral Bloom is the mastered waveform and spectrum presented as one luminous
3D particle body. Audio does not push, strike, or excite an unrelated object.
The measured audio data is the geometry.

## Reference reading

The supplied references show one coherent three-dimensional body made from a
dense field of luminous points. It can appear rounded, folded, petal-like,
asymmetric, porous, or sharply ridged. The useful identity is:

- thousands of stable particles describing one body;
- bright density along folds and silhouettes;
- a visible inner volume;
- large calm negative space around the hero form;
- continuous shape changes without switching between preset objects.

The bubble-cymatics reference contributes one idea only: sound can be presented
as organized three-dimensional geometry. Spectral Bloom is not a bubble,
liquid membrane, or physical droplet simulation.

## Fundamental distinction

This is a measurement visualizer in the family of an oscilloscope, spectrogram,
spatial audio scope, or spectrum analyzer. It is not a note-event animation and
not a physics game.

It therefore works when the master contains:

- one note;
- chords or dense polyphony;
- drums and noise;
- many tracks at once;
- non-pitched audio;
- silence.

No lead-note selection is required. MIDI may later annotate the display, but
the world must remain complete when only `master.wav` exists.

## Authoritative data

The current direct analysis stores, for every 20 ms master-audio frame:

- 128 signed waveform samples from that frame;
- 24 logarithmic spectral-band magnitudes;
- one signed phase value for each band;
- spectral flux, centroid, spread, and flatness;
- the existing master-energy curve.

The waveform samples preserve positive and negative amplitude. They are
normalized once against a robust song-level peak, never normalized separately
per frame. Relative loudness therefore remains visible and a zero input sample
remains exactly zero.

The first JSON artifact is intentionally an engineering-preview representation.
A compact binary artifact with a higher direct sample count is the production
path for long songs and finer high-frequency shape fidelity.

## Direct 3D mapping

One deterministic particle topology provides the display domain. Its base form
is a rounded surface with a smaller interior population.

The scene maps measured data to that domain without simulation:

1. Particle longitude selects a signed sample from the current waveform frame.
2. Particle latitude selects a spectral band from the current spectrum.
3. The waveform sample moves the surface inward or outward along its normal.
4. A delayed sample from the same frame creates a second tangential depth axis.
5. Signed spectral phase and magnitude add frequency-local depth and shear.
6. Brightness reflects measured waveform magnitude and spectral energy.

This is a spherical 3D oscilloscope/spectral surface. The folds are not chosen
by an effect preset; they are the wrapped waveform and spectrum.

Only linear interpolation between neighboring measured analysis frames is
allowed for 60 fps playback. The authoritative geometry has no velocity,
momentum, damping, spring, modal coefficient, force accumulator, or visual
memory.

## Silence invariant

When the waveform and spectrum are zero:

```text
radial scale = 1
tangential displacement = 0
spectral shear = 0
```

The body must therefore return to exactly the baseline geometry at every silent
frame, regardless of what happened earlier. Seeking directly to a silent frame
must produce the same particle positions as reaching it through playback.

The camera may continue a very slow observational orbit, but it does not alter
the shape and must not imply residual audio motion.

## Stable material

Particles keep stable IDs, base positions, surface/interior roles, and material
properties. The data changes their displayed positions; particles do not
respawn or select random locations each frame.

The body currently contains:

- 26,000 surface particles;
- 5,000 interior particles;
- no transient emitter.

A future spray layer may be added only as a clearly secondary derivative of
the direct waveform. It cannot replace or delay the authoritative measured
surface, and it must disappear immediately or analytically when its source
audio is absent.

## Visual design

The initial art direction remains:

- silver, pearl, and soft white particles;
- dark navy-black environment;
- a restrained cool inner volume;
- round point sprites without square card edges;
- brighter density at measured ridges and compressed regions;
- a slow camera that reveals the 3D waveform without chasing it;
- substantial negative space around one inspectable hero body.

Color is secondary. Pitch or spectral tint may eventually influence subtle
material coloration, but geometry must remain readable in monochrome.

## Expected states

### Silence

The exact baseline body, dim but visible. No residual wobble or recovery tail.

### Simple periodic waveform

Ordered repeating ridges around the body. Different wave shapes must remain
visibly different.

### Chord or dense mix

The directly sampled compound waveform creates a more intricate surface. The
system does not choose one note or average the mix into one generic response.

### Transient

A sharply localized waveform frame produces sharp ridges and spectral depth at
that time. The next frame follows the next measured data rather than continuing
an invented impact trajectory.

### Noise

Irregular high-detail geometry and broad spectral occupancy, still derived from
the measured samples rather than random particle motion.

## Anti-goals

- no notes treated as forces;
- no damped resonant-mode state;
- no spring, gravity, collision, or momentum model;
- no deformation memory after the source signal is zero;
- no random shape selected on a beat;
- no full-body loudness pulse standing in for the waveform;
- no MIDI requirement;
- no literal waveform line floating in front of an unrelated object;
- no bubble surface or claim of literal cymatics physics;
- no camera cuts, snap zooms, or beat-driven framing;
- no color effect used to disguise weak waveform geometry.

## Acceptance question

At any paused frame, can the displayed shape be explained directly from the
signed waveform and spectral values stored for that frame? If not, the effect
does not belong in the authoritative Spectral Bloom geometry.
