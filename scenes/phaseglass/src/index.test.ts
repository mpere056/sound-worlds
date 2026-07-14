import { describe, expect, it } from "vitest";
import type { PhaseglassMembrane } from "@reaper-viz/compiler-phaseglass";
import { PHASEGLASS_RAYMARCH_SCALE, PHASEGLASS_REGISTER_COUNT, PHASEGLASS_VOLUME_STEPS, PHASEGLASS_VISIBLE_MEMBRANES, samplePhaseglassAnticipation, samplePhaseglassCameraFrame, samplePhaseglassCausticSweep, samplePhaseglassMusicalState, samplePhaseglassRegisters } from "./index.js";

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
    expect(PHASEGLASS_REGISTER_COUNT).toBe(7);
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

describe("Phaseglass holographic registers", () => {
  it("keeps future notes as previews without writing phase", () => {
    const registers = samplePhaseglassRegisters([membrane(2, 60, 0.8)], 0);
    expect(registers).toHaveLength(PHASEGLASS_REGISTER_COUNT);
    expect(registers[0]!.preview).toBeGreaterThan(0);
    expect(registers[0]!.written).toBe(0);
    expect(registers[0]!.phaseDepth).toBe(0);
  });

  it("writes a note smoothly and preserves it through later silence", () => {
    const notes = [membrane(1, 60, 0.8)];
    const contact = samplePhaseglassRegisters(notes, 1)[0]!;
    const writing = samplePhaseglassRegisters(notes, 1.1)[0]!;
    const late = samplePhaseglassRegisters(notes, 8)[0]!;
    expect(contact.written).toBe(0);
    expect(writing.written).toBeGreaterThan(0);
    expect(late.written).toBe(1);
    expect(late.phaseDepth).toBeGreaterThan(0);
  });

  it("accumulates repeated register notes instead of replacing its mask", () => {
    const notes = Array.from({ length: PHASEGLASS_REGISTER_COUNT + 1 }, (_, index) => membrane(index * 0.25, 48 + index * 3, 0.55 + index * 0.04));
    const before = samplePhaseglassRegisters(notes, 0.5)[0]!;
    const after = samplePhaseglassRegisters(notes, 4)[0]!;
    expect(before.noteCount).toBe(1);
    expect(after.noteCount).toBe(2);
    expect(after.phaseDepth).toBeGreaterThan(before.phaseDepth);
    expect(after.pitch).not.toBe(before.pitch);
  });

  it("keeps every register value finite and bounded", () => {
    const notes = Array.from({ length: 80 }, (_, index) => membrane(index * 0.05, 20 + index * 2, index % 2 ? 1 : 0.05));
    for (const register of samplePhaseglassRegisters(notes, 20)) {
      expect([...register.gradient, register.phaseDepth, register.transmission, register.pitch, register.velocity, register.written, register.preview].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...register.gradient)).toBeLessThanOrEqual(1);
      expect(register.phaseDepth).toBeGreaterThanOrEqual(0);
      expect(register.phaseDepth).toBeLessThanOrEqual(1);
      expect(register.transmission).toBeGreaterThanOrEqual(0);
      expect(register.transmission).toBeLessThanOrEqual(1);
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
