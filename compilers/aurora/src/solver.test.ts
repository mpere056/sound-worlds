import { describe, expect, it } from "vitest";
import { auroraDot, auroraLength, auroraSub } from "./physics.js";
import { auroraSolveIdealMagneticArc } from "./solver.js";

describe("Aurora ideal inverse arc solver", () => {
  it("solves a quarter-circle field and exact coil-center crossing", () => {
    const solution = auroraSolveIdealMagneticArc({
      state: { position: [0, 0, 0], velocity: [1, 0, 0] },
      duration: Math.PI / 2,
      turnAngle: Math.PI / 2,
      fieldAxis: [0, 0, 1],
      charge: 1,
      mass: 1,
      maxMagneticField: 2,
    });
    expect(solution.field.magnetic).toEqual([0, 0, 1]);
    expect(solution.coilCenter[0]).toBeCloseTo(1, 12);
    expect(solution.coilCenter[1]).toBeCloseTo(-1, 12);
    expect(solution.end.velocity[0]).toBeCloseTo(0, 12);
    expect(solution.end.velocity[1]).toBeCloseTo(-1, 12);
    expect(solution.curvatureRadius).toBeCloseTo(1, 12);
    expect(solution.pathLength).toBeCloseTo(Math.PI / 2, 12);
  });

  it("produces a true helix when velocity has an axial component", () => {
    const solution = auroraSolveIdealMagneticArc({
      state: { position: [0, 0, 0], velocity: [2, 0, 3] },
      duration: 0.75,
      turnAngle: -Math.PI,
      fieldAxis: [0, 0, 4],
      charge: 0.8,
      mass: 1.2,
      maxMagneticField: 10,
    });
    expect(solution.end.position[2]).toBeCloseTo(2.25, 12);
    expect(solution.end.velocity[2]).toBeCloseTo(3, 12);
    expect(auroraLength(solution.end.velocity)).toBeCloseTo(Math.sqrt(13), 12);
    expect(solution.curvatureRadius).toBeCloseTo(2 / (Math.PI / 0.75), 12);
  });

  it("compensates for charge polarity while preserving the authored turn", () => {
    const base = {
      state: { position: [0.2, 0.1, -0.4] as [number, number, number], velocity: [1.1, -0.3, 0.5] as [number, number, number] },
      duration: 0.9,
      turnAngle: 1.2,
      fieldAxis: [0.2, 1, -0.1] as [number, number, number],
      mass: 1.4,
      maxMagneticField: 10,
    };
    const positive = auroraSolveIdealMagneticArc({ ...base, charge: 0.7 });
    const negative = auroraSolveIdealMagneticArc({ ...base, charge: -0.7 });
    expect(auroraLength(auroraSub(positive.end.position, negative.end.position))).toBeLessThan(1e-12);
    expect(auroraLength(auroraSub(positive.end.velocity, negative.end.velocity))).toBeLessThan(1e-12);
    expect(auroraDot(positive.field.magnetic, negative.field.magnetic)).toBeLessThan(0);
  });

  it("reduces a zero-turn candidate to inertial travel", () => {
    const solution = auroraSolveIdealMagneticArc({
      state: { position: [1, 2, 3], velocity: [2, -1, 0.5] },
      duration: 2,
      turnAngle: 0,
      fieldAxis: [0, 1, 0],
      charge: 1,
      mass: 1,
      maxMagneticField: 2,
    });
    expect(solution.fieldMagnitude).toBe(0);
    expect(solution.end.position).toEqual([5, 0, 4]);
    expect(solution.curvatureRadius).toBeNull();
    expect(solution.coilAxis).toEqual([0, 1, 0]);
  });

  it("rejects impossible or degenerate candidate requests", () => {
    const request = {
      state: { position: [0, 0, 0] as [number, number, number], velocity: [1, 0, 0] as [number, number, number] },
      duration: 0.1,
      turnAngle: Math.PI,
      fieldAxis: [0, 0, 1] as [number, number, number],
      charge: 1,
      mass: 1,
      maxMagneticField: 2,
    };
    expect(() => auroraSolveIdealMagneticArc(request)).toThrow("above limit");
    expect(() => auroraSolveIdealMagneticArc({ ...request, turnAngle: 0, charge: 0 })).toThrow("non-zero charge");
    expect(() => auroraSolveIdealMagneticArc({ ...request, turnAngle: 0, fieldAxis: [0, 0, 0] })).toThrow("axis");
    expect(() => auroraSolveIdealMagneticArc({ ...request, turnAngle: 0, state: { ...request.state, velocity: [0, 0, 0] } })).toThrow("speed");
  });
});
