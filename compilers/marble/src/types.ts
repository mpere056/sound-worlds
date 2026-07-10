import type { Performance } from "@reaper-viz/core";

export type MarbleTargetKind = "plate" | "peg" | "chime" | "resonator" | "gate";
export type MarbleClusterKind = "single" | "rattle" | "cascade" | "roll";
export type MarblePathKind = "spawn" | "drop" | "rail" | "arc" | "rattle" | "cascade" | "hold" | "settle";
export type MarbleEasing = "linear" | "smoothstep" | "easeIn" | "easeOut" | "ballistic";
export type MarbleMaterial = "painted-metal" | "brass" | "glass" | "rubber" | "glow";

export interface MarbleSource {
  trackId: string;
  trackName: string;
  role: string;
  selectionMode: "auto" | "manual";
  noteCount: number;
  selectionReason: string;
}

export interface MarbleTrackMetrics {
  firstNoteT: number;
  lastNoteT: number;
  pitchMin: number;
  pitchMax: number;
  pitchRange: number;
  velocityMin: number;
  velocityMax: number;
  gapMin: number | null;
  gapMedian: number | null;
  gapMean: number | null;
  gapMax: number | null;
  denseClusterCount: number;
}

export interface MarbleMotionMix {
  leftRight: number;
  upDown: number;
  frontBack: number;
}

export type MarbleCompilePhase =
  | "selectTrack"
  | "metrics"
  | "motionSolve"
  | "targets"
  | "targetValidation"
  | "clustersAndImpacts"
  | "path"
  | "pathValidation"
  | "finalize";

export interface MarbleCompileCounters {
  solverIterations: number;
  targetCandidates: number;
  normalRejects: number;
  overlapRejects: number;
  clearanceRejects: number;
  overlapChecks: number;
  routeClearanceSamples: number;
}

export interface MarbleCompileProfile {
  totalMs: number;
  phasesMs: Record<MarbleCompilePhase, number>;
  counters: MarbleCompileCounters;
}

export interface MarbleCompileInstrumentation {
  now(): number;
  report(profile: MarbleCompileProfile): void;
}

export interface MarbleTarget {
  id: string;
  kind: MarbleTargetKind;
  pitch: number;
  pitchClass: number;
  pos: [number, number, number];
  contactPos: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
  color: string;
  material: MarbleMaterial;
  familyId: string;
}

export interface MarbleImpact {
  id: string;
  noteIndex: number;
  t: number;
  pitch: number;
  velocity: number;
  duration: number;
  targetId: string;
  clusterId?: string;
}

export interface MarbleCluster {
  id: string;
  kind: MarbleClusterKind;
  noteIndices: number[];
  t0: number;
  t1: number;
  targetIds: string[];
}

export interface MarblePathSegment {
  id: string;
  t0: number;
  t1: number;
  from: [number, number, number];
  to: [number, number, number];
  kind: MarblePathKind;
  easing: MarbleEasing;
  control?: [number, number, number];
  control2?: [number, number, number];
  contactNormalStart?: [number, number, number];
  contactNormal?: [number, number, number];
  tangentIn?: [number, number, number];
  tangentOut?: [number, number, number];
  railRadius?: number;
  bank?: number;
  gravityScale?: number;
  restitution?: number;
  arcHeight?: number;
  arcLength?: number;
  arcSamples?: number[];
  targetId?: string;
  clusterId?: string;
}

export interface MarbleTail {
  audioEndT: number;
  finalNoteT: number;
  hasAudibleTail: boolean;
  resonanceTargets: string[];
}

export interface MarbleDiagnostics {
  droppedNotes: number;
  timingMismatches: number;
  teleportSegments: number;
  impossibleGaps: Array<{ noteIndex: number; gap: number; resolution: string }>;
  compileLog: string[];
}

export interface MarblePose {
  pos: [number, number, number];
  quat: [number, number, number, number];
  tangent: [number, number, number];
  normal: [number, number, number];
  speed: number;
  spin: number;
  contact: boolean;
  segmentId: string;
  kind: MarblePathKind;
  progress: number;
}

export interface MarbleStatics extends Record<string, unknown> {
  compilerVersion: number;
  motionMix: MarbleMotionMix;
  actualMotionMix: MarbleMotionMix;
  source: MarbleSource;
  metrics: MarbleTrackMetrics;
  targets: MarbleTarget[];
  impacts: MarbleImpact[];
  path: MarblePathSegment[];
  clusters: MarbleCluster[];
  tail: MarbleTail;
  diagnostics: MarbleDiagnostics;
}

export interface MarblePerformance extends Performance {
  concept: "marble";
  statics: MarbleStatics;
}

export interface CompileMarbleOptions {
  sourceTrackId?: string;
  motionMix?: Partial<MarbleMotionMix>;
  instrumentation?: MarbleCompileInstrumentation;
}
