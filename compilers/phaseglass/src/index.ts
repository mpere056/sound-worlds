import type { Song, SongEvent, SongTrack } from "@reaper-viz/core";
import { certifyPhaseglassRoute } from "./certification.js";
import {
  phaseglassAdd,
  phaseglassAdvance,
  phaseglassCross,
  phaseglassDistance,
  phaseglassDot,
  phaseglassLength,
  phaseglassNormalize,
  phaseglassRotateAroundAxis,
  phaseglassScale,
  phaseglassSolvePhaseGradient,
  phaseglassSub,
} from "./physics.js";
import type {
  PhaseglassCompileOptions,
  PhaseglassDeadline,
  PhaseglassMembrane,
  PhaseglassNote,
  PhaseglassPerformance,
  PhaseglassPlan,
  PhaseglassRayState,
  PhaseglassResolvedOptions,
  PhaseglassRouteSegment,
  PhaseglassVec3,
} from "./types.js";

export * from "./types.js";
export * from "./physics.js";
export * from "./certification.js";

const DEFAULT_CHORD_EPSILON_SEC = 0.025;
const INITIAL_DIRECTION: PhaseglassVec3 = phaseglassNormalize([0.42, -0.18, 1]);
const INITIAL_POSITION: PhaseglassVec3 = [-1.8, 0.6, -1.2];
const COLORS = ["#d7fbff", "#8de8ef", "#f0c983", "#a9bdf7", "#7fd7ca", "#f1a96f"] as const;

interface SelectedTrack {
  track: SongTrack;
  notes: SongEvent[];
  reason: string;
}

function noteEvents(track: SongTrack): SongEvent[] {
  return track.events
    .filter((event) => event.kind === "note" && event.pitch !== null)
    .map((event) => ({ ...event }))
    .sort((left, right) => left.t - right.t || (left.pitch ?? 0) - (right.pitch ?? 0) || left.vel - right.vel || left.dur - right.dur);
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
    if (!track) throw new Error(`Phaseglass source track not found: ${sourceTrackId}`);
    const notes = noteEvents(track);
    if (!notes.length) throw new Error(`Phaseglass source track has no MIDI notes: ${track.name}`);
    return { track, notes, reason: `manual track override: ${track.name}` };
  }
  const candidates = song.tracks
    .map((track) => ({ track, notes: noteEvents(track) }))
    .filter((entry) => entry.notes.length)
    .map((entry) => ({ ...entry, score: trackScore(entry.track, entry.notes, song.meta.durationSec) }))
    .sort((left, right) => right.score - left.score || right.notes.length - left.notes.length || left.track.name.localeCompare(right.track.name) || left.track.id.localeCompare(right.track.id));
  const selected = candidates[0];
  if (!selected) throw new Error("Phaseglass requires at least one note-bearing track");
  return { track: selected.track, notes: selected.notes, reason: `auto score ${selected.score.toFixed(3)}: ${selected.track.name}` };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function groupPhaseglassDeadlines(track: SongTrack, notes: readonly SongEvent[], chordEpsilonSec: number): PhaseglassDeadline[] {
  const groups: Array<{ t: number; notes: PhaseglassNote[] }> = [];
  for (const event of notes) {
    if (event.kind !== "note" || event.pitch === null) continue;
    const current = groups.at(-1);
    if (!current || event.t - current.t > chordEpsilonSec + 1e-9) groups.push({ t: event.t, notes: [] });
    groups.at(-1)!.notes.push({ trackId: track.id, pitch: event.pitch, velocity: event.vel, duration: event.dur });
  }
  return groups.map((group, index) => {
    const ordered = [...group.notes].sort((left, right) => left.pitch - right.pitch || left.velocity - right.velocity || left.duration - right.duration);
    const signature = ordered.map((note) => `${note.pitch}:${note.velocity.toFixed(4)}:${note.duration.toFixed(4)}`).join("+");
    return {
      id: `phaseglass-deadline:${index}:${group.t.toFixed(6)}:${signature}`,
      t: group.t,
      notes: ordered,
      representativePitch: median(ordered.map((note) => note.pitch)),
      energy: Math.max(...ordered.map((note) => note.velocity)),
    };
  });
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number`);
  return value;
}

export function compilePhaseglassPlan(song: Song, options: PhaseglassCompileOptions = {}): PhaseglassPlan {
  const resolved: PhaseglassResolvedOptions = {
    ...(options.sourceTrackId ? { sourceTrackId: options.sourceTrackId } : {}),
    chordEpsilonSec: options.chordEpsilonSec ?? DEFAULT_CHORD_EPSILON_SEC,
    seed: options.seed ?? `${song.meta.seed}:phaseglass`,
    signalSpeed: positiveFinite(options.signalSpeed ?? 5.2, "Phaseglass signal speed"),
    minimumMembraneSpacing: positiveFinite(options.minimumMembraneSpacing ?? 0.08, "Phaseglass minimum membrane spacing"),
    mode: "active-phase",
  };
  if (!(resolved.chordEpsilonSec >= 0 && resolved.chordEpsilonSec <= 0.1)) throw new RangeError("Phaseglass chord epsilon must be between 0 and 0.1 seconds");
  const selected = selectTrack(song, resolved.sourceTrackId);
  const deadlines = groupPhaseglassDeadlines(selected.track, selected.notes, resolved.chordEpsilonSec);
  const gaps = deadlines.slice(1).map((deadline, index) => deadline.t - deadlines[index]!.t);
  return {
    schemaVersion: 1,
    concept: "phaseglass-plan",
    durationSec: song.meta.durationSec,
    options: resolved,
    deadlines,
    report: {
      sourceTrackId: selected.track.id,
      sourceTrackName: selected.track.name,
      selectionReason: selected.reason,
      sourceNoteCount: selected.notes.length,
      groupedDeadlineCount: deadlines.length,
      compoundDeadlineCount: deadlines.filter((deadline) => deadline.notes.length > 1).length,
      firstDeadlineSec: deadlines[0]!.t,
      finalDeadlineSec: deadlines.at(-1)!.t,
      minimumGapSec: gaps.length ? Math.min(...gaps) : null,
      mode: "active-phase",
      warnings: ["Active phase-gradient membranes preserve speed while supplying authored tangential momentum"],
    },
  };
}

function membraneRadius(deadlines: readonly PhaseglassDeadline[], index: number, speed: number): number {
  const previousGap = index > 0 ? deadlines[index]!.t - deadlines[index - 1]!.t : Number.POSITIVE_INFINITY;
  const nextGap = index + 1 < deadlines.length ? deadlines[index + 1]!.t - deadlines[index]!.t : Number.POSITIVE_INFINITY;
  const available = Math.min(previousGap, nextGap);
  return Math.max(0.2, Math.min(0.82, Number.isFinite(available) ? available * speed * 0.24 : 0.82));
}

function localAxes(direction: PhaseglassVec3): [PhaseglassVec3, PhaseglassVec3] {
  const reference: PhaseglassVec3 = Math.abs(direction[1]) < 0.82 ? [0, 1, 0] : [1, 0, 0];
  const first = phaseglassNormalize(phaseglassCross(direction, reference), [0, 0, 1]);
  return [first, phaseglassNormalize(phaseglassCross(direction, first), [0, 1, 0])];
}

function outgoingCandidates(incoming: PhaseglassVec3, deadline: PhaseglassDeadline, index: number): PhaseglassVec3[] {
  const [axisA, axisB] = localAxes(incoming);
  const pitchPhase = deadline.representativePitch * 0.217 + index * 1.173;
  const turn = 0.28 + deadline.energy * 0.46;
  const candidates: PhaseglassVec3[] = [];
  for (const turnScale of [1, 0.72, 1.2, 0.48]) {
    for (const phaseOffset of [0, Math.PI * 0.5, -Math.PI * 0.5, Math.PI]) {
      const phase = pitchPhase + phaseOffset;
      const axis = phaseglassNormalize(phaseglassAdd(phaseglassScale(axisA, Math.cos(phase)), phaseglassScale(axisB, Math.sin(phase))), axisA);
      candidates.push(phaseglassNormalize(phaseglassRotateAroundAxis(incoming, axis, turn * turnScale)));
    }
  }
  return candidates;
}

function makeMembrane(deadline: PhaseglassDeadline, index: number, center: PhaseglassVec3, incoming: PhaseglassVec3, outgoing: PhaseglassVec3, radius: number, speed: number): PhaseglassMembrane {
  const normal = phaseglassNormalize(phaseglassAdd(incoming, outgoing), localAxes(incoming)[0]);
  const [axisU, axisV] = localAxes(normal);
  const incomingVelocity = phaseglassScale(incoming, speed);
  const outgoingVelocity = phaseglassScale(outgoing, speed);
  return {
    id: `phaseglass-membrane:${index}`,
    deadlineId: deadline.id,
    t: deadline.t,
    center: [...center],
    normal,
    axisU,
    axisV,
    incomingDirection: [...incoming],
    outgoingDirection: [...outgoing],
    phaseGradient: phaseglassSolvePhaseGradient(incomingVelocity, outgoingVelocity, normal),
    radius,
    thickness: 0.045,
    pitch: deadline.representativePitch,
    energy: deadline.energy,
    duration: Math.max(...deadline.notes.map((note) => note.duration)),
    color: COLORS[((Math.round(deadline.representativePitch) % 12) + 12) % 12 % COLORS.length]!,
  };
}

function pointToSegmentDistance(point: PhaseglassVec3, start: PhaseglassVec3, end: PhaseglassVec3): number {
  const delta = phaseglassSub(end, start);
  const denominator = phaseglassDot(delta, delta);
  const fraction = denominator > 1e-12 ? Math.max(0, Math.min(1, phaseglassDot(phaseglassSub(point, start), delta) / denominator)) : 0;
  return phaseglassDistance(point, phaseglassAdd(start, phaseglassScale(delta, fraction)));
}

function chooseOutgoing(
  incoming: PhaseglassVec3,
  center: PhaseglassVec3,
  deadline: PhaseglassDeadline,
  index: number,
  plan: PhaseglassPlan,
  membranes: readonly PhaseglassMembrane[],
  route: readonly PhaseglassRouteSegment[],
): PhaseglassVec3 {
  const next = plan.deadlines[index + 1];
  const candidates = outgoingCandidates(incoming, deadline, index);
  if (!next) return candidates[0]!;
  const travel = plan.options.signalSpeed * (next.t - deadline.t);
  const nextRadius = membraneRadius(plan.deadlines, index + 1, plan.options.signalSpeed);
  const scored = candidates.map((candidate, candidateIndex) => {
    const nextCenter = phaseglassAdvance(center, candidate, plan.options.signalSpeed, next.t - deadline.t);
    const membraneClearance = membranes.length
      ? Math.min(...membranes.map((membrane) => phaseglassDistance(nextCenter, membrane.center) - nextRadius - membrane.radius))
      : Number.POSITIVE_INFINITY;
    const routeClearance = route.length
      ? Math.min(...route.map((segment) => pointToSegmentDistance(nextCenter, segment.start.position, segment.end.position) - nextRadius))
      : Number.POSITIVE_INFINITY;
    const inward = phaseglassLength(nextCenter);
    const depth = Math.abs(candidate[2]);
    const collisionPenalty = Math.max(0, plan.options.minimumMembraneSpacing - membraneClearance) * 1000
      + Math.max(0, nextRadius * 0.45 - routeClearance) * 300;
    const rangePenalty = Math.max(0, inward - 16) * 3;
    const shortTravelPenalty = Math.max(0, nextRadius * 2.2 - travel) * 500;
    return { candidate, score: collisionPenalty + rangePenalty + shortTravelPenalty - depth * 0.26 + candidateIndex * 1e-6 };
  });
  scored.sort((left, right) => left.score - right.score);
  return scored[0]!.candidate;
}

export function samplePhaseglassRay(route: readonly PhaseglassRouteSegment[], time: number): PhaseglassRayState {
  const segment = route.find((candidate) => time <= candidate.t1 + 1e-9) ?? route.at(-1);
  if (!segment) return { position: [...INITIAL_POSITION], direction: [...INITIAL_DIRECTION], speed: 5.2 };
  const elapsed = Math.max(0, Math.min(segment.t1 - segment.t0, time - segment.t0));
  return {
    position: phaseglassAdvance(segment.start.position, segment.start.direction, segment.start.speed, elapsed),
    direction: [...segment.start.direction],
    speed: segment.start.speed,
  };
}

export function compilePhaseglass(song: Song, options: PhaseglassCompileOptions = {}): PhaseglassPerformance {
  const plan = compilePhaseglassPlan(song, options);
  const route: PhaseglassRouteSegment[] = [];
  const membranes: PhaseglassMembrane[] = [];
  let state: PhaseglassRayState = { position: [...INITIAL_POSITION], direction: [...INITIAL_DIRECTION], speed: plan.options.signalSpeed };
  let t0 = 0;
  for (const [index, deadline] of plan.deadlines.entries()) {
    const duration = deadline.t - t0;
    if (duration < -1e-9) throw new RangeError(`Phaseglass deadline ${deadline.id} is out of order`);
    const center = phaseglassAdvance(state.position, state.direction, state.speed, Math.max(0, duration));
    const outgoing = chooseOutgoing(state.direction, center, deadline, index, plan, membranes, route);
    const end: PhaseglassRayState = { position: [...center], direction: [...state.direction], speed: state.speed };
    route.push({
      id: `phaseglass-segment:${index}`,
      kind: "deadline",
      deadlineId: deadline.id,
      t0,
      t1: deadline.t,
      start: { position: [...state.position], direction: [...state.direction], speed: state.speed },
      end,
    });
    membranes.push(makeMembrane(deadline, index, center, state.direction, outgoing, membraneRadius(plan.deadlines, index, state.speed), state.speed));
    state = { position: [...center], direction: outgoing, speed: state.speed };
    t0 = deadline.t;
  }
  if (t0 < song.meta.durationSec) {
    route.push({
      id: "phaseglass-segment:tail",
      kind: "tail",
      t0,
      t1: song.meta.durationSec,
      start: { position: [...state.position], direction: [...state.direction], speed: state.speed },
      end: { position: phaseglassAdvance(state.position, state.direction, state.speed, song.meta.durationSec - t0), direction: [...state.direction], speed: state.speed },
    });
  }
  const certification = certifyPhaseglassRoute(route, membranes);
  const exactCrossingError = Math.max(0, ...membranes.map((membrane, index) => phaseglassDistance(membrane.center, route[index]!.end.position)));
  const maximumSpeedError = Math.max(0, ...route.flatMap((segment) => [Math.abs(segment.start.speed - plan.options.signalSpeed), Math.abs(segment.end.speed - plan.options.signalSpeed)]));
  const maximumRouteRadius = Math.max(0, ...route.flatMap((segment) => [phaseglassLength(segment.start.position), phaseglassLength(segment.end.position)]));
  const warnings = certification.violations.length ? [`${certification.violations.length} phaseglass occupancy violations remain`] : [];
  return {
    schemaVersion: 1,
    concept: "phaseglass",
    seed: plan.options.seed,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: 1080, h: 1920 },
    palette: { bg: "#03070b", roles: { signal: "#f4ffff", membrane: "#8de8ef", caustic: "#f0c983", depth: "#14242b" } },
    camera: [{ t: 0, pos: [5, 3.5, 9], zoom: 1 }],
    curves: { energy: song.master.energy },
    events: membranes.map((membrane) => ({ t: membrane.t, type: "phaseglass.crossing", layer: "membranes", params: { membraneId: membrane.id, deadlineId: membrane.deadlineId, pitch: membrane.pitch } })),
    statics: {
      sourceTrackId: plan.report.sourceTrackId,
      planReport: plan.report,
      routeReport: {
        deadlineCount: plan.deadlines.length,
        segmentCount: route.length,
        exactCrossingError,
        maximumSpeedError,
        minimumMembraneClearance: certification.minimumMembraneClearance,
        earlyCrossingCount: certification.earlyCrossingCount,
        occupancyViolations: certification.violations,
        maximumRouteRadius,
        warnings,
      },
      membranes,
      route,
    },
  };
}
