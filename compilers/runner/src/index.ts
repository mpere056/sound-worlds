import { parsePerformance, sampleCurve, solvePalette, type CameraKeyframe, type Song } from "@reaper-viz/core";
import { compileMotion } from "./motion.js";
import { compileTerrain, sampleTerrain } from "./terrain.js";
import type { RunnerPerformance } from "./types.js";

export * from "./motion.js";
export * from "./terrain.js";
export * from "./types.js";

export function compileRunner(song: Song): RunnerPerformance {
  const motion = compileMotion(song);
  const terrain = compileTerrain(song, motion.tAtX, motion.worldLength);
  const camera: CameraKeyframe[] = [];
  for (let t = 0; t <= song.meta.durationSec + 1e-9; t += 0.5) {
    const x = sampleCurve(motion.x, t);
    const y = sampleTerrain(terrain, x);
    camera.push({ t: Math.min(t, song.meta.durationSec), pos: [x + 4, y + 6, 10], zoom: 1, ease: "smoothstep" });
  }
  const performance: RunnerPerformance = {
    schemaVersion: 1,
    concept: "runner",
    seed: `${song.meta.seed}:runner`,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: 1080, h: 1920 },
    palette: solvePalette(null, song.tracks.map((track) => track.role)),
    camera,
    curves: { x: motion.x, speed: motion.speed, tAtX: motion.tAtX, energy: song.master.energy },
    events: [],
    statics: {
      worldLength: motion.worldLength,
      terrain,
      trajectory: { segments: [{ kind: "ground", t0: 0, t1: song.meta.durationSec }] },
      compilerVersion: 1,
    },
  };
  parsePerformance(performance);
  return performance;
}
