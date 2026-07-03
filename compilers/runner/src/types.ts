import type { Performance } from "@reaper-viz/core";

export interface RunnerTerrain {
  dx: number;
  heights: number[];
  source: "bass-midi" | "bass-pitch" | "master-envelope";
  hMin: number;
  hMax: number;
  maxSlope: number;
}

export interface RunnerStatics extends Record<string, unknown> {
  worldLength: number;
  terrain: RunnerTerrain;
  trajectory: { segments: Array<{ kind: "ground"; t0: number; t1: number }> };
  compilerVersion: number;
}

export interface RunnerPerformance extends Performance {
  concept: "runner";
  statics: RunnerStatics;
}
