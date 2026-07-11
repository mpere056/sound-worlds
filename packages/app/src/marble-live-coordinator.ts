import type { MarbleMotionMix } from "@reaper-viz/compiler-marble";

export const MARBLE_LIVE_REQUEST_INTERVAL_MS = 100;
export const MARBLE_MIX_MIN = 10;
export const MARBLE_MIX_MAX = 80;

export type MarbleMotionAxis = keyof MarbleMotionMix;

export interface MarbleLiveMixState {
  desired: MarbleMotionMix;
  requested?: MarbleMotionMix;
  planned?: MarbleMotionMix;
  active: MarbleMotionMix;
}

const MIX_AXES: MarbleMotionAxis[] = ["leftRight", "upDown", "frontBack"];

export function copyMarbleMotionMix(mix: MarbleMotionMix): MarbleMotionMix {
  return { leftRight: mix.leftRight, upDown: mix.upDown, frontBack: mix.frontBack };
}

export function marbleMotionMixLabel(mix: MarbleMotionMix | undefined): string {
  return mix ? `${mix.leftRight}/${mix.upDown}/${mix.frontBack}` : "-";
}

export function projectMarbleMotionMix(
  changed: MarbleMotionAxis,
  requestedValue: number,
  previous: MarbleMotionMix,
): MarbleMotionMix {
  const selected = Math.max(MARBLE_MIX_MIN, Math.min(MARBLE_MIX_MAX, Math.round(requestedValue)));
  const others = MIX_AXES.filter((axis) => axis !== changed);
  const remainder = 100 - selected;
  const previousRemainder = previous[others[0]!] + previous[others[1]!];
  const firstShare = previousRemainder > 0 ? previous[others[0]!] / previousRemainder : 0.5;
  const firstMinimum = Math.max(MARBLE_MIX_MIN, remainder - MARBLE_MIX_MAX);
  const firstMaximum = Math.min(MARBLE_MIX_MAX, remainder - MARBLE_MIX_MIN);
  const first = Math.max(firstMinimum, Math.min(firstMaximum, Math.round(remainder * firstShare)));
  return {
    ...previous,
    [changed]: selected,
    [others[0]!]: first,
    [others[1]!]: remainder - first,
  };
}

export function projectMarbleMotionVector(requested: MarbleMotionMix): MarbleMotionMix {
  let low = Math.min(...MIX_AXES.map((axis) => requested[axis] - MARBLE_MIX_MAX));
  let high = Math.max(...MIX_AXES.map((axis) => requested[axis] - MARBLE_MIX_MIN));
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const lambda = (low + high) / 2;
    const total = MIX_AXES.reduce((sum, axis) => sum + Math.max(MARBLE_MIX_MIN, Math.min(MARBLE_MIX_MAX, requested[axis] - lambda)), 0);
    if (total > 100) low = lambda;
    else high = lambda;
  }
  const lambda = (low + high) / 2;
  const values = MIX_AXES.map((axis) => Math.max(MARBLE_MIX_MIN, Math.min(MARBLE_MIX_MAX, requested[axis] - lambda)));
  const rounded = values.map((value) => Math.floor(value));
  let missing = 100 - rounded.reduce((sum, value) => sum + value, 0);
  const order = values
    .map((value, index) => ({ index, fraction: value - rounded[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const entry of order) {
    if (missing <= 0) break;
    if (rounded[entry.index]! >= MARBLE_MIX_MAX) continue;
    rounded[entry.index]! += 1;
    missing -= 1;
  }
  return { leftRight: rounded[0]!, upDown: rounded[1]!, frontBack: rounded[2]! };
}

export function filterMarbleMotionMix(
  next: MarbleMotionMix,
  previous: MarbleMotionMix,
  deltaSec: number,
  options: { deadband?: number; slewPerSec?: number } = {},
): MarbleMotionMix {
  const deadband = options.deadband ?? 0.75;
  const largestDelta = Math.max(...MIX_AXES.map((axis) => Math.abs(next[axis] - previous[axis])));
  if (largestDelta <= deadband) return copyMarbleMotionMix(previous);
  const maximumStep = Math.max(0, options.slewPerSec ?? 90) * Math.max(0, deltaSec);
  const scale = largestDelta > 0 ? Math.min(1, maximumStep / largestDelta) : 1;
  const floats = MIX_AXES.map((axis) => previous[axis] + (next[axis] - previous[axis]) * scale);
  const floors = floats.map((value) => Math.floor(value));
  let missing = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = floats
    .map((value, index) => ({ index, fraction: value - floors[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < missing; index += 1) floors[order[index % order.length]!.index]! += 1;
  return { leftRight: floors[0]!, upDown: floors[1]!, frontBack: floors[2]! };
}

export function nextMarbleRequestDelay(now: number, lastRequestAt: number, intervalMs = MARBLE_LIVE_REQUEST_INTERVAL_MS): number {
  if (!Number.isFinite(lastRequestAt)) return 0;
  return Math.max(0, intervalMs - (now - lastRequestAt));
}
