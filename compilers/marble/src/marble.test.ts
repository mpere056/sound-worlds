import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compileMarble, sampleMarblePath } from "./index.js";

describe("Marble Music compiler", () => {
  it("maps every selected note to an exact hit", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], pitch: 48, kind: "note" }] });
    const performance = compileMarble(song);
    expect(performance.concept).toBe("marble");
    expect(performance.statics.source.noteCount).toBe(8);
    expect(performance.statics.impacts).toHaveLength(8);
    for (const impact of performance.statics.impacts) {
      const event = performance.events.find((candidate) => candidate.type === "marble.impact" && candidate.params.noteIndex === impact.noteIndex);
      expect(event).toBeDefined();
      expect(event!.params.hitT).toBe(impact.t);
    }
    expect(JSON.stringify(compileMarble(song))).toBe(JSON.stringify(compileMarble(song)));
  });

  it("classifies dense notes as local mechanisms instead of dropping them", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 0.1, 0.18, 0.32, 1], pitch: 72, kind: "note" }] });
    const performance = compileMarble(song);
    expect(performance.statics.impacts).toHaveLength(5);
    expect(performance.statics.clusters.some((cluster) => cluster.kind === "rattle" || cluster.kind === "cascade")).toBe(true);
    expect(performance.statics.diagnostics.impossibleGaps.length).toBeGreaterThan(0);
    expect(performance.statics.diagnostics.droppedNotes).toBe(0);
  });

  it("emits a continuous path and tail coverage", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "keys", beats: [0, 1, 2, 3], pitch: 55, kind: "note" }] });
    const performance = compileMarble(song);
    const path = performance.statics.path;
    expect(path.length).toBeGreaterThan(1);
    for (let index = 1; index < path.length; index += 1) {
      expect(path[index]!.t0).toBeGreaterThanOrEqual(path[index - 1]!.t0);
    }
    const pose = sampleMarblePath(path, performance.durationSec);
    expect(pose.pos.every(Number.isFinite)).toBe(true);
    expect(performance.statics.tail.audioEndT).toBe(performance.durationSec);
  });

  it("authors camera keys from selected target timing through the tail", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "keys", beats: [0, 0.5, 1, 1.5, 4, 5], pitch: 50, kind: "note" }] });
    const performance = compileMarble(song);
    expect(performance.camera.length).toBeGreaterThan(3);
    expect(performance.camera[0]!.t).toBeLessThanOrEqual(performance.statics.impacts[0]!.t);
    expect(performance.camera[performance.camera.length - 1]!.t).toBe(performance.durationSec);
    expect(performance.camera[performance.camera.length - 1]!.zoom).toBeLessThan(performance.camera[1]!.zoom);
    for (let index = 1; index < performance.camera.length; index += 1) {
      expect(performance.camera[index]!.t).toBeGreaterThanOrEqual(performance.camera[index - 1]!.t);
      expect(performance.camera[index]!.pos.every(Number.isFinite)).toBe(true);
    }
  });
});
