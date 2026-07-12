import { describe, expect, it } from "vitest";
import {
  auroraIdealFieldDivergence,
  auroraIntegrateBoris,
  auroraKineticEnergy,
  auroraLength,
  auroraPropagateConstantField,
  auroraSub,
} from "./physics.js";

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
