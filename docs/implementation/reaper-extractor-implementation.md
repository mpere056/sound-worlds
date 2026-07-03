# REAPER Extractor — Implementation Plan

**System boundary:** companion Lua ReaScript plus export package
**Depends on:** the manifest schema
**Unlocks:** real-project analyzer, Metro Map, and Waveform Runner testing

This plan implements the design in
[`architecture/reaper-extractor.md`](../architecture/reaper-extractor.md).
The extractor remains a separate deliverable from Vital Vision and from the
TypeScript renderer.

## Implementation status

| Phase | Status | Evidence |
|---|---|---|
| E0 | Implemented | manifest v2 schema, minimal/complex fixtures, standalone validator, invariant tests |
| E1 | Implemented and accepted in REAPER 7.72 | read-only snapshot action produced a 9-track real-project snapshot and surfaced range/GUID/MIDI diagnostics |
| E2 | Implemented and accepted | persisted tab-delimited export plan selected five real-project tracks with corrected automatic roles, GUID identity, and collision-safe paths |
| E3 | Implemented and accepted in REAPER 7.72 | five native selected-stem renders plus full master shared an 11.056-second aligned range; render settings and selection were restored |
| E4 | Implemented and accepted | real WAV metadata/checksums produced a valid five-track manifest and report; standalone validation passed |
| E5 | Partially implemented | console progress, actionable hard failures, stale-target replacement, safe partial-package behavior; cancellation and analyzer launch remain |

E1 deliberately writes `snapshot.json`, not `manifest.json`. The full-package
action writes `manifest.json` only after E3 audio exists, REAPER state has been
restored, and the E4 validator accepts the complete package.

## Exit outcome

From an open REAPER project, one guided action produces:

```text
projects/<song>/
  manifest.json
  export-report.json
  master.wav
  stems/<stable-slug>--<short-guid>.wav
```

The package validates successfully, all files share an origin and sample rate,
MIDI aligns with the rendered master, and REAPER state is unchanged after the
export.

## Phase E0 — Contract fixtures

Build this before touching REAPER automation.

- Finalize manifest v2 JSON Schema.
- Add one minimal fixture and one complex fixture containing tempo changes,
  folders, duplicate roles, MIDI, semantic automation, regions, and tails.
- Add a package validator callable independently of REAPER.
- Define canonical JSON serialization and hashing.
- Define `export-report.json` and error codes.

**Exit gate:** malformed fixtures fail clearly; valid fixtures round-trip
through Python and TypeScript models without information loss.

## Phase E1 — Read-only project snapshot

- Create the Lua extractor entry point and capability/version check.
- Resolve export range using `RV_START`/`RV_END`, time selection, then content
  bounds.
- Read project identity, sample rate, tempo/time signatures, regions, markers,
  tracks, folder hierarchy, colors, and stable GUIDs.
- Extract MIDI into project-relative seconds and musical positions.
- Write a preview manifest and human-readable snapshot report.
- Do not render or change project state in this phase.

**Exit gate:** a known project produces stable, byte-identical structural JSON
on repeated runs; tempo changes and MIDI are manually spot-checked against
REAPER.

## Phase E2 — Export-plan UI and configuration

- Show candidate tracks with include, kind, role, audio, MIDI, and automation
  columns.
- Detect source/folder/bus/return/utility kinds conservatively.
- Warn when a bus and routed children are both selected.
- Store project-specific choices under a dedicated `reaper-viz` namespace.
- Generate collision-safe stem names from a slug plus a short GUID.

**Exit gate:** reopening the project restores assignments; duplicate track
names never collide; no Vital Vision state is read or written.

## Phase E3 — Native stem and master rendering

- Snapshot every REAPER setting or track state the extractor may touch.
- Create a unique temporary render region for the selected export range.
- Configure native renders for selected stems and the full master.
- Render all files at one sample rate, channel policy, origin, and duration.
- Include the configured tail and disable normalization.
- Restore state in success, cancellation, and failure paths.
- Validate headers, sample rates, channels, lengths, and expected file count.

Prefer render-matrix isolation. If the supported REAPER API cannot guarantee a
non-destructive result, render from a temporary project copy and document that
fallback in the report.

**Exit gate:** null-test timing with a click fixture confirms sample alignment;
a state-diff test confirms REAPER returns to its pre-export state.

## Phase E4 — Semantic automation and package finalization

- Add explicit `viz:*` envelope mappings.
- Evaluate mapped envelopes to normalized `TimedCurve` data, including
  automation items and interpolation.
- Compute snapshot and content hashes.
- Write audio checksums and provenance into `export-report.json`.
- Write `manifest.json` atomically only after all validation passes.
- Add a button or command to open the completed package directory.

**Exit gate:** an automation fixture matches sampled REAPER values within
tolerance; interrupted exports never leave a valid-looking partial package.

## Phase E5 — Workflow hardening

- Add cancellation and progress reporting for long renders.
- Add actionable diagnostics for missing plugins, offline media, and render
  failures.
- Add optional analyzer launch after a successful export.
- Add checksum-based analyzer caching; defer incremental REAPER rendering until
  a safe invalidation model exists.
- Document installation, supported REAPER versions, upgrade behavior, and
  troubleshooting.

**Exit gate:** two representative real projects export, analyze, and compile
without manual file editing.

## Test matrix

| Fixture | Proves |
|---|---|
| Constant 120 BPM click | sample alignment and event timing |
| Tempo and meter changes | QN/seconds conversion and grid correctness |
| MIDI with loops/play-rate | project-time note flattening |
| Folder + drum bus + returns | selection warnings and no accidental duplication |
| Duplicate track names | GUID identity and filename collision safety |
| Automation items and curves | evaluated semantic automation |
| Long reverb tail | range and duration policy |
| Cancelled/failed render | cleanup and atomic package behavior |
| Unsaved project edits | open project is authoritative |

## Manual acceptance run

1. Save a copy of a representative REAPER project.
2. Add explicit `RV_START` and `RV_END` markers and named song regions.
3. Run the extractor and review its proposed tracks and roles.
4. Export, then confirm the project state visually did not change.
5. Compare a MIDI onset and a sharp audio transient at several points,
   including after a tempo change.
6. Run the analyzer report and inspect onset, pitch, section, and waveform
   overlays.
7. Compile Metro Map and verify stations/trains against MIDI.
8. Compile Waveform Runner and verify terrain and snare landings against audio.

## Decisions intentionally deferred

- Incremental stem rendering.
- Realtime REAPER telemetry.
- Automatic arbitrary-FX semantic inference.
- Parsing closed `.RPP` projects without launching REAPER.
- Perfect reconstruction of the master by summing stems.
