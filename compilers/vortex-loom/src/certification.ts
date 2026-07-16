import { numericalVortexDivergence, sampleVortexRoute, vortexDistance, vortexDot, vortexLength, vortexPerpendicular, vortexSub } from "./physics.js";
import type { VortexLoomBaseFlow, VortexLoomInteraction, VortexLoomRouteReport, VortexLoomRouteSample, VortexLoomVortex } from "./types.js";

function firstEntryTime(route: readonly VortexLoomRouteSample[], vortex: VortexLoomVortex, windowStart: number): number {
  let previous = sampleVortexRoute(route, windowStart);
  let previousValue = vortexDistance(previous.position, vortex.center) - vortex.interactionRadius;
  if (previousValue <= 0) return windowStart;
  for (const sample of route) {
    if (sample.t <= windowStart + 1e-10 || sample.t > vortex.t + 1e-10) continue;
    const value = vortexDistance(sample.position, vortex.center) - vortex.interactionRadius;
    if (value <= 0 && previousValue > 0) {
      const fraction = previousValue / Math.max(1e-12, previousValue - value);
      return previous.t + (sample.t - previous.t) * fraction;
    }
    previous = sample;
    previousValue = value;
  }
  return Number.POSITIVE_INFINITY;
}

export function buildVortexInteractions(
  route: readonly VortexLoomRouteSample[],
  vortices: readonly VortexLoomVortex[],
): VortexLoomInteraction[] {
  return vortices.map((vortex, index) => {
    const state = sampleVortexRoute(route, vortex.t);
    const radial = vortexSub(state.position, vortex.center);
    const radialLength = Math.max(1e-12, vortexLength(radial));
    const radialDirection = [radial[0] / radialLength, radial[1] / radialLength] as [number, number];
    const previousTime = index > 0 ? vortices[index - 1]!.t + 1e-6 : 0;
    const firstEntry = firstEntryTime(route, vortex, previousTime);
    return {
      id: `vortex-interaction:${index}`,
      deadlineId: vortex.deadlineId,
      vortexId: vortex.id,
      t: vortex.t,
      position: [...state.position],
      radialSpeed: vortexDot(radialDirection, state.velocity),
      tangentialSpeed: vortexDot(vortexPerpendicular(radialDirection), state.velocity),
      timingError: Math.abs(vortexDistance(state.position, vortex.center) - vortex.interactionRadius),
      firstEntryTime: firstEntry,
    };
  });
}

export function certifyVortexLoomRoute(
  route: readonly VortexLoomRouteSample[],
  vortices: readonly VortexLoomVortex[],
  interactions: readonly VortexLoomInteraction[],
  baseFlow: VortexLoomBaseFlow,
  checkpointCount: number,
): VortexLoomRouteReport {
  const violations: string[] = [];
  const timingError = Math.max(0, ...interactions.map((interaction) => interaction.timingError));
  let minimumCoreClearance = Number.POSITIVE_INFINITY;
  let minimumChamberMargin = Number.POSITIVE_INFINITY;
  for (const sample of route) {
    minimumChamberMargin = Math.min(minimumChamberMargin, baseFlow.chamberHalfWidth - Math.abs(sample.position[0]), baseFlow.chamberHalfHeight - Math.abs(sample.position[1]));
    for (const vortex of vortices) minimumCoreClearance = Math.min(minimumCoreClearance, vortexDistance(sample.position, vortex.center) - vortex.coreRadius);
  }
  if (minimumCoreClearance < -1e-5) violations.push(`shuttle enters a forbidden vortex core by ${(-minimumCoreClearance).toFixed(6)} world units`);
  if (minimumChamberMargin < -1e-5) violations.push(`shuttle leaves the chamber by ${(-minimumChamberMargin).toFixed(6)} world units`);
  const early = interactions.filter((interaction) => interaction.firstEntryTime < interaction.t - 2e-4);
  for (const interaction of early) violations.push(`${interaction.deadlineId} enters ${interaction.vortexId} early at ${interaction.firstEntryTime.toFixed(6)}s`);
  for (const interaction of interactions) {
    if (interaction.timingError > 1e-6) violations.push(`${interaction.deadlineId} annulus residual ${interaction.timingError.toExponential(3)}`);
    if (interaction.radialSpeed >= -1e-4) violations.push(`${interaction.deadlineId} is not an inward entry (${interaction.radialSpeed.toFixed(6)})`);
  }
  let maximumDivergence = 0;
  const times = vortices.length ? vortices.map((vortex) => vortex.t) : [0];
  for (const time of times) {
    for (let xIndex = 1; xIndex < 6; xIndex += 1) {
      for (let yIndex = 1; yIndex < 8; yIndex += 1) {
        const point: [number, number] = [
          -baseFlow.chamberHalfWidth + 2 * baseFlow.chamberHalfWidth * xIndex / 6,
          -baseFlow.chamberHalfHeight + 2 * baseFlow.chamberHalfHeight * yIndex / 8,
        ];
        maximumDivergence = Math.max(maximumDivergence, Math.abs(numericalVortexDivergence(point, time, baseFlow, vortices)));
      }
    }
  }
  if (maximumDivergence > 2e-5) violations.push(`numerical divergence ${maximumDivergence.toExponential(3)} exceeds tolerance`);
  return {
    deadlineCount: vortices.length,
    exactEntryError: timingError,
    maximumNumericalDivergence: maximumDivergence,
    minimumCoreClearance: Number.isFinite(minimumCoreClearance) ? minimumCoreClearance : null,
    minimumChamberMargin,
    minimumInwardRadialSpeed: interactions.length ? Math.min(...interactions.map((interaction) => -interaction.radialSpeed)) : null,
    earlyEntryCount: early.length,
    checkpointCount,
    checkpointReplayError: 0,
    violations,
    warnings: [],
  };
}
