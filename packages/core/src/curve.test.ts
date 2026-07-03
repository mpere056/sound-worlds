import { describe, expect, it } from "vitest";
import { integrateCurve, resampleCurve, sampleCurve, smoothCurve } from "./curve.js";

describe("TimedCurve", () => {
  const ramp = { t0: 0, dt: 1, values: [0, 1, 2] };

  it("samples linearly and clamps at both ends", () => {
    expect(sampleCurve(ramp, -2)).toBe(0);
    expect(sampleCurve(ramp, 0.5)).toBeCloseTo(0.5);
    expect(sampleCurve(ramp, 9)).toBe(2);
  });

  it("resamples without changing the represented line", () => {
    expect(resampleCurve(ramp, 0.5).values).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it("integrates piecewise-linear values in either direction", () => {
    expect(integrateCurve(ramp, 0, 2)).toBeCloseTo(2);
    expect(integrateCurve(ramp, 2, 0)).toBeCloseTo(-2);
  });

  it("smooths with a bounded box window", () => {
    expect(smoothCurve({ t0: 0, dt: 1, values: [0, 0, 1, 0, 0] }, 1).values)
      .toEqual([0, 1 / 3, 1 / 3, 1 / 3, 0]);
  });
});
