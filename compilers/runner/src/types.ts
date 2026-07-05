import type { Performance } from "@reaper-viz/core";

export interface RunnerTerrain {
  dx: number;
  heights: number[];
  source: "bass-midi" | "bass-pitch" | "master-envelope";
  hMin: number;
  hMax: number;
  maxSlope: number;
}

export interface RunnerGroundSegment { kind: "ground"; t0: number; t1: number; }
export interface RunnerAirSegment {
  kind: "air";
  t0: number;
  t1: number;
  y0: number;
  y1: number;
  gravity: number;
  vy0: number;
  clearanceBoost: number;
  landingT: number;
}
export type RunnerTrajectorySegment = RunnerGroundSegment | RunnerAirSegment;
export interface RunnerJumpReport {
  landingT: number;
  takeoffT: number;
  durationBeats: number;
  clearanceBoost: number;
  source: string;
}

export interface RunnerPoint { x: number; y: number; }
export interface RunnerGlyph {
  id: string;
  source: "midi" | "audio-activity";
  role: string;
  pitch: number | null;
  spawnPos: RunnerPoint;
  mergePos: RunnerPoint;
  mergeT: number;
  beamStartT: number;
  mode: "beam" | "sparkle";
  colorIndex: number;
}

export interface RunnerStatics extends Record<string, unknown> {
  worldLength: number;
  terrain: RunnerTerrain;
  trajectory: { segments: RunnerTrajectorySegment[] };
  jumpSource: string;
  jumpReport: RunnerJumpReport[];
  glyphs: RunnerGlyph[];
  glyphSource: "midi" | "audio-activity" | "none";
  compilerVersion: number;
}

export interface RunnerPerformance extends Performance {
  concept: "runner";
  statics: RunnerStatics;
}
