import type { MarbleMotionMix } from "@reaper-viz/compiler-marble";
import { copyMarbleMotionMix, projectMarbleMotionMix, type MarbleMotionAxis } from "./marble-live-coordinator.js";

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export type MarblePinchFinger = "index" | "middle" | "ring";
export type MarbleHandControlPhase = "idle" | "candidate" | "engaged" | "holding";

export interface MarbleHandFrame {
  landmarks?: readonly HandLandmark[];
  confidence: number;
  timestampMs: number;
}

export interface MarbleHandControlResult {
  phase: MarbleHandControlPhase;
  finger?: MarblePinchFinger;
  axis?: MarbleMotionAxis;
  mix?: MarbleMotionMix;
}

export interface MarbleHandControlOptions {
  minimumConfidence?: number;
  engageDistance?: number;
  releaseDistance?: number;
  ambiguityMargin?: number;
  engageFrames?: number;
  engageMs?: number;
  trackingHoldMs?: number;
  percentPerFrameHeight?: number;
}

const FINGERTIPS: Record<MarblePinchFinger, number> = { index: 8, middle: 12, ring: 16 };
const FINGER_AXES: Record<MarblePinchFinger, MarbleMotionAxis> = { index: "upDown", middle: "leftRight", ring: "frontBack" };
const PALM_LANDMARKS = [0, 5, 9, 13, 17] as const;

function distance(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function palmScale(landmarks: readonly HandLandmark[]): number {
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  if (!indexMcp || !pinkyMcp) return 0;
  return distance(indexMcp, pinkyMcp);
}

function palmY(landmarks: readonly HandLandmark[]): number {
  const points = PALM_LANDMARKS.flatMap((index) => landmarks[index] ? [landmarks[index]!] : []);
  return points.length ? points.reduce((sum, point) => sum + point.y, 0) / points.length : 0;
}

function normalizedPinchDistances(landmarks: readonly HandLandmark[]): Array<{ finger: MarblePinchFinger; distance: number }> {
  const thumb = landmarks[4];
  const scale = palmScale(landmarks);
  if (!thumb || scale <= 1e-6) return [];
  return (Object.keys(FINGERTIPS) as MarblePinchFinger[]).flatMap((finger) => {
    const fingertip = landmarks[FINGERTIPS[finger]];
    return fingertip ? [{ finger, distance: distance(thumb, fingertip) / scale }] : [];
  }).sort((a, b) => a.distance - b.distance || a.finger.localeCompare(b.finger));
}

export class MarbleHandController {
  readonly #options: Required<MarbleHandControlOptions>;
  #candidate: MarblePinchFinger | undefined;
  #candidateStartedAt = 0;
  #candidateFrames = 0;
  #owner: MarblePinchFinger | undefined;
  #anchorY = 0;
  #anchorMix: MarbleMotionMix | undefined;
  #lastTrackedAt = Number.NEGATIVE_INFINITY;

  constructor(options: MarbleHandControlOptions = {}) {
    this.#options = {
      minimumConfidence: options.minimumConfidence ?? 0.6,
      engageDistance: options.engageDistance ?? 0.32,
      releaseDistance: options.releaseDistance ?? 0.44,
      ambiguityMargin: options.ambiguityMargin ?? 0.08,
      engageFrames: options.engageFrames ?? 3,
      engageMs: options.engageMs ?? 80,
      trackingHoldMs: options.trackingHoldMs ?? 220,
      percentPerFrameHeight: options.percentPerFrameHeight ?? 100,
    };
  }

  reset(): void {
    this.#candidate = undefined;
    this.#candidateFrames = 0;
    this.#owner = undefined;
    this.#anchorMix = undefined;
    this.#lastTrackedAt = Number.NEGATIVE_INFINITY;
  }

  update(frame: MarbleHandFrame, currentMix: MarbleMotionMix): MarbleHandControlResult {
    const tracked = frame.confidence >= this.#options.minimumConfidence && (frame.landmarks?.length ?? 0) >= 18;
    if (!tracked) {
      this.#candidate = undefined;
      this.#candidateFrames = 0;
      if (this.#owner && frame.timestampMs - this.#lastTrackedAt <= this.#options.trackingHoldMs) {
        return { phase: "holding", finger: this.#owner, axis: FINGER_AXES[this.#owner] };
      }
      this.reset();
      return { phase: "idle" };
    }

    const landmarks = frame.landmarks!;
    this.#lastTrackedAt = frame.timestampMs;
    const distances = normalizedPinchDistances(landmarks);
    if (this.#owner) {
      const ownerDistance = distances.find((entry) => entry.finger === this.#owner)?.distance ?? Number.POSITIVE_INFINITY;
      if (ownerDistance > this.#options.releaseDistance) {
        this.reset();
        return { phase: "idle" };
      }
      const axis = FINGER_AXES[this.#owner];
      const delta = (this.#anchorY - palmY(landmarks)) * this.#options.percentPerFrameHeight;
      const mix = projectMarbleMotionMix(axis, (this.#anchorMix ?? currentMix)[axis] + delta, this.#anchorMix ?? currentMix);
      return { phase: "engaged", finger: this.#owner, axis, mix };
    }

    const nearest = distances[0];
    const next = distances[1];
    const unambiguous = nearest && nearest.distance <= this.#options.engageDistance
      && (!next || next.distance - nearest.distance >= this.#options.ambiguityMargin);
    if (!unambiguous) {
      this.#candidate = undefined;
      this.#candidateFrames = 0;
      return { phase: "idle" };
    }
    if (this.#candidate !== nearest.finger) {
      this.#candidate = nearest.finger;
      this.#candidateStartedAt = frame.timestampMs;
      this.#candidateFrames = 1;
    } else {
      this.#candidateFrames += 1;
    }
    if (this.#candidateFrames < this.#options.engageFrames || frame.timestampMs - this.#candidateStartedAt < this.#options.engageMs) {
      return { phase: "candidate", finger: nearest.finger, axis: FINGER_AXES[nearest.finger] };
    }
    this.#owner = nearest.finger;
    this.#anchorY = palmY(landmarks);
    this.#anchorMix = copyMarbleMotionMix(currentMix);
    return { phase: "engaged", finger: this.#owner, axis: FINGER_AXES[this.#owner], mix: copyMarbleMotionMix(currentMix) };
  }
}
