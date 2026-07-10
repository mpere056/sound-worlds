import type { Song } from "@reaper-viz/core";
import type { MarbleMotionMix } from "@reaper-viz/compiler-marble";
import type { MarblePlannerInbound, MarblePlannerOutbound, MarblePlannerRequest, MarblePlannerSuccess } from "./marble-planner-protocol.js";

export interface MarblePlannerPort {
  onmessage: ((event: MessageEvent<MarblePlannerOutbound>) => void) | null;
  postMessage(message: MarblePlannerInbound): void;
  terminate(): void;
}

export interface MarblePlannerCallbacks {
  planned(result: MarblePlannerSuccess): void;
  failed(error: string): void;
}

export class MarblePlannerClient {
  readonly #port: MarblePlannerPort;
  readonly #callbacks: MarblePlannerCallbacks;
  #projectGeneration = 0;
  #latestRequestId = 0;

  constructor(port: MarblePlannerPort, callbacks: MarblePlannerCallbacks) {
    this.#port = port;
    this.#callbacks = callbacks;
    this.#port.onmessage = (event) => this.#handle(event.data);
  }

  initialize(song: Song): number {
    this.#projectGeneration += 1;
    this.#latestRequestId = 0;
    this.#port.postMessage({ type: "initialize", projectGeneration: this.#projectGeneration, song });
    return this.#projectGeneration;
  }

  request(motionMix: MarbleMotionMix, options: { profile: boolean; sourceTrackId?: string }): number {
    this.#latestRequestId += 1;
    const request: MarblePlannerRequest = {
      type: "plan",
      projectGeneration: this.#projectGeneration,
      requestId: this.#latestRequestId,
      motionMix: { ...motionMix },
      profile: options.profile,
      ...(options.sourceTrackId ? { sourceTrackId: options.sourceTrackId } : {}),
    };
    this.#port.postMessage(request);
    return request.requestId;
  }

  invalidate(): void {
    this.#latestRequestId += 1;
  }

  dispose(): void {
    this.#port.onmessage = null;
    this.#port.terminate();
  }

  #handle(result: MarblePlannerOutbound): void {
    if (result.projectGeneration !== this.#projectGeneration || result.requestId !== this.#latestRequestId) return;
    if (result.type === "failed") this.#callbacks.failed(result.error);
    else this.#callbacks.planned(result);
  }
}
