# Metro Map compiler

Compile an analyzed project from the repository root:

```powershell
corepack pnpm compile:metro -- projects\your-project
```

The compiler atomically writes the ignored `performance.metro.json`. MIDI
notes become pitch-class stations, aligned notes become interchanges, chords
become station clusters, and every connection is routed horizontally,
vertically, or at 45 degrees.

When an exported track has no MIDI or pitch events, M1 creates an explicitly
tagged `audio-activity` shuttle from beat positions and the track RMS curve.
This keeps audio-only REAPER packages useful without pretending that inferred
stations are pitches. The chosen source is recorded for every line.

M2 adds timestamped train schedules, progressive reveal, and bloom events. The
implemented M3 slice labels stations, compiles a frontier-follow/final-fit
camera, and offsets coincident routes by stable global line rank. Edge lengths
are recomputed after offsetting, so trains follow the displayed paths, and
interchange rings expand to cover their separated member lines.

Performance version 6 includes:

- sync-readability diagnostics: `lineAudits` record per-line source, hit, and
  station counts, and `syncHits` records the current/next note payoff data
  consumed by the preview app's Metro audit overlay;
- section district bands: `districts` maps `song.sections[]` into world-space
  bands rendered behind the transit lines.
