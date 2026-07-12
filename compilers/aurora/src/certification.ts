import { auroraAdd, auroraCross, auroraDot, auroraLength, auroraNormalize, auroraPropagateConstantField, auroraScale, auroraSub } from "./physics.js";
import type { AuroraCoil, AuroraRouteSegment, AuroraVec3 } from "./types.js";

function coilBasis(axisValue: AuroraVec3): [AuroraVec3, AuroraVec3] {
  const axis = auroraNormalize(axisValue);
  const reference: AuroraVec3 = Math.abs(axis[2]) < 0.86 ? [0, 0, 1] : [1, 0, 0];
  const first = auroraNormalize(auroraCross(axis, reference));
  return [first, auroraNormalize(auroraCross(axis, first))];
}

function centerlinePoint(coil: AuroraCoil, angle: number): AuroraVec3 {
  const [first, second] = coilBasis(coil.axis);
  return auroraAdd(coil.center, auroraAdd(
    auroraScale(first, Math.cos(angle) * coil.radius),
    auroraScale(second, Math.sin(angle) * coil.radius),
  ));
}

export function auroraPointToCoilSurfaceDistance(point: AuroraVec3, coil: AuroraCoil): number {
  const axis = auroraNormalize(coil.axis);
  const delta = auroraSub(point, coil.center);
  const axial = auroraDot(delta, axis);
  const radial = auroraLength(auroraSub(delta, auroraScale(axis, axial)));
  return Math.hypot(radial - coil.radius, axial) - coil.tubeRadius;
}

function sampledCenterlineClearance(from: AuroraCoil, to: AuroraCoil, samples: number): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < samples; index += 1) {
    const point = centerlinePoint(from, index * Math.PI * 2 / samples);
    minimum = Math.min(minimum, auroraPointToCoilSurfaceDistance(point, to) - from.tubeRadius);
  }
  const halfSampleChord = 2 * from.radius * Math.sin(Math.PI / (2 * samples));
  return minimum - halfSampleChord;
}

/** Conservative lower bound for the separation between two oriented torus surfaces. */
export function auroraCoilSurfaceClearance(left: AuroraCoil, right: AuroraCoil, samples = 64): number {
  if (!Number.isInteger(samples) || samples < 8) throw new RangeError("Aurora coil clearance samples must be an integer of at least 8");
  return Math.max(sampledCenterlineClearance(left, right, samples), sampledCenterlineClearance(right, left, samples));
}

/** Conservative lower bound between the particle sphere and a coil body over one segment. */
export function auroraSegmentCoilClearance(segment: AuroraRouteSegment, coil: AuroraCoil, particleRadius: number, samples = 40): number {
  if (!Number.isInteger(samples) || samples < 4) throw new RangeError("Aurora route clearance samples must be an integer of at least 4");
  let minimum = Number.POSITIVE_INFINITY;
  const duration = segment.t1 - segment.t0;
  for (let index = 0; index <= samples; index += 1) {
    const elapsed = duration * index / samples;
    const state = auroraPropagateConstantField(segment.start, segment.field, elapsed, { charge: segment.charge, mass: segment.mass });
    minimum = Math.min(minimum, auroraPointToCoilSurfaceDistance(state.position, coil) - particleRadius);
  }
  const speed = auroraLength(segment.start.velocity);
  return minimum - speed * duration / (2 * samples);
}

export interface AuroraOccupancyCertification {
  minimumCoilSurfaceClearance: number | null;
  minimumParticleClearance: number | null;
  violations: string[];
}

export function certifyAuroraOccupancy(
  route: readonly AuroraRouteSegment[],
  coils: readonly AuroraCoil[],
  particleRadius: number,
  requiredClearance = 0.025,
): AuroraOccupancyCertification {
  let minimumCoilSurfaceClearance = Number.POSITIVE_INFINITY;
  let minimumParticleClearance = Number.POSITIVE_INFINITY;
  const violations: string[] = [];
  for (let leftIndex = 0; leftIndex < coils.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < coils.length; rightIndex += 1) {
      const clearance = auroraCoilSurfaceClearance(coils[leftIndex]!, coils[rightIndex]!);
      minimumCoilSurfaceClearance = Math.min(minimumCoilSurfaceClearance, clearance);
      if (clearance < requiredClearance) violations.push(`coil:${leftIndex}:${rightIndex}:${clearance.toFixed(6)}`);
    }
  }
  for (const [segmentIndex, segment] of route.entries()) {
    for (const [coilIndex, coil] of coils.entries()) {
      const clearance = auroraSegmentCoilClearance(segment, coil, particleRadius);
      minimumParticleClearance = Math.min(minimumParticleClearance, clearance);
      if (clearance < requiredClearance) violations.push(`route:${segmentIndex}:coil:${coilIndex}:${clearance.toFixed(6)}`);
    }
  }
  return {
    minimumCoilSurfaceClearance: Number.isFinite(minimumCoilSurfaceClearance) ? minimumCoilSurfaceClearance : null,
    minimumParticleClearance: Number.isFinite(minimumParticleClearance) ? minimumParticleClearance : null,
    violations,
  };
}
