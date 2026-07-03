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
