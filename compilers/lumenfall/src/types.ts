import type { Performance } from "@reaper-viz/core";

export type LumenfallVec3 = [number, number, number];

export interface LumenfallCompileOptions {
  sourceTrackId?: string;
  chordEpsilonSec?: number;
}

export interface LumenfallDeadline {
  id: string;
  t: number;
  pitch: number;
  velocity: number;
  duration: number;
  noteCount: number;
}

export interface LumenfallSlab {
  id: string;
  center: LumenfallVec3;
  size: LumenfallVec3;
  yaw: number;
  material: "dry-basalt" | "wet-basalt";
  contactPoint: LumenfallVec3;
  contactNormal: LumenfallVec3;
  row: number;
  lane: number;
}

export interface LumenfallWorld {
  worldId: "nocturne-causeway-graybox";
  worldSeed: string;
  gravity: LumenfallVec3;
  heroRadius: number;
  slabs: LumenfallSlab[];
  laneCount: number;
  rowCount: number;
  rowSpacing: number;
  laneSpacing: number;
  bounds: { min: LumenfallVec3; max: LumenfallVec3 };
}

export interface LumenfallSegment {
  id: string;
  kind: "launch" | "flight";
  t0: number;
  t1: number;
  p0: LumenfallVec3;
  p1: LumenfallVec3;
  v0: LumenfallVec3;
  gravity: LumenfallVec3;
  targetImpactId: string;
  apexT: number;
  apexHeight: number;
  minimumInteriorClearance: number;
}

export interface LumenfallImpact {
  id: string;
  deadlineId: string;
  noteIndex: number;
  t: number;
  slabId: string;
  point: LumenfallVec3;
  normal: LumenfallVec3;
  incomingVelocity: LumenfallVec3;
  passiveVelocity: LumenfallVec3;
  outgoingVelocity: LumenfallVec3;
  musicalImpulse: LumenfallVec3;
  restitution: number;
  friction: number;
  impactEnergy: number;
  lightIntensity: number;
  colorTemperatureK: number;
  afterglowSec: number;
}

export interface LumenfallReport {
  sourceTrackId: string;
  sourceTrackName: string;
  selectionReason: string;
  sourceNoteCount: number;
  groupedDeadlineCount: number;
  impactCount: number;
  segmentCount: number;
  maximumTimingError: number;
  maximumSpeed: number;
  maximumImpulse: number;
  maximumTangentialImpulseRatio: number;
  minimumInteriorClearance: number;
  earlyCollisionCount: number;
  worldSlabCount: number;
  warnings: string[];
}

export interface LumenfallPerformance extends Performance {
  concept: "lumenfall";
  statics: {
    sourceTrackId: string;
    deadlines: LumenfallDeadline[];
    world: LumenfallWorld;
    segments: LumenfallSegment[];
    impacts: LumenfallImpact[];
    report: LumenfallReport;
  };
}

export interface LumenfallPose {
  position: LumenfallVec3;
  velocity: LumenfallVec3;
  segmentId: string | null;
  grounded: boolean;
}
