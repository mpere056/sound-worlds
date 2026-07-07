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
const NORMAL_TRAVEL = 0.7;
const EPS = 1e-6;
const PITCH_COLORS = ["#6ee7ff", "#8df5c8", "#f7d06a", "#ff9bd6", "#9ea7ff", "#f4fbff", "#7affd7", "#ffb86b", "#c2ff72", "#b9d8ff", "#ffd1f2", "#d8f6ff"];

interface SelectedTrack {
  track: SongTrack;
  notes: SongEvent[];
  mode: "auto" | "manual";
  reason: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  if (gap < NORMAL_TRAVEL) return "rail";
  return "arc";
}

function targetKind(kind: MarbleClusterKind, noteIndex: number): MarbleTarget["kind"] {
  if (kind === "rattle") return "peg";
  if (kind === "cascade") return "chime";
  if (kind === "roll") return noteIndex % 3 === 0 ? "resonator" : "plate";
  return noteIndex % 5 === 4 ? "resonator" : "plate";
}

function compileTargets(notes: readonly SongEvent[], metrics: MarbleTrackMetrics): MarbleTarget[] {
  const span = Math.max(1, metrics.pitchRange);
  const byPitch = new Map<number, number>();
  return notes.map((note, index) => {
    const pitch = note.pitch ?? metrics.pitchMin;
    const pitchNorm = (pitch - metrics.pitchMin) / span;
    const timeNorm = notes.length <= 1 ? 0.5 : index / (notes.length - 1);
    const gap = index > 0 ? note.t - notes[index - 1]!.t : null;
    const kind = clusterKind(gap);
    const repeated = byPitch.get(pitch) ?? 0;
    byPitch.set(pitch, repeated + 1);
    const side = index % 2 === 0 ? -1 : 1;
    const clusterCompact = kind === "rattle" || kind === "cascade";
    const x = (pitchNorm - 0.5) * 5.4 + side * (clusterCompact ? 0.12 : 0.55) + Math.sin(index * 1.7) * 0.22 + repeated * 0.08;
    const y = 7.2 - timeNorm * 13.6 + (pitchNorm - 0.5) * 1.1;
    const z = Math.sin(index * 0.91) * 0.34 + (clusterCompact ? 0.12 : 0);
    const pitchClass = ((pitch % 12) + 12) % 12;
    const target: MarbleTarget = {
      id: `target:${index}`,
      kind: targetKind(kind, index),
      pitch,
      pitchClass,
      pos: [Number(x.toFixed(4)), Number(y.toFixed(4)), Number(z.toFixed(4))],
      rotation: [0, 0, Number((side * 0.16 + Math.sin(index) * 0.08).toFixed(4))],
      size: [
        Number((0.7 + (1 - pitchNorm) * 0.36 + note.vel * 0.18).toFixed(4)),
        Number((0.16 + note.vel * 0.08).toFixed(4)),
        Number((0.38 + pitchNorm * 0.2).toFixed(4)),
      ],
      color: PITCH_COLORS[pitchClass] ?? "#d8f6ff",
      material: pitch < 45 ? "brass" : kind === "rattle" ? "rubber" : pitch > 72 ? "glow" : "painted-metal",
      familyId: `pitch:${pitch}`,
    };
    return target;
  });
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
  for (let index = 0; index < targets.length - 1; index += 1) {
    const from = targets[index]!;
    const to = targets[index + 1]!;
    const t0 = notes[index]!.t;
    const t1 = notes[index + 1]!.t;
    const gap = t1 - t0;
    if (gap <= EPS) {
      diagnostics.impossibleGaps.push({ noteIndex: index + 1, gap, resolution: "shared local rattle target with no travel segment" });
      continue;
    }
    const kind = pathKind(gap);
    if (kind === "rattle" || kind === "cascade") {
      diagnostics.impossibleGaps.push({ noteIndex: index + 1, gap, resolution: `${kind} local mechanism` });
    }
    const segment: MarblePathSegment = {
      id: `path:${path.length}`,
      t0,
      t1,
      from: from.pos,
      to: to.pos,
      kind,
      easing: kind === "arc" ? "ballistic" : kind === "rail" ? "smoothstep" : "linear",
      targetId: to.id,
    };
    const clusterId = clusterIdFor(clusters, index + 1);
    if (clusterId) segment.clusterId = clusterId;
    const mid: [number, number, number] = [
      Number(((from.pos[0] + to.pos[0]) / 2).toFixed(4)),
      Number((Math.max(from.pos[1], to.pos[1]) + (kind === "arc" ? 1.1 : 0.24)).toFixed(4)),
      Number(((from.pos[2] + to.pos[2]) / 2 + (kind === "arc" ? 0.7 : 0.12)).toFixed(4)),
    ];
    segment.control = mid;
    path.push(segment);
  }
  const last = targets[targets.length - 1]!;
  const lastNote = notes[notes.length - 1]!;
  const endT = Math.max(song.meta.durationSec, lastNote.t + 0.001);
  if (endT > lastNote.t + EPS) {
    path.push({
      id: `path:${path.length}`,
      t0: lastNote.t,
      t1: endT,
      from: last.pos,
      to: [Number((last.pos[0] + 0.18).toFixed(4)), Number((last.pos[1] - 0.34).toFixed(4)), last.pos[2]],
      kind: "settle",
      easing: "easeOut",
      targetId: last.id,
    });
  }
  if (path.length === 0) {
    path.push({
      id: "path:0",
      t0: 0,
      t1: song.meta.durationSec,
      from: last.pos,
      to: [last.pos[0], Number((last.pos[1] - 0.2).toFixed(4)), last.pos[2]],
      kind: "hold",
      easing: "easeOut",
      targetId: last.id,
    });
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

export function sampleMarblePath(path: readonly MarblePathSegment[], t: number): MarblePose {
  if (!path.length) return { pos: [0, 0, 0], segmentId: "none", kind: "hold", progress: 0 };
  const segment = path.find((entry) => t >= entry.t0 && t <= entry.t1) ?? (t < path[0]!.t0 ? path[0]! : path[path.length - 1]!);
  const duration = Math.max(EPS, segment.t1 - segment.t0);
  const raw = clamp((t - segment.t0) / duration, 0, 1);
  const progress = segment.easing === "smoothstep"
    ? raw * raw * (3 - 2 * raw)
    : segment.easing === "easeIn"
      ? raw * raw
      : segment.easing === "easeOut"
        ? 1 - (1 - raw) * (1 - raw)
        : raw;
  const arcLift = segment.easing === "ballistic" ? Math.sin(progress * Math.PI) * 0.8 : 0;
  const pos: [number, number, number] = [
    segment.from[0] + (segment.to[0] - segment.from[0]) * progress,
    segment.from[1] + (segment.to[1] - segment.from[1]) * progress + arcLift,
    segment.from[2] + (segment.to[2] - segment.from[2]) * progress + arcLift * 0.35,
  ];
  return { pos, segmentId: segment.id, kind: segment.kind, progress };
}

export function compileMarble(song: Song, options: CompileMarbleOptions = {}): MarblePerformance {
  const selected = selectTrack(song, options);
  const metrics = compileMetrics(selected.notes);
  const targets = compileTargets(selected.notes, metrics);
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
      compilerVersion: 1,
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
