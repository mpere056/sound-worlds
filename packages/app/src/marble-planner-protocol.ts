import type { Song } from "@reaper-viz/core";
import type { MarbleCompileProfile, MarbleMotionMix, MarblePerformance } from "@reaper-viz/compiler-marble";

export interface MarblePlannerInitialize {
  type: "initialize";
  projectGeneration: number;
  song: Song;
}

export interface MarblePlannerRequest {
  type: "plan";
  projectGeneration: number;
  requestId: number;
  motionMix: MarbleMotionMix;
  profile: boolean;
  sourceTrackId?: string;
}

export type MarblePlannerInbound = MarblePlannerInitialize | MarblePlannerRequest;

export interface MarblePlannerSuccess {
  type: "planned";
  projectGeneration: number;
  requestId: number;
  performance: MarblePerformance;
  compileProfile?: MarbleCompileProfile;
}

export interface MarblePlannerFailure {
  type: "failed";
  projectGeneration: number;
  requestId: number;
  error: string;
}

export type MarblePlannerOutbound = MarblePlannerSuccess | MarblePlannerFailure;
