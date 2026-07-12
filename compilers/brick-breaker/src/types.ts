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
