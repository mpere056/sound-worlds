import { describe, expect, it } from "vitest";
import { buildFixtureSong, type SongEvent } from "@reaper-viz/core";
import { compileAurora, compileAuroraPlan, groupAuroraDeadlines, sampleAuroraParticle } from "./index.js";
import { auroraLength, auroraSub } from "./physics.js";

describe("Aurora Cyclotron A0 compiler", () => {
  it("groups one deterministic deadline per distinct note time", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0], pitch: 60, kind: "note" }] });
    song.tracks[0]!.events = [
      { t: 0.5, dur: 0.2, pitch: 60, vel: 0.6, kind: "note" },
      { t: 0.51, dur: 0.1, pitch: 67, vel: 0.9, kind: "note" },
      { t: 1.25, dur: 0.3, pitch: 64, vel: 0.8, kind: "note" },
    ];
    const plan = compileAuroraPlan(song);
    expect(plan.deadlines).toHaveLength(2);
    expect(plan.deadlines[0]!.notes.map((note) => note.pitch)).toEqual([60, 67]);
    expect(plan.deadlines[0]!.representativePitch).toBe(63.5);
    expect(plan.report.sourceNoteCount).toBe(3);
    expect(plan.report.compoundDeadlineCount).toBe(1);
    expect(plan.report.finalDeadlineSec).toBe(1.25);
    expect(plan.report.idealFieldModel).toBe(true);
  });

  it("is byte-deterministic under shuffled event input", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "lead", beats: [0], pitch: 60, kind: "note" }] });
    const events: SongEvent[] = [
      { t: 1.5, dur: 0.3, pitch: 64, vel: 0.9, kind: "note" },
      { t: 0.5, dur: 0.2, pitch: 67, vel: 0.8, kind: "note" },
      { t: 0.5, dur: 0.1, pitch: 60, vel: 0.7, kind: "note" },
    ];
    song.tracks[0]!.events = events;
    const first = JSON.stringify(compileAuroraPlan(song));
    song.tracks[0]!.events = [events[1]!, events[2]!, events[0]!];
    expect(JSON.stringify(compileAuroraPlan(song))).toBe(first);
  });

  it("supports manual source selection and diagnoses missing note data", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [
      { role: "drums", beats: [0, 1], kind: "onset" },
      { role: "synth", beats: [0, 1], pitch: 62, kind: "note" },
    ] });
    expect(compileAuroraPlan(song, { sourceTrackId: song.tracks[1]!.id }).report.sourceTrackId).toBe(song.tracks[1]!.id);
    expect(() => compileAuroraPlan(song, { sourceTrackId: song.tracks[0]!.id })).toThrow("has no MIDI notes");
    song.tracks[1]!.events = [];
    expect(() => compileAuroraPlan(song)).toThrow("requires at least one note-bearing track");
  });

  it("validates physical options and chord epsilon", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0], pitch: 60, kind: "note" }] });
    expect(() => compileAuroraPlan(song, { mass: 0 })).toThrow("mass");
    expect(() => compileAuroraPlan(song, { charge: 0 })).toThrow("charge");
    expect(() => compileAuroraPlan(song, { maxMagneticField: Number.NaN })).toThrow("magnetic");
    expect(() => compileAuroraPlan(song, { chordEpsilonSec: 0.2 })).toThrow("epsilon");
  });

  it("keeps grouping independent from source event mutation", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "piano", beats: [0], pitch: 60, kind: "note" }] });
    const notes = [...song.tracks[0]!.events];
    const deadlines = groupAuroraDeadlines(song.tracks[0]!, notes, 0.025);
    notes[0]!.pitch = 90;
    expect(deadlines[0]!.notes[0]!.pitch).toBe(60);
  });
});

describe("Aurora Cyclotron A2 route compiler", () => {
  function routeSong() {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "lead", beats: [0], pitch: 60, kind: "note" }] });
    song.tracks[0]!.events = [
      { t: 0.4, dur: 0.2, pitch: 60, vel: 0.55, kind: "note" as const },
      { t: 0.85, dur: 0.2, pitch: 67, vel: 0.8, kind: "note" as const },
      { t: 1.3, dur: 0.2, pitch: 64, vel: 0.7, kind: "note" as const },
      { t: 1.9, dur: 0.2, pitch: 72, vel: 0.95, kind: "note" as const },
    ];
    return song;
  }

  it("places one exact coil-center crossing on every grouped deadline", () => {
    const performance = compileAurora(routeSong());
    expect(performance.statics.coils).toHaveLength(4);
    expect(performance.statics.routeReport.deadlineCount).toBe(4);
    expect(performance.statics.routeReport.exactCrossingError).toBe(0);
    expect(performance.statics.routeReport.occupancyViolations).toEqual([]);
    expect(performance.statics.routeReport.minimumParticleClearance).toBeGreaterThan(0.025);
    expect(performance.statics.routeReport.minimumCoilSurfaceClearance).toBeGreaterThan(0.025);
    for (const [index, coil] of performance.statics.coils.entries()) {
      const sampled = sampleAuroraParticle(performance.statics.route, coil.t);
      expect(auroraLength(auroraSub(sampled.position, coil.center))).toBeLessThan(1e-10);
      expect(performance.statics.route[index]!.deadlineId).toBe(coil.deadlineId);
    }
  });

  it("keeps every authored segment within the magnetic-field bound", () => {
    const performance = compileAurora(routeSong(), { charge: -0.7, mass: 1.3, maxMagneticField: 3.5 });
    expect(performance.statics.routeReport.maximumField).toBeLessThanOrEqual(3.5 + 1e-12);
    expect(performance.statics.route.filter((segment) => segment.kind === "deadline").every((segment) => segment.fieldMagnitude <= 3.5)).toBe(true);
  });

  it("is deterministic and uses genuine depth-oriented candidates", () => {
    const first = compileAurora(routeSong());
    const second = compileAurora(routeSong());
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    const depthTravel = first.statics.route.reduce((sum, segment) => sum + Math.abs(segment.end.position[2] - segment.start.position[2]), 0);
    expect(depthTravel).toBeGreaterThan(0.5);
    expect(first.statics.routeReport.familyCounts.depth + first.statics.routeReport.familyCounts.inward).toBeGreaterThan(0);
  });

  it("continues inertially after the final musical crossing", () => {
    const performance = compileAurora(routeSong());
    const tail = performance.statics.route.at(-1)!;
    expect(tail.kind).toBe("tail");
    const sampled = sampleAuroraParticle(performance.statics.route, performance.durationSec);
    expect(sampled.position).toEqual(tail.end.position);
  });
});
