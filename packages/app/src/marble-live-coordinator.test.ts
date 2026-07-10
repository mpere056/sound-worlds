import { describe, expect, it } from "vitest";
import { nextMarbleRequestDelay } from "./marble-live-coordinator.js";

describe("Marble live request coordinator", () => {
  it("submits the first change immediately", () => {
    expect(nextMarbleRequestDelay(500, Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("keeps continuous input on a fixed cadence instead of release debounce", () => {
    expect(nextMarbleRequestDelay(1020, 1000)).toBe(80);
    expect(nextMarbleRequestDelay(1075, 1000)).toBe(25);
    expect(nextMarbleRequestDelay(1100, 1000)).toBe(0);
    expect(nextMarbleRequestDelay(1140, 1100)).toBe(60);
  });

  it("allows a final settled request as soon as the cadence permits", () => {
    expect(nextMarbleRequestDelay(1250, 1100)).toBe(0);
  });
});
