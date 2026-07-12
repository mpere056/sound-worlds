# Live Marble Music implementation plan

This is a future Sound Worlds mode. It is recorded now so the live idea is not
lost, but it must not interrupt completion of deterministic one-track Marble
Music, its acceptance gate, or the offline export pipeline.

## Product idea

The live scene contains one continuously falling marble. Background depth cues
make the descent readable even before any notes are played. When a performer
plays a piano note through REAPER, Sound Worlds creates a platform in the
marble's predicted fall path so the marble strikes it and bounces.

Live note properties control the collision:

- MIDI pitch controls platform angle, with a bounded mapping around a neutral
  horizontal angle;
- MIDI velocity controls restitution/bounciness and may add a tightly clamped
  collision impulse;
- track, channel, or pitch class may control platform material and color;
- note-off may optionally control resonance or platform lifetime, but is not
  required for the first live prototype.

The result should feel playable: the musician is creating the marble machine
while performing rather than triggering a pre-authored animation.

## Architecture boundary

Live Marble Music is a separate product mode and runtime from prerecorded
Marble Music. Webcam and hand-gesture input belong only to live mode.
Prerecorded mode never requests camera permission and may spend longer solving
the complete immutable platform layout after a slider change.

```text
offline mode: REAPER export -> song.json -> compiler -> absolute-time path
live mode:    REAPER MIDI telemetry -> event clock -> fixed-step physics world
```

## Rolling certainty window

Live mode does not solve a complete song because future notes may not exist yet.
It maintains two visual populations:

- **certain platforms:** the next 5-8 collision platforms are fully solved,
  collision-enabled, and locked once they enter the active window;
- **uncertain platforms:** lightweight, non-collidable instances remain in a
  distant vortex until enough timing and trajectory information exists to place
  them safely.

For a known backing track, live mode may know the total future platform count,
but count does not imply placement. An uncertain instance starts settling well
before it becomes one of the next 5-8 impacts. Its movement follows a continuous
bounded path into the solved pose; it must never pop, crossfade, or become a
collider while intersecting the marble or another platform. If solving misses
its deadline, pause the marble simulation rather than activate invalid geometry.

The rolling solver runs incrementally after each impact and whenever gesture
input materially changes the motion mix. It reuses stable platform IDs and
never repositions a platform after that platform becomes certain.

Prerecorded mode explicitly does not use this window. It compiles every target,
validates every carrier pair and route clearance, and installs one immutable
layout for seekable playback and export.

### Implemented foundation

`packages/app/src/marble-live-window.ts` now owns the first runtime contract:

- stable `live-platform:N` identities for the known platform count;
- a bounded 5-8 slot certainty window;
- explicit uncertain, solving, certain, and spent states;
- generation-checked solve results so stale gesture replans cannot activate;
- strict impact ordering and refusal to consume uncertified geometry;
- one-slot replenishment after each certified impact.

This state machine contains no renderer or physics assumptions. The next live
slice should add typed rolling-solver messages that carry collision poses into
this contract, followed by an instanced uncertainty-vortex renderer.

The typed rolling-solver boundary is now also implemented in
`marble-live-solver-protocol.ts` and `marble-live-rolling-coordinator.ts`. A
request carries the current marble pose/velocity, bounded motion mix, ordered
note intents, and all reserved colliders. Results must match the exact requested
stable-ID batch and provide non-negative clearance before the coordinator can
certify them. Invalidation drops pending request IDs and resets only solving
slots; already-certain platforms remain locked.

The next implementation slice is the worker-side placement solver itself. It
must predict each target impact from the fixed-step body state, map pitch and
velocity into bounded platform properties, and return certified poses without
intersecting reserved geometry.

The offline renderer remains deterministic and seekable. The live mode is
allowed to use a real runtime rigid-body simulation because future note times
are unknowable and there is no scrub/export determinism requirement during the
performance. A recording of live telemetry and initial simulation state may be
added later for replay.

Do not route live MIDI through the existing package extractor. Add a separate,
low-latency REAPER telemetry bridge that emits at least:

```text
noteOn { sourceTrackGuid, channel, pitch, velocity, reaperTime, sequence }
noteOff { sourceTrackGuid, channel, pitch, reaperTime, sequence } // optional MVP
```

The implementation spike must compare supported REAPER-side paths, such as a
deferred ReaScript polling recent MIDI input or a purpose-built JSFX/OSC bridge,
and choose the path with reliable timestamps and the lowest stable latency.

## Physics and spawning rules

- Advance physics with a fixed timestep; rendering interpolates body poses.
- Keep gravity continuous even when no notes arrive.
- On note-on, predict the marble's short-horizon fall and place the platform
  below it with enough lead time to avoid spawning inside the marble.
- Offset the platform surface by marble radius and platform half-thickness, as
  in the offline collision contract.
- Clamp pitch-to-angle and velocity-to-restitution mappings to physically
  readable ranges.
- Reject or reposition a new platform if its collider intersects the marble or
  an existing platform.
- Cap active platforms and retire objects after they fall behind the camera or
  exceed a time-to-live budget.
- Preserve ordering with sequence numbers and a monotonic event clock; measure
  REAPER-to-collision latency rather than assuming it is negligible.

## Falling-world presentation

The camera follows the marble through an effectively endless vertical world.
The background needs motion references so free fall remains visible:

- multiple parallax depth layers;
- sparse wall seams, height markers, lights, cables, or structural frames;
- particles or dust with slower relative motion;
- occasional fixed landmarks for scale;
- no static empty backdrop that makes a falling marble look motionless.

The marble remains the focal point and must not leave the viewport.

## Suggested implementation order

1. REAPER telemetry spike with timestamped note-on logging and latency report.
2. Standalone fixed-step falling-marble sandbox with no music mapping.
3. Add the uncertain vortex renderer using instanced, non-collidable geometry.
4. Implement the rolling 5-8-platform solver and certainty state machine.
5. Spawn one collision-safe platform from each live note.
6. Map pitch to angle and velocity to restitution with visible clamps.
7. Add platform occupancy rejection, lifetime management, and endless-world
   camera/background recycling.
8. Connect webcam gestures to live motion/camera controls only.
9. Run a live piano playability test and tune end-to-end latency.
10. Optionally record telemetry plus simulation seed/state for deterministic
   replay and later video export.

## First acceptance gate

- A note played into the selected REAPER track produces exactly one platform.
- The platform appears without intersecting the marble or existing geometry.
- The marble visibly collides with the platform edge and bounces.
- Low and high notes produce clearly different but bounded angles.
- Soft and hard notes produce clearly different but stable bounciness.
- No-note periods still read as continuous falling.
- The marble stays visible and the world can run for ten minutes without
  unbounded object growth.
- Median input-to-visible-response latency is measured and documented; the
  prototype is not accepted on subjective timing alone.

## Explicit non-goals for the current Marble work

- Do not implement this before offline one-track Marble Music passes its human
  watch-through and collision/camera gates.
- Do not replace the offline compiler or REAPER package extractor with this
  telemetry path.
- Do not promise deterministic live physics until event recording/replay has a
  separate design and test plan.
