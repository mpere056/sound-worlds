import { describe, expect, it } from "vitest";
import type { PhaseglassMembrane } from "@reaper-viz/compiler-phaseglass";
import { PHASEGLASS_LAYER_COUNT, PHASEGLASS_NOTE_WINDOW_COUNT, PHASEGLASS_RAYMARCH_SCALE, PHASEGLASS_VOLUME_STEPS, PHASEGLASS_VISIBLE_MEMBRANES, samplePhaseglassAnticipation, samplePhaseglassCameraFrame, samplePhaseglassCausticSweep, samplePhaseglassDisturbances, samplePhaseglassMusicalState } from "./index.js";

function membrane(t: number, pitch: number, energy: number): PhaseglassMembrane {
  return {
    id: `membrane:${t}`,
    deadlineId: `deadline:${t}`,
    t,
    center: [0, 0, t],
    normal: [0, 0, 1],
    axisU: [1, 0, 0],
    axisV: [0, 1, 0],
    incomingDirection: [0, 0, 1],
    outgoingDirection: [0.2, 0, 0.98],
    phaseGradient: [1, 0, 0],
    radius: 0.7,
    thickness: 0.045,
    pitch,
    energy,
    duration: 0.2,
    color: "#ffffff",
  };
}

describe("Phaseglass shader budget", () => {
  it("keeps the first optical field within its planned mobile-shaped budget", () => {
    expect(PHASEGLASS_RAYMARCH_SCALE).toBe(0.5);
    expect(PHASEGLASS_VISIBLE_MEMBRANES).toBeLessThanOrEqual(8);
    expect(PHASEGLASS_LAYER_COUNT).toBe(3);
    expect(PHASEGLASS_NOTE_WINDOW_COUNT).toBeLessThanOrEqual(8);
    expect(PHASEGLASS_VOLUME_STEPS).toBeLessThanOrEqual(52);
  });
});

describe("Phaseglass temporal field", () => {
  it("creates a continuous three-second vacancy before filling a membrane", () => {
    expect(samplePhaseglassAnticipation(3.1).vacancy).toBe(0);
    expect(samplePhaseglassAnticipation(1.5).vacancy).toBeGreaterThan(0.45);
    expect(samplePhaseglassAnticipation(0.2).fill).toBeGreaterThan(0.8);
    expect(samplePhaseglassAnticipation(0).fill).toBe(1);
    expect(Math.abs(samplePhaseglassAnticipation(0).fill - samplePhaseglassAnticipation(-1e-6).fill)).toBeLessThan(1e-9);
  });

  it("uses note duration only to lengthen the post-crossing optical decay", () => {
    const short = samplePhaseglassAnticipation(-0.7, 0.45);
    const long = samplePhaseglassAnticipation(-0.7, 1.2);
    expect(long.fill).toBeGreaterThan(short.fill);
    expect(long.vacancy).toBe(short.vacancy);
    expect(samplePhaseglassAnticipation(-10).fill).toBe(0.2);
  });

  it("accumulates quick notes as phrase pressure instead of resetting", () => {
    const membranes = [membrane(0, 48, 0.5), membrane(0.15, 60, 0.8), membrane(0.3, 72, 0.95)];
    const boundaryBefore = samplePhaseglassMusicalState(membranes, 0.15 - 1e-6);
    const boundaryAt = samplePhaseglassMusicalState(membranes, 0.15);
    const dense = samplePhaseglassMusicalState(membranes, 0.36);
    const quiet = samplePhaseglassMusicalState(membranes, 1.8);
    expect(Math.abs(boundaryAt.pitch - boundaryBefore.pitch)).toBeLessThan(0.001);
    expect(dense.pressure).toBeGreaterThan(boundaryAt.pressure);
    expect(dense.activity).toBeGreaterThan(quiet.activity);
    expect(quiet.silence).toBeGreaterThan(dense.silence);
  });

  it("sweeps a note caustic across its sheet after contact", () => {
    const waiting = samplePhaseglassCausticSweep(0.2);
    const contact = samplePhaseglassCausticSweep(0);
    const crossing = samplePhaseglassCausticSweep(-0.55);
    const faded = samplePhaseglassCausticSweep(-3);
    expect(waiting.strength).toBe(0);
    expect(contact.contact).toBe(1);
    expect(crossing.position).toBeGreaterThan(contact.position);
    expect(crossing.strength).toBeGreaterThan(faded.strength);
  });
});

describe("Phaseglass optical disturbances", () => {
  it("previews a future note without applying its active refractive strength", () => {
    const [disturbance] = samplePhaseglassDisturbances([membrane(2, 60, 0.8)], 0);
    expect(disturbance!.preview).toBeGreaterThan(0);
    expect(disturbance!.strength).toBeLessThan(0.1);
  });

  it("develops a note into a continuous post-contact disturbance", () => {
    const notes = [membrane(1, 60, 0.8)];
    const contact = samplePhaseglassDisturbances(notes, 1)[0]!;
    const traveling = samplePhaseglassDisturbances(notes, 1.2)[0]!;
    const resolving = samplePhaseglassDisturbances(notes, 3)[0]!;
    expect(contact.strength).toBe(0);
    expect(traveling.strength).toBeGreaterThan(contact.strength);
    expect(resolving.strength).toBeGreaterThan(0);
  });

  it("keeps dense notes simultaneous within the bounded shader window", () => {
    const notes = Array.from({ length: 20 }, (_, index) => membrane(index * 0.08, 48 + index, 0.7));
    const disturbances = samplePhaseglassDisturbances(notes, 1);
    expect(disturbances).toHaveLength(PHASEGLASS_NOTE_WINDOW_COUNT);
    expect(disturbances.filter((disturbance) => disturbance.noteTime <= 1 && disturbance.strength > 0).length).toBeGreaterThanOrEqual(4);
  });

  it("maps pitch into phase-front direction and velocity into strength", () => {
    const low = samplePhaseglassDisturbances([membrane(0, 40, 0.2)], 0.3)[0]!;
    const high = samplePhaseglassDisturbances([membrane(0, 80, 1)], 0.3)[0]!;
    expect(high.direction).not.toEqual(low.direction);
    expect(high.pitch).toBeGreaterThan(low.pitch);
    expect(high.strength).toBeGreaterThan(low.strength);
  });

  it("keeps every disturbance finite and normalized", () => {
    const notes = Array.from({ length: 80 }, (_, index) => membrane(index * 0.05, 20 + index * 2, index % 2 ? 1 : 0.05));
    for (const disturbance of samplePhaseglassDisturbances(notes, 2)) {
      expect([disturbance.noteTime, disturbance.pitch, disturbance.velocity, ...disturbance.direction, disturbance.phase, disturbance.strength, disturbance.preview].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...disturbance.direction)).toBeCloseTo(1, 8);
      expect(disturbance.preview).toBeGreaterThanOrEqual(0);
      expect(disturbance.preview).toBeLessThanOrEqual(1);
    }
  });

  it("uses one stationary installation camera at every score time", () => {
    const first = samplePhaseglassCameraFrame(1);
    const second = samplePhaseglassCameraFrame(1);
    expect(second).toEqual(first);
    expect(first.target).toEqual([0, 0, 0]);
    expect(first.extent).toBe(7.4);
    expect(Math.hypot(...first.position)).toBeCloseTo(17.2, 5);
  });
});
