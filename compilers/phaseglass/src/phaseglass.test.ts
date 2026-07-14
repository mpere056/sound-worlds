import { buildFixtureSong, type SongEvent } from "@reaper-viz/core";
import { describe, expect, it } from "vitest";
import { compilePhaseglass, compilePhaseglassPlan, samplePhaseglassRay } from "./index.js";
import { phaseglassDistance } from "./physics.js";

function routeSong() {
  const song = buildFixtureSong({ bars: 3, patterns: [{ role: "lead", beats: [0], pitch: 60, kind: "note" }] });
  song.tracks[0]!.events = [
    { t: 0.42, dur: 0.24, pitch: 52, vel: 0.45, kind: "note" as const },
    { t: 0.86, dur: 0.18, pitch: 64, vel: 0.82, kind: "note" as const },
    { t: 1.28, dur: 0.31, pitch: 59, vel: 0.68, kind: "note" as const },
    { t: 1.82, dur: 0.2, pitch: 72, vel: 0.96, kind: "note" as const },
    { t: 2.47, dur: 0.4, pitch: 55, vel: 0.58, kind: "note" as const },
  ];
  return song;
}

describe("Phaseglass compiler", () => {
  it("groups chords deterministically and selects a note-bearing source", () => {
    const song = routeSong();
    const events: SongEvent[] = [
      { t: 0.5, dur: 0.2, pitch: 67, vel: 0.8, kind: "note" },
      { t: 0.51, dur: 0.1, pitch: 60, vel: 0.7, kind: "note" },
      { t: 1.4, dur: 0.3, pitch: 64, vel: 0.9, kind: "note" },
    ];
    song.tracks[0]!.events = events;
    const first = compilePhaseglassPlan(song);
    song.tracks[0]!.events = [events[2]!, events[0]!, events[1]!];
    const second = compilePhaseglassPlan(song);
    expect(first.deadlines).toHaveLength(2);
    expect(first.deadlines[0]!.notes.map((note) => note.pitch)).toEqual([60, 67]);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("places one exact finite membrane on every note deadline at constant speed", () => {
    const performance = compilePhaseglass(routeSong());
    expect(performance.statics.membranes).toHaveLength(5);
    expect(performance.statics.routeReport.exactCrossingError).toBe(0);
    expect(performance.statics.routeReport.maximumSpeedError).toBe(0);
    expect(performance.statics.routeReport.earlyCrossingCount).toBe(0);
    expect(performance.statics.routeReport.occupancyViolations).toEqual([]);
    for (const membrane of performance.statics.membranes) {
      expect(phaseglassDistance(samplePhaseglassRay(performance.statics.route, membrane.t).position, membrane.center)).toBeLessThan(1e-10);
    }
  });

  it("uses genuine three-dimensional turns and continues after the last crossing", () => {
    const performance = compilePhaseglass(routeSong());
    const directions = performance.statics.membranes.map((membrane) => membrane.outgoingDirection);
    expect(Math.max(...directions.map((direction) => Math.abs(direction[2])))).toBeGreaterThan(0.25);
    expect(Math.max(...directions.map((direction) => Math.abs(direction[1])))).toBeGreaterThan(0.2);
    const tail = performance.statics.route.at(-1)!;
    expect(tail.kind).toBe("tail");
    expect(samplePhaseglassRay(performance.statics.route, performance.durationSec).position).toEqual(tail.end.position);
  });

  it("validates source and physical options", () => {
    const song = routeSong();
    expect(() => compilePhaseglassPlan(song, { signalSpeed: 0 })).toThrow("speed");
    expect(() => compilePhaseglassPlan(song, { chordEpsilonSec: 0.2 })).toThrow("epsilon");
    expect(() => compilePhaseglassPlan(song, { sourceTrackId: "missing" })).toThrow("not found");
  });

  it("keeps a 100-note dense phrase collision-free within the compiler budget", () => {
    const song = buildFixtureSong({ bars: 30, patterns: [{ role: "lead", beats: [0], pitch: 60, kind: "note" }] });
    song.tracks[0]!.events = Array.from({ length: 100 }, (_, index) => ({
      t: 0.2 + index * 0.105,
      dur: 0.08 + (index % 5) * 0.04,
      pitch: 42 + (index * 7) % 37,
      vel: 0.35 + (index % 9) * 0.07,
      kind: "note" as const,
    }));
    song.meta.durationSec = 11.2;
    song.meta.contentEndSec = 10.7;
    const startedAt = performance.now();
    const compiled = compilePhaseglass(song);
    const elapsedMs = performance.now() - startedAt;
    expect(compiled.statics.routeReport.deadlineCount).toBe(100);
    expect(compiled.statics.routeReport.earlyCrossingCount).toBe(0);
    expect(compiled.statics.routeReport.occupancyViolations).toEqual([]);
    expect(compiled.statics.routeReport.minimumMembraneClearance).toBeGreaterThan(0.1);
    expect(elapsedMs).toBeLessThan(250);
  });
});
