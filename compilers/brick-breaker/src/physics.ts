export type BrickVec2 = [number, number];

export interface BrickOrientedBox {
  center: BrickVec2;
  halfExtents: BrickVec2;
  rotation: number;
}

export interface BrickSweepHit {
  t: number;
  point: BrickVec2;
  normal: BrickVec2;
}

export const BRICK_PHYSICS_EPSILON = 1e-9;

export function brickAdd(a: BrickVec2, b: BrickVec2): BrickVec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function brickSub(a: BrickVec2, b: BrickVec2): BrickVec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

export function brickScale(value: BrickVec2, scalar: number): BrickVec2 {
  return [value[0] * scalar, value[1] * scalar];
}

export function brickDot(a: BrickVec2, b: BrickVec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function brickLength(value: BrickVec2): number {
  return Math.hypot(...value);
}

export function brickNormalize(value: BrickVec2, fallback: BrickVec2 = [1, 0]): BrickVec2 {
  const length = brickLength(value);
  return length > BRICK_PHYSICS_EPSILON ? brickScale(value, 1 / length) : [...fallback];
}

export function brickReflect(incoming: BrickVec2, normal: BrickVec2): BrickVec2 {
  const unitNormal = brickNormalize(normal);
  return brickSub(incoming, brickScale(unitNormal, 2 * brickDot(incoming, unitNormal)));
}

export function brickSegmentCircleIntersections(from: BrickVec2, to: BrickVec2, center: BrickVec2, radius: number): number[] {
  if (radius < 0) throw new RangeError("Circle radius cannot be negative");
  const direction = brickSub(to, from);
  const relative = brickSub(from, center);
  const a = brickDot(direction, direction);
  if (a <= BRICK_PHYSICS_EPSILON) return Math.abs(brickLength(relative) - radius) <= BRICK_PHYSICS_EPSILON ? [0] : [];
  const b = 2 * brickDot(relative, direction);
  const c = brickDot(relative, relative) - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -BRICK_PHYSICS_EPSILON) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  const values = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((value) => value >= -BRICK_PHYSICS_EPSILON && value <= 1 + BRICK_PHYSICS_EPSILON)
    .map((value) => Math.max(0, Math.min(1, value)))
    .sort((left, right) => left - right);
  return values.filter((value, index) => index === 0 || Math.abs(value - values[index - 1]!) > BRICK_PHYSICS_EPSILON);
}

function toBoxLocal(point: BrickVec2, box: BrickOrientedBox): BrickVec2 {
  const delta = brickSub(point, box.center);
  const cosine = Math.cos(box.rotation);
  const sine = Math.sin(box.rotation);
  return [delta[0] * cosine + delta[1] * sine, -delta[0] * sine + delta[1] * cosine];
}

function fromBoxLocalDirection(direction: BrickVec2, box: BrickOrientedBox): BrickVec2 {
  const cosine = Math.cos(box.rotation);
  const sine = Math.sin(box.rotation);
  return [direction[0] * cosine - direction[1] * sine, direction[0] * sine + direction[1] * cosine];
}

export function brickSweepCircleAgainstBox(from: BrickVec2, to: BrickVec2, radius: number, box: BrickOrientedBox): BrickSweepHit | undefined {
  if (radius < 0) throw new RangeError("Ball radius cannot be negative");
  const localFrom = toBoxLocal(from, box);
  const localTo = toBoxLocal(to, box);
  const direction = brickSub(localTo, localFrom);
  const extents: BrickVec2 = [box.halfExtents[0] + radius, box.halfExtents[1] + radius];
  let near = 0;
  let far = 1;
  let hitAxis = -1;
  let hitSign = 0;
  for (let axis = 0; axis < 2; axis += 1) {
    if (Math.abs(direction[axis]!) <= BRICK_PHYSICS_EPSILON) {
      if (localFrom[axis]! < -extents[axis]! || localFrom[axis]! > extents[axis]!) return undefined;
      continue;
    }
    const inverse = 1 / direction[axis]!;
    let axisNear = (-extents[axis]! - localFrom[axis]!) * inverse;
    let axisFar = (extents[axis]! - localFrom[axis]!) * inverse;
    let sign = -1;
    if (axisNear > axisFar) {
      [axisNear, axisFar] = [axisFar, axisNear];
      sign = 1;
    }
    if (axisNear > near) {
      near = axisNear;
      hitAxis = axis;
      hitSign = sign;
    }
    far = Math.min(far, axisFar);
    if (near - far > BRICK_PHYSICS_EPSILON) return undefined;
  }
  if (near < -BRICK_PHYSICS_EPSILON || near > 1 + BRICK_PHYSICS_EPSILON) return undefined;
  const t = Math.max(0, Math.min(1, near));
  const localNormal: BrickVec2 = hitAxis === 0 ? [hitSign, 0] : hitAxis === 1 ? [0, hitSign] : brickScale(brickNormalize(direction), -1);
  return {
    t,
    point: brickAdd(from, brickScale(brickSub(to, from), t)),
    normal: brickNormalize(fromBoxLocalDirection(localNormal, box)),
  };
}
