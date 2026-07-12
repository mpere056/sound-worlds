import { describe, expect, it } from "vitest";
import { buildFixtureSong, type SongEvent } from "@reaper-viz/core";
import { brickDot, brickLength, brickNormalize, brickOrientedBoxesOverlap, brickReflect, brickSub, brickSweepCircleAgainstBox, compileBrickBreaker, compileBrickBreakerPlan, sampleBrickBreakerBall } from "./index.js";

describe("Brick Breaker B0 compiler", () => {
  it("creates exactly one future brick per distinct note deadline", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 0.5, 1, 2], pitch: 60, kind: "note" }] });
    const plan = compileBrickBreakerPlan(song);
    expect(plan.report.sourceNoteCount).toBe(4);
    expect(plan.report.groupedHitCount).toBe(4);
    expect(plan.report.generatedBrickCount).toBe(4);
    expect(plan.hitGroups.at(-1)!.t).toBe(song.tracks[0]!.events.at(-1)!.t);
  });

  it("groups chords and near-epsilon notes against the group anchor", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "piano", beats: [0], pitch: 60, kind: "note" }] });
    song.tracks[0]!.events = [
      { t: 1, dur: 0.2, pitch: 60, vel: 0.5, kind: "note" },
      { t: 1.01, dur: 0.3, pitch: 67, vel: 0.9, kind: "note" },
      { t: 1.024, dur: 0.1, pitch: 64, vel: 0.7, kind: "note" },
      { t: 1.026, dur: 0.2, pitch: 72, vel: 0.8, kind: "note" },
    ];
    const plan = compileBrickBreakerPlan(song, { chordEpsilonSec: 0.025 });
    expect(plan.hitGroups).toHaveLength(2);
    expect(plan.hitGroups[0]!.notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
    expect(plan.hitGroups[0]!.representativePitch).toBe(64);
    expect(plan.hitGroups[0]!.energy).toBe(0.9);
    expect(plan.report.compoundGroupCount).toBe(1);
    expect(plan.report.chordCellCount).toBe(4);
  });

  it("is byte-deterministic when source events arrive in a different order", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "lead", beats: [0], pitch: 60, kind: "note" }] });
    const events: SongEvent[] = [
      { t: 0.5, dur: 0.2, pitch: 67, vel: 0.8, kind: "note" },
      { t: 0.5, dur: 0.1, pitch: 60, vel: 0.7, kind: "note" },
      { t: 1.5, dur: 0.3, pitch: 64, vel: 0.9, kind: "note" },
    ];
    song.tracks[0]!.events = events;
    const first = JSON.stringify(compileBrickBreakerPlan(song));
    song.tracks[0]!.events = [events[2]!, events[0]!, events[1]!];
    expect(JSON.stringify(compileBrickBreakerPlan(song))).toBe(first);
  });

  it("selects a manual source and diagnoses missing note data", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [
      { role: "drums", beats: [0, 1], kind: "onset" },
      { role: "keys", beats: [0, 1], pitch: 62, kind: "note" },
    ] });
    expect(compileBrickBreakerPlan(song, { sourceTrackId: song.tracks[1]!.id }).report.sourceTrackId).toBe(song.tracks[1]!.id);
    expect(() => compileBrickBreakerPlan(song, { sourceTrackId: song.tracks[0]!.id })).toThrow("has no MIDI notes");
    song.tracks[1]!.events = [];
    expect(() => compileBrickBreakerPlan(song)).toThrow("requires at least one note-bearing track");
  });

  it("reports dense and long gaps without retiming the final note", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0], pitch: 60, kind: "note" }] });
    song.tracks[0]!.events = [
      { t: 0.2, dur: 0.1, pitch: 60, vel: 0.6, kind: "note" },
      { t: 0.3, dur: 0.1, pitch: 62, vel: 0.7, kind: "note" },
      { t: 1.6, dur: 0.1, pitch: 64, vel: 0.8, kind: "note" },
    ];
    const plan = compileBrickBreakerPlan(song);
    expect(plan.report.gapHistogram).toEqual({ dense: 1, short: 0, medium: 0, long: 1 });
    expect(plan.report.minimumGapSec).toBeCloseTo(0.1, 10);
    expect(plan.report.finalHitSec).toBe(1.6);
    expect(plan.hitGroups.at(-1)!.t).toBe(1.6);
  });

  it("validates chord epsilon and board dimensions", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0], pitch: 60, kind: "note" }] });
    expect(() => compileBrickBreakerPlan(song, { chordEpsilonSec: 0.2 })).toThrow("epsilon");
    expect(() => compileBrickBreakerPlan(song, { board: { width: 0, height: 10 } })).toThrow("dimensions");
  });

  it("samples exact brick contacts and breaks the final brick on the final note", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "keys", beats: [0, 1, 2, 3], pitch: 60, kind: "note" }] });
    const performance = compileBrickBreaker(song);
    for (const brick of performance.statics.bricks) {
      const pose = sampleBrickBreakerBall(performance.statics.ballSegments, brick.destructionT);
      expect(pose[0]).toBeCloseTo(brick.contactPosition[0], 9);
      expect(pose[1]).toBeCloseTo(brick.contactPosition[1], 9);
    }
    const finalBrick = performance.statics.bricks.at(-1)!;
    expect(performance.statics.finalBrickId).toBe(finalBrick.id);
    expect(finalBrick.destructionT).toBe(performance.statics.report.finalHitSec);
    expect(performance.statics.bricks.filter((brick) => brick.destructionT > performance.statics.bricks.at(-2)!.destructionT)).toHaveLength(1);
  });

  it("authors constant-speed wall and paddle reflections between musical hits", () => {
    const song = buildFixtureSong({ bars: 3, patterns: [{ role: "keys", beats: [0], pitch: 60, kind: "note" }] });
    song.tracks[0]!.events = [0.5, 2, 4, 6, 8, 10].map((t, index) => ({ t, dur: 0.2, pitch: 60 + index, vel: 0.7, kind: "note" as const }));
    const performance = compileBrickBreaker(song);
    for (const segment of performance.statics.ballSegments) {
      expect(brickLength(segment.velocity)).toBeCloseTo(performance.statics.ballSpeed, 9);
    }
    for (let index = 0; index < performance.statics.ballSegments.length - 1; index += 1) {
      const current = performance.statics.ballSegments[index]!;
      const next = performance.statics.ballSegments[index + 1]!;
      expect(current.to).toEqual(next.from);
      if (current.supportNormal) {
        const reflected = brickReflect(current.velocity, current.supportNormal);
        expect(reflected[0]).toBeCloseTo(next.velocity[0], 9);
        expect(reflected[1]).toBeCloseTo(next.velocity[1], 9);
      }
    }
    expect(performance.statics.ballSegments.some((segment) => segment.kind === "wall")).toBe(true);
    expect(performance.statics.ballSegments.some((segment) => segment.kind === "paddle")).toBe(true);
    expect(performance.statics.paddleContacts.length).toBeGreaterThan(0);
    const supportSegments = performance.statics.ballSegments.filter((segment) => segment.kind === "wall" || segment.kind === "paddle");
    expect(performance.events.filter((event) => event.type === "board.hit").map((event) => event.t))
      .toEqual(supportSegments.map((segment) => segment.t1));
  });

  it("places the brick face at the ball edge and uses restrained arcade reflections", () => {
    const song = buildFixtureSong({ bars: 4, patterns: [{ role: "keys", beats: [0], pitch: 60, kind: "note" }] });
    song.tracks[0]!.events = [0.5, 1.5, 2.5, 3.5, 4.5].map((t, index) => ({ t, dur: 0.2, pitch: 60 + index, vel: 0.7, kind: "note" as const }));
    const performance = compileBrickBreaker(song);
    for (const brick of performance.statics.bricks) {
      const centerToContact = brickSub(brick.contactPosition, brick.position);
      expect(brickLength(centerToContact)).toBeCloseTo(performance.statics.ballRadius + brick.size[1] / 2, 9);
      expect(brickDot(brickNormalize(centerToContact), brick.contactNormal)).toBeCloseTo(1, 9);
      const incomingSegment = performance.statics.ballSegments.find((segment) => segment.contactBrickId === brick.id)!;
      const collision = brickSweepCircleAgainstBox(incomingSegment.from, incomingSegment.to, performance.statics.ballRadius, {
        center: brick.position,
        halfExtents: [brick.size[0] / 2, brick.size[1] / 2],
        rotation: brick.rotation,
      });
      expect(collision?.t).toBeCloseTo(1, 9);
      expect(brickDot(collision!.normal, brick.contactNormal)).toBeCloseTo(1, 9);
      const incomingIndex = performance.statics.ballSegments.indexOf(incomingSegment);
      const outgoingSegment = performance.statics.ballSegments[incomingIndex + 1];
      if (outgoingSegment) {
        const reflected = brickReflect(incomingSegment.velocity, brick.contactNormal);
        expect(reflected[0]).toBeCloseTo(outgoingSegment.velocity[0], 9);
        expect(reflected[1]).toBeCloseTo(outgoingSegment.velocity[1], 9);
        expect(brickDot(brickNormalize(outgoingSegment.velocity), brickNormalize(incomingSegment.velocity))).toBeLessThan(0.985);
      }
    }
  });

  it("certifies that every live brick is collision-free until its assigned beat", () => {
    const song = buildFixtureSong({ bars: 3, patterns: [{ role: "keys", beats: [0, 0.5, 1, 2, 3], pitch: 60, kind: "note" }] });
    const plan = compileBrickBreakerPlan(song);
    const performance = compileBrickBreaker(song);
    const colliders = performance.statics.bricks.map((brick) => ({
      brick,
      box: { center: brick.position, halfExtents: [brick.size[0] / 2, brick.size[1] / 2] as [number, number], rotation: brick.rotation },
    }));
    for (let left = 0; left < colliders.length; left += 1) {
      for (let right = left + 1; right < colliders.length; right += 1) {
        expect(brickOrientedBoxesOverlap(colliders[left]!.box, colliders[right]!.box, 0.08)).toBe(false);
      }
    }
    for (const { brick, box } of colliders) {
      for (const segment of performance.statics.ballSegments.filter((candidate) => candidate.t0 < brick.destructionT - 1e-9)) {
        const hit = brickSweepCircleAgainstBox(segment.from, segment.to, performance.statics.ballRadius, box);
        if (segment.contactBrickId === brick.id) {
          expect(segment.t1).toBeCloseTo(brick.destructionT, 9);
          expect(hit?.t).toBeCloseTo(1, 7);
        } else {
          expect(hit).toBeUndefined();
        }
      }
    }
    for (const group of plan.hitGroups) {
      const brickOwners = performance.statics.bricks.filter((brick) => Math.abs(brick.destructionT - group.t) <= 1e-7).length;
      const supportOwners = performance.statics.ballSegments.filter((segment) =>
        (segment.kind === "wall" || segment.kind === "paddle") && Math.abs(segment.t1 - group.t) <= 1e-7).length;
      expect(brickOwners + supportOwners).toBe(1);
    }
    expect(performance.statics.bricks.at(-1)!.destructionT).toBe(performance.statics.report.finalHitSec);
  });
});
