import { describe, expect, it } from "vitest";
import { generateSpectralBloomTopology } from "./index.js";

describe("Spectral Bloom topology", () => {
  it("is deterministic and keeps one stable particle identity set", () => {
    const first = generateSpectralBloomTopology(256, 64);
    const second = generateSpectralBloomTopology(256, 64);
    expect([...second.positions]).toEqual([...first.positions]);
    expect([...second.interior]).toEqual([...first.interior]);
    expect(first.positions).toHaveLength(320 * 3);
    expect(first.interior.filter((value) => value === 1)).toHaveLength(64);
  });

  it("keeps surface particles on a thin shell and interior particles inside it", () => {
    const topology = generateSpectralBloomTopology(512, 128);
    const radii = Array.from({ length: 640 }, (_, index) => Math.hypot(topology.positions[index * 3]!, topology.positions[index * 3 + 1]!, topology.positions[index * 3 + 2]!));
    expect(Math.min(...radii.slice(0, 512))).toBeGreaterThan(1.46);
    expect(Math.max(...radii.slice(0, 512))).toBeLessThan(1.5);
    expect(Math.max(...radii.slice(512))).toBeLessThan(1.34);
  });
});
