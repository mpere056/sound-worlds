# Analyzer (Python)

Turns `manifest.json` + stems into [`song.json`](data-contracts.md#songjson-analyzer--compilers)
— the unified musical timeline. Lives in `analyzer/`, managed with `uv`,
invoked as:

```bash
uv run analyze projects/mysong          # writes projects/mysong/song.json
uv run analyze projects/mysong --force  # ignore cache
```

**Dependencies:** `librosa`, `soundfile`, `numpy`, `pydantic`. Optional extras
behind flags: `crepe` (neural pitch, better than pYIN on noisy leads).
Everything works librosa-only in the MVP.

> **Current implementation:** the P0 foundation intentionally uses NumPy plus
> native PCM WAV decoding, so it runs against a fresh REAPER export without the
> heavier librosa stack. Grid/section compilation, MIDI passthrough,
> RMS/centroid curves, per-stem gain metadata, sample-accurate drum onsets,
> drum onset spectra, master energy/waveform, schema validation, and caching
> are present. Pitch, key/chords, mel sidecars,
> automatic segmentation, and the HTML report below describe the next analyzer
> phases.

The analyzer trusts REAPER for project structure and timing, but it verifies
the export package before analysis: schema version, file existence, checksums,
sample rates, channel metadata, and aligned durations. Export-package failures
are hard errors rather than analysis fallbacks.

`song.meta.seed` comes from `manifest.project.contentHash`. Its
`contentEndSec` marks the end of arranged material, while `durationSec` includes
the exported tail; compilers use that tail for decay and the final end-card
hold rather than truncating the master.

## Guiding rule: MIDI wins

If a track has MIDI in the manifest, its notes pass through verbatim (`kind:
"note"`) and audio analysis of that stem is skipped except for RMS/centroid
curves. Audio analysis exists to fill in what MIDI already knows. Encourage
MIDI-heavy Reaper projects — every MIDI track is a free accuracy upgrade.

## Per-stem analysis (audio tracks)

Run per track, parameterized by role:

| Feature | Method | Notes |
|---|---|---|
| Onsets | Native sample-domain threshold crossing for drum roles | Avoids the 20 ms animation-curve quantization; click tests must land within ±5 ms |
| Velocity proxy | Local peak amplitude in the 50 ms after each onset, normalized per-stem to 0–1 | Good enough to drive size/brightness |
| RMS curve | Native RMS, sampled to the 50 Hz TimedCurve grid and normalized per stem | Every track gets one |
| Gain metadata | Pre-normalization `peakRms` and `meanRms` | Lets consumers reconstruct cross-track dynamics from normalized curves |
| Spectral centroid | Native FFT centroid, 50 Hz | Brightness driver (palette, light temperature) |
| Pitch track | `librosa.pyin` (or crepe) — **pitched mono roles only** (lead, bass, vocals) | Voiced-confidence gated; unvoiced gaps left null |
| Note segmentation | Pitch track → notes: split on voiced gaps + median-pitch steps > 0.6 semitones; min duration 60 ms | Produces `kind:"note"` events with float pitch for audio-only leads |
| Per-onset spectra | 2048-sample FFT at each onset → 8 log-spaced band energies, normalized | **Drum roles only.** This is the Storm concept's bolt-shape input; cheap to compute for everyone, stored per onset |

## Master analysis

| Feature | Method | Notes |
|---|---|---|
| Beat grid | Manifest tempo map is authoritative; `librosa.beat.beat_track` runs as a cross-check and logs a warning if they disagree > 25 ms median | Live-recorded projects without a clean tempo map fall back to tracked beats |
| Energy curve | RMS of master, smoothed (250 ms), normalized 0–1 | The single most-used signal (camera speed, descent rate, sun height…) |
| Waveform summary | Min/max peaks at 20/sec | Runner terrain strata, silhouette end-cards |
| Mel spectrogram | Fixed log-mel bands on a documented time grid | Corridor walls and any later frequency-surface concepts |
| Key estimate | Chroma → Krumhansl-Schmuckler correlation | `{tonic, mode, confidence}`; compilers treat low confidence as "use neutral palette" |
| Chord track | Beat-synchronous chroma → template matching (maj/min/7 MVP) | Skipped entirely if a keys MIDI track exists — real voicings win |
| Loudest hit | Max short-window peak, attributed to the stem with the strongest coincident onset | One timestamp; several concepts use it (slow-mo, tree strike) |

## Section normalization

Regions from the manifest are mapped to normalized `kind` values via a regex
table (`verse|v\d → verse`, `chorus|hook → chorus`, `drop → drop`, `bridge|mid8
→ bridge`, …), preserving original names for display. Sections with matching
normalized names + similar lengths share a `repeatGroup` — this powers
"repetition becomes form" features (painting reinforcement, metro loop lines,
city height-by-repetition).

**No regions in the project?** Fallback: automatic segmentation on the master
(`librosa.segment` self-similarity novelty), labeled `unknown`, `repeatGroup`
by cluster. It works, but region labels are strongly recommended — they're
free inside Reaper and drive every concept's narrative arc.

## Output & caching

- Output validated by pydantic models mirroring the shared JSON Schema, then
  written as `song.json` (typically 1–3 MB for a 3-minute song; curves dominate).
  Large feature matrices such as the Corridor spectrogram are raw typed-array
  sidecars under `features/`, referenced by shape/dtype/path from `song.json`,
  rather than enormous nested JSON arrays.
- A `.analysis-cache/` keyed by stem file hashes makes re-runs instant when only
  some stems changed.
- `--report` flag emits `analysis-report.html`: waveforms with onset markers,
  pitch overlays, detected sections — the eyeball check that catches a bad
  onset threshold before it becomes a bad video.

## Failure modes to handle explicitly

- **Bleedy stems** (mic bleed, bus effects) → onsets gated by per-stem RMS floor.
- **Sub-bass leads** pYIN octave errors → role-aware frequency ranges.
- **Silence-padded stems** → trim-aware; times always refer to project timeline.
- **Missing stems** listed in manifest → hard error (never silently degrade).
- **Checksum or audio-metadata mismatch** → hard error with a request to
  re-export; never analyze a partially replaced package.
- **Duplicate track names** → safe because identity and cache keys use stable
  track IDs, not display names.
