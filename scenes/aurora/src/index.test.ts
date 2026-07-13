import { describe, expect, it } from "vitest";
import type { AuroraCoil } from "@reaper-viz/compiler-aurora";
import { AURORA_RAYMARCH_SCALE, AURORA_VISIBLE_FIELD_COUNT, AURORA_VOLUME_STEPS, sampleAuroraAnticipation, sampleAuroraFieldWindowFade, sampleAuroraMusicalState, sampleAuroraTravelState } from "./index.js";

function coil(t: number, pitch: number, energy: number): AuroraCoil {
  return {
    id: `coil:${t}`,
    deadlineId: `deadline:${t}`,
    t,
    center: [0, 0, 0],
    axis: [0, 1, 0],
    arrivalDirection: [1, 0, 0],
    pitch,
    energy,
    radius: 0.7,
    tubeRadius: 0.085,
    color: "#ffffff",
  };
}

describe("Aurora volumetric field budget", () => {
  it("keeps the iterative field pass at the planned half-resolution budget", () => {
    expect(AURORA_RAYMARCH_SCALE).toBe(0.5);
    expect(AURORA_VISIBLE_FIELD_COUNT).toBeLessThanOrEqual(7);
    expect(AURORA_VOLUME_STEPS).toBeGreaterThanOrEqual(60);
  });
});

describe("Aurora musical shader state", () => {
  it("maps register, pitch direction, and velocity into stable normalized controls", () => {
    const coils = [coil(0, 40, 0.3), coil(1, 64, 0.9)];
    const low = sampleAuroraMusicalState(coils, 0);
    const high = sampleAuroraMusicalState(coils, 1.1);
    expect(high.pitch).toBeGreaterThan(low.pitch);
    expect(high.pitchDirection).toBeGreaterThan(0);
    expect(high.velocity).toBeGreaterThan(low.velocity);
    expect(high.beatPulse).toBeGreaterThan(low.beatPulse);
  });

  it("accumulates rapid notes and lets the field decay into silence", () => {
    const coils = [coil(0, 52, 0.7), coil(0.16, 55, 0.75), coil(0.32, 59, 0.8)];
    const dense = sampleAuroraMusicalState(coils, 0.32);
    const silence = sampleAuroraMusicalState(coils, 1.8);
    expect(dense.succession).toBeGreaterThan(0.9);
    expect(dense.activity).toBeGreaterThan(silence.activity);
    expect(silence.silence).toBeGreaterThan(dense.silence);
    expect(silence.beatPulse).toBeLessThan(0.001);
  });

  it("glides through rapid note boundaries without resetting the phrase", () => {
    const coils = [coil(0, 48, 0.35), coil(0.16, 67, 0.95), coil(0.32, 55, 0.6)];
    const beforeBoundary = sampleAuroraMusicalState(coils, 0.16 - 1e-6);
    const atBoundary = sampleAuroraMusicalState(coils, 0.16);
    const intensified = sampleAuroraMusicalState(coils, 0.4);

    expect(Math.abs(atBoundary.pitch - beforeBoundary.pitch)).toBeLessThan(0.001);
    expect(Math.abs(atBoundary.velocity - beforeBoundary.velocity)).toBeLessThan(0.001);
    expect(Math.abs(atBoundary.activity - beforeBoundary.activity)).toBeLessThan(0.001);
    expect(atBoundary.pitchDirection).toBeCloseTo(0, 5);
    expect(intensified.activity).toBeGreaterThan(atBoundary.activity);
    expect(intensified.succession).toBeGreaterThan(0.75);
  });
});

describe("Aurora note anticipation", () => {
  it("opens a three-second aperture and fills it continuously at arrival", () => {
    const outsideHorizon = sampleAuroraAnticipation(3.01);
    const approaching = sampleAuroraAnticipation(1.5);
    const nearArrival = sampleAuroraAnticipation(0.36);
    const arrival = sampleAuroraAnticipation(0);
    const justAfter = sampleAuroraAnticipation(-1e-6);

    expect(outsideHorizon.aperture).toBe(0);
    expect(approaching.aperture).toBeGreaterThan(0.45);
    expect(nearArrival.fill).toBeGreaterThan(approaching.fill);
    expect(arrival.aperture).toBe(0);
    expect(arrival.fill).toBe(1);
    expect(Math.abs(arrival.fill - justAfter.fill)).toBeLessThan(1e-9);
  });

  it("admits a newly visible dense-run field without a window pop", () => {
    const coils = Array.from({ length: 8 }, (_, index) => coil(index * 0.16, 48 + index, 0.7));
    const enteringIndex = AURORA_VISIBLE_FIELD_COUNT;
    const entryTime = coils[enteringIndex - (AURORA_VISIBLE_FIELD_COUNT - 2)]!.t;

    expect(sampleAuroraFieldWindowFade(coils, enteringIndex, entryTime)).toBe(0);
    expect(sampleAuroraFieldWindowFade(coils, enteringIndex, entryTime + 0.16)).toBeCloseTo(0.5, 5);
    expect(sampleAuroraFieldWindowFade(coils, enteringIndex, entryTime + 0.32)).toBe(1);
  });
});

describe("Aurora note-driven travel", () => {
  it("turns note energy into a continuous force impulse and lasting travel", () => {
    const quiet = [coil(0.5, 48, 0.25)];
    const loud = [coil(0.5, 72, 0.95)];
    const before = sampleAuroraTravelState(loud, 0.5 - 1e-6);
    const arrival = sampleAuroraTravelState(loud, 0.5);
    const accelerating = sampleAuroraTravelState(loud, 0.68);
    const quietTravel = sampleAuroraTravelState(quiet, 1.4);
    const loudTravel = sampleAuroraTravelState(loud, 1.4);

    expect(Math.abs(arrival.distance - before.distance)).toBeLessThan(1e-5);
    expect(arrival.force).toBe(0);
    expect(accelerating.force).toBeGreaterThan(0);
    expect(loudTravel.distance).toBeGreaterThan(quietTravel.distance);
    expect(loudTravel.lateral).toBeGreaterThan(quietTravel.lateral);
  });
});
