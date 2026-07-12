import { describe, expect, it } from "vitest";
import {
  auroraEstimateMagneticDivergence,
  auroraIdealFieldDivergence,
  auroraIntegrateBoris,
  auroraIntegrateBorisField,
  auroraKineticEnergy,
  auroraLength,
  auroraPropagateConstantField,
  auroraSampleFiniteSolenoid,
  auroraSolenoidParaxialRatio,
  auroraSub,
} from "./physics.js";
import type { AuroraFiniteSolenoid } from "./types.js";

describe("Aurora ideal-field Lorentz propagation", () => {
  it("follows an exact quarter-circle in a pure magnetic field", () => {
    const result = auroraPropagateConstantField(
      { position: [0, 0, 0], velocity: [1, 0, 0] },
      { electric: [0, 0, 0], magnetic: [0, 0, 1] },
      Math.PI / 2,
      { charge: 1, mass: 1 },
    );
    expect(result.position[0]).toBeCloseTo(1, 12);
    expect(result.position[1]).toBeCloseTo(-1, 12);
    expect(result.velocity[0]).toBeCloseTo(0, 12);
    expect(result.velocity[1]).toBeCloseTo(-1, 12);
    expect(auroraLength(result.velocity)).toBeCloseTo(1, 12);
    expect(result.kineticEnergyDelta).toBeCloseTo(0, 12);
    expect(result.magneticWork).toBe(0);
  });

  it("preserves parallel velocity while rotating the perpendicular component", () => {
    const result = auroraPropagateConstantField(
      { position: [0, 0, 0], velocity: [2, 0, 3] },
      { electric: [0, 0, 0], magnetic: [0, 0, 2] },
      Math.PI / 4,
      { charge: 1, mass: 1 },
    );
    expect(result.velocity[0]).toBeCloseTo(0, 12);
    expect(result.velocity[1]).toBeCloseTo(-2, 12);
    expect(result.velocity[2]).toBeCloseTo(3, 12);
    expect(result.position[2]).toBeCloseTo(3 * Math.PI / 4, 12);
  });

  it("reduces to constant acceleration when the magnetic field is zero", () => {
    const result = auroraPropagateConstantField(
      { position: [1, 2, 3], velocity: [2, -1, 0.5] },
      { electric: [3, 0, -2], magnetic: [0, 0, 0] },
      2,
      { charge: 2, mass: 4 },
    );
    expect(result.position).toEqual([8, 0, 2]);
    expect(result.velocity).toEqual([5, -1, -1.5]);
    expect(result.electricWork).toBeCloseTo(result.kineticEnergyDelta, 12);
  });

  it("matches a fine-step Boris integration for general constant fields", () => {
    const state = { position: [0.3, -0.2, 0.5] as [number, number, number], velocity: [1.2, 0.4, -0.7] as [number, number, number] };
    const field = { electric: [0.2, -0.1, 0.35] as [number, number, number], magnetic: [0.4, 0.7, 1.1] as [number, number, number] };
    const options = { charge: -0.8, mass: 1.7 };
    const exact = auroraPropagateConstantField(state, field, 1.25, options);
    const numerical = auroraIntegrateBoris(state, field, 1.25, 50_000, options);
    expect(auroraLength(auroraSub(exact.position, numerical.position))).toBeLessThan(2e-5);
    expect(auroraLength(auroraSub(exact.velocity, numerical.velocity))).toBeLessThan(2e-5);
    expect(exact.electricWork).toBeCloseTo(exact.kineticEnergyDelta, 10);
  });

  it("keeps a neutral particle inertial and reports zero ideal-field divergence", () => {
    const result = auroraPropagateConstantField(
      { position: [1, 1, 1], velocity: [2, 3, 4] },
      { electric: [9, 8, 7], magnetic: [6, 5, 4] },
      0.5,
      { charge: 0, mass: 2 },
    );
    expect(result.position).toEqual([2, 2.5, 3]);
    expect(result.velocity).toEqual([2, 3, 4]);
    expect(auroraKineticEnergy(2, result.velocity)).toBe(29);
    expect(auroraIdealFieldDivergence()).toBe(0);
  });

  it("rejects invalid propagation inputs", () => {
    const state = { position: [0, 0, 0] as [number, number, number], velocity: [1, 0, 0] as [number, number, number] };
    const field = { electric: [0, 0, 0] as [number, number, number], magnetic: [0, 0, 1] as [number, number, number] };
    expect(() => auroraPropagateConstantField(state, field, -1, { charge: 1, mass: 1 })).toThrow("duration");
    expect(() => auroraPropagateConstantField(state, field, 1, { charge: 1, mass: 0 })).toThrow("mass");
    expect(() => auroraIntegrateBoris(state, field, 1, 0, { charge: 1, mass: 1 })).toThrow("steps");
  });
});

describe("Aurora finite-solenoid propagation", () => {
  const solenoid: AuroraFiniteSolenoid = {
    center: [0.3, -0.2, 0.1],
    axis: [1, 2, -1],
    axialField: 2.5,
    halfLength: 1.4,
    fringeWidth: 0.35,
    apertureRadius: 0.8,
  };

  it("aligns its center field to an arbitrary axis and decays outside the coil", () => {
    const centerField = auroraSampleFiniteSolenoid(solenoid, solenoid.center);
    expect(auroraLength(centerField)).toBeGreaterThan(2.49);
    expect(auroraLength(centerField)).toBeLessThanOrEqual(2.5);
    expect(centerField[0] / centerField[1]).toBeCloseTo(0.5, 12);
    expect(centerField[2] / centerField[1]).toBeCloseTo(-0.5, 12);

    const farField = auroraSampleFiniteSolenoid(solenoid, [20, 40, -20]);
    expect(auroraLength(farField)).toBeLessThan(1e-12);
  });

  it("remains numerically divergence-free throughout the paraxial fringe", () => {
    const sample = (position: [number, number, number]) => auroraSampleFiniteSolenoid(solenoid, position);
    const points: Array<[number, number, number]> = [
      [0.3, -0.2, 0.1],
      [0.75, 0.7, -0.35],
      [0.98, 1.16, -0.58],
      [-0.38, -1.56, 0.78],
    ];
    for (const point of points) {
      expect(Math.abs(auroraEstimateMagneticDivergence(sample, point, 1e-5))).toBeLessThan(2e-8);
    }
  });

  it("reports whether a field sample remains inside its paraxial aperture", () => {
    expect(auroraSolenoidParaxialRatio(solenoid, solenoid.center)).toBeCloseTo(0, 12);
    expect(auroraSolenoidParaxialRatio(solenoid, [0.3, -0.2, 0.9])).toBeLessThan(1);
    expect(auroraSolenoidParaxialRatio(solenoid, [0.3, -0.2, 1.7])).toBeGreaterThan(1);
  });

  it("preserves speed through a pure-magnetic fringe", () => {
    const state = { position: [-2.2, -0.1, 0.2] as [number, number, number], velocity: [2.1, 0.35, -0.15] as [number, number, number] };
    const result = auroraIntegrateBorisField(
      state,
      (position) => ({ electric: [0, 0, 0], magnetic: auroraSampleFiniteSolenoid(solenoid, position) }),
      1.8,
      4_000,
      { charge: 0.9, mass: 1.3 },
    );
    expect(auroraLength(result.velocity)).toBeCloseTo(auroraLength(state.velocity), 11);
    expect(result.electricWork).toBe(0);
    expect(Math.abs(result.energyResidual)).toBeLessThan(2e-12);
  });

  it("converges under step refinement through a finite-field fringe", () => {
    const state = { position: [-2.2, -0.1, 0.2] as [number, number, number], velocity: [2.1, 0.35, -0.15] as [number, number, number] };
    const sample = (position: [number, number, number]) => ({ electric: [0, 0, 0] as [number, number, number], magnetic: auroraSampleFiniteSolenoid(solenoid, position) });
    const coarse = auroraIntegrateBorisField(state, sample, 1.8, 1_000, { charge: 0.9, mass: 1.3 });
    const medium = auroraIntegrateBorisField(state, sample, 1.8, 2_000, { charge: 0.9, mass: 1.3 });
    const fine = auroraIntegrateBorisField(state, sample, 1.8, 4_000, { charge: 0.9, mass: 1.3 });
    const coarseError = auroraLength(auroraSub(coarse.position, fine.position));
    const mediumError = auroraLength(auroraSub(medium.position, fine.position));
    expect(mediumError).toBeLessThan(coarseError * 0.4);
  });

  it("tracks electric work while crossing a spatially varying field", () => {
    const state = { position: [-1.4, 0.1, 0] as [number, number, number], velocity: [1.7, 0.2, 0.1] as [number, number, number] };
    const result = auroraIntegrateBorisField(
      state,
      (position) => ({ electric: [0.12, -0.04, 0.03], magnetic: auroraSampleFiniteSolenoid(solenoid, position) }),
      1.2,
      4_000,
      { charge: -0.7, mass: 1.1 },
    );
    expect(Math.abs(result.energyResidual)).toBeLessThan(2e-7);
  });

  it("rejects malformed finite coils and numerical integration options", () => {
    expect(() => auroraSampleFiniteSolenoid({ ...solenoid, axis: [0, 0, 0] }, [0, 0, 0])).toThrow("axis");
    expect(() => auroraSampleFiniteSolenoid({ ...solenoid, fringeWidth: 0 }, [0, 0, 0])).toThrow("fringe width");
    expect(() => auroraSolenoidParaxialRatio({ ...solenoid, apertureRadius: 0 }, [0, 0, 0])).toThrow("aperture radius");
    expect(() => auroraIntegrateBorisField(
      { position: [0, 0, 0], velocity: [1, 0, 0] },
      () => ({ electric: [0, 0, 0], magnetic: [0, 0, 0] }),
      1,
      0,
      { charge: 1, mass: 1 },
    )).toThrow("steps");
  });
});
