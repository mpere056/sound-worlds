import { describe, expect, it } from "vitest";
import { RenderClock } from "./clock.js";

describe("RenderClock", () => {
  it("derives time only from frame index", () => {
    const clock = new RenderClock(60, 1.01);
    expect(clock.frameCount).toBe(61);
    expect(clock.timeAt(30)).toBe(0.5);
    expect(clock.frameAt(0.509)).toBe(30);
    expect([...clock.frames()]).toHaveLength(61);
  });
});
