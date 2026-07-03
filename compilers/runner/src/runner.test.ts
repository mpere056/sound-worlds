import { describe, expect, it } from "vitest";
import { buildFixtureSong, sampleCurve } from "@reaper-viz/core";
import { compileRunner, sampleTerrain } from "./index.js";

describe("Waveform Runner R1 compiler", () => {
  const song = buildFixtureSong({ name: "runner-fixture" });
  const performance = compileRunner(song);

  it("produces strictly increasing normalized x(t)", () => {
    const values = performance.curves.x!.values;
    for (let index = 1; index < values.length; index += 1) expect(values[index]).toBeGreaterThan(values[index - 1]!);
    expect(values[0]).toBe(0);
    expect(values[values.length - 1]).toBeCloseTo(performance.statics.worldLength);
  });

  it("keeps terrain within calibration and slope bounds", () => {
    const terrain = performance.statics.terrain;
    for (const height of terrain.heights) expect(height).toBeGreaterThanOrEqual(terrain.hMin - 1e-6);
    for (const height of terrain.heights) expect(height).toBeLessThanOrEqual(terrain.hMax + 1e-6);
    for (let index = 1; index < terrain.heights.length; index += 1) {
      const slope = Math.abs((terrain.heights[index]! - terrain.heights[index - 1]!) / terrain.dx);
      expect(slope).toBeLessThanOrEqual(terrain.maxSlope + 1e-5);
    }
  });

  it("prefers bass MIDI over the master-envelope fallback", () => {
    const bassSong = buildFixtureSong({
      name: "bass-staircase",
      patterns: [{ role: "bass", beats: [0, 1, 2, 3], pitch: 36, kind: "note" }],
    });
    bassSong.tracks[0]!.events.forEach((event, index) => { event.pitch = 36 + index % 4; });
    expect(compileRunner(bassSong).statics.terrain.source).toBe("bass-midi");
  });

  it("keeps the ground trajectory on the compiled terrain", () => {
    for (let t = 0; t <= song.meta.durationSec; t += 1 / 120) {
      const x = sampleCurve(performance.curves.x!, t);
      const y = sampleTerrain(performance.statics.terrain, x);
      expect(y).toBeGreaterThanOrEqual(sampleTerrain(performance.statics.terrain, x) - 1e-4);
    }
  });

  it("is byte-identical across recompiles", () => {
    expect(JSON.stringify(compileRunner(song))).toBe(JSON.stringify(compileRunner(song)));
  });
});
