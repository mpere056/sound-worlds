import { describe, expect, it } from "vitest";
import { lumenfallImpactPulse, lumenfallSurfaceIrradiance } from "./index.js";

describe("Lumenfall lighting contract", () => {
  it("uses inverse-square falloff", () => {
    const near = lumenfallSurfaceIrradiance(100, 2, 1);
    const far = lumenfallSurfaceIrradiance(100, 4, 1);
    expect(near).toBeCloseTo(far * 4, 8);
  });

  it("respects surface orientation and occlusion", () => {
    expect(lumenfallSurfaceIrradiance(100, 2, 0.5)).toBeCloseTo(12.5, 8);
    expect(lumenfallSurfaceIrradiance(100, 2, -0.2)).toBe(0);
    expect(lumenfallSurfaceIrradiance(100, 2, 1, true)).toBe(0);
  });

  it("gives impact light a bounded analytic lifetime", () => {
    expect(lumenfallImpactPulse(-0.01, 0.2)).toBe(0);
    expect(lumenfallImpactPulse(0, 0.2)).toBe(1);
    expect(lumenfallImpactPulse(0.1, 0.2)).toBeGreaterThan(0);
    expect(lumenfallImpactPulse(0.2, 0.2)).toBe(0);
  });
});
