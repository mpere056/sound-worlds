import type { TimedCurve } from "./types.js";

function assertCurve(curve: TimedCurve): void {
  if (!(curve.dt > 0) || !Number.isFinite(curve.dt) || !Number.isFinite(curve.t0)) {
    throw new RangeError("TimedCurve requires finite t0 and positive finite dt");
  }
}

export function sampleCurve(curve: TimedCurve, t: number): number {
  assertCurve(curve);
  if (curve.values.length === 0) return 0;
  const position = Math.max(0, (t - curve.t0) / curve.dt);
  const low = Math.min(curve.values.length - 1, Math.floor(position));
  const high = Math.min(curve.values.length - 1, low + 1);
  const alpha = position - Math.floor(position);
  const a = curve.values[low] ?? 0;
  const b = curve.values[high] ?? a;
  return a + (b - a) * alpha;
}

export function resampleCurve(curve: TimedCurve, dt: number, endT?: number): TimedCurve {
  assertCurve(curve);
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError("resample dt must be positive and finite");
  const sourceEnd = curve.t0 + Math.max(0, curve.values.length - 1) * curve.dt;
  const targetEnd = endT ?? sourceEnd;
  const count = Math.max(0, Math.floor((targetEnd - curve.t0) / dt + 1e-9) + 1);
  return { t0: curve.t0, dt, values: Array.from({ length: count }, (_, index) => sampleCurve(curve, curve.t0 + index * dt)) };
}

export function integrateCurve(curve: TimedCurve, fromT: number, toT: number): number {
  assertCurve(curve);
  if (toT === fromT) return 0;
  if (toT < fromT) return -integrateCurve(curve, toT, fromT);
  const points = [fromT];
  const firstBoundary = curve.t0 + Math.ceil((fromT - curve.t0) / curve.dt) * curve.dt;
  for (let t = firstBoundary; t < toT - 1e-12; t += curve.dt) {
    if (t > fromT + 1e-12) points.push(t);
  }
  points.push(toT);
  let area = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1] ?? fromT;
    const b = points[index] ?? toT;
    area += (sampleCurve(curve, a) + sampleCurve(curve, b)) * 0.5 * (b - a);
  }
  return area;
}

export function smoothCurve(curve: TimedCurve, radiusSamples: number): TimedCurve {
  assertCurve(curve);
  const radius = Math.max(0, Math.floor(radiusSamples));
  if (radius === 0) return { ...curve, values: [...curve.values] };
  const prefix = [0];
  for (const value of curve.values) prefix.push((prefix[prefix.length - 1] ?? 0) + value);
  const values = curve.values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(curve.values.length, index + radius + 1);
    return ((prefix[end] ?? 0) - (prefix[start] ?? 0)) / (end - start);
  });
  return { ...curve, values };
}
