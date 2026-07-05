import { describe, expect, it } from "vitest";
import { buildFixtureSong, sampleCurve } from "@reaper-viz/core";
import { airHeight, compileMotion, compileRunner, compileTerrain, evaluateTrajectory, sampleTerrain, solveJump } from "./index.js";

describe("Waveform Runner R3 compiler", () => {
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

  it("matches the jump solver numeric audit vectors", () => {
    const tempos = [
      { bpm: 120, beatDuration: 0.5, gravity: 102.4 },
      { bpm: 96, beatDuration: 0.625, gravity: 65.536 },
      { bpm: 150, beatDuration: 0.4, gravity: 160 },
    ];
    for (const tempo of tempos) {
      expect(solveJump(0, tempo.beatDuration, tempo.beatDuration, 0, 0).gravity).toBeCloseTo(tempo.gravity);
    }

    const cases = [
      { name: "flat one beat", y0: 0, y1: 0, duration: 0.5, vy0: 25.6, apexT: 0.25, apexY: 3.2 },
      { name: "flat half beat", y0: 0, y1: 0, duration: 0.25, vy0: 12.8, apexT: 0.125, apexY: 0.8 },
      { name: "up step", y0: 0, y1: 2, duration: 0.5, vy0: 29.6, apexT: 29.6 / 102.4, apexY: 4.278125 },
      { name: "down step", y0: 2, y1: 0, duration: 0.5, vy0: 21.6, apexT: 21.6 / 102.4, apexY: 4.278125 },
    ];
    for (const vector of cases) {
      const jump = solveJump(0, vector.duration, 0.5, vector.y0, vector.y1);
      expect(jump.vy0, vector.name).toBeCloseTo(vector.vy0);
      expect(airHeight(jump, vector.duration).y, vector.name).toBeCloseTo(vector.y1, 9);
      expect(airHeight(jump, vector.apexT).y, vector.name).toBeCloseTo(vector.apexY);
    }
  });

  it("calibrates motion length and inverse time-at-x for constant energy", () => {
    const longSong = buildFixtureSong({ bars: 75 });
    const motion = compileMotion(longSong);
    expect(longSong.meta.durationSec).toBe(150);
    expect(motion.worldLength).toBe(150);
    expect(sampleCurve(motion.x, 75)).toBeCloseTo(75, 6);
    for (const x of [0, 37.5, 75, 112.5, 149.75]) {
      expect(sampleCurve(motion.tAtX, x)).toBeCloseTo(x, 6);
    }
  });

  it("calibrates bass-midi terrain percentiles before applying slope clamps", () => {
    const bassSong = buildFixtureSong({ bars: 16, patterns: [{ role: "bass", beats: [], kind: "note" }] });
    bassSong.tracks[0]!.events = [
      { t: 0, dur: 10, pitch: 40, vel: 1, kind: "note" },
      { t: 10, dur: 10, pitch: 52, vel: 1, kind: "note" },
      { t: 20, dur: 11, pitch: 64, vel: 1, kind: "note" },
    ];
    const worldLength = 30;
    const tAtX = { t0: 0, dt: 0.25, values: Array.from({ length: 121 }, (_, index) => index * 0.25 + 0.01) };
    const terrain = compileTerrain(bassSong, tAtX, worldLength);
    expect(terrain.source).toBe("bass-midi");
    expect(sampleTerrain(terrain, 5)).toBeCloseTo(0, 2);
    expect(sampleTerrain(terrain, 15)).toBeCloseTo(7, 2);
    expect(sampleTerrain(terrain, 25)).toBeCloseTo(14, 2);
    for (let index = 1; index < terrain.heights.length; index += 1) {
      expect(Math.abs((terrain.heights[index]! - terrain.heights[index - 1]!) / terrain.dx)).toBeLessThanOrEqual(terrain.maxSlope + 1e-6);
    }
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

  it("merges MIDI glyphs at the exact compiled runner pose", () => {
    const midiSong = buildFixtureSong({ bars: 1, patterns: [{ role: "lead", beats: [1, 2], pitch: 72, kind: "note" }] });
    const output = compileRunner(midiSong);
    expect(output.statics.glyphSource).toBe("midi");
    expect(output.statics.glyphs.every((glyph) => glyph.role === "lead")).toBe(true);
    for (const glyph of output.statics.glyphs) {
      const pose = evaluateTrajectory(output.statics.trajectory.segments, glyph.mergeT, output.curves.x!, output.statics.terrain);
      expect(glyph.mergePos).toEqual({ x: pose.x, y: pose.y });
      const event = output.events.find((candidate) => candidate.params.glyphId === glyph.id);
      expect(event?.t).toBe(glyph.mergeT);
      expect(event?.params.hitT).toBe(glyph.mergeT);
    }
  });

  it("uses beat-synchronous audio glyphs when the export has no MIDI", () => {
    const output = compileRunner(buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [], kind: "note" }] }));
    expect(output.statics.glyphSource).toBe("audio-activity");
    expect(output.statics.glyphs.length).toBeGreaterThan(0);
    expect(output.statics.glyphs.every((glyph) => glyph.source === "audio-activity")).toBe(true);
    expect(output.statics.glyphs.every((glyph) => glyph.role === "keys")).toBe(true);
  });

  it("caps concurrent collection beams at six without dropping merge events", () => {
    const denseSong = buildFixtureSong({ bars: 1, patterns: [{ role: "lead", beats: [1], pitch: 60, kind: "note" }] });
    const seed = denseSong.tracks[0]!.events[0]!;
    denseSong.tracks[0]!.events = Array.from({ length: 10 }, (_, index) => ({ ...seed, pitch: 60 + index }));
    const output = compileRunner(denseSong);
    expect(output.statics.glyphs.filter((glyph) => glyph.mode === "beam")).toHaveLength(6);
    expect(output.statics.glyphs.filter((glyph) => glyph.mode === "sparkle")).toHaveLength(4);
    expect(output.events.filter((event) => event.type === "glyph.merge")).toHaveLength(10);
  });

  it("emits runner steps from kick events when percussion exists", () => {
    const output = compileRunner(buildFixtureSong({
      bars: 2,
      patterns: [
        { role: "kick", beats: [0, 2], kind: "onset" },
        { role: "lead", beats: [1], pitch: 72, kind: "note" },
      ],
    }));
    const steps = output.events.filter((event) => event.type === "runner.step");
    expect(steps.map((step) => step.t)).toEqual([0, 1, 2, 3]);
    expect(steps.every((step) => step.params.source === "kick-events")).toBe(true);
    expect(steps.map((step) => step.params.foot)).toEqual(["left", "right", "left", "right"]);
  });

  it("falls back to beat-grid runner steps without percussion", () => {
    const output = compileRunner(buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [], kind: "note" }] }));
    const steps = output.events.filter((event) => event.type === "runner.step");
    expect(steps.map((step) => step.t)).toEqual([0, 0.5, 1, 1.5]);
    expect(steps.every((step) => step.params.source === "beat-grid")).toBe(true);
  });
});
