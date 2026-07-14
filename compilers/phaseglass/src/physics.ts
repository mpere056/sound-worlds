import type { PhaseglassVec3 } from "./types.js";

export function phaseglassAdd(left: PhaseglassVec3, right: PhaseglassVec3): PhaseglassVec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

export function phaseglassSub(left: PhaseglassVec3, right: PhaseglassVec3): PhaseglassVec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

export function phaseglassScale(value: PhaseglassVec3, scale: number): PhaseglassVec3 {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

export function phaseglassDot(left: PhaseglassVec3, right: PhaseglassVec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function phaseglassCross(left: PhaseglassVec3, right: PhaseglassVec3): PhaseglassVec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function phaseglassLength(value: PhaseglassVec3): number {
  return Math.sqrt(phaseglassDot(value, value));
}

export function phaseglassNormalize(value: PhaseglassVec3, fallback: PhaseglassVec3 = [1, 0, 0]): PhaseglassVec3 {
  const length = phaseglassLength(value);
  return length > 1e-12 ? phaseglassScale(value, 1 / length) : [...fallback];
}

export function phaseglassDistance(left: PhaseglassVec3, right: PhaseglassVec3): number {
  return phaseglassLength(phaseglassSub(left, right));
}

export function phaseglassRotateAroundAxis(value: PhaseglassVec3, axis: PhaseglassVec3, angle: number): PhaseglassVec3 {
  const unitAxis = phaseglassNormalize(axis, [0, 1, 0]);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return phaseglassAdd(
    phaseglassAdd(phaseglassScale(value, cosine), phaseglassScale(phaseglassCross(unitAxis, value), sine)),
    phaseglassScale(unitAxis, phaseglassDot(unitAxis, value) * (1 - cosine)),
  );
}

export interface PassiveRefractionResult {
  direction: PhaseglassVec3 | null;
  totalInternalReflection: boolean;
}

export function phaseglassRefractPassive(incident: PhaseglassVec3, normal: PhaseglassVec3, etaIncidentOverTransmitted: number): PassiveRefractionResult {
  if (!(etaIncidentOverTransmitted > 0) || !Number.isFinite(etaIncidentOverTransmitted)) throw new RangeError("Refraction ratio must be positive and finite");
  const incoming = phaseglassNormalize(incident);
  let surfaceNormal = phaseglassNormalize(normal, [0, 1, 0]);
  let cosine = -phaseglassDot(incoming, surfaceNormal);
  if (cosine < 0) {
    surfaceNormal = phaseglassScale(surfaceNormal, -1);
    cosine = -phaseglassDot(incoming, surfaceNormal);
  }
  const discriminant = 1 - etaIncidentOverTransmitted ** 2 * (1 - cosine ** 2);
  if (discriminant < 0) return { direction: null, totalInternalReflection: true };
  const direction = phaseglassAdd(
    phaseglassScale(incoming, etaIncidentOverTransmitted),
    phaseglassScale(surfaceNormal, etaIncidentOverTransmitted * cosine - Math.sqrt(Math.max(0, discriminant))),
  );
  return { direction: phaseglassNormalize(direction), totalInternalReflection: false };
}

export function phaseglassSolvePhaseGradient(incomingVelocity: PhaseglassVec3, outgoingVelocity: PhaseglassVec3, normal: PhaseglassVec3): PhaseglassVec3 {
  const unitNormal = phaseglassNormalize(normal, [0, 1, 0]);
  const incomingTangent = phaseglassSub(incomingVelocity, phaseglassScale(unitNormal, phaseglassDot(incomingVelocity, unitNormal)));
  const outgoingTangent = phaseglassSub(outgoingVelocity, phaseglassScale(unitNormal, phaseglassDot(outgoingVelocity, unitNormal)));
  return phaseglassSub(outgoingTangent, incomingTangent);
}

export function phaseglassApplyPhaseGradient(incomingVelocity: PhaseglassVec3, normal: PhaseglassVec3, phaseGradient: PhaseglassVec3): PhaseglassVec3 {
  const speed = phaseglassLength(incomingVelocity);
  if (!(speed > 0)) throw new RangeError("Incoming phaseglass velocity must be non-zero");
  const unitNormal = phaseglassNormalize(normal, [0, 1, 0]);
  const incomingNormal = phaseglassDot(incomingVelocity, unitNormal);
  const incomingTangent = phaseglassSub(incomingVelocity, phaseglassScale(unitNormal, incomingNormal));
  const gradientTangent = phaseglassSub(phaseGradient, phaseglassScale(unitNormal, phaseglassDot(phaseGradient, unitNormal)));
  const outgoingTangent = phaseglassAdd(incomingTangent, gradientTangent);
  const tangentSpeedSquared = phaseglassDot(outgoingTangent, outgoingTangent);
  if (tangentSpeedSquared > speed ** 2 + 1e-10) throw new RangeError("Phase gradient requests impossible tangential momentum");
  const normalSpeed = Math.sqrt(Math.max(0, speed ** 2 - tangentSpeedSquared));
  return phaseglassAdd(outgoingTangent, phaseglassScale(unitNormal, Math.sign(incomingNormal || 1) * normalSpeed));
}

export function phaseglassAdvance(position: PhaseglassVec3, direction: PhaseglassVec3, speed: number, duration: number): PhaseglassVec3 {
  return phaseglassAdd(position, phaseglassScale(phaseglassNormalize(direction), speed * duration));
}
