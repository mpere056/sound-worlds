import { describe, expect, it } from "vitest";
import { generateWaveformHaloRibbonGeometry, waveformHaloContourPosition } from "./index.js";

describe("Waveform Halo geometry", () => {
  it("creates two triangles for every contour segment", () => {
    const geometry = generateWaveformHaloRibbonGeometry(4, 16);
    expect(geometry.getAttribute("position").count).toBe(4 * 16 * 6);
    expect(geometry.getAttribute("aHistory").count).toBe(4 * 16 * 6);
    geometry.dispose();
  });

  it("leaves exactly one baseline circle when silent", () => {
    const core = waveformHaloContourPosition(0, 0, 0, 0);
    const history = waveformHaloContourPosition(0, 0.8, 0, 0.9);
    expect(core.radius).toBe(1.55);
    expect(core.depth).toBe(0);
    expect(core.opacity).toBe(1);
    expect(history.opacity).toBe(0);
    expect(history.depth).toBe(0);
  });

  it("maps waveform magnitude outward while preserving the silent circle as the inner boundary", () => {
    const crest = waveformHaloContourPosition(0.6, 0, 0.8, 0.8);
    const trough = waveformHaloContourPosition(-0.6, 0, 0.8, 0.8);
    expect(crest.radius).toBeGreaterThan(1.55);
    expect(trough.radius).toBeCloseTo(crest.radius, 8);
  });

  it("opens measured history into depth only while the current signal is active", () => {
    const active = waveformHaloContourPosition(0.2, 0.7, 0.8, 0.6);
    const silent = waveformHaloContourPosition(0.2, 0.7, 0, 0.6);
    expect(active.depth).toBeGreaterThan(0);
    expect(active.opacity).toBeGreaterThan(0);
    expect(silent.depth).toBe(0);
    expect(silent.opacity).toBe(0);
  });
});
