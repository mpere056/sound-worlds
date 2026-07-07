# Visual brief: `untitled-project-6d2e04f7`

This brief records what the current extracted project actually contains and
what kind of visualization it should drive.

## Summary

`untitled-project-6d2e04f7` is not a full arrangement. It is a short layered
keys/piano pattern:

- 120 BPM, 4/4;
- 11.056 s rendered audio;
- 9.056 s musical content plus a 2 s export tail;
- 5 bars / 19 beats;
- 4 tracks, all detected as `keys`;
- 48 total MIDI notes;
- no drum role;
- no bass role;
- no lead/vocal role;
- no authored section structure beyond the analyzer's default whole-song
  section.

This project is useful for testing synchronization, track selection, and
single-/small-track generators. It is not a good acceptance fixture for broad
full-song worlds.

## Track inventory

| Track | Notes | Pitch range | Timing profile | Best use |
|---|---:|---|---|---|
| Low repeating keys | 20 | 26-38 | Regular, avg gap about 0.431 s, min gap about 0.343 s | Best first Marble Music source track. |
| High keys | 18 | 57-72 | Avg gap about 0.489 s, includes a very dense 0.051 s gap | Dense-note stress test after the low track works. |
| Sparse mid keys | 7 | 45-57 | Avg gap about 0.684 s, starts later | Cinematic/sparse alternate test. |
| Three-note support | 3 | 45 only | Very sparse, avg gap about 1.324 s | Not enough for first generator; useful for later two-track support. |

## Diagnosis

The extraction is musically small but visually promising if treated correctly.
It should not be forced into:

- a runner level;
- a metro city;
- a full painting;
- a multi-track ecosystem.

Those concepts need drums, bass, lead/melody roles, regions, or longer musical
arcs to feel satisfying.

For this extraction, the strongest visual interpretation is:

> a short, tactile piano-pattern object.

That is exactly why Marble Music is the next best concept.

## Recommended first generator

Use the low repeating keys track first.

Reasons:

- 20 notes gives enough events for a complete marble path;
- pitch range 26-38 is compact enough for a coherent set of plates;
- note gaps are regular enough for a clean rolling machine;
- no extreme dense cluster has to be solved on the first attempt.

Expected visual:

- one marble descends or travels through 20 tuned plates;
- each plate hit lands exactly with the note;
- repeated/nearby pitches produce related plate positions;
- the 2 s audio tail becomes wobble, glow, and resonator decay.

## Second generator test

Use the high keys track after the first pass works.

Reason:

- it contains an extremely close 0.051 s note gap;
- this will force the dense-note grouping logic to become real;
- the generator should turn that into a rattle, roll, trill, or peg cascade
  rather than impossible marble teleportation.

## Do-not-do list

For this project, avoid:

- broad all-track visualizers as the main acceptance test;
- interpreting every `keys` track as a separate fully authored role;
- pretending the export has drums/bass/lead when it does not;
- judging Metro M4, Runner R4/R5, or full Painting parity from this project;
- adding visual complexity before the one-track marble impact loop feels good.

## Acceptance question

The first pass succeeds if the user can watch the low-track marble machine and
say:

> I can hear each note causing a physical event, and the object feels satisfying
> even though it is only one track.

If that is not true, do not move to two tracks yet.
