import type { Performance, TimedCurve } from "@reaper-viz/core";

export type SpectralBloomModeKind = "radial" | "gradient" | "curl";

export interface SpectralBloomSpectrogram {
  schemaVersion: 1;
  kind: "spectral-bloom-master";
  t0: number;
  dt: number;
  bandsHz: number[];
  bands: number[][];
  phaseCos: number[][];
  flux: TimedCurve;
  centroid: TimedCurve;
  spread: TimedCurve;
  flatness: TimedCurve;
  normalization: { floorDb: number; ceilingDb: number };
}

export interface SpectralBloomMode {
  id: string;
  index: number;
  degree: number;
  order: number;
  kind: SpectralBloomModeKind;
  naturalFrequencyHz: number;
  dampingRatio: number;
  gain: number;
  bandCenter: number;
  bandWidth: number;
  polarity: -1 | 1;
}

export interface SpectralBloomTopology {
  surfaceParticles: number;
  interiorParticles: number;
  transientReserve: number;
  topologySeed: string;
}

export interface SpectralBloomCompileReport {
  source: "master-spectrogram";
  bandCount: number;
  frameCount: number;
  modeCount: number;
  controlRateHz: number;
  maximumCoefficient: number;
  clampCount: number;
  nonFiniteCount: number;
  warnings: string[];
}

export interface SpectralBloomPerformance extends Performance {
  concept: "spectral-bloom";
  statics: {
    modes: SpectralBloomMode[];
    coefficientCurves: TimedCurve[];
    topology: SpectralBloomTopology;
    report: SpectralBloomCompileReport;
  };
}

export interface SpectralBloomState {
  coefficients: number[];
  energy: number;
  flux: number;
  centroid: number;
  spread: number;
  flatness: number;
}
