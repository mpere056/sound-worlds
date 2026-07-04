import type { Performance } from "@reaper-viz/core";

export interface MetroPoint { x: number; y: number; }
export interface MetroLine { id: string; name: string; role: string; color: string; source: "midi" | "audio-activity"; }
export interface MetroStation {
  id: string;
  pos: MetroPoint;
  row: number;
  lane: number;
  kind: "stop" | "interchange" | "terminal" | "cluster";
  lines: string[];
  revealT: number;
  times: number[];
  mergedCount: number;
  span?: [number, number];
  label?: { text: string; side: "L" | "R"; tier: 0 | 1 | 2 };
}
export interface MetroEdge { id: string; lineId: string; from: string; to: string; poly: MetroPoint[]; length: number; revealStartT: number; revealT: number; }
export interface MetroTrainStop { stationId: string; arriveT: number; departT: number; edgeToNext?: string; sprint?: boolean; }
export interface MetroTrainSchedule { lineId: string; stops: MetroTrainStop[]; }
export interface MetroStatics extends Record<string, unknown> {
  lanes: { count: 12; laneX: number[] };
  lines: MetroLine[];
  stations: MetroStation[];
  edges: MetroEdge[];
  trains: MetroTrainSchedule[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  compileLog: string[];
  compilerVersion: number;
}
export interface MetroPerformance extends Performance { concept: "metro"; statics: MetroStatics; }
