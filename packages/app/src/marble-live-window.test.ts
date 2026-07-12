import { describe, expect, it } from "vitest";
import { MARBLE_LIVE_WINDOW_MAX, MARBLE_LIVE_WINDOW_MIN, MarbleLiveCertaintyWindow } from "./marble-live-window.js";

describe("Marble live certainty window", () => {
  it("bounds the active solve window to five through eight platforms", () => {
    expect(new MarbleLiveCertaintyWindow(20, 2).snapshot().windowSize).toBe(MARBLE_LIVE_WINDOW_MIN);
    expect(new MarbleLiveCertaintyWindow(20, 12).snapshot().windowSize).toBe(MARBLE_LIVE_WINDOW_MAX);
  });

  it("keeps stable IDs while only requesting the next active window", () => {
    const window = new MarbleLiveCertaintyWindow(12, 6);
    const batch = window.requestSolveBatch();
    expect(batch.map((slot) => slot.id)).toEqual(Array.from({ length: 6 }, (_, index) => `live-platform:${index}`));
    expect(window.snapshot().slots.slice(6).every((slot) => slot.state === "uncertain")).toBe(true);
  });

  it("locks certified platforms and replenishes one slot after an impact", () => {
    const window = new MarbleLiveCertaintyWindow(10, 5);
    const initial = window.requestSolveBatch();
    window.certify(initial.map((slot) => slot.id), initial[0]!.solveGeneration!);
    expect(window.consumeNext("live-platform:0").state).toBe("spent");
    const refill = window.requestSolveBatch();
    expect(refill.map((slot) => slot.id)).toEqual(["live-platform:5"]);
    expect(window.snapshot().slots.slice(1, 5).every((slot) => slot.state === "certain")).toBe(true);
  });

  it("rejects stale solve results after gesture-driven invalidation", () => {
    const window = new MarbleLiveCertaintyWindow(8);
    const stale = window.requestSolveBatch();
    window.invalidateSolving();
    const current = window.requestSolveBatch();
    expect(() => window.certify(stale.map((slot) => slot.id), stale[0]!.solveGeneration!)).toThrow("stale or inactive");
    window.certify(current.map((slot) => slot.id), current[0]!.solveGeneration!);
  });

  it("refuses out-of-order or uncertified impacts", () => {
    const window = new MarbleLiveCertaintyWindow(3);
    expect(() => window.consumeNext("live-platform:1")).toThrow("out of order");
    expect(() => window.consumeNext("live-platform:0")).toThrow("not certified");
  });

  it("completes without ever promoting uncertain vortex slots implicitly", () => {
    const window = new MarbleLiveCertaintyWindow(3, 5);
    const batch = window.requestSolveBatch();
    window.certify(batch.map((slot) => slot.id), batch[0]!.solveGeneration!);
    for (const slot of batch) window.consumeNext(slot.id);
    expect(window.isComplete()).toBe(true);
    expect(window.snapshot().slots.every((slot) => slot.state === "spent")).toBe(true);
  });
});
