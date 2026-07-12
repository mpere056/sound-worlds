import { describe, expect, it, vi } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compileMarble, marbleTargetVisualsOverlap, sampleMarblePose, type MarbleTarget } from "@reaper-viz/compiler-marble";
import { marbleTransitionOverlapCount, planMarbleTransitionRoute } from "./marble-transition-routing.js";
import { MarbleTransitionRouterClient, type MarbleTransitionRouterPort } from "./marble-transition-router-client.js";
import type { MarbleTransitionRouterInbound, MarbleTransitionRouterOutbound } from "./marble-transition-router-protocol.js";

function target(id: string, pos: [number, number, number]): MarbleTarget {
  return {
    id,
    kind: "plate",
    pitch: 60,
    pitchClass: 0,
    pos,
    contactPos: pos,
    rotation: [0, 0, 0],
    size: [1, 0.18, 0.5],
    color: "#ffffff",
    material: "painted-metal",
    familyId: id,
  };
}

class FakePort implements MarbleTransitionRouterPort {
  onmessage: ((event: MessageEvent<MarbleTransitionRouterOutbound>) => void) | null = null;
  readonly messages: MarbleTransitionRouterInbound[] = [];
  readonly terminate = vi.fn();
  postMessage(message: MarbleTransitionRouterInbound): void { this.messages.push(message); }
  emit(message: MarbleTransitionRouterOutbound): void { this.onmessage?.({ data: message } as MessageEvent<MarbleTransitionRouterOutbound>); }
}

describe("Marble transition routing", () => {
  it("finds a certified route for platforms that directly cross", () => {
    const from = [target("left", [-1.4, 0, 0]), target("right", [1.4, 0, 0])];
    const to = [target("left", [1.4, 0, 0]), target("right", [-1.4, 0, 0])];
    expect(marbleTransitionOverlapCount(from, to, new Map())).toBeGreaterThan(0);
    const route = planMarbleTransitionRoute(from, to);
    expect(route.overlapCount).toBe(0);
    expect(route.samples).toBe(120);
    expect(marbleTransitionOverlapCount(from, to, new Map(route.offsets), route.samples, new Map(route.timings))).toBe(0);
  });

  it("reports compiled extreme-mix transition clearance without false certification", () => {
    const song = buildFixtureSong({ bars: 3, patterns: [{ role: "keys", beats: [0, 1.5, 3.5, 5.5, 7.5, 9.5], pitch: 52, kind: "note" }] });
    const active = compileMarble(song, { motionMix: { leftRight: 20, upDown: 20, frontBack: 60 } });
    const songT = 2.25;
    for (const motionMix of [{ leftRight: 10, upDown: 80, frontBack: 10 }]) {
      const incoming = compileMarble(song, { motionMix });
      const activePos = sampleMarblePose(active.statics.path, songT).pos;
      const incomingPos = sampleMarblePose(incoming.statics.path, songT).pos;
      const translation = activePos.map((value, index) => value - incomingPos[index]!) as [number, number, number];
      const alignedTargets = incoming.statics.targets.map((entry) => ({
        ...entry,
        pos: entry.pos.map((value, index) => value + translation[index]!) as [number, number, number],
        contactPos: entry.contactPos.map((value, index) => value + translation[index]!) as [number, number, number],
      }));
      for (let left = 0; left < alignedTargets.length; left += 1) for (let right = left + 1; right < alignedTargets.length; right += 1) {
        expect(marbleTargetVisualsOverlap(alignedTargets[left]!, alignedTargets[right]!, 0), `${alignedTargets[left]!.id}/${alignedTargets[right]!.id}`).toBe(false);
      }
      const route = planMarbleTransitionRoute(active.statics.targets, alignedTargets);
      const measured = marbleTransitionOverlapCount(active.statics.targets, alignedTargets, new Map(route.offsets), route.samples, new Map(route.timings));
      expect(route.overlapCount).toBe(measured);
      expect(route.overlapCount).toBeGreaterThanOrEqual(0);
    }
  }, 15_000);

  it("rejects stale worker results and resolves only the latest route", async () => {
    const ports: FakePort[] = [];
    const client = new MarbleTransitionRouterClient(() => {
      const port = new FakePort();
      ports.push(port);
      return port;
    });
    const from = [target("left", [-1, 0, 0])];
    const to = [target("left", [1, 0, 0])];
    const first = client.route(from, to);
    const second = client.route(from, to);
    await expect(first).rejects.toThrow("superseded");
    expect(ports[1]!.terminate).toHaveBeenCalledOnce();
    ports[1]!.emit({ type: "routed", requestId: 1, route: { offsets: [], timings: [], overlapCount: 0, samples: 120 }, planningMs: 2 });
    ports[2]!.emit({ type: "routed", requestId: 2, route: { offsets: [["left", [0, 0, 0]]], timings: [], overlapCount: 0, samples: 120 }, planningMs: 3 });
    await expect(second).resolves.toMatchObject({ requestId: 2, planningMs: 3 });
    client.dispose();
    expect(ports[2]!.terminate).toHaveBeenCalledOnce();
  });
});
