import { sampleCurve, type Song, type TimedCurve } from "@reaper-viz/core";
import type { SpectralBloomPerformance, SpectralBloomSpectrogram, SpectralBloomState } from "./types.js";

export * from "./types.js";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numericCurve(value: unknown): value is TimedCurve {
  if (!value || typeof value !== "object") return false;
  const curve = value as Partial<TimedCurve>;
  return finite(curve.t0) && finite(curve.dt) && curve.dt > 0 && Array.isArray(curve.values) && curve.values.every(finite);
}

function rectangularRows(value: unknown, width: number, minimum: number, maximum: number): value is number[][] {
  return Array.isArray(value) && value.length > 0 && value.every((row) => Array.isArray(row) && row.length === width && row.every((entry) => finite(entry) && entry >= minimum && entry <= maximum));
}

export function parseSpectralBloomSpectrogram(value: unknown): SpectralBloomSpectrogram {
  if (!value || typeof value !== "object") throw new Error("Spectral Bloom requires direct master waveform analysis; rerun the analyzer");
  const source = value as Partial<SpectralBloomSpectrogram>;
  if (source.schemaVersion !== 1 || source.kind !== "spectral-bloom-master") throw new Error("Unsupported Spectral Bloom master analysis");
  if (!finite(source.t0) || !finite(source.dt) || source.dt <= 0) throw new Error("Spectral Bloom analysis has invalid timing");
  if (!Array.isArray(source.bandsHz) || source.bandsHz.length < 4 || !source.bandsHz.every(finite)) throw new Error("Spectral Bloom analysis has invalid spectral bands");
  if (!rectangularRows(source.bands, source.bandsHz.length, 0, 1)) throw new Error("Spectral Bloom analysis has invalid band magnitudes");
  if (!rectangularRows(source.phaseCos, source.bandsHz.length, -1, 1) || source.phaseCos.length !== source.bands.length) throw new Error("Spectral Bloom analysis has invalid signed phase data");
  if (!Number.isInteger(source.waveformSamplesPerFrame) || source.waveformSamplesPerFrame! < 32) throw new Error("Spectral Bloom analysis has insufficient waveform resolution");
  if (!rectangularRows(source.waveform, source.waveformSamplesPerFrame!, -1, 1) || source.waveform.length !== source.bands.length) throw new Error("Spectral Bloom analysis has invalid direct waveform frames");
  if (!finite(source.waveformGain) || source.waveformGain <= 0) throw new Error("Spectral Bloom analysis has invalid waveform gain");
  if (!numericCurve(source.flux) || !numericCurve(source.centroid) || !numericCurve(source.spread) || !numericCurve(source.flatness)) throw new Error("Spectral Bloom analysis has invalid feature curves");
  if (!source.normalization || !finite(source.normalization.floorDb) || !finite(source.normalization.ceilingDb)) throw new Error("Spectral Bloom analysis has invalid normalization metadata");
  return source as SpectralBloomSpectrogram;
}

function interpolateFrame(frames: readonly number[][], t0: number, dt: number, time: number): number[] {
  if (!frames.length) return [];
  const position = Math.max(0, Math.min(frames.length - 1, (time - t0) / dt));
  const low = Math.floor(position);
  const high = Math.min(frames.length - 1, low + 1);
  const alpha = position - low;
  const left = frames[low]!;
  const right = frames[high]!;
  return left.map((value, index) => value + (right[index]! - value) * alpha);
}

export function compileSpectralBloom(song: Song): SpectralBloomPerformance {
  const analysis = parseSpectralBloomSpectrogram(song.master.spectrogram);
  let nonFiniteCount = 0;
  let maximumWaveformMagnitude = 0;
  let maximumBandMagnitude = 0;
  for (const frame of analysis.waveform) {
    for (const value of frame) {
      if (!Number.isFinite(value)) nonFiniteCount += 1;
      maximumWaveformMagnitude = Math.max(maximumWaveformMagnitude, Math.abs(value));
    }
  }
  for (const frame of analysis.bands) {
    for (const value of frame) {
      if (!Number.isFinite(value)) nonFiniteCount += 1;
      maximumBandMagnitude = Math.max(maximumBandMagnitude, Math.abs(value));
    }
  }
  const signedBandFrames = analysis.bands.map((frame, frameIndex) => frame.map((value, bandIndex) => Number((value * analysis.phaseCos[frameIndex]![bandIndex]!).toFixed(6))));
  return {
    schemaVersion: 1,
    concept: "spectral-bloom",
    seed: `${song.meta.seed}:spectral-bloom-direct-waveform`,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: 1080, h: 1920 },
    palette: {
      bg: "#03070d",
      roles: { surface: "#e8edf2", fold: "#ffffff", core: "#9eb9d4", shadow: "#263342" },
    },
    camera: [{ t: 0, pos: [0, 0, 16.5], zoom: 1 }],
    curves: {
      energy: song.master.energy,
      flux: analysis.flux,
      centroid: analysis.centroid,
      spread: analysis.spread,
      flatness: analysis.flatness,
    },
    events: [],
    statics: {
      field: {
        t0: analysis.t0,
        dt: analysis.dt,
        waveformSamplesPerFrame: analysis.waveformSamplesPerFrame,
        waveformFrames: analysis.waveform,
        bandFrames: analysis.bands,
        signedBandFrames,
      },
      topology: {
        surfaceParticles: 26000,
        interiorParticles: 5000,
        transientReserve: 0,
        topologySeed: `${song.meta.seed}:spectral-bloom-topology-v2`,
      },
      report: {
        source: "master-waveform-and-spectrum",
        mapping: "direct-spherical-oscilloscope",
        bandCount: analysis.bandsHz.length,
        frameCount: analysis.bands.length,
        waveformSamplesPerFrame: analysis.waveformSamplesPerFrame,
        controlRateHz: 1 / analysis.dt,
        maximumWaveformMagnitude: Number(maximumWaveformMagnitude.toFixed(6)),
        maximumBandMagnitude: Number(maximumBandMagnitude.toFixed(6)),
        nonFiniteCount,
        warnings: [],
      },
    },
  };
}

export function sampleSpectralBloomState(performance: SpectralBloomPerformance, time: number): SpectralBloomState {
  const field = performance.statics.field;
  return {
    waveform: interpolateFrame(field.waveformFrames, field.t0, field.dt, time),
    bands: interpolateFrame(field.bandFrames, field.t0, field.dt, time),
    signedBands: interpolateFrame(field.signedBandFrames, field.t0, field.dt, time),
    energy: sampleCurve(performance.curves.energy!, time),
    flux: sampleCurve(performance.curves.flux!, time),
    centroid: sampleCurve(performance.curves.centroid!, time),
    spread: sampleCurve(performance.curves.spread!, time),
    flatness: sampleCurve(performance.curves.flatness!, time),
  };
}
