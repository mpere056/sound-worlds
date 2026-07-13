import { describe, expect, it } from "vitest";
import { AURORA_RAYMARCH_SCALE, AURORA_VISIBLE_FIELD_COUNT, AURORA_VOLUME_STEPS } from "./index.js";

describe("Aurora volumetric field budget", () => {
  it("keeps the iterative field pass at the planned half-resolution budget", () => {
    expect(AURORA_RAYMARCH_SCALE).toBe(0.5);
    expect(AURORA_VISIBLE_FIELD_COUNT).toBeLessThanOrEqual(7);
    expect(AURORA_VOLUME_STEPS).toBeGreaterThanOrEqual(60);
  });
});
