import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compileMetro, compileTrainSchedule, type MetroEdge, type MetroStation } from "./index.js";

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
    expect(cluster?.spanPos).toEqual([{ x: 540, y: 210 }, { x: 840, y: 210 }]);
  });

  it("keeps train arrivals and blooms on source times", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "lead", beats: [0, 1, 2], pitch: 60, kind: "note" }] });
    const output = compileMetro(song);
    expect(output.statics.trains[0]!.stops.map((stop) => stop.arriveT)).toEqual(song.tracks[0]!.events.map((event) => event.t));
    expect(output.events.filter((event) => event.type === "station.bloom").map((event) => event.params.hitT)).toEqual(song.tracks[0]!.events.map((event) => event.t));
  });

  it("emits sync-readability audit data for visible note payoffs", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [
      { role: "lead", beats: [0, 1], pitch: 60, kind: "note" },
      { role: "keys", beats: [0, 2], pitch: 64, kind: "note" },
    ] });
    const output = compileMetro(song);
    expect(output.statics.compilerVersion).toBe(6);
    expect(output.statics.lineAudits).toHaveLength(2);
    expect(output.statics.lineAudits[0]).toMatchObject({
      name: "lead",
      source: "midi",
      sourceEventCount: 2,
      hitCount: 2,
    });
    expect(output.statics.syncHits.map((hit) => ({
      t: hit.t,
      lineName: hit.lineName,
      source: hit.source,
      pitchName: hit.pitchName,
      eventType: hit.eventType,
    }))).toEqual([
      { t: 0, lineName: "lead", source: "midi", pitchName: "C", eventType: "station.bloom" },
      { t: 0, lineName: "keys", source: "midi", pitchName: "E", eventType: "station.bloom" },
      { t: 0.5, lineName: "lead", source: "midi", pitchName: "C", eventType: "station.bloom" },
      { t: 1, lineName: "keys", source: "midi", pitchName: "E", eventType: "station.bloom" },
    ]);
  });

  it("keeps similar MIDI lines auditable instead of collapsing them to one anonymous role", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [
      { role: "keys", beats: [0, 1], pitch: 60, kind: "note" },
      { role: "keys", beats: [0, 2], pitch: 64, kind: "note" },
      { role: "keys", beats: [1, 3], pitch: 67, kind: "note" },
      { role: "keys", beats: [2, 3], pitch: 71, kind: "note" },
    ] });
    const output = compileMetro(song);
    expect(output.statics.lineAudits).toHaveLength(4);
    expect(output.statics.lineAudits.map((audit) => audit.lineId)).toEqual(song.tracks.map((track) => track.id));
    expect(output.statics.lineAudits.every((audit) => audit.source === "midi" && audit.hitCount === 2)).toBe(true);
    expect(new Set(output.statics.lines.map((line) => line.color)).size).toBe(4);
  });

  it("compiles song sections into district bands behind the map", () => {
    const output = compileMetro(buildFixtureSong({ bars: 8 }));
    expect(output.statics.districts.map((district) => ({
      name: district.name,
      kind: district.kind,
      repeatGroup: district.repeatGroup,
      startT: district.startT,
      endT: district.endT,
      color: district.color,
    }))).toEqual([
      { name: "Verse 1", kind: "verse", repeatGroup: "verse", startT: 0, endT: 4, color: "#118ab2" },
      { name: "Chorus 1", kind: "chorus", repeatGroup: "chorus", startT: 4, endT: 8, color: "#ef476f" },
      { name: "Verse 2", kind: "verse", repeatGroup: "verse", startT: 8, endT: 12, color: "#118ab2" },
      { name: "Chorus 2", kind: "chorus", repeatGroup: "chorus", startT: 12, endT: 16, color: "#ef476f" },
    ]);
    expect(output.statics.districts.every((district) => district.yMax > district.yMin)).toBe(true);
    expect(output.statics.compileLog).toContain("districts: 4 section bands");
  });

  it("caps train dwell to half the gap for fast runs", () => {
    const stations = new Map<string, MetroStation>([
      ["a", { id: "a", pos: { x: 0, y: 0 }, row: 0, lane: 0, kind: "stop", lines: ["line"], revealT: 0, times: [0], mergedCount: 1 }],
      ["b", { id: "b", pos: { x: 1, y: 1 }, row: 1, lane: 1, kind: "stop", lines: ["line"], revealT: 0.06, times: [0.06], mergedCount: 1 }],
    ]);
    const edges: MetroEdge[] = [{
      id: "edge",
      lineId: "line",
      from: "a",
      to: "b",
      poly: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      length: Math.SQRT2,
      revealStartT: 0,
      revealT: 0.06,
      corridorRank: 0,
      corridorOffset: 0,
    }];
    const schedule = compileTrainSchedule("line", ["a", "b"], stations, edges);
    expect(schedule.stops[0]!.departT).toBeCloseTo(0.03);
    expect(schedule.stops[0]!.departT).toBeLessThan(schedule.stops[1]!.arriveT);
    expect(schedule.stops[0]!.sprint).toBe(true);
  });

  it("labels terminals and keeps the frontier camera monotone during the audio", () => {
    const output = compileMetro(buildFixtureSong({ patterns: [{ role: "keys", beats: [], kind: "note" }] }));
    const terminals = output.statics.stations.filter((station) => station.kind === "terminal");
    expect(terminals.length).toBeGreaterThanOrEqual(2);
    expect(terminals.every((station) => station.label?.tier === 0)).toBe(true);
    for (let index = 1; index < output.camera.length; index += 1) {
      expect(output.camera[index]!.pos[1]).toBeGreaterThanOrEqual(output.camera[index - 1]!.pos[1]);
    }
    expect(output.camera.every((key) => key.zoom === 1.35)).toBe(true);
    expect(output.camera.every((key) => key.anchor?.[1] === 1240 / 1920)).toBe(true);
    expect(output.statics.compileLog).toContain("camera: final reveal deferred until a post-audio end-card hold exists");
  });

  it("does not start final pullback inside the rendered audio duration", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "lead", beats: [0, 1, 2, 3], pitch: 60, kind: "note" }] });
    song.meta.contentEndSec = Math.max(0, song.meta.durationSec - 2);
    const output = compileMetro(song);
    expect(output.camera.at(-1)!.t).toBe(song.meta.durationSec);
    expect(output.camera.every((key) => key.zoom === 1.35)).toBe(true);
    expect(output.camera.every((key) => key.anchor?.[1] === 1240 / 1920)).toBe(true);
  });

  it("routes every segment horizontally, vertically, or at 45 degrees", () => {
    const output = compileMetro(buildFixtureSong());
    for (const edge of output.statics.edges) for (let index = 1; index < edge.poly.length; index += 1) {
      const dx = Math.abs(edge.poly[index]!.x - edge.poly[index - 1]!.x);
      const dy = Math.abs(edge.poly[index]!.y - edge.poly[index - 1]!.y);
      expect(dx === 0 || dy === 0 || Math.abs(dx - dy) < 1e-6).toBe(true);
    }
  });

  it("emits the documented lane and corridor constants", () => {
    const threeLineSong = buildFixtureSong({ bars: 1, patterns: [
      { role: "lead", beats: [0, 1], pitch: 60, kind: "note" },
      { role: "bass", beats: [0, 1], pitch: 48, kind: "note" },
      { role: "keys", beats: [0, 1], pitch: 64, kind: "note" },
    ] });
    const output = compileMetro(threeLineSong);
    expect(output.statics.lanes.laneX[0]).toBe(90);
    expect(output.statics.lanes.laneX[11]).toBe(915);
    expect([...new Set(output.statics.edges.map((edge) => edge.corridorOffset))]).toEqual([-7, 0, 7]);

    const twoLineOutput = compileMetro(buildFixtureSong({ bars: 1, patterns: [
      { role: "lead", beats: [0, 1], pitch: 60, kind: "note" },
      { role: "bass", beats: [0, 1], pitch: 48, kind: "note" },
    ] }));
    expect([...new Set(twoLineOutput.statics.edges.map((edge) => edge.corridorOffset))]).toEqual([-3.5, 3.5]);
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
