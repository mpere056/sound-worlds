import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compileLumenfall, passiveLumenfallReflection, sampleLumenfallBallistic, sampleLumenfallPose, solveLumenfallLaunch } from "./index.js";

describe("Lumenfall ballistic kernel", () => {
  it("back-solves an exact gravity arc", () => {
    const from: [number, number, number] = [0, 0.16, 0];
    const to: [number, number, number] = [2, 0.16, -3];
    const gravity: [number, number, number] = [0, -9.81, 0];
    const velocity = solveLumenfallLaunch(from, to, gravity, 0.8);
    const sampled = sampleLumenfallBallistic(from, velocity, gravity, 0.8);
    expect(sampled.position[0]).toBeCloseTo(to[0], 10);
    expect(sampled.position[1]).toBeCloseTo(to[1], 10);
    expect(sampled.position[2]).toBeCloseTo(to[2], 10);
  });

  it("reflects the normal component and damps the tangent", () => {
    expect(passiveLumenfallReflection([2, -4, 1], [0, 1, 0], 0.5, 0.1)).toEqual([1.8, 2, 0.9]);
  });
});

describe("Lumenfall compiler vertical slice", () => {
  it("assigns every grouped note to an exact world contact", () => {
    const performance = compileLumenfall(buildFixtureSong({ bars: 4 }));
    expect(performance.statics.impacts.length).toBeGreaterThan(4);
    expect(performance.statics.report.maximumTimingError).toBeLessThan(1e-7);
    expect(performance.statics.report.earlyCollisionCount).toBe(0);
    for (const impact of performance.statics.impacts) {
      const pose = sampleLumenfallPose(performance, impact.t);
      expect(pose.position[0]).toBeCloseTo(impact.point[0], 8);
      expect(pose.position[1]).toBeCloseTo(impact.point[1], 8);
      expect(pose.position[2]).toBeCloseTo(impact.point[2], 8);
    }
  });

  it("uses one frozen pre-existing world and deterministic route", () => {
    const song = buildFixtureSong({ bars: 3 });
    const first = compileLumenfall(song);
    const second = compileLumenfall(song);
    expect(first).toEqual(second);
    expect(first.statics.world.slabs).toHaveLength(48 * 4);
    expect(first.statics.impacts.every((impact) => first.statics.world.slabs.some((slab) => slab.id === impact.slabId))).toBe(true);
  });

  it("keeps every airborne interior sample above the contact plane", () => {
    const performance = compileLumenfall(buildFixtureSong({ bars: 4 }));
    for (const segment of performance.statics.segments.filter((candidate) => candidate.kind === "flight")) {
      for (let sample = 1; sample < 80; sample += 1) {
        const pose = sampleLumenfallBallistic(segment.p0, segment.v0, segment.gravity, (segment.t1 - segment.t0) * sample / 80);
        expect(pose.position[1]).toBeGreaterThan(performance.statics.world.heroRadius - 1e-7);
      }
    }
  });
});
