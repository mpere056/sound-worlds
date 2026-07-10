import type { MarbleTarget } from "@reaper-viz/compiler-marble";
import type { MarbleTransitionRouterInbound, MarbleTransitionRouterOutbound, MarbleTransitionRouteSuccess } from "./marble-transition-router-protocol.js";

export interface MarbleTransitionRouterPort {
  onmessage: ((event: MessageEvent<MarbleTransitionRouterOutbound>) => void) | null;
  postMessage(message: MarbleTransitionRouterInbound): void;
  terminate(): void;
}

export class MarbleTransitionRouterClient {
  readonly #createPort: () => MarbleTransitionRouterPort;
  #port: MarbleTransitionRouterPort;
  #latestRequestId = 0;
  #pending = new Map<number, { resolve: (result: MarbleTransitionRouteSuccess) => void; reject: (error: Error) => void }>();

  constructor(createPort: () => MarbleTransitionRouterPort) {
    this.#createPort = createPort;
    this.#port = this.#createPort();
    this.#attach();
  }

  route(fromTargets: readonly MarbleTarget[], toTargets: readonly MarbleTarget[]): Promise<MarbleTransitionRouteSuccess> {
    this.#latestRequestId += 1;
    const requestId = this.#latestRequestId;
    for (const [id, pending] of this.#pending) {
      if (id < requestId) pending.reject(new Error("Transition route superseded"));
    }
    this.#pending.clear();
    this.#port.onmessage = null;
    this.#port.terminate();
    this.#port = this.#createPort();
    this.#attach();
    this.#port.postMessage({ type: "route", requestId, fromTargets: [...fromTargets], toTargets: [...toTargets] });
    return new Promise((resolve, reject) => this.#pending.set(requestId, { resolve, reject }));
  }

  invalidate(): void {
    this.#latestRequestId += 1;
    for (const pending of this.#pending.values()) pending.reject(new Error("Transition route invalidated"));
    this.#pending.clear();
  }

  dispose(): void {
    this.invalidate();
    this.#port.onmessage = null;
    this.#port.terminate();
  }

  #handle(result: MarbleTransitionRouterOutbound): void {
    if (result.requestId !== this.#latestRequestId) return;
    const pending = this.#pending.get(result.requestId);
    if (!pending) return;
    this.#pending.delete(result.requestId);
    if (result.type === "failed") pending.reject(new Error(result.error));
    else pending.resolve(result);
  }

  #attach(): void {
    this.#port.onmessage = (event) => this.#handle(event.data);
  }
}
