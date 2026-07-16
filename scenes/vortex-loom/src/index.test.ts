import { buildFixtureSong } from "@reaper-viz/core";
import { compileVortexLoom } from "@reaper-viz/compiler-vortex-loom";
import { describe, expect, it } from "vitest";
import { sampleVortexLoomVisualState } from "./index.js";

describe("Vortex Loom visual state", () => {
  it("prepares the next vortex continuously before its note", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "lead", beats: [0, 2], pitch: 60, kind: "note" }] });
    const performance = compileVortexLoom(song, { fiberCount: 8, pointsPerFiber: 8 });
    const next = performance.statics.vortices[1]!;
    const early = sampleVortexLoomVisualState(performance, Math.max(0, next.t - 2.5));
    const late = sampleVortexLoomVisualState(performance, next.t - 0.2);
    expect(late.nextIndex).toBe(1);
    expect(late.preview).toBeGreaterThan(early.preview);
    expect(late.preview).toBeLessThanOrEqual(1);
  });
});
