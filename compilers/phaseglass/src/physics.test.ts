import { describe, expect, it } from "vitest";
import { phaseglassApplyPhaseGradient, phaseglassLength, phaseglassRefractPassive, phaseglassSolvePhaseGradient, phaseglassSub } from "./physics.js";

describe("Phaseglass optics kernel", () => {
  it("implements passive Snell refraction and diagnoses total internal reflection", () => {
    const normalIncidence = phaseglassRefractPassive([0, -1, 0], [0, 1, 0], 1 / 1.5);
    expect(normalIncidence.totalInternalReflection).toBe(false);
    expect(normalIncidence.direction).toEqual([0, -1, 0]);
    const totalInternal = phaseglassRefractPassive([0.9, 0.435889894, 0], [0, -1, 0], 1.5);
    expect(totalInternal.totalInternalReflection).toBe(true);
    expect(totalInternal.direction).toBeNull();
  });

  it("round-trips an authored active phase gradient without changing speed", () => {
    const incoming: [number, number, number] = [4.2, 0.8, 1.1];
    const outgoing: [number, number, number] = [1.1, 3.7, 1.918332609];
    const incomingSpeed = phaseglassLength(incoming);
    const scaledOutgoing: [number, number, number] = outgoing.map((value) => value * incomingSpeed / phaseglassLength(outgoing)) as [number, number, number];
    const normal: [number, number, number] = [0.4, 0.8, 0.2];
    const gradient = phaseglassSolvePhaseGradient(incoming, scaledOutgoing, normal);
    const solved = phaseglassApplyPhaseGradient(incoming, normal, gradient);
    expect(phaseglassLength(phaseglassSub(solved, scaledOutgoing))).toBeLessThan(1e-8);
    expect(Math.abs(phaseglassLength(solved) - incomingSpeed)).toBeLessThan(1e-10);
  });

  it("rejects impossible active tangential momentum", () => {
    expect(() => phaseglassApplyPhaseGradient([1, 0, 0], [0, 1, 0], [2, 0, 0])).toThrow("impossible");
  });
});
