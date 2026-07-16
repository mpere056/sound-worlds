import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { buildSpectralBloomModes, compileSpectralBloom, parseSpectralBloomSpectrogram, sampleSpectralBloomState, SPECTRAL_BLOOM_MODE_COUNT } from "./index.js";

function spectralSong(kind: "low" | "high") {
  const song = buildFixtureSong({ bars: 2 });
  const frameCount = Math.ceil(song.meta.durationSec / 0.02) + 1;
  const bandCount = 24;
  const bands = Array.from({ length: frameCount }, (_, frame) => Array.from({ length: bandCount }, (_, band) => {
    const center = kind === "low" ? 2 : 20;
    return Math.exp(-Math.pow((band - center) / 2, 2)) * (0.55 + 0.35 * Math.pow(Math.sin(frame * 0.11), 2));
  }));
  const curve = (value: number) => ({ t0: 0, dt: 0.02, values: Array.from({ length: frameCount }, () => value) });
  song.master.spectrogram = {
    schemaVersion: 1,
    kind: "spectral-bloom-master",
    t0: 0,
    dt: 0.02,
    bandsHz: Array.from({ length: bandCount }, (_, index) => 30 * 1.28 ** index),
    bands,
    phaseCos: bands.map((row, frame) => row.map((_, band) => Math.cos(frame * 0.17 + band * 0.31))),
    flux: curve(0.12),
    centroid: curve(kind === "low" ? 0.12 : 0.82),
    spread: curve(0.28),
    flatness: curve(0.08),
    normalization: { floorDb: -80, ceilingDb: -8 },
  };
  return song;
}

describe("Spectral Bloom modal compiler", () => {
  it("builds a stable ordered acoustic mode bank", () => {
    const modes = buildSpectralBloomModes();
    expect(modes).toHaveLength(SPECTRAL_BLOOM_MODE_COUNT);
    expect(modes[0]).toMatchObject({ degree: 0, order: 0, kind: "radial" });
    expect(modes.some((mode) => mode.kind === "gradient")).toBe(true);
    expect(modes.some((mode) => mode.kind === "curl")).toBe(true);
  });

  it("compiles deterministically with finite bounded coefficients", () => {
    const song = spectralSong("low");
    const first = compileSpectralBloom(song);
    const second = compileSpectralBloom(song);
    expect(second).toEqual(first);
    expect(first.statics.report.nonFiniteCount).toBe(0);
    expect(first.statics.report.maximumCoefficient).toBeLessThanOrEqual(0.68);
    expect(first.statics.coefficientCurves).toHaveLength(SPECTRAL_BLOOM_MODE_COUNT);
    expect(sampleSpectralBloomState(first, 1).coefficients.every(Number.isFinite)).toBe(true);
  });

  it("gives low and high spectra different modal identities", () => {
    const low = sampleSpectralBloomState(compileSpectralBloom(spectralSong("low")), 1.4).coefficients;
    const high = sampleSpectralBloomState(compileSpectralBloom(spectralSong("high")), 1.4).coefficients;
    const difference = low.reduce((sum, value, index) => sum + Math.abs(value - high[index]!), 0);
    expect(difference).toBeGreaterThan(0.1);
  });

  it("rejects stale songs without the versioned master analysis", () => {
    expect(() => parseSpectralBloomSpectrogram(null)).toThrow(/rerun the analyzer/i);
  });
});
