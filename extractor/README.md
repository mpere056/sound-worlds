# reaper-viz extractor

This is the separately installable REAPER companion for `reaper-viz`. It does
not use Vital Vision state or scripts.

## Current implementation

Implemented:

- E0 manifest v2 JSON Schema, fixtures, standalone validator, and tests;
- E1 read-only REAPER project snapshot, accepted in REAPER 7.72;
- export-range selection, tempo/time signatures, regions/markers, tracks,
  folder paths, stable GUIDs, role heuristics, and flattened active-take MIDI,
  including repeated cycles of looped MIDI items;
- E2 persisted export plan with include/exclude and role assignment;
- E3 aligned native REAPER stem and master rendering with a common origin,
  duration, sample rate, and tail;
- E4 normalized semantic automation sampling, audio metadata/checksums,
  atomic manifest finalization, state-restoration verification, and package
  validation;
- deterministic snapshot/content hashing and automated contract tests.

The complete-package path has been accepted in REAPER 7.72 with five stems and
a master WAV. The resulting manifest passed the standalone validator.

## Run the E1 snapshot

1. In REAPER, open **Actions → Show action list**.
2. Choose **New action → Load ReaScript**.
3. Load `extractor/reaper/ReaperViz_Export_Snapshot.lua`.
4. Optionally create `RV_START` and `RV_END` markers. Otherwise the current
   time selection is used, then project content bounds.
5. Run **reaper-viz: export read-only project snapshot (E1)**.

When run from this repository, output is written to
`reaper-viz/projects/<project-slug>/snapshot.json`. The action does not render,
save, dirty, select, solo, mute, arm, or otherwise modify the project.

## Export the full analyzer-ready package

1. Stop REAPER playback and recording.
2. In **Actions -> Show action list**, choose **New action -> Load ReaScript**.
3. Load `extractor/reaper/ReaperViz_Export_Full_Package.lua`.
4. Run **reaper-viz: export complete analyzer-ready package (E2-E4)**.
5. On its first run, the action creates `export-plan.txt`. Choose **Yes** to
   render the safe defaults immediately, or **No** to edit the plan first.
6. A successful run writes and validates `manifest.json`,
   `export-report.json`, `master.wav`, and aligned files under `stems/`.

The plan is tab-delimited and persists beside the song export. Set `include`
to `1` or `0`, and choose one of the documented roles. Track GUIDs keep files
stable even when names collide.

The action temporarily changes REAPER render settings and track selection. It
restores and verifies both before finalizing the package. If restoration or
audio validation fails, it does not leave a valid-looking `manifest.json`.

To expose semantic automation, name an envelope `viz:<key>` or include
`[viz:<key>]` in its name. Values are evaluated every 20 ms and normalized to
the 0..1 range. Automation is optional; audio, MIDI, tempo, and regions export
without it.

## Validate a complete package

Validate any completed package independently with:

```powershell
python tools/validate_export.py projects/<song>/manifest.json
```

During contract development, validate fixture structure without WAV files:

```powershell
python tools/validate_export.py fixtures/exports/minimal/manifest.json --structure-only
```

Run tests with:

```powershell
python -m unittest discover -s tests -v
```
