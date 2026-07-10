import type { MarbleTarget } from "@reaper-viz/compiler-marble";
import type { MarbleTransitionRoute } from "./marble-transition-routing.js";

export interface MarbleTransitionRouteRequest {
  type: "route";
  requestId: number;
  fromTargets: MarbleTarget[];
  toTargets: MarbleTarget[];
}

export interface MarbleTransitionRouteSuccess {
  type: "routed";
  requestId: number;
  route: MarbleTransitionRoute;
  planningMs: number;
}

export interface MarbleTransitionRouteFailure {
  type: "failed";
  requestId: number;
  error: string;
}

export type MarbleTransitionRouterInbound = MarbleTransitionRouteRequest;
export type MarbleTransitionRouterOutbound = MarbleTransitionRouteSuccess | MarbleTransitionRouteFailure;
