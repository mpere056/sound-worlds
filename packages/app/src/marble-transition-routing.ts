import type { MarbleTarget } from "@reaper-viz/compiler-marble";

export type MarbleTransitionOffset = [number, number, number];

interface Footprint {
  center: MarbleTransitionOffset;
  axes: [MarbleTransitionOffset, MarbleTransitionOffset, MarbleTransitionOffset];
  halfExtents: MarbleTransitionOffset;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function interpolateAngle(from: number, to: number, progress: number): number {
  const delta = ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return from + delta * progress;
}

function targetAt(from: MarbleTarget, to: MarbleTarget, raw: number, offset: MarbleTransitionOffset): MarbleTarget {
  const progress = clamp(raw);
  const envelope = Math.sin(Math.PI * progress);
  return {
    ...to,
    pos: from.pos.map((value, index) => value + (to.pos[index]! - value) * progress + offset[index]! * envelope) as MarbleTransitionOffset,
    contactPos: from.contactPos.map((value, index) => value + (to.contactPos[index]! - value) * progress + offset[index]! * envelope) as MarbleTransitionOffset,
    rotation: from.rotation.map((value, index) => interpolateAngle(value, to.rotation[index]!, progress)) as MarbleTransitionOffset,
    size: from.size.map((value, index) => value + (to.size[index]! - value) * progress) as MarbleTransitionOffset,
  };
}

function footprint(target: MarbleTarget): Footprint {
  const rotation = target.rotation[2];
  const tilt = target.rotation[0];
  const sinRotation = Math.sin(rotation);
  const cosRotation = Math.cos(rotation);
  const sinTilt = Math.sin(tilt);
  const cosTilt = Math.cos(tilt);
  return {
    center: target.pos,
    axes: [
      [cosRotation, sinRotation, 0],
      [-sinRotation * cosTilt, cosRotation * cosTilt, sinTilt],
      [sinRotation * sinTilt, -cosRotation * sinTilt, cosTilt],
    ],
    halfExtents: [target.size[0] / 2, target.kind === "peg" || target.kind === "chime" ? target.size[1] * 0.9 : target.size[1] / 2, target.size[2] / 2],
  };
}

function dot(a: MarbleTransitionOffset, b: MarbleTransitionOffset): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: MarbleTransitionOffset, b: MarbleTransitionOffset): MarbleTransitionOffset {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function radius(value: Footprint, axis: MarbleTransitionOffset): number {
  return value.axes.reduce((sum, footprintAxis, index) => sum + value.halfExtents[index]! * Math.abs(dot(footprintAxis, axis)), 0);
}

function overlaps(left: Footprint, right: Footprint, padding = 0.025): boolean {
  const delta: MarbleTransitionOffset = [right.center[0] - left.center[0], right.center[1] - left.center[1], right.center[2] - left.center[2]];
  const axes: MarbleTransitionOffset[] = [...left.axes, ...right.axes];
  for (const leftAxis of left.axes) {
    for (const rightAxis of right.axes) {
      const value = cross(leftAxis, rightAxis);
      const length = Math.hypot(...value);
      if (length > 1e-9) axes.push([value[0] / length, value[1] / length, value[2] / length]);
    }
  }
  return axes.every((axis) => Math.abs(dot(delta, axis)) < radius(left, axis) + radius(right, axis) + padding);
}

export function marbleTransitionOverlapCount(
  fromTargets: readonly MarbleTarget[],
  toTargets: readonly MarbleTarget[],
  offsets: ReadonlyMap<string, MarbleTransitionOffset>,
  samples = 120,
): number {
  const toById = new Map(toTargets.map((target) => [target.id, target]));
  const pairs = fromTargets.flatMap((from) => {
    const to = toById.get(from.id);
    return to ? [{ id: from.id, from, to }] : [];
  }).sort((a, b) => a.id.localeCompare(b.id));
  let count = 0;
  for (let sample = 1; sample < samples; sample += 1) {
    const progress = sample / samples;
    const footprints = pairs.map((pair) => footprint(targetAt(pair.from, pair.to, progress, offsets.get(pair.id) ?? [0, 0, 0])));
    for (let left = 0; left < footprints.length; left += 1) {
      for (let right = left + 1; right < footprints.length; right += 1) {
        if (overlaps(footprints[left]!, footprints[right]!)) count += 1;
      }
    }
  }
  return count;
}

function overlappingTargetIds(
  fromTargets: readonly MarbleTarget[],
  toTargets: readonly MarbleTarget[],
  offsets: ReadonlyMap<string, MarbleTransitionOffset>,
  samples: number,
): Set<string> {
  const toById = new Map(toTargets.map((target) => [target.id, target]));
  const pairs = fromTargets.flatMap((from) => {
    const to = toById.get(from.id);
    return to ? [{ id: from.id, from, to }] : [];
  }).sort((a, b) => a.id.localeCompare(b.id));
  const result = new Set<string>();
  for (let sample = 1; sample < samples; sample += 1) {
    const progress = sample / samples;
    const footprints = pairs.map((pair) => footprint(targetAt(pair.from, pair.to, progress, offsets.get(pair.id) ?? [0, 0, 0])));
    for (let left = 0; left < footprints.length; left += 1) {
      for (let right = left + 1; right < footprints.length; right += 1) {
        if (overlaps(footprints[left]!, footprints[right]!)) {
          result.add(pairs[left]!.id);
          result.add(pairs[right]!.id);
        }
      }
    }
  }
  return result;
}

function targetOverlapCount(
  targetId: string,
  fromTargets: readonly MarbleTarget[],
  toTargets: readonly MarbleTarget[],
  offsets: ReadonlyMap<string, MarbleTransitionOffset>,
  samples: number,
): number {
  const fromById = new Map(fromTargets.map((target) => [target.id, target]));
  const toById = new Map(toTargets.map((target) => [target.id, target]));
  const from = fromById.get(targetId);
  const to = toById.get(targetId);
  if (!from || !to) return 0;
  let count = 0;
  for (let sample = 1; sample < samples; sample += 1) {
    const progress = sample / samples;
    const active = footprint(targetAt(from, to, progress, offsets.get(targetId) ?? [0, 0, 0]));
    for (const [otherId, otherFrom] of fromById) {
      if (otherId === targetId) continue;
      const otherTo = toById.get(otherId);
      if (otherTo && overlaps(active, footprint(targetAt(otherFrom, otherTo, progress, offsets.get(otherId) ?? [0, 0, 0])))) count += 1;
    }
  }
  return count;
}

export interface MarbleTransitionRoute {
  offsets: Array<[string, MarbleTransitionOffset]>;
  overlapCount: number;
  samples: number;
}

export function planMarbleTransitionRoute(fromTargets: readonly MarbleTarget[], toTargets: readonly MarbleTarget[]): MarbleTransitionRoute {
  const ids = fromTargets.map((target) => target.id).filter((id) => toTargets.some((target) => target.id === id)).sort();
  const direct = new Map<string, MarbleTransitionOffset>(ids.map((id) => [id, [0, 0, 0]]));
  const samples = 120;
  const directOverlaps = marbleTransitionOverlapCount(fromTargets, toTargets, direct, samples);
  if (directOverlaps === 0) return { offsets: [...direct], overlapCount: 0, samples };

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  let best = direct;
  let bestCount = directOverlaps;
  for (const magnitude of [0.8, 1.2, 1.8, 2.6, 3.8, 5.4, 7.2]) {
    for (const verticalScale of [0.24, 0.48]) {
      for (let phaseIndex = 0; phaseIndex < 8; phaseIndex += 1) {
        const phase = phaseIndex * Math.PI / 4;
        const candidate = new Map<string, MarbleTransitionOffset>();
        ids.forEach((id, index) => {
          const angle = index * goldenAngle + phase;
          candidate.set(id, [Math.cos(angle) * magnitude, (((index * 2) % 5) - 2) * magnitude * verticalScale, Math.sin(angle) * magnitude]);
        });
        const count = marbleTransitionOverlapCount(fromTargets, toTargets, candidate, samples);
        if (count < bestCount) {
          best = candidate;
          bestCount = count;
        }
        if (count === 0) return { offsets: [...candidate], overlapCount: 0, samples };
      }
    }
  }
  const repairDirections: MarbleTransitionOffset[] = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [0.7, 0, 0.7], [-0.7, 0, 0.7], [0.7, 0, -0.7], [-0.7, 0, -0.7],
    [0, 0.7, 0.7], [0, -0.7, 0.7], [0, 0.7, -0.7], [0, -0.7, -0.7],
  ];
  for (let pass = 0; pass < 4 && bestCount > 0; pass += 1) {
    const conflicts = [...overlappingTargetIds(fromTargets, toTargets, best, samples)].sort().reverse();
    for (const id of conflicts) {
      const original = best.get(id) ?? [0, 0, 0];
      let selected = original;
      let selectedCount = targetOverlapCount(id, fromTargets, toTargets, best, samples);
      for (const magnitude of [0.6, 1, 1.6, 2.4, 3.4]) {
        for (const direction of repairDirections) {
          const candidate = original.map((value, index) => value + direction[index]! * magnitude) as MarbleTransitionOffset;
          best.set(id, candidate);
          const count = targetOverlapCount(id, fromTargets, toTargets, best, samples);
          if (count < selectedCount) {
            selected = candidate;
            selectedCount = count;
          }
          if (count === 0) break;
        }
        if (selectedCount === 0) break;
      }
      best.set(id, selected);
    }
    bestCount = marbleTransitionOverlapCount(fromTargets, toTargets, best, samples);
  }
  return { offsets: [...best], overlapCount: bestCount, samples };
}
