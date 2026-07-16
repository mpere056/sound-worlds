import { buildFixtureSong, type SongEvent } from "@reaper-viz/core";
import { describe, expect, it } from "vitest";
import { compileVortexLoom, compileVortexLoomPlan, groupVortexLoomDeadlines, sampleVortexLoomFiberPositions, sampleVortexLoomShuttle } from "./index.js";

function routeSong() {
  const song = buildFixtureSong({ bars: 4, patterns: [{ role: "lead", beats: [0], pitch: 60, kind: "note" }] });
  song.tracks[0]!.events = [
    { t: 0.55, dur: 0.24, pitch: 52, vel: 0.45, kind: "note" as const },
    { t: 1.12, dur: 0.18, pitch: 64, vel: 0.82, kind: "note" as const },
    { t: 1.78, dur: 0.31, pitch: 59, vel: 0.68, kind: "note" as const },
    { t: 2.52, dur: 0.2, pitch: 72, vel: 0.96, kind: "note" as const },
    { t: 3.34, dur: 0.4, pitch: 55, vel: 0.58, kind: "note" as const },
  ];
  song.meta.durationSec = 4.4;
  song.meta.contentEndSec = 3.8;
  return song;
}

describe("Vortex Loom compiler", () => {
  it("groups simultaneous notes deterministically", () => {
    const song = routeSong();
    const events: SongEvent[] = [
      { t: 0.5, dur: 0.2, pitch: 67, vel: 0.8, kind: "note" },
      { t: 0.51, dur: 0.1, pitch: 60, vel: 0.7, kind: "note" },
      { t: 1.4, dur: 0.3, pitch: 64, vel: 0.9, kind: "note" },
    ];
    const first = groupVortexLoomDeadlines(song.tracks[0]!, events, 0.025);
    const second = groupVortexLoomDeadlines(song.tracks[0]!, [events[2]!, events[0]!, events[1]!].sort((left, right) => left.t - right.t), 0.025);
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first[0]!.notes.map((note) => note.pitch)).toEqual([60, 67]);
  });

  it("compiles one finite inward annulus entry per grouped deadline", () => {
    const performance = compileVortexLoom(routeSong(), { fiberCount: 12, pointsPerFiber: 10 });
    expect(performance.statics.vortices).toHaveLength(5);
    expect(performance.statics.interactions).toHaveLength(5);
    expect(performance.statics.routeReport.exactEntryError).toBeLessThan(1e-8);
    expect(performance.statics.routeReport.maximumNumericalDivergence).toBeLessThan(2e-5);
    expect(performance.statics.routeReport.earlyEntryCount).toBe(0);
    expect(performance.statics.routeReport.violations).toEqual([]);
    for (const interaction of performance.statics.interactions) {
      expect(interaction.radialSpeed).toBeLessThan(0);
      expect(interaction.timingError).toBeLessThan(1e-8);
      expect(Number.isFinite(interaction.firstEntryTime)).toBe(true);
    }
  });

  it("samples shuttle and deterministic structural checkpoints at arbitrary times", () => {
    const performance = compileVortexLoom(routeSong(), { fiberCount: 10, pointsPerFiber: 8, checkpointCadenceSec: 0.2 });
    const shuttle = sampleVortexLoomShuttle(performance, 1.37);
    const first = sampleVortexLoomFiberPositions(performance, 1.37);
    const second = sampleVortexLoomFiberPositions(performance, 1.37);
    expect(shuttle.position.every(Number.isFinite)).toBe(true);
    expect(first).toEqual(second);
    expect(first).toHaveLength(10 * 8 * 2);
    expect(performance.statics.fiberCheckpoints.length).toBeGreaterThan(10);
  });

  it("is deterministic and validates bounded options", () => {
    const song = routeSong();
    expect(JSON.stringify(compileVortexLoom(song, { fiberCount: 9, pointsPerFiber: 9 }))).toBe(JSON.stringify(compileVortexLoom(song, { fiberCount: 9, pointsPerFiber: 9 })));
    expect(() => compileVortexLoomPlan(song, { chordEpsilonSec: 0.2 })).toThrow("epsilon");
    expect(() => compileVortexLoomPlan(song, { fixedStepSec: 1 })).toThrow("fixed step");
    expect(() => compileVortexLoomPlan(song, { sourceTrackId: "missing" })).toThrow("not found");
  });
});
