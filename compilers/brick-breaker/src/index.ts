import type { Song, SongEvent, SongTrack } from "@reaper-viz/core";
import type { BrickBreakerCompileOptions, BrickBreakerPlan, BrickBreakerResolvedOptions, BrickHitGroup, BrickHitNote } from "./types.js";
import type { BrickBreakerBallSegment, BrickBreakerBrick, BrickBreakerPerformance } from "./types.js";
import { brickAdd, brickDot, brickLength, brickNormalize, brickReflect, brickScale, brickSub, type BrickVec2 } from "./physics.js";

export * from "./types.js";
export * from "./physics.js";

const DEFAULT_CHORD_EPSILON_SEC = 0.025;
const DEFAULT_BOARD = { width: 12, height: 18 } as const;

interface SelectedTrack {
  track: SongTrack;
  notes: SongEvent[];
  reason: string;
}

function noteEvents(track: SongTrack): SongEvent[] {
  return track.events
    .filter((event) => event.kind === "note" && event.pitch !== null)
    .map((event) => ({ ...event }))
    .sort((a, b) => a.t - b.t
      || (a.pitch ?? 0) - (b.pitch ?? 0)
      || a.vel - b.vel
      || a.dur - b.dur);
}

function trackScore(track: SongTrack, notes: readonly SongEvent[], durationSec: number): number {
  if (!notes.length) return Number.NEGATIVE_INFINITY;
  const coverage = notes.length > 1 ? (notes.at(-1)!.t - notes[0]!.t) / Math.max(0.001, durationSec) : 0;
  const pitches = notes.map((note) => note.pitch!);
  const range = Math.max(...pitches) - Math.min(...pitches);
  const role = /lead|melody|keys|piano|synth|bass/i.test(track.role) ? 1 : 0;
  return notes.length * 4 + coverage * 12 + Math.min(24, range) * 0.25 + role * 6;
}

function selectTrack(song: Song, sourceTrackId?: string): SelectedTrack {
  if (sourceTrackId) {
    const track = song.tracks.find((candidate) => candidate.id === sourceTrackId);
    if (!track) throw new Error(`Brick Breaker source track not found: ${sourceTrackId}`);
    const notes = noteEvents(track);
    if (!notes.length) throw new Error(`Brick Breaker source track has no MIDI notes: ${track.name}`);
    return { track, notes, reason: `manual track override: ${track.name}` };
  }
  const candidates = song.tracks
    .map((track) => ({ track, notes: noteEvents(track) }))
    .filter((entry) => entry.notes.length)
    .map((entry) => ({ ...entry, score: trackScore(entry.track, entry.notes, song.meta.durationSec) }))
    .sort((a, b) => b.score - a.score
      || b.notes.length - a.notes.length
      || a.track.name.localeCompare(b.track.name)
      || a.track.id.localeCompare(b.track.id));
  const selected = candidates[0];
  if (!selected) throw new Error("Brick Breaker requires at least one note-bearing track");
  return { track: selected.track, notes: selected.notes, reason: `auto score ${selected.score.toFixed(3)}: ${selected.track.name}` };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function groupId(index: number, t: number, notes: readonly BrickHitNote[]): string {
  const signature = notes.map((note) => `${note.pitch}:${note.velocity.toFixed(4)}:${note.duration.toFixed(4)}`).join("+");
  return `brick-hit:${index}:${t.toFixed(6)}:${signature}`;
}

export function groupBrickHitDeadlines(track: SongTrack, notes: readonly SongEvent[], chordEpsilonSec: number): BrickHitGroup[] {
  const groups: BrickHitGroup[] = [];
  for (const event of notes) {
    const pitch = event.pitch;
    if (pitch === null || event.kind !== "note") continue;
    const current = groups.at(-1);
    if (!current || event.t - current.t > chordEpsilonSec + 1e-9) {
      groups.push({ id: "", t: event.t, notes: [], representativePitch: pitch, energy: event.vel });
    }
    groups.at(-1)!.notes.push({ trackId: track.id, pitch, velocity: event.vel, duration: event.dur });
  }
  return groups.map((group, index) => {
    const orderedNotes = [...group.notes].sort((a, b) => a.pitch - b.pitch || a.velocity - b.velocity || a.duration - b.duration);
    return {
      ...group,
      id: groupId(index, group.t, orderedNotes),
      notes: orderedNotes,
      representativePitch: median(orderedNotes.map((note) => note.pitch)),
      energy: Math.max(...orderedNotes.map((note) => note.velocity)),
    };
  });
}

function gapHistogram(groups: readonly BrickHitGroup[]): Record<"dense" | "short" | "medium" | "long", number> {
  const result = { dense: 0, short: 0, medium: 0, long: 0 };
  for (let index = 1; index < groups.length; index += 1) {
    const gap = groups[index]!.t - groups[index - 1]!.t;
    if (gap < 0.12) result.dense += 1;
    else if (gap < 0.35) result.short += 1;
    else if (gap < 1) result.medium += 1;
    else result.long += 1;
  }
  return result;
}

export function compileBrickBreakerPlan(song: Song, options: BrickBreakerCompileOptions = {}): BrickBreakerPlan {
  const resolved: BrickBreakerResolvedOptions = {
    chordEpsilonSec: options.chordEpsilonSec ?? DEFAULT_CHORD_EPSILON_SEC,
    seed: options.seed ?? `${song.meta.seed}:brick-breaker`,
    board: { ...(options.board ?? DEFAULT_BOARD) },
  };
  if (!(resolved.chordEpsilonSec >= 0 && resolved.chordEpsilonSec <= 0.1)) throw new RangeError("Brick Breaker chord epsilon must be between 0 and 0.1 seconds");
  if (!(resolved.board.width > 0 && resolved.board.height > 0)) throw new RangeError("Brick Breaker board dimensions must be positive");
  const selected = selectTrack(song, options.sourceTrackId);
  const groups = groupBrickHitDeadlines(selected.track, selected.notes, resolved.chordEpsilonSec);
  const gaps = groups.slice(1).map((group, index) => group.t - groups[index]!.t);
  const chordCellCount = groups.reduce((sum, group) => sum + group.notes.length, 0);
  return {
    schemaVersion: 1,
    concept: "brick-breaker-plan",
    durationSec: song.meta.durationSec,
    options: resolved,
    hitGroups: groups,
    report: {
      sourceTrackId: selected.track.id,
      sourceTrackName: selected.track.name,
      selectionReason: selected.reason,
      sourceNoteCount: selected.notes.length,
      groupedHitCount: groups.length,
      generatedBrickCount: groups.length,
      compoundGroupCount: groups.filter((group) => group.notes.length > 1).length,
      chordCellCount,
      firstHitSec: groups[0]!.t,
      finalHitSec: groups.at(-1)!.t,
      minimumGapSec: gaps.length ? Math.min(...gaps) : null,
      gapHistogram: gapHistogram(groups),
      warnings: [],
    },
  };
}

const BRICK_COLORS = ["#55d6ff", "#ffd166", "#9da8ff", "#ff7d9b", "#76e6a5", "#f5a65b"];
const PREVIEW_BALL_SPEED = 7.2;

export function sampleBrickBreakerBall(segments: readonly BrickBreakerBallSegment[], t: number): BrickVec2 {
  const segment = segments.find((candidate) => t <= candidate.t1 + 1e-9) ?? segments.at(-1);
  if (!segment) return [0, 0];
  if (segment.t1 - segment.t0 <= 1e-9) return [...segment.to];
  const raw = (t - segment.t0) / Math.max(1e-9, segment.t1 - segment.t0);
  const progress = Math.max(0, Math.min(1, raw));
  return [
    segment.from[0] + (segment.to[0] - segment.from[0]) * progress,
    segment.from[1] + (segment.to[1] - segment.from[1]) * progress,
  ];
}

interface TracedPath {
  segments: BrickBreakerBallSegment[];
  position: BrickVec2;
  velocity: BrickVec2;
  paddleContacts: Array<{ t: number; x: number }>;
}

function traceBoardPath(
  from: BrickVec2,
  initialVelocity: BrickVec2,
  t0: number,
  t1: number,
  board: { width: number; height: number },
  firstKind: BrickBreakerBallSegment["kind"],
): TracedPath {
  const inset = 0.36;
  const minX = -board.width / 2 + inset;
  const maxX = board.width / 2 - inset;
  const minY = -board.height / 2 + inset + 0.72;
  const maxY = board.height / 2 - inset;
  const segments: BrickBreakerBallSegment[] = [];
  const paddleContacts: Array<{ t: number; x: number }> = [];
  let position: BrickVec2 = [...from];
  let velocity: BrickVec2 = [...initialVelocity];
  let time = t0;
  for (let bounce = 0; time < t1 - 1e-9 && bounce < 24; bounce += 1) {
    const remaining = t1 - time;
    const tx = velocity[0] > 1e-9 ? (maxX - position[0]) / velocity[0] : velocity[0] < -1e-9 ? (minX - position[0]) / velocity[0] : Number.POSITIVE_INFINITY;
    const ty = velocity[1] > 1e-9 ? (maxY - position[1]) / velocity[1] : velocity[1] < -1e-9 ? (minY - position[1]) / velocity[1] : Number.POSITIVE_INFINITY;
    const collisionDt = Math.min(tx > 1e-9 ? tx : Number.POSITIVE_INFINITY, ty > 1e-9 ? ty : Number.POSITIVE_INFINITY);
    const duration = Math.min(remaining, collisionDt);
    const next = brickAdd(position, brickScale(velocity, duration));
    const reachesSupport = collisionDt <= remaining + 1e-9;
    const hitsVertical = tx <= ty;
    const supportNormal: BrickVec2 | undefined = reachesSupport
      ? hitsVertical ? [velocity[0] > 0 ? -1 : 1, 0] : [0, velocity[1] > 0 ? -1 : 1]
      : undefined;
    const kind: BrickBreakerBallSegment["kind"] = reachesSupport
      ? (!hitsVertical && velocity[1] < 0 ? "paddle" : "wall")
      : segments.length === 0 ? firstKind : "travel";
    segments.push({ id: "", kind, t0: time, t1: time + duration, from: position, to: next, velocity: [...velocity], ...(supportNormal ? { supportNormal } : {}) });
    position = next;
    time += duration;
    if (!reachesSupport || !supportNormal) break;
    if (kind === "paddle") paddleContacts.push({ t: time, x: position[0] });
    velocity = brickReflect(velocity, supportNormal);
  }
  return { segments, position, velocity, paddleContacts };
}

function desiredOutgoing(index: number, incoming: BrickVec2, speed: number): BrickVec2 {
  const headings: BrickVec2[] = [[0.82, 0.57], [-0.72, 0.69], [0.58, -0.82], [-0.8, -0.6], [0.42, 0.91], [-0.9, 0.44]];
  let candidate = brickScale(brickNormalize(headings[index % headings.length]!), speed);
  if (brickDot(brickNormalize(candidate), brickNormalize(incoming)) > 0.82) candidate = [-candidate[0], candidate[1]];
  return candidate;
}

export function compileBrickBreaker(song: Song, options: BrickBreakerCompileOptions = {}): BrickBreakerPerformance {
  const plan = compileBrickBreakerPlan(song, options);
  const bricks: BrickBreakerBrick[] = [];
  const segments: BrickBreakerBallSegment[] = [];
  const paddleContacts: Array<{ t: number; x: number }> = [];
  let from: BrickVec2 = [0, -plan.options.board.height * 0.36];
  let t0 = 0;
  let velocity: BrickVec2 = brickScale(brickNormalize([0.46, 0.89]), PREVIEW_BALL_SPEED);
  let incoming: BrickVec2 = [...velocity];
  for (let index = 0; index < plan.hitGroups.length; index += 1) {
    const group = plan.hitGroups[index]!;
    const traced = traceBoardPath(from, velocity, t0, group.t, plan.options.board, index === 0 ? "launch" : "travel");
    traced.segments.forEach((segment) => { segment.id = `ball:${segments.length}`; segments.push(segment); });
    paddleContacts.push(...traced.paddleContacts);
    from = traced.position;
    incoming = traced.velocity;
    const outgoing = desiredOutgoing(index, incoming, PREVIEW_BALL_SPEED);
    const normal = brickNormalize(brickSub(outgoing, incoming), [0, 1]);
    const brick: BrickBreakerBrick = {
      id: `brick:${index}`,
      hitGroupId: group.id,
      destructionT: group.t,
      position: [...from],
      size: [1.55, 0.62],
      rotation: Math.atan2(normal[1], normal[0]) - Math.PI / 2,
      color: BRICK_COLORS[((Math.round(group.representativePitch) % BRICK_COLORS.length) + BRICK_COLORS.length) % BRICK_COLORS.length]!,
      cells: group.notes.length,
      energy: group.energy,
    };
    bricks.push(brick);
    const contactSegment = segments.at(-1);
    if (contactSegment) contactSegment.contactBrickId = brick.id;
    velocity = brickReflect(incoming, normal);
    if (brickLength(brickSub(velocity, outgoing)) > 1e-6) throw new Error(`Brick reflection solve failed at ${brick.id}`);
    t0 = group.t;
  }
  const finalBrickId = bricks.at(-1)!.id;
  return {
    schemaVersion: 1,
    concept: "brick-breaker",
    seed: plan.options.seed,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: 1080, h: 1920 },
    palette: { bg: "#07111d", roles: { ball: "#f7fdff", wall: "#36516a", paddle: "#79e6ff" } },
    camera: [{ t: 0, pos: [0, 0, 12], zoom: 1 }],
    curves: { energy: song.master.energy },
    events: bricks.map((brick) => ({ t: brick.destructionT, type: "brick.break", layer: "bricks", params: { brickId: brick.id } })),
    statics: {
      sourceTrackId: plan.report.sourceTrackId,
      report: plan.report,
      board: plan.options.board,
      ballRadius: 0.24,
      bricks,
      ballSegments: segments,
      paddleContacts,
      ballSpeed: PREVIEW_BALL_SPEED,
      finalBrickId,
    },
  };
}
