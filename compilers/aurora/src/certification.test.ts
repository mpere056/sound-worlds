import { describe, expect, it } from "vitest";
import { auroraCoilSurfaceClearance, auroraPointToCoilSurfaceDistance, auroraSegmentCoilClearance, certifyAuroraOccupancy } from "./certification.js";
import type { AuroraCoil, AuroraRouteSegment } from "./types.js";

function coil(id: string, center: [number, number, number], axis: [number, number, number] = [0, 0, 1]): AuroraCoil {
  return {
    id,
    deadlineId: id,
    t: 1,
    center,
    axis,
    arrivalDirection: axis,
    pitch: 60,
    energy: 0.8,
    radius: 0.5,
    tubeRadius: 0.1,
    color: "#6fffe9",
  };
}

function segment(from: [number, number, number], velocity: [number, number, number], duration = 2): AuroraRouteSegment {
  return {
    id: "segment",
    kind: "deadline",
    deadlineId: "coil",
    t0: 0,
    t1: duration,
    start: { position: from, velocity },
    end: { position: from.map((value, index) => value + velocity[index]! * duration) as [number, number, number], velocity },
    field: { electric: [0, 0, 0], magnetic: [0, 0, 0] },
    charge: 1,
    mass: 1,
    turnAngle: 0,
    fieldMagnitude: 0,
    family: "planar",
  };
}

describe("Aurora global occupancy certification", () => {
  it("measures point distance against an oriented torus rather than a sphere", () => {
    const target = coil("target", [0, 0, 0]);
    expect(auroraPointToCoilSurfaceDistance([0.5, 0, 0], target)).toBeCloseTo(-0.1, 12);
    expect(auroraPointToCoilSurfaceDistance([0, 0, 0], target)).toBeCloseTo(0.4, 12);
    expect(auroraPointToCoilSurfaceDistance([0, 0, 0.4], target)).toBeGreaterThan(0.5);
  });

  it("distinguishes separated, intersecting, and perpendicular coil bodies", () => {
    expect(auroraCoilSurfaceClearance(coil("a", [0, 0, 0]), coil("b", [2, 0, 0]))).toBeGreaterThan(0.75);
    expect(auroraCoilSurfaceClearance(coil("a", [0, 0, 0]), coil("b", [0, 0, 0]))).toBeLessThan(0);
    expect(auroraCoilSurfaceClearance(coil("a", [0, 0, 0]), coil("b", [0, 0, 1.2], [1, 0, 0]))).toBeGreaterThan(0.05);
  });

  it("rejects a particle path through the rim while accepting the center aperture", () => {
    const target = coil("target", [0, 0, 0]);
    const throughRim = segment([-1, 0, 0], [1, 0, 0]);
    const throughAperture = segment([0, 0, -1], [0, 0, 1]);
    expect(auroraSegmentCoilClearance(throughRim, target, 0.12)).toBeLessThan(0);
    expect(auroraSegmentCoilClearance(throughAperture, target, 0.12)).toBeGreaterThan(0.2);
    expect(certifyAuroraOccupancy([throughRim], [target], 0.12).violations).not.toEqual([]);
    expect(certifyAuroraOccupancy([throughAperture], [target], 0.12).violations).toEqual([]);
  });

  it("validates certification sampling parameters", () => {
    expect(() => auroraCoilSurfaceClearance(coil("a", [0, 0, 0]), coil("b", [2, 0, 0]), 4)).toThrow("at least 8");
    expect(() => auroraSegmentCoilClearance(segment([0, 0, -1], [0, 0, 1]), coil("a", [0, 0, 0]), 0.1, 2)).toThrow("at least 4");
  });
});
