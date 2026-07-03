import { describe, expect, it } from "vitest";
import type { PerformanceEvent } from "@reaper-viz/core";
import { EventCursor, EventRuntime, eventProgress } from "./events.js";

const events: PerformanceEvent[] = [
  { t: 0.5, type: "hit", layer: "main", params: {} },
  { t: 1, tEnd: 2, type: "travel", layer: "main", params: {} },
  { t: 1.5, type: "hit", layer: "main", params: {} },
];

describe("EventCursor", () => {
  it("returns crossed instants once and active spans directly from t", () => {
    const cursor = new EventCursor(events, 10);
    expect(cursor.instantaneousAt(0.5).map((event) => event.t)).toEqual([0.5]);
    expect(cursor.instantaneousAt(0.6)).toEqual([]);
    expect(cursor.activeAt(1.5).map((event) => event.type)).toEqual(["travel"]);
    expect(eventProgress(events[1]!, 1.5)).toBe(0.5);
  });

  it("replays identically after a backward seek", () => {
    const cursor = new EventCursor(events, 10);
    const first = [0.5, 1, 1.5].flatMap((t) => cursor.instantaneousAt(t).map((event) => event.t));
    cursor.seek(0.5);
    const replay = [0.5, 1, 1.5].flatMap((t) => cursor.instantaneousAt(t).map((event) => event.t));
    expect(replay).toEqual(first);
  });

  it("dispatches typed instant and span handlers", () => {
    const calls: string[] = [];
    const runtime = new EventRuntime<{ label: string }>(events, 10)
      .on("hit", (event, context) => calls.push(`${context.label}:${event.t}`))
      .during("travel", (_event, progress, context) => calls.push(`${context.label}:${progress}`));
    runtime.render(1.5, { label: "frame" });
    expect(calls).toEqual(["frame:1.5", "frame:0.5"]);
  });
});
