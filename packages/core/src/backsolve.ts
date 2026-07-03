export interface Vec2 { x: number; y: number; }

export interface BallisticOptions {
  duration: number;
  launchPos?: Vec2;
  gravity?: number;
  apex?: number;
}

export interface BallisticSolution {
  launchPos: Vec2;
  launchVel: Vec2;
  gravity: number;
  tLaunch: number;
  tImpact: number;
}

export function ballisticArrival(target: Vec2, tImpact: number, options: BallisticOptions): BallisticSolution {
  const duration = options.duration;
  if (!(duration > 0)) throw new RangeError("Ballistic duration must be positive");
  const launchPos = options.launchPos ?? { x: 0, y: 0 };
  const deltaY = target.y - launchPos.y;
  let gravity = options.gravity;
  if (gravity === undefined && options.apex !== undefined) {
    if (!(options.apex > 0) || options.apex < deltaY) throw new RangeError("Apex must be above launch and target");
    const root = Math.sqrt(options.apex) + Math.sqrt(options.apex - deltaY);
    gravity = 2 * root * root / (duration * duration);
  }
  gravity ??= 9.81;
  if (!(gravity > 0)) throw new RangeError("Gravity must be positive");
  return {
    launchPos: { ...launchPos },
    launchVel: {
      x: (target.x - launchPos.x) / duration,
      y: (deltaY + 0.5 * gravity * duration * duration) / duration,
    },
    gravity,
    tLaunch: tImpact - duration,
    tImpact,
  };
}

export interface Path { points: readonly Vec2[]; }
export interface ArrivalOptions { duration?: number; unitsPerSecond?: number; }

export function pathLength(path: Path): number {
  let length = 0;
  for (let index = 1; index < path.points.length; index += 1) {
    const previous = path.points[index - 1];
    const current = path.points[index];
    if (previous && current) length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

export function arriveAt(path: Path, tArrive: number, options: ArrivalOptions): { tDepart: number; duration: number; length: number } {
  const length = pathLength(path);
  const duration = options.duration ?? (options.unitsPerSecond ? length / options.unitsPerSecond : undefined);
  if (!(duration !== undefined && duration > 0)) throw new RangeError("Arrival requires positive duration or unitsPerSecond");
  return { tDepart: tArrive - duration, duration, length };
}

export interface ApproachOnset { t: number; vel?: number; }
export interface ApproachOptions {
  duration: number | ((onset: ApproachOnset, index: number) => number);
  lanes: number;
  maxPerWindow?: number;
  windowSec?: number;
  minSpawnSeparation?: number;
}

export function scheduleApproaches(onsets: readonly ApproachOnset[], options: ApproachOptions): Array<{ spawnT: number; hitT: number; duration: number; lane: number }> {
  if (options.lanes < 1 || !Number.isInteger(options.lanes)) throw new RangeError("lanes must be a positive integer");
  const sorted = [...onsets].sort((a, b) => a.t - b.t);
  const result: Array<{ spawnT: number; hitT: number; duration: number; lane: number }> = [];
  const windowSec = options.windowSec ?? 1;
  const maxPerWindow = options.maxPerWindow ?? Number.POSITIVE_INFINITY;
  const separation = options.minSpawnSeparation ?? 0;
  for (const [index, onset] of sorted.entries()) {
    const recent = result.filter((entry) => entry.hitT > onset.t - windowSec);
    if (recent.length >= maxPerWindow) continue;
    const duration = typeof options.duration === "function" ? options.duration(onset, index) : options.duration;
    if (!(duration > 0)) throw new RangeError("Approach duration must be positive");
    const spawnT = onset.t - duration;
    if (result.some((entry) => Math.abs(entry.spawnT - spawnT) < separation)) continue;
    result.push({ spawnT, hitT: onset.t, duration, lane: result.length % options.lanes });
  }
  return result;
}
