import { describe, expect, it } from "vitest";
import type { PhaseglassMembrane, PhaseglassRouteSegment } from "@reaper-viz/compiler-phaseglass";
import { PHASEGLASS_FUTURE_PATH_COUNT, PHASEGLASS_RAYMARCH_SCALE, PHASEGLASS_VOLUME_STEPS, PHASEGLASS_VISIBLE_MEMBRANES, samplePhaseglassAnticipation, samplePhaseglassFuturePath, samplePhaseglassMusicalState, samplePhaseglassViewDirection } from "./index.js";

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
    expect(PHASEGLASS_FUTURE_PATH_COUNT).toBeLessThanOrEqual(8);
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

  it("uses note duration only to lengthen the post-crossing optical decay", () => {
    const short = samplePhaseglassAnticipation(-0.7, 0.45);
    const long = samplePhaseglassAnticipation(-0.7, 1.2);
    expect(long.fill).toBeGreaterThan(short.fill);
    expect(long.vacancy).toBe(short.vacancy);
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

function kinkedRoute(): PhaseglassRouteSegment[] {
  return [
    {
      id: "segment:0", kind: "deadline", deadlineId: "deadline:0", t0: 0, t1: 1,
      start: { position: [0, 0, 0], direction: [1, 0, 0], speed: 1 },
      end: { position: [1, 0, 0], direction: [1, 0, 0], speed: 1 },
    },
    {
      id: "segment:1", kind: "deadline", deadlineId: "deadline:1", t0: 1, t1: 2,
      start: { position: [1, 0, 0], direction: [0, 0, 1], speed: 1 },
      end: { position: [1, 0, 1], direction: [0, 0, 1], speed: 1 },
    },
    {
      id: "segment:tail", kind: "tail", t0: 2, t1: 4,
      start: { position: [1, 0, 1], direction: [0, 1, 0], speed: 1 },
      end: { position: [1, 2, 1], direction: [0, 1, 0], speed: 1 },
    },
  ];
}

describe("Phaseglass route presentation", () => {
  it("smooths the camera optical axis across an instantaneous phase turn", () => {
    const route = kinkedRoute();
    const before = samplePhaseglassViewDirection(route, 1 - 1e-5);
    const after = samplePhaseglassViewDirection(route, 1 + 1e-5);
    const dot = before[0] * after[0] + before[1] * after[1] + before[2] * after[2];
    expect(dot).toBeGreaterThan(0.999999);
    expect(before[0]).toBeGreaterThan(0.6);
    expect(before[2]).toBeGreaterThan(0.6);
  });

  it("samples a deterministic three-second future corridor from absolute time", () => {
    const route = kinkedRoute();
    const first = samplePhaseglassFuturePath(route, 0.5, 4);
    const second = samplePhaseglassFuturePath(route, 0.5, 4);
    expect(second).toEqual(first);
    expect(first).toHaveLength(PHASEGLASS_FUTURE_PATH_COUNT);
    expect(first[0]!.position).toEqual([0.5, 0, 0]);
    expect(first.at(-1)!.t).toBe(3.5);
    expect(first[0]!.strength).toBeGreaterThan(first.at(-1)!.strength);
  });
});
