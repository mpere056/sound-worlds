import { Rng, type Song, type SongEvent, type SongTrack } from "@reaper-viz/core";
import { buildVortexInteractions, certifyVortexLoomRoute } from "./certification.js";
import {
  integrateVortexRoute,
  sampleVortexLoomVelocity,
  sampleVortexRoute,
  vortexAdd,
  vortexLength,
  vortexNormalize,
  vortexPerpendicular,
  vortexRk4Step,
  vortexScale,
  vortexSub,
} from "./physics.js";
import type {
  VortexLoomBaseFlow,
  VortexLoomCompileOptions,
  VortexLoomCompileReport,
  VortexLoomDeadline,
  VortexLoomFiberCheckpoint,
  VortexLoomFiberLayout,
  VortexLoomNote,
  VortexLoomPerformance,
  VortexLoomPlan,
  VortexLoomResolvedOptions,
  VortexLoomRouteSample,
  VortexLoomVortex,
  VortexVec2,
} from "./types.js";

export * from "./types.js";
export * from "./physics.js";
export * from "./certification.js";

const DEFAULT_CHORD_EPSILON_SEC = 0.025;
const INITIAL_SHUTTLE: VortexVec2 = [0.28, 1.16];
const PIGMENTS = ["#8ed9d2", "#c7d7d2", "#b95445", "#d2ad59", "#80aeb6", "#d9d0bc"] as const;

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
    if (!track) throw new Error(`Vortex Loom source track not found: ${sourceTrackId}`);
    const notes = noteEvents(track);
    if (!notes.length) throw new Error(`Vortex Loom source track has no MIDI notes: ${track.name}`);
    return { track, notes, reason: `manual track override: ${track.name}` };
  }
  const candidates = song.tracks
    .map((track) => ({ track, notes: noteEvents(track) }))
    .filter((entry) => entry.notes.length)
    .map((entry) => ({ ...entry, score: trackScore(entry.track, entry.notes, song.meta.durationSec) }))
    .sort((left, right) => right.score - left.score || right.notes.length - left.notes.length || left.track.name.localeCompare(right.track.name) || left.track.id.localeCompare(right.track.id));
  const selected = candidates[0];
  if (!selected) throw new Error("Vortex Loom requires at least one note-bearing track");
  return { track: selected.track, notes: selected.notes, reason: `auto score ${selected.score.toFixed(3)}: ${selected.track.name}` };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function groupVortexLoomDeadlines(track: SongTrack, notes: readonly SongEvent[], chordEpsilonSec: number): VortexLoomDeadline[] {
  const groups: Array<{ t: number; notes: VortexLoomNote[] }> = [];
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
      id: `vortex-deadline:${index}:${group.t.toFixed(6)}:${signature}`,
      t: group.t,
      notes: ordered,
      representativePitch: median(ordered.map((note) => note.pitch)),
      energy: Math.max(...ordered.map((note) => note.velocity)),
      duration: Math.max(...ordered.map((note) => note.duration)),
    };
  });
}

function finiteRange(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be between ${minimum} and ${maximum}`);
  return value;
}

export function compileVortexLoomPlan(song: Song, options: VortexLoomCompileOptions = {}): VortexLoomPlan {
  const resolved: VortexLoomResolvedOptions = {
    ...(options.sourceTrackId ? { sourceTrackId: options.sourceTrackId } : {}),
    chordEpsilonSec: finiteRange(options.chordEpsilonSec ?? DEFAULT_CHORD_EPSILON_SEC, 0, 0.1, "Vortex Loom chord epsilon"),
    seed: options.seed ?? `${song.meta.seed}:vortex-loom`,
    fixedStepSec: finiteRange(options.fixedStepSec ?? 1 / 120, 1 / 1000, 1 / 30, "Vortex Loom fixed step"),
    checkpointCadenceSec: finiteRange(options.checkpointCadenceSec ?? 0.25, 0.05, 1, "Vortex Loom checkpoint cadence"),
    fiberCount: Math.round(finiteRange(options.fiberCount ?? 30, 8, 96, "Vortex Loom fiber count")),
    pointsPerFiber: Math.round(finiteRange(options.pointsPerFiber ?? 22, 8, 64, "Vortex Loom points per fiber")),
    chamberHalfWidth: 1,
    chamberHalfHeight: 1.7,
    baseDrift: -0.72,
    baseSwirl: 0.12,
  };
  const selected = selectTrack(song, resolved.sourceTrackId);
  const deadlines = groupVortexLoomDeadlines(selected.track, selected.notes, resolved.chordEpsilonSec);
  if (!deadlines.length) throw new Error("Vortex Loom requires at least one grouped deadline");
  const gaps = deadlines.slice(1).map((deadline, index) => deadline.t - deadlines[index]!.t);
  const report: VortexLoomCompileReport = {
    sourceTrackId: selected.track.id,
    sourceTrackName: selected.track.name,
    selectionReason: selected.reason,
    sourceNoteCount: selected.notes.length,
    groupedDeadlineCount: deadlines.length,
    compoundDeadlineCount: deadlines.filter((deadline) => deadline.notes.length > 1).length,
    firstDeadlineSec: deadlines[0]!.t,
    finalDeadlineSec: deadlines.at(-1)!.t,
    minimumGapSec: gaps.length ? Math.min(...gaps) : null,
    warnings: ["Q0 uses deterministic Lagrangian warp fibers; Eulerian dye remains deferred"],
  };
  return { schemaVersion: 1, concept: "vortex-loom-plan", durationSec: song.meta.durationSec, options: resolved, deadlines, report };
}

function baseFlowFor(plan: VortexLoomPlan): VortexLoomBaseFlow {
  return {
    chamberHalfWidth: plan.options.chamberHalfWidth,
    chamberHalfHeight: plan.options.chamberHalfHeight,
    drift: plan.options.baseDrift,
    swirl: plan.options.baseSwirl,
  };
}

function clampCenter(center: VortexVec2, baseFlow: VortexLoomBaseFlow): VortexVec2 {
  return [
    Math.max(-baseFlow.chamberHalfWidth + 0.12, Math.min(baseFlow.chamberHalfWidth - 0.12, center[0])),
    Math.max(-baseFlow.chamberHalfHeight + 0.12, Math.min(baseFlow.chamberHalfHeight - 0.12, center[1])),
  ];
}

function compileVortices(plan: VortexLoomPlan, baseFlow: VortexLoomBaseFlow): VortexLoomVortex[] {
  const vortices: VortexLoomVortex[] = [];
  const pitchValues = plan.deadlines.map((deadline) => deadline.representativePitch);
  const minimumPitch = Math.min(...pitchValues);
  const maximumPitch = Math.max(...pitchValues);
  const rng = new Rng(plan.options.seed).fork("vortex-layout");

  for (const [index, deadline] of plan.deadlines.entries()) {
    const previous = plan.deadlines[index - 1];
    const next = plan.deadlines[index + 1];
    const previousGap = deadline.t - (previous?.t ?? 0);
    const nextGap = next ? next.t - deadline.t : Math.max(0.5, plan.durationSec - deadline.t);
    const pitchUnit = maximumPitch - minimumPitch > 1e-6 ? (deadline.representativePitch - minimumPitch) / (maximumPitch - minimumPitch) : 0.5;
    const absoluteRegister = Math.max(0, Math.min(1, (deadline.representativePitch - 36) / 48));
    const register = pitchUnit * 0.72 + absoluteRegister * 0.28;
    const interval = deadline.representativePitch - (previous?.representativePitch ?? deadline.representativePitch + (index % 2 ? -2 : 2));
    const handedness: -1 | 1 = interval === 0 ? (index % 2 ? -1 : 1) : interval > 0 ? 1 : -1;
    const coreRadius = 0.007 + (1 - register) * 0.005;
    const desiredRadius = Math.min(0.11 + (1 - register) * 0.05, Math.max(coreRadius + 0.04, previousGap * 0.16));
    const circulation = handedness * (0.24 + deadline.energy * 0.4);
    const lead = Math.min(0.7, Math.max(0.08, previousGap * 0.58));
    const sideRatio = 0.05 + rng.float(0, 0.035);
    const activationStart = Math.max(previous ? previous.t + 2e-4 : 0, deadline.t - lead);
    const activationEnd = Math.min(plan.durationSec, deadline.t + Math.min(1.35, Math.max(0.22, nextGap * 0.72 + deadline.duration * 0.35)));
    const routeBefore = integrateVortexRoute(INITIAL_SHUTTLE, deadline.t, plan.options.fixedStepSec, baseFlow, vortices, plan.deadlines.slice(0, index + 1).map((entry) => entry.t));
    const stateBefore = sampleVortexRoute(routeBefore, deadline.t);
    const directionBefore = vortexNormalize(stateBefore.velocity);
    let center = clampCenter(vortexAdd(stateBefore.position, vortexScale(directionBefore, desiredRadius)), baseFlow);
    let candidate: VortexLoomVortex = {
      id: `vortex:${index}`,
      deadlineId: deadline.id,
      t: deadline.t,
      center,
      coreRadius,
      interactionRadius: desiredRadius,
      circulation,
      activationStart,
      activationPeak: deadline.t,
      activationEnd: Math.max(deadline.t + 1e-4, activationEnd),
      entryDirection: vortexScale(directionBefore, -1),
      handedness,
      pitch: deadline.representativePitch,
      energy: deadline.energy,
      duration: deadline.duration,
      stratum: Math.max(0, Math.min(4, Math.round(register * 4))),
      pigment: PIGMENTS[((Math.round(deadline.representativePitch) % 12) + 12) % 12 % PIGMENTS.length]!,
    };

    for (let iteration = 0; iteration < 14; iteration += 1) {
      const route = integrateVortexRoute(INITIAL_SHUTTLE, deadline.t, plan.options.fixedStepSec, baseFlow, [...vortices, candidate], plan.deadlines.slice(0, index + 1).map((entry) => entry.t));
      const state = sampleVortexRoute(route, deadline.t);
      const side = vortexScale(vortexPerpendicular(directionBefore), desiredRadius * handedness * sideRatio);
      const desiredCenter = clampCenter(vortexAdd(vortexAdd(state.position, vortexScale(directionBefore, desiredRadius)), side), baseFlow);
      center = [center[0] * 0.2 + desiredCenter[0] * 0.8, center[1] * 0.2 + desiredCenter[1] * 0.8];
      candidate = { ...candidate, center };
    }

    const finalRoute = integrateVortexRoute(INITIAL_SHUTTLE, deadline.t, plan.options.fixedStepSec, baseFlow, [...vortices, candidate], plan.deadlines.slice(0, index + 1).map((entry) => entry.t));
    const finalState = sampleVortexRoute(finalRoute, deadline.t);
    const radial = vortexSub(finalState.position, candidate.center);
    candidate = {
      ...candidate,
      interactionRadius: vortexLength(radial),
      entryDirection: vortexNormalize(radial),
    };
    vortices.push(candidate);
  }
  return vortices;
}

function initialFiberLayout(plan: VortexLoomPlan): VortexLoomFiberLayout {
  const positions: number[] = [];
  for (let fiber = 0; fiber < plan.options.fiberCount; fiber += 1) {
    const x = -0.88 + 1.76 * (fiber / Math.max(1, plan.options.fiberCount - 1));
    for (let point = 0; point < plan.options.pointsPerFiber; point += 1) {
      const y = -1.52 + 3.04 * (point / Math.max(1, plan.options.pointsPerFiber - 1));
      positions.push(x, y);
    }
  }
  return { fiberCount: plan.options.fiberCount, pointsPerFiber: plan.options.pointsPerFiber, initialPositions: positions };
}

function checkpointChecksum(values: readonly number[]): number {
  let hash = 2166136261;
  for (const value of values) {
    const quantized = Math.round(value * 1e6);
    hash ^= quantized;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function compileFiberCheckpoints(
  plan: VortexLoomPlan,
  baseFlow: VortexLoomBaseFlow,
  vortices: readonly VortexLoomVortex[],
  layout: VortexLoomFiberLayout,
): VortexLoomFiberCheckpoint[] {
  const positions = [...layout.initialPositions];
  const checkpoints: VortexLoomFiberCheckpoint[] = [{ t: 0, positions: [...positions], checksum: checkpointChecksum(positions) }];
  const transportStep = Math.min(1 / 60, plan.options.fixedStepSec * 2);
  let time = 0;
  for (let checkpointTime = plan.options.checkpointCadenceSec; checkpointTime < plan.durationSec + 1e-9; checkpointTime += plan.options.checkpointCadenceSec) {
    const target = Math.min(plan.durationSec, checkpointTime);
    while (time < target - 1e-12) {
      const step = Math.min(transportStep, target - time);
      for (let index = 0; index < positions.length; index += 2) {
        const next = vortexRk4Step([positions[index]!, positions[index + 1]!], time, step, baseFlow, vortices);
        positions[index] = next[0];
        positions[index + 1] = next[1];
      }
      time += step;
    }
    checkpoints.push({ t: target, positions: [...positions], checksum: checkpointChecksum(positions) });
    if (target >= plan.durationSec - 1e-9) break;
  }
  if (checkpoints.at(-1)!.t < plan.durationSec - 1e-9) {
    while (time < plan.durationSec - 1e-12) {
      const step = Math.min(transportStep, plan.durationSec - time);
      for (let index = 0; index < positions.length; index += 2) {
        const next = vortexRk4Step([positions[index]!, positions[index + 1]!], time, step, baseFlow, vortices);
        positions[index] = next[0];
        positions[index + 1] = next[1];
      }
      time += step;
    }
    checkpoints.push({ t: plan.durationSec, positions: [...positions], checksum: checkpointChecksum(positions) });
  }
  return checkpoints;
}

function curveValueAt(curve: { t0: number; dt: number; values: number[] }, time: number): number {
  if (!curve.values.length) return 0;
  const index = Math.max(0, Math.min(curve.values.length - 1, Math.round((time - curve.t0) / Math.max(1e-9, curve.dt))));
  return curve.values[index] ?? 0;
}

export function compileVortexLoom(song: Song, options: VortexLoomCompileOptions = {}): VortexLoomPerformance {
  const plan = compileVortexLoomPlan(song, options);
  const baseFlow = baseFlowFor(plan);
  const vortices = compileVortices(plan, baseFlow);
  const requiredTimes = plan.deadlines.map((deadline) => deadline.t);
  const route = integrateVortexRoute(INITIAL_SHUTTLE, plan.durationSec, plan.options.fixedStepSec, baseFlow, vortices, requiredTimes);
  const interactions = buildVortexInteractions(route, vortices);
  const fibers = initialFiberLayout(plan);
  const fiberCheckpoints = compileFiberCheckpoints(plan, baseFlow, vortices, fibers);
  const routeReport = certifyVortexLoomRoute(route, vortices, interactions, baseFlow, fiberCheckpoints.length);
  if (routeReport.violations.length) routeReport.warnings.push(`${routeReport.violations.length} Q0 certification violations remain visible in diagnostics`);
  return {
    schemaVersion: 1,
    concept: "vortex-loom",
    seed: plan.options.seed,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: 1080, h: 1920 },
    palette: {
      bg: "#04090a",
      roles: { fiber: "#b7d3cf", pigment: "#5eaaa5", shuttle: "#f2e8d0", vermilion: "#b95445", gold: "#d2ad59" },
    },
    camera: [{ t: 0, pos: [0, 0, 5.4], zoom: 1 }],
    curves: { energy: song.master.energy },
    events: interactions.map((interaction, index) => ({
      t: interaction.t,
      type: "vortex-loom.entry",
      layer: "flow",
      params: { interactionId: interaction.id, vortexId: interaction.vortexId, pitch: vortices[index]!.pitch, energy: vortices[index]!.energy },
    })),
    statics: {
      sourceTrackId: plan.report.sourceTrackId,
      planReport: plan.report,
      routeReport,
      baseFlow,
      vortices,
      route,
      interactions,
      fibers,
      fiberCheckpoints,
    },
  };
}

export function sampleVortexLoomShuttle(performance: VortexLoomPerformance, time: number): VortexLoomRouteSample {
  return sampleVortexRoute(performance.statics.route, time);
}

export function sampleVortexLoomFiberPositions(performance: VortexLoomPerformance, time: number): number[] {
  const checkpoints = performance.statics.fiberCheckpoints;
  if (!checkpoints.length) return [...performance.statics.fibers.initialPositions];
  if (time <= checkpoints[0]!.t) return [...checkpoints[0]!.positions];
  if (time >= checkpoints.at(-1)!.t) return [...checkpoints.at(-1)!.positions];
  let low = 0;
  let high = checkpoints.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (checkpoints[middle]!.t <= time) low = middle; else high = middle;
  }
  const left = checkpoints[low]!;
  const right = checkpoints[high]!;
  const q = (time - left.t) / Math.max(1e-9, right.t - left.t);
  return left.positions.map((value, index) => value + (right.positions[index]! - value) * q);
}

export function sampleVortexLoomMusicalState(performance: VortexLoomPerformance, time: number): { pulse: number; pressure: number; pitch: number; velocity: number; silence: number } {
  const vortices = performance.statics.vortices;
  if (!vortices.length) return { pulse: 0, pressure: 0, pitch: 0.5, velocity: 0, silence: 1 };
  const pitches = vortices.map((vortex) => vortex.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  let pulse = 0;
  let pressure = 0;
  let pitchSum = 0;
  let velocitySum = 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (const vortex of vortices) {
    const age = time - vortex.t;
    nearest = Math.min(nearest, Math.abs(age));
    const localPulse = Math.exp(-Math.abs(age) * 10) * (0.25 + vortex.energy * 0.75);
    pulse = Math.max(pulse, localPulse);
    if (age < 0) continue;
    const weight = (1 - Math.exp(-age / 0.07)) * Math.exp(-age / (0.5 + vortex.duration * 0.4)) * (0.3 + vortex.energy * 0.7);
    pressure += weight;
    const normalizedPitch = maxPitch - minPitch > 1e-6 ? (vortex.pitch - minPitch) / (maxPitch - minPitch) : 0.5;
    pitchSum += normalizedPitch * weight;
    velocitySum += vortex.energy * weight;
  }
  return {
    pulse: Math.min(1, pulse),
    pressure: Math.min(1, pressure * 0.55),
    pitch: pressure > 1e-6 ? pitchSum / pressure : 0.5,
    velocity: pressure > 1e-6 ? Math.min(1, velocitySum / pressure) : 0,
    silence: Math.max(0, Math.min(1, (nearest - 0.12) / 1.1)) * (1 - Math.min(1, pressure) * 0.25),
  };
}

export function sampleVortexLoomFieldVelocity(performance: VortexLoomPerformance, position: VortexVec2, time: number): VortexVec2 {
  return sampleVortexLoomVelocity(position, time, performance.statics.baseFlow, performance.statics.vortices);
}

export function vortexLoomContactStrength(vortex: VortexLoomVortex, time: number): number {
  const age = time - vortex.t;
  const preview = age < 0 ? Math.max(0, Math.min(1, (age + 3) / 3)) : 0;
  const contact = Math.exp(-Math.abs(age) * 8.5) * (0.3 + vortex.energy * 0.7);
  const tail = age >= 0 ? Math.exp(-age / Math.max(0.3, 0.55 + vortex.duration)) * 0.32 : 0;
  return Math.min(1, preview * 0.12 + contact + tail);
}

export function vortexLoomEnergyAt(performance: VortexLoomPerformance, time: number): number {
  const curve = performance.curves.energy;
  return curve ? curveValueAt(curve, time) : 0;
}
