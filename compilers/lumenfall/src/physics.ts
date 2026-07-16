import type { LumenfallVec3 } from "./types.js";

export function lumenAdd(a: LumenfallVec3, b: LumenfallVec3): LumenfallVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function lumenSub(a: LumenfallVec3, b: LumenfallVec3): LumenfallVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function lumenScale(v: LumenfallVec3, scale: number): LumenfallVec3 {
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}

export function lumenDot(a: LumenfallVec3, b: LumenfallVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function lumenLength(v: LumenfallVec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function lumenNormalize(v: LumenfallVec3, fallback: LumenfallVec3 = [0, 1, 0]): LumenfallVec3 {
  const length = lumenLength(v);
  return length > 1e-12 ? lumenScale(v, 1 / length) : [...fallback];
}

export function solveLumenfallLaunch(from: LumenfallVec3, to: LumenfallVec3, gravity: LumenfallVec3, duration: number): LumenfallVec3 {
  if (!(duration > 1e-6)) throw new RangeError("Lumenfall flight duration must be positive");
  return lumenScale(lumenSub(lumenSub(to, from), lumenScale(gravity, 0.5 * duration * duration)), 1 / duration);
}

export function sampleLumenfallBallistic(position: LumenfallVec3, velocity: LumenfallVec3, gravity: LumenfallVec3, localTime: number): { position: LumenfallVec3; velocity: LumenfallVec3 } {
  return {
    position: lumenAdd(lumenAdd(position, lumenScale(velocity, localTime)), lumenScale(gravity, 0.5 * localTime * localTime)),
    velocity: lumenAdd(velocity, lumenScale(gravity, localTime)),
  };
}

export function passiveLumenfallReflection(incoming: LumenfallVec3, normal: LumenfallVec3, restitution: number, friction: number): LumenfallVec3 {
  const n = lumenNormalize(normal);
  const normalVelocity = lumenScale(n, lumenDot(incoming, n));
  const tangentVelocity = lumenSub(incoming, normalVelocity);
  return lumenSub(lumenScale(tangentVelocity, 1 - friction), lumenScale(normalVelocity, restitution));
}

export function lumenfallImpulse(passive: LumenfallVec3, required: LumenfallVec3): LumenfallVec3 {
  return lumenSub(required, passive);
}

export function lumenfallTangentialImpulseRatio(impulse: LumenfallVec3, normal: LumenfallVec3): number {
  const n = lumenNormalize(normal);
  const normalMagnitude = Math.abs(lumenDot(impulse, n));
  const tangent = lumenSub(impulse, lumenScale(n, lumenDot(impulse, n)));
  return lumenLength(tangent) / Math.max(1e-9, normalMagnitude);
}
