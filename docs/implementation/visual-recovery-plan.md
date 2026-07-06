# Visual Recovery Plan — from "engineering preview" to the concept docs

Companion to [Quality Gap Analysis](quality-gap-analysis.md). This is the
prioritized remediation program. **No code was changed in producing it** —
every item is a spec delta with acceptance criteria, written for whoever (or
whatever agent) implements next. Work is ordered by *visual leverage per
effort*, not by the original phase numbering.

```
V0  Author the reference song          (no code — do this first, today)
V1  Runner look-critical corrections   (small code, transforms the read)
V2  Metro look-critical corrections    (small code, transforms the read)
V3  Identity pull-forward              (reordered R4/M4 scope)
V4  Verification & docs honesty
```

---

## V0 — Reference song (prerequisite for judging anything)

Do [Song Authoring Guide](song-authoring-guide.md) §3 in Reaper. Re-export,
re-analyze, re-compile both games.

**Acceptance:** the §4 checklist passes; both games re-render on the new
project. *Only after this* re-assess which V1/V2 items still matter — several
"it looks wrong" symptoms will disappear with real data.

---

## V1 — Runner look-critical corrections

All in `scenes/runner` + small compiler additions where noted. Line numbers
refer to the current `scenes/runner/src/index.ts`.

### V1.1 Ship/debug separation
Remove the in-scene title (L30–39) and status line (L211) from the artwork
path; move them to the dev-harness overlay behind the existing overlay toggle.
**Accept:** an exported frame contains zero UI text; dev mode can still show it.

**Progress 2026-07-04:** the Runner scene no longer draws its own in-canvas
title/status text. The app shell still exposes the world label and compile
status outside the artwork frame.

### V1.2 Palette wiring
Replace every hardcoded hex (L14 `GLYPH_COLORS`, background bands L96–103,
terrain strokes L127–138, runner body L182–197, ripples) with
`performance.palette` lookups (`palette.bg`, `palette.roles.*`,
`palette.accent`), with `tuning` overrides. Glyph color = its source role's
color, varied by pitch class *within* that hue family — not a 12-color wheel.
**Accept:** two different songs (different keys) render visibly different,
internally harmonious palettes without touching the scene.

**Progress 2026-07-04:** glyph compiler output now carries the source role,
and Runner glyph beams/ripples use that role's `performance.palette.roles`
color with a small pitch-class tint. The scene also now derives its background
gradient, star field, parallax terrain, strata fills, surface strokes, speed
lines, runner glow/body/trail, and jump/ground ripples from `palette.bg` and
`palette.roles.*`. Section-to-section palette transitions are now compiler
events sampled by the scene; remaining palette work is visual verification on
at least two intentionally different reference songs.

### V1.3 Camera adoption (the biggest single read-improvement)
Stop projecting relative to the runner's own terrain height (L46–48). Consume
the compiled camera: `camY` damped curve + keyframes per
[R1 spec](waveform-runner/R1-world.md); add the R3 kick
zoom impulse term. Runner screen anchor stays, world moves under it smoothly.
**Accept:** flat-ground footage shows a *steady* horizon; terrain steps no
longer yank the frame; kicks produce a subtle punch-in; scrubbing anywhere
matches play-through.

**Progress 2026-07-04:** Runner scene projection now samples compiled camera
keyframes for vertical framing and zoom while keeping the runner anchored, plus
a small deterministic land/pulse zoom impulse. This still needs golden-frame
and scrub-through verification against a richer reference song.

### V1.4 Real strata (kill the fake sine)
Replace `Math.sin` ripple strata (L121–131) with the compiled per-stem
waveform stratum edges already specified in statics
([impl plan §1.2](waveform-runner-implementation.md)). If
the compiler doesn't emit them yet, that's the compiler half of this item.
**Accept:** muting a stem in Reaper and re-exporting visibly changes exactly
one stratum; no trig-generated geology remains.

**Progress 2026-07-04:** the Runner compiler now emits up to five
track-derived stratum edge heightfields in `statics.strata`, sampled from track
RMS over world x. The scene renders those edges directly; the old
`Math.sin(...)` geology is gone. Compiler tests cover edge length/depth and
the "one changed track changes one stratum" contract. Browser/golden-frame
acceptance on a richer stem export remains.

### V1.5 Beat-locked gait
Replace the free-running sine gait (L175–177) with phase from the beat grid
(`barPhase`/kick events) so foot-plants coincide with kicks — or adopt V1.7's
spark and delete limbs entirely.
**Accept:** at any tempo, leg plants land on kicks (sync overlay check).

**Progress 2026-07-04:** the Runner compiler now emits deterministic
`runner.step` events, preferring compacted kick/percussion timings and falling
back to the beat grid when percussion is absent. The scene derives gait phase
from those event times instead of `t * speed`. This still needs visual sync
acceptance on a drum-bearing reference song.

### V1.6 True trail
Replace static offset strokes (L198–202) with sampled trajectory history
(`pose(t − k·dt)`, k = 0..24) per the spec — curves through jump arcs,
scrub-exact.
**Accept:** during a jump the trail is a visible parabola behind the runner.

**Progress 2026-07-04:** scene code now samples the compiled trajectory history
for 24 trail points and renders an arc-shaped trail behind the runner. This
still needs browser/golden-frame verification before the item should be marked
accepted.

### V1.7 Glow pass + character decision
Introduce additive blending (`blendMode:'add'`) for runner core/halo, terrain
edge stroke, glyphs, ripples; add a cheap bloom (Pixi filter or pre-blurred
sprite glows). Decide the character: **recommendation — abstract spark/comet**
(per the original concept doc) which the glow pass makes premium for free;
the stick figure requires real animation investment to stop reading as cheap.
Also: replace the `mergeY − 96` magic offset (L153) with a character-metrics
constant, and derive "speed lines" (L140–146) opacity from the palette.
**Accept:** a paused frame reads as luminous/neon rather than flat vector;
no pixel-magic offsets remain.

**Progress 2026-07-04:** Runner now has separate additive Pixi `Graphics`
layers for terrain/speed-line glow, glyph beam/ripple glow, and runner
halo/trail/event glow. The app exposes a `Glow` tuning control so the look can
be judged without recompiling. The current character is still the humanoid
runner; the spark/comet vs. invested animation decision remains open, and the
glow pass still needs browser/golden-frame acceptance.

---

## V2 — Metro look-critical corrections

Line numbers refer to `scenes/metro/src/index.ts`.

### V2.1 Ship/debug separation
Same as V1.1 for the two in-scene headers (L62–72).

**Progress 2026-07-04:** the Metro scene no longer draws its own in-canvas
debug header; app-shell labels remain outside the artwork frame.

### V2.2 Field, not panel
Remove the rounded panel + engineering dot-grid background (L114–118).
Adopt the documented map field: warm cream (day) with *very* faint grid, or
ink-navy night variant. Palette from `performance.palette`, not hex.
**Accept:** a final-frame screenshot is plausible next to a real transit
diagram; no dashboard chrome.

**Progress 2026-07-04:** removed the rounded panel and switched to a full-frame
ink-navy field with faint map-grid lines. Palette harmony and final transit
diagram styling still need a richer reference-song pass.

### V2.3 Camera framing belongs to the compiler
Delete the `zoom > 1.1 ? 1240 : 960` framing branch (L102). The compiled
camera keyframes must carry framing (add a framing/anchor field to camera
statics if needed — compiler-side change).
**Accept:** zoom animates through 1.1 with zero frame jump.

**Progress 2026-07-04:** `performance.camera` now supports optional normalized
viewport anchors, Metro emits frontier/final anchors from the compiler, and
the scene uses those anchors instead of a zoom-threshold framing branch.

### V2.4 Geometry single-source
Remove the scene's re-derived lane math (`90 + span·75`, L150–151); cluster
spans must arrive as world coordinates in statics.
**Accept:** grep of the scene finds no lane constants.

**Progress 2026-07-04:** Metro cluster stations now carry `spanPos` world
coordinates from the compiler, and the scene renders cluster bars from those
points instead of re-deriving lane geometry.

### V2.5 Typography & label pass (finish M3 as specced)
Transit-style type discipline (single family, defined sizes per tier, casing
rules), correct tier thresholds (1.4/2.2), and the tier-0 overlap pass from
[M3](metro-map/M3-cartography.md). District tint bands.
**Accept:** zero overlapping tier-0 labels on the reference song; the map
reads "designed," not "labeled."

**Progress 2026-07-05:** Metro performance version 6 now emits section
district bands from `song.sections[]`, and the Metro scene renders them as
subtle world-space bands behind the lines. This is a first pass: the current
`untitled-project-6d2e04f7` export only has one default whole-song section, so
authored regions are still required before district contrast can be visually
judged.

### V2.6 Per-frame arc-length precompute
Move `pointAt`/`partialPolyline` length computation (L11–44) to init-time
arc-length tables (perf budget: <8 ms/frame on the reference song).
**Accept:** frame-time measurement on the reference song meets budget.

**Progress 2026-07-04:** the Metro scene now builds per-edge cumulative
arc-length tables at construction time and reuses cached line/station/edge
maps while rendering. This removes the old per-frame segment-length
recalculation for edge reveal and train interpolation; frame-time measurement
on a richer reference song is still needed for final acceptance.

### V2.7 Metro sync-readability and line identity
The scene can be mathematically synced and still fail if the cue is too subtle.
Before adding rings, make note payoffs unmistakable: train brake/glow, station
bloom, optional line pulse, and label flash. Add or use a dev-only audit view
that shows current/next hit time, source track, line, pitch/station, source
type, and `hitT`.

**Accept:** on the current MIDI export, a reviewer watching with audio can
identify which visible line/station responds to prominent piano notes. Four
similar keys tracks must remain distinguishable by color, legend identity,
route offset, and train/arrival cue.

**Progress 2026-07-05:** Metro performance version 5 now emits `lineAudits`
and `syncHits`; the preview app exposes a dev-only Metro audit overlay with
current/next hit, source line, pitch/station label, source type, and `hitT`.
The scene also adds a `Cues` tuning control plus stronger station blooms,
arrival brake/glow rings, label flash, and train identity pips. Browser
verification on `untitled-project-6d2e04f7` showed 4 MIDI lines, 40 stations,
48 note payoffs, 0 audio fallback, visible audit text, and no browser warnings
or errors. A human audio watch-through is still needed before marking the
perceptual acceptance gate complete.

---

## V3 — Identity pull-forward (reordered phases)

The original order finishes breadth (R3 extras, M3 polish) before identity
(R4, M4). Given the "doesn't look like the docs" gap, **invert**:

1. **Runner: R4 erasure front + crumbs** next after V1 — it's the concept's
   signature and it's mostly scene work
   ([R4 work order](waveform-runner/R4-identity.md)).
2. **Metro: M4 chorus rings** next after V2 — but only on a region-bearing
   reference song. Rings are the topology signature and the intended reference
   song (3× chorus) is built to show them
   ([M4 work order](metro-map/M4-topology.md)).
3. Then return for R3 authored-song acceptance (gate/palette/vocal/float) and
   M3 leftovers (joint healing) — they land better on top of the identity.

Rationale: every demo until identity ships will keep producing the "this
doesn't look right" reaction regardless of correctness underneath.

Data gate: if the active export is still `untitled-project-6d2e04f7`, do not
use it to judge V3 Metro. It has no repeated regions, so the correct M4 result
is "no rings." Keep Metro effort on V2.7/M3 readability until a repeated-region
project exists.

## V4 — Verification & documentation honesty

1. **Add a "Visual quality" dimension to `docs/implementation-status.md`** —
   per phase: `engineering-preview | styled | concept-parity`, judged against
   the concept docs' imagery, on the reference song. Functional "Implemented"
   must never imply visual done-ness again.
2. Keep the status doc pointed at the canonical reference export
   (`projects/untitled-project-6d2e04f7`) and keep historical evidence clearly
   labeled as historical.
3. Add two **golden look frames** per game (paused hero moments on the
   reference song) to the verification checklist — sync tests catch timing
   regressions; nothing currently catches *look* regressions.
4. Re-audit the solver math against
   [the implementation plans](./) in this repo and record the result in the
   status doc.

---

## Suggested execution order (one line)

**V0 → V2.2 → demo checkpoint → V2.5/V2.7 →
V3 (R4, then M4 only if regions exist) → V4 → everything else.**

The demo checkpoint is deliberate: the remaining early items (real song,
Metro field polish, and visual acceptance of the Runner glow pass) build on
the already-finished Runner camera/base-palette/glow work, and should create a
visible before/after quality jump before deeper systems work resumes.
