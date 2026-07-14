import { describe, expect, it } from "vitest";
import type { PhaseglassMembrane } from "@reaper-viz/compiler-phaseglass";
import { PHASEGLASS_RAYMARCH_SCALE, PHASEGLASS_VOLUME_STEPS, PHASEGLASS_VISIBLE_MEMBRANES, samplePhaseglassAnticipation, samplePhaseglassMusicalState } from "./index.js";

function membrane(t: number, pitch: number, energy: number): PhaseglassMembrane {
  return {
    id: `membrane:${t}`,
    deadlineId: `deadline:${t}`,
    t,
    center: [0, 0, t],
    normal: [0, 0, 1],
    axisU: [1, 0, 0],
    axisV: [0, 1, 0],
    incomingDirection: [0, 0, 1],
    outgoingDirection: [0.2, 0, 0.98],
    phaseGradient: [1, 0, 0],
    radius: 0.7,
    thickness: 0.045,
    pitch,
    energy,
    duration: 0.2,
    color: "#ffffff",
  };
}

describe("Phaseglass shader budget", () => {
  it("keeps the first optical field within its planned mobile-shaped budget", () => {
    expect(PHASEGLASS_RAYMARCH_SCALE).toBe(0.5);
    expect(PHASEGLASS_VISIBLE_MEMBRANES).toBeLessThanOrEqual(8);
    expect(PHASEGLASS_VOLUME_STEPS).toBeLessThanOrEqual(52);
  });
});

describe("Phaseglass temporal field", () => {
  it("creates a continuous three-second vacancy before filling a membrane", () => {
    expect(samplePhaseglassAnticipation(3.1).vacancy).toBe(0);
    expect(samplePhaseglassAnticipation(1.5).vacancy).toBeGreaterThan(0.45);
    expect(samplePhaseglassAnticipation(0.2).fill).toBeGreaterThan(0.8);
    expect(samplePhaseglassAnticipation(0).fill).toBe(1);
    expect(Math.abs(samplePhaseglassAnticipation(0).fill - samplePhaseglassAnticipation(-1e-6).fill)).toBeLessThan(1e-9);
  });

  it("accumulates quick notes as phrase pressure instead of resetting", () => {
    const membranes = [membrane(0, 48, 0.5), membrane(0.15, 60, 0.8), membrane(0.3, 72, 0.95)];
    const boundaryBefore = samplePhaseglassMusicalState(membranes, 0.15 - 1e-6);
    const boundaryAt = samplePhaseglassMusicalState(membranes, 0.15);
    const dense = samplePhaseglassMusicalState(membranes, 0.36);
    const quiet = samplePhaseglassMusicalState(membranes, 1.8);
    expect(Math.abs(boundaryAt.pitch - boundaryBefore.pitch)).toBeLessThan(0.001);
    expect(dense.pressure).toBeGreaterThan(boundaryAt.pressure);
    expect(dense.activity).toBeGreaterThan(quiet.activity);
    expect(quiet.silence).toBeGreaterThan(dense.silence);
  });
});
