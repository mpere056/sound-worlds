# M5 — Ship

**Depends on:** M4
**Unlocks:** — (Metro Map complete)
**Est. size:** ~350 LOC compiler/scene + ~200 LOC export glue
**Exit demo:** one command chain takes a real Reaper project to a postable
`final.mp4` **and** a print-resolution poster PNG **and** a real SVG that opens
cleanly in Figma/Illustrator. Golden suite green.

## Goal

Close the quality gap between "works" and "shippable": layout polish, the
performance-critical rendering path, night mode, the artifact exports, and the
full verification suite.

## Scope

**In:** annealing polish pass, ribbon-mesh reveal optimization, night mode,
poster PNG + SVG export, title lozenge end-card, tuning schema pass, golden
suite, docs.
**Out:** nothing — this is the last phase.

## Work breakdown

### 1. Annealing polish (`compilers/metro/src/passes/polish.ts`)
- Search space: per-edge bend orientation (diag-first/last) × label side
  (L/R/BR).
- Cost: crossings×10 + bends-adjacent-to-interchange×3 + label-overlap×5 +
  corridor micro-jogs×2 (M3's fiddly joints get cleaned here).
- ~200 seeded random flips, accept-on-improve. `--no-polish` flag. Must be
  deterministic (seeded from project hash).

### 2. Ribbon-mesh rendering (`scenes/metro/src/ribbon.ts`)
- Replace M2's per-frame `Graphics` progressive draw with the planned static
  triangulated ribbon per line + per-vertex arc-length attribute +
  `revealLen(t)` uniform clip. One triangulation at init; reveal becomes a
  uniform update.
- Perf gate: full map (600 stations, 8 lines) renders < 8 ms/frame at
  1080×1920 on the reference machine (export must beat realtime).

### 3. Night mode
- Second palette family (`ink-navy` bg, brightened line colors, glow pass on
  stations); selected via tuning (`theme: day|night`). Palette solver emits
  both variants at compile so switching is tuning-only (no recompile).

### 4. Artifact exports
- **Poster PNG:** `renderStill(tEnd, 4)` → 4320×7680; tiled render fallback if
  the GPU rejects the buffer; labels forced tier-0 visible; camera = bounds fit.
- **SVG:** serialize `statics` directly — polylines (with offsets baked),
  station circles/rings/bars, labels, legend, title lozenge. Round-trip check:
  parse the SVG, re-extract polylines, assert geometry equality. This is the
  merch file.
- **End-card:** `title.stamp` renders the metro-sign lozenge (song title,
  artist line, "system opened <date>") over the final 2 s hold.

### 5. Tuning schema pass
- Final Tweakpane surface: colors per line (override solver), corridor gap,
  station scale, bloom decay, label density, theme, camera zoom levels,
  reveal-head glow. Verify every param is live in dev and honored by render
  mode via `tuning.metro.json`.

### 6. Verification & docs
- Golden frames: {t=2 s, chorus-1 mid-draw, ring lap 2, final reveal} for the
  ring fixture + one real project (perceptual SSIM ≥ 0.995).
- Determinism: `--hash` double-render check wired into CI script.
- End-to-end script: `scripts/render-all.sh <project> metro` = compile →
  render → mux → poster → SVG.
- Update concept + implementation docs with any drift ("docs lie" check).

## Acceptance criteria

- [ ] Full pipeline command chain produces mp4 + poster + SVG on a real
      project with zero manual steps.
- [ ] Export runs faster than realtime (3-min song < 3 min render) on the
      reference machine.
- [ ] SVG round-trip geometry test green; file opens in Figma with editable
      paths/text.
- [ ] Polish pass reduces cost function on every fixture (or leaves it equal)
      and never breaks octilinearity/spacing properties.
- [ ] Night mode switches without recompiling.
- [ ] Golden + property + sync suites all green; determinism hash check green.
- [ ] A watch-through of one full real song: no visual glitch, sync feels
      locked, the pull-back reveal lands (final human gate).

## Tests added

SVG round-trip; perf budget test (frame-time assertion on the big fixture);
polish cost-monotonicity; tuning round-trip (save → reload → identical params);
final golden set.

## Notes & risks

- Golden churn: polish changes geometry — re-baseline goldens once, in this
  phase, deliberately, and never again.
- Tiled still rendering (poster) has classic seam pitfalls with post effects —
  render the poster **without** bloom (flat vector look is correct for print
  anyway); document that choice in the tuning UI.
