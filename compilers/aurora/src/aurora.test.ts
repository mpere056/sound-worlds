import { describe, expect, it } from "vitest";
import { buildFixtureSong, type SongEvent } from "@reaper-viz/core";
import { compileAuroraPlan, groupAuroraDeadlines } from "./index.js";

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
