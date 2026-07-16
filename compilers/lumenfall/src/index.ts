import type { Song, SongEvent, SongTrack } from "@reaper-viz/core";
import { createNocturneCausewayWorld } from "./world.js";
import {
  lumenAdd,
  lumenfallImpulse,
  lumenfallTangentialImpulseRatio,
  lumenLength,
  lumenScale,
  passiveLumenfallReflection,
  sampleLumenfallBallistic,
  solveLumenfallLaunch,
} from "./physics.js";
import type { LumenfallCompileOptions, LumenfallDeadline, LumenfallImpact, LumenfallPerformance, LumenfallPose, LumenfallSegment, LumenfallSlab, LumenfallVec3 } from "./types.js";

export * from "./types.js";
export * from "./physics.js";
export * from "./world.js";

const EPS = 1e-7;
const DEFAULT_CHORD_EPSILON = 0.025;

function noteEvents(track: SongTrack): SongEvent[] {
  return track.events.filter((event) => event.kind === "note" && event.pitch !== null)
    .map((event) => ({ ...event }))
    .sort((a, b) => a.t - b.t || (a.pitch ?? 0) - (b.pitch ?? 0) || a.vel - b.vel);
}

function selectTrack(song: Song, sourceTrackId?: string): { track: SongTrack; notes: SongEvent[]; reason: string } {
  if (sourceTrackId) {
    const track = song.tracks.find((candidate) => candidate.id === sourceTrackId);
    if (!track) throw new Error(`Lumenfall source track not found: ${sourceTrackId}`);
    const notes = noteEvents(track);
    if (!notes.length) throw new Error(`Lumenfall source track has no notes: ${track.name}`);
    return { track, notes, reason: `manual track override: ${track.name}` };
  }
  const candidates = song.tracks.map((track) => ({ track, notes: noteEvents(track) }))
    .filter((candidate) => candidate.notes.length)
    .map((candidate) => ({ ...candidate, score: candidate.notes.length * 4 + (/lead|melody|keys|piano|synth|bass/i.test(candidate.track.role) ? 6 : 0) }))
    .sort((a, b) => b.score - a.score || b.notes.length - a.notes.length || a.track.id.localeCompare(b.track.id));
  const selected = candidates[0];
  if (!selected) throw new Error("Lumenfall requires at least one note-bearing track");
  return { track: selected.track, notes: selected.notes, reason: `auto score ${selected.score.toFixed(3)}: ${selected.track.name}` };
}

export function groupLumenfallDeadlines(notes: readonly SongEvent[], chordEpsilonSec = DEFAULT_CHORD_EPSILON): LumenfallDeadline[] {
  const groups: Array<{ t: number; events: SongEvent[] }> = [];
  for (const event of notes) {
    const current = groups.at(-1);
    if (!current || event.t - current.t > chordEpsilonSec + EPS) groups.push({ t: event.t, events: [] });
    groups.at(-1)!.events.push(event);
  }
  return groups.map((group, index) => {
    const pitches = group.events.map((event) => event.pitch ?? 60).sort((a, b) => a - b);
    const middle = Math.floor(pitches.length / 2);
    const pitch = pitches.length % 2 ? pitches[middle]! : (pitches[middle - 1]! + pitches[middle]!) / 2;
    return {
      id: `lumen-deadline:${index}:${group.t.toFixed(6)}`,
      t: group.t,
      pitch,
      velocity: Math.max(...group.events.map((event) => event.vel)),
      duration: Math.max(...group.events.map((event) => event.dur)),
      noteCount: group.events.length,
    };
  });
}

function slabAt(world: ReturnType<typeof createNocturneCausewayWorld>, row: number, lane: number): LumenfallSlab {
  const slab = world.slabs.find((candidate) => candidate.row === row && candidate.lane === lane);
  if (!slab) throw new Error(`Lumenfall world has no slab at row ${row}, lane ${lane}`);
  return slab;
}

interface ContactChoice { slab: LumenfallSlab; point: LumenfallVec3; }

function chooseContacts(world: ReturnType<typeof createNocturneCausewayWorld>, deadlines: readonly LumenfallDeadline[]): ContactChoice[] {
  const lane = 1;
  const forwardSpeed = 2.18;
  const startZ = 1.8;
  const firstT = deadlines[0]?.t ?? 0;
  return deadlines.map((deadline) => {
    const desiredZ = startZ - forwardSpeed * (deadline.t - firstT);
    const row = Math.max(1, Math.min(world.rowCount - 2, Math.round((4 - desiredZ) / world.rowSpacing)));
    const slab = slabAt(world, row, lane);
    const zMargin = world.heroRadius * 1.25;
    const z = Math.max(slab.center[2] - slab.size[2] / 2 + zMargin, Math.min(slab.center[2] + slab.size[2] / 2 - zMargin, desiredZ));
    const stableLaneX = (lane - (world.laneCount - 1) / 2) * world.laneSpacing;
    const xMargin = world.heroRadius * 1.25;
    const x = Math.max(slab.center[0] - slab.size[0] / 2 + xMargin, Math.min(slab.center[0] + slab.size[0] / 2 - xMargin, stableLaneX));
    return { slab, point: [x, world.heroRadius, z] };
  });
}

function segmentMetrics(p0: LumenfallVec3, v0: LumenfallVec3, gravity: LumenfallVec3, duration: number, groundY: number): { apexT: number; apexHeight: number; minimumInteriorClearance: number } {
  const apexT = gravity[1] < -EPS ? Math.max(0, Math.min(duration, -v0[1] / gravity[1])) : 0;
  const apex = sampleLumenfallBallistic(p0, v0, gravity, apexT).position;
  let minimumInteriorClearance = Number.POSITIVE_INFINITY;
  for (let sample = 1; sample < 120; sample += 1) {
    const local = duration * sample / 120;
    const y = sampleLumenfallBallistic(p0, v0, gravity, local).position[1];
    minimumInteriorClearance = Math.min(minimumInteriorClearance, y - groundY);
  }
  return { apexT, apexHeight: apex[1] - groundY, minimumInteriorClearance };
}

function buildSegments(world: ReturnType<typeof createNocturneCausewayWorld>, deadlines: readonly LumenfallDeadline[], contacts: readonly ContactChoice[]): LumenfallSegment[] {
  const segments: LumenfallSegment[] = [];
  if (!deadlines.length) return segments;
  const first = deadlines[0]!;
  const firstPoint = contacts[0]!.point;
  if (first.t > 0.06) {
    const duration = first.t;
    const firstFlightDuration = deadlines[1] ? deadlines[1]!.t - first.t : 0.6;
    const desiredIncomingY = -(9.81 * firstFlightDuration * 0.5) / 0.62;
    const startY = firstPoint[1] - 0.5 * 9.81 * duration * duration - desiredIncomingY * duration;
    const horizontalVelocity: LumenfallVec3 = deadlines[1]
      ? [(contacts[1]!.point[0] - firstPoint[0]) / firstFlightDuration, 0, (contacts[1]!.point[2] - firstPoint[2]) / firstFlightDuration]
      : [0, 0, -2.18];
    const from: LumenfallVec3 = [firstPoint[0] - horizontalVelocity[0] * duration, Math.max(firstPoint[1] + 0.5, startY), firstPoint[2] - horizontalVelocity[2] * duration];
    const v0 = solveLumenfallLaunch(from, firstPoint, world.gravity, duration);
    const metrics = segmentMetrics(from, v0, world.gravity, duration, world.heroRadius);
    segments.push({ id: "lumen-segment:launch", kind: "launch", t0: 0, t1: first.t, p0: from, p1: [...firstPoint], v0, gravity: [...world.gravity], targetImpactId: "lumen-impact:0", ...metrics });
  }
  for (let index = 0; index < deadlines.length - 1; index += 1) {
    const current = deadlines[index]!;
    const next = deadlines[index + 1]!;
    const duration = next.t - current.t;
    if (!(duration > 0.04)) throw new Error(`Lumenfall deadline gap is too short at ${next.t.toFixed(6)}s`);
    const p0 = contacts[index]!.point;
    const p1 = contacts[index + 1]!.point;
    const v0 = solveLumenfallLaunch(p0, p1, world.gravity, duration);
    const metrics = segmentMetrics(p0, v0, world.gravity, duration, world.heroRadius);
    segments.push({ id: `lumen-segment:${index}`, kind: "flight", t0: current.t, t1: next.t, p0: [...p0], p1: [...p1], v0, gravity: [...world.gravity], targetImpactId: `lumen-impact:${index + 1}`, ...metrics });
  }
  return segments;
}

function segmentIncoming(segment: LumenfallSegment | undefined): LumenfallVec3 {
  if (!segment) return [0, -1, 0];
  return sampleLumenfallBallistic(segment.p0, segment.v0, segment.gravity, segment.t1 - segment.t0).velocity;
}

function buildImpacts(deadlines: readonly LumenfallDeadline[], contacts: readonly ContactChoice[], segments: readonly LumenfallSegment[]): LumenfallImpact[] {
  return deadlines.map((deadline, index) => {
    const incomingSegment = segments.find((segment) => segment.targetImpactId === `lumen-impact:${index}`);
    const outgoingSegment = segments.find((segment) => Math.abs(segment.t0 - deadline.t) <= EPS);
    const incomingVelocity = segmentIncoming(incomingSegment);
    const outgoingVelocity: LumenfallVec3 = outgoingSegment ? [...outgoingSegment.v0] : [0, 0, 0];
    const normal = contacts[index]!.slab.contactNormal;
    const requiredRestitution = incomingVelocity[1] < -EPS && outgoingVelocity[1] > 0 ? outgoingVelocity[1] / -incomingVelocity[1] : 0;
    const restitution = index === deadlines.length - 1 ? 0 : Math.max(0.08, Math.min(0.95, requiredRestitution));
    const friction = index === deadlines.length - 1 ? 1 : 0;
    const passiveVelocity = passiveLumenfallReflection(incomingVelocity, normal, restitution, friction);
    const musicalImpulse = lumenfallImpulse(passiveVelocity, outgoingVelocity);
    return {
      id: `lumen-impact:${index}`,
      deadlineId: deadline.id,
      noteIndex: index,
      t: deadline.t,
      slabId: contacts[index]!.slab.id,
      point: [...contacts[index]!.point],
      normal: [...normal],
      incomingVelocity,
      passiveVelocity,
      outgoingVelocity,
      musicalImpulse,
      restitution,
      friction,
      impactEnergy: Number((0.5 * lumenLength(incomingVelocity) ** 2).toFixed(6)),
      lightIntensity: Number((220 + deadline.velocity * 560).toFixed(3)),
      colorTemperatureK: Math.round(4600 + Math.max(0, Math.min(1, (deadline.pitch - 36) / 60)) * 1800),
      afterglowSec: Number(Math.min(0.42, 0.11 + deadline.duration * 0.18).toFixed(4)),
    };
  });
}

export function sampleLumenfallPose(performance: LumenfallPerformance, time: number): LumenfallPose {
  const segments = performance.statics.segments;
  const first = segments[0];
  if (!first) {
    const point = performance.statics.impacts[0]?.point ?? [0, performance.statics.world.heroRadius, 0];
    return { position: [...point], velocity: [0, 0, 0], segmentId: null, grounded: true };
  }
  const bounded = Math.max(0, Math.min(performance.durationSec, time));
  const segment = segments.find((candidate) => bounded >= candidate.t0 - EPS && bounded <= candidate.t1 + EPS);
  if (segment) {
    const sampled = sampleLumenfallBallistic(segment.p0, segment.v0, segment.gravity, Math.max(0, Math.min(segment.t1 - segment.t0, bounded - segment.t0)));
    return { ...sampled, segmentId: segment.id, grounded: Math.abs(bounded - segment.t1) <= EPS };
  }
  const previousImpact = [...performance.statics.impacts].reverse().find((impact) => impact.t <= bounded) ?? performance.statics.impacts[0];
  const position = previousImpact?.point ?? first.p0;
  return { position: [...position], velocity: [0, 0, 0], segmentId: null, grounded: true };
}

export function compileLumenfall(song: Song, options: LumenfallCompileOptions = {}): LumenfallPerformance {
  const selected = selectTrack(song, options.sourceTrackId);
  const deadlines = groupLumenfallDeadlines(selected.notes, options.chordEpsilonSec ?? DEFAULT_CHORD_EPSILON);
  if (!deadlines.length) throw new Error("Lumenfall requires at least one musical deadline");
  const world = createNocturneCausewayWorld(song.meta.seed);
  const contacts = chooseContacts(world, deadlines);
  const segments = buildSegments(world, deadlines, contacts);
  const impacts = buildImpacts(deadlines, contacts, segments);
  let maximumTimingError = 0;
  let maximumSpeed = 0;
  let minimumInteriorClearance = Number.POSITIVE_INFINITY;
  let earlyCollisionCount = 0;
  for (const segment of segments) {
    const end = sampleLumenfallBallistic(segment.p0, segment.v0, segment.gravity, segment.t1 - segment.t0);
    maximumTimingError = Math.max(maximumTimingError, lumenLength(lumenAdd(end.position, lumenScale(segment.p1, -1))));
    maximumSpeed = Math.max(maximumSpeed, lumenLength(segment.v0), lumenLength(end.velocity));
    minimumInteriorClearance = Math.min(minimumInteriorClearance, segment.minimumInteriorClearance);
    if (segment.minimumInteriorClearance < -1e-5) earlyCollisionCount += 1;
  }
  const maximumImpulse = Math.max(...impacts.map((impact) => lumenLength(impact.musicalImpulse)));
  const maximumTangentialImpulseRatio = Math.max(...impacts.map((impact) => lumenLength(impact.musicalImpulse) < 0.05 ? 0 : lumenfallTangentialImpulseRatio(impact.musicalImpulse, impact.normal)));
  const warnings = maximumTangentialImpulseRatio > 0.35 ? [`Graybox route tangential impulse ratio ${maximumTangentialImpulseRatio.toFixed(3)} exceeds the final-material target; L2 pair-state search remains required`] : [];
  const report = {
    sourceTrackId: selected.track.id,
    sourceTrackName: selected.track.name,
    selectionReason: selected.reason,
    sourceNoteCount: selected.notes.length,
    groupedDeadlineCount: deadlines.length,
    impactCount: impacts.length,
    segmentCount: segments.length,
    maximumTimingError,
    maximumSpeed,
    maximumImpulse,
    maximumTangentialImpulseRatio,
    minimumInteriorClearance: Number.isFinite(minimumInteriorClearance) ? minimumInteriorClearance : 0,
    earlyCollisionCount,
    worldSlabCount: world.slabs.length,
    warnings,
  };
  if (maximumTimingError > 1e-6 || earlyCollisionCount > 0) throw new Error(`Lumenfall certification failed: timing ${maximumTimingError}, early collisions ${earlyCollisionCount}`);
  return {
    schemaVersion: 1,
    concept: "lumenfall",
    seed: `${song.meta.seed}:lumenfall-v1`,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: 1080, h: 1920 },
    palette: { bg: "#010205", roles: { light: "#fffaf0", wet: "#101a22", dry: "#17191d", water: "#06121a", impact: "#d9f5ff" } },
    camera: [{ t: 0, pos: [5.8, 3.2, 10], zoom: 1 }],
    curves: { energy: song.master.energy },
    events: impacts.map((impact) => ({ t: impact.t, type: "lumenfall.impact", layer: "light", params: { impactId: impact.id, slabId: impact.slabId, hitT: impact.t } })),
    statics: { sourceTrackId: selected.track.id, deadlines, world, segments, impacts, report },
  };
}
