# Spectral Bloom implementation plan

> Status: direct-waveform SB0-SB5 engineering preview implemented on
> 2026-07-16. The earlier damped-modal implementation was removed after the
> product invariant was clarified. Production analysis, material polish, and
> Q5 acceptance remain.

## 1. Implemented architecture

```text
master.wav
  -> Python direct waveform + spectral analysis
  -> song.json master.spectrogram (preview representation)
  -> deterministic direct-data compiler
  -> performance.spectral-bloom.json
  -> Three.js/WebGL2 particle textures and vertex mapping
```

The analyzer owns measurements. The compiler validates, packages, and
interpolates measurements. The scene maps measurements to particles. No layer
owns a simulated audio response.

## 2. Implemented analysis contract

The Python analyzer emits `spectral-bloom-master` schema version 1 at 50 Hz.
Each frame contains:

| Field | Current shape | Meaning |
|---|---:|---|
| `waveform` | 128 signed samples | direct normalized PCM shape for the 20 ms frame |
| `bands` | 24 values | logarithmic spectral magnitudes |
| `phaseCos` | 24 values | signed dominant-bin phase projection |
| `flux` | one curve value | positive spectral change |
| `centroid` | one curve value | spectral brightness |
| `spread` | one curve value | spectral width |
| `flatness` | one curve value | tonal versus noise-like spectrum |

Waveform normalization uses one robust 99.5th-percentile magnitude for the
whole song. Per-frame normalization is forbidden because it would make silence
or quiet audio appear falsely loud.

The analyzer hash includes the direct-waveform contract version, forcing stale
projects to be reanalyzed.

## 3. Implemented compiler contract

`@reaper-viz/compiler-spectral-bloom` requires direct waveform frames. It
rejects older analysis that contains only spectral magnitude.

The performance artifact contains:

- the direct waveform-frame matrix;
- spectral magnitude frames;
- signed spectral frames computed as `magnitude * phaseCos`;
- stable topology counts and seed;
- measurement and validation report;
- supporting feature curves for material tuning and diagnostics.

The compiler performs linear interpolation between adjacent frames. It does
not integrate or retain state. Repeated compilation is deterministic.

## 4. Implemented 3D mapping

`@reaper-viz/scene-spectral-bloom` uses 31,000 stable particles.

For a particle with longitude `u` and latitude `v`:

```text
wave        = waveformFrame[u + small latitude phase skew]
delayedWave = waveformFrame[u + 0.25 - phase skew]
band        = spectralFrame[v]
signedBand  = signedSpectralFrame[v]

radialScale = 1 + 0.58 * wave + 0.20 * signedBand
tangent     = delayedWave * (0.10 + 0.24 * band)
shear       = 0.15 * signedBand * band
```

User tuning scales waveform and spectral depth, but cannot introduce motion
when all measured values are zero.

Waveform and band frames are uploaded as floating-point GPU textures. The
vertex shader samples those textures directly for every particle. The fragment
shader renders round luminous points and derives brightness from measured
activity.

## 5. Silence and seeking gates

Automated gates require:

- zero waveform and zero spectrum produce `radialScale = 1`;
- zero waveform produces zero tangential displacement;
- the silence baseline is identical at every requested time;
- sine and square fixtures remain geometrically distinct;
- midpoint playback is a linear interpolation of the two measured frames;
- direct seeking has no earlier-frame dependency;
- all compiled values are finite and within their declared ranges.

## 6. Current preview

The world is selectable as **Spectral Bloom - SB5 3D Waveform Field**.

Current controls:

- `Waveform`: signed waveform displacement depth;
- `Spectrum`: signed spectral depth and shear;
- `Particles`: point size;
- `Light`: measured-ridge brightness;
- `Core`: interior-particle visibility;
- `Camera`: observational distance;
- `Orbit`: slow non-musical camera movement.

The reference project compiles to 625 direct frames over 12.5 seconds. Browser
review confirms an exact rounded silence baseline and visibly distinct active
waveform shapes with no console warnings.

## 7. Next analysis work

### DW6.1 Compact binary artifact

Move waveform and spectral matrices out of JSON into a versioned little-endian
float artifact with shape, hash, and timing metadata. Keep `song.json` as the
index.

**Gate:** three-minute projects remain practical to load, seek, and cache.

### DW6.2 Higher direct waveform resolution

Benchmark 256, 512, and native-hop sample counts. Apply a documented
band-limited resampler before downsampling so high-frequency waveform shape
does not alias.

**Gate:** known sine, square, chirp, impulse, and dense-mix fixtures retain
their expected oscilloscope shape at the selected production tier.

### DW6.3 Stereo and spatial channels

Stop collapsing the master to mono for this artifact. Preserve left/right,
mid/side, width, correlation, and phase difference. Map them to separate but
coherent spatial axes rather than unrelated particle systems.

**Gate:** mono input remains centered; pan and width fixtures produce measured,
reversible spatial changes.

## 8. Next rendering work

### DW7.1 Better waveform parameterization

Evaluate longitude wraps, spherical spirals, equal-area paths, and delay
embeddings. All candidates must use the same direct samples and return to the
same silence baseline.

**Gate:** the mapping reads as a 3D waveform rather than a decorated sphere.

### DW7.2 Surface legibility

Improve particle density hierarchy, measured ridge light, occlusion, depth,
and interior structure without blur-heavy post-processing.

**Gate:** waveform folds remain inspectable in still frames with bloom off.

### DW7.3 Optional derivative particles

Any detached particles must be an instantaneous or analytically time-bounded
derivative of measured amplitude/flux. They cannot feed back into the primary
surface or persist through measured silence.

**Gate:** disabling derivatives leaves the complete waveform visualizer intact.

## 9. Performance targets

| Metric | Target |
|---|---:|
| desktop particles | 31,000 current; profile up to 68,000 |
| 1080 x 1920 GPU frame time | p95 at or below 16.7 ms |
| hard GPU frame ceiling | 25 ms outside capture stalls |
| scene CPU time | p95 at or below 2 ms |
| runtime scene memory | at or below 128 MB after binary artifact work |
| direct frame upload | one waveform and one spectral texture update per frame |

Do not introduce C++, Rust, WASM, or WebGPU until profiling identifies a named
budget that the current architecture cannot meet.

## 10. Visual-quality ladder

### Q0 - measurement truth

Known waveforms produce their expected signed shapes and silence is exact.

### Q1 - 3D readability

The direct waveform clearly occupies depth and remains inspectable from the
slow camera path.

### Q2 - material unity

Surface, interior, lighting, and optional derivatives read as one particle
medium.

### Q3 - musical range

Periodic tones, chords, drums, noise, speech, and dense mixes remain distinct
without note detection.

### Q4 - composition

The body remains framed elegantly in portrait, landscape, and mobile layouts.

### Q5 - production

Two contrasting songs pass full watch-through, random seeking, deterministic
export, performance, and black-frame gates.

## 11. Anti-regression rules

- Never turn note events into forces for this world.
- Never add damping or previous-frame state to authoritative geometry.
- Never normalize waveform amplitude per frame.
- Never let a secondary effect obscure whether the direct waveform is visible.
- Never allow silence to retain a previous active shape.
- Never describe the field as literal bubble or droplet physics.
