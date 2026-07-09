import { parsePerformance, solvePalette, type CameraKeyframe, type PerformanceEvent, type Song, type SongEvent, type SongTrack } from "@reaper-viz/core";
import type {
  CompileMarbleOptions,
  MarbleCluster,
  MarbleClusterKind,
  MarbleDiagnostics,
  MarbleImpact,
  MarblePathKind,
  MarblePathSegment,
  MarblePerformance,
  MarblePose,
  MarbleTarget,
  MarbleTrackMetrics,
} from "./types.js";

export * from "./types.js";

const W = 1080;
const H = 1920;
const DENSE_RATTLE = 0.09;
const DENSE_CASCADE = 0.22;
const EPS = 1e-6;
const MARBLE_RADIUS = 0.28;
const MARBLE_GRAVITY = 3.6;
const MARBLE_HORIZONTAL_SPEED = 1.6;
const MARBLE_INITIAL_DROP_SPEED = 1.6;
const MARBLE_X_LIMIT = 3.1;
const ARC_SAMPLE_COUNT = 24;
const PITCH_COLORS = ["#6ee7ff", "#8df5c8", "#f7d06a", "#ff9bd6", "#9ea7ff", "#f4fbff", "#7affd7", "#ffb86b", "#c2ff72", "#b9d8ff", "#ffd1f2", "#d8f6ff"];

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

interface SelectedTrack {
  track: SongTrack;
  notes: SongEvent[];
  mode: "auto" | "manual";
  reason: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, places = 6): number {
  return Number(value.toFixed(places));
}

function vecRound(value: Vec3, places = 6): Vec3 {
  return [round(value[0], places), round(value[1], places), round(value[2], places)];
}

function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vecSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vecScale(a: Vec3, scalar: number): Vec3 {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
}

function vecMix(a: Vec3, b: Vec3, amount: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}

function vecDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vecCross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function vecLength(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function vecDistance(a: Vec3, b: Vec3): number {
  return vecLength(vecSub(a, b));
}

function vecNormalize(a: Vec3, fallback: Vec3 = [1, 0, 0]): Vec3 {
  const length = vecLength(a);
  return length > EPS ? [a[0] / length, a[1] / length, a[2] / length] : fallback;
}

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const normalized = vecNormalize(axis, [0, 0, 1]);
  const half = angle / 2;
  const sin = Math.sin(half);
  return [normalized[0] * sin, normalized[1] * sin, normalized[2] * sin, Math.cos(half)];
}

function quatMultiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function quatNormalize(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  return length > EPS ? [q[0] / length, q[1] / length, q[2] / length, q[3] / length] : [0, 0, 0, 1];
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function notesFor(track: SongTrack): SongEvent[] {
  return track.events
    .filter((event) => event.kind === "note" && event.pitch !== null)
    .sort((a, b) => a.t - b.t || (a.pitch ?? 0) - (b.pitch ?? 0));
}

function pitchRange(notes: readonly SongEvent[]): { min: number; max: number; range: number } {
  const pitches = notes.map((note) => note.pitch ?? 60);
  const min = Math.min(...pitches);
  const max = Math.max(...pitches);
  return { min, max, range: max - min };
}

function gapsFor(notes: readonly SongEvent[]): number[] {
  const gaps: number[] = [];
  for (let index = 1; index < notes.length; index += 1) gaps.push(Math.max(0, notes[index]!.t - notes[index - 1]!.t));
  return gaps;
}

function scoreTrack(track: SongTrack, notes: readonly SongEvent[], durationSec: number): number {
  if (!notes.length) return -1;
  const pitches = notes.map((note) => note.pitch ?? 60);
  const range = pitchRange(notes).range;
  const gaps = gapsFor(notes);
  const noteCountScore = clamp(notes.length / 20, 0.2, 1.4);
  const pitchRangeScore = clamp(range / 18, 0.35, 1.15);
  const denseRatio = gaps.length ? gaps.filter((gap) => gap < DENSE_RATTLE).length / gaps.length : 0;
  const densityScore = clamp(1 - denseRatio * 1.4, 0.18, 1);
  const meanPitch = pitches.reduce((sum, pitch) => sum + pitch, 0) / pitches.length;
  const lowAnchorScore = clamp((76 - meanPitch) / 40, 0.55, 1.25);
  const coverage = notes.length > 1 ? (notes[notes.length - 1]!.t - notes[0]!.t) / Math.max(0.001, durationSec) : 0.1;
  const durationCoverageScore = clamp(coverage * 2.1, 0.25, 1.05);
  const role = track.role.toLowerCase();
  const roleConfidenceScore = /lead|melody|keys|piano|synth|bass/.test(role) ? 1 : 0.72;
  return noteCountScore * pitchRangeScore * densityScore * lowAnchorScore * durationCoverageScore * roleConfidenceScore;
}

function selectTrack(song: Song, options: CompileMarbleOptions): SelectedTrack {
  if (options.sourceTrackId) {
    const track = song.tracks.find((candidate) => candidate.id === options.sourceTrackId);
    if (!track) throw new Error(`Marble source track not found: ${options.sourceTrackId}`);
    const notes = notesFor(track);
    if (!notes.length) throw new Error(`Marble source track has no MIDI notes: ${track.name}`);
    return { track, notes, mode: "manual", reason: `manual track override: ${track.name}` };
  }
  const scored = song.tracks
    .map((track) => ({ track, notes: notesFor(track), score: scoreTrack(track, notesFor(track), song.meta.durationSec) }))
    .filter((entry) => entry.notes.length)
    .sort((a, b) => b.score - a.score || b.notes.length - a.notes.length || a.track.name.localeCompare(b.track.name));
  const selected = scored[0];
  if (!selected) throw new Error("Marble Music requires at least one note-bearing track");
  return {
    track: selected.track,
    notes: selected.notes,
    mode: "auto",
    reason: `auto score ${selected.score.toFixed(3)} from ${selected.notes.length} notes, role ${selected.track.role}`,
  };
}

function compileMetrics(notes: readonly SongEvent[]): MarbleTrackMetrics {
  const pitches = pitchRange(notes);
  const gaps = gapsFor(notes);
  const velocities = notes.map((note) => note.vel);
  return {
    firstNoteT: notes[0]?.t ?? 0,
    lastNoteT: notes[notes.length - 1]?.t ?? 0,
    pitchMin: pitches.min,
    pitchMax: pitches.max,
    pitchRange: pitches.range,
    velocityMin: Math.min(...velocities),
    velocityMax: Math.max(...velocities),
    gapMin: gaps.length ? Math.min(...gaps) : null,
    gapMedian: median(gaps),
    gapMean: mean(gaps),
    gapMax: gaps.length ? Math.max(...gaps) : null,
    denseClusterCount: gaps.filter((gap) => gap < DENSE_CASCADE).length,
  };
}

function clusterKind(gap: number | null): MarbleClusterKind {
  if (gap === null) return "single";
  if (gap < DENSE_RATTLE) return "rattle";
  if (gap < DENSE_CASCADE) return "cascade";
  return "single";
}

function pathKind(gap: number): MarblePathKind {
  if (gap < DENSE_RATTLE) return "rattle";
  if (gap < DENSE_CASCADE) return "cascade";
  return "arc";
}

function isBallisticPath(kind: MarblePathKind): boolean {
  return kind === "arc" || kind === "rattle" || kind === "cascade";
}

function pathEasing(kind: MarblePathKind): MarblePathSegment["easing"] {
  if (isBallisticPath(kind) || kind === "drop") return "ballistic";
  if (kind === "rail") return "linear";
  if (kind === "settle" || kind === "hold") return "easeOut";
  return "linear";
}

function easingProgress(segment: MarblePathSegment, raw: number): number {
  const u = clamp(raw, 0, 1);
  if (segment.easing === "smoothstep") return u * u * (3 - 2 * u);
  if (segment.easing === "easeIn") return u * u;
  if (segment.easing === "easeOut") return 1 - (1 - u) * (1 - u);
  return u;
}

function cubicBezier(p0: Vec3, c0: Vec3, c1: Vec3, p1: Vec3, u: number): Vec3 {
  const inv = 1 - u;
  return [
    inv ** 3 * p0[0] + 3 * inv * inv * u * c0[0] + 3 * inv * u * u * c1[0] + u ** 3 * p1[0],
    inv ** 3 * p0[1] + 3 * inv * inv * u * c0[1] + 3 * inv * u * u * c1[1] + u ** 3 * p1[1],
    inv ** 3 * p0[2] + 3 * inv * inv * u * c0[2] + 3 * inv * u * u * c1[2] + u ** 3 * p1[2],
  ];
}

function segmentPoint(segment: MarblePathSegment, raw: number): Vec3 {
  const u = easingProgress(segment, raw);
  if (segment.kind === "hold") return segment.from;
  if (segment.kind === "drop") {
    const duration = Math.max(EPS, segment.t1 - segment.t0);
    const elapsed = clamp(raw, 0, 1) * duration;
    const gravity = segment.gravityScale ?? MARBLE_GRAVITY;
    const velocityY = (segment.to[1] - segment.from[1] + 0.5 * gravity * duration * duration) / duration;
    const point = vecMix(segment.from, segment.to, raw);
    point[1] = segment.from[1] + velocityY * elapsed - 0.5 * gravity * elapsed * elapsed;
    return point;
  }
  if (isBallisticPath(segment.kind)) {
    const point = vecMix(segment.from, segment.to, raw);
    point[1] += 4 * (segment.arcHeight ?? 0) * raw * (1 - raw);
    return point;
  }
  const c0 = segment.control ?? vecMix(segment.from, segment.to, 1 / 3);
  const c1 = segment.control2 ?? vecMix(segment.from, segment.to, 2 / 3);
  return cubicBezier(segment.from, c0, c1, segment.to, u);
}

function buildArcSamples(segment: MarblePathSegment): { samples: number[]; length: number } {
  const samples = [0];
  let total = 0;
  let previous = segmentPoint(segment, 0);
  for (let index = 1; index <= ARC_SAMPLE_COUNT; index += 1) {
    const point = segmentPoint(segment, index / ARC_SAMPLE_COUNT);
    total += vecDistance(previous, point);
    samples.push(round(total));
    previous = point;
  }
  return { samples, length: round(total) };
}

function sampleArcDistance(segment: MarblePathSegment, raw: number): number {
  const samples = segment.arcSamples;
  if (!samples?.length) return (segment.arcLength ?? vecDistance(segment.from, segment.to)) * clamp(raw, 0, 1);
  const scaled = clamp(raw, 0, 1) * (samples.length - 1);
  const index = Math.floor(scaled);
  const next = Math.min(samples.length - 1, index + 1);
  const mix = scaled - index;
  return samples[index]! + (samples[next]! - samples[index]!) * mix;
}

function tangentAt(segment: MarblePathSegment, raw: number): Vec3 {
  const before = segmentPoint(segment, clamp(raw - 0.0025, 0, 1));
  const after = segmentPoint(segment, clamp(raw + 0.0025, 0, 1));
  const fallback = segment.tangentOut ?? vecNormalize(vecSub(segment.to, segment.from), [1, 0, 0]);
  return vecNormalize(vecSub(after, before), fallback);
}

function bankForSegment(segment: MarblePathSegment): number {
  if (segment.kind === "hold" || segment.kind === "settle") return 0;
  const tangentIn = segment.tangentIn ?? vecNormalize(vecSub(segment.to, segment.from), [1, 0, 0]);
  const tangentOut = segment.tangentOut ?? tangentIn;
  const turn = Math.acos(clamp(vecDot(vecNormalize(tangentIn), vecNormalize(tangentOut)), -1, 1));
  const radius = Math.max(0.55, (segment.arcLength ?? vecDistance(segment.from, segment.to)) / Math.max(turn, 0.08));
  const duration = Math.max(EPS, segment.t1 - segment.t0);
  const speed = (segment.arcLength ?? vecDistance(segment.from, segment.to)) / duration;
  return round(clamp(Math.atan((speed * speed) / (radius * 9.8)) * 0.42, -0.314, 0.314), 6);
}

function enrichSegment(segment: MarblePathSegment): MarblePathSegment {
  const direction = vecNormalize(vecSub(segment.to, segment.from), [1, 0, 0]);
  const normal = segment.contactNormal ?? [0, 0, 1];
  const tangentOut = segment.tangentOut ?? direction;
  const tangentIn = segment.tangentIn ?? direction;
  const distance = vecDistance(segment.from, segment.to);
  const tension = clamp(distance * (segment.kind === "arc" ? 0.42 : 0.3), 0.08, segment.kind === "arc" ? 1.4 : 0.8);
  const enriched: MarblePathSegment = {
    ...segment,
    from: vecRound(segment.from, 6),
    to: vecRound(segment.to, 6),
    contactNormal: vecRound(vecNormalize(normal, [0, 0, 1]), 6),
    tangentIn: vecRound(vecNormalize(tangentIn, direction), 6),
    tangentOut: vecRound(vecNormalize(tangentOut, direction), 6),
  };
  if (segment.contactNormalStart) enriched.contactNormalStart = vecRound(vecNormalize(segment.contactNormalStart, [0, 0, 1]), 6);
  if (segment.kind !== "hold" && segment.kind !== "settle") {
    enriched.control ??= vecRound(vecAdd(segment.from, vecScale(enriched.tangentOut!, tension)), 6);
    enriched.control2 ??= vecRound(vecSub(segment.to, vecScale(enriched.tangentIn!, tension)), 6);
  }
  if (isBallisticPath(segment.kind)) {
    const duration = Math.max(EPS, segment.t1 - segment.t0);
    enriched.gravityScale ??= MARBLE_GRAVITY;
    enriched.arcHeight ??= round((enriched.gravityScale * duration * duration) / 8);
  }
  if (segment.kind !== "hold") {
    const arc = buildArcSamples(enriched);
    enriched.arcSamples = arc.samples;
    enriched.arcLength = arc.length;
    enriched.bank ??= bankForSegment(enriched);
    enriched.railRadius ??= round(Math.max(0.55, arc.length / Math.max(0.08, Math.abs(enriched.bank ?? 0.08))));
  } else {
    enriched.arcLength = 0;
    enriched.arcSamples = [0, 0];
    enriched.bank = 0;
  }
  return enriched;
}

function targetKind(kind: MarbleClusterKind, noteIndex: number): MarbleTarget["kind"] {
  if (kind === "rattle") return "peg";
  if (kind === "cascade") return "chime";
  if (kind === "roll") return noteIndex % 3 === 0 ? "resonator" : "plate";
  return noteIndex % 5 === 4 ? "resonator" : "plate";
}

function targetSurfaceNormal(rotation: number): Vec3 {
  return [-Math.sin(rotation), Math.cos(rotation), 0];
}

interface TargetFootprint {
  center: Vec3;
  tangent: Vec3;
  normal: Vec3;
  halfLength: number;
  halfThickness: number;
}

function targetHalfThickness(kind: MarbleTarget["kind"], size: Vec3): number {
  return kind === "peg" || kind === "chime" ? size[1] * 0.9 : size[1] / 2;
}

function targetFootprint(target: MarbleTarget): TargetFootprint {
  const rotation = target.rotation[2];
  return {
    center: target.pos,
    tangent: [Math.cos(rotation), Math.sin(rotation), 0],
    normal: targetSurfaceNormal(rotation),
    halfLength: target.size[0] / 2,
    halfThickness: targetHalfThickness(target.kind, target.size),
  };
}

function footprintProjectionRadius(footprint: TargetFootprint, axis: Vec3): number {
  return footprint.halfLength * Math.abs(vecDot(footprint.tangent, axis))
    + footprint.halfThickness * Math.abs(vecDot(footprint.normal, axis));
}

export function marbleTargetsOverlap(a: MarbleTarget, b: MarbleTarget, padding = 0.055): boolean {
  const left = targetFootprint(a);
  const right = targetFootprint(b);
  const delta = vecSub(right.center, left.center);
  for (const axis of [left.tangent, left.normal, right.tangent, right.normal]) {
    const distance = Math.abs(vecDot(delta, axis));
    if (distance >= footprintProjectionRadius(left, axis) + footprintProjectionRadius(right, axis) + padding) return false;
  }
  return true;
}

function placeTarget(
  id: string,
  kind: MarbleTarget["kind"],
  pitch: number,
  pitchClass: number,
  contactPos: Vec3,
  rotation: number,
  size: Vec3,
  material: MarbleTarget["material"],
): MarbleTarget {
  const normal = targetSurfaceNormal(rotation);
  const surfaceOffset = MARBLE_RADIUS + targetHalfThickness(kind, size) + 0.018;
  return {
    id,
    kind,
    pitch,
    pitchClass,
    pos: vecRound(vecSub(contactPos, vecScale(normal, surfaceOffset)), 4),
    contactPos: vecRound(contactPos, 4),
    rotation: [0, 0, round(rotation, 4)],
    size: vecRound(size, 4),
    color: PITCH_COLORS[pitchClass] ?? "#d8f6ff",
    material,
    familyId: `pitch:${pitch}`,
  };
}

function compileTargets(notes: readonly SongEvent[], metrics: MarbleTrackMetrics): MarbleTarget[] {
  const span = Math.max(1, metrics.pitchRange);
  const positions: Vec3[] = [[0, 5.65, 0]];
  const outgoingVelocities: Vec3[] = [];
  let horizontalSign = -1;

  for (let index = 0; index < notes.length - 1; index += 1) {
    const gap = Math.max(EPS, notes[index + 1]!.t - notes[index]!.t);
    const from = positions[index]!;
    const choices = [horizontalSign, -horizontalSign].map((sign) => {
      const velocityX = sign * MARBLE_HORIZONTAL_SPEED;
      const candidate: Vec3 = [
        from[0] + velocityX * gap,
        from[1] - 0.5 * MARBLE_GRAVITY * gap * gap,
        from[2] + Math.sin((index + 1) * 0.83) * 0.16 * gap,
      ];
      const clearance = positions.slice(0, Math.max(0, positions.length - 1)).reduce((nearest, position) => Math.min(nearest, vecDistance(candidate, position)), Number.POSITIVE_INFINITY);
      return { sign, velocityX, candidate, clearance, inBounds: Math.abs(candidate[0]) <= MARBLE_X_LIMIT };
    });
    const viable = choices.filter((choice) => choice.inBounds).sort((a, b) => b.clearance - a.clearance);
    const chosen = viable[0] ?? choices.sort((a, b) => Math.abs(a.candidate[0]) - Math.abs(b.candidate[0]))[0]!;
    horizontalSign = chosen.sign;
    const velocityX = chosen.velocityX;
    const velocityZ = Math.sin((index + 1) * 0.83) * 0.16;
    const velocity: Vec3 = [velocityX, 0, velocityZ];
    outgoingVelocities.push(velocity);
    positions.push(chosen.candidate);
    if ((index + 1) % 2 === 0) horizontalSign *= -1;
  }

  const targets: MarbleTarget[] = [];
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index]!;
    const pitch = note.pitch ?? metrics.pitchMin;
    const pitchNorm = (pitch - metrics.pitchMin) / span;
    const gap = index > 0 ? note.t - notes[index - 1]!.t : null;
    const kind = clusterKind(gap);
    const incoming = index === 0
      ? [0, -(MARBLE_INITIAL_DROP_SPEED + MARBLE_GRAVITY * Math.max(0, note.t)), 0] as Vec3
      : [
          outgoingVelocities[index - 1]![0],
          -MARBLE_GRAVITY * Math.max(EPS, note.t - notes[index - 1]!.t),
          outgoingVelocities[index - 1]![2],
        ] as Vec3;
    const outgoing = outgoingVelocities[index] ?? [incoming[0] * 0.35, -0.35, incoming[2] * 0.35] as Vec3;
    const impulse = vecNormalize(vecSub(outgoing, incoming), [0, 1, 0]);
    const tangent: Vec3 = [impulse[1], -impulse[0], 0];
    const rotation = Math.atan2(tangent[1], tangent[0]);
    const pitchClass = ((pitch % 12) + 12) % 12;
    const contactPos = positions[index]!;
    const nearestContact = positions.reduce((nearest, position, candidateIndex) => {
      if (candidateIndex === index || Math.abs(candidateIndex - index) > 2) return nearest;
      return Math.min(nearest, vecDistance(contactPos, position));
    }, Number.POSITIVE_INFINITY);
    const compact = nearestContact < 0.72;
    let chosenKind: MarbleTarget["kind"] = compact ? (index % 2 === 0 ? "peg" : "chime") : targetKind(kind, index);
    const material: MarbleTarget["material"] = pitch < 45 ? "brass" : compact ? "rubber" : pitch > 72 ? "glow" : "painted-metal";
    const fullSize: Vec3 = [0.7 + (1 - pitchNorm) * 0.36 + note.vel * 0.18, 0.16 + note.vel * 0.08, 0.38 + pitchNorm * 0.2];
    const compactSize: Vec3 = [0.3, 0.09, 0.22];
    let target: MarbleTarget | undefined;
    const rotationOffsets = [0, 0.16, -0.16, 0.32, -0.32, 0.5, -0.5, 0.72, -0.72];
    const variants: Array<{ kind: MarbleTarget["kind"]; material: MarbleTarget["material"]; size: Vec3; scales: number[] }> = [
      { kind: chosenKind, material, size: chosenKind === "peg" || chosenKind === "chime" ? compactSize : fullSize, scales: [1, 0.84, 0.7, 0.56, 0.44] },
      { kind: index % 2 === 0 ? "peg" : "chime", material: "rubber", size: compactSize, scales: [1, 0.82, 0.66, 0.5, 0.36, 0.24, 0.16] },
    ];
    findCandidate: for (const variant of variants) {
      for (const scale of variant.scales) {
        const size: Vec3 = [variant.size[0] * scale, variant.size[1] * scale, variant.size[2] * scale];
        for (const offset of rotationOffsets) {
          const candidateRotation = rotation + offset;
          const candidateNormal = targetSurfaceNormal(candidateRotation);
          if (vecDot(incoming, candidateNormal) > -0.005 || vecDot(outgoing, candidateNormal) < 0.005) continue;
          const candidate = placeTarget(`target:${index}`, variant.kind, pitch, pitchClass, contactPos, candidateRotation, size, variant.material);
          if (targets.some((previous) => marbleTargetsOverlap(candidate, previous))) continue;
          chosenKind = variant.kind;
          target = candidate;
          break findCandidate;
        }
      }
    }
    target ??= placeTarget(`target:${index}`, chosenKind, pitch, pitchClass, contactPos, rotation, [0.048, 0.024, 0.048], "rubber");
    targets.push(target);
  }
  return targets;
}

function compileClusters(notes: readonly SongEvent[], targets: readonly MarbleTarget[]): MarbleCluster[] {
  const clusters: MarbleCluster[] = [];
  let start = 0;
  while (start < notes.length) {
    let end = start;
    let kind: MarbleClusterKind = "single";
    while (end + 1 < notes.length) {
      const gap = notes[end + 1]!.t - notes[end]!.t;
      const nextKind = clusterKind(gap);
      if (nextKind === "single") break;
      kind = kind === "rattle" || nextKind === "rattle" ? "rattle" : nextKind;
      end += 1;
    }
    const id = `cluster:${clusters.length}`;
    clusters.push({
      id,
      kind,
      noteIndices: Array.from({ length: end - start + 1 }, (_, offset) => start + offset),
      t0: notes[start]!.t,
      t1: notes[end]!.t,
      targetIds: targets.slice(start, end + 1).map((target) => target.id),
    });
    start = end + 1;
  }
  return clusters;
}

function validateTargetLayout(targets: readonly MarbleTarget[]): void {
  for (let left = 0; left < targets.length; left += 1) {
    for (let right = left + 1; right < targets.length; right += 1) {
      const a = targets[left]!;
      const b = targets[right]!;
      const aCompact = a.kind === "peg" || a.kind === "chime";
      const bCompact = b.kind === "peg" || b.kind === "chime";
      if (aCompact && bCompact) continue;
      if (marbleTargetsOverlap(a, b)) throw new Error(`Invalid Marble layout: ${a.id} overlaps ${b.id}`);
    }
  }
}

function clusterIdFor(clusters: readonly MarbleCluster[], noteIndex: number): string | undefined {
  return clusters.find((cluster) => cluster.noteIndices.includes(noteIndex) && cluster.kind !== "single")?.id;
}

function compileImpacts(notes: readonly SongEvent[], targets: readonly MarbleTarget[], clusters: readonly MarbleCluster[]): MarbleImpact[] {
  return notes.map((note, index) => {
    const impact: MarbleImpact = {
      id: `impact:${index}`,
      noteIndex: index,
      t: note.t,
      pitch: note.pitch ?? 60,
      velocity: note.vel,
      duration: note.dur,
      targetId: targets[index]!.id,
    };
    const clusterId = clusterIdFor(clusters, index);
    if (clusterId) impact.clusterId = clusterId;
    return impact;
  });
}

function compilePath(song: Song, notes: readonly SongEvent[], targets: readonly MarbleTarget[], clusters: readonly MarbleCluster[], diagnostics: MarbleDiagnostics): MarblePathSegment[] {
  const path: MarblePathSegment[] = [];
  if (!targets.length) return path;
  const first = targets[0]!;
  const firstNote = notes[0]!;
  if (firstNote.t > EPS) {
    const dropHeight = MARBLE_INITIAL_DROP_SPEED * firstNote.t + 0.5 * MARBLE_GRAVITY * firstNote.t * firstNote.t;
    path.push(enrichSegment({
      id: `path:${path.length}`,
      t0: 0,
      t1: Number(firstNote.t.toFixed(6)),
      from: [first.contactPos[0], Number((first.contactPos[1] + dropHeight).toFixed(4)), Number((first.contactPos[2] + 0.18).toFixed(4))],
      to: first.contactPos,
      kind: "drop",
      easing: pathEasing("drop"),
      gravityScale: MARBLE_GRAVITY,
      contactNormalStart: [0, 0, 1],
      contactNormal: targetSurfaceNormal(first.rotation[2]),
      tangentIn: [0, -1, 0],
      tangentOut: [0, -1, 0],
      targetId: first.id,
    }));
  }
  for (let index = 0; index < targets.length - 1; index += 1) {
    const from = targets[index]!;
    const to = targets[index + 1]!;
    const currentNote = notes[index]!;
    const nextNote = notes[index + 1]!;
    const gap = nextNote.t - currentNote.t;
    if (gap <= EPS) {
      diagnostics.impossibleGaps.push({ noteIndex: index + 1, gap, resolution: "shared local rattle target with no travel segment" });
      continue;
    }
    const kind = pathKind(gap);
    if (kind === "rattle" || kind === "cascade") {
      diagnostics.impossibleGaps.push({ noteIndex: index + 1, gap, resolution: `${kind} local mechanism` });
    }
    const direction = vecNormalize(vecSub(to.contactPos, from.contactPos), [1, 0, 0]);
    const startVelocity: Vec3 = [
      (to.contactPos[0] - from.contactPos[0]) / gap,
      (to.contactPos[1] - from.contactPos[1] + 0.5 * MARBLE_GRAVITY * gap * gap) / gap,
      (to.contactPos[2] - from.contactPos[2]) / gap,
    ];
    const endVelocity: Vec3 = [startVelocity[0], startVelocity[1] - MARBLE_GRAVITY * gap, startVelocity[2]];
    const segment: MarblePathSegment = {
      id: `path:${path.length}`,
      t0: Number(currentNote.t.toFixed(6)),
      t1: Number(nextNote.t.toFixed(6)),
      from: from.contactPos,
      to: to.contactPos,
      kind,
      easing: pathEasing(kind),
      contactNormalStart: targetSurfaceNormal(from.rotation[2]),
      contactNormal: targetSurfaceNormal(to.rotation[2]),
      tangentOut: vecNormalize(startVelocity, direction),
      tangentIn: vecNormalize(endVelocity, direction),
      restitution: kind === "arc" ? 0.48 : kind === "rail" ? 0.28 : 0.18,
      targetId: to.id,
    };
    const clusterId = clusterIdFor(clusters, index + 1);
    if (clusterId) segment.clusterId = clusterId;
    path.push(enrichSegment(segment));
  }
  const last = targets[targets.length - 1]!;
  const lastNote = notes[notes.length - 1]!;
  const endT = Math.max(song.meta.durationSec, lastNote.t + 0.001);
  if (endT > lastNote.t + EPS) {
    const settleDrop = clamp((endT - lastNote.t) * 0.7, 0.35, 1.5);
    path.push(enrichSegment({
      id: `path:${path.length}`,
      t0: Number(lastNote.t.toFixed(6)),
      t1: Number(endT.toFixed(6)),
      from: last.contactPos,
      to: [Number((last.contactPos[0] + 0.28).toFixed(4)), Number((last.contactPos[1] - settleDrop).toFixed(4)), last.contactPos[2]],
      kind: "settle",
      easing: pathEasing("settle"),
      contactNormal: [0, 0, 1],
      targetId: last.id,
    }));
  }
  if (path.length === 0) {
    path.push(enrichSegment({
      id: "path:0",
      t0: 0,
      t1: song.meta.durationSec,
      from: last.contactPos,
      to: [last.contactPos[0], Number((last.contactPos[1] - 0.2).toFixed(4)), last.contactPos[2]],
      kind: "hold",
      easing: "easeOut",
      contactNormal: [0, 0, 1],
      targetId: last.id,
    }));
  }
  return path;
}

function compileCamera(song: Song, targets: readonly MarbleTarget[], impacts: readonly MarbleImpact[], clusters: readonly MarbleCluster[]): CameraKeyframe[] {
  if (!targets.length || !impacts.length) {
    return [
      { t: 0, pos: [0, 0, 14], zoom: 0.98, anchor: [0.5, 0.5], ease: "smoothstep" },
      { t: song.meta.durationSec, pos: [0, 0, 14], zoom: 0.98, anchor: [0.5, 0.5], ease: "smoothstep" },
    ];
  }

  const camera: CameraKeyframe[] = [];
  const addKey = (t: number, target: MarbleTarget, zoom = 1.08): void => {
    const pos: [number, number, number] = [
      Number((target.pos[0] * 0.28).toFixed(4)),
      Number((target.pos[1] * 0.18).toFixed(4)),
      Number((12.7 / zoom).toFixed(4)),
    ];
    const last = camera[camera.length - 1];
    if (last && Math.abs(last.t - t) < 0.08) {
      last.pos = pos;
      last.zoom = Math.max(last.zoom, zoom);
      return;
    }
    camera.push({ t: Number(clamp(t, 0, song.meta.durationSec).toFixed(4)), pos, zoom, anchor: [0.5, 0.52], ease: "smoothstep" });
  };

  const firstTarget = targets[0]!;
  const lastTarget = targets[targets.length - 1]!;
  addKey(Math.max(0, impacts[0]!.t - 0.35), firstTarget, 1.05);

  for (const cluster of clusters.filter((entry) => entry.kind !== "single")) {
    const impact = impacts[cluster.noteIndices[0] ?? 0];
    const target = impact ? targets[impact.noteIndex] : undefined;
    if (target) addKey(cluster.t0, target, cluster.kind === "rattle" ? 1.22 : 1.16);
  }

  for (let index = 3; index < impacts.length; index += 4) {
    addKey(Math.max(0, impacts[index]!.t - 0.08), targets[impacts[index]!.noteIndex]!, 1.08);
  }

  addKey(impacts[impacts.length - 1]!.t, lastTarget, 1.12);
  camera.push({
    t: Number(song.meta.durationSec.toFixed(4)),
    pos: [Number((lastTarget.pos[0] * 0.18).toFixed(4)), Number((lastTarget.pos[1] * 0.12).toFixed(4)), 14.4],
    zoom: 0.94,
    anchor: [0.5, 0.5],
    ease: "smoothstep",
  });
  return camera.sort((a, b) => a.t - b.t);
}

function compileTail(song: Song, impacts: readonly MarbleImpact[]): { audioEndT: number; finalNoteT: number; hasAudibleTail: boolean; resonanceTargets: string[] } {
  const final = impacts[impacts.length - 1];
  const finalNoteT = final?.t ?? 0;
  return {
    audioEndT: song.meta.durationSec,
    finalNoteT,
    hasAudibleTail: song.meta.durationSec > finalNoteT + 0.25,
    resonanceTargets: final ? [final.targetId] : [],
  };
}

function compileEvents(impacts: readonly MarbleImpact[], clusters: readonly MarbleCluster[], tail: ReturnType<typeof compileTail>): PerformanceEvent[] {
  const events: PerformanceEvent[] = [];
  for (const impact of impacts) {
    events.push({
      t: impact.t,
      type: "marble.impact",
      layer: "marble",
      params: { hitT: impact.t, targetId: impact.targetId, noteIndex: impact.noteIndex, pitch: impact.pitch, velocity: impact.velocity, clusterId: impact.clusterId ?? null },
    });
  }
  for (const cluster of clusters.filter((entry) => entry.kind !== "single")) {
    events.push({ t: cluster.t0, tEnd: cluster.t1, type: "marble.cluster", layer: "marble", params: { clusterId: cluster.id, kind: cluster.kind, targetIds: cluster.targetIds } });
  }
  if (tail.hasAudibleTail) {
    events.push({ t: tail.finalNoteT, tEnd: tail.audioEndT, type: "marble.tail", layer: "marble", params: { targetIds: tail.resonanceTargets } });
  }
  return events.sort((a, b) => a.t - b.t || a.type.localeCompare(b.type));
}

function validateMarble(notes: readonly SongEvent[], impacts: readonly MarbleImpact[], path: readonly MarblePathSegment[], diagnostics: MarbleDiagnostics): void {
  diagnostics.droppedNotes = Math.max(0, notes.length - impacts.length);
  diagnostics.timingMismatches = impacts.filter((impact) => Math.abs(impact.t - (notes[impact.noteIndex]?.t ?? Number.NaN)) > EPS).length;
  diagnostics.teleportSegments = path.filter((segment) => {
    const dt = Math.max(EPS, segment.t1 - segment.t0);
    const distance = Math.hypot(segment.to[0] - segment.from[0], segment.to[1] - segment.from[1], segment.to[2] - segment.from[2]);
    return distance / dt > 38 && segment.kind !== "rattle" && segment.kind !== "cascade";
  }).length;
  if (diagnostics.droppedNotes || diagnostics.timingMismatches) {
    throw new Error(`Invalid Marble performance: ${diagnostics.droppedNotes} dropped notes, ${diagnostics.timingMismatches} timing mismatches`);
  }
}

export function sampleMarblePose(path: readonly MarblePathSegment[], t: number): MarblePose {
  if (!path.length) {
    return {
      pos: [0, 0, 0],
      quat: [0, 0, 0, 1],
      tangent: [1, 0, 0],
      normal: [0, 0, 1],
      speed: 0,
      spin: 0,
      contact: false,
      segmentId: "none",
      kind: "hold",
      progress: 0,
    };
  }
  const foundIndex = path.findIndex((entry) => t >= entry.t0 && t <= entry.t1);
  const segmentIndex = foundIndex >= 0 ? foundIndex : (t < path[0]!.t0 ? 0 : path.length - 1);
  const segment = path[segmentIndex]!;
  const duration = Math.max(EPS, segment.t1 - segment.t0);
  const raw = clamp((t - segment.t0) / duration, 0, 1);
  const progress = easingProgress(segment, raw);
  const pos = vecRound(segmentPoint(segment, raw), 6);
  const tangent = vecRound(tangentAt(segment, raw), 6);
  const contactNormal = raw < 0.018
    ? segment.contactNormalStart ?? segment.contactNormal
    : raw > 0.982
      ? segment.contactNormal
      : [0, 0, 1] as Vec3;
  const normal = vecRound(vecNormalize(contactNormal ?? [0, 0, 1], [0, 0, 1]), 6);
  const speedWindow = 0.004;
  const speedStart = clamp(raw - speedWindow, 0, 1);
  const speedEnd = clamp(raw + speedWindow, 0, 1);
  const speed = round((sampleArcDistance(segment, speedEnd) - sampleArcDistance(segment, speedStart)) / Math.max(EPS, (speedEnd - speedStart) * duration));
  const distance = sampleArcDistance(segment, raw);
  const priorDistance = path.slice(0, segmentIndex).reduce((sum, entry) => sum + (entry.arcLength ?? 0), 0);
  const spin = round((priorDistance + distance) / MARBLE_RADIUS);
  const spinAxis = vecNormalize(vecCross(normal, tangent), [0, 1, 0]);
  const qRoll = quatFromAxisAngle(spinAxis, spin);
  const qBank = quatFromAxisAngle(tangent, segment.bank ?? 0);
  const quat = quatNormalize(quatMultiply(qBank, qRoll)).map((value) => round(value)) as Quat;
  const contact = segment.kind === "hold" || raw < 0.018 || raw > 0.982;
  return { pos, quat, tangent, normal, speed, spin, contact, segmentId: segment.id, kind: segment.kind, progress: round(progress) };
}

export function sampleMarblePath(path: readonly MarblePathSegment[], t: number): MarblePose {
  return sampleMarblePose(path, t);
}

export function compileMarble(song: Song, options: CompileMarbleOptions = {}): MarblePerformance {
  const selected = selectTrack(song, options);
  const metrics = compileMetrics(selected.notes);
  const targets = compileTargets(selected.notes, metrics);
  validateTargetLayout(targets);
  const clusters = compileClusters(selected.notes, targets);
  const impacts = compileImpacts(selected.notes, targets, clusters);
  const diagnostics: MarbleDiagnostics = {
    droppedNotes: 0,
    timingMismatches: 0,
    teleportSegments: 0,
    impossibleGaps: [],
    compileLog: [
      `source: ${selected.track.name}`,
      `selection: ${selected.reason}`,
      `notes: ${selected.notes.length}`,
      `pitch: ${metrics.pitchMin}-${metrics.pitchMax}`,
      "motion: continuous impact-to-impact trajectories",
      `physics: gravity ${MARBLE_GRAVITY}, horizontal launch speed ${MARBLE_HORIZONTAL_SPEED}`,
      "collision: radius-offset contact poses and non-overlapping target footprints",
    ],
  };
  const path = compilePath(song, selected.notes, targets, clusters, diagnostics);
  validateMarble(selected.notes, impacts, path, diagnostics);
  const tail = compileTail(song, impacts);
  const palette = solvePalette(null, [selected.track.role, "keys", "fx"]);
  const performance: MarblePerformance = {
    schemaVersion: 1,
    concept: "marble",
    seed: `${song.meta.seed}:marble:${selected.track.id}`,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: W, h: H },
    palette,
    camera: compileCamera(song, targets, impacts, clusters),
    curves: { energy: song.master.energy },
    events: compileEvents(impacts, clusters, tail),
    statics: {
      compilerVersion: 5,
      source: {
        trackId: selected.track.id,
        trackName: selected.track.name,
        role: selected.track.role,
        selectionMode: selected.mode,
        noteCount: selected.notes.length,
        selectionReason: selected.reason,
      },
      metrics,
      targets,
      impacts,
      path,
      clusters,
      tail,
      diagnostics,
    },
  };
  parsePerformance(performance);
  return performance;
}
