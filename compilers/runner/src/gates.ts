import { sampleCurve, type PerformanceEvent, type Song, type TimedCurve } from "@reaper-viz/core";
import { sampleTerrain } from "./terrain.js";
import type { RunnerGate, RunnerTerrain } from "./types.js";

export interface GateCompileResult {
  gates: RunnerGate[];
  events: PerformanceEvent[];
}

function lastBarStartBefore(song: Song, t: number): number {
  const previous = [...song.grid.bars].reverse().find((bar) => bar.startSec < t - 1e-6);
  return previous?.startSec ?? Math.max(0, t - 0.5);
}

export function compileGates(song: Song, xCurve: TimedCurve, terrain: RunnerTerrain): GateCompileResult {
  const gates = song.sections
    .filter((section) => section.startSec > 1e-6 && section.startSec < song.meta.durationSec - 1e-6)
    .map((section, index) => {
      const x = sampleCurve(xCurve, section.startSec);
      const y = sampleTerrain(terrain, x);
      return {
        id: `gate-${index}-${section.kind}`,
        section: section.name,
        kind: section.kind,
        t: Number(section.startSec.toFixed(6)),
        openStartT: Number(lastBarStartBefore(song, section.startSec).toFixed(6)),
        x: Number(x.toFixed(6)),
        y: Number(y.toFixed(6)),
      };
    });

  return {
    gates,
    events: gates.map((gate) => ({
      t: gate.openStartT,
      tEnd: gate.t,
      type: "gate.open",
      layer: "runner-gates",
      params: {
        gateId: gate.id,
        section: gate.section,
        kind: gate.kind,
        hitT: gate.t,
      },
    })),
  };
}
