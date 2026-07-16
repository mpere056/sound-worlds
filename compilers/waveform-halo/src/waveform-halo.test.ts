import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { alignWaveformFrames, compileWaveformHalo, sampleWaveformHaloHistory, sampleWaveformHaloState } from "./index.js";

function waveformSong(kind: "silence" | "sine" | "square") {
  const song = buildFixtureSong({ bars: 2 });
  const dt = 0.02;
  const frameCount = Math.ceil(song.meta.durationSec / dt) + 1;
  const bandCount = 24;
  const sampleCount = 128;
  const waveform = Array.from({ length: frameCount }, (_, frame) => Array.from({ length: sampleCount }, (_, sample) => {
    if (kind === "silence") return 0;
    const phase = sample / sampleCount * Math.PI * 2 + frame * 0.13;
    return (kind === "sine" ? Math.sin(phase) : Math.sign(Math.sin(phase))) * 0.7;
  }));
  const bands = Array.from({ length: frameCount }, () => Array.from({ length: bandCount }, (_, band) => kind === "silence" ? 0 : Math.exp(-Math.pow((band - 8) / 3, 2))));
  const curve = (value: number) => ({ t0: 0, dt, values: Array.from({ length: frameCount }, () => value) });
  song.master.energy = curve(kind === "silence" ? 0 : 0.6);
  song.master.spectrogram = {
    schemaVersion: 1,
    kind: "spectral-bloom-master",
    t0: 0,
    dt,
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

describe("Waveform Halo direct contour compiler", () => {
  it("packages the measured waveform without force integration", () => {
    const song = waveformSong("sine");
    const performance = compileWaveformHalo(song);
    expect(performance.statics.report.mapping).toBe("direct-contour-history");
    expect(performance.statics.field.waveformFrames[0]).toEqual((song.master.spectrogram as { waveform: number[][] }).waveform[0]);
    expect(performance.statics.topology.ringCount).toBe(84);
  });

  it("collapses every contour to baseline for silent source data", () => {
    const performance = compileWaveformHalo(waveformSong("silence"));
    for (const state of sampleWaveformHaloHistory(performance, 1.7)) {
      expect(state.activity).toBe(0);
      expect(state.waveform.every((value) => value === 0)).toBe(true);
    }
  });

  it("preserves different waveform identities", () => {
    const sine = sampleWaveformHaloState(compileWaveformHalo(waveformSong("sine")), 1.2).waveform;
    const square = sampleWaveformHaloState(compileWaveformHalo(waveformSong("square")), 1.2).waveform;
    expect(sine.reduce((sum, value, index) => sum + Math.abs(value - square[index]!), 0)).toBeGreaterThan(20);
  });

  it("interpolates measured frames and orders history from present to past", () => {
    const performance = compileWaveformHalo(waveformSong("sine"));
    const left = sampleWaveformHaloState(performance, 0).waveform;
    const middle = sampleWaveformHaloState(performance, 0.01).waveform;
    const right = sampleWaveformHaloState(performance, 0.02).waveform;
    expect(middle[17]).toBeCloseTo((left[17]! + right[17]!) / 2, 8);
    const history = sampleWaveformHaloHistory(performance, 0.4, 3, 0.4);
    expect(history[0]!.waveform).toEqual(sampleWaveformHaloState(performance, 0.4).waveform);
    expect(history[2]!.waveform).toEqual(sampleWaveformHaloState(performance, 0).waveform);
  });

  it("is deterministic", () => {
    const song = waveformSong("square");
    expect(compileWaveformHalo(song)).toEqual(compileWaveformHalo(song));
  });

  it("aligns phase by cyclic rotation without changing measured sample values", () => {
    const source = [[0, 1, 0, -1], [-1, 0, 1, 0]];
    const aligned = alignWaveformFrames(source);
    expect(aligned[1]).toEqual(aligned[0]);
    expect([...aligned[1]!].sort()).toEqual([...source[1]!].sort());
  });
});
