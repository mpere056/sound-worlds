import { describe, expect, it } from "vitest";
import type { MarbleMotionMix } from "@reaper-viz/compiler-marble";
import { MarbleHandController, type HandLandmark, type MarblePinchFinger } from "./marble-hand-control.js";

const initial: MarbleMotionMix = { leftRight: 20, upDown: 20, frontBack: 60 };

function hand(pinches: MarblePinchFinger[], verticalOffset = 0): HandLandmark[] {
  const landmarks = Array.from({ length: 21 }, (_, index) => ({ x: 0.38 + (index % 5) * 0.06, y: 0.62 - Math.floor(index / 5) * 0.04, z: 0 }));
  landmarks[0] = { x: 0.5, y: 0.72, z: 0 };
  landmarks[5] = { x: 0.4, y: 0.6, z: 0 };
  landmarks[9] = { x: 0.47, y: 0.57, z: 0 };
  landmarks[13] = { x: 0.54, y: 0.59, z: 0 };
  landmarks[17] = { x: 0.6, y: 0.62, z: 0 };
  landmarks[4] = { x: 0.5, y: 0.5, z: 0 };
  landmarks[8] = { x: 0.68, y: 0.48, z: 0 };
  landmarks[12] = { x: 0.64, y: 0.43, z: 0 };
  landmarks[16] = { x: 0.62, y: 0.55, z: 0 };
  const tips: Record<MarblePinchFinger, number> = { index: 8, middle: 12, ring: 16 };
  pinches.forEach((finger, index) => { landmarks[tips[finger]] = { x: 0.51 + index * 0.005, y: 0.5, z: 0 }; });
  return landmarks.map((point) => ({ ...point, y: point.y + verticalOffset }));
}

function engage(controller: MarbleHandController, finger: MarblePinchFinger, mix = initial): void {
  [0, 30, 60, 90].forEach((timestampMs) => controller.update({ landmarks: hand([finger]), confidence: 0.95, timestampMs }, mix));
}

describe("Marble hand control", () => {
  it.each([
    ["index", "upDown"],
    ["middle", "leftRight"],
    ["ring", "frontBack"],
  ] as const)("maps a thumb-%s pinch to %s", (finger, axis) => {
    const controller = new MarbleHandController();
    const early = controller.update({ landmarks: hand([finger]), confidence: 0.95, timestampMs: 0 }, initial);
    expect(early.phase).toBe("candidate");
    engage(controller, finger);
    const moved = controller.update({ landmarks: hand([finger], -0.1), confidence: 0.95, timestampMs: 120 }, initial);
    expect(moved.phase).toBe("engaged");
    expect(moved.axis).toBe(axis);
    expect(moved.mix![axis]).toBe(initial[axis] + 10);
    expect(moved.mix!.leftRight + moved.mix!.upDown + moved.mix!.frontBack).toBe(100);
  });

  it("rejects ambiguous pinches instead of switching controls", () => {
    const controller = new MarbleHandController();
    for (const timestampMs of [0, 40, 80, 120]) {
      expect(controller.update({ landmarks: hand(["index", "middle"]), confidence: 0.95, timestampMs }, initial).phase).toBe("idle");
    }
  });

  it("holds briefly through tracking loss and then disengages", () => {
    const controller = new MarbleHandController();
    engage(controller, "ring");
    expect(controller.update({ confidence: 0, timestampMs: 200 }, initial)).toMatchObject({ phase: "holding", finger: "ring" });
    expect(controller.update({ confidence: 0, timestampMs: 400 }, initial)).toEqual({ phase: "idle" });
  });

  it("uses release hysteresis so small pinch noise does not disengage", () => {
    const controller = new MarbleHandController();
    engage(controller, "index");
    const noisy = hand(["index"]);
    noisy[8] = { x: 0.575, y: 0.5, z: 0 };
    expect(controller.update({ landmarks: noisy, confidence: 0.95, timestampMs: 120 }, initial).phase).toBe("engaged");
    expect(controller.update({ landmarks: hand([]), confidence: 0.95, timestampMs: 150 }, initial).phase).toBe("idle");
  });
});
