# Painting compiler

Compile an analyzed project from the repository root:

```powershell
corepack pnpm compile:painting -- projects\your-project
```

The compiler atomically writes the ignored `performance.painting.json`.

Performance version 3 is the persistent non-linear artifact-canvas slice. It converts
`song.json` into deterministic painterly marks without treating time as a
left-to-right line:

- faint centered construction rings instead of staff-like guide lines;
- section and track washes as whole-canvas glow fields;
- bass or low-note events as centered ripple rings;
- lead/keys/vocal notes as symmetric blooms rather than calligraphic ribbons;
- kick/snare/percussion/onset events as mirrored paint drops, splatters, and
  ripples;
- master-energy tail stains when the rendered audio continues after the last
  extracted note/onset, so the painting keeps responding through the real audio
  end;
- a final signature/reveal hold.

This is still not the final impasto/FBO renderer. It is intentionally a
deterministic Pixi vector-painting pass so the app can quickly test the visual
language. The current art-direction rule is strict: avoid visible timeline
streaks; prefer rings, radial symmetry, diffuse blooms, drops, and full-canvas
light changes. Once paint lands, it remains as a dry stain; wet highlights and
diffusion may continue to move, but no mark should disappear as if it were only
a temporary visual effect.
