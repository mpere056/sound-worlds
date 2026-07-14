import { phaseglassDistance, phaseglassDot, phaseglassLength, phaseglassSub } from "./physics.js";
import type { PhaseglassMembrane, PhaseglassRouteSegment } from "./types.js";

export interface PhaseglassCertification {
  minimumMembraneClearance: number | null;
  earlyCrossingCount: number;
  violations: string[];
}

function interiorDiscCrossing(segment: PhaseglassRouteSegment, membrane: PhaseglassMembrane): boolean {
  const delta = phaseglassSub(segment.end.position, segment.start.position);
  const denominator = phaseglassDot(delta, membrane.normal);
  if (Math.abs(denominator) < 1e-10) return false;
  const fraction = phaseglassDot(phaseglassSub(membrane.center, segment.start.position), membrane.normal) / denominator;
  if (fraction <= 1e-7 || fraction >= 1 - 1e-7) return false;
  const point: [number, number, number] = [
    segment.start.position[0] + delta[0] * fraction,
    segment.start.position[1] + delta[1] * fraction,
    segment.start.position[2] + delta[2] * fraction,
  ];
  return phaseglassLength(phaseglassSub(point, membrane.center)) <= membrane.radius + membrane.thickness;
}

export function certifyPhaseglassRoute(route: readonly PhaseglassRouteSegment[], membranes: readonly PhaseglassMembrane[]): PhaseglassCertification {
  let minimumMembraneClearance = Number.POSITIVE_INFINITY;
  const violations: string[] = [];
  for (let left = 0; left < membranes.length; left += 1) {
    for (let right = left + 1; right < membranes.length; right += 1) {
      const clearance = phaseglassDistance(membranes[left]!.center, membranes[right]!.center) - membranes[left]!.radius - membranes[right]!.radius;
      minimumMembraneClearance = Math.min(minimumMembraneClearance, clearance);
      if (clearance < -1e-7) violations.push(`${membranes[left]!.id} overlaps ${membranes[right]!.id} by ${(-clearance).toFixed(6)}`);
    }
  }
  let earlyCrossingCount = 0;
  for (const segment of route) {
    for (const membrane of membranes) {
      if (interiorDiscCrossing(segment, membrane)) {
        earlyCrossingCount += 1;
        violations.push(`${segment.id} crosses ${membrane.id} away from its authored endpoint`);
      }
    }
  }
  return {
    minimumMembraneClearance: Number.isFinite(minimumMembraneClearance) ? minimumMembraneClearance : null,
    earlyCrossingCount,
    violations,
  };
}
