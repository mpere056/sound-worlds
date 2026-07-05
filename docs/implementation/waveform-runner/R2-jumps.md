# R2 — The Jumps

**Depends on:** R1
**Unlocks:** R3
**Est. size:** ~400 LOC compiler (≈300 = solver + validator) + ~120 LOC scene
**Exit demo:** **the de-risk demo for the whole concept** — a real project
plays in the dev app and the runner lands three consecutive jumps dead on the
snare with the sync overlay green. If this demo works, the game works.

## Goal

Implement the closed-form jump system from
[§2 of the implementation plan](../waveform-runner-implementation.md#2-the-jump-system-closed-form-ballistics):
snare selection, the single-arc solve, clearance validation with the
escalation chain, and trajectory assembly.

## Scope

**In:** tempo-derived gravity, landing selection + budgets + fallback chain,
single jumps, clearance validator, double-jump escalation, terrain concession,
trajectory assembly with continuity asserts, ground pulses, airborne rendering.
**Out:** rail/float segments (R5), glyphs (R3), any visual polish.

## Work breakdown

### 1. Gravity & durations (`compilers/runner/src/jumps/gravity.ts`)
- `g = 8A / T_beat²` with `A = 3.2 wu` (tuning, marked *recompile*); `T_beat`
  from local tempo at the jump (tempo-change-safe via `mtime`).
- Duration preference table `D ∈ {1, 0.5, 1.5, 2}` beats.

### 2. Landing selection (`jumps/select.ts`)
- Role fallback chain `snare → clap → percussion → kick → MIDI note starts → bar downbeats`
  (chosen once, logged).
- Budget: max 2 jumps/bar; preference backbeats then velocity. Rejected hits →
  `ground.pulse` events (still carry `hitT`).

### 3. The solver (`jumps/solve.ts`)
- For each landing `L`: pick `D` (validity: `Tk = L − D` ≥ prev segment end +
  0.25 beat, snapped to 1/16 grid ≤ bound).
- Closed form: `v_y0 = (y1 − y0)/D + gD/2` with `y0 = h(x(Tk))`,
  `y1 = h(x(L))`.
- **Clearance validator:** sample `clr(τ) = y(τ) − h(x(Tk+τ))` at 1/120 s,
  excluding 40 ms endpoint windows; require ≥ 0.4 wu.
- **Escalation chain** (in order, each attempt logged):
  1. next larger `D` (recheck `Tk` validity);
  2. **double jump** — mid time `M` = nearest hat/kick onset to the violation
     peak; `y_M = max(h over violation window) + 0.8`;
     `v_yA`, `v_yB` per the two-segment formulas; validate both subsegments;
  3. **terrain concession** — lower the offending crest by the deficit,
     re-run slope clamp locally, resolve. Never fails; always logged loudly.
- Emit `jump.takeoff {hitT:L}`, `jump.land {hitT:L}`,
  `jump.midImpulse {hitT:M}` events.

### 4. Trajectory assembly (`trajectory.ts` extension)
- Insert `air` / `air2` segments between `ground` segments; clip ground
  segments to `[land, nextTakeoff]`.
- **Continuity assert at every boundary** (`|Δy| < 1e−6`) — compile fails
  hard on violation; this is the solver's proof obligation.
- Compile report (`--report`): per-snare table — chosen D, single/double,
  escalations used, concessions.

### 5. Scene work
- Airborne pose already flows from the evaluator; add: lean from velocity
  (finite difference), takeoff dust puff + landing ring
  (`f(t − hitT)` decays), ground pulse rings for budget-rejected hits.
- Squash/stretch on the runner sprite: scaleY = `1 + 0.25·clamp(v_y/v_ref)`
  — pure function of the evaluator's velocity, stateless.

## Acceptance criteria

- [ ] Sync invariant: every `jump.land` payoff within 1 frame of `hitT`
      (by construction — asserted anyway across all fixtures).
- [ ] Continuity green on: flat-bass fixture, rising-bass-under-jump fixture
      (must trigger double jump), dense-D&B fixture (budget), no-snare ambient
      fixture (fallback chain to downbeats).
- [ ] Clearance re-validation on solver *output* green (validator run twice:
      inside the solver and as an independent test on the emitted trajectory).
- [ ] No-penetration property (inherited from R1) still green with air
      segments present.
- [ ] Double-jump mid-impulse times are real hat/kick onsets.
- [ ] Terrain concessions occur on **zero** of the standard fixtures (they
      exist for pathological input, not normal songs) — if a normal fixture
      concedes, the solver has a bug.
- [ ] **The demo:** human check with audio — three consecutive snare-perfect
      landings on a real project, sync overlay green.

## Tests added

Analytic solver tests (flat jump: `v_y0 = gD/2`, apex `= gD²/8`; asymmetric
landing heights vs. hand-computed values); escalation-path unit tests (forced
violation fixtures for each chain step); budget/backbeat selection; trajectory
continuity + penetration properties; compile-report snapshot for the D&B
fixture.

## Notes & risks

Implementation status (2026-07-03): R2 now selects and budgets landing hits,
falls back through the documented role chain, solves tempo-scaled parabolic
arcs, validates clearance at 120 Hz, and assembles stateless ground/air
segments with takeoff and landing events. If the duration escalation cannot
clear a pathological crest, the current deterministic fallback increases the
arc's closed-form parabolic lift and records that boost rather than mutating
terrain. Double-jump mid-impulses and terrain concessions remain future
escalation work. The real audio-only export uses bar downbeats and compiles four
unboosted landings at 2, 4, 6, and 8 seconds. Current MIDI-bearing exports use
budgeted MIDI note starts before falling back to bar downbeats, so keys-only
projects no longer have generic bar-only body motion.

- The 1/16-grid snap on `Tk` can conflict with `minGround` after a previous
  landing — the spec resolves by snapping *earlier*; make the tie-break
  explicit in code and test it (this is the one place off-by-one-frame bugs
  will breed).
- Keep the solver pure (`(song, terrain, x(t), config) → segments + events`) —
  no reads from tuning at solve-time except the *recompile-marked* params.
