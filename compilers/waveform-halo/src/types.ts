import type { Performance } from "@reaper-viz/core";

export interface WaveformHaloField {
  t0: number;
  dt: number;
  waveformSamplesPerFrame: number;
  waveformFrames: number[][];
  bandFrames: number[][];
  signedBandFrames: number[][];
}

export interface WaveformHaloTopology {
  ringCount: number;
  segmentsPerRing: number;
  historySec: number;
}

export interface WaveformHaloReport {
  source: "master-waveform-and-spectrum";
  mapping: "direct-contour-history";
  frameCount: number;
  waveformSamplesPerFrame: number;
  bandCount: number;
  controlRateHz: number;
  ringCount: number;
  segmentsPerRing: number;
  historySec: number;
  nonFiniteCount: number;
  warnings: string[];
}

export interface WaveformHaloPerformance extends Performance {
  concept: "waveform-halo";
  statics: {
    field: WaveformHaloField;
    topology: WaveformHaloTopology;
    report: WaveformHaloReport;
  };
}

export interface WaveformHaloState {
  waveform: number[];
  bands: number[];
  signedBands: number[];
  energy: number;
  flux: number;
  centroid: number;
  spread: number;
  flatness: number;
  activity: number;
}
