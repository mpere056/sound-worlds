import type { HandLandmark } from "./marble-hand-control.js";

export interface MarbleHandWorkerInitialize {
  type: "initialize";
  wasmRoot: string;
  modelPath: string;
}

export interface MarbleHandWorkerFrame {
  type: "frame";
  frame: ImageBitmap;
  timestampMs: number;
}

export type MarbleHandWorkerInbound = MarbleHandWorkerInitialize | MarbleHandWorkerFrame;

export interface MarbleHandWorkerReady { type: "ready"; }
export interface MarbleHandWorkerResult {
  type: "result";
  timestampMs: number;
  inferenceMs: number;
  confidence: number;
  handedness?: string;
  landmarks?: HandLandmark[];
}
export interface MarbleHandWorkerFailure { type: "failed"; error: string; }

export type MarbleHandWorkerOutbound = MarbleHandWorkerReady | MarbleHandWorkerResult | MarbleHandWorkerFailure;
