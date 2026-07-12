export interface BrickHitNote {
  trackId: string;
  pitch: number;
  velocity: number;
  duration: number;
}

export interface BrickHitGroup {
  id: string;
  t: number;
  notes: BrickHitNote[];
  representativePitch: number;
  energy: number;
}

export interface BrickBreakerCompileOptions {
  sourceTrackId?: string;
  chordEpsilonSec?: number;
  seed?: string;
  board?: { width: number; height: number };
}

export interface BrickBreakerResolvedOptions {
  chordEpsilonSec: number;
  seed: string;
  board: { width: number; height: number };
}

export interface BrickBreakerCompileReport {
  sourceTrackId: string;
  sourceTrackName: string;
  selectionReason: string;
  sourceNoteCount: number;
  groupedHitCount: number;
  generatedBrickCount: number;
  compoundGroupCount: number;
  chordCellCount: number;
  firstHitSec: number;
  finalHitSec: number;
  minimumGapSec: number | null;
  gapHistogram: Record<"dense" | "short" | "medium" | "long", number>;
  warnings: string[];
}

export interface BrickBreakerPlan {
  schemaVersion: 1;
  concept: "brick-breaker-plan";
  durationSec: number;
  options: BrickBreakerResolvedOptions;
  hitGroups: BrickHitGroup[];
  report: BrickBreakerCompileReport;
}

export interface BrickBreakerBrick {
  id: string;
  hitGroupId: string;
  destructionT: number;
  position: BrickVec2;
  size: BrickVec2;
  rotation: number;
  color: string;
  cells: number;
  energy: number;
}

export interface BrickBreakerBallSegment {
  id: string;
  kind: "launch" | "travel" | "wall" | "paddle" | "tail";
  t0: number;
  t1: number;
  from: BrickVec2;
  to: BrickVec2;
  velocity: BrickVec2;
  contactBrickId?: string;
  supportNormal?: BrickVec2;
}

export interface BrickBreakerPaddleContact { t: number; x: number; }

export interface BrickBreakerPerformance extends Performance {
  concept: "brick-breaker";
  statics: {
    sourceTrackId: string;
    report: BrickBreakerCompileReport;
    board: { width: number; height: number };
    ballRadius: number;
    bricks: BrickBreakerBrick[];
    ballSegments: BrickBreakerBallSegment[];
    paddleContacts: BrickBreakerPaddleContact[];
    ballSpeed: number;
    finalBrickId: string;
  };
}
import type { Performance } from "@reaper-viz/core";
import type { BrickVec2 } from "./physics.js";
