import {
  AURORA_PHYSICS_EPSILON,
  auroraDot,
  auroraLength,
  auroraNormalize,
  auroraPropagateConstantField,
  auroraScale,
  auroraSub,
} from "./physics.js";
import type { AuroraIdealArcRequest, AuroraIdealArcSolution, AuroraVec3 } from "./types.js";

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number`);
}

function requireVector(value: AuroraVec3, label: string): void {
  if (!value.every(Number.isFinite)) throw new RangeError(`${label} must contain finite values`);
}

/** Solves the ideal constant magnetic field required to author one exact helical arc. */
export function auroraSolveIdealMagneticArc(request: AuroraIdealArcRequest): AuroraIdealArcSolution {
  requireVector(request.state.position, "Aurora arc start position");
  requireVector(request.state.velocity, "Aurora arc start velocity");
  requireVector(request.fieldAxis, "Aurora arc field axis");
  requirePositive(request.duration, "Aurora arc duration");
  requireFinite(request.turnAngle, "Aurora arc turn angle");
  requireFinite(request.charge, "Aurora particle charge");
  requirePositive(request.mass, "Aurora particle mass");
  requirePositive(request.maxMagneticField, "Aurora maximum magnetic field");
  if (Math.abs(request.charge) <= AURORA_PHYSICS_EPSILON) throw new RangeError("Aurora inverse arc requires non-zero charge");
  if (auroraLength(request.fieldAxis) <= AURORA_PHYSICS_EPSILON) throw new RangeError("Aurora arc field axis must be non-zero");
  const speed = auroraLength(request.state.velocity);
  if (speed <= AURORA_PHYSICS_EPSILON) throw new RangeError("Aurora inverse arc requires non-zero particle speed");

  const authoredAxis = auroraNormalize(request.fieldAxis);
  const signedField = request.mass * request.turnAngle / (request.charge * request.duration);
  const fieldMagnitude = Math.abs(signedField);
  if (fieldMagnitude > request.maxMagneticField + AURORA_PHYSICS_EPSILON) {
    throw new RangeError(`Aurora arc requires magnetic field ${fieldMagnitude.toFixed(6)}, above limit ${request.maxMagneticField.toFixed(6)}`);
  }

  const magnetic = auroraScale(authoredAxis, signedField);
  const field = { electric: [0, 0, 0] as AuroraVec3, magnetic };
  const propagated = auroraPropagateConstantField(
    request.state,
    field,
    request.duration,
    { charge: request.charge, mass: request.mass },
  );
  const parallelVelocity = auroraScale(authoredAxis, auroraDot(request.state.velocity, authoredAxis));
  const perpendicularSpeed = auroraLength(auroraSub(request.state.velocity, parallelVelocity));
  const angularSpeed = Math.abs(request.turnAngle / request.duration);
  const curvatureRadius = angularSpeed > AURORA_PHYSICS_EPSILON && perpendicularSpeed > AURORA_PHYSICS_EPSILON
    ? perpendicularSpeed / angularSpeed
    : null;
  const coilAxis = fieldMagnitude > AURORA_PHYSICS_EPSILON ? auroraNormalize(magnetic) : authoredAxis;

  return {
    start: { position: [...request.state.position], velocity: [...request.state.velocity] },
    end: { position: propagated.position, velocity: propagated.velocity },
    duration: request.duration,
    turnAngle: request.turnAngle,
    signedAngularVelocity: request.turnAngle / request.duration,
    field,
    fieldMagnitude,
    curvatureRadius,
    pathLength: speed * request.duration,
    coilCenter: [...propagated.position],
    coilAxis,
    arrivalDirection: auroraNormalize(propagated.velocity),
  };
}
