# R5 — Ship

**Depends on:** R4
**Unlocks:** — (Waveform Runner complete)
**Est. size:** ~350 LOC compiler + ~300 LOC scene + export glue
**Exit demo:** a full real-project render, end to end: the runner grinds the
bassline at the drop, a ghost re-runs chorus 1 behind the final chorus, the
world stops dissolving in the outro, the cadence gate closes on the last hit —
then the route-silhouette end card holds. `final.mp4` + end-card PNG from one
command chain.

## Goal

The set pieces that make the video *complete* (rail grind, ghost, cadence
gate, end card), plus the ship-quality gate: goldens, tuning pass, perf, docs.

## Scope

**In:** rail grind, ghost rendering, gravity-flip (config-gated stretch),
cadence gate + route-silhouette end card, tuning schema pass, golden suite,
end-to-end scripts, docs sync.
**Out:** nothing — last phase.

## Work breakdown

### 1. Rail grind (`compilers/runner/src/rail.ts` + scene)
- Rail geometry (drop sections): bass pitch → band `h + 4..9 wu`, plateau/ramp
  shape language, **no slope clamp** (locked-on rails may be steep).
- Entry: normal R2 jump whose landing target is `rail(x(L))` at the first
  drop-bass onset; exit: jump from rail back to terrain, landing on the
  section-end downbeat. Both through the existing solver (landing-height
  parameter, not new math).
- `rail` trajectory segments; `grind.spark {hitT}` per bass onset.
- Scene: rail ribbon (bright core + glow), spark bursts `f(t − hitT)`, lean =
  rail tangent, crouch pose flag on the runner sprite.

### 2. Ghost déjà-vu (scene, ~60 LOC — compiled in R4)
- During `ghost.window`: draw a second runner + short trail sampling
  `pose(t − sourceOffset)`, on the 0.8-parallax layer, 30% alpha,
  no halo/glyph interactions. Two-line change in the trail module (it's
  already stateless).

### 3. Cadence gate + end card
- **Cadence gate:** gate statics at `x(t_end)`; doors close behind the runner
  over the final bar, sealing flash on the last hit (`hitT = lastOnset`).
- **Route silhouette end card:** the entire song's terrain profile compressed
  into one strip (compile: downsample `h(x)` to end-card width) + the
  runner's full trajectory as a thin light line over it + title/artist text.
  Rendered by `renderStill(tEnd + holdTime, scale)`; also exported as PNG
  (2160×3840) — the shareable artifact.
- Video ending: 2 s hold on the end card before final frame.

### 4. Gravity flip (config-gated, default off)
- Alternate drop treatment when a song has two drops (variety): mirrored
  terrain strip above, `g → −g` segments, solver identical by symmetry
  (implemented as a y-negation wrapper around the existing solve). Ship
  behind `tuning.dropStyle: 'rail' | 'flip'`; only `rail` is required for
  ship.

### 5. Tuning schema pass
- Final surface: apex `A`*, `v0` scale*, terrain band*, ramp width*, erasure
  lag, trail length/width, crumb density, palette per section kind, glow
  strengths, camera lead/damping/zoom-kick, drop style, end-card text.
  (* = recompile-marked.) Verify dev↔render parity via `tuning.runner.json`.

### 6. Verification, scripts, docs
- Golden frames: takeoff, apex, landing, erasure close-up, grind spark, ghost
  overlap, end card — ring fixture + one real project (SSIM ≥ 0.995).
- Determinism `--hash` double-render in CI script.
- `scripts/render-all.sh <project> runner` = compile → render → mux →
  end-card PNG.
- Perf: full effects frame < 8 ms; 3-min song renders < 3 min.
- Docs-lie check: concept + implementation docs updated to as-built.

## Acceptance criteria

- [ ] Rail entry/exit pass all trajectory properties (continuity, clearance,
      sync); sparks land on bass onsets.
- [ ] Ghost renders only inside windows; scrub-exactness still green.
- [ ] Cadence gate seals within 1 frame of the final onset; end card matches
      the compiled route silhouette (golden).
- [ ] One command chain: real project → `final.mp4` + end-card PNG, zero
      manual steps, faster than realtime.
- [ ] Full test suite green: properties, fixtures, sync invariant, goldens,
      determinism, perf budget.
- [ ] Final human gate: full watch-through of one real song with audio —
      landings locked, drop moment hits, premise reads, no glitch.

## Tests added

Rail solver fixtures (drop entry/exit); ghost window bounds; end-card
route-silhouette compile test (downsample correctness); final golden set;
end-to-end smoke script (fixture project through the whole chain in CI).

## Notes & risks

- Rail entry timing is the last tricky solve: the first drop-bass onset may be
  *on* the drop downbeat, leaving no room for the entry jump — the spec's
  answer: entry jump may start in the riser bar (takeoff before the section
  boundary is allowed; landing defines the moment). Test the
  drop-starts-on-downbeat fixture explicitly.
- Don't let gravity-flip scope-creep the ship date; it's flagged default-off
  for a reason.
