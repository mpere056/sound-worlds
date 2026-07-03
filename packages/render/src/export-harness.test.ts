import { describe, expect, it } from "vitest";
import { buildFrameSchedule } from "./export-harness.js";

describe("buildFrameSchedule", () => {
  it("builds exact frame-indexed source and output times", () => {
    const frames = buildFrameSchedule({ startSec: 4, durationSec: 1, fps: 4 });
    expect(frames.map((frame) => frame.sourceTimeSec)).toEqual([4, 4.25, 4.5, 4.75]);
    expect(frames.map((frame) => frame.outputTimeSec)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(frames.every((frame) => frame.durationSec === 0.25)).toBe(true);
    expect(frames[0]?.keyFrame).toBe(true);
  });

  it("includes a short final frame without exceeding requested duration", () => {
    const frames = buildFrameSchedule({ startSec: 0, durationSec: 0.26, fps: 4 });
    expect(frames).toHaveLength(2);
    expect(frames[1]?.durationSec).toBeCloseTo(0.01);
  });

  it("rejects invalid schedules", () => {
    expect(() => buildFrameSchedule({ startSec: -1, durationSec: 1, fps: 60 })).toThrow(/startSec/);
    expect(() => buildFrameSchedule({ startSec: 0, durationSec: 0, fps: 60 })).toThrow(/durationSec/);
    expect(() => buildFrameSchedule({ startSec: 0, durationSec: 1, fps: 0 })).toThrow(/fps/);
  });
});
