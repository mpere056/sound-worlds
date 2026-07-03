import { describe, expect, it } from "vitest";
import { solvePalette } from "./palette.js";

describe("palette solver", () => {
  it("is stable regardless of input role order", () => {
    const key = { tonic: "F#", mode: "minor", confidence: 0.8 };
    expect(solvePalette(key, ["lead", "bass", "kick"]))
      .toEqual(solvePalette(key, ["kick", "lead", "bass"]));
  });

  it("deduplicates roles and emits valid colors", () => {
    const palette = solvePalette(null, ["lead", "lead", "other"]);
    expect(Object.keys(palette.roles)).toEqual(["lead", "other"]);
    expect([palette.bg, ...Object.values(palette.roles)].every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
  });
});
