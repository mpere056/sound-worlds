/// <reference lib="webworker" />

import { planMarbleTransitionRoute } from "./marble-transition-routing.js";
import type { MarbleTransitionRouterInbound, MarbleTransitionRouterOutbound } from "./marble-transition-router-protocol.js";

const scope = self as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<MarbleTransitionRouterInbound>) => {
  const request = event.data;
  const startedAt = performance.now();
  try {
    const route = planMarbleTransitionRoute(request.fromTargets, request.toTargets);
    const result: MarbleTransitionRouterOutbound = { type: "routed", requestId: request.requestId, route, planningMs: performance.now() - startedAt };
    scope.postMessage(result);
  } catch (error) {
    const result: MarbleTransitionRouterOutbound = {
      type: "failed",
      requestId: request.requestId,
      error: error instanceof Error ? error.message : "Transition routing failed",
    };
    scope.postMessage(result);
  }
};
