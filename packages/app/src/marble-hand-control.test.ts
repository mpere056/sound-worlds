import { describe, expect, it } from "vitest";
import type { MarbleMotionMix } from "@reaper-viz/compiler-marble";
import { MarbleHandController, OneEuroFilter, type HandLandmark, type MarblePinchFinger } from "./marble-hand-control.js";

const initial: MarbleMotionMix = { leftRight: 20, upDown: 20, frontBack: 60 };

function hand(pinch?: MarblePinchFinger, offset = { x: 0, y: 0 }, scale = 1): HandLandmark[] {
  const landmarks = Array.from({ length: 21 }, (_, index) => ({ x: 0.38 + (index % 5) * 0.06, y: 0.62 - Math.floor(index / 5) * 0.04, z: 0 }));
  landmarks[0] = { x: 0.5, y: 0.72, z: 0 };
  landmarks[5] = { x: 0.4, y: 0.6, z: 0 };
  landmarks[9] = { x: 0.47, y: 0.57, z: 0 };
  landmarks[13] = { x: 0.54, y: 0.59, z: 0 };
  landmarks[17] = { x: 0.6, y: 0.62, z: 0 };
  landmarks[4] = { x: 0.5, y: 0.5, z: 0 };
  landmarks[8] = { x: 0.68, y: 0.48, z: 0 };
  landmarks[12] = { x: 0.64, y: 0.43, z: 0 };
  if (pinch) landmarks[pinch === "index" ? 8 : 12] = { x: 0.51, y: 0.5, z: 0 };
  return landmarks.map((point) => ({
    x: 0.5 + (point.x - 0.5) * scale + offset.x,
    y: 0.58 + (point.y - 0.58) * scale + offset.y,
    z: point.z,
  }));
}

function engage(controller: MarbleHandController, finger: MarblePinchFinger): void {
  [0, 30, 60, 90].forEach((timestampMs) => controller.update({ landmarks: hand(finger), confidence: 0.95, timestampMs }, initial));
}

describe("Marble hand control", () => {
  it("attenuates stationary landmark noise while retaining fast motion", () => {
    const filter = new OneEuroFilter();
    const noisy = [0.5, 0.512, 0.489, 0.51, 0.491, 0.506];
    const filtered = noisy.map((value, index) => filter.update(value, index * 33));
    const rawRange = Math.max(...noisy) - Math.min(...noisy);
    const settledRange = Math.max(...filtered.slice(2)) - Math.min(...filtered.slice(2));
    expect(settledRange).toBeLessThan(rawRange * 0.45);
    const moved = filter.update(0.7, 220);
    expect(moved).toBeGreaterThan(0.55);
    expect(moved).toBeLessThan(0.7);
  });

  it("maps index-thumb spatial movement to all three motion axes", () => {
    const controller = new MarbleHandController();
    engage(controller, "index");
    const lateral = controller.update({ landmarks: hand("index", { x: -0.1, y: 0 }), confidence: 0.95, timestampMs: 120 }, initial).mix!;
    expect(lateral.leftRight).toBeGreaterThan(initial.leftRight);
    const vertical = controller.update({ landmarks: hand("index", { x: 0, y: -0.1 }), confidence: 0.95, timestampMs: 150 }, initial).mix!;
    expect(vertical.upDown).toBeGreaterThan(initial.upDown);
    const depth = controller.update({ landmarks: hand("index", { x: 0, y: 0 }, 1.35), confidence: 0.95, timestampMs: 180 }, initial).mix!;
    expect(depth.frontBack).toBeGreaterThan(initial.frontBack);
    expect(depth.leftRight + depth.upDown + depth.frontBack).toBe(100);
  });

  it("maps middle-thumb movement to bounded camera orbit and distance", () => {
    const controller = new MarbleHandController();
    engage(controller, "middle");
    const result = controller.update({ landmarks: hand("middle", { x: -0.1, y: -0.1 }, 1.25), confidence: 0.95, timestampMs: 120 }, initial, { yaw: 0, pitch: 0, distance: 0 });
    expect(result.mix).toBeUndefined();
    expect(result.camera!.yaw).toBeGreaterThan(0);
    expect(result.camera!.pitch).toBeGreaterThan(0);
    expect(result.camera!.distance).toBeLessThan(0);
  });

  it("rejects ambiguous index and middle pinches", () => {
    const controller = new MarbleHandController();
    const ambiguous = hand("index");
    ambiguous[12] = { ...ambiguous[8]! };
    for (const timestampMs of [0, 40, 80, 120]) expect(controller.update({ landmarks: ambiguous, confidence: 0.95, timestampMs }, initial).phase).toBe("idle");
  });

  it("holds briefly through tracking loss and then disengages", () => {
    const controller = new MarbleHandController();
    engage(controller, "middle");
    expect(controller.update({ confidence: 0, timestampMs: 200 }, initial)).toMatchObject({ phase: "holding", finger: "middle" });
    expect(controller.update({ confidence: 0, timestampMs: 400 }, initial)).toEqual({ phase: "idle" });
  });

  it("uses release hysteresis so small pinch noise does not disengage", () => {
    const controller = new MarbleHandController();
    engage(controller, "index");
    const noisy = hand("index");
    noisy[8] = { x: 0.575, y: 0.5, z: 0 };
    expect(controller.update({ landmarks: noisy, confidence: 0.95, timestampMs: 120 }, initial).phase).toBe("engaged");
    expect(controller.update({ landmarks: hand(), confidence: 0.95, timestampMs: 150 }, initial).phase).toBe("idle");
  });
});
