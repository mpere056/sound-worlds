import { describe, expect, it } from "vitest";
import { buildFixtureSong, type SongEvent } from "@reaper-viz/core";
import { compileBrickBreakerPlan } from "./index.js";

describe("Brick Breaker B0 compiler", () => {
  it("creates exactly one future brick per distinct note deadline", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 0.5, 1, 2], pitch: 60, kind: "note" }] });
    const plan = compileBrickBreakerPlan(song);
    expect(plan.report.sourceNoteCount).toBe(4);
    expect(plan.report.groupedHitCount).toBe(4);
    expect(plan.report.generatedBrickCount).toBe(4);
    expect(plan.hitGroups.at(-1)!.t).toBe(song.tracks[0]!.events.at(-1)!.t);
  });

  it("groups chords and near-epsilon notes against the group anchor", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "piano", beats: [0], pitch: 60, kind: "note" }] });
    song.tracks[0]!.events = [
      { t: 1, dur: 0.2, pitch: 60, vel: 0.5, kind: "note" },
      { t: 1.01, dur: 0.3, pitch: 67, vel: 0.9, kind: "note" },
      { t: 1.024, dur: 0.1, pitch: 64, vel: 0.7, kind: "note" },
      { t: 1.026, dur: 0.2, pitch: 72, vel: 0.8, kind: "note" },
    ];
    const plan = compileBrickBreakerPlan(song, { chordEpsilonSec: 0.025 });
    expect(plan.hitGroups).toHaveLength(2);
    expect(plan.hitGroups[0]!.notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
    expect(plan.hitGroups[0]!.representativePitch).toBe(64);
    expect(plan.hitGroups[0]!.energy).toBe(0.9);
    expect(plan.report.compoundGroupCount).toBe(1);
    expect(plan.report.chordCellCount).toBe(4);
  });

  it("is byte-deterministic when source events arrive in a different order", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "lead", beats: [0], pitch: 60, kind: "note" }] });
    const events: SongEvent[] = [
      { t: 0.5, dur: 0.2, pitch: 67, vel: 0.8, kind: "note" },
      { t: 0.5, dur: 0.1, pitch: 60, vel: 0.7, kind: "note" },
      { t: 1.5, dur: 0.3, pitch: 64, vel: 0.9, kind: "note" },
    ];
    song.tracks[0]!.events = events;
    const first = JSON.stringify(compileBrickBreakerPlan(song));
    song.tracks[0]!.events = [events[2]!, events[0]!, events[1]!];
    expect(JSON.stringify(compileBrickBreakerPlan(song))).toBe(first);
  });

  it("selects a manual source and diagnoses missing note data", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [
      { role: "drums", beats: [0, 1], kind: "onset" },
      { role: "keys", beats: [0, 1], pitch: 62, kind: "note" },
    ] });
    expect(compileBrickBreakerPlan(song, { sourceTrackId: song.tracks[1]!.id }).report.sourceTrackId).toBe(song.tracks[1]!.id);
    expect(() => compileBrickBreakerPlan(song, { sourceTrackId: song.tracks[0]!.id })).toThrow("has no MIDI notes");
    song.tracks[1]!.events = [];
    expect(() => compileBrickBreakerPlan(song)).toThrow("requires at least one note-bearing track");
  });

  it("reports dense and long gaps without retiming the final note", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0], pitch: 60, kind: "note" }] });
    song.tracks[0]!.events = [
      { t: 0.2, dur: 0.1, pitch: 60, vel: 0.6, kind: "note" },
      { t: 0.3, dur: 0.1, pitch: 62, vel: 0.7, kind: "note" },
      { t: 1.6, dur: 0.1, pitch: 64, vel: 0.8, kind: "note" },
    ];
    const plan = compileBrickBreakerPlan(song);
    expect(plan.report.gapHistogram).toEqual({ dense: 1, short: 0, medium: 0, long: 1 });
    expect(plan.report.minimumGapSec).toBeCloseTo(0.1, 10);
    expect(plan.report.finalHitSec).toBe(1.6);
    expect(plan.hitGroups.at(-1)!.t).toBe(1.6);
  });

  it("validates chord epsilon and board dimensions", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0], pitch: 60, kind: "note" }] });
    expect(() => compileBrickBreakerPlan(song, { chordEpsilonSec: 0.2 })).toThrow("epsilon");
    expect(() => compileBrickBreakerPlan(song, { board: { width: 0, height: 10 } })).toThrow("dimensions");
  });
});
