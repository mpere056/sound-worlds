import { describe, expect, it } from "vitest";
import { arriveAt, ballisticArrival, scheduleApproaches } from "./backsolve.js";

describe("back-solving", () => {
  it("solves a flat ballistic arrival through the requested apex", () => {
    const solution = ballisticArrival({ x: 10, y: 0 }, 8, { duration: 2, apex: 3 });
    const impactX = solution.launchPos.x + solution.launchVel.x * 2;
    const impactY = solution.launchPos.y + solution.launchVel.y * 2 - 0.5 * solution.gravity * 4;
    const apex = solution.launchVel.y ** 2 / (2 * solution.gravity);
    expect(solution.tLaunch).toBe(6);
    expect(impactX).toBeCloseTo(10);
    expect(impactY).toBeCloseTo(0);
    expect(apex).toBeCloseTo(3);
  });

  it("backs a path departure out from its arrival", () => {
    expect(arriveAt({ points: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }, 10, { unitsPerSecond: 2.5 }))
      .toEqual({ tDepart: 8, duration: 2, length: 5 });
  });

  it("applies deterministic budgets, lanes, and separation", () => {
    const schedule = scheduleApproaches([{ t: 2 }, { t: 2.1 }, { t: 2.8 }, { t: 3.2 }], {
      duration: 1, lanes: 2, maxPerWindow: 2, windowSec: 1, minSpawnSeparation: 0.15,
    });
    expect(schedule.map((entry) => entry.hitT)).toEqual([2, 2.8, 3.2]);
    expect(schedule.map((entry) => entry.lane)).toEqual([0, 1, 0]);
  });
});
