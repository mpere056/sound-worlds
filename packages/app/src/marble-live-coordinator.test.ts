import { describe, expect, it } from "vitest";
import {
  filterMarbleMotionMix,
  marbleMotionMixLabel,
  nextMarbleRequestDelay,
  projectMarbleMotionMix,
  projectMarbleMotionVector,
} from "./marble-live-coordinator.js";

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

  it("projects a directly controlled axis onto the bounded 100 percent mix", () => {
    expect(projectMarbleMotionMix("upDown", 50, { leftRight: 20, upDown: 20, frontBack: 60 })).toEqual({
      leftRight: 13,
      upDown: 50,
      frontBack: 37,
    });
    expect(projectMarbleMotionMix("frontBack", 80, { leftRight: 58, upDown: 20, frontBack: 22 })).toEqual({
      leftRight: 10,
      upDown: 10,
      frontBack: 80,
    });
  });

  it("deadbands stationary input and slew-limits a noisy gesture stream", () => {
    const initial = { leftRight: 20, upDown: 20, frontBack: 60 };
    expect(filterMarbleMotionMix({ leftRight: 20.4, upDown: 19.8, frontBack: 59.8 }, initial, 1 / 60)).toEqual(initial);
    const moved = filterMarbleMotionMix({ leftRight: 60, upDown: 20, frontBack: 20 }, initial, 1 / 60, { slewPerSec: 60 });
    expect(moved).toEqual({ leftRight: 21, upDown: 20, frontBack: 59 });
    expect(moved.leftRight + moved.upDown + moved.frontBack).toBe(100);
  });

  it("projects simultaneous spatial input without axis-order bias", () => {
    expect(projectMarbleMotionVector({ leftRight: 40, upDown: 30, frontBack: 70 })).toEqual({
      leftRight: 27,
      upDown: 17,
      frontBack: 56,
    });
    const bounded = projectMarbleMotionVector({ leftRight: 200, upDown: -40, frontBack: 20 });
    expect(bounded).toEqual({ leftRight: 80, upDown: 10, frontBack: 10 });
  });

  it("bounds a five-minute 60 Hz stream to the 10 Hz planner cadence", () => {
    let lastRequestAt = Number.NEGATIVE_INFINITY;
    let requests = 0;
    for (let frame = 0; frame < 5 * 60 * 60; frame += 1) {
      const now = frame * (1000 / 60);
      if (nextMarbleRequestDelay(now, lastRequestAt) > 1e-6) continue;
      lastRequestAt = now;
      requests += 1;
    }
    expect(requests).toBeGreaterThanOrEqual(2990);
    expect(requests).toBeLessThanOrEqual(3001);
    expect(marbleMotionMixLabel({ leftRight: 10, upDown: 10, frontBack: 80 })).toBe("10/10/80");
  });
});
