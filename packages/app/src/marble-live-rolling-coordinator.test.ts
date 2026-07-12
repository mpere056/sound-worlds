import { describe, expect, it } from "vitest";
import { MarbleLiveRollingCoordinator } from "./marble-live-rolling-coordinator.js";
import type { MarbleLiveNoteIntent, MarbleLivePlatformPlacement } from "./marble-live-solver-protocol.js";

function notes(count: number): MarbleLiveNoteIntent[] {
  return Array.from({ length: count }, (_, index) => ({
    platformId: `live-platform:${index}`,
    sequence: index,
    pitch: 60 + index,
    velocity: 0.7,
    targetImpactTime: index + 1,
  }));
}

function placement(platformId: string, targetImpactTime: number, clearance = 0.1): MarbleLivePlatformPlacement {
  return {
    platformId,
    position: [0, -targetImpactTime, 0],
    contactPosition: [0, -targetImpactTime + 0.2, 0],
    rotation: [0, 0, 0],
    size: [1, 0.2, 0.5],
    restitution: 0.7,
    targetImpactTime,
    clearance,
  };
}

const context = (count: number) => ({
  motionMix: { leftRight: 20, upDown: 20, frontBack: 60 },
  marble: { position: [0, 0, 0] as [number, number, number], velocity: [0, -1, 0] as [number, number, number], radius: 0.24, simulationTime: 0 },
  notes: notes(count),
  reservedColliders: [],
});

describe("Marble live rolling coordinator", () => {
  it("builds a worker request for only the certainty window", () => {
    const coordinator = new MarbleLiveRollingCoordinator(10, 5);
    const request = coordinator.request(context(10))!;
    expect(request.notes).toHaveLength(5);
    expect(request.notes.map((note) => note.platformId)).toEqual(notes(5).map((note) => note.platformId));
  });

  it("certifies a complete collision-safe result and returns its impact placement", () => {
    const coordinator = new MarbleLiveRollingCoordinator(6, 5);
    const request = coordinator.request(context(6))!;
    coordinator.apply({
      type: "live-window-solved",
      requestId: request.requestId,
      solveGeneration: request.solveGeneration,
      placements: request.notes.map((note) => placement(note.platformId, note.targetImpactTime)),
      solveMs: 4,
    });
    expect(coordinator.consumeNext("live-platform:0").targetImpactTime).toBe(1);
    expect(coordinator.request(context(6))!.notes.map((note) => note.platformId)).toEqual(["live-platform:5"]);
  });

  it("rejects incomplete, intersecting, and stale worker results", () => {
    const coordinator = new MarbleLiveRollingCoordinator(5);
    const request = coordinator.request(context(5))!;
    expect(() => coordinator.apply({ type: "live-window-solved", requestId: request.requestId, solveGeneration: request.solveGeneration, placements: [], solveMs: 1 })).toThrow("mismatched");
    expect(() => coordinator.apply({
      type: "live-window-solved",
      requestId: request.requestId,
      solveGeneration: request.solveGeneration,
      placements: request.notes.map((note) => placement(note.platformId, note.targetImpactTime, note.sequence === 2 ? -0.01 : 0.1)),
      solveMs: 1,
    })).toThrow("intersecting");
    coordinator.invalidatePending();
    expect(() => coordinator.apply({
      type: "live-window-solved",
      requestId: request.requestId,
      solveGeneration: request.solveGeneration,
      placements: request.notes.map((note) => placement(note.platformId, note.targetImpactTime)),
      solveMs: 1,
    })).toThrow("Unknown or stale");
  });
});
