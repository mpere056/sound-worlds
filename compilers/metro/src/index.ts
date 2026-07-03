import { parsePerformance, sampleCurve, solvePalette, type Song, type SongEvent, type SongTrack } from "@reaper-viz/core";
import type { MetroEdge, MetroLine, MetroPerformance, MetroPoint, MetroStation } from "./types.js";
import { compileTrainSchedule, metroEvents } from "./trains.js";

export * from "./types.js";
export * from "./trains.js";

const LINE_COLORS = ["#ef476f", "#118ab2", "#06d6a0", "#ffd166", "#9b5de5", "#f78c6b", "#4cc9f0", "#90be6d"];
const DRUM_ROLES = new Set(["kick", "snare", "hats", "toms", "percussion", "drums"]);

interface AbstractStation extends MetroStation { lineId: string; }

function beatIndex(song: Song, t: number): number {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  song.grid.beats.forEach((beat, index) => {
    const next = Math.abs(beat - t);
    if (next < distance) { best = index; distance = next; }
  });
  return best;
}

function laneForPitch(pitch: number): number {
  return ((Math.round(pitch) % 12) + 18) % 12;
}

function stationForEvents(song: Song, line: MetroLine, events: SongEvent[]): AbstractStation[] {
  const groups = new Map<string, SongEvent[]>();
  for (const event of events) {
    if (event.pitch === null || event.kind !== "note") continue;
    const row = beatIndex(song, event.t);
    const key = `${row}:${event.t.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const stations: AbstractStation[] = [];
  for (const group of groups.values()) {
    const pitches = group.map((event) => event.pitch!).sort((a, b) => a - b);
    const row = beatIndex(song, group[0]!.t);
    const rootLane = laneForPitch(pitches[0]!);
    stations.push({
      id: `${line.id}:r${row}:l${rootLane}`,
      lineId: line.id,
      pos: { x: 90 + rootLane * 75, y: 210 + row * 72 },
      row,
      lane: rootLane,
      kind: pitches.length > 1 ? "cluster" : "stop",
      lines: [line.id],
      revealT: Math.min(...group.map((event) => event.t)),
      times: group.map((event) => event.t).sort((a, b) => a - b),
      mergedCount: group.length,
      ...(pitches.length > 1 ? { span: [laneForPitch(pitches[0]!), laneForPitch(pitches[pitches.length - 1]!)] as [number, number] } : {}),
    });
  }
  const merged = new Map<string, AbstractStation>();
  for (const station of stations.sort((a, b) => a.row - b.row || a.lane - b.lane)) {
    const key = `${station.row}:${station.lane}`;
    const prior = merged.get(key);
    if (prior) {
      prior.times.push(...station.times);
      prior.mergedCount += station.mergedCount;
      prior.revealT = Math.min(prior.revealT, station.revealT);
    } else merged.set(key, station);
  }
  return [...merged.values()];
}

function audioStations(song: Song, line: MetroLine, track: SongTrack, lineIndex: number): AbstractStation[] {
  const beats = song.grid.beats.length ? song.grid.beats : song.grid.bars.map((bar) => bar.startSec);
  return beats.map((t, row) => {
    const energy = sampleCurve(track.curves.rms, t);
    const lane = Math.max(0, Math.min(11, (lineIndex * 2 + Math.round(energy * 5) + (row % 3 === 2 ? 1 : 0)) % 12));
    return {
      id: `${line.id}:r${row}:l${lane}`,
      lineId: line.id,
      pos: { x: 90 + lane * 75, y: 210 + row * 72 },
      row,
      lane,
      kind: "stop",
      lines: [line.id],
      revealT: t,
      times: [t],
      mergedCount: 1,
    };
  });
}

function route(from: MetroPoint, to: MetroPoint): MetroPoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) return [from, to];
  const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
  const bend = { x: from.x + Math.sign(dx) * diagonal, y: from.y + Math.sign(dy) * diagonal };
  return [from, bend, to];
}

function polyLength(points: MetroPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  return total;
}

export function compileMetro(song: Song): MetroPerformance {
  const candidates = song.tracks.filter((track) => !DRUM_ROLES.has(track.role.toLowerCase()));
  const tracks = (candidates.length ? candidates : song.tracks).slice(0, 8);
  const lines: MetroLine[] = tracks.map((track, index) => ({
    id: track.id,
    name: track.name,
    role: track.role,
    color: LINE_COLORS[index % LINE_COLORS.length]!,
    source: track.events.some((event) => event.kind === "note" && event.pitch !== null) ? "midi" : "audio-activity",
  }));
  const compileLog = lines.map((line) => `${line.name}: ${line.source}`);
  const perLine = new Map<string, AbstractStation[]>();
  tracks.forEach((track, index) => {
    const line = lines[index]!;
    const pitched = track.events.filter((event) => event.kind === "note" && event.pitch !== null);
    const rawStations = pitched.length ? stationForEvents(song, line, pitched) : audioStations(song, line, track, index);
    if (rawStations.length > 120) {
      const stride = Math.ceil(rawStations.length / 120);
      const reduced = rawStations.filter((_, stationIndex) => stationIndex % stride === 0 || stationIndex === rawStations.length - 1);
      compileLog.push(`${line.name}: station budget ${rawStations.length} -> ${reduced.length}`);
      perLine.set(line.id, reduced);
    } else perLine.set(line.id, rawStations);
  });

  const cells = new Map<string, AbstractStation[]>();
  for (const stations of perLine.values()) for (const station of stations) {
    const key = `${station.row}:${station.lane}`;
    cells.set(key, [...(cells.get(key) ?? []), station]);
  }
  const stations: MetroStation[] = [];
  const canonical = new Map<string, string>();
  const lastInterchange = new Map<string, number>();
  for (const [cell, members] of [...cells.entries()].sort((a, b) => a[1][0]!.row - b[1][0]!.row || a[1][0]!.lane - b[1][0]!.lane)) {
    const lineIds = [...new Set(members.map((member) => member.lineId))].sort();
    const times = members.flatMap((member) => member.times).sort((a, b) => a - b);
    const aligned = lineIds.length > 1 && times[times.length - 1]! - times[0]! < 0.08;
    const pair = lineIds.join("|");
    const row = members[0]!.row;
    const continuingRun = aligned && lastInterchange.get(pair) === row - 1;
    if (aligned) lastInterchange.set(pair, row);
    const id = aligned ? `transfer:${cell}` : members[0]!.id;
    const station: MetroStation = {
      ...members[0]!,
      id,
      kind: aligned && !continuingRun ? "interchange" : members.some((member) => member.kind === "cluster") ? "cluster" : "stop",
      lines: lineIds,
      times,
      revealT: Math.min(...times),
      mergedCount: members.reduce((sum, member) => sum + member.mergedCount, 0),
    };
    delete (station as Partial<AbstractStation>).lineId;
    stations.push(station);
    for (const member of members) canonical.set(member.id, id);
  }

  const byId = new Map(stations.map((station) => [station.id, station]));
  const edges: MetroEdge[] = [];
  for (const line of lines) {
    const ids = (perLine.get(line.id) ?? []).sort((a, b) => a.row - b.row || a.revealT - b.revealT).map((station) => canonical.get(station.id) ?? station.id);
    for (let index = 1; index < ids.length; index += 1) {
      if (ids[index] === ids[index - 1]) continue;
      const from = byId.get(ids[index - 1]!);
      const to = byId.get(ids[index]!);
      if (!from || !to) continue;
      const poly = route(from.pos, to.pos);
      edges.push({
        id: `${line.id}:e${index}`,
        lineId: line.id,
        from: from.id,
        to: to.id,
        poly,
        length: polyLength(poly),
        revealStartT: from.revealT,
        revealT: to.revealT,
      });
    }
  }
  const trains = lines.map((line) => {
    const ids = (perLine.get(line.id) ?? []).sort((a, b) => a.row - b.row || a.revealT - b.revealT)
      .map((station) => canonical.get(station.id) ?? station.id)
      .filter((id, index, all) => index === 0 || id !== all[index - 1]);
    return compileTrainSchedule(line.id, ids, byId, edges);
  });
  const xs = stations.map((station) => station.pos.x);
  const ys = stations.map((station) => station.pos.y);
  const performance: MetroPerformance = {
    schemaVersion: 1,
    concept: "metro",
    seed: `${song.meta.seed}:metro`,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: 1080, h: 1920 },
    palette: solvePalette(null, lines.map((line) => line.role)),
    camera: [], curves: {}, events: metroEvents(stations, edges),
    statics: {
      lanes: { count: 12, laneX: Array.from({ length: 12 }, (_, index) => 90 + index * 75) },
      lines, stations, edges, trains,
      bounds: { minX: Math.min(...xs, 90), minY: Math.min(...ys, 210), maxX: Math.max(...xs, 915), maxY: Math.max(...ys, 1650) },
      compileLog,
      compilerVersion: 1,
    },
  };
  parsePerformance(performance);
  return performance;
}
