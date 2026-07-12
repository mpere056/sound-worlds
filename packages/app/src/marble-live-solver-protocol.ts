import type { MarbleMotionMix } from "@reaper-viz/compiler-marble";

export type MarbleLiveVec3 = [number, number, number];

export interface MarbleLiveBodyState {
  position: MarbleLiveVec3;
  velocity: MarbleLiveVec3;
  radius: number;
  simulationTime: number;
}

export interface MarbleLiveNoteIntent {
  platformId: string;
  sequence: number;
  pitch: number;
  velocity: number;
  targetImpactTime: number;
}

export interface MarbleLiveReservedCollider {
  platformId: string;
  position: MarbleLiveVec3;
  rotation: MarbleLiveVec3;
  size: MarbleLiveVec3;
}

export interface MarbleLivePlatformPlacement extends MarbleLiveReservedCollider {
  contactPosition: MarbleLiveVec3;
  restitution: number;
  targetImpactTime: number;
  clearance: number;
}

export interface MarbleLiveSolveRequest {
  type: "solve-live-window";
  requestId: number;
  solveGeneration: number;
  motionMix: MarbleMotionMix;
  marble: MarbleLiveBodyState;
  notes: MarbleLiveNoteIntent[];
  reservedColliders: MarbleLiveReservedCollider[];
}

export interface MarbleLiveSolveSuccess {
  type: "live-window-solved";
  requestId: number;
  solveGeneration: number;
  placements: MarbleLivePlatformPlacement[];
  solveMs: number;
}

export interface MarbleLiveSolveFailure {
  type: "live-window-failed";
  requestId: number;
  solveGeneration: number;
  error: string;
  solveMs: number;
}

export type MarbleLiveSolveResult = MarbleLiveSolveSuccess | MarbleLiveSolveFailure;
