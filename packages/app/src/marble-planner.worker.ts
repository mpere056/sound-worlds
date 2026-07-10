import type { Song } from "@reaper-viz/core";
import { compileMarble, type MarbleCompileProfile } from "@reaper-viz/compiler-marble";
import type { MarblePlannerInbound, MarblePlannerOutbound, MarblePlannerRequest } from "./marble-planner-protocol.js";

interface PlannerWorkerScope {
  onmessage: ((event: MessageEvent<MarblePlannerInbound>) => void) | null;
  postMessage(message: MarblePlannerOutbound): void;
}

const scope = self as unknown as PlannerWorkerScope;
let song: Song | undefined;
let projectGeneration = 0;
let pending: MarblePlannerRequest | undefined;
let scheduled = false;

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(runLatest, 0);
}

function runLatest(): void {
  scheduled = false;
  const request = pending;
  pending = undefined;
  if (!request || !song || request.projectGeneration !== projectGeneration) return;
  let compileProfile: MarbleCompileProfile | undefined;
  try {
    const performance = compileMarble(song, {
      ...(request.sourceTrackId ? { sourceTrackId: request.sourceTrackId } : {}),
      motionMix: request.motionMix,
      ...(request.profile ? {
        instrumentation: {
          now: () => performanceNow(),
          report: (result) => { compileProfile = result; },
        },
      } : {}),
    });
    scope.postMessage({
      type: "planned",
      projectGeneration: request.projectGeneration,
      requestId: request.requestId,
      performance,
      ...(compileProfile ? { compileProfile } : {}),
    });
  } catch (error) {
    scope.postMessage({
      type: "failed",
      projectGeneration: request.projectGeneration,
      requestId: request.requestId,
      error: error instanceof Error ? error.message : "The Marble worker could not compile the route",
    });
  }
  if (pending) schedule();
}

function performanceNow(): number {
  return performance.now();
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "initialize") {
    projectGeneration = message.projectGeneration;
    song = message.song;
    pending = undefined;
    return;
  }
  if (message.projectGeneration !== projectGeneration) return;
  pending = message;
  schedule();
};
