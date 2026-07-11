/// <reference lib="webworker" />

import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { MarbleHandWorkerInbound, MarbleHandWorkerOutbound } from "./marble-hand-worker-protocol.js";

const scope = self as DedicatedWorkerGlobalScope;
let landmarker: HandLandmarker | undefined;

function post(message: MarbleHandWorkerOutbound): void {
  scope.postMessage(message);
}

scope.onmessage = async (event: MessageEvent<MarbleHandWorkerInbound>) => {
  const message = event.data;
  if (message.type === "initialize") {
    try {
      // Module workers cannot expose ModuleFactory from MediaPipe's classic
      // importScripts loader. Select the ESM loader explicitly.
      const vision = await FilesetResolver.forVisionTasks(message.wasmRoot, true);
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: message.modelPath, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.55,
      });
      post({ type: "ready" });
    } catch (error) {
      post({ type: "failed", error: error instanceof Error ? error.message : "Hand tracker initialization failed" });
    }
    return;
  }
  const startedAt = performance.now();
  try {
    if (!landmarker) throw new Error("Hand tracker is not initialized");
    const result = landmarker.detectForVideo(message.frame, message.timestampMs);
    const handedness = result.handedness[0]?.[0];
    const landmarks = result.landmarks[0]?.map((point) => ({ x: point.x, y: point.y, z: point.z }));
    post({
      type: "result",
      timestampMs: message.timestampMs,
      inferenceMs: performance.now() - startedAt,
      confidence: handedness?.score ?? (landmarks ? 1 : 0),
      ...(handedness?.categoryName ? { handedness: handedness.categoryName } : {}),
      ...(landmarks ? { landmarks } : {}),
    });
  } catch (error) {
    post({ type: "failed", error: error instanceof Error ? error.message : "Hand landmark inference failed" });
  } finally {
    message.frame.close();
  }
};
