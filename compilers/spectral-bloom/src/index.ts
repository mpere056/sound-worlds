import { sampleCurve, type Song, type TimedCurve } from "@reaper-viz/core";
import type {
  SpectralBloomMode,
  SpectralBloomModeKind,
  SpectralBloomPerformance,
  SpectralBloomSpectrogram,
  SpectralBloomState,
} from "./types.js";

export * from "./types.js";

export const SPECTRAL_BLOOM_MODE_COUNT = 16;
const COEFFICIENT_LIMIT = 0.68;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numericCurve(value: unknown): value is TimedCurve {
  if (!value || typeof value !== "object") return false;
  const curve = value as Partial<TimedCurve>;
  return finite(curve.t0) && finite(curve.dt) && curve.dt > 0 && Array.isArray(curve.values) && curve.values.every(finite);
}

export function parseSpectralBloomSpectrogram(value: unknown): SpectralBloomSpectrogram {
  if (!value || typeof value !== "object") throw new Error("Spectral Bloom requires a master spectrogram; rerun the analyzer");
  const source = value as Partial<SpectralBloomSpectrogram>;
  if (source.schemaVersion !== 1 || source.kind !== "spectral-bloom-master") throw new Error("Unsupported Spectral Bloom master spectrogram");
  if (!finite(source.t0) || !finite(source.dt) || source.dt <= 0) throw new Error("Spectral Bloom spectrogram has invalid timing");
  if (!Array.isArray(source.bandsHz) || source.bandsHz.length < 4 || !source.bandsHz.every(finite)) throw new Error("Spectral Bloom spectrogram has invalid band centers");
  if (!Array.isArray(source.bands) || !source.bands.length || source.bands.some((row) => !Array.isArray(row) || row.length !== source.bandsHz!.length || !row.every((entry) => finite(entry) && entry >= 0 && entry <= 1))) throw new Error("Spectral Bloom spectrogram has invalid band energy data");
  if (!Array.isArray(source.phaseCos) || source.phaseCos.length !== source.bands.length || source.phaseCos.some((row) => !Array.isArray(row) || row.length !== source.bandsHz!.length || !row.every((entry) => finite(entry) && entry >= -1 && entry <= 1))) throw new Error("Spectral Bloom spectrogram has invalid phase controls");
  if (!numericCurve(source.flux) || !numericCurve(source.centroid) || !numericCurve(source.spread) || !numericCurve(source.flatness)) throw new Error("Spectral Bloom spectrogram has invalid feature curves");
  if (!source.normalization || !finite(source.normalization.floorDb) || !finite(source.normalization.ceilingDb)) throw new Error("Spectral Bloom spectrogram has invalid normalization metadata");
  return source as SpectralBloomSpectrogram;
}

function modeKind(index: number, degree: number): SpectralBloomModeKind {
  if (degree === 0 || index % 3 === 0) return "radial";
  return index % 3 === 1 ? "gradient" : "curl";
}

export function buildSpectralBloomModes(): SpectralBloomMode[] {
  const signatures: Array<[number, number]> = [
    [0, 0],
    [2, -2], [2, -1], [2, 0], [2, 1], [2, 2],
    [3, -3], [3, -2], [3, -1], [3, 0], [3, 1], [3, 2], [3, 3],
    [4, -1], [4, 0], [4, 1],
  ];
  return signatures.map(([degree, order], index) => {
    const center = degree === 0 ? 0.025 : Math.min(0.96, 0.08 + (degree - 1) * 0.27 + Math.abs(order) * 0.025);
    return {
      id: `spectral-mode:${degree}:${order}:${index}`,
      index,
      degree,
      order,
      kind: modeKind(index, degree),
      naturalFrequencyHz: 0.22 + degree * 0.12 + Math.abs(order) * 0.025,
      dampingRatio: 0.42 + degree * 0.035 + (index % 3) * 0.025,
      gain: degree === 0 ? 0.5 : 1.45 / Math.sqrt(degree),
      bandCenter: center,
      bandWidth: degree <= 2 ? 0.2 : 0.14,
      polarity: index % 2 === 0 ? 1 : -1,
    };
  });
}

function curveAtIndex(curve: TimedCurve, index: number, targetDt: number): number {
  return sampleCurve(curve, index * targetDt);
}

function modeForce(
  mode: SpectralBloomMode,
  row: readonly number[],
  phase: readonly number[],
  flux: number,
  centroid: number,
  spread: number,
  flatness: number,
): number {
  let energySum = 0;
  let signedSum = 0;
  let weightSum = 0;
  const center = Math.max(0, Math.min(1, mode.bandCenter + (centroid - 0.5) * 0.1));
  for (let band = 0; band < row.length; band += 1) {
    const position = row.length > 1 ? band / (row.length - 1) : 0;
    const distance = (position - center) / Math.max(0.04, mode.bandWidth * (0.8 + spread * 0.5));
    const weight = Math.exp(-0.5 * distance * distance);
    const energy = row[band] ?? 0;
    energySum += energy * weight;
    signedSum += energy * (phase[band] ?? 0) * weight;
    weightSum += weight;
  }
  const energy = weightSum > 1e-9 ? energySum / weightSum : 0;
  const signed = weightSum > 1e-9 ? signedSum / weightSum : 0;
  const transient = flux * mode.polarity * (0.12 + mode.degree * 0.035);
  const noisyTorsion = mode.kind === "curl" ? flatness * energy * mode.polarity * 0.24 : 0;
  const spreadGain = 0.74 + spread * 0.42;
  return (signed * 0.62 + energy * mode.polarity * 0.38 + transient + noisyTorsion) * mode.gain * spreadGain;
}

function compileCoefficientCurves(spectrogram: SpectralBloomSpectrogram, modes: readonly SpectralBloomMode[]): { curves: TimedCurve[]; clampCount: number; nonFiniteCount: number; maximum: number } {
  const positions = modes.map(() => 0);
  const velocities = modes.map(() => 0);
  const values = modes.map(() => [] as number[]);
  let clampCount = 0;
  let nonFiniteCount = 0;
  let maximum = 0;
  const substeps = 4;
  const step = spectrogram.dt / substeps;
  for (let frame = 0; frame < spectrogram.bands.length; frame += 1) {
    const row = spectrogram.bands[frame]!;
    const phase = spectrogram.phaseCos[frame]!;
    const flux = curveAtIndex(spectrogram.flux, frame, spectrogram.dt);
    const centroid = curveAtIndex(spectrogram.centroid, frame, spectrogram.dt);
    const spread = curveAtIndex(spectrogram.spread, frame, spectrogram.dt);
    const flatness = curveAtIndex(spectrogram.flatness, frame, spectrogram.dt);
    for (let modeIndex = 0; modeIndex < modes.length; modeIndex += 1) {
      const mode = modes[modeIndex]!;
      const force = modeForce(mode, row, phase, flux, centroid, spread, flatness);
      const omega = Math.PI * 2 * mode.naturalFrequencyHz;
      for (let substep = 0; substep < substeps; substep += 1) {
        const acceleration = force * 12 - 2 * mode.dampingRatio * omega * velocities[modeIndex]! - omega * omega * positions[modeIndex]!;
        velocities[modeIndex] = velocities[modeIndex]! + acceleration * step;
        positions[modeIndex] = positions[modeIndex]! + velocities[modeIndex]! * step;
      }
      if (!Number.isFinite(positions[modeIndex]) || !Number.isFinite(velocities[modeIndex])) {
        positions[modeIndex] = 0;
        velocities[modeIndex] = 0;
        nonFiniteCount += 1;
      }
      if (Math.abs(positions[modeIndex]!) > COEFFICIENT_LIMIT) {
        positions[modeIndex] = Math.sign(positions[modeIndex]!) * COEFFICIENT_LIMIT;
        velocities[modeIndex] = velocities[modeIndex]! * 0.45;
        clampCount += 1;
      }
      maximum = Math.max(maximum, Math.abs(positions[modeIndex]!));
      values[modeIndex]!.push(Number(positions[modeIndex]!.toFixed(6)));
    }
  }
  return {
    curves: values.map((curveValues) => ({ t0: spectrogram.t0, dt: spectrogram.dt, values: curveValues })),
    clampCount,
    nonFiniteCount,
    maximum,
  };
}

export function compileSpectralBloom(song: Song): SpectralBloomPerformance {
  const spectrogram = parseSpectralBloomSpectrogram(song.master.spectrogram);
  const modes = buildSpectralBloomModes();
  const compiled = compileCoefficientCurves(spectrogram, modes);
  return {
    schemaVersion: 1,
    concept: "spectral-bloom",
    seed: `${song.meta.seed}:spectral-bloom`,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: 1080, h: 1920 },
    palette: {
      bg: "#03070d",
      roles: { surface: "#e8edf2", fold: "#ffffff", core: "#9eb9d4", shadow: "#263342" },
    },
    camera: [{ t: 0, pos: [0, 0, 7.2], zoom: 1 }],
    curves: {
      energy: song.master.energy,
      flux: spectrogram.flux,
      centroid: spectrogram.centroid,
      spread: spectrogram.spread,
      flatness: spectrogram.flatness,
    },
    events: [],
    statics: {
      modes,
      coefficientCurves: compiled.curves,
      topology: {
        surfaceParticles: 26000,
        interiorParticles: 5000,
        transientReserve: 0,
        topologySeed: `${song.meta.seed}:spectral-bloom-topology-v1`,
      },
      report: {
        source: "master-spectrogram",
        bandCount: spectrogram.bandsHz.length,
        frameCount: spectrogram.bands.length,
        modeCount: modes.length,
        controlRateHz: 1 / spectrogram.dt,
        maximumCoefficient: Number(compiled.maximum.toFixed(6)),
        clampCount: compiled.clampCount,
        nonFiniteCount: compiled.nonFiniteCount,
        warnings: compiled.clampCount ? [`${compiled.clampCount} bounded modal coefficient samples`] : [],
      },
    },
  };
}

export function sampleSpectralBloomState(performance: SpectralBloomPerformance, time: number): SpectralBloomState {
  return {
    coefficients: performance.statics.coefficientCurves.map((curve) => sampleCurve(curve, time)),
    energy: sampleCurve(performance.curves.energy!, time),
    flux: sampleCurve(performance.curves.flux!, time),
    centroid: sampleCurve(performance.curves.centroid!, time),
    spread: sampleCurve(performance.curves.spread!, time),
    flatness: sampleCurve(performance.curves.flatness!, time),
  };
}
