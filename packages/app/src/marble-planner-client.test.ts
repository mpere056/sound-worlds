import { describe, expect, it, vi } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import type { MarblePerformance } from "@reaper-viz/compiler-marble";
import { MarblePlannerClient, type MarblePlannerPort } from "./marble-planner-client.js";
import type { MarblePlannerInbound, MarblePlannerOutbound } from "./marble-planner-protocol.js";

class FakePlannerPort implements MarblePlannerPort {
  onmessage: ((event: MessageEvent<MarblePlannerOutbound>) => void) | null = null;
  readonly messages: MarblePlannerInbound[] = [];
  readonly terminate = vi.fn();

  postMessage(message: MarblePlannerInbound): void {
    this.messages.push(message);
  }

  emit(message: MarblePlannerOutbound): void {
    this.onmessage?.({ data: message } as MessageEvent<MarblePlannerOutbound>);
  }
}

const performance = {} as MarblePerformance;

describe("MarblePlannerClient", () => {
  it("accepts only the latest request in the active project generation", () => {
    const port = new FakePlannerPort();
    const planned = vi.fn();
    const failed = vi.fn();
    const client = new MarblePlannerClient(port, { planned, failed });
    const generation = client.initialize(buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 1], pitch: 55, kind: "note" }] }));
    const first = client.request({ leftRight: 20, upDown: 20, frontBack: 60 }, { profile: false });
    const second = client.request({ leftRight: 10, upDown: 10, frontBack: 80 }, { profile: true, sourceTrackId: "track:keys" });

    port.emit({ type: "planned", projectGeneration: generation, requestId: first, performance });
    expect(planned).not.toHaveBeenCalled();
    client.invalidate();
    port.emit({ type: "planned", projectGeneration: generation, requestId: second, performance });
    expect(planned).not.toHaveBeenCalled();
    const third = client.request({ leftRight: 45, upDown: 10, frontBack: 45 }, { profile: false });
    port.emit({ type: "planned", projectGeneration: generation, requestId: third, performance });
    expect(planned).toHaveBeenCalledOnce();

    const nextGeneration = client.initialize(buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 2], pitch: 60, kind: "note" }] }));
    port.emit({ type: "failed", projectGeneration: generation, requestId: second, error: "stale" });
    expect(failed).not.toHaveBeenCalled();
    const nextRequest = client.request({ leftRight: 20, upDown: 20, frontBack: 60 }, { profile: false });
    port.emit({ type: "failed", projectGeneration: nextGeneration, requestId: nextRequest, error: "latest" });
    expect(failed).toHaveBeenCalledWith("latest");

    client.dispose();
    expect(port.terminate).toHaveBeenCalledOnce();
  });

  it("activates only the newest result from a rapid request burst", () => {
    const port = new FakePlannerPort();
    const planned = vi.fn();
    const client = new MarblePlannerClient(port, { planned, failed: vi.fn() });
    const generation = client.initialize(buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 1], pitch: 55, kind: "note" }] }));
    const requests = Array.from({ length: 100 }, (_, index) => client.request({
      leftRight: 10 + index % 31,
      upDown: 10,
      frontBack: 80 - index % 31,
    }, { profile: false }));
    for (const requestId of requests) port.emit({ type: "planned", projectGeneration: generation, requestId, performance });
    expect(planned).toHaveBeenCalledOnce();
    expect(planned).toHaveBeenCalledWith(expect.objectContaining({ requestId: requests.at(-1) }));
  });
});
