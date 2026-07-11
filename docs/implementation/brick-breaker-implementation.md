# Music-Synced Brick Breaker future plan

This is the next Sound Worlds generator. Contract, fixture, compiler, and
headless trajectory work may begin while Marble Music remains in human tuning.
Interactive scene polish and export acceptance should wait until the headless
solver passes B0-B5.

## Product idea

Generate a complete Brick Breaker performance from a selected music track. One
ball moves continuously through a precomputed sequence of brick, wall, and
paddle collisions. Every musical hit moment destroys its assigned brick, and
the final surviving brick breaks exactly on the final note of the selected
track.

The compiler must create only the bricks required by the song. For the first
version:

- one distinct note-on time creates one destructible brick;
- simultaneous notes or notes within the chord epsilon create one compound
  brick whose visible cells represent those notes;
- one ball collision destroys that compound brick at the shared hit time;
- pitch, velocity, duration, and track role may affect brick lane, material,
  color, fragment energy, and resonance only after the physical route is valid;
- no decorative destructible bricks may remain after the final note.

This avoids pretending that one ball can strike several separated objects at
the same instant while preserving the musical content of chords.

## Non-negotiable invariants

- The ball never teleports, pauses between notes, or waits inside a brick.
- Every compiled musical hit destroys exactly one live brick or compound brick.
- No brick is touched, crossed, or destroyed before its assigned hit time.
- Every brick footprint is collision-free at scene start.
- The ball may travel directly brick-to-brick or use legal intermediate wall
  and paddle contacts.
- Paddle motion respects bounded speed and acceleration.
- Ball speed and reflection angles stay inside readable physical limits.
- Immediately after the penultimate musical hit, exactly one brick remains.
- The final brick is destroyed at the final selected note time.
- After the final hit, the audio tail completes without introducing another
  destructible target.

## Architecture boundary

Brick Breaker should use the existing offline deterministic pipeline:

```text
song.json -> brick compiler -> collision itinerary + brick layout + paddle path
          -> absolute-time pose sampler -> Three.js scene
```

The physics library or collision routines may validate and author trajectories,
but a free-running runtime simulation must not own musical timing. Preview,
scrubbing, frame export, and repeated compilation must return the same state for
the same absolute time and seed.

## Musical event preparation

1. Select one note-bearing source track using a manual override or a documented
   deterministic score.
2. Sort note-ons by time and group simultaneous/chord notes within a small,
   fixed epsilon.
3. Convert each group into an immutable brick-destruction deadline.
4. Preserve the final group time exactly; it is also the completion deadline.
5. Classify gaps by the collision itinerary they can physically support:
   direct brick-to-brick, wall-assisted, paddle-return, or dense local chain.

The compiler report must expose source note count, grouped hit count, generated
brick count, chord-cell count, first/final hit times, and any fallback selected
for an impossible gap.

## Collision itinerary

The compiler solves a sequence such as:

```text
launch -> brick 0 -> brick 1 -> wall -> brick 2 -> paddle -> brick 3 -> ...
       -> final brick at final note
```

Brick collisions occur only at musical deadlines. Wall and paddle contacts are
supporting collisions and may occur between notes. A candidate state contains:

```text
{ time, ballPosition, incomingVelocity, outgoingVelocity,
  remainingBricks, paddleState, boardOccupancy }
```

For every gap, bounded beam search should consider a small set of transition
templates:

- direct reflection from the current brick to the next brick;
- current brick -> side/top wall -> next brick;
- current brick -> paddle -> next brick;
- current brick -> wall -> paddle -> next brick;
- a short dense chain for note gaps too small for a paddle return.

Each template is solved analytically where possible. Given start state, target
time, speed range, and candidate collision normals, back-solve the collision
points and outgoing vectors. Reflection must satisfy:

```text
v_out = v_in - 2 * dot(v_in, normal) * normal
```

Paddle contacts may add a bounded steering term based on impact offset, but the
resulting speed and angle must remain clamped and reproducible.

## Brick placement and removal

Brick position is an output of the itinerary, not a decorative grid chosen
first. The solver should prefer recognizable rows and clusters, then relax them
only when exact timing requires a different collision point.

Placement order:

1. Propose a musically and visually useful region for the next brick.
2. Back-solve a contact point reachable at the exact note time.
3. Orient the brick surface so incoming and outgoing velocities form a valid
   reflection.
4. Reject overlap with all existing brick footprints, walls, paddle bounds, and
   reserved ball corridors.
5. Sweep the complete incoming segment against every brick that is still live.
6. After a brick's deadline, remove its collider from all later route checks.

This time-varying occupancy is essential: a later trajectory may legally pass
through space occupied by a brick that was already destroyed, but it may never
pass through a brick that is still waiting for its note.

## Paddle planning

The paddle is a compiled actor, not an emergency runtime rescue.

- Every scheduled paddle contact has an exact intercept position and time.
- Connect intercepts with a minimum-jerk or similarly smooth curve.
- Validate maximum paddle speed, acceleration, board limits, and ball clearance.
- Keep the paddle settled or moving purposefully between intercepts; it must not
  snap underneath the ball.
- If a paddle transition is impossible, try a wall-assisted or direct-brick
  itinerary before changing brick timing.

## Continuous validation

Validation must use swept-circle or swept-sphere collision tests, not endpoint
samples alone. At a minimum, verify:

- exact contact pose at every musical deadline;
- no tunneling through thin bricks or walls;
- no premature contact with any live brick;
- no contact with a brick after it has already been destroyed;
- legal incidence and reflection vectors at every collision;
- no ball/paddle penetration before, during, or after an intercept;
- no overlapping initial brick footprints;
- bounded ball and paddle motion across the entire song;
- deterministic state under arbitrary seek order.

## Density and impossible gaps

Very dense notes need a deliberate local mechanism rather than faster and
faster travel. The compiler may use compact adjacent bricks or a compound chain
that lets one reflection progress through several tightly spaced note hits. It
must still assign one destruction deadline per distinct note-on time.

If no legal itinerary exists within speed, angle, occupancy, and paddle limits,
the compiler should fail with a diagnostic identifying the note gap and rejected
templates. It must not silently drop a brick, move a note, teleport the ball, or
increase speed without a bound.

## Suggested implementation order

1. B0: song grouping, brick-count contract, diagnostics, and fixtures.
2. B1: deterministic constant-speed ball sampler with direct brick-to-brick
   reflection and exact note-time contacts.
3. B2: full live-brick occupancy and continuous swept collision validation.
4. B3: compiled paddle intercepts with smooth bounded motion.
5. B4: wall-assisted and multi-contact beam-search templates.
6. B5: chord compound bricks, dense local chains, and impossible-gap reports.
7. B6: Three.js scene, fragments, camera, audio watch-through, and export gate.

The implementation-ready tasks, dependencies, artifacts, test matrix, and
commit boundaries are defined in the
[Brick Breaker work orders](brick-breaker-work-orders.md).

## First acceptance gate

- Generated brick count equals distinct grouped note-on times.
- Every brick destruction is within one rendered frame of its assigned note.
- The ball moves continuously through the entire selected track.
- At least one fixture demonstrates direct brick-to-brick travel.
- At least one fixture demonstrates a wall-assisted transition.
- At least one fixture demonstrates a smooth paddle return.
- Swept validation reports zero premature live-brick collisions.
- Ball and paddle speed/acceleration remain within documented bounds.
- Exactly one brick remains after the penultimate hit.
- The final brick breaks exactly on the final note.
- Recompilation and random seek order produce byte-identical compiled output and
  identical sampled poses.

## Explicit non-goals for the first implementation pass

- Do not begin visual polish before the deterministic headless solver and
  validator pass B0-B5.
- Do not make runtime physics the timing authority.
- Do not start with power-ups, multiple balls, lives, scoring, bosses, or player
  input; first prove one deterministic music-synced ball and paddle.
- Do not choose final visual style before the collision itinerary is reliable.
