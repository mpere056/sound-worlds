import type { Performance } from "@reaper-viz/core";

export interface PaintingPoint { x: number; y: number; z?: number; }

export type PaintingLayer = "sketch" | "wash" | "terrain" | "subject" | "rhythm" | "texture" | "glaze" | "signature";
export type PaintingStrokeKind = "guide" | "wash" | "ring" | "bloom" | "ribbon" | "terrain" | "dab" | "splatter" | "stipple" | "glaze" | "signature";

export interface PaintingStroke {
  id: string;
  t: number;
  tEnd: number;
  layer: PaintingLayer;
  kind: PaintingStrokeKind;
  role: string;
  color: string;
  alpha: number;
  width: number;
  points: PaintingPoint[];
  radius?: number;
  rotation?: number;
  symmetry?: number;
  stain?: number;
  roughness: number;
  label?: string;
}

export interface PaintingGrain {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

export interface PaintingStatics extends Record<string, unknown> {
  strokes: PaintingStroke[];
  grain: PaintingGrain[];
  signature: { text: string; t: number; pos: PaintingPoint };
  strokeCounts: Record<PaintingLayer, number>;
  compileLog: string[];
  compilerVersion: number;
}

export interface PaintingPerformance extends Performance { concept: "painting"; statics: PaintingStatics; }
