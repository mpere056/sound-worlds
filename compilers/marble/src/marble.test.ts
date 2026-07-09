import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compileMarble, sampleMarblePath, sampleMarblePose } from "./index.js";

describe("Marble Music compiler", () => {
  it("maps every selected note to an exact hit", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], pitch: 48, kind: "note" }] });
    const performance = compileMarble(song);
    expect(performance.concept).toBe("marble");
    expect(performance.statics.source.noteCount).toBe(8);
    expect(performance.statics.impacts).toHaveLength(8);
    for (const impact of performance.statics.impacts) {
      const event = performance.events.find((candidate) => candidate.type === "marble.impact" && candidate.params.noteIndex === impact.noteIndex);
      expect(event).toBeDefined();
      expect(event!.params.hitT).toBe(impact.t);
    }
    expect(JSON.stringify(compileMarble(song))).toBe(JSON.stringify(compileMarble(song)));
  });

  it("classifies dense notes as local mechanisms instead of dropping them", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 0.1, 0.18, 0.32, 1], pitch: 72, kind: "note" }] });
    const performance = compileMarble(song);
    expect(performance.statics.impacts).toHaveLength(5);
    expect(performance.statics.clusters.some((cluster) => cluster.kind === "rattle" || cluster.kind === "cascade")).toBe(true);
    expect(performance.statics.diagnostics.impossibleGaps.length).toBeGreaterThan(0);
    expect(performance.statics.diagnostics.droppedNotes).toBe(0);
  });

  it("emits a continuous path and tail coverage", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "keys", beats: [0, 1, 2, 3], pitch: 55, kind: "note" }] });
    const performance = compileMarble(song);
    const path = performance.statics.path;
    expect(path.length).toBeGreaterThan(1);
    for (let index = 1; index < path.length; index += 1) {
      expect(path[index]!.t0).toBeGreaterThanOrEqual(path[index - 1]!.t0);
    }
    const pose = sampleMarblePath(path, performance.durationSec);
    expect(pose.pos.every(Number.isFinite)).toBe(true);
    expect(performance.statics.tail.audioEndT).toBe(performance.durationSec);
  });

  it("moves continuously after an impact even when the note is sustained", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 3], pitch: 55, kind: "note" }] });
    song.tracks[0]!.events[0]!.dur = 1.1;
    const performance = compileMarble(song);
    const firstTarget = performance.statics.targets[0]!;
    const travel = performance.statics.path.find((segment) => segment.targetId === performance.statics.targets[1]!.id && segment.kind !== "settle");
    expect(travel?.t0).toBe(performance.statics.impacts[0]!.t);
    expect(travel?.t1).toBe(performance.statics.impacts[1]!.t);
    const pose = sampleMarblePath(performance.statics.path, 0.9);
    expect(pose.kind).toBe("arc");
    expect(pose.pos).not.toEqual(firstTarget.pos);
    const secondImpact = performance.statics.impacts[1]!;
    const secondPose = sampleMarblePath(performance.statics.path, secondImpact.t);
    const secondTarget = performance.statics.targets[1]!;
    secondPose.pos.forEach((value, index) => expect(value).toBeCloseTo(secondTarget.pos[index]!, 6));
  });

  it("drops into a delayed first note instead of appearing on its target", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [1, 2], pitch: 60, kind: "note" }] });
    const performance = compileMarble(song);
    const drop = performance.statics.path[0]!;
    expect(drop.kind).toBe("drop");
    expect(drop.t0).toBe(0);
    expect(drop.t1).toBe(performance.statics.impacts[0]!.t);
    const middle = sampleMarblePose(performance.statics.path, drop.t1 / 2);
    expect(middle.pos[1]).toBeGreaterThan(drop.to[1]);
    expect(middle.pos[1]).toBeLessThan(drop.from[1]);
    const impact = sampleMarblePose(performance.statics.path, drop.t1);
    expect(impact.pos).toEqual(drop.to);
  });

  it("does not insert stationary holds between note impacts", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "keys", beats: [0, 1, 3, 6], pitch: 55, kind: "note" }] });
    const performance = compileMarble(song);
    expect(performance.statics.path.some((segment) => segment.kind === "hold")).toBe(false);
    for (let index = 0; index < performance.statics.impacts.length - 1; index += 1) {
      const current = performance.statics.impacts[index]!;
      const next = performance.statics.impacts[index + 1]!;
      const segment = performance.statics.path.find((entry) => entry.t0 === current.t && entry.t1 === next.t);
      expect(segment).toBeDefined();
      const quarter = sampleMarblePose(performance.statics.path, current.t + (next.t - current.t) * 0.25);
      const threeQuarter = sampleMarblePose(performance.statics.path, current.t + (next.t - current.t) * 0.75);
      expect(quarter.pos).not.toEqual(threeQuarter.pos);
    }
  });

  it("samples exact impact poses with physical metadata", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 1, 2, 3], pitch: 55, kind: "note" }] });
    const performance = compileMarble(song);
    for (const impact of performance.statics.impacts) {
      const pose = sampleMarblePose(performance.statics.path, impact.t);
      const target = performance.statics.targets.find((candidate) => candidate.id === impact.targetId)!;
      pose.pos.forEach((value, index) => expect(value).toBeCloseTo(target.pos[index]!, 6));
      expect(pose.contact).toBe(true);
      expect(pose.quat.every(Number.isFinite)).toBe(true);
      expect(pose.tangent.every(Number.isFinite)).toBe(true);
      expect(pose.normal).toEqual([0, 0, 1]);
      expect(Math.hypot(...pose.quat)).toBeCloseTo(1, 5);
    }
  });

  it("adds monotonic arc-length samples and distance-based spin to moving segments", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 1.5, 3], pitch: 55, kind: "note" }] });
    const performance = compileMarble(song);
    const moving = performance.statics.path.find((segment) => segment.kind === "arc" || segment.kind === "rail");
    expect(moving).toBeDefined();
    expect(moving!.arcLength).toBeGreaterThan(0);
    expect(moving!.arcSamples?.length).toBeGreaterThan(4);
    for (let index = 1; index < moving!.arcSamples!.length; index += 1) {
      expect(moving!.arcSamples![index]).toBeGreaterThanOrEqual(moving!.arcSamples![index - 1]!);
    }
    const middlePose = sampleMarblePose(performance.statics.path, (moving!.t0 + moving!.t1) / 2);
    const endPose = sampleMarblePose(performance.statics.path, moving!.t1);
    expect(middlePose.spin).toBeGreaterThan(0);
    expect(endPose.spin).toBeCloseTo((moving!.arcLength ?? 0) / 0.28, 4);
    expect(middlePose.speed).toBeGreaterThan(0);
  });

  it("keeps accumulated roll continuous across impacts", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 1, 2], pitch: 55, kind: "note" }] });
    const performance = compileMarble(song);
    const impactT = performance.statics.impacts[1]!.t;
    const before = sampleMarblePose(performance.statics.path, impactT - 0.0001);
    const after = sampleMarblePose(performance.statics.path, impactT + 0.0001);
    expect(after.spin).toBeGreaterThanOrEqual(before.spin);
    expect(after.spin - before.spin).toBeLessThan(0.02);
  });

  it("authors camera keys from selected target timing through the tail", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "keys", beats: [0, 0.5, 1, 1.5, 4, 5], pitch: 50, kind: "note" }] });
    const performance = compileMarble(song);
    expect(performance.camera.length).toBeGreaterThan(3);
    expect(performance.camera[0]!.t).toBeLessThanOrEqual(performance.statics.impacts[0]!.t);
    expect(performance.camera[performance.camera.length - 1]!.t).toBe(performance.durationSec);
    expect(performance.camera[performance.camera.length - 1]!.zoom).toBeLessThan(performance.camera[1]!.zoom);
    for (let index = 1; index < performance.camera.length; index += 1) {
      expect(performance.camera[index]!.t).toBeGreaterThanOrEqual(performance.camera[index - 1]!.t);
      expect(performance.camera[index]!.pos.every(Number.isFinite)).toBe(true);
    }
  });
});
