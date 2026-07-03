import { sampleCurve, smoothCurve, type Song, type TimedCurve } from "@reaper-viz/core";

export interface MotionResult {
  x: TimedCurve;
  speed: TimedCurve;
  tAtX: TimedCurve;
  worldLength: number;
}

function inverseTimeAtX(xCurve: TimedCurve, worldLength: number, dx: number): TimedCurve {
  const values: number[] = [];
  let cursor = 0;
  for (let x = 0; x <= worldLength + 1e-9; x += dx) {
    while (cursor + 1 < xCurve.values.length && (xCurve.values[cursor + 1] ?? worldLength) < x) cursor += 1;
    const x0 = xCurve.values[cursor] ?? 0;
    const x1 = xCurve.values[Math.min(cursor + 1, xCurve.values.length - 1)] ?? x0;
    const alpha = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
    values.push(xCurve.t0 + (cursor + alpha) * xCurve.dt);
  }
  return { t0: 0, dt: dx, values };
}

export function compileMotion(song: Song, minWorldLength = 48): MotionResult {
  const energy = smoothCurve(song.master.energy, Math.max(1, Math.round(0.25 / song.master.energy.dt)));
  const dt = energy.dt;
  const duration = song.meta.durationSec;
  const count = Math.ceil(duration / dt) + 1;
  const factors = Array.from({ length: count }, (_, index) => 0.8 + 0.4 * sampleCurve(energy, index * dt));
  let factorIntegral = 0;
  for (let index = 1; index < factors.length; index += 1) {
    factorIntegral += ((factors[index - 1] ?? 0.8) + (factors[index] ?? 0.8)) * 0.5 * dt;
  }
  const worldLength = Math.max(minWorldLength, 60 * duration / 60);
  const v0 = worldLength / factorIntegral;
  const speedValues = factors.map((factor) => factor * v0);
  const xValues = [0];
  for (let index = 1; index < speedValues.length; index += 1) {
    const previous = speedValues[index - 1] ?? v0;
    const current = speedValues[index] ?? previous;
    xValues.push((xValues[index - 1] ?? 0) + (previous + current) * 0.5 * dt);
  }
  const scale = worldLength / (xValues[xValues.length - 1] ?? worldLength);
  for (let index = 0; index < xValues.length; index += 1) xValues[index] = (xValues[index] ?? 0) * scale;
  for (let index = 1; index < xValues.length; index += 1) {
    if (!((xValues[index] ?? 0) > (xValues[index - 1] ?? 0))) throw new Error("Runner x(t) is not strictly increasing");
  }
  const x = { t0: 0, dt, values: xValues };
  return {
    x,
    speed: { t0: 0, dt, values: speedValues.map((value) => value * scale) },
    tAtX: inverseTimeAtX(x, worldLength, 0.25),
    worldLength,
  };
}
