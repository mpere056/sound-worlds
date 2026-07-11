import type { MarbleMotionMix } from "@reaper-viz/compiler-marble";
import { copyMarbleMotionMix, projectMarbleMotionVector } from "./marble-live-coordinator.js";

export interface HandLandmark { x: number; y: number; z: number; }
export type MarblePinchFinger = "index" | "middle";
export type MarbleHandControlPhase = "idle" | "candidate" | "engaged" | "holding";

export interface MarbleHandCameraControl {
  yaw: number;
  pitch: number;
  distance: number;
}

export interface MarbleHandFrame {
  landmarks?: readonly HandLandmark[];
  confidence: number;
  timestampMs: number;
}

export interface MarbleHandControlResult {
  phase: MarbleHandControlPhase;
  finger?: MarblePinchFinger;
  mix?: MarbleMotionMix;
  camera?: MarbleHandCameraControl;
}

export interface MarbleHandControlOptions {
  minimumConfidence?: number;
  engageDistance?: number;
  releaseDistance?: number;
  ambiguityMargin?: number;
  engageFrames?: number;
  engageMs?: number;
  trackingHoldMs?: number;
  lateralPercentPerFrameWidth?: number;
  verticalPercentPerFrameHeight?: number;
  depthPercentPerScaleOctave?: number;
  cameraYawPerFrameWidth?: number;
  cameraPitchPerFrameHeight?: number;
  cameraDistancePerScaleOctave?: number;
}

const FINGERTIPS: Record<MarblePinchFinger, number> = { index: 8, middle: 12 };
const PALM_LANDMARKS = [0, 5, 9, 13, 17] as const;
const ZERO_CAMERA: MarbleHandCameraControl = { yaw: 0, pitch: 0, distance: 0 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function distance(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function palmScale(landmarks: readonly HandLandmark[]): number {
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  return indexMcp && pinkyMcp ? distance(indexMcp, pinkyMcp) : 0;
}

function palmCenter(landmarks: readonly HandLandmark[]): HandLandmark {
  const points = PALM_LANDMARKS.flatMap((index) => landmarks[index] ? [landmarks[index]!] : []);
  if (!points.length) return { x: 0, y: 0, z: 0 };
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length, z: sum.z + point.z / points.length }), { x: 0, y: 0, z: 0 });
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
  #anchorPalm: HandLandmark = { x: 0, y: 0, z: 0 };
  #anchorScale = 1;
  #anchorMix: MarbleMotionMix | undefined;
  #anchorCamera: MarbleHandCameraControl = { ...ZERO_CAMERA };
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
      lateralPercentPerFrameWidth: options.lateralPercentPerFrameWidth ?? 100,
      verticalPercentPerFrameHeight: options.verticalPercentPerFrameHeight ?? 100,
      depthPercentPerScaleOctave: options.depthPercentPerScaleOctave ?? 32,
      cameraYawPerFrameWidth: options.cameraYawPerFrameWidth ?? 3.2,
      cameraPitchPerFrameHeight: options.cameraPitchPerFrameHeight ?? 2.4,
      cameraDistancePerScaleOctave: options.cameraDistancePerScaleOctave ?? 2.2,
    };
  }

  reset(): void {
    this.#candidate = undefined;
    this.#candidateFrames = 0;
    this.#owner = undefined;
    this.#anchorMix = undefined;
    this.#lastTrackedAt = Number.NEGATIVE_INFINITY;
  }

  update(frame: MarbleHandFrame, currentMix: MarbleMotionMix, currentCamera: MarbleHandCameraControl = ZERO_CAMERA): MarbleHandControlResult {
    const tracked = frame.confidence >= this.#options.minimumConfidence && (frame.landmarks?.length ?? 0) >= 18;
    if (!tracked) {
      this.#candidate = undefined;
      this.#candidateFrames = 0;
      if (this.#owner && frame.timestampMs - this.#lastTrackedAt <= this.#options.trackingHoldMs) return { phase: "holding", finger: this.#owner };
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
      const palm = palmCenter(landmarks);
      const scaleRatio = Math.max(1e-4, palmScale(landmarks) / this.#anchorScale);
      const depthOctaves = Math.log2(scaleRatio);
      if (this.#owner === "index") {
        const anchor = this.#anchorMix ?? currentMix;
        return {
          phase: "engaged",
          finger: "index",
          mix: projectMarbleMotionVector({
            leftRight: anchor.leftRight + (this.#anchorPalm.x - palm.x) * this.#options.lateralPercentPerFrameWidth,
            upDown: anchor.upDown + (this.#anchorPalm.y - palm.y) * this.#options.verticalPercentPerFrameHeight,
            frontBack: anchor.frontBack + depthOctaves * this.#options.depthPercentPerScaleOctave,
          }),
        };
      }
      return {
        phase: "engaged",
        finger: "middle",
        camera: {
          yaw: clamp(this.#anchorCamera.yaw + (this.#anchorPalm.x - palm.x) * this.#options.cameraYawPerFrameWidth, -Math.PI, Math.PI),
          pitch: clamp(this.#anchorCamera.pitch + (this.#anchorPalm.y - palm.y) * this.#options.cameraPitchPerFrameHeight, -0.8, 0.8),
          distance: clamp(this.#anchorCamera.distance - depthOctaves * this.#options.cameraDistancePerScaleOctave, -3, 3),
        },
      };
    }

    const nearest = distances[0];
    const next = distances[1];
    const unambiguous = nearest && nearest.distance <= this.#options.engageDistance && (!next || next.distance - nearest.distance >= this.#options.ambiguityMargin);
    if (!unambiguous) {
      this.#candidate = undefined;
      this.#candidateFrames = 0;
      return { phase: "idle" };
    }
    if (this.#candidate !== nearest.finger) {
      this.#candidate = nearest.finger;
      this.#candidateStartedAt = frame.timestampMs;
      this.#candidateFrames = 1;
    } else this.#candidateFrames += 1;
    if (this.#candidateFrames < this.#options.engageFrames || frame.timestampMs - this.#candidateStartedAt < this.#options.engageMs) return { phase: "candidate", finger: nearest.finger };

    this.#owner = nearest.finger;
    this.#anchorPalm = palmCenter(landmarks);
    this.#anchorScale = Math.max(1e-4, palmScale(landmarks));
    this.#anchorMix = copyMarbleMotionMix(currentMix);
    this.#anchorCamera = { ...currentCamera };
    return this.#owner === "index"
      ? { phase: "engaged", finger: "index", mix: copyMarbleMotionMix(currentMix) }
      : { phase: "engaged", finger: "middle", camera: { ...currentCamera } };
  }
}
