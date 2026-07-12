import type { Song, SongEvent, SongTrack } from "@reaper-viz/core";
import { auroraCross, auroraDot, auroraLength, auroraNormalize, auroraPropagateConstantField, auroraSub } from "./physics.js";
import { auroraSolveIdealMagneticArc } from "./solver.js";
import { auroraCoilSurfaceClearance, auroraSegmentCoilClearance, certifyAuroraOccupancy } from "./certification.js";
import type { AuroraCoil, AuroraCompileOptions, AuroraCompileReport, AuroraDeadline, AuroraIdealArcSolution, AuroraNote, AuroraParticleState, AuroraPerformance, AuroraPlan, AuroraResolvedOptions, AuroraRouteSegment, AuroraVec3 } from "./types.js";

export * from "./types.js";
export * from "./physics.js";
export * from "./solver.js";
export * from "./certification.js";

const DEFAULT_CHORD_EPSILON_SEC = 0.025;

interface SelectedTrack {
  track: SongTrack;
  notes: SongEvent[];
  reason: string;
}

function noteEvents(track: SongTrack): SongEvent[] {
  return track.events
    .filter((event) => event.kind === "note" && event.pitch !== null)
    .map((event) => ({ ...event }))
    .sort((left, right) => left.t - right.t
      || (left.pitch ?? 0) - (right.pitch ?? 0)
      || left.vel - right.vel
      || left.dur - right.dur);
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
    if (!track) throw new Error(`Aurora Cyclotron source track not found: ${sourceTrackId}`);
    const notes = noteEvents(track);
    if (!notes.length) throw new Error(`Aurora Cyclotron source track has no MIDI notes: ${track.name}`);
    return { track, notes, reason: `manual track override: ${track.name}` };
  }
  const candidates = song.tracks
    .map((track) => ({ track, notes: noteEvents(track) }))
    .filter((entry) => entry.notes.length)
    .map((entry) => ({ ...entry, score: trackScore(entry.track, entry.notes, song.meta.durationSec) }))
    .sort((left, right) => right.score - left.score
      || right.notes.length - left.notes.length
      || left.track.name.localeCompare(right.track.name)
      || left.track.id.localeCompare(right.track.id));
  const selected = candidates[0];
  if (!selected) throw new Error("Aurora Cyclotron requires at least one note-bearing track");
  return { track: selected.track, notes: selected.notes, reason: `auto score ${selected.score.toFixed(3)}: ${selected.track.name}` };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function groupAuroraDeadlines(track: SongTrack, notes: readonly SongEvent[], chordEpsilonSec: number): AuroraDeadline[] {
  const groups: Array<Omit<AuroraDeadline, "id" | "representativePitch" | "energy">> = [];
  for (const event of notes) {
    if (event.kind !== "note" || event.pitch === null) continue;
    const current = groups.at(-1);
    if (!current || event.t - current.t > chordEpsilonSec + 1e-9) groups.push({ t: event.t, notes: [] });
    groups.at(-1)!.notes.push({ trackId: track.id, pitch: event.pitch, velocity: event.vel, duration: event.dur });
  }
  return groups.map((group, index) => {
    const orderedNotes: AuroraNote[] = [...group.notes].sort((left, right) => left.pitch - right.pitch || left.velocity - right.velocity || left.duration - right.duration);
    const signature = orderedNotes.map((note) => `${note.pitch}:${note.velocity.toFixed(4)}:${note.duration.toFixed(4)}`).join("+");
    return {
      id: `aurora-deadline:${index}:${group.t.toFixed(6)}:${signature}`,
      t: group.t,
      notes: orderedNotes,
      representativePitch: median(orderedNotes.map((note) => note.pitch)),
      energy: Math.max(...orderedNotes.map((note) => note.velocity)),
    };
  });
}

function gapHistogram(deadlines: readonly AuroraDeadline[]): AuroraCompileReport["gapHistogram"] {
  const result = { dense: 0, short: 0, medium: 0, long: 0 };
  for (let index = 1; index < deadlines.length; index += 1) {
    const gap = deadlines[index]!.t - deadlines[index - 1]!.t;
    if (gap < 0.12) result.dense += 1;
    else if (gap < 0.35) result.short += 1;
    else if (gap < 1) result.medium += 1;
    else result.long += 1;
  }
  return result;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number`);
  return value;
}

export function compileAuroraPlan(song: Song, options: AuroraCompileOptions = {}): AuroraPlan {
  const resolved: AuroraResolvedOptions = {
    chordEpsilonSec: options.chordEpsilonSec ?? DEFAULT_CHORD_EPSILON_SEC,
    seed: options.seed ?? `${song.meta.seed}:aurora-cyclotron`,
    charge: options.charge ?? 1,
    mass: positiveFinite(options.mass ?? 1, "Aurora particle mass"),
    maxMagneticField: positiveFinite(options.maxMagneticField ?? 8, "Aurora maximum magnetic field"),
    maxElectricField: positiveFinite(options.maxElectricField ?? 4, "Aurora maximum electric field"),
    minimumCoilSpacing: positiveFinite(options.minimumCoilSpacing ?? 0.8, "Aurora minimum coil spacing"),
  };
  if (!Number.isFinite(resolved.charge) || resolved.charge === 0) throw new RangeError("Aurora particle charge must be finite and non-zero");
  if (!(resolved.chordEpsilonSec >= 0 && resolved.chordEpsilonSec <= 0.1)) throw new RangeError("Aurora chord epsilon must be between 0 and 0.1 seconds");
  const selected = selectTrack(song, options.sourceTrackId);
  const deadlines = groupAuroraDeadlines(selected.track, selected.notes, resolved.chordEpsilonSec);
  const gaps = deadlines.slice(1).map((deadline, index) => deadline.t - deadlines[index]!.t);
  return {
    schemaVersion: 1,
    concept: "aurora-cyclotron-plan",
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
      gapHistogram: gapHistogram(deadlines),
      idealFieldModel: true,
      warnings: ["A0-A1 uses ideal constant field volumes; finite-coil fringe correction begins in A2"],
    },
  };
}

interface AuroraRouteCandidate {
  solution: AuroraIdealArcSolution;
  family: "planar" | "depth" | "inward";
  score: number;
}

const AURORA_INITIAL_STATE: AuroraParticleState = { position: [0, 0, 0], velocity: [5.4, 0.3, 0.6] };
const AURORA_COLORS = ["#6fffe9", "#72d7ff", "#9cf6c4", "#f1d27a", "#d8f7ff", "#7ce8b2"] as const;

function distance(left: AuroraVec3, right: AuroraVec3): number {
  return auroraLength(auroraSub(left, right));
}

function candidateAxes(state: AuroraParticleState, deadline: AuroraDeadline, index: number): Array<{ axis: AuroraVec3; family: AuroraRouteCandidate["family"] }> {
  const pitchPhase = deadline.representativePitch * 0.371 + index * 1.217;
  const pitchAxis = auroraNormalize([Math.cos(pitchPhase) * 0.65, Math.sin(pitchPhase * 0.73) * 0.7, Math.sin(pitchPhase) || 0.25]);
  const depthAxis = auroraNormalize([0.22 * Math.sin(pitchPhase), 0.78, index % 2 ? -1 : 1]);
  const inward = auroraNormalize(auroraSub([0, 0, 0], state.position), [0, 1, 0]);
  const inwardAxis = auroraNormalize(auroraCross(inward, state.velocity), pitchAxis);
  const velocityAxis = auroraNormalize(state.velocity);
  const guidedInward = auroraNormalize([
    inwardAxis[0] + velocityAxis[0] * 0.42,
    inwardAxis[1] + velocityAxis[1] * 0.42,
    inwardAxis[2] + velocityAxis[2] * 0.42,
  ]);
  const guidedDepth = auroraNormalize([
    depthAxis[0] + velocityAxis[0] * 0.34,
    depthAxis[1] + velocityAxis[1] * 0.34,
    depthAxis[2] + velocityAxis[2] * 0.34,
  ]);
  const guidedPitch = auroraNormalize([
    pitchAxis[0] + velocityAxis[0] * 0.3,
    pitchAxis[1] + velocityAxis[1] * 0.3,
    pitchAxis[2] + velocityAxis[2] * 0.3,
  ]);
  return [
    { axis: guidedInward, family: "inward" },
    { axis: guidedDepth, family: "depth" },
    { axis: guidedPitch, family: "depth" },
    { axis: inwardAxis, family: "inward" },
    { axis: pitchAxis, family: "depth" },
    { axis: depthAxis, family: "depth" },
    { axis: [0, 0, 1], family: "planar" },
    { axis: [0, 1, 0], family: "planar" },
    { axis: [1, 0, 0], family: "planar" },
  ];
}

function solveDeadlineSegment(
  state: AuroraParticleState,
  t0: number,
  deadline: AuroraDeadline,
  index: number,
  plan: AuroraPlan,
  priorCoils: readonly AuroraCoil[],
  priorRoute: readonly AuroraRouteSegment[],
  previousAxis?: AuroraVec3,
): AuroraRouteCandidate {
  const duration = deadline.t - t0;
  if (!(duration > 0)) throw new RangeError(`Aurora deadline ${deadline.id} must occur after its preceding deadline`);
  const maximumTurn = plan.options.maxMagneticField * Math.abs(plan.options.charge) * duration / plan.options.mass;
  const authoredTurn = Math.min(1.42, Math.max(0.24, maximumTurn * 0.82));
  const turnAngles = [authoredTurn, -authoredTurn, authoredTurn * 0.68, -authoredTurn * 0.68, authoredTurn * 0.42, -authoredTurn * 0.42];
  const candidates: AuroraRouteCandidate[] = [];
  for (const [axisIndex, axis] of candidateAxes(state, deadline, index).entries()) {
    for (const [turnIndex, turnAngle] of turnAngles.entries()) {
      const solution = auroraSolveIdealMagneticArc({
        state,
        duration,
        turnAngle,
        fieldAxis: axis.axis,
        charge: plan.options.charge,
        mass: plan.options.mass,
        maxMagneticField: plan.options.maxMagneticField,
      });
      const radius = auroraLength(solution.end.position);
      const coil: AuroraCoil = {
        id: `aurora-candidate:${index}`,
        deadlineId: deadline.id,
        t: deadline.t,
        center: solution.coilCenter,
        axis: solution.coilAxis,
        arrivalDirection: solution.arrivalDirection,
        pitch: deadline.representativePitch,
        energy: deadline.energy,
        radius: 0.6 + deadline.energy * 0.12,
        tubeRadius: 0.085,
        color: AURORA_COLORS[0],
      };
      const segment: AuroraRouteSegment = {
        id: `aurora-candidate-segment:${index}`,
        kind: "deadline",
        deadlineId: deadline.id,
        t0,
        t1: deadline.t,
        start: state,
        end: solution.end,
        field: solution.field,
        charge: plan.options.charge,
        mass: plan.options.mass,
        turnAngle: solution.turnAngle,
        fieldMagnitude: solution.fieldMagnitude,
        family: axis.family,
      };
      const nearest = priorCoils.length ? Math.min(...priorCoils.map((coil) => distance(coil.center, solution.coilCenter))) : Number.POSITIVE_INFINITY;
      const spacingDeficit = Math.max(0, plan.options.minimumCoilSpacing - nearest);
      const coilClearance = priorCoils.length ? Math.min(...priorCoils.map((prior) => auroraCoilSurfaceClearance(coil, prior, 32))) : Number.POSITIVE_INFINITY;
      const ownedRouteClearance = auroraSegmentCoilClearance(segment, coil, 0.18, 28);
      const routeToPriorClearance = priorCoils.length ? Math.min(...priorCoils.map((prior) => auroraSegmentCoilClearance(segment, prior, 0.18, 20))) : Number.POSITIVE_INFINITY;
      const priorRouteToCoilClearance = priorRoute.length ? Math.min(...priorRoute.map((prior) => auroraSegmentCoilClearance(prior, coil, 0.18, 20))) : Number.POSITIVE_INFINITY;
      const tailDuration = index === plan.deadlines.length - 1 ? plan.durationSec - deadline.t : 0;
      const tailField = { electric: [0, 0, 0] as AuroraVec3, magnetic: [0, 0, 0] as AuroraVec3 };
      const tailSegment: AuroraRouteSegment | undefined = tailDuration > 0
        ? {
            id: "aurora-candidate-tail",
            kind: "tail",
            t0: deadline.t,
            t1: plan.durationSec,
            start: solution.end,
            end: auroraPropagateConstantField(solution.end, tailField, tailDuration, { charge: plan.options.charge, mass: plan.options.mass }),
            field: tailField,
            charge: plan.options.charge,
            mass: plan.options.mass,
            turnAngle: 0,
            fieldMagnitude: 0,
            family: "tail",
          }
        : undefined;
      const tailClearance = tailSegment
        ? Math.min(auroraSegmentCoilClearance(tailSegment, coil, 0.18, 24), ...priorCoils.map((prior) => auroraSegmentCoilClearance(tailSegment, prior, 0.18, 18)))
        : Number.POSITIVE_INFINITY;
      const occupancyDeficit = Math.max(0, 0.04 - coilClearance)
        + Math.max(0, 0.04 - ownedRouteClearance)
        + Math.max(0, 0.04 - routeToPriorClearance)
        + Math.max(0, 0.04 - priorRouteToCoilClearance)
        + Math.max(0, 0.04 - tailClearance);
      const depthTravel = Math.abs(solution.end.position[2] - state.position[2]);
      const continuity = previousAxis ? 1 - Math.abs(auroraDot(previousAxis, solution.coilAxis)) : 0;
      const axialArrival = Math.abs(auroraDot(solution.arrivalDirection, solution.coilAxis));
      const score = spacingDeficit * spacingDeficit * 2500
        + occupancyDeficit * occupancyDeficit * 12000
        + Math.max(0, 0.28 - axialArrival) ** 2 * 1800
        + Math.max(0, axialArrival - 0.82) ** 2 * 2400
        + radius * radius * 0.5
        + continuity * 0.18
        + solution.fieldMagnitude / plan.options.maxMagneticField * 0.08
        - Math.min(1.5, depthTravel) * (axis.family === "depth" ? 0.32 : 0.08)
        + axisIndex * 1e-5 + turnIndex * 1e-6;
      candidates.push({ solution, family: axis.family, score });
    }
  }
  candidates.sort((left, right) => left.score - right.score);
  return candidates[0]!;
}

export function sampleAuroraParticle(route: readonly AuroraRouteSegment[], t: number): AuroraParticleState {
  const segment = route.find((candidate) => t <= candidate.t1 + 1e-9) ?? route.at(-1);
  if (!segment) return { position: [...AURORA_INITIAL_STATE.position], velocity: [...AURORA_INITIAL_STATE.velocity] };
  const elapsed = Math.max(0, Math.min(segment.t1 - segment.t0, t - segment.t0));
  const result = auroraPropagateConstantField(segment.start, segment.field, elapsed, { charge: segment.charge, mass: segment.mass });
  return { position: result.position, velocity: result.velocity };
}

export function compileAurora(song: Song, options: AuroraCompileOptions = {}): AuroraPerformance {
  const plan = compileAuroraPlan(song, options);
  const route: AuroraRouteSegment[] = [];
  const coils: AuroraCoil[] = [];
  let state: AuroraParticleState = { position: [...AURORA_INITIAL_STATE.position], velocity: [...AURORA_INITIAL_STATE.velocity] };
  let t0 = 0;
  let previousAxis: AuroraVec3 | undefined;
  const familyCounts = { planar: 0, depth: 0, inward: 0 };
  for (const [index, deadline] of plan.deadlines.entries()) {
    const selected = solveDeadlineSegment(state, t0, deadline, index, plan, coils, route, previousAxis);
    const segment: AuroraRouteSegment = {
      id: `aurora-segment:${index}`,
      kind: "deadline",
      deadlineId: deadline.id,
      t0,
      t1: deadline.t,
      start: { position: [...state.position], velocity: [...state.velocity] },
      end: { position: [...selected.solution.end.position], velocity: [...selected.solution.end.velocity] },
      field: selected.solution.field,
      charge: plan.options.charge,
      mass: plan.options.mass,
      turnAngle: selected.solution.turnAngle,
      fieldMagnitude: selected.solution.fieldMagnitude,
      family: selected.family,
    };
    const coil: AuroraCoil = {
      id: `aurora-coil:${index}`,
      deadlineId: deadline.id,
      t: deadline.t,
      center: [...selected.solution.coilCenter],
      axis: [...selected.solution.coilAxis],
      arrivalDirection: [...selected.solution.arrivalDirection],
      pitch: deadline.representativePitch,
      energy: deadline.energy,
      radius: 0.6 + deadline.energy * 0.12,
      tubeRadius: 0.085,
      color: AURORA_COLORS[((Math.round(deadline.representativePitch) % 12) + 12) % 12 % AURORA_COLORS.length]!,
    };
    route.push(segment);
    coils.push(coil);
    familyCounts[selected.family] += 1;
    state = segment.end;
    t0 = deadline.t;
    previousAxis = coil.axis;
  }
  if (t0 < song.meta.durationSec) {
    const field = { electric: [0, 0, 0] as AuroraVec3, magnetic: [0, 0, 0] as AuroraVec3 };
    const end = auroraPropagateConstantField(state, field, song.meta.durationSec - t0, { charge: plan.options.charge, mass: plan.options.mass });
    route.push({ id: "aurora-segment:tail", kind: "tail", t0, t1: song.meta.durationSec, start: state, end, field, charge: plan.options.charge, mass: plan.options.mass, turnAngle: 0, fieldMagnitude: 0, family: "tail" });
  }
  const spacing = coils.length > 1
    ? Math.min(...coils.slice(1).map((coil, index) => distance(coil.center, coils[index]!.center)))
    : null;
  const occupancy = certifyAuroraOccupancy(route, coils, 0.18);
  const routeReport = {
    deadlineCount: plan.deadlines.length,
    segmentCount: route.length,
    maximumField: Math.max(0, ...route.map((segment) => segment.fieldMagnitude)),
    maximumRouteRadius: Math.max(0, ...route.flatMap((segment) => [auroraLength(segment.start.position), auroraLength(segment.end.position)])),
    minimumCoilSpacing: spacing,
    minimumCoilSurfaceClearance: occupancy.minimumCoilSurfaceClearance,
    minimumParticleClearance: occupancy.minimumParticleClearance,
    exactCrossingError: Math.max(0, ...coils.map((coil, index) => distance(coil.center, route[index]!.end.position))),
    familyCounts,
    occupancyViolations: occupancy.violations,
    warnings: [
      ...(spacing !== null && spacing < plan.options.minimumCoilSpacing ? [`Minimum coil spacing ${spacing.toFixed(4)} is below requested ${plan.options.minimumCoilSpacing.toFixed(4)}`] : []),
      ...(occupancy.violations.length ? [`${occupancy.violations.length} global occupancy violations remain`] : []),
    ],
  };
  return {
    schemaVersion: 1,
    concept: "aurora-cyclotron",
    seed: plan.options.seed,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: 1080, h: 1920 },
    palette: { bg: "#030912", roles: { particle: "#f8ffff", aurora: "#6fffe9", coil: "#8ca0ad", discharge: "#f1d27a" } },
    camera: [{ t: 0, pos: [8, 6, 12], zoom: 1 }],
    curves: { energy: song.master.energy },
    events: coils.map((coil) => ({ t: coil.t, type: "aurora.coil-crossing", layer: "coils", params: { coilId: coil.id, deadlineId: coil.deadlineId, pitch: coil.pitch } })),
    statics: { sourceTrackId: plan.report.sourceTrackId, planReport: plan.report, routeReport, particleRadius: 0.18, coils, route },
  };
}
