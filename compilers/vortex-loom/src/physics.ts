import type { VortexLoomBaseFlow, VortexLoomRouteSample, VortexLoomVortex, VortexVec2 } from "./types.js";

const TAU = Math.PI * 2;

export function vortexAdd(left: VortexVec2, right: VortexVec2): VortexVec2 {
  return [left[0] + right[0], left[1] + right[1]];
}

export function vortexSub(left: VortexVec2, right: VortexVec2): VortexVec2 {
  return [left[0] - right[0], left[1] - right[1]];
}

export function vortexScale(value: VortexVec2, scalar: number): VortexVec2 {
  return [value[0] * scalar, value[1] * scalar];
}

export function vortexDot(left: VortexVec2, right: VortexVec2): number {
  return left[0] * right[0] + left[1] * right[1];
}

export function vortexLength(value: VortexVec2): number {
  return Math.hypot(value[0], value[1]);
}

export function vortexDistance(left: VortexVec2, right: VortexVec2): number {
  return vortexLength(vortexSub(left, right));
}

export function vortexNormalize(value: VortexVec2, fallback: VortexVec2 = [0, -1]): VortexVec2 {
  const length = vortexLength(value);
  return length > 1e-12 ? [value[0] / length, value[1] / length] : [...fallback];
}

export function vortexPerpendicular(value: VortexVec2): VortexVec2 {
  return [-value[1], value[0]];
}

export function vortexSmootherStep(value: number): number {
  const q = Math.max(0, Math.min(1, value));
  return q * q * q * (q * (q * 6 - 15) + 10);
}

export function vortexActivation(vortex: VortexLoomVortex, time: number): number {
  if (time <= vortex.activationStart || time >= vortex.activationEnd) return 0;
  if (time <= vortex.activationPeak) {
    const duration = Math.max(1e-9, vortex.activationPeak - vortex.activationStart);
    return vortexSmootherStep((time - vortex.activationStart) / duration);
  }
  const duration = Math.max(1e-9, vortex.activationEnd - vortex.activationPeak);
  return 1 - vortexSmootherStep((time - vortex.activationPeak) / duration);
}

interface ConfinementSample {
  value: number;
  gradient: VortexVec2;
}

function confinement(position: VortexVec2, flow: VortexLoomBaseFlow): ConfinementSample {
  const nx = position[0] / flow.chamberHalfWidth;
  const ny = position[1] / flow.chamberHalfHeight;
  if (Math.abs(nx) >= 1 || Math.abs(ny) >= 1) return { value: 0, gradient: [0, 0] };
  const ex = 1 - nx * nx;
  const ey = 1 - ny * ny;
  const ex2 = ex * ex;
  const ey2 = ey * ey;
  return {
    value: ex2 * ey2,
    gradient: [
      -4 * position[0] / (flow.chamberHalfWidth * flow.chamberHalfWidth) * ex * ey2,
      -4 * position[1] / (flow.chamberHalfHeight * flow.chamberHalfHeight) * ey * ex2,
    ],
  };
}

export function sampleVortexLoomVelocity(
  position: VortexVec2,
  time: number,
  baseFlow: VortexLoomBaseFlow,
  vortices: readonly VortexLoomVortex[],
): VortexVec2 {
  const envelope = confinement(position, baseFlow);
  const x = position[0];
  const y = position[1];
  let potential = -baseFlow.drift * x + 0.5 * baseFlow.swirl * (x * x + y * y);
  let gradientX = -baseFlow.drift + baseFlow.swirl * x;
  let gradientY = baseFlow.swirl * y;

  for (const vortex of vortices) {
    const activation = vortexActivation(vortex, time);
    if (activation <= 0) continue;
    const dx = x - vortex.center[0];
    const dy = y - vortex.center[1];
    const denominator = dx * dx + dy * dy + vortex.coreRadius * vortex.coreRadius;
    const circulation = vortex.circulation * activation;
    potential += circulation / (2 * TAU) * Math.log(denominator);
    const derivativeScale = circulation / TAU / denominator;
    gradientX += derivativeScale * dx;
    gradientY += derivativeScale * dy;
  }

  const dPsiDx = envelope.gradient[0] * potential + envelope.value * gradientX;
  const dPsiDy = envelope.gradient[1] * potential + envelope.value * gradientY;
  return [dPsiDy, -dPsiDx];
}

export function vortexRk4Step(
  position: VortexVec2,
  time: number,
  step: number,
  baseFlow: VortexLoomBaseFlow,
  vortices: readonly VortexLoomVortex[],
): VortexVec2 {
  const k1 = sampleVortexLoomVelocity(position, time, baseFlow, vortices);
  const k2 = sampleVortexLoomVelocity(vortexAdd(position, vortexScale(k1, step * 0.5)), time + step * 0.5, baseFlow, vortices);
  const k3 = sampleVortexLoomVelocity(vortexAdd(position, vortexScale(k2, step * 0.5)), time + step * 0.5, baseFlow, vortices);
  const k4 = sampleVortexLoomVelocity(vortexAdd(position, vortexScale(k3, step)), time + step, baseFlow, vortices);
  return [
    position[0] + step / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    position[1] + step / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
  ];
}

export function integrateVortexRoute(
  initialPosition: VortexVec2,
  durationSec: number,
  fixedStepSec: number,
  baseFlow: VortexLoomBaseFlow,
  vortices: readonly VortexLoomVortex[],
  requiredTimes: readonly number[] = [],
): VortexLoomRouteSample[] {
  const times = new Set<number>([0, durationSec, ...requiredTimes.filter((time) => time >= 0 && time <= durationSec)]);
  for (let time = fixedStepSec; time < durationSec - 1e-10; time += fixedStepSec) times.add(Number(time.toFixed(12)));
  const ordered = [...times].sort((left, right) => left - right);
  const samples: VortexLoomRouteSample[] = [];
  let position: VortexVec2 = [...initialPosition];
  let previousTime = 0;
  for (const time of ordered) {
    let cursor = previousTime;
    while (cursor < time - 1e-12) {
      const step = Math.min(fixedStepSec, time - cursor);
      position = vortexRk4Step(position, cursor, step, baseFlow, vortices);
      cursor += step;
    }
    samples.push({ t: time, position: [...position], velocity: sampleVortexLoomVelocity(position, time, baseFlow, vortices) });
    previousTime = time;
  }
  return samples;
}

export function sampleVortexRoute(route: readonly VortexLoomRouteSample[], time: number): VortexLoomRouteSample {
  if (!route.length) return { t: time, position: [0, 1.18], velocity: [0, -0.2] };
  if (time <= route[0]!.t) return { ...route[0]!, position: [...route[0]!.position], velocity: [...route[0]!.velocity] };
  if (time >= route.at(-1)!.t) return { ...route.at(-1)!, position: [...route.at(-1)!.position], velocity: [...route.at(-1)!.velocity] };
  let low = 0;
  let high = route.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (route[middle]!.t <= time) low = middle; else high = middle;
  }
  const left = route[low]!;
  const right = route[high]!;
  const duration = Math.max(1e-12, right.t - left.t);
  const q = Math.max(0, Math.min(1, (time - left.t) / duration));
  const q2 = q * q;
  const q3 = q2 * q;
  const h00 = 2 * q3 - 3 * q2 + 1;
  const h10 = q3 - 2 * q2 + q;
  const h01 = -2 * q3 + 3 * q2;
  const h11 = q3 - q2;
  const position: VortexVec2 = [
    h00 * left.position[0] + h10 * duration * left.velocity[0] + h01 * right.position[0] + h11 * duration * right.velocity[0],
    h00 * left.position[1] + h10 * duration * left.velocity[1] + h01 * right.position[1] + h11 * duration * right.velocity[1],
  ];
  return { t: time, position, velocity: sampleVortexRouteVelocity(left, right, q, duration) };
}

function sampleVortexRouteVelocity(left: VortexLoomRouteSample, right: VortexLoomRouteSample, q: number, duration: number): VortexVec2 {
  const q2 = q * q;
  const dh00 = (6 * q2 - 6 * q) / duration;
  const dh10 = 3 * q2 - 4 * q + 1;
  const dh01 = (-6 * q2 + 6 * q) / duration;
  const dh11 = 3 * q2 - 2 * q;
  return [
    dh00 * left.position[0] + dh10 * left.velocity[0] + dh01 * right.position[0] + dh11 * right.velocity[0],
    dh00 * left.position[1] + dh10 * left.velocity[1] + dh01 * right.position[1] + dh11 * right.velocity[1],
  ];
}

export function numericalVortexDivergence(
  position: VortexVec2,
  time: number,
  baseFlow: VortexLoomBaseFlow,
  vortices: readonly VortexLoomVortex[],
  epsilon = 1e-5,
): number {
  const plusX = sampleVortexLoomVelocity([position[0] + epsilon, position[1]], time, baseFlow, vortices);
  const minusX = sampleVortexLoomVelocity([position[0] - epsilon, position[1]], time, baseFlow, vortices);
  const plusY = sampleVortexLoomVelocity([position[0], position[1] + epsilon], time, baseFlow, vortices);
  const minusY = sampleVortexLoomVelocity([position[0], position[1] - epsilon], time, baseFlow, vortices);
  return (plusX[0] - minusX[0]) / (2 * epsilon) + (plusY[1] - minusY[1]) / (2 * epsilon);
}
