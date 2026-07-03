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
}
export interface MetroEdge { id: string; lineId: string; from: string; to: string; poly: MetroPoint[]; length: number; revealT: number; }
export interface MetroStatics extends Record<string, unknown> {
  lanes: { count: 12; laneX: number[] };
  lines: MetroLine[];
  stations: MetroStation[];
  edges: MetroEdge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  compileLog: string[];
  compilerVersion: number;
}
export interface MetroPerformance extends Performance { concept: "metro"; statics: MetroStatics; }
