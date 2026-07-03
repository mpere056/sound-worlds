# Data Contracts

Every stage boundary has a JSON control file validated against a shared schema.
Large audio and feature-matrix sidecars are referenced by path, checksum, type,
and shape. The JSON Schema files in `packages/core/schema/` are the single
source of truth; Zod (TypeScript) and pydantic (Python) models are generated
from / validated against them. Every control file carries `schemaVersion` for
forward compatibility.

Times are always **seconds from the chosen export origin** (float). The origin
and its position in the REAPER project are recorded in the manifest. Pitches
are MIDI note numbers (float allowed for detected pitch). All coordinates the
renderer sees are resolution-independent (0–1 normalized or world units),
never pixels.

---

## `manifest.json` (extractor → analyzer)

The boundary with REAPER. The companion extractor is documented in
[reaper-extractor.md](reaper-extractor.md). Everything downstream depends only
on this package and never reads the live REAPER project.

```jsonc
{
  "schemaVersion": 2,
  "extractor": {
    "name": "reaper-viz-extractor",
    "version": "0.1.0",
    "reaperVersion": "7.x"
  },
  "project": {
    "name": "mysong",
    "guid": "{...}",
    "snapshotHash": "sha256:...", // canonical structural snapshot
    "contentHash": "sha256:...",  // snapshot + rendered audio → global seed
    "sampleRate": 48000,
    "contentDurationSec": 214.6,
    "audioDurationSec": 216.6,
    "exportRange": {
      "source": "markers",        // markers | time-selection | content-bounds
      "projectStartSec": 2.0,
      "projectEndSec": 216.6,
      "tailSec": 2.0
    }
  },
  "tempo": [                      // tempo/time-sig map, ≥1 entry
    { "id": 0, "timeSec": 0, "qn": 0, "bpm": 96,
      "tsNum": 4, "tsDen": 4, "linearRamp": false }
  ],
  "regions": [                    // section labels — drive scene arcs
    { "id": 4, "name": "Verse 1", "startSec": 7.5, "endSec": 37.5,
      "startQn": 12, "endQn": 60, "color": "#4a90d9" }
  ],
  "markers": [
    { "id": 8, "name": "drop", "timeSec": 120.0, "qn": 192,
      "color": "#e4573d" }
  ],
  "tracks": [
    {
      "index": 0,
      "id": "{REAPER-TRACK-GUID}",
      "name": "Kick",
      "color": "#d95f59",
      "kind": "source",           // source|folder|bus|return|utility
      "folderPath": ["Drums"],
      "role": null,               // optional explicit role override
      "stem": {
        "path": "stems/kick.wav",
        "checksum": "sha256:...",
        "sampleRate": 48000,
        "channels": 2,
        "durationSec": 216.6,
        "renderMode": "post-track-fx-post-fader-pre-parent"
      },
      "midi": null,               // or the MidiNote records described below
      "automation": [             // semantic, evaluated automation only
        { "param": "viz:riser", "source": "Riser Amount",
          "curve": { "t0": 0, "dt": 0.02, "values": [0, 0.01, 0.02] } }
      ]
    }
  ],
  "master": {
    "path": "master.wav",
    "checksum": "sha256:...",
    "sampleRate": 48000,
    "channels": 2,
    "durationSec": 216.6
  },
  "reportPath": "export-report.json"
}
```

### MIDI notes

MIDI is flattened into the audible project timeline by the extractor so item
loops, take offsets, and play rates do not leak into downstream timing logic.
It retains provenance and musical position for diagnostics:

```jsonc
{
  "id": "{take-guid}:note:41",
  "itemId": "{item-guid}",
  "takeId": "{take-guid}",
  "pitch": 64,
  "velocity": 0.79,
  "channel": 0,
  "startSec": 12.5,
  "durationSec": 0.42,
  "startQn": 20,
  "durationQn": 0.67,
  "muted": false
}
```

Muted notes may be retained for diagnostics but are ignored by the analyzer.

### Audio alignment invariant

Every stem and `master.wav` shares the export origin, sample rate, and nominal
timeline duration. Leading silence is meaningful and must not be trimmed.
Checksums and actual audio metadata are verified before analysis.

### `export-report.json`

The report carries provenance and diagnostics rather than musical data:

- extractor/REAPER versions and export-run ID;
- render configuration and timings;
- included and excluded tracks with reasons;
- warnings (missing regions, unmatched roles, bus/child duplication risk);
- per-file checksum and audio metadata;
- state-restoration result;
- final package validation result.

The manifest is written atomically only after the report says validation
succeeded.

---

## Roles

Downstream code never addresses "track 3" — it addresses **roles**:

`kick · snare · hats · toms · percussion · bass · lead · keys · pads · fx · vocals`

Assignment order of precedence:

1. `role` field in the manifest (explicit override)
2. `projects/<song>/roles.json` (per-project mapping file)
3. Name heuristics (case-insensitive regex table: `/kick|bd/ → kick`,
   `/snare|sd|clap/ → snare`, `/hat|hh|shaker/ → hats`, `/bass|sub|808/ → bass`,
   `/lead|melody|arp|pluck/ → lead`, `/pad|keys|piano|rhodes|string/ → keys`,
   `/fx|riser|sweep|impact/ → fx`, `/vox|vocal|voice/ → vocals`, …)

Multiple tracks may share a role (two lead tracks → both emit `lead` events,
tagged with their source track id). Unmatched tracks get role `other` and are
available but unused by default.

---

## `song.json` (analyzer → compilers)

The unified musical timeline — MIDI truth merged with audio analysis. This is
the only file compilers read.

```jsonc
{
  "schemaVersion": 1,
  "meta": {
    "name": "mysong",
    "seed": "sha256:...",        // manifest project.contentHash
    "contentEndSec": 214.6,      // end of arranged material
    "durationSec": 216.6,        // audio/video timeline including tail
    "key": { "tonic": "F#", "mode": "minor", "confidence": 0.82 }
  },

  "grid": {
    "beats":     [0.0, 0.625, 1.25, ...],   // every beat, seconds
    "downbeats": [0.0, 2.5, 5.0, ...],
    "bars": [ { "index": 0, "startSec": 0.0, "endSec": 2.5 } ]
  },

  "sections": [
    {
      "name": "Verse 1",
      "kind": "verse",            // normalized: intro|verse|prechorus|chorus|
                                  //   bridge|drop|breakdown|solo|outro|unknown
      "startSec": 7.5, "endSec": 37.5,
      "repeatGroup": "verse",     // sections sharing a group are "the same part"
      "energy": 0.42              // mean master energy inside the section, 0–1
    }
  ],

  "tracks": [
    {
      "id": "{REAPER-TRACK-GUID}",
      "name": "Kick",
      "role": "kick",
      "events": [                 // notes (MIDI) or onsets (audio) — one list
        { "t": 0.0, "dur": 0.1, "pitch": null, "vel": 0.9, "kind": "onset" },
        { "t": 1.25, "dur": 0.4, "pitch": 53,  "vel": 0.7, "kind": "note"  }
      ],
      "curves": {                 // per-stem continuous features (TimedCurve)
        "rms":      { "t0": 0, "dt": 0.02, "values": [ ... ] },
        "centroid": { "t0": 0, "dt": 0.02, "values": [ ... ] },
        "pitch":    null          // present for pitched mono roles
      },
      "spectra": [                // drum roles only — per-onset log-band FFT
        { "t": 0.0, "bands": [0.9, 0.7, 0.3, 0.2, 0.1, 0.05, 0.02, 0.01] }
      ]
    }
  ],

  "master": {
    "energy":   { "t0": 0, "dt": 0.02, "values": [ ... ] },   // 0–1 normalized
    "waveform": { "peaksPerSec": 20, "min": [...], "max": [...] },
    "spectrogram": { "t0": 0, "dt": 0.02, "bandsHz": [...],
      "dataPath": "features/master-mel.f32", "dtype": "float32-le",
      "shape": [128, 10730] },
    "chords": [ { "t": 0.0, "dur": 2.5, "root": 6, "quality": "min",
                  "pitches": [54, 57, 61] } ],
    "loudestHit": { "t": 120.0, "trackId": "t0" }
  }
}
```

### TimedCurve

All continuous signals share one representation — uniform sampling:

```ts
interface TimedCurve { t0: number; dt: number; values: number[] }
// sample(curve, t) = lerp between the two nearest samples; clamped at ends
```

50 Hz (`dt: 0.02`) is the default — smooth enough for animation, ~10k floats
per curve for a 3-minute song. Compilers may resample; renderers only `sample()`.

---

## `performance.<concept>.json` (compiler → renderer)

The fully scheduled visual performance. **Everything is decided here** — the
renderer executes without consulting `song.json`.

```jsonc
{
  "schemaVersion": 1,
  "concept": "metro",
  "seed": "a1f4657c:metro",
  "durationSec": 216.6,
  "fps": 60,
  "resolution": { "w": 1080, "h": 1920 },

  "palette": {                    // solved per song (see core/palette)
    "bg": "#0e1420",
    "roles": { "lead": "#e4573d", "bass": "#2f6fd0", ... }
  },

  "camera": [                     // keyframed; renderer interpolates
    { "t": 0,    "pos": [0, 0, 10], "zoom": 1.0, "ease": "cubicInOut" },
    { "t": 12.5, "pos": [0, -4, 10], "zoom": 1.15 }
  ],

  "curves": {                     // named TimedCurves the scene may sample
    "energy": { "t0": 0, "dt": 0.02, "values": [...] }
  },

  "events": [                     // the heart of the file — typed, sorted by t
    { "t": 7.5,  "type": "station.bloom", "layer": "line:lead",
      "params": { "stationId": "s41", "vel": 0.8 } },
    { "t": 10.0, "tEnd": 12.4, "type": "train.travel", "layer": "line:lead",
      "params": { "from": "s41", "to": "s42", "ease": "arrive" } }
  ],

  "statics": { /* concept-specific precomputed geometry, e.g. the whole map
                 layout, terrain polylines, city lots — anything not animated */ }
}
```

Rules:

- Compilers schedule musical events through `meta.contentEndSec`; the remaining
  timeline through `durationSec` is the configured tail/end-card hold. Final
  audio and video therefore have the same intended duration.
- `events` are sorted by `t`; instantaneous events omit `tEnd`.
- `type` strings are namespaced per concept; the shared runtime only cares
  about `t`/`tEnd`/`layer` — payloads are concept-typed in TS.
- Every event that "lands on" a musical hit **must carry the hit time it was
  solved against** in `params.hitT` — this is what sync tests assert on.

---

## `tuning.<concept>.json`

Saved Tweakpane state (colors, sizes, glow strengths, camera feel). Loaded by
both dev preview and render mode so the tuned look is exactly what exports.
Kept separate from `performance.json` because tuning is aesthetic, not
structural — re-tuning must not require recompiling.

---

## Versioning & validation

- Additive changes bump minor; breaking changes bump `schemaVersion` and the
  loading stage refuses mismatches with a clear error.
- Manifest v2 is the first extractor-backed contract. Hand-authored v1 fixtures
  must be migrated explicitly; the analyzer does not guess missing alignment,
  identity, or render semantics.
- Analyzer validates `manifest.json` (pydantic) and its own `song.json` output.
- Compilers validate `song.json` in, `performance.json` out (Zod).
- The renderer validates `performance.json` on load — a scene never sees
  malformed data.
