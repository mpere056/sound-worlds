import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compileMarble } from "@reaper-viz/compiler-marble";
import { sampleMarbleCamera } from "./index.js";

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe("Marble camera", () => {
  it("stays continuous through impact tangent changes", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "keys", beats: [0, 1, 2.5, 4, 6], pitch: 55, kind: "note" }] });
    const performance = compileMarble(song);
    for (const impact of performance.statics.impacts) {
      const before = sampleMarbleCamera(performance.statics.path, impact.t - 0.001, 0.88);
      const after = sampleMarbleCamera(performance.statics.path, impact.t + 0.001, 0.88);
      expect(distance(before.position, after.position)).toBeLessThan(0.02);
      expect(distance(before.lookAt, after.lookAt)).toBeLessThan(0.02);
      expect(Math.abs(before.zoom - after.zoom)).toBeLessThan(0.0001);
    }
  });

  it("keeps a stable camera distance and zoom throughout the route", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "keys", beats: [0, 1, 2.5, 4, 6], pitch: 55, kind: "note" }] });
    const performance = compileMarble(song);
    const samples = Array.from({ length: 121 }, (_, index) => sampleMarbleCamera(performance.statics.path, performance.durationSec * index / 120, 0.88));
    const zooms = samples.map((sample) => sample.zoom);
    expect(Math.max(...zooms) - Math.min(...zooms)).toBeLessThan(0.0001);
    for (let index = 1; index < samples.length; index += 1) {
      expect(distance(samples[index - 1]!.position, samples[index]!.position)).toBeLessThan(0.32);
    }
  });
});
