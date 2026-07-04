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

  it("keeps train arrivals and blooms on source times", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "lead", beats: [0, 1, 2], pitch: 60, kind: "note" }] });
    const output = compileMetro(song);
    expect(output.statics.trains[0]!.stops.map((stop) => stop.arriveT)).toEqual(song.tracks[0]!.events.map((event) => event.t));
    expect(output.events.filter((event) => event.type === "station.bloom").map((event) => event.params.hitT)).toEqual(song.tracks[0]!.events.map((event) => event.t));
  });

  it("labels terminals and keeps the frontier camera monotone", () => {
    const output = compileMetro(buildFixtureSong({ patterns: [{ role: "keys", beats: [], kind: "note" }] }));
    const terminals = output.statics.stations.filter((station) => station.kind === "terminal");
    expect(terminals.length).toBeGreaterThanOrEqual(2);
    expect(terminals.every((station) => station.label?.tier === 0)).toBe(true);
    for (let index = 1; index < output.camera.length - 1; index += 1) {
      expect(output.camera[index]!.pos[1]).toBeGreaterThanOrEqual(output.camera[index - 1]!.pos[1]);
    }
    expect(output.camera[output.camera.length - 1]!.zoom).toBe(1);
  });

  it("routes every segment horizontally, vertically, or at 45 degrees", () => {
    const output = compileMetro(buildFixtureSong());
    for (const edge of output.statics.edges) for (let index = 1; index < edge.poly.length; index += 1) {
      const dx = Math.abs(edge.poly[index]!.x - edge.poly[index - 1]!.x);
      const dy = Math.abs(edge.poly[index]!.y - edge.poly[index - 1]!.y);
      expect(dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-6).toBe(true);
    }
  });

  it("separates shared corridors in stable global line order", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [
      { role: "lead", beats: [0, 1, 2, 3], pitch: 60, kind: "note" },
      { role: "bass", beats: [0, 1, 2, 3], pitch: 48, kind: "note" },
    ] });
    const output = compileMetro(song);
    const leadEdges = output.statics.edges.filter((edge) => edge.corridorRank === 0);
    const bassEdges = output.statics.edges.filter((edge) => edge.corridorRank === 1);
    expect(leadEdges).toHaveLength(3);
    expect(bassEdges).toHaveLength(3);
    expect(leadEdges[0]!.corridorOffset).toBeLessThan(bassEdges[0]!.corridorOffset);
    expect(leadEdges.map((edge) => edge.poly)).not.toEqual(bassEdges.map((edge) => edge.poly));
    for (const edge of [...leadEdges, ...bassEdges]) for (let index = 1; index < edge.poly.length; index += 1) {
      const dx = Math.abs(edge.poly[index]!.x - edge.poly[index - 1]!.x);
      const dy = Math.abs(edge.poly[index]!.y - edge.poly[index - 1]!.y);
      expect(dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-6).toBe(true);
    }
  });

  it("makes train schedules reference offset edge geometry", () => {
    const output = compileMetro(buildFixtureSong({ bars: 1, patterns: [
      { role: "lead", beats: [0, 1], pitch: 60, kind: "note" },
      { role: "bass", beats: [0, 1], pitch: 48, kind: "note" },
    ] }));
    for (const schedule of output.statics.trains) {
      const edge = output.statics.edges.find((candidate) => candidate.id === schedule.stops[0]!.edgeToNext);
      expect(edge).toBeDefined();
      expect(edge!.length).toBeGreaterThan(Math.hypot(
        edge!.poly.at(-1)!.x - edge!.poly[0]!.x,
        edge!.poly.at(-1)!.y - edge!.poly[0]!.y,
      ));
    }
  });

  it("is byte-identical across recompiles", () => {
    const song = buildFixtureSong({ name: "metro-determinism" });
    expect(JSON.stringify(compileMetro(song))).toBe(JSON.stringify(compileMetro(song)));
  });
});
