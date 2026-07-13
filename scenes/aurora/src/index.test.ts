import { describe, expect, it } from "vitest";
import { AURORA_COIL_SHADER_DISPLACEMENT, AURORA_PARTICLE_SHADER_DISPLACEMENT, AURORA_RAYMARCH_SCALE } from "./index.js";

describe("Aurora shader geometry budget", () => {
  it("keeps combined visual displacement inside the certified clearance margin", () => {
    expect(AURORA_PARTICLE_SHADER_DISPLACEMENT).toBeGreaterThan(0);
    expect(AURORA_COIL_SHADER_DISPLACEMENT).toBeGreaterThan(0);
    expect(AURORA_PARTICLE_SHADER_DISPLACEMENT + AURORA_COIL_SHADER_DISPLACEMENT).toBeLessThan(0.025);
  });

  it("keeps the iterative field pass at the planned half-resolution budget", () => {
    expect(AURORA_RAYMARCH_SCALE).toBe(0.5);
  });
});
