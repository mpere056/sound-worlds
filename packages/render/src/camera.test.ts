import { describe, expect, it } from "vitest";
import { sampleCamera } from "./camera.js";

describe("sampleCamera", () => {
  it("clamps and interpolates camera keyframes", () => {
    const frames = [
      { t: 0, pos: [0, 0, 10] as [number, number, number], zoom: 1 },
      { t: 2, pos: [4, 2, 8] as [number, number, number], zoom: 2 },
    ];
    expect(sampleCamera(frames, -1)).toEqual({ pos: [0, 0, 10], zoom: 1 });
    expect(sampleCamera(frames, 1)).toEqual({ pos: [2, 1, 9], zoom: 1.5 });
    expect(sampleCamera(frames, 4)).toEqual({ pos: [4, 2, 8], zoom: 2 });
  });
});
