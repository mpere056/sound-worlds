import { parsePerformance, sampleCurve, solvePalette, type Song, type SongEvent, type SongTrack } from "@reaper-viz/core";
import type { MetroDistrict, MetroEdge, MetroLine, MetroLineAudit, MetroPerformance, MetroPoint, MetroStation, MetroSyncHit } from "./types.js";
import { compileTrainSchedule, metroEvents } from "./trains.js";

export * from "./types.js";
export * from "./trains.js";

const LINE_COLORS = ["#ef476f", "#118ab2", "#06d6a0", "#ffd166", "#9b5de5", "#f78c6b", "#4cc9f0", "#90be6d"];
const DRUM_ROLES = new Set(["kick", "snare", "hats", "toms", "percussion", "drums"]);
const PITCH_NAMES = ["F#", "G", "G#", "A", "A#", "B", "C", "C#", "D", "D#", "E", "F"];
const DISTRICT_COLORS: Record<string, string> = {
  intro: "#4cc9f0",
  verse: "#118ab2",
  prechorus: "#ffd166",
  chorus: "#ef476f",
  bridge: "#9b5de5",
  drop: "#06d6a0",
  breakdown: "#f78c6b",
  solo: "#90be6d",
  outro: "#dce8ed",
  unknown: "#6d8799",
};

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

function rowAtOrAfter(song: Song, t: number): number {
  const index = song.grid.beats.findIndex((beat) => beat >= t - 1e-6);
  return index >= 0 ? index : song.grid.beats.length;
}

function compileDistricts(song: Song): MetroDistrict[] {
  return song.sections.map((section, index) => {
    const startRow = rowAtOrAfter(song, section.startSec);
    const endRow = Math.max(startRow + 1, rowAtOrAfter(song, section.endSec));
    return {
      id: `district:${index}:${section.repeatGroup || section.name || "section"}`,
      name: section.name || section.kind.toUpperCase(),
      kind: section.kind,
      repeatGroup: section.repeatGroup,
      startT: section.startSec,
      endT: section.endSec,
      yMin: 210 + startRow * 72 - 36,
      yMax: 210 + endRow * 72 - 36,
      color: DISTRICT_COLORS[section.kind] ?? DISTRICT_COLORS.unknown!,
      energy: section.energy,
    };
  });
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
      ...(pitches.length > 1 ? {
        span: [laneForPitch(pitches[0]!), laneForPitch(pitches[pitches.length - 1]!)] as [number, number],
        spanPos: [
          { x: 90 + laneForPitch(pitches[0]!) * 75, y: 210 + row * 72 },
          { x: 90 + laneForPitch(pitches[pitches.length - 1]!) * 75, y: 210 + row * 72 },
        ] as [MetroPoint, MetroPoint],
      } : {}),
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

function samePoint(a: MetroPoint, b: MetroPoint): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

/**
 * Move a route onto its deterministic line corridor while preserving the
 * canonical station positions. The short endpoint connectors use the same
 * octilinear direction family as the route, so trains can ride this polyline
 * directly without a separate visual-only displacement.
 */
function offsetRoute(points: MetroPoint[], offset: number): MetroPoint[] {
  if (points.length < 2 || Math.abs(offset) < 1e-6) return points.map((point) => ({ ...point }));
  let primary = { dx: 0, dy: 0, length: -1 };
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index]!.x - points[index - 1]!.x;
    const dy = points[index]!.y - points[index - 1]!.y;
    const length = Math.hypot(dx, dy);
    if (length > primary.length) primary = { dx, dy, length };
  }
  const magnitude = Math.hypot(primary.dx, primary.dy) || 1;
  const shift = {
    x: (-primary.dy / magnitude) * offset,
    y: (primary.dx / magnitude) * offset,
  };
  const shifted = points.map((point) => ({ x: point.x + shift.x, y: point.y + shift.y }));
  const result = [points[0]!, ...shifted, points[points.length - 1]!];
  return result.filter((point, index) => index === 0 || !samePoint(point, result[index - 1]!));
}

export function compileMetro(song: Song): MetroPerformance {
  const candidates = song.tracks.filter((track) => !DRUM_ROLES.has(track.role.toLowerCase()));
  const tracks = (candidates.length ? candidates : song.tracks).slice(0, 8);
  const districts = compileDistricts(song);
  const sourceEventCounts = new Map<string, number>();
  const lines: MetroLine[] = tracks.map((track, index) => ({
    id: track.id,
    name: track.name,
    role: track.role,
    color: LINE_COLORS[index % LINE_COLORS.length]!,
    source: track.events.some((event) => event.kind === "note" && event.pitch !== null) ? "midi" : "audio-activity",
  }));
  const compileLog = lines.map((line) => `${line.name}: ${line.source}`);
  if (districts.length) compileLog.push(`districts: ${districts.length} section bands`);
  const perLine = new Map<string, AbstractStation[]>();
  tracks.forEach((track, index) => {
    const line = lines[index]!;
    const pitched = track.events.filter((event) => event.kind === "note" && event.pitch !== null);
    sourceEventCounts.set(line.id, pitched.length);
    const rawStations = pitched.length ? stationForEvents(song, line, pitched) : audioStations(song, line, track, index);
    if (!pitched.length) sourceEventCounts.set(line.id, rawStations.length);
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
  const lineStationIds = new Map(lines.map((line) => {
    const ids = (perLine.get(line.id) ?? []).sort((a, b) => a.row - b.row || a.revealT - b.revealT)
      .map((station) => canonical.get(station.id) ?? station.id)
      .filter((id, index, all) => index === 0 || id !== all[index - 1]);
    return [line.id, ids] as const;
  }));
  const terminalIds = new Set<string>();
  for (const ids of lineStationIds.values()) {
    if (ids[0]) terminalIds.add(ids[0]);
    if (ids[ids.length - 1]) terminalIds.add(ids[ids.length - 1]!);
  }
  for (const station of stations) {
    if (terminalIds.has(station.id) && station.kind === "stop") station.kind = "terminal";
    const onDownbeat = song.grid.downbeats.some((time) => Math.abs(time - station.revealT) < 0.04);
    if (station.kind === "interchange" || station.kind === "terminal" || onDownbeat) {
      const hasMidi = station.lines.some((lineId) => lines.find((line) => line.id === lineId)?.source === "midi");
      const bar = song.grid.bars.find((candidate) => station.revealT >= candidate.startSec && station.revealT < candidate.endSec);
      const terminalName = station.lines.map((lineId) => lines.find((line) => line.id === lineId)?.name ?? "LINE")
        .map((name) => name.replace(/^VV_/i, "").replace(/^SAMPLE_/i, "").replace(/_VITAL$/i, "").replace(/_INPUT$/i, "").replace(/_/g, " ").toUpperCase()).join(" / ");
      station.label = {
        text: station.kind === "terminal" ? terminalName : hasMidi ? PITCH_NAMES[station.lane] ?? "STOP" : station.kind === "interchange" ? `XFER ${station.row + 1}` : `BAR ${(bar?.index ?? 0) + 1}`,
        side: station.lane > 5 ? "L" : "R",
        tier: station.kind === "interchange" || station.kind === "terminal" ? 0 : 1,
      };
    }
  }
  const edges: MetroEdge[] = [];
  const corridorSpacing = 7;
  for (const [lineIndex, line] of lines.entries()) {
    const ids = lineStationIds.get(line.id) ?? [];
    for (let index = 1; index < ids.length; index += 1) {
      if (ids[index] === ids[index - 1]) continue;
      const from = byId.get(ids[index - 1]!);
      const to = byId.get(ids[index]!);
      if (!from || !to) continue;
      const corridorOffset = (lineIndex - (lines.length - 1) / 2) * corridorSpacing;
      const poly = offsetRoute(route(from.pos, to.pos), corridorOffset);
      edges.push({
        id: `${line.id}:e${index}`,
        lineId: line.id,
        from: from.id,
        to: to.id,
        poly,
        length: polyLength(poly),
        revealStartT: from.revealT,
        revealT: to.revealT,
        corridorRank: lineIndex,
        corridorOffset,
      });
    }
  }
  if (lines.length > 1) compileLog.push(`corridors: ${corridorSpacing}px spacing in global line order`);
  const trains = lines.map((line) => {
    const ids = lineStationIds.get(line.id) ?? [];
    return compileTrainSchedule(line.id, ids, byId, edges);
  });
  const syncHits: MetroSyncHit[] = [];
  const lineAudits: MetroLineAudit[] = lines.map((line) => {
    const ids = lineStationIds.get(line.id) ?? [];
    const uniqueIds = [...new Set(ids)];
    const lineHits: number[] = [];
    const sourceStations = perLine.get(line.id) ?? [];
    for (const sourceStation of sourceStations) {
      const stationId = canonical.get(sourceStation.id) ?? sourceStation.id;
      const station = byId.get(stationId);
      if (!station) continue;
      for (const hitT of sourceStation.times) {
        lineHits.push(hitT);
        syncHits.push({
          t: hitT,
          lineId: line.id,
          lineName: line.name,
          role: line.role,
          source: line.source,
          stationId,
          stationKind: station.kind,
          lane: sourceStation.lane,
          pitchName: PITCH_NAMES[sourceStation.lane] ?? "STOP",
          label: station.label?.text ?? (line.source === "midi" ? PITCH_NAMES[sourceStation.lane] ?? "STOP" : `BAR ${sourceStation.row + 1}`),
          eventType: "station.bloom",
          hitT,
        });
      }
    }
    lineHits.sort((a, b) => a - b);
    const notes = [
      `${line.source} source`,
      `${uniqueIds.length} visible stations`,
      `${lineHits.length} note/payoff hits`,
    ];
    if (line.source === "audio-activity") notes.push("fallback: no pitched MIDI notes found");
    return {
      lineId: line.id,
      name: line.name,
      role: line.role,
      source: line.source,
      color: line.color,
      sourceEventCount: sourceEventCounts.get(line.id) ?? lineHits.length,
      stationCount: uniqueIds.length,
      hitCount: lineHits.length,
      firstHitT: lineHits[0] ?? null,
      lastHitT: lineHits.at(-1) ?? null,
      notes,
    };
  });
  syncHits.sort((a, b) => a.t - b.t || lines.findIndex((line) => line.id === a.lineId) - lines.findIndex((line) => line.id === b.lineId) || a.stationId.localeCompare(b.stationId));
  const xs = stations.map((station) => station.pos.x);
  const ys = stations.map((station) => station.pos.y);
  const bounds = { minX: Math.min(...xs, 90), minY: Math.min(...ys, 210), maxX: Math.max(...xs, 915), maxY: Math.max(...ys, 1650) };
  compileLog.push("camera: final reveal deferred until a post-audio end-card hold exists");
  const cameraTimes = [...new Set([0, ...song.grid.beats, song.meta.durationSec])].sort((a, b) => a - b);
  let previousFrontier = bounds.minY;
  const camera = cameraTimes.map((t) => {
    const revealed = stations.filter((station) => station.revealT <= t + 1e-6);
    const frontier = Math.max(previousFrontier, ...revealed.map((station) => station.pos.y));
    previousFrontier = frontier;
    return {
      t,
      pos: [(bounds.minX + bounds.maxX) / 2, frontier, 10] as [number, number, number],
      zoom: 1.35,
      anchor: [0.5, 1240 / 1920] as [number, number],
      ease: "smoothstep",
    };
  });
  const performance: MetroPerformance = {
    schemaVersion: 1,
    concept: "metro",
    seed: `${song.meta.seed}:metro`,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: 1080, h: 1920 },
    palette: solvePalette(null, lines.map((line) => line.role)),
    camera, curves: {}, events: metroEvents(stations, edges),
    statics: {
      lanes: { count: 12, laneX: Array.from({ length: 12 }, (_, index) => 90 + index * 75) },
      lines, districts, stations, edges, trains,
      lineAudits,
      syncHits,
      bounds,
      compileLog,
      compilerVersion: 6,
    },
  };
  parsePerformance(performance);
  return performance;
}
