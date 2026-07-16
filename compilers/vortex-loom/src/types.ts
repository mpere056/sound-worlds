import type { Performance } from "@reaper-viz/core";

export type VortexVec2 = [number, number];

export interface VortexLoomNote {
  trackId: string;
  pitch: number;
  velocity: number;
  duration: number;
}

export interface VortexLoomDeadline {
  id: string;
  t: number;
  notes: VortexLoomNote[];
  representativePitch: number;
  energy: number;
  duration: number;
}

export interface VortexLoomCompileOptions {
  sourceTrackId?: string;
  chordEpsilonSec?: number;
  seed?: string;
  fixedStepSec?: number;
  checkpointCadenceSec?: number;
  fiberCount?: number;
  pointsPerFiber?: number;
}

export interface VortexLoomResolvedOptions {
  sourceTrackId?: string;
  chordEpsilonSec: number;
  seed: string;
  fixedStepSec: number;
  checkpointCadenceSec: number;
  fiberCount: number;
  pointsPerFiber: number;
  chamberHalfWidth: number;
  chamberHalfHeight: number;
  baseDrift: number;
  baseSwirl: number;
}

export interface VortexLoomCompileReport {
  sourceTrackId: string;
  sourceTrackName: string;
  selectionReason: string;
  sourceNoteCount: number;
  groupedDeadlineCount: number;
  compoundDeadlineCount: number;
  firstDeadlineSec: number;
  finalDeadlineSec: number;
  minimumGapSec: number | null;
  warnings: string[];
}

export interface VortexLoomPlan {
  schemaVersion: 1;
  concept: "vortex-loom-plan";
  durationSec: number;
  options: VortexLoomResolvedOptions;
  deadlines: VortexLoomDeadline[];
  report: VortexLoomCompileReport;
}

export interface VortexLoomBaseFlow {
  chamberHalfWidth: number;
  chamberHalfHeight: number;
  drift: number;
  swirl: number;
}

export interface VortexLoomVortex {
  id: string;
  deadlineId: string;
  t: number;
  center: VortexVec2;
  coreRadius: number;
  interactionRadius: number;
  circulation: number;
  activationStart: number;
  activationPeak: number;
  activationEnd: number;
  entryDirection: VortexVec2;
  handedness: -1 | 1;
  pitch: number;
  energy: number;
  duration: number;
  stratum: number;
  pigment: string;
}

export interface VortexLoomRouteSample {
  t: number;
  position: VortexVec2;
  velocity: VortexVec2;
}

export interface VortexLoomInteraction {
  id: string;
  deadlineId: string;
  vortexId: string;
  t: number;
  position: VortexVec2;
  radialSpeed: number;
  tangentialSpeed: number;
  timingError: number;
  firstEntryTime: number;
}

export interface VortexLoomFiberLayout {
  fiberCount: number;
  pointsPerFiber: number;
  initialPositions: number[];
}

export interface VortexLoomFiberCheckpoint {
  t: number;
  positions: number[];
  checksum: number;
}

export interface VortexLoomRouteReport {
  deadlineCount: number;
  exactEntryError: number;
  maximumNumericalDivergence: number;
  minimumCoreClearance: number | null;
  minimumChamberMargin: number;
  minimumInwardRadialSpeed: number | null;
  earlyEntryCount: number;
  checkpointCount: number;
  checkpointReplayError: number;
  violations: string[];
  warnings: string[];
}

export interface VortexLoomPerformance extends Performance {
  concept: "vortex-loom";
  statics: {
    sourceTrackId: string;
    planReport: VortexLoomCompileReport;
    routeReport: VortexLoomRouteReport;
    baseFlow: VortexLoomBaseFlow;
    vortices: VortexLoomVortex[];
    route: VortexLoomRouteSample[];
    interactions: VortexLoomInteraction[];
    fibers: VortexLoomFiberLayout;
    fiberCheckpoints: VortexLoomFiberCheckpoint[];
  };
}
