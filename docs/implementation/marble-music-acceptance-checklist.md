# Marble Music acceptance checklist

This checklist is the gate between "the Marble Music implementation runs" and
"the Marble Music implementation is actually good enough to build on."

Use it before moving from one-track Marble Music to two-track Marble Music.

## Required fixture order

1. `untitled-project-6d2e04f7`, low repeating keys track.
2. `untitled-project-6d2e04f7`, high keys dense stress track.
3. A synthetic single-track dense trill.
4. A synthetic single-track sparse melody with long rests.

Do not use the full all-track export as the main acceptance case for the first
slice. The point is to prove one track first.

## Sync checklist

Pass only if all are true:

- every selected note produces a visible impact or belongs to a visible dense
  cluster;
- visible impacts land at the same moment as heard note attacks;
- the user can perceive the sync without enabling debug overlays;
- scrubbing to a hit time shows the marble contacting or activating the target;
- no note is silently dropped;
- no impact appears without a musical reason unless it is clearly tail
  resonance, not a new hit.

## Motion checklist

Pass only if all are true:

- the marble never teleports;
- fast passages become rolls, rattles, cascades, or compact mechanisms;
- long gaps show plausible travel, holding, or camera movement;
- the marble has readable weight, spin, and contact;
- the route reads as a designed kinetic machine rather than a plotted line.

## Visual checklist

Pass only if all are true:

- the scene feels 3D and tactile;
- the wall, rods, plates, pegs, and marble have depth and shadows;
- repeated pitches look visually related;
- low and high pitches feel meaningfully different;
- glow and wobble are strong enough to notice but still tied to impacts;
- the final frame looks like a completed sculpture.

## Tail checklist

Pass only if all are true:

- if the master audio continues after the final selected note, the visual stays
  alive through resonance, glow, wobble, or settling;
- the tail does not invent fake note impacts;
- the scene does not go inert before the audible audio ends.

## Debug overlays allowed during testing

These overlays can exist behind a toggle:

- note hit markers;
- current source track name;
- selected note count;
- dropped-note count;
- dense-cluster count;
- current path segment id;
- timing error count.

The scene must still be understandable when overlays are off.

## Failure actions

If sync fails:

1. inspect compiler impact times before changing visuals;
2. compare source note times to `marble.impact.params.hitT`;
3. verify app audio clock drives `renderFrame(t)`;
4. verify no runtime animation state is drifting from compiled time.

If visuals feel random:

1. simplify to fewer target kinds;
2. increase impact brightness and target wobble;
3. make repeated pitch families more obvious;
4. reduce camera motion;
5. verify every decoration has a musical cause.

If dense notes look impossible:

1. widen rattle/cascade grouping;
2. use local peg arrays;
3. keep the marble in one compact mechanism;
4. avoid forcing large travel between close notes.

## Promotion gate

Only start the two-track Marble Music implementation when the user can watch
the one-track low-key fixture and say:

> I can hear each note causing a physical event, and the object feels
> satisfying even though it is only one track.
