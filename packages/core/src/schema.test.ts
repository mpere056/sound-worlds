import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "./fixtures.js";
import { parsePerformance, parseSong, parseTuning } from "./schema.js";

describe("stage schemas", () => {
  it("round-trips a fixture song", () => {
    expect(parseSong(buildFixtureSong()).schemaVersion).toBe(1);
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

  it("accepts flat aesthetic tuning values", () => {
    expect(parseTuning({ glow: 0.5, night: true, label: "final" })).toEqual({ glow: 0.5, night: true, label: "final" });
  });
});
