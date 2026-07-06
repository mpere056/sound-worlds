# Painting compiler

Compile an analyzed project from the repository root:

```powershell
corepack pnpm compile:painting -- projects\your-project
```

The compiler atomically writes the ignored `performance.painting.json`.

Performance version 1 is the first artifact-canvas slice. It converts
`song.json` into deterministic painterly marks:

- section washes and pencil construction lines;
- bass or low-note horizon strokes;
- lead/keys/vocal note ribbons;
- kick/snare/percussion dabs and splatters when those roles exist;
- fallback rhythmic dabs from prominent note/onset events when no drums exist;
- a final signature/reveal hold.

This is not the final impasto/FBO renderer yet. It is intentionally a
deterministic Pixi vector-painting pass so the app can preview whether the
concept has the right visual/emotional direction before deeper paint simulation
work begins.
