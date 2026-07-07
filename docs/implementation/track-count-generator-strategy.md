# Track-count generator strategy

Sound Worlds should stop treating every extraction as if it needs one universal
all-track visualizer. The better path is to build generators by musical
complexity, prove that each smaller case feels satisfying, then move upward.

## Core rule

Choose the generator family from the extracted track count and role confidence:

| Extraction shape | Preferred generator direction | Why |
|---|---|---|
| 1 strong note track | Marble Music solo | One note lane can become one physical kinetic object with exact impacts. |
| 2 strong note tracks | Marble duet | The second track can add rails, gates, bass structure, or a second marble. |
| 3-4 related note tracks, weak roles | Small ensemble sculpture | Still better as a constrained object than a full world. |
| Full arrangement with drums/bass/lead/sections | Runner, Metro, Painting, or larger concepts | These concepts need role variety and musical sections to feel authored. |

This is a product strategy, not just an implementation detail. A sparse
one-track export should not be judged by the same visual language as a
two-minute multi-stem song.

## Why this matters

The current project showed the failure mode clearly:

- Painting was too generic because it had to infer a full artwork from four
  similar keys tracks.
- Runner lacked convincing terrain/music correlation because the source did not
  have the authored bass/drum/lead roles it expects.
- Metro could show timing but not meaningful topology because there are no
  named sections or repeated regions.

The fix is not "make every generic visualizer smarter." The fix is to create
smaller generators whose assumptions match the extraction.

## Ladder

### Level 1: one-track generator

Goal: one source track becomes one satisfying object.

First concept: [Marble Music](../marble-music.md).

Acceptance:

- every note has a visible hit or dense-cluster hit;
- timing is obvious without reading an overlay;
- the object feels designed for that exact track;
- no full-arrangement roles are implied.

### Level 2: two-track generator

Goal: two tracks have a clear relationship.

Possible relationships:

- melody marble + bass rail/frame;
- two marbles in call-and-response;
- one track drives impacts while the other controls gates/lights/resonators;
- aligned notes become handoffs or collisions.

Acceptance:

- the viewer can tell there are two musical agents;
- neither track is reduced to background decoration;
- collisions/handoffs only happen when the extracted notes justify them.

### Level 3: small ensemble generator

Goal: three or four related tracks become a compact sculpture.

Possible structures:

- low track = machine frame;
- mid track = plates/chimes;
- high track = bells/spark pegs;
- sparse support track = camera beats or large resonator hits.

Acceptance:

- the result still reads as one coherent object;
- track roles are visible but not overcomplicated;
- density remains manageable.

### Level 4: full arrangement worlds

Goal: only use full-world concepts when the export has enough musical
structure.

Good candidates:

- drums + bass + lead + harmony;
- meaningful regions/sections;
- repeated choruses or motif returns;
- enough duration for a visual arc.

This is where Metro, Runner, Painting, City, Ecosystem, and other broad
concepts make more sense.

## Generator selection algorithm

The analyzer/compiler layer should eventually compute:

1. number of note-bearing tracks;
2. note count per track;
3. pitch range per track;
4. median/min/max note gaps;
5. role confidence;
6. section/region richness;
7. audio tail length after last extracted note.

Then choose:

```text
if one strong note track:
  Marble Music solo
else if two strong note tracks:
  Marble duet
else if 3-4 note tracks but weak roles/sections:
  compact sculpture generator
else if full arrangement roles and regions exist:
  broad world concepts become eligible
else:
  ask for a better authored export or use a diagnostic/simple generator
```

Manual override should always exist, but the default should be honest.

## Current priority

Implement Marble Music M1 before further broad-concept polish on
`untitled-project-6d2e04f7`.

That export is best treated as a one-track/limited-track generator testbed, not
as proof that Painting, Runner, or Metro are aesthetically good or bad in their
final form.
