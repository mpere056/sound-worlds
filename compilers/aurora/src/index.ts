import type { Song, SongEvent, SongTrack } from "@reaper-viz/core";
import type { AuroraCompileOptions, AuroraCompileReport, AuroraDeadline, AuroraNote, AuroraPlan, AuroraResolvedOptions } from "./types.js";

export * from "./types.js";
export * from "./physics.js";

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
