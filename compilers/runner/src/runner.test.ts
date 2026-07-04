import { describe, expect, it } from "vitest";
import { buildFixtureSong, sampleCurve } from "@reaper-viz/core";
import { airHeight, compileRunner, evaluateTrajectory, sampleTerrain, solveJump } from "./index.js";

describe("Waveform Runner R2 compiler", () => {
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

  it("solves a flat one-beat jump with the configured apex", () => {
    const jump = solveJump(0, 0.5, 0.5, 0, 0);
    expect(jump.vy0).toBeCloseTo(jump.gravity * 0.25);
    expect(airHeight(jump, 0.25).y).toBeCloseTo(3.2);
    expect(airHeight(jump, 0.5).y).toBeCloseTo(0);
  });

  it("keeps emitted trajectories continuous and above terrain", () => {
    for (let t = 0; t <= song.meta.durationSec; t += 1 / 120) {
      const x = sampleCurve(performance.curves.x!, t);
      const pose = evaluateTrajectory(performance.statics.trajectory.segments, t, performance.curves.x!, performance.statics.terrain);
      expect(pose.y).toBeGreaterThanOrEqual(sampleTerrain(performance.statics.terrain, x) - 1e-4);
    }
    for (const segment of performance.statics.trajectory.segments) {
      const pose = evaluateTrajectory(performance.statics.trajectory.segments, segment.t1, performance.curves.x!, performance.statics.terrain);
      if (segment.kind === "air") expect(pose.y).toBeCloseTo(segment.y1, 5);
    }
  });

  it("lands exactly on hitT and falls back to downbeats without drums", () => {
    const fallbackSong = buildFixtureSong({ patterns: [{ role: "keys", beats: [], kind: "note" }] });
    const output = compileRunner(fallbackSong);
    expect(output.statics.jumpSource).toBe("bar-downbeats");
    expect(output.statics.jumpReport.length).toBeGreaterThan(0);
    for (const event of output.events.filter((candidate) => candidate.type === "jump.land")) {
      expect(event.t).toBe(event.params.hitT);
    }
  });

  it("is byte-identical across recompiles", () => {
    expect(JSON.stringify(compileRunner(song))).toBe(JSON.stringify(compileRunner(song)));
  });
});
