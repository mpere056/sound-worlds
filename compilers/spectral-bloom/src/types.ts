import type { Performance, TimedCurve } from "@reaper-viz/core";

export interface SpectralBloomSpectrogram {
  schemaVersion: 1;
  kind: "spectral-bloom-master";
  t0: number;
  dt: number;
  bandsHz: number[];
  bands: number[][];
  phaseCos: number[][];
  waveformSamplesPerFrame: number;
  waveform: number[][];
  waveformGain: number;
  flux: TimedCurve;
  centroid: TimedCurve;
  spread: TimedCurve;
  flatness: TimedCurve;
  normalization: { floorDb: number; ceilingDb: number };
}

export interface SpectralBloomTopology {
  surfaceParticles: number;
  interiorParticles: number;
  transientReserve: number;
  topologySeed: string;
}

export interface SpectralBloomWaveformField {
  t0: number;
  dt: number;
  waveformSamplesPerFrame: number;
  waveformFrames: number[][];
  bandFrames: number[][];
  signedBandFrames: number[][];
}

export interface SpectralBloomCompileReport {
  source: "master-waveform-and-spectrum";
  mapping: "direct-spherical-oscilloscope";
  bandCount: number;
  frameCount: number;
  waveformSamplesPerFrame: number;
  controlRateHz: number;
  maximumWaveformMagnitude: number;
  maximumBandMagnitude: number;
  nonFiniteCount: number;
  warnings: string[];
}

export interface SpectralBloomPerformance extends Performance {
  concept: "spectral-bloom";
  statics: {
    field: SpectralBloomWaveformField;
    topology: SpectralBloomTopology;
    report: SpectralBloomCompileReport;
  };
}

export interface SpectralBloomState {
  waveform: number[];
  bands: number[];
  signedBands: number[];
  energy: number;
  flux: number;
  centroid: number;
  spread: number;
  flatness: number;
}
