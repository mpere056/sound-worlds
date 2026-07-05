import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "./fixtures.js";
import { parsePerformance, parseSong, parseTuning } from "./schema.js";

describe("stage schemas", () => {
  it("round-trips a fixture song", () => {
    expect(parseSong(buildFixtureSong()).schemaVersion).toBe(1);
  });

  it("accepts optional per-track gain metadata", () => {
    const song = buildFixtureSong();
    song.tracks[0]!.gain = { peakRms: 0.42, meanRms: 0.12 };
    expect(parseSong(song).tracks[0]!.gain?.peakRms).toBe(0.42);
  });

  it("rejects unsorted performance events", () => {
    const performance = {
      schemaVersion: 1, concept: "fixture", seed: "fixture", durationSec: 2, fps: 60,
      resolution: { w: 1080, h: 1920 }, palette: { bg: "#000000", roles: {} }, camera: [], curves: {},
      events: [
        { t: 1, type: "fixture.hit", layer: "main", params: {} },
        { t: 0, type: "fixture.hit", layer: "main", params: {} },
      ], statics: {},
    };
    expect(() => parsePerformance(performance)).toThrow(/sorted/);
  });

  it("allows world-space values in performance curves", () => {
    const performance = {
      schemaVersion: 1, concept: "runner", seed: "fixture", durationSec: 2, fps: 60,
      resolution: { w: 1080, h: 1920 }, palette: { bg: "#000000", roles: {} }, camera: [],
      curves: { x: { t0: 0, dt: 1, values: [0, 24, 48] } }, events: [], statics: {},
    };
    expect(parsePerformance(performance).curves.x?.values[2]).toBe(48);
  });

  it("accepts optional normalized camera anchors", () => {
    const performance = {
      schemaVersion: 1, concept: "metro", seed: "fixture", durationSec: 2, fps: 60,
      resolution: { w: 1080, h: 1920 }, palette: { bg: "#000000", roles: {} },
      camera: [{ t: 0, pos: [0, 0, 10], zoom: 1, anchor: [0.5, 0.65] }],
      curves: {}, events: [], statics: {},
    };
    expect(parsePerformance(performance).camera[0]?.anchor).toEqual([0.5, 0.65]);
  });

  it("accepts flat aesthetic tuning values", () => {
    expect(parseTuning({ glow: 0.5, night: true, label: "final" })).toEqual({ glow: 0.5, night: true, label: "final" });
  });
});
