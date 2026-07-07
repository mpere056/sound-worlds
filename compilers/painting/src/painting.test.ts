import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compilePainting } from "./index.js";

describe("Painting compiler", () => {
  it("emits a deterministic artifact canvas performance", () => {
    const song = buildFixtureSong({ name: "paint-me" });
    const output = compilePainting(song);
    expect(output.concept).toBe("painting");
    expect(output.statics.compilerVersion).toBe(2);
    expect(output.statics.strokes.length).toBeGreaterThan(30);
    expect(output.statics.grain).toHaveLength(260);
    expect(output.statics.signature.text).toBe("paint-me");
    expect(output.statics.strokeCounts.wash).toBeGreaterThan(0);
    expect(output.statics.strokeCounts.subject).toBeGreaterThan(0);
    expect(output.statics.strokeCounts.rhythm).toBeGreaterThan(0);
    expect(JSON.stringify(compilePainting(song))).toBe(JSON.stringify(compilePainting(song)));
  });

  it("falls back to low-note ripples and note-driven rhythm when explicit roles are missing", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [
      { role: "keys", beats: [0, 1], pitch: 72, kind: "note" },
      { role: "keys", beats: [2, 3], pitch: 48, kind: "note" },
    ] });
    const output = compilePainting(song);
    expect(output.statics.strokes.some((stroke) => stroke.kind === "ring" && stroke.layer === "terrain")).toBe(true);
    expect(output.statics.strokes.some((stroke) => stroke.layer === "rhythm")).toBe(true);
    expect(output.statics.compileLog.some((line) => line.includes("roles: keys"))).toBe(true);
  });

  it("keeps every emitted paint event tied to its stroke time", () => {
    const output = compilePainting(buildFixtureSong());
    const strokes = new Map(output.statics.strokes.map((stroke) => [stroke.id, stroke]));
    for (const event of output.events) {
      const stroke = strokes.get(String(event.params.strokeId));
      expect(stroke).toBeDefined();
      expect(event.t).toBe(stroke!.t);
      expect(event.params.hitT).toBe(stroke!.t);
    }
  });
});
