# Quality Gap Analysis — why Metro & Runner don't look like the docs

**Date:** 2026-07-04
**Scope:** review of the canonical Windows working copy plus the current local
reference export. No code was changed in producing the original analysis; this
normalized version lives beside its companions:
[Song Authoring Guide](song-authoring-guide.md) and
[Visual Recovery Plan](visual-recovery-plan.md).

## TL;DR

The bad look has **three stacked causes**, in order of impact:

1. **The current reference export starves every beauty mechanism.**
   `projects/untitled-project-6d2e04f7` is an 11-second snippet with four
   identical piano tracks (all
   `role: keys`), zero drums, zero bass, zero lead/vocals, zero regions/markers.
   Nearly everything the concept docs promise — bass-shaped terrain,
   snare-timed jumps, melody glyphs, section arcs, multi-line maps with
   transfers, chorus rings — is keyed to information this project does not
   contain. The compilers correctly fall back to their "honest" modes
   (MIDI-note landings/pulses, MIDI-contour terrain with audio-tail energy,
   MIDI glyphs, bar-position
   labels), and honest fallbacks are bland *by design*.
2. **The scenes diverge from the documented visual design.** Both scene files
   hardcode debug-tier presentation (titles/status text burned into the
   artwork, hardcoded hex palettes, decorative fake data, no camera usage in
   Runner, no additive glow anywhere). Specifics with line references below.
3. **The identity phases are not built yet.** Runner R4 (erasure front, crumbs,
   real strata, trail — the entire visual signature) and Metro M4–M5 (chorus
   rings, night mode, polish) don't exist. Even with perfect data and clean
   scenes, today's output is an engineering preview of phases R3/M3 —
   the docs' hero imagery lives in the unbuilt phases.

A fourth, procedural finding: **functional status and visual quality need to be
tracked separately** (see §5).

---

## 1. What was actually inspected

Present in this canonical repo: `extractor/`, `analyzer/`, `packages/`,
`compilers/`, `scenes/`, `schemas/`, `tools/`, tests, Git history, and local
project exports. The visual audit focused on the currently active scenes and
the newest local reference export, `projects/untitled-project-6d2e04f7`.

**Consequence:** the project architecture is intact; the main visual gap is
not that the repo lacks compilers or tests. It is that today's most visible
scenes are still engineering-preview renderers, and the current reference
export does not contain the musical roles/sections needed to exercise the
concepts. The math findings in [Math Audit](math-audit.md) should still be
converted into tests in this repo so the solver behavior is pinned down by
numbers rather than confidence.

## 2. Layer 1 — Input starvation (highest impact, zero code required)

`projects/untitled-project-6d2e04f7/manifest.json`:

| Fact | Value | What it starves |
|---|---|---|
| Duration | ~11 s | No structure, no arc, no journey — every concept is designed around 2–4 min |
| Tracks | 4 × `VV_Piano_Vital`, all `role: keys` | Metro: 4 near-identical lines, no meaningful transfers. Runner: no role variety at all |
| Drums | none | Runner landings now fall back to budgeted MIDI note starts before bar downbeats, but there are still no kick pulses/zoom |
| Bass | none | Terrain falls back to master-energy envelope → low-contrast mush instead of melodic skyline |
| Lead/vocals | none | Glyphs fall back to `audio-activity` mode → beat-synchronous blobs, no melody drawn in the world |
| Regions/markers | none | No sections → no gates, no palette arcs, no biome changes; Metro rings (M4) will never trigger |
| Tempo map | 1 entry | Fine, but nothing for structure detection to work with |

**This is the "garbage-in" half of the problem.** The concept docs' beauty is
conditional on musical information; the fallbacks exist so the pipeline never
crashes, not so the output looks good. Fix: author a real test song to the
spec in [Song Authoring Guide](song-authoring-guide.md) — this single
action improves both games more than any code change.

## 3. Layer 2 — Scene divergences from the documented design

### 3.1 Runner (`scenes/runner/src/index.ts`)

This table records the original recovery audit plus current status. Items
marked fixed should remain regression targets rather than active blockers.

| Line(s) | Observed | Documented design | Impact |
|---|---|---|---|
| Original debug title/status | Fixed: in-canvas Runner debug labels removed | Overlays belong to the dev harness, toggleable, never in the export ([renderer.md](../architecture/renderer.md)) | Keep covered by visual review so export frames do not regress into debug UI |
| Original hardcoded scene colors | Fixed: background, stars, terrain, strata, surface, speed lines, runner, trail, glyphs, event ripples, and section transitions now derive from `performance.palette` / role colors | Colors come from `performance.palette` (solver: key/mode → palette, role → color) with tuning overrides | Remaining active task is multi-song visual verification |
| Original runner-relative projection | Fixed: scene samples compiled camera keyframes and applies deterministic land/pulse zoom impulses | R1 spec: compiled `camY` (critically damped) + camera keyframes; R3: kick zoom impulses | Needs golden-frame/scrub verification on a richer reference song |
| Original sine strata | Fixed first pass: compiler emits track-derived stratum edge heightfields and the scene renders those directly | Strata edges = **per-stem waveform summaries** — "the world is a stratigraphy of the mix" ([waveform-runner-implementation.md §1.2](waveform-runner-implementation.md)) | Needs richer stem-export visual acceptance, but no longer relies on fake sine geology |
| Original free-running gait | Fixed first pass: compiler emits `runner.step` events from kick/percussion timing or beat-grid fallback; scene gait phase samples those events | Footfalls locked to kicks (or bar phase) — R2 spec | Needs visual acceptance on a drum-bearing reference song |
| Original missing vocal halo | Fixed plumbing: compiler emits `curves.vocalHalo` from vocal-like track RMS or a zero fallback, and the scene samples it for an additive runner aura | Vocals brighten the runner halo from the vocal RMS curve | Needs visual acceptance on a vocal-bearing reference song |
| Original glyph merge offset | Fixed at compiler contract level: glyphs store exact trajectory merge positions; the scene applies only a character-core visual offset | Merge at `pose(mergeT)` exactly; visual centering belongs in character metrics, not compile math | Keep exact merge-position tests and visual centering separate |
| Original static trail offsets | Fixed first pass: trail samples historical trajectory poses and curves through jumps | Trail = `pose(t − k·dt)` sampled history — curves through jumps, scrub-exact | Still needs glow/additive treatment |
| whole file | Zero additive blending, zero glow/bloom | Concept: "luminous terrain edges… comet trail… white-hot runner" — additive glow is the look | Flat vector fills read as placeholder; Pixi `blendMode:'add'` + a bloom filter are the missing 80% of the look |
| 185–197 | Multi-limb stick figure with sine-swung limbs | Concept doc recommended an abstract spark/comet for MVP precisely to avoid uncanny cheap limbs | The limbs amplify the debug feel; commit to spark (cheap, on-brand) or invest in a real cycle (expensive) |

### 3.2 Metro (`scenes/metro/src/index.ts`, 216 LOC)

| Line(s) | Observed | Documented design | Impact |
|---|---|---|---|
| 62–72 | `"SOUND WORLDS / METRO"` + `"M3 CARTOGRAPHY / FRONTIER CAMERA"` headers in-scene | Dev-harness overlay only | Debug build look |
| 114–118 | Dark rounded **panel** + dotted engineering grid background | Transit design language: clean cream (day) / ink-navy (night) field; faint grid *at most* ([metro-map.md](../metro-map.md)) | Reads as a dashboard widget, not a Beck map — this one change is most of the visual gap |
| 102 | `targetY = camera.zoom > 1.1 ? 1240 : 960` | Camera framing fully compiled; scene interprets keyframes only | Fixed 2026-07-04: Metro camera keyframes now carry normalized viewport anchors |
| 150–151 | `90 + station.span[i] * 75` lane math re-derived in the scene | Lane geometry belongs to compiled statics; the scene must not know `laneGap` | Fixed 2026-07-04: cluster `spanPos` world coordinates are emitted by the compiler |
| 11–28, 33–44 | `pointAt`/`partialPolyline` recompute per-edge lengths **every frame** with array allocs | Precomputed arc-length tables at init ([renderer.md perf budget](../architecture/renderer.md)) | Fine at 11 s / few edges; blows the <8 ms frame budget on a real song |
| 87, 200 | Label typography default-ish; tier-1 visible at zoom ≥ 1.3 | Transit-style type discipline; tiers at 1.4 / 2.2 | Minor, but typography is most of "authentic map" feel |
| whole file | No rounded bend radii treatment, no night variant, no glow for blooms | M5 scope — expected gap, listed for completeness | — |

### 3.3 What's actually *good* (keep it)

Both scenes are genuinely **stateless in `t`** (scrub-safe), consume compiled
statics/events rather than song data, use reveal/arrival timing correctly
(`easeArrive` cubic with sprint fallback matches spec), and the Metro
casing-plus-color line rendering and interchange ring sizing follow the plan.
The architecture held; the *presentation layer* and *inputs* are what
diverged. This is very recoverable.

## 4. Layer 3 — Unbuilt phases are most of the remaining "wow" gap

- **Runner:** R3 still needs authored-song acceptance for gate/palette/vocal/
  float visuals and R4 is entirely absent — and R4 *is*
  the identity (erasure front, crumbs, real strata, trail). The concept doc's
  hero moments live there.
- **Metro:** M3 incomplete (no districts, label-overlap pass unfinished,
  corridor joint healing pending) and M4–M5 absent (rings — the topology
  signature; night mode; poster/SVG polish).

Expectation-setting: with today's phases complete-as-documented, the output
would be a *clean, correct* preview — not yet the concept art.
[Visual Recovery Plan](visual-recovery-plan.md) reorders remaining work so
look-defining items land first.

## 5. Documentation integrity findings

`docs/implementation-status.md` should keep two dimensions visible:

1. The canonical current reference export is
   `projects/untitled-project-6d2e04f7`; older export IDs should only appear as
   historical evidence.
2. The milestone matrix should record *functional* completion and
   **visual quality** separately (`engineering-preview`, `styled`,
   `concept-parity`). "R2 implemented" should never be read as "R2 looks like
   the concept doc."
3. The analyzer prerequisites should mention the package validator and any
   tool dependencies needed by the runbook.
4. Golden look frames should join sync/unit tests so visual regressions are
   detectable, not merely eyeballed.

## 6. Recommended reading order

1. This doc (the *why*).
2. [Song Authoring Guide](song-authoring-guide.md) — fix the input first;
   zero code, biggest single improvement.
3. [Visual Recovery Plan](visual-recovery-plan.md) — prioritized spec
   deltas for the code owners, with acceptance criteria per item.
