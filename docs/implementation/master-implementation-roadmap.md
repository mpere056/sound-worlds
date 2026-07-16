# Master Implementation Roadmap — current state → fully shipped Runner & Metro

**Date:** 2026-07-04. This is the single document to follow from today's code
to "fully, properly implemented" Waveform Runner and Metro Map. It absorbs and
sequences: [Math Audit](math-audit.md) fixes,
[Visual Recovery Plan](visual-recovery-plan.md),
[Song Authoring Guide](song-authoring-guide.md), and the original phase
work orders in this directory — which remain the detailed specs; this
roadmap tells you **what order, what's already done, what changed, and what
"done" means** at every step.

**Where you are today** (per this repo and
[`docs/implementation-status.md`](../implementation-status.md)):
Runner R1–R2 built, R3 partial (glyphs, base scene palette, camera/trail
recovery, gates, palette shifts, strata, gait, vocal halo plumbing,
conservative downlifter float spans); Metro
M1–M2 built, M3 partial (labels/camera/corridors, no
districts/joint-healing/label-pass); analyzer MVP built with the math findings
in the audit; preview shell renders short clips only; R4–R5, M4–M5, full
export: not started.

The current local reference export is
`projects/untitled-project-6d2e04f7`. It is useful for fallback validation, but
it is intentionally not a visual-quality benchmark because it has no drums,
bass, lead/vocal MIDI, or section regions.

Strategic pivot as of 2026-07-07: before continuing broad all-track
visualizers on sparse exports, build track-count-specific generators. The first
new target is [Marble Music](../marble-music.md): a one-track Three.js marble
machine where each note is a compiled physical impact. Use the
[Track-count generator strategy](track-count-generator-strategy.md), the
[Marble Music deep design review](marble-music-deep-design-review.md), the
[Marble Music implementation plan](marble-music-implementation.md), and the
[`untitled-project-6d2e04f7` visual brief](project-brief-untitled-project-6d2e04f7.md)
as the current implementation front door. Use the
[Marble Music acceptance checklist](marble-music-acceptance-checklist.md)
before promoting the concept beyond one track. The next one-track step is the
[Marble Music 3D physics-feel implementation](marble-music-3d-physics-implementation.md):
real 3D machine geometry, distance-based spin, contact response, and camera-ready
depth while preserving exact compiled note arrivals. After the one-track
generator feels satisfying, extend to a two-track marble duet, then larger
arrangements.

The linked motion controls now have a dedicated
[Marble live-control performance plan](marble-live-control-performance.md).
Execute its instrumentation, worker planner, compiler optimization, persistent
scene, and safe morphing phases before adding MediaPipe hand input. C++/Rust
WebAssembly remains a measured decision gate rather than a prerequisite.

A separate [Realtime Marble Music future plan](realtime-marble-music.md) is now
recorded for a later live-performance mode. It uses a continuously falling
marble, a dedicated low-latency REAPER MIDI telemetry path, and note-spawned
physics platforms whose angle and restitution respond to pitch and velocity.
It starts only after offline one-track Marble Music passes its human gate.

The [Music-Synced Brick Breaker plan](brick-breaker-implementation.md) and
[implementation work orders](brick-breaker-work-orders.md) compile the minimum
song-specific brick set and a legal brick/wall/paddle collision itinerary so
each grouped note destroys one brick and the final brick breaks exactly on the
final note. Headless B0-B5 compiler work may proceed alongside Marble Music;
scene polish begins only after its deterministic solver gates pass.

The physics-first concepts are coordinated by the
[Physics-first visual worlds roadmap](shader-worlds-roadmap.md). Aurora
Cyclotron and Phaseglass now have engineering-preview implementations, while
Pendulum Cathedral and Singularity Slalom have strengthened plans for distinct
physical and rendering foundations. Vortex Loom is shelved after repeated human
review rejected its shuttle-and-weave visual identity despite certified physics;
its code remains only as engineering evidence. The next unbuilt foundation
should be Pendulum Cathedral C0-C2: prove the object-first nonlinear mechanism
in neutral materials before cathedral art direction or shader effects.
Singularity Slalom remains last because its patched-conic route and
lensing stack carry the highest combined risk. Existing previews are not
visually complete merely because they run: the shared
[Sound Worlds visual-quality and acceptance standard](shader-worlds-visual-quality-standard.md)
governs architecture declaration, perceptual evidence, art direction, motion,
performance, and full-song review through Q5.

A separate [Spectral Bloom concept](spectral-bloom-concept.md) and detailed
[implementation plan](spectral-bloom-implementation.md) now have a corrected
SB0-SB5 engineering preview. The discarded damped-force model has been replaced
by a direct 3D oscilloscope/spectral surface: every frame carries signed master
waveform samples and signed spectral bands, and the GPU maps those measurements
straight onto one stable 31,000-particle body. Silence exactly restores the
baseline geometry with no deformation memory. Continue with compact
high-resolution analysis, stereo/spatial channels, stronger waveform
parameterization, material refinement, adaptive tiers, and Q5.

A future [Music-synchronized ecosystem worlds roadmap](ecosystem-worlds-roadmap.md)
defines Pulse District, Tidal Reef, Mycelial Canopy, Emberdeep Dungeon, and Halo
Habitat. Each plan now declares its world invariant, rendering architecture,
first vertical slice, acceptance gates, principal risk, and ecological
timescales. One musical channel choreographs only valid actions; a separate
spectacle channel may deliberately bend or break world logic through typed
render overrides, reversible geometry, or authored state transitions with an
explicit restoration path. When this work begins, build the small Pulse
District headless loop first and extract shared architecture only after a second
world proves it.

Metro-specific consequence: that export can validate MIDI station timing,
train arrivals, line identity, and fallback honesty, but it cannot validate
M4 chorus rings/laps. M4 must be judged on a region-bearing reference song with
repeated same-name chorus sections.

```
S0  Repo & math hygiene            S6  Metro M3 completion
S1  Reference song + re-baseline   S7  Metro M4 — rings & laps
S2  Analyzer corrections           S8  Runner R5 — set pieces & end card
S3  Runner visual foundation       S9  Metro M5 — polish & artifacts
S4  Runner R3 completion           S10 Full-song export pipeline
S5  Runner R4 — the identity       S11 Ship gate
```

Dependency rule: S0–S2 first (everything downstream is judged against them);
after S3, Runner (S4–S5, S8) and Metro (S6–S7, S9) are independent tracks you
can interleave; S10 needs one finished game; S11 needs everything.

---

## S0 — Repo & math hygiene *(½–1 day)*

1. **One canonical repo.** The Windows working copy is canonical. Keep this
   planning/audit set under `docs/implementation/`, and avoid committing
   scratch transfer snapshots or generated project media. Confirm analyzer
   prerequisites include the package validator used by the CLI.
2. **Wire the §3 math battery** from [Math Audit](math-audit.md) as unit
   tests against the real compilers. Implemented-system coverage now includes
   gravity, jump solves, x(t), terrain calibration/slope, Metro geometry,
   dwell, and determinism. Future-only vectors such as double jump, rectangular
   clearance rejection, and camera impulse/follow behavior should be added when
   those systems exist in code. *Any failure is a bug to fix before proceeding
   — this answers "is the math right" definitively.*
3. **Fix the audited analyzer/logic defects** ([Math Audit](math-audit.md) §2):
   onset timing (2.1), bar restarts at pure tempo points (2.2), per-stem gain
   metadata (2.3), train dwell ≤ ½·gap (2.4), and section gap filling (2.6)
   are fixed as of 2026-07-04.
4. Status-doc honesty: add the **Visual quality** column
   (`engineering-preview | styled | concept-parity`) and correct stale claims
   (gap analysis §5).

**Done when:** implemented-system numeric vectors are in automated tests;
future-only vectors are tracked; status doc updated.

## S1 — Reference song + re-baseline *(½ day of Reaper work)*

Author the song per [Song Authoring Guide §3](song-authoring-guide.md)
(~2:30, Kick/Snare/Hats/Bass-MIDI/Lead-MIDI/Keys/FX, regions with 3× Chorus).
Export → analyze → compile both games → render previews. Archive these as the
"before" baselines. **All visual judgments from here on use this project.**

**Done when:** authoring checklist §4 passes; both games render it end-to-end.

## S2 — Analyzer completion *(1–2 days)*

Beyond the S0 fixes, complete what these two games actually consume (defer
chords/HTML-report/auto-segmentation — they serve other concepts):

1. **Key estimate** (chroma → Krumhansl) — feeds the palette solver. MIDI-only
   shortcut acceptable: histogram of pitch classes weighted by duration.
2. **Pitch tracking for audio-only leads** — *optional if you commit to
   MIDI-first authoring (recommended)*. If skipped, document that audio-only
   melodic tracks degrade to activity mode, permanently.
3. Per-onset spectra: already implemented ✅ — just keep it exposed per drum stem.

**Done when:** `song.json` for the reference song contains key + all curves;
schema updated & versioned.

## S3 — Runner visual foundation *(2–4 days — biggest perceived-quality jump)*

Execute the remaining [Visual Recovery Plan](visual-recovery-plan.md)
V1.1–V1.7 items in this order: **final V1.1 debug separation/golden-frame
sweep.** V1.3 camera, V1.2 base palette wiring, V1.4 real strata, V1.5
compiled gait, and the first V1.6 trajectory-sampled trail pass are already
implemented. V1.7's additive glow layer pass is implemented; the remaining
V1.7 decision is whether to keep investing in the humanoid runner or pivot the
character to the concept's abstract spark/comet.

Renderer-reality adaptations (the scenes are immediate-mode Pixi `Graphics`,
not the meshes/shaders the original plans assumed — that's fine, adapt, don't
rebuild):

- **Glow without shaders:** current implementation uses separate
  additive-blended Pixi `Graphics` layers under the terrain, glyphs, and
  runner cores. Keep future polish in that cheap layer model unless profiling
  proves sprite glow textures are needed.
- **Real strata:** compiler now emits one edge heightfield per selected track
  stratum (edge = `surface − depth_k − amp_k·trackRms_k(x)` per
  [impl plan §1.2](waveform-runner-implementation.md)), and the scene samples
  those edges directly. The remaining work is richer stem-export visual
  acceptance, not the compiler/scene plumbing.
- **Camera/palette/trail:** the scene now consumes compiled camera keyframes,
  derives base colors from `performance.palette`, and renders a
  trajectory-sampled trail. Keep future changes inside that model.

**Done when:** V-plan acceptance criteria per item; the "demo checkpoint"
(V-plan bottom) side-by-side against the S1 baseline is night-and-day.

## S4 — Runner R3 completion *(2–3 days)*

Spec: [R3 work order](waveform-runner/R3-music.md) —
still accurate. Remaining item: **authored-song visual acceptance for
gates/palette shifts/vocal halo/float spans/kick zoom.**
Adaptation: gates are now compiler-owned statics plus scene `Graphics` arches
and `Text` labels; palette shifts are compiler-owned events that the scene
samples into its palette-derived color pipeline; vocal halo is a compiler-owned
curve sampled by the scene with a silent fallback when no vocal role exists;
float spans are conservative compiler-owned trajectory segments from sustained
downlifter-like events.

**Done when:** R3 acceptance checklist passes on the reference song — gates
open on region downbeats, palettes differ per section kind, floats keep the
continuity property green, and all of it reads clearly on the reference song.

## S5 — Runner R4 — the identity *(3–4 days)*

Spec: [R4 work order](waveform-runner/R4-identity.md).
Immediate-mode adaptations (simpler than the original shader plan):

- **Erasure front:** compiler emits `xE(t)` as a shifted copy of the x-curve
  (freeze at outro). Scene: when building the per-frame surface/strata point
  arrays, drop points with `x < xE(t)` and insert the glow-band points near
  the cut — no shaders needed in immediate mode.
- **Crumbs:** compiler precomputes per-cell `tCross[]`; scene draws particles
  as pure `f(age)` circles for cells with `age ∈ [0, 1.5 s]` (binary-search
  the active window). Budget 120 concurrent bursts, deterministic stride-skip.
- **Ghost windows:** compile now (trivial), render in S8.
- Keep the scrub-exactness frame-hash test as the phase gate — it's what
  keeps all of this honest.

**Done when:** R4 acceptance checklist passes; erasure lag exactly 2 beats at
any tempo (tempo-change fixture); premise reads in the first 10 s
(human check).

## S6 — Metro M3 completion *(2–3 days)*

First execute V2.1–V2.6 (field-not-panel, compiled framing, geometry
single-source, typography, arc-length precompute) — then finish
[M3](metro-map/M3-cartography.md) remainders:
**corridor joint healing** (45° micro-jogs at membership changes),
**district tint bands** (key changes), **the tier-0 label-overlap pass**
(spatial-hash AABB; the current "clamp x to margins" is not overlap
avoidance).

Add the 2026-07-05 Metro correction: S6 must also prove
**sync-readability** and **line identity**. The current keys-only export is a
valid fixture for "four similar MIDI lines must still be distinguishable" and
"train/station payoffs must visibly answer audible notes." Use a dev-only
audit overlay or equivalent report to expose current/next hit, source track,
line, pitch/station, source type, and `hitT`.

**Done when:** M3 acceptance checklist + V2 criteria pass on the active MIDI
fixture; zero overlapping tier-0 labels; a paused final frame passes the
"plausible next to a real transit diagram" test; and a 30–60 s audio
watch-through lets the reviewer point to which line/station responds to
prominent MIDI notes.

## S7 — Metro M4 — rings & laps *(3–4 days)*

Spec: [M4 work order](metro-map/M4-topology.md) — fully
valid, but data-gated. Do not judge or prioritize S7 against
`untitled-project-6d2e04f7`; it has no regions and should produce zero rings.
Start S7 once a project has repeated same-name regions (for example
`Chorus`, `Chorus`, `Chorus`) and M2/M3 sync-readability is already green.
Adaptation notes:

- Emit ring geometry as **dense polylines** (rounded-rect sampled at ~4 px) —
  the scene already draws arbitrary polylines and needs zero new primitives.
- Portal edges are ordinary edges → corridors/reveal/trains work unchanged.
- The reference song's 3× chorus is the acceptance fixture: **one ring, three
  laps, zero new geometry on repeats** (statics-diff test).
- Audit M3 code for "later time = lower y" assumptions first (M4 doc's
  warning) — the frontier camera is the likely offender; phase-2 camera
  keyframes legitimately move up-map.

**Done when:** M4 acceptance checklist passes; chorus 2 visibly reads as
"everyone rides downtown again"; a missing-region fixture logs why rings were
skipped instead of silently looking unfinished.

## S8 — Runner R5 — set pieces & ship *(3–4 days)*

Spec: [R5 work order](waveform-runner/R5-ship.md) — valid.
Sequence within: **rail grind → ghost déjà-vu (one-day item now that R4
compiled windows exist) → cadence gate → route-silhouette end card**
(gravity-flip stays config-gated off). Watch the drop-starts-on-downbeat
entry-jump fixture called out in the work order.

**Done when:** R5 checklist passes; full-song watch-through with audio feels
locked; end card exports as PNG.

## S9 — Metro M5 — polish & artifacts *(2–3 days)*

Spec: [M5 work order](metro-map/M5-ship.md) — valid, minus
the ribbon-shader item (immediate-mode is fine **if** the arc-length
precompute from V2.6 landed; keep the <8 ms/frame budget test as the gate,
optimize only if it fails). Annealing polish (bend flips + label sides),
night mode (palette-only switch), **poster PNG + true SVG export**
(serialize statics — this stays trivially valid since geometry is vector
data).

**Done when:** M5 checklist passes; SVG round-trips; poster renders at 4×.

## S10 — Full-song export pipeline *(2–3 days)*

Spec: [export.md](../architecture/export.md). Current state renders only
short previews; complete:

1. Full-length frame-stepped render (frame-indexed loop, backpressure,
   `contentDurationSec` + end-card hold as the duration — **never**
   `audioDurationSec`, the 2 s tail is reverb, not video).
2. Write into `projects/<song>/out/` directly.
3. `mux.sh`: ffmpeg `-c:v copy` + master WAV → AAC, duration sanity warning,
   optional loudnorm variant.
4. Determinism `--hash` double-render check; render-faster-than-realtime
   budget on the reference song.

**Done when:** one command chain per game: project → `final.mp4` (1080×1920@60,
audio attached) + artifact PNG/SVG, zero manual steps.

## S11 — Ship gate *(1 day)*

The final checklist — **"fully properly implemented" means every box below:**

- [ ] Math Audit §3 battery green in CI; §2 fixes verified by their acceptance
      tests (incl. ±5 ms onsets)
- [ ] All phase acceptance checklists green: R1–R5, M1–M5 (each work-order
      doc's checkbox list)
- [ ] Sync invariant test green across both games (every `hitT` payoff ≤ 1
      frame)
- [ ] Scrub-exactness frame-hash tests green (both scenes, incl. R4 effects)
- [ ] Determinism: byte-identical recompiles; identical frame hashes on
      re-render
- [ ] Perf: < 8 ms/frame on the reference song; export faster than realtime
- [ ] Golden frames committed: Runner {takeoff, apex, landing, erasure,
      grind, ghost, end card}, Metro {mid-draw, ring lap, final reveal,
      poster}; SSIM ≥ 0.995 in CI
- [ ] Reference song full watch-throughs (both games, with audio): no visual
      glitch, sync feels locked, premises read — the human gate
- [ ] One **second** real song (different tempo/key/structure) renders both
      games without code changes — the generality gate
- [ ] Status doc: every phase row `concept-parity` in the visual column; docs
      match as-built behavior ("docs-lie" pass)

---

## Effort summary

| Track | Stages | Rough total |
|---|---|---|
| Foundation | S0–S2 | 3–4 days |
| Runner to done | S3–S5, S8 | 10–15 days |
| Metro to done | S6–S7, S9 | 7–10 days |
| Export + ship | S10–S11 | 3–4 days |

Interleaving suggestion when a proper reference song exists:
S0→S1→S2→S3→**demo**→S6→**demo**→S5→S7→S4→S8→S9→S10→S11.
If only the current keys-only export is available, keep S7 paused and use the
Metro time on S6 sync-readability/line-identity instead.

## Standing rules while executing (the guardrails that kept this design honest)

1. **Never judge visuals on a project that fails the authoring checklist.**
2. **Every payoff event carries `hitT`** — new features included; the sync
   test covers them for free.
3. **Scenes stay pure in `t`** — the frame-hash scrub test is the tripwire;
   run it after every scene change.
4. **Smart compiler, dumb renderer** — if a scene starts computing music or
   layout (lane math, framing branches), stop and move it to the compiler.
5. **All color through the palette; all randomness through the seeded RNG;
   all time through the frame clock.** Grep-able bans (`Math.random`,
   `Date.now`, hex literals in scenes) are cheaper than review vigilance.
