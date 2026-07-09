# REAPER Extractor

The REAPER extractor is a companion subsystem for `reaper-viz`. It is not part
of Vital Vision, and the visualizer runtime does not depend on REAPER after an
export has completed.

Its job is to turn the authoritative, currently open REAPER project into a
portable and deterministic export package:

```text
Open REAPER project
  -> project snapshot (Lua ReaScript)
  -> native REAPER renders
  -> manifest.json + stems/*.wav + master.wav + export-report.json
  -> external Python analyzer
```

The extractor does not perform onset detection, pitch tracking, chord
detection, spectral analysis, or visual choreography. Those belong to the
analyzer and compilers.

## Why the extractor runs inside REAPER

The primary extractor should be a Lua ReaScript, not an `.RPP` parser and not
an OSC client.

- ReaScript sees the authoritative open project, including unsaved edits.
- REAPER performs the audio renders, so plugin processing and routing match the
  project rather than an external reconstruction.
- Lua keeps the REAPER-side dependency surface small. Python remains external,
  where its audio-analysis libraries are useful.
- OSC is appropriate for realtime control and telemetry; this pipeline is an
  offline snapshot and benefits more from inspectable files.

Parsing `.RPP` files may later be useful for diagnostics or CI fixtures, but it
must not be the production source of truth.

## The extractor has three jobs

### 1. Snapshot the musical project

Export:

- project identity, sample rate, export range, and tail policy;
- tempo and time-signature markers, including musical positions and ramp state;
- markers and regions with names, colors, and stable identifiers;
- tracks with stable GUIDs, names, colors, folder paths, roles, and kinds;
- MIDI notes converted into project-relative seconds while retaining musical
  position, channel, velocity, duration, mute state, and source identifiers;
- explicitly mapped semantic automation curves.

Track indices are included for display only. Downstream identity uses GUIDs.

### 2. Render aligned audio

Every exported stem and the master must:

- start at the same export origin;
- have the same nominal duration and sample rate;
- retain leading and internal silence;
- use no normalization;
- use a documented channel count and tail duration.

The default isolated-stem policy is **post-track FX and post-fader, before
parent/master processing**. `master.wav` is rendered separately through the
complete audible mix. This gives the analyzer useful isolated sources without
pretending that summing them must reproduce a master containing bus and master
effects.

Folder tracks, buses, returns, reference tracks, and hidden utility tracks are
not automatically rendered as additional stems. They require explicit opt-in;
otherwise a drum kit could be counted once as children and again as its bus.

Prefer REAPER's render-region/render-matrix workflow. If a supported REAPER
version cannot configure the desired render safely through ReaScript, perform
the render in a temporary project copy. Do not leave the musician's live
solo/mute, render, selection, or transport state changed.

### 3. Validate and fingerprint the package

The extractor writes `manifest.json` only after the expected audio files exist
and pass basic validation. It also writes `export-report.json` containing:

- extractor and manifest schema versions;
- warnings and excluded-track reasons;
- source project path and GUID;
- render settings and actual audio metadata;
- checksums for the manifest inputs, stems, and master;
- timings for snapshot, render, and validation stages.

The project content hash is calculated from canonical manifest input plus audio
checksums. A changed synth patch or effect therefore changes the seed even if
the project name does not.

## Export range

All downstream times are seconds from the export origin, not necessarily from
REAPER project time zero. Select the range in this order:

1. markers named `RV_START` and `RV_END`;
2. a non-empty REAPER time selection;
3. detected project content bounds plus the configured tail.

The extractor preview must show the chosen range and require confirmation when
falling back to content bounds. Regions and events outside the range are
omitted; intersecting regions are clipped and reported.

The content range ends at `contentDurationSec`; rendered audio continues through
the configured tail to `audioDurationSec`. Downstream video duration matches
the latter, so reverb decays are not cut off and the tail can serve as the
artifact/end-card hold.

## Track selection and roles

Before rendering, show a compact export plan with one row per candidate track:

| Field | Purpose |
|---|---|
| Include | Prevent reference and utility tracks entering analysis |
| Name / GUID | Human label plus stable identity |
| Kind | `source`, `folder`, `bus`, `return`, `master`, or `utility` |
| Role | Explicit override or detected role |
| Audio | Whether to render a stem |
| MIDI | Note count and whether it will be exported |
| Automation | Semantic mappings included in the export |

Saved choices live in a `reaper-viz` project namespace or a companion config,
never in Vital Vision state. Role precedence remains:

1. REAPER-side explicit assignment;
2. per-song `roles.json` override;
3. name heuristics;
4. `other`.

Multiple tracks may share a role and remain distinguishable by their GUIDs.

## Semantic automation

Do not dump every plugin envelope. Raw FX parameter names are unstable,
plugin-specific, and often meaningless to visual compilers.

Automation is exported through explicit normalized mappings such as:

- `viz:riser`
- `viz:tension`
- `viz:brightness`
- `viz:wind`
- `viz:drop-intensity`

A mapping records the source envelope, source range, normalized range, and
sampling policy. Evaluate the envelope, including automation items and curve
shapes, onto a uniform time grid rather than exporting only raw control points.
The default sample interval is 20 ms, matching `TimedCurve`; slower parameters
may use a lower rate.

## Rendering state safety

The extractor must snapshot any REAPER state it touches and restore it in a
finally-style cleanup path, including on render failure. Relevant state
includes:

- time selection and edit cursor;
- track selection, solo, mute, arm, and monitoring;
- render bounds, file pattern, directory, source, channels, sample rate, and
  tail settings;
- temporary regions and render-matrix assignments;
- repeat and transport state.

Temporary resources use a unique export-run identifier and are removed only if
they carry that identifier.

## Determinism and caching

The package distinguishes two hashes:

- `snapshotHash`: canonical structural data before rendering;
- `contentHash`: snapshot hash plus all rendered-audio checksums.

The analyzer cache keys individual tracks by stem checksum plus analysis
settings. The extractor may skip a render only when it can prove that the track,
its relevant routing/FX state, export range, and render settings are unchanged.
Correctness comes before clever incremental rendering; initial versions should
re-render all selected stems.

## Failure policy

Hard failures:

- missing or unreadable rendered files;
- inconsistent sample rates or export lengths;
- duplicate stable IDs;
- invalid tempo map;
- a selected track that cannot be rendered;
- failure to restore touched REAPER state.

Warnings requiring visibility in the report:

- no named regions;
- unmatched track roles;
- MIDI events clipped by the export range;
- buses selected alongside their routed children;
- automation mapping with a missing envelope;
- master/stem duration mismatch within the permitted tail tolerance.

Never silently omit selected material.

## Non-goals

- Realtime visualization or low-latency telemetry.
- Reconstructing the audible master by summing exported stems.
- Exporting complete plugin state.
- Automatically understanding arbitrary FX automation.
- Sharing code, configuration, or runtime state with Vital Vision.

If a realtime visualizer is later desired, build a separate telemetry path
(for example track meters or dedicated analyzer effects). It should complement,
not replace, this offline extractor. The first recorded use case is
[Realtime Marble Music](../implementation/realtime-marble-music.md), which
turns live REAPER MIDI notes into collision platforms beneath a falling marble.
