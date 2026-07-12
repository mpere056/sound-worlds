import type { AuroraConstantField, AuroraParticleState, AuroraPropagationOptions, AuroraPropagationResult, AuroraVec3 } from "./types.js";

export const AURORA_PHYSICS_EPSILON = 1e-12;

export function auroraAdd(left: AuroraVec3, right: AuroraVec3): AuroraVec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

export function auroraSub(left: AuroraVec3, right: AuroraVec3): AuroraVec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

export function auroraScale(value: AuroraVec3, scalar: number): AuroraVec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

export function auroraDot(left: AuroraVec3, right: AuroraVec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function auroraCross(left: AuroraVec3, right: AuroraVec3): AuroraVec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function auroraLength(value: AuroraVec3): number {
  return Math.hypot(...value);
}

export function auroraNormalize(value: AuroraVec3, fallback: AuroraVec3 = [1, 0, 0]): AuroraVec3 {
  const length = auroraLength(value);
  return length > AURORA_PHYSICS_EPSILON ? auroraScale(value, 1 / length) : [...fallback];
}

export function auroraKineticEnergy(mass: number, velocity: AuroraVec3): number {
  return 0.5 * mass * auroraDot(velocity, velocity);
}

function validateVector(value: AuroraVec3, label: string): void {
  if (!value.every(Number.isFinite)) throw new RangeError(`${label} must contain finite values`);
}

function validatePropagation(state: AuroraParticleState, field: AuroraConstantField, duration: number, options: AuroraPropagationOptions): void {
  validateVector(state.position, "Aurora position");
  validateVector(state.velocity, "Aurora velocity");
  validateVector(field.electric, "Aurora electric field");
  validateVector(field.magnetic, "Aurora magnetic field");
  if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Aurora propagation duration must be finite and non-negative");
  if (!Number.isFinite(options.mass) || options.mass <= 0) throw new RangeError("Aurora particle mass must be positive and finite");
  if (!Number.isFinite(options.charge)) throw new RangeError("Aurora particle charge must be finite");
}

export function auroraPropagateConstantField(
  state: AuroraParticleState,
  field: AuroraConstantField,
  duration: number,
  options: AuroraPropagationOptions,
): AuroraPropagationResult {
  validatePropagation(state, field, duration, options);
  const chargeToMass = options.charge / options.mass;
  const magneticMagnitude = auroraLength(field.magnetic);
  const omega = chargeToMass * magneticMagnitude;
  let position: AuroraVec3;
  let velocity: AuroraVec3;

  if (Math.abs(omega) <= AURORA_PHYSICS_EPSILON) {
    const acceleration = auroraScale(field.electric, chargeToMass);
    position = auroraAdd(state.position, auroraAdd(
      auroraScale(state.velocity, duration),
      auroraScale(acceleration, 0.5 * duration * duration),
    ));
    velocity = auroraAdd(state.velocity, auroraScale(acceleration, duration));
  } else {
    const axis = auroraScale(field.magnetic, 1 / magneticMagnitude);
    const acceleration = auroraScale(field.electric, chargeToMass);
    const accelerationParallel = auroraScale(axis, auroraDot(acceleration, axis));
    const accelerationPerpendicular = auroraSub(acceleration, accelerationParallel);
    const velocityParallel = auroraScale(axis, auroraDot(state.velocity, axis));
    const velocityPerpendicular = auroraSub(state.velocity, velocityParallel);
    const drift = auroraScale(auroraCross(accelerationPerpendicular, axis), 1 / omega);
    const rotatingVelocity = auroraSub(velocityPerpendicular, drift);
    const rotatingCrossAxis = auroraCross(rotatingVelocity, axis);
    const angle = omega * duration;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);

    velocity = auroraAdd(
      auroraAdd(velocityParallel, auroraScale(accelerationParallel, duration)),
      auroraAdd(drift, auroraAdd(
        auroraScale(rotatingVelocity, cosine),
        auroraScale(rotatingCrossAxis, sine),
      )),
    );

    const displacement = auroraAdd(
      auroraAdd(
        auroraScale(velocityParallel, duration),
        auroraScale(accelerationParallel, 0.5 * duration * duration),
      ),
      auroraAdd(
        auroraScale(drift, duration),
        auroraAdd(
          auroraScale(rotatingVelocity, sine / omega),
          auroraScale(rotatingCrossAxis, (1 - cosine) / omega),
        ),
      ),
    );
    position = auroraAdd(state.position, displacement);
  }

  const displacement = auroraSub(position, state.position);
  return {
    position,
    velocity,
    duration,
    electricWork: options.charge * auroraDot(field.electric, displacement),
    kineticEnergyDelta: auroraKineticEnergy(options.mass, velocity) - auroraKineticEnergy(options.mass, state.velocity),
    magneticWork: 0,
  };
}

export function auroraIntegrateBoris(
  state: AuroraParticleState,
  field: AuroraConstantField,
  duration: number,
  steps: number,
  options: AuroraPropagationOptions,
): AuroraParticleState {
  validatePropagation(state, field, duration, options);
  if (!Number.isInteger(steps) || steps < 1) throw new RangeError("Aurora Boris integration steps must be a positive integer");
  const dt = duration / steps;
  const halfElectricKick = auroraScale(field.electric, options.charge * dt / (2 * options.mass));
  const magneticRotation = auroraScale(field.magnetic, options.charge * dt / (2 * options.mass));
  const magneticRotationSquared = auroraDot(magneticRotation, magneticRotation);
  const magneticCorrection = auroraScale(magneticRotation, 2 / (1 + magneticRotationSquared));
  let position: AuroraVec3 = [...state.position];
  let velocity: AuroraVec3 = [...state.velocity];
  for (let step = 0; step < steps; step += 1) {
    const velocityMinus = auroraAdd(velocity, halfElectricKick);
    const velocityPrime = auroraAdd(velocityMinus, auroraCross(velocityMinus, magneticRotation));
    const velocityPlus = auroraAdd(velocityMinus, auroraCross(velocityPrime, magneticCorrection));
    const nextVelocity = auroraAdd(velocityPlus, halfElectricKick);
    position = auroraAdd(position, auroraScale(auroraAdd(velocity, nextVelocity), 0.5 * dt));
    velocity = nextVelocity;
  }
  return { position, velocity };
}

export function auroraIdealFieldDivergence(): 0 {
  return 0;
}
