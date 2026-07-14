import type { Performance } from "@reaper-viz/core";

export type PhaseglassVec3 = [number, number, number];

export interface PhaseglassNote {
  trackId: string;
  pitch: number;
  velocity: number;
  duration: number;
}

export interface PhaseglassDeadline {
  id: string;
  t: number;
  notes: PhaseglassNote[];
  representativePitch: number;
  energy: number;
}

export interface PhaseglassCompileOptions {
  sourceTrackId?: string;
  chordEpsilonSec?: number;
  seed?: string;
  signalSpeed?: number;
  minimumMembraneSpacing?: number;
}

export interface PhaseglassResolvedOptions {
  sourceTrackId?: string;
  chordEpsilonSec: number;
  seed: string;
  signalSpeed: number;
  minimumMembraneSpacing: number;
  mode: "active-phase";
}

export interface PhaseglassCompileReport {
  sourceTrackId: string;
  sourceTrackName: string;
  selectionReason: string;
  sourceNoteCount: number;
  groupedDeadlineCount: number;
  compoundDeadlineCount: number;
  firstDeadlineSec: number;
  finalDeadlineSec: number;
  minimumGapSec: number | null;
  mode: "active-phase";
  warnings: string[];
}

export interface PhaseglassPlan {
  schemaVersion: 1;
  concept: "phaseglass-plan";
  durationSec: number;
  options: PhaseglassResolvedOptions;
  deadlines: PhaseglassDeadline[];
  report: PhaseglassCompileReport;
}

export interface PhaseglassRayState {
  position: PhaseglassVec3;
  direction: PhaseglassVec3;
  speed: number;
}

export interface PhaseglassRouteSegment {
  id: string;
  kind: "deadline" | "tail";
  deadlineId?: string;
  t0: number;
  t1: number;
  start: PhaseglassRayState;
  end: PhaseglassRayState;
}

export interface PhaseglassMembrane {
  id: string;
  deadlineId: string;
  t: number;
  center: PhaseglassVec3;
  normal: PhaseglassVec3;
  axisU: PhaseglassVec3;
  axisV: PhaseglassVec3;
  incomingDirection: PhaseglassVec3;
  outgoingDirection: PhaseglassVec3;
  phaseGradient: PhaseglassVec3;
  radius: number;
  thickness: number;
  pitch: number;
  energy: number;
  duration: number;
  color: string;
}

export interface PhaseglassRouteReport {
  deadlineCount: number;
  segmentCount: number;
  exactCrossingError: number;
  maximumSpeedError: number;
  minimumMembraneClearance: number | null;
  earlyCrossingCount: number;
  occupancyViolations: string[];
  maximumRouteRadius: number;
  warnings: string[];
}

export interface PhaseglassPerformance extends Performance {
  concept: "phaseglass";
  statics: {
    sourceTrackId: string;
    planReport: PhaseglassCompileReport;
    routeReport: PhaseglassRouteReport;
    membranes: PhaseglassMembrane[];
    route: PhaseglassRouteSegment[];
  };
}
