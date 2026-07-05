# Math Audit — verified, broken, and to-be-verified

**Date:** 2026-07-04.
**Scope:** math surfaced by the analyzer, scenes, manifest, and the compiler
contracts in this canonical repo, plus a **numeric verification battery** that
should be wired into unit tests. Every expected value below is hand-computed.

---

## 1. Verified correct ✅

### 1.1 Tempo-ramp math (`analyzer/core.py` L206–231) — **correct, including the hard part**

REAPER linear tempo ramps: `bpm(τ) = b₀ + s·τ`. Quarter notes advance as
`qn(τ) = qn₀ + (b₀τ + ½sτ²)/60` — matches `_segment_qn_at_time` (L210). The
inverse in `qn_to_time` solves `(s/2)τ² + b₀τ − 60·Δqn = 0`:

```
τ = (−b₀ + √(b₀² + 120·s·Δqn)) / s        # code L228–229 ✓ (correct root)
```

Constant-tempo fallback `τ = 60·Δqn/b₀` ✓. Final-segment-without-endpoint
correctly degrades to constant tempo ✓. Discriminant clamped ✓.
**Spot-check to keep as a test:** b₀=120→140 ramp over 10 s (s=2 bpm/s):
qn at τ=10 s is (120·10 + ½·2·100)/60 = **21.667 qn**; inverting 21.667 qn must
return 10.000 s.

### 1.2 Grid generation (L234–264) — correct for the common case
Beats step `4/tsDen` qn; bars step `tsNum·beatQn`; final partial bar clamped to
content end ✓; beat dedupe at segment joins ✓. (One structural exception — §2.2.)

### 1.3 Onset spectra (L171–189) — matches spec
Window `[T−11.6 ms, T+34.8 ms]` (attack-centered), 8 log bands 30 Hz→Nyquist via
`geomspace(…, 9)` ✓, per-hit band-shape normalization is the right choice for
bolt/impact shaping ✓.

### 1.4 Curve sampling (L125–133) — correct lerp with correct edge clamps.

### 1.5 Waveform summary (L114–122) — per-chunk min/max at 20/s, per spec.

### 1.6 Scene easing/interpolation (metro L11–28, 186)
Arc-length point interpolation is correct; the cubic ease-in-out
(`4u³ / 1−(−2u+2)³/2`) has `s(0.5)=0.5`, `s(1)=1`, `s′(1)=0` — trains
decelerate into exact arrival ✓ (matches the arrive-easing spec).

### 1.7 Manifest bookkeeping
`contentDurationSec` (9.056) vs `audioDurationSec` (11.056, includes 2 s tail)
is a correct and important distinction. **Rule to enforce everywhere:** musical
time = `contentDurationSec`; the tail exists only so reverb isn't clipped.

---

## 2. Findings — needs fixing 🔴

### 2.1 Onset timing: biased early and quantized to 20 ms (HIGH — hurts sync directly) — fixed 2026-07-04
`audio_curves` frames are **forward-looking** (`start = index·hop`, length
2048 ≈ 46.4 ms @ 44.1 kHz), so a transient at time T begins raising the RMS
curve at `t ≈ T − 46 ms`. `detect_onsets` then places the onset at a
**novelty peak on the 20 ms curve grid**. Net effect: onsets systematically
**early by ~10–40 ms and quantized to 20 ms** — up to ±2.5 frames at 60 fps,
in a system whose whole promise is frame-perfect hits.

**Fix spec (analyzer only):**
1. Detect onsets on a dedicated fine grid: hop 512 samples (~11.6 ms) or less,
   frame 1024, **center-aligned** (`start = center − frame/2`).
2. Sub-hop refinement: parabolic interpolation of the novelty peak
   (`Δ = ½(n₋₁ − n₊₁)/(n₋₁ − 2n₀ + n₊₁)` in hops) → ~1–3 ms accuracy.
3. Keep the 20 ms grid for *curves* (they're for animation, not timing).
4. Acceptance: synthetic WAV with clicks at 1.000/2.000/3.000 s at 44.1 kHz →
   detected onsets within **±5 ms**; a 120 BPM click track → onsets within
   ±5 ms of the beat grid. (Alternative: adopt `librosa.onset.onset_detect`
   with `backtrack=True` as originally documented — then keep the same
   acceptance test.)

Implementation status: fixed in `analyzer/core.py` by detecting drum onsets in
the sample domain instead of on the 20 ms animation RMS curve. Regression
coverage lives in `tests/test_analyzer.py::test_click_onsets_are_sample_accurate`.

### 2.2 Bars restart at every tempo point (MEDIUM) — fixed 2026-07-04
`build_grid` resets the bar cursor to each tempo point's `qn` (L253). A tempo
change **mid-bar** (common with ramps) splits that bar into two short "bars"
and shifts every later bar index. Time-signature changes *should* restart
bars; pure tempo changes should not.
**Fix spec:** segment bars by **time-signature runs** only; within a run, step
bars continuously in qn across tempo points (beats already handle this
correctly since they re-derive time via `qn_to_time`).
**Acceptance:** 4/4 project, tempo point at bar 2.5 → bars remain
[0,4,8,…] qn boundaries; bar count unchanged vs. no tempo point.

Implementation status: fixed in `analyzer/core.py`; regression coverage lives
in `tests/test_analyzer.py::test_pure_tempo_change_does_not_restart_bars`.

### 2.3 Per-stem peak normalization erases inter-track dynamics (MEDIUM, by-design caveat that will bite) — fixed 2026-07-04
`_normalize` scales every stem's RMS to its own peak (L85–91). A whisper-quiet
shaker and the kick both peak at 1.0. Anything comparing activity *across*
tracks (Metro's audio-activity fallback, future casting logic, mix-aware
strata) is working with fiction.
**Fix spec:** keep normalized curves, but store per-stem `gain` metadata:
`peakRms`, `meanRms` (pre-normalization, linear), so consumers can reconstruct
absolute levels (`abs = values[i] · peakRms`). Backwards-compatible addition.

Implementation status: fixed in `analyzer/core.py`; `schemas/song.v1.schema.json`
and `packages/core/src/schema.ts` accept optional `track.gain`, and regression
coverage lives in `tests/test_analyzer.py::test_real_package_shape_is_generated_and_cached`.

### 2.4 Train dwell can exceed the gap (LOW severity, guaranteed eventual bug) — fixed 2026-07-04
Spec/dwell logic `clamp(0.25·gap, 80 ms, 600 ms)`: for note gaps **< 80 ms**
(fast runs), dwell 80 ms > gap → `departT` after the next `arriveT` → negative
travel (scene guards with `max(1e−6, …)` and will teleport).
**Fix spec:** `dwell = min(clamp(0.25·gap, 80 ms, 600 ms), 0.5·gap)`.
**Vector:** gap 60 ms → dwell 30 ms, travel 30 ms (sprint) — no negative time.

Implementation status: fixed in `compilers/metro/src/trains.ts`; regression
coverage lives in
`compilers/metro/src/metro.test.ts::caps train dwell to half the gap for fast runs`.

### 2.5 Scene-math divergences (already catalogued)
The original audit found fake sine strata, no camera in Runner, `mergeY−96`,
the Metro `zoom>1.1` framing branch, per-frame arc-length recompute, and
free-running gait. The current implementation has fixed the camera/framing,
arc-length, compiled gait, exact glyph merge contract, and first real-strata
pass; see [Quality Gap Analysis](quality-gap-analysis.md) §3 and
[Visual Recovery Plan](visual-recovery-plan.md) V1/V2 for current status.

### 2.6 Sections don't tile the song (LOW) — fixed 2026-07-04
With partial region coverage, gaps between sections are unrepresented (L281–
296). Consumers assuming tiling will mis-arc. **Fix spec:** fill gaps with
`kind:"unknown"` filler sections at analysis time.

Implementation status: fixed in `analyzer/core.py`; regression coverage lives
in `tests/test_analyzer.py::test_sections_fill_gaps_with_unknown_spans`.

---

## 3. Verification battery for the compiler math

The jump solver, `x(t)`, terrain, Metro layout/trains/camera live in
`compilers/*`. Below is the complete numeric battery — every value
hand-computed. Encode each as a unit test; any mismatch is a bug.
(Conventions: y up, g positive down, `y(τ) = y₀ + v_y0·τ − ½gτ²`.)

### 3.1 Gravity from tempo (`g = 8A/T_beat²`, A = 3.2 wu)

| BPM | T_beat | expected g |
|---|---|---|
| 120 | 0.5 s | **102.4 wu/s²** |
| 96 | 0.625 s | **65.536 wu/s²** |
| 150 | 0.4 s | **160.0 wu/s²** |

### 3.2 Single jump solve (`v_y0 = (y₁−y₀)/D + gD/2`), g = 102.4

| Case | y₀ | y₁ | D | expected v_y0 | checks |
|---|---|---|---|---|---|
| Flat 1-beat | 0 | 0 | 0.5 | **25.6** | apex at τ=0.25 s, height **3.2** (=A); y(0.5)=0 |
| Flat ½-beat | 0 | 0 | 0.25 | **12.8** | apex **0.8** (=A/4 — quadratic scaling) |
| Up-step | 0 | 2 | 0.5 | **29.6** | y(0.5)=2.000 exactly; apex τ=0.2891 s, height **4.278** |
| Down-step | 2 | 0 | 0.5 | **21.6** | y(0.5)=0.000 exactly |

Landing exactness is by construction — test it anyway to ±1e−9.

### 3.3 Double jump (mid-impulse), g = 102.4, Tk=0, M=0.25, L=0.5, y₀=y₁=0, y_M=2

```
v_yA = (2−0)/0.25 + 102.4·0.125 = 20.8     → y_A(0.25) = 2.000 ✓
v_yB = (0−2)/0.25 + 102.4·0.125 = 4.8      → y_B(0.25) = 0.000 ✓
```
Continuity at M: `y_A(M) = y_B(0) = 2` to 1e−9. Segment-boundary continuity is
the solver's proof obligation — assert on every compiled trajectory.

### 3.4 Clearance validator
Terrain: flat 0 with a rectangular crest h=3.0 over x∈[mid-flight window].
Flat 1-beat jump (apex 3.2, clearance min 0.4): `3.2 − 3.0 = 0.2 < 0.4` →
**must reject** and escalate (bigger D or double jump). Same crest at h=2.7 →
`0.5 ≥ 0.4` → accept. Endpoint exclusion windows: 40 ms.

### 3.5 Motion system `x(t)`
`v(t) = v₀(0.8 + 0.4·energy)`; worldLen = 60 wu/min.

| Case | expected |
|---|---|
| energy ≡ 0.5, duration 150 s | worldLen 150 wu → **v₀ = 1.0 wu/s**, x(75) = **75.0** |
| energy ≡ 1.0, same v₀ calibration run | v = 1.2·v₀ during that span |
| Property | x strictly increasing; `t(x(t)) = t` to 1e−6 over 1000 samples |

### 3.6 Terrain calibration & slope
Pitch percentiles p10=40, p90=64, band [0,14]: `e(52) = (52−40)/24·14 =`
**7.0 wu**; `e(40)=0`, `e(64)=14`, out-of-range pitches clamp. Slope clamp:
post-clamp `|dh/dx| ≤ tan 55° = 1.42815` everywhere (property test).

### 3.7 Metro geometry
- Lanes: `laneX(i) = 90 + 75i` → lane 0 = 90, lane 11 = 915.
- Octilinearity: every edge segment angle ∈ {0°, 45°, 90°} exactly (dx=0,
  dy=0, or |dx|=|dy| in px, post-offset included).
- Corridor offsets, gap 7, k=3 lines rank 0/1/2 → **−7, 0, +7** px
  perpendicular; k=2 → −3.5, +3.5.
- Interchange radius `18 + 3.5(k−1)`: k=2 → **21.5**, k=3 → **25** (scene
  L146 agrees — keep them agreeing via a shared constant, see V2.4).
- Trains: arrival times equal source note times **exactly** (not quantized
  bins); dwell per §2.4's fixed formula; sprint iff travel < 150 ms.

### 3.8 Camera
- Runner `camY`: critically damped follow — step-input response must be
  monotone (zero overshoot) and settle to within 1% in ≤ 1.5 s (tune ω, then
  freeze as a golden).
- Kick zoom: `1 + Σ 0.02·e^(−8(t−t_kick))` over recent kicks → single kick at
  t=0: zoom(0)=**1.02**, zoom(0.25)=1+0.02·e⁻² = **1.00271**.
- Metro: zoom animating through any value must not change framing targets
  discontinuously (kills the `zoom>1.1` branch — V2.3). Fixed 2026-07-04:
  Metro framing now comes from compiled `camera.anchor` keyframes instead of a
  scene-local zoom threshold.

### 3.9 Extractor spot-check (Lua, PPQ→time)
One project, 120→140 BPM linear ramp over 10 s, note struck exactly on beat 3
of bar 2: exported `startSec` must equal `qn_to_time` of that beat's qn within
±1 ms (this cross-validates the extractor against §1.1's verified math).

### 3.10 Determinism (all compilers)
Compile twice → byte-identical output. Render frame at t=30.0 s after seeking
from 0 vs. after seeking from 60 → identical frame hash.

---

## 4. Summary table

| Area | Verdict |
|---|---|
| Tempo/qn conversion (incl. ramps) | ✅ correct — keep the §1.1 test |
| Grid: beats | ✅ correct |
| Grid: bars | ✅ pure-tempo points no longer restart bars (§2.2 fixed) |
| Onset detection | ✅ sample-domain drum onset detection; click tests land within ±5 ms (§2.1 fixed) |
| Onset spectra | ✅ correct |
| Per-stem normalization | ✅ normalized curves now carry optional `gain` metadata (§2.3 fixed) |
| Curve sample / waveform / sections | ✅ / ✅ / ✅ section gaps filled (§2.6 fixed) |
| Scene easing & arc-length interp | ✅ correct math, 🔴 wrong place/time computed (perf + design, see gap analysis) |
| Jump solver, x(t), terrain, Metro layout | ✅ repo tests now cover gravity/jump vectors, constant-energy motion, terrain calibration/slope, and lane/corridor constants |
| Camera and future jump variants | ⏳ add golden tests when double-jump, rectangular clearance rejection, and camera impulse/follow systems land |
| Train dwell | ✅ gap<80 ms edge fixed; dwell ≤ half-gap (§2.4 fixed) |
