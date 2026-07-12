import { describe, expect, it } from "vitest";
import { brickLength, brickReflect, brickSegmentCircleIntersections, brickSweepCircleAgainstBox } from "./physics.js";

describe("Brick Breaker physics primitives", () => {
  it("reflects velocity without changing its magnitude", () => {
    const reflected = brickReflect([3, -4], [0, 1]);
    expect(reflected).toEqual([3, 4]);
    expect(brickLength(reflected)).toBe(5);
  });

  it("finds ordered segment-circle entry and exit times", () => {
    expect(brickSegmentCircleIntersections([-2, 0], [2, 0], [0, 0], 1)).toEqual([0.25, 0.75]);
    expect(brickSegmentCircleIntersections([-2, 1], [2, 1], [0, 0], 1)).toEqual([0.5]);
    expect(brickSegmentCircleIntersections([-2, 2], [2, 2], [0, 0], 1)).toEqual([]);
  });

  it("detects thin box tunneling with a swept circle", () => {
    const hit = brickSweepCircleAgainstBox([-3, 0], [3, 0], 0.25, { center: [0, 0], halfExtents: [0.05, 1], rotation: 0 });
    expect(hit).toBeDefined();
    expect(hit!.t).toBeCloseTo(0.45, 10);
    expect(hit!.normal).toEqual([-1, 0]);
  });

  it("returns world-space normals for rotated boxes", () => {
    const hit = brickSweepCircleAgainstBox([-3, 0], [3, 0], 0, { center: [0, 0], halfExtents: [1, 0.2], rotation: Math.PI / 4 });
    expect(hit).toBeDefined();
    expect(Math.hypot(...hit!.normal)).toBeCloseTo(1, 10);
    expect(hit!.normal[0]).toBeLessThan(0);
    expect(hit!.normal[1]).toBeGreaterThan(0);
  });

  it("does not report a parallel sweep outside the expanded box", () => {
    expect(brickSweepCircleAgainstBox([-2, 2], [2, 2], 0.2, { center: [0, 0], halfExtents: [1, 0.5], rotation: 0 })).toBeUndefined();
  });
});
