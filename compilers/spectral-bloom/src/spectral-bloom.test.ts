import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compileSpectralBloom, parseSpectralBloomSpectrogram, sampleSpectralBloomState } from "./index.js";

function directWaveformSong(kind: "silence" | "sine" | "square") {
  const song = buildFixtureSong({ bars: 2 });
  const frameCount = Math.ceil(song.meta.durationSec / 0.02) + 1;
  const bandCount = 24;
  const sampleCount = 128;
  const waveform = Array.from({ length: frameCount }, (_, frame) => Array.from({ length: sampleCount }, (_, sample) => {
    if (kind === "silence") return 0;
    const phase = sample / sampleCount * Math.PI * 2 + frame * 0.13;
    return kind === "sine" ? Math.sin(phase) * 0.7 : Math.sign(Math.sin(phase)) * 0.7;
  }));
  const bands = Array.from({ length: frameCount }, () => Array.from({ length: bandCount }, (_, band) => kind === "silence" ? 0 : Math.exp(-Math.pow((band - 8) / 3, 2))));
  const curve = (value: number) => ({ t0: 0, dt: 0.02, values: Array.from({ length: frameCount }, () => value) });
  song.master.energy = curve(kind === "silence" ? 0 : 0.6);
  song.master.spectrogram = {
    schemaVersion: 1,
    kind: "spectral-bloom-master",
    t0: 0,
    dt: 0.02,
    bandsHz: Array.from({ length: bandCount }, (_, index) => 30 * 1.28 ** index),
    bands,
    phaseCos: bands.map((row, frame) => row.map((_, band) => Math.cos(frame * 0.17 + band * 0.31))),
    waveformSamplesPerFrame: sampleCount,
    waveform,
    waveformGain: 0.7,
    flux: curve(kind === "silence" ? 0 : 0.12),
    centroid: curve(kind === "silence" ? 0 : 0.35),
    spread: curve(kind === "silence" ? 0 : 0.28),
    flatness: curve(kind === "silence" ? 0 : 0.08),
    normalization: { floorDb: -80, ceilingDb: -8 },
  };
  return song;
}

describe("Spectral Bloom direct waveform compiler", () => {
  it("copies the measured waveform into the authoritative field without modal integration", () => {
    const song = directWaveformSong("sine");
    const performance = compileSpectralBloom(song);
    expect(performance.statics.report.mapping).toBe("direct-spherical-oscilloscope");
    expect(performance.statics.field.waveformFrames).toEqual((song.master.spectrogram as { waveform: number[][] }).waveform);
    expect(performance.statics.report.waveformSamplesPerFrame).toBe(128);
  });

  it("returns the exact baseline data at every silent time", () => {
    const performance = compileSpectralBloom(directWaveformSong("silence"));
    for (const time of [0, 0.1, 1.7, performance.durationSec]) {
      const state = sampleSpectralBloomState(performance, time);
      expect(state.waveform.every((value) => value === 0)).toBe(true);
      expect(state.bands.every((value) => value === 0)).toBe(true);
      expect(state.signedBands.every((value) => value === 0)).toBe(true);
    }
  });

  it("preserves distinct measured waveform identities", () => {
    const sine = sampleSpectralBloomState(compileSpectralBloom(directWaveformSong("sine")), 1.2).waveform;
    const square = sampleSpectralBloomState(compileSpectralBloom(directWaveformSong("square")), 1.2).waveform;
    const difference = sine.reduce((sum, value, index) => sum + Math.abs(value - square[index]!), 0);
    expect(difference).toBeGreaterThan(20);
  });

  it("interpolates direct frames without adding deformation memory", () => {
    const performance = compileSpectralBloom(directWaveformSong("sine"));
    const left = sampleSpectralBloomState(performance, 0).waveform;
    const middle = sampleSpectralBloomState(performance, 0.01).waveform;
    const right = sampleSpectralBloomState(performance, 0.02).waveform;
    expect(middle[17]).toBeCloseTo((left[17]! + right[17]!) / 2, 8);
  });

  it("rejects old analysis without direct waveform frames", () => {
    expect(() => parseSpectralBloomSpectrogram(null)).toThrow(/rerun the analyzer/i);
  });
});
