# reaper-viz analyzer

The analyzer converts a complete, validated REAPER export package into the
unified `song.json` timeline consumed by visualizer compilers.

## Run it

From the repository root:

```powershell
python -m analyzer projects\untitled-project-6d2e04f7
```

Use `--force` to ignore the content-hash cache and rebuild the file:

```powershell
python -m analyzer projects\untitled-project-6d2e04f7 --force
```

The command validates the complete manifest, WAV metadata, alignment, and
checksums before analysis. It writes `song.json` atomically only after the
result passes `schemas/song.v1.schema.json`.

## Current P0 feature set

- Tempo- and meter-aware beat, downbeat, and bar grid.
- REAPER regions normalized into sections; an unlabeled project gets one
  `unknown` section covering the arranged content.
- Unmuted MIDI notes passed through as authoritative note events.
- Native PCM WAV decoding for 8-, 16-, 24-, and 32-bit REAPER renders.
- Per-track 50 Hz normalized RMS and spectral-centroid curves, plus
  pre-normalization `peakRms` and `meanRms` gain metadata.
- Sample-accurate drum-role onset events and eight-band onset spectra when
  MIDI is absent.
- Master energy, 20 Hz waveform summary, and loudest-hit attribution.
- Content-hash cache: unchanged packages reuse the existing validated output.

Pitch tracking, key/chord estimation, mel-spectrogram sidecars, automatic
section segmentation, and the HTML inspection report are later analyzer
phases. Their output fields are explicit `null` or empty values meanwhile.

## Tests

```powershell
python -m unittest discover -s tests -v
```
