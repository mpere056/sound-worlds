import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "./fixtures.js";
import { MusicalTime } from "./mtime.js";
import { parseSong } from "./schema.js";

describe("MusicalTime", () => {
  const song = parseSong(buildFixtureSong());
  const mt = new MusicalTime(song);

  it("looks up beats, bars, phases, and quantization", () => {
    expect(mt.beatAt(1.1)).toBe(2);
    expect(mt.barAt(2.25)?.index).toBe(1);
    expect(mt.timeOfBar(3)).toBe(6);
    expect(mt.quantize(1.13, "1/8")).toBe(1.25);
    expect(mt.phase(2.5, "bar")).toBeCloseTo(0.25);
  });

  it("queries repeated sections and per-role events", () => {
    const chorus = mt.sectionAt(4.25);
    expect(chorus?.kind).toBe("chorus");
    expect(chorus && mt.repeatsOf(chorus)).toHaveLength(2);
    expect(chorus && mt.events({ role: "snare", within: chorus })).toHaveLength(4);
    expect(mt.energyAt(1)).toBe(0.5);
  });
});
