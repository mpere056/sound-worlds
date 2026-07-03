import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compileMetro } from "./index.js";

describe("Metro Map M1 compiler", () => {
  it("builds an audio-activity fallback instead of a blank map", () => {
    const output = compileMetro(buildFixtureSong({ patterns: [{ role: "keys", beats: [], kind: "note" }] }));
    expect(output.statics.lines[0]!.source).toBe("audio-activity");
    expect(output.statics.stations.length).toBeGreaterThan(0);
    expect(output.statics.edges.length).toBeGreaterThan(0);
  });

  it("merges aligned MIDI lines into an interchange", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [
      { role: "lead", beats: [0], pitch: 60, kind: "note" },
      { role: "bass", beats: [0], pitch: 48, kind: "note" },
    ] });
    expect(compileMetro(song).statics.stations.filter((station) => station.kind === "interchange")).toHaveLength(1);
  });

  it("turns simultaneous notes into a chord cluster", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0], pitch: 60, kind: "note" }] });
    song.tracks[0]!.events.push({ ...song.tracks[0]!.events[0]!, pitch: 64 });
    const cluster = compileMetro(song).statics.stations.find((station) => station.kind === "cluster");
    expect(cluster?.span).toEqual([6, 10]);
  });

  it("routes every segment horizontally, vertically, or at 45 degrees", () => {
    const output = compileMetro(buildFixtureSong());
    for (const edge of output.statics.edges) for (let index = 1; index < edge.poly.length; index += 1) {
      const dx = Math.abs(edge.poly[index]!.x - edge.poly[index - 1]!.x);
      const dy = Math.abs(edge.poly[index]!.y - edge.poly[index - 1]!.y);
      expect(dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-6).toBe(true);
    }
  });

  it("is byte-identical across recompiles", () => {
    const song = buildFixtureSong({ name: "metro-determinism" });
    expect(JSON.stringify(compileMetro(song))).toBe(JSON.stringify(compileMetro(song)));
  });
});
