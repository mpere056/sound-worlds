import { sampleCurve, type Song } from "@reaper-viz/core";
import { parseSpectralBloomSpectrogram } from "@reaper-viz/compiler-spectral-bloom";
import type { WaveformHaloPerformance, WaveformHaloState } from "./types.js";

export * from "./types.js";

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

function waveformActivity(waveform: readonly number[]): number {
  if (!waveform.length) return 0;
  let squareSum = 0;
  let peak = 0;
  for (const value of waveform) {
    squareSum += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  const rms = Math.sqrt(squareSum / waveform.length);
  return Math.min(1, Math.max(peak * 0.72, rms * 1.45));
}

function rotateFrame(frame: readonly number[], shift: number): number[] {
  return frame.map((_, index) => frame[(index + shift) % frame.length]!);
}

export function alignWaveformFrames(frames: readonly number[][]): number[][] {
  if (!frames.length) return [];
  const aligned: number[][] = [frames[0]!.slice()];
  for (let frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex]!;
    const previous = aligned[frameIndex - 1]!;
    let bestShift = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let shift = 0; shift < frame.length; shift += 1) {
      let score = 0;
      for (let sample = 0; sample < frame.length; sample += 1) score += previous[sample]! * frame[(sample + shift) % frame.length]!;
      if (score > bestScore) {
        bestScore = score;
        bestShift = shift;
      }
    }
    aligned.push(rotateFrame(frame, bestShift));
  }
  return aligned;
}

export function compileWaveformHalo(song: Song): WaveformHaloPerformance {
  const analysis = parseSpectralBloomSpectrogram(song.master.spectrogram);
  let nonFiniteCount = 0;
  for (const rows of [analysis.waveform, analysis.bands, analysis.phaseCos]) {
    for (const row of rows) for (const value of row) if (!Number.isFinite(value)) nonFiniteCount += 1;
  }
  const signedBandFrames = analysis.bands.map((frame, frameIndex) => frame.map((value, bandIndex) => Number((value * analysis.phaseCos[frameIndex]![bandIndex]!).toFixed(6))));
  const alignedWaveformFrames = alignWaveformFrames(analysis.waveform);
  const topology = { ringCount: 84, segmentsPerRing: analysis.waveformSamplesPerFrame * 3, historySec: 1.4 };
  return {
    schemaVersion: 1,
    concept: "waveform-halo",
    seed: `${song.meta.seed}:waveform-halo-direct-history`,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: 1080, h: 1920 },
    palette: {
      bg: "#010106",
      roles: { core: "#f8fbff", cyan: "#61e6ff", magenta: "#ff57d5", violet: "#7d55ff" },
    },
    camera: [{ t: 0, pos: [0, 0, 11], zoom: 1 }],
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
        waveformFrames: alignedWaveformFrames,
        bandFrames: analysis.bands,
        signedBandFrames,
      },
      topology,
      report: {
        source: "master-waveform-and-spectrum",
        mapping: "direct-contour-history",
        frameCount: analysis.waveform.length,
        waveformSamplesPerFrame: analysis.waveformSamplesPerFrame,
        bandCount: analysis.bandsHz.length,
        controlRateHz: 1 / analysis.dt,
        ...topology,
        nonFiniteCount,
        warnings: [],
      },
    },
  };
}

export function sampleWaveformHaloState(performance: WaveformHaloPerformance, time: number): WaveformHaloState {
  const field = performance.statics.field;
  const waveform = interpolateFrame(field.waveformFrames, field.t0, field.dt, time);
  return {
    waveform,
    bands: interpolateFrame(field.bandFrames, field.t0, field.dt, time),
    signedBands: interpolateFrame(field.signedBandFrames, field.t0, field.dt, time),
    energy: sampleCurve(performance.curves.energy!, time),
    flux: sampleCurve(performance.curves.flux!, time),
    centroid: sampleCurve(performance.curves.centroid!, time),
    spread: sampleCurve(performance.curves.spread!, time),
    flatness: sampleCurve(performance.curves.flatness!, time),
    activity: waveformActivity(waveform),
  };
}

export function sampleWaveformHaloHistory(performance: WaveformHaloPerformance, time: number, count = performance.statics.topology.ringCount, historySec = performance.statics.topology.historySec): WaveformHaloState[] {
  if (!Number.isInteger(count) || count < 1) throw new RangeError("Waveform Halo history count must be a positive integer");
  return Array.from({ length: count }, (_, index) => {
    const age = count === 1 ? 0 : index / (count - 1);
    return sampleWaveformHaloState(performance, Math.max(0, time - age * historySec));
  });
}
