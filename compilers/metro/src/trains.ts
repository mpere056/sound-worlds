import type { PerformanceEvent } from "@reaper-viz/core";
import type { MetroEdge, MetroStation, MetroTrainSchedule } from "./types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function compileTrainSchedule(
  lineId: string,
  stationIds: readonly string[],
  stations: ReadonlyMap<string, MetroStation>,
  edges: readonly MetroEdge[],
): MetroTrainSchedule {
  const edgeByPair = new Map(edges.filter((edge) => edge.lineId === lineId).map((edge) => [`${edge.from}|${edge.to}`, edge]));
  const stops = stationIds.map((stationId, index) => {
    const station = stations.get(stationId);
    if (!station) throw new Error(`Unknown Metro station ${stationId}`);
    const arriveT = station.times[0] ?? station.revealT;
    const nextId = stationIds[index + 1];
    const next = nextId ? stations.get(nextId) : undefined;
    const gap = next ? Math.max(0, (next.times[0] ?? next.revealT) - arriveT) : 0;
    const dwell = next ? Math.min(clamp(gap * 0.25, 0.08, 0.6), gap * 0.5) : 0;
    const edge = nextId ? edgeByPair.get(`${stationId}|${nextId}`) : undefined;
    const travel = next ? gap - dwell : 0;
    return {
      stationId,
      arriveT,
      departT: arriveT + dwell,
      ...(edge ? { edgeToNext: edge.id, sprint: travel < 0.15 } : {}),
    };
  });
  return { lineId, stops };
}

export function metroEvents(stations: readonly MetroStation[], edges: readonly MetroEdge[]): PerformanceEvent[] {
  const events: PerformanceEvent[] = [];
  for (const station of stations) for (const hitT of station.times) events.push({
    t: hitT,
    type: "station.bloom",
    layer: "metro-stations",
    params: { stationId: station.id, hitT },
  });
  for (const edge of edges) events.push({
    t: edge.revealStartT,
    tEnd: edge.revealT,
    type: "edge.reveal",
    layer: "metro-lines",
    params: { edgeId: edge.id, hitT: edge.revealT },
  });
  return events.sort((a, b) => a.t - b.t || a.type.localeCompare(b.type));
}
