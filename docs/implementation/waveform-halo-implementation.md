# Waveform Halo implementation plan

> Status: WH0-WH3 engineering preview implemented on 2026-07-16. The world is
> selectable and uses direct master-waveform history. Material refinement,
> production analysis resolution, and Q5 song acceptance remain.

## 1. Concept boundary

Waveform Halo is a black aperture surrounded by luminous contour history.
It is deliberately distinct from Spectral Bloom:

- **Spectral Bloom** wraps one waveform frame across a 3D particle body.
- **Waveform Halo** maps the current waveform to an aperture perimeter and
  places recent waveform frames outward through perspective depth.

At measured silence, the scene is one clean glowing circle. Sound deforms that
circle directly. Recent measured frames become the surrounding neon terrain,
and current loudness controls how far that terrain opens. There are no notes,
forces, springs, damping, or persistent simulation state.

## 2. Implemented data path

```text
master.wav
  -> direct 128-sample waveform frames at 50 Hz
  -> deterministic cyclic phase alignment
  -> performance.waveform-halo.json
  -> 84-frame floating-point history texture
  -> 384-segment GPU ribbon contours
```

The compiler reuses the validated `spectral-bloom-master` analysis. Cyclic
phase alignment chooses the sample rotation with maximum correlation to the
previous frame. Rotation preserves every measured value and only establishes
a stable angular origin, preventing adjacent history contours from reading as
unrelated loops.

## 3. Implemented geometric mapping

For normalized history age `h`, current activity `a`, measured waveform `w`,
and historical activity `a_h`:

```text
gate    = a^0.72
radius  = 1.55 + |w| * waveformDepth * (0.72 + 0.48h)
          + 3.15h * historySpread * gate
depth   = 2.7h * historyDepth * gate
opacity = h == 0 ? 1 : gate * a_h * (1 - 0.72h)
```

Waveform magnitude grows outward so the silent circle remains the aperture's
inner boundary; sample polarity never draws a chord through the void. The
first and last waveform samples are joined through a narrow 3.5-percent
seam envelope. This avoids a false chord across the aperture when a finite PCM
window has unequal endpoints. The remaining contour is the measured waveform,
linearly interpolated by the GPU from 128 samples to 384 vertices.

## 4. Rendering architecture

The Three.js scene creates one static ribbon mesh containing 84 contours. Each
contour segment is two triangles, so line width is stable across WebGL drivers.
The scene uploads one `128 x 84` floating-point texture per frame:

- red: signed waveform;
- green: measured energy;
- blue: spectral centroid;
- alpha: measured waveform activity.

A crisp additive pass and a wider low-opacity pass share the same geometry.
The current contour is white-cyan; measured history moves through cyan,
violet, and magenta. Color never changes geometry.

## 5. Silence, seeking, and identity gates

Automated tests require:

- zero waveform makes every historical contour invisible;
- zero waveform leaves the core at radius `1.55` and depth `0`;
- sine and square fixtures retain distinct perimeter shapes;
- phase alignment is cyclic rotation only and preserves the sample multiset;
- history is ordered from current measurement to older measurement;
- direct seeking reconstructs the same texture without playback history;
- compilation is deterministic.

## 6. Current controls

- `Waveform`: current and historical contour displacement;
- `Outward flow`: radial history spread;
- `Depth`: perspective separation between history frames;
- `Ribbon width`: physical contour thickness;
- `Glow`: additive halo intensity;
- `Color`: palette progression;
- `Camera`: observational distance.

## 7. Next work

### WH4 Production waveform analysis

Benchmark 256 and 512 signed samples per frame with band-limited resampling.
Move the matrices to a compact binary artifact before testing long songs.

**Gate:** sine, square, chirp, impulse, speech, drums, and dense mixes retain
recognizable oscilloscope identity without impractical load time.

### WH5 Contour material refinement

Improve ribbon luminance hierarchy, depth occlusion, restrained bloom, and
palette transitions while preserving an inspectable waveform with glow off.

**Gate:** active frames read as one coherent waveform landscape, never as
independent decorative loops.

### WH6 Stereo and spatial mapping

Preserve left/right and mid/side measurements. Use stereo width to control a
measured second depth axis; do not create unrelated left and right worlds.

**Gate:** mono remains centered, pan is reversible, and silence remains the
same single circle.

### WH7 Production acceptance

Run full watch-throughs on two contrasting songs, random seeks, deterministic
PNG/MP4 export, portrait/mobile framing, and GPU profiling.

**Gate:** p95 frame time is at most 16.7 ms at 1080 x 1920, no black frames or
shader warnings occur, and human review confirms that quietness visibly closes
the field toward the aperture.

## 8. Anti-regression rules

- Never convert notes into forces for this world.
- Never retain visual deformation after the measured signal becomes zero.
- Never normalize each frame independently.
- Never let history replace or obscure the current waveform perimeter.
- Never add an effect that is not derived from waveform, spectrum, camera, or
  the shared contour material.
- Never reintroduce the discarded Vortex Loom transport grammar.
