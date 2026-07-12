import type { Performance } from "@reaper-viz/core";

export type AuroraVec3 = [number, number, number];

export interface AuroraNote {
  trackId: string;
  pitch: number;
  velocity: number;
  duration: number;
}

export interface AuroraDeadline {
  id: string;
  t: number;
  notes: AuroraNote[];
  representativePitch: number;
  energy: number;
}

export interface AuroraCompileOptions {
  sourceTrackId?: string;
  chordEpsilonSec?: number;
  seed?: string;
  charge?: number;
  mass?: number;
  maxMagneticField?: number;
  maxElectricField?: number;
  minimumCoilSpacing?: number;
}

export interface AuroraResolvedOptions {
  chordEpsilonSec: number;
  seed: string;
  charge: number;
  mass: number;
  maxMagneticField: number;
  maxElectricField: number;
  minimumCoilSpacing: number;
}

export interface AuroraCompileReport {
  sourceTrackId: string;
  sourceTrackName: string;
  selectionReason: string;
  sourceNoteCount: number;
  groupedDeadlineCount: number;
  compoundDeadlineCount: number;
  firstDeadlineSec: number;
  finalDeadlineSec: number;
  minimumGapSec: number | null;
  gapHistogram: Record<"dense" | "short" | "medium" | "long", number>;
  idealFieldModel: true;
  warnings: string[];
}

export interface AuroraPlan {
  schemaVersion: 1;
  concept: "aurora-cyclotron-plan";
  durationSec: number;
  options: AuroraResolvedOptions;
  deadlines: AuroraDeadline[];
  report: AuroraCompileReport;
}

export interface AuroraParticleState {
  position: AuroraVec3;
  velocity: AuroraVec3;
}

export interface AuroraConstantField {
  electric: AuroraVec3;
  magnetic: AuroraVec3;
}

export interface AuroraFiniteSolenoid {
  center: AuroraVec3;
  axis: AuroraVec3;
  axialField: number;
  halfLength: number;
  fringeWidth: number;
  apertureRadius: number;
}

export interface AuroraPropagationOptions {
  charge: number;
  mass: number;
}

export interface AuroraPropagationResult extends AuroraParticleState {
  duration: number;
  electricWork: number;
  kineticEnergyDelta: number;
  magneticWork: 0;
}

export interface AuroraNumericalPropagationResult extends AuroraParticleState {
  duration: number;
  electricWork: number;
  kineticEnergyDelta: number;
  energyResidual: number;
}

export interface AuroraIdealArcRequest {
  state: AuroraParticleState;
  duration: number;
  turnAngle: number;
  fieldAxis: AuroraVec3;
  charge: number;
  mass: number;
  maxMagneticField: number;
}

export interface AuroraIdealArcSolution {
  start: AuroraParticleState;
  end: AuroraParticleState;
  duration: number;
  turnAngle: number;
  signedAngularVelocity: number;
  field: AuroraConstantField;
  fieldMagnitude: number;
  curvatureRadius: number | null;
  pathLength: number;
  coilCenter: AuroraVec3;
  coilAxis: AuroraVec3;
  arrivalDirection: AuroraVec3;
}

export interface AuroraRouteSegment {
  id: string;
  kind: "deadline" | "tail";
  deadlineId?: string;
  t0: number;
  t1: number;
  start: AuroraParticleState;
  end: AuroraParticleState;
  field: AuroraConstantField;
  charge: number;
  mass: number;
  turnAngle: number;
  fieldMagnitude: number;
  family: "planar" | "depth" | "inward" | "tail";
}

export interface AuroraCoil {
  id: string;
  deadlineId: string;
  t: number;
  center: AuroraVec3;
  axis: AuroraVec3;
  arrivalDirection: AuroraVec3;
  pitch: number;
  energy: number;
  radius: number;
  tubeRadius: number;
  color: string;
}

export interface AuroraRouteReport {
  deadlineCount: number;
  segmentCount: number;
  maximumField: number;
  maximumRouteRadius: number;
  minimumCoilSpacing: number | null;
  minimumCoilSurfaceClearance: number | null;
  minimumParticleClearance: number | null;
  exactCrossingError: number;
  familyCounts: Record<"planar" | "depth" | "inward", number>;
  occupancyViolations: string[];
  warnings: string[];
}

export interface AuroraPerformance extends Performance {
  concept: "aurora-cyclotron";
  statics: {
    sourceTrackId: string;
    planReport: AuroraCompileReport;
    routeReport: AuroraRouteReport;
    particleRadius: number;
    coils: AuroraCoil[];
    route: AuroraRouteSegment[];
  };
}
