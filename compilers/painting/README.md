# Painting compiler

Compile an analyzed project from the repository root:

```powershell
corepack pnpm compile:painting -- projects\your-project
```

The compiler atomically writes the ignored `performance.painting.json`.

Performance version 2 is the non-linear artifact-canvas slice. It converts
`song.json` into deterministic painterly marks without treating time as a
left-to-right line:

- faint centered construction rings instead of staff-like guide lines;
- section and track washes as whole-canvas glow fields;
- bass or low-note events as centered ripple rings;
- lead/keys/vocal notes as symmetric blooms rather than calligraphic ribbons;
- kick/snare/percussion/onset events as mirrored paint drops, splatters, and
  ripples;
- a final signature/reveal hold.

This is still not the final impasto/FBO renderer. It is intentionally a
deterministic Pixi vector-painting pass so the app can quickly test the visual
language. The current art-direction rule is strict: avoid visible timeline
streaks; prefer rings, radial symmetry, diffuse blooms, drops, and full-canvas
light changes.
