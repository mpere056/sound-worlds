import { parsePerformance, sampleCurve, solvePalette, type CameraKeyframe, type Song } from "@reaper-viz/core";
import { compileMotion } from "./motion.js";
import { compileTerrain, sampleTerrain } from "./terrain.js";
import { compileJumps } from "./jumps.js";
import { compileGlyphs, compileNotePlatforms } from "./glyphs.js";
import { compileSteps } from "./steps.js";
import { compileStrata } from "./strata.js";
import { compileGates } from "./gates.js";
import { compileSectionPalettes } from "./section-palettes.js";
import { compileVocalHalo } from "./halo.js";
import type { RunnerPerformance } from "./types.js";

export * from "./motion.js";
export * from "./terrain.js";
export * from "./jumps.js";
export * from "./glyphs.js";
export * from "./steps.js";
export * from "./strata.js";
export * from "./gates.js";
export * from "./section-palettes.js";
export * from "./halo.js";
export * from "./types.js";

export function compileRunner(song: Song): RunnerPerformance {
  const motion = compileMotion(song);
  const terrain = compileTerrain(song, motion.tAtX, motion.worldLength);
  const strata = compileStrata(song, terrain, motion.tAtX, motion.worldLength);
  const jumps = compileJumps(song, motion.x, terrain);
  const glyphs = compileGlyphs(song, motion.x, terrain, jumps.segments);
  const notePlatforms = compileNotePlatforms(glyphs.glyphs, terrain);
  const steps = compileSteps(song);
  const gates = compileGates(song, motion.x, terrain);
  const palette = solvePalette(null, song.tracks.map((track) => track.role));
  const sectionPalettes = compileSectionPalettes(song, palette);
  const vocalHalo = compileVocalHalo(song);
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
    palette,
    camera,
    curves: { x: motion.x, speed: motion.speed, tAtX: motion.tAtX, energy: song.master.energy, vocalHalo: vocalHalo.curve },
    events: [...jumps.events, ...glyphs.events, ...steps, ...gates.events, ...sectionPalettes.events].sort((a, b) => a.t - b.t || a.type.localeCompare(b.type)),
    statics: {
      worldLength: motion.worldLength,
      terrain,
      strata,
      gates: gates.gates,
      sectionPalettes: sectionPalettes.palettes,
      trajectory: { segments: jumps.segments },
      jumpSource: jumps.source,
      jumpReport: jumps.reports,
      glyphs: glyphs.glyphs,
      notePlatforms,
      glyphSource: glyphs.source,
      vocalHaloSource: vocalHalo.source,
      compilerVersion: 3,
    },
  };
  parsePerformance(performance);
  return performance;
}
