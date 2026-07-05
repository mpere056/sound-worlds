import { sampleCurve, type PerformanceEvent, type Song, type SongEvent, type TimedCurve } from "@reaper-viz/core";
import { evaluateTrajectory } from "./jumps.js";
import { sampleTerrain } from "./terrain.js";
import type { RunnerGlyph, RunnerNotePlatform, RunnerTerrain, RunnerTrajectorySegment } from "./types.js";

interface GlyphCandidate { event: SongEvent; source: "midi" | "audio-activity"; role: string; }

function melodyCandidates(song: Song): GlyphCandidate[] {
  const preferred = song.tracks.filter((track) => /lead|melody|keys|piano|synth|vocal/i.test(`${track.role} ${track.name}`));
  const pitchedTracks = (preferred.length ? preferred : song.tracks)
    .filter((track) => track.events.some((event) => event.kind === "note" && event.pitch !== null));
  const midi = pitchedTracks.flatMap((track) => track.events.map((event) => ({ event, role: track.role })))
    .filter((candidate) => candidate.event.kind === "note" && candidate.event.pitch !== null)
    .sort((a, b) => a.event.t - b.event.t || (a.event.pitch ?? 0) - (b.event.pitch ?? 0));
  if (midi.length) return midi.map(({ event, role }) => ({ event, role, source: "midi" }));

  const activityTrack = preferred[0] ?? song.tracks[0];
  return song.grid.beats.filter((t) => t > 0 && t < song.meta.durationSec).map((t) => ({
    source: "audio-activity" as const,
    role: activityTrack?.role ?? "other",
    event: {
      t,
      dur: 0,
      pitch: null,
      vel: activityTrack ? sampleCurve(activityTrack.curves.rms, t) : sampleCurve(song.master.energy, t),
      kind: "onset" as const,
    },
  }));
}

export function compileGlyphs(
  song: Song,
  xCurve: TimedCurve,
  terrain: RunnerTerrain,
  trajectory: readonly RunnerTrajectorySegment[],
): { glyphs: RunnerGlyph[]; events: PerformanceEvent[]; source: "midi" | "audio-activity" | "none" } {
  const candidates = melodyCandidates(song);
  if (!candidates.length) return { glyphs: [], events: [], source: "none" };
  const pitches = candidates.map(({ event }) => event.pitch).filter((pitch): pitch is number => pitch !== null);
  const pitchMin = Math.min(...pitches, 0);
  const pitchMax = Math.max(...pitches, pitchMin + 1);
  const glyphs: RunnerGlyph[] = [];
  const events: PerformanceEvent[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const mergeT = candidate.event.t;
    const beamStartT = Math.max(0, mergeT - 0.3);
    const activeBeams = glyphs.filter((glyph) => glyph.mode === "beam" && glyph.mergeT > beamStartT && glyph.beamStartT < mergeT).length;
    const mode = activeBeams < 6 ? "beam" : "sparkle";
    const x = sampleCurve(xCurve, mergeT);
    const pitchLevel = candidate.event.pitch === null
      ? Math.max(0, Math.min(1, candidate.event.vel))
      : (candidate.event.pitch - pitchMin) / Math.max(1, pitchMax - pitchMin);
    const pose = evaluateTrajectory(trajectory, mergeT, xCurve, terrain);
    const glyph: RunnerGlyph = {
      id: `glyph:${index}`,
      source: candidate.source,
      role: candidate.role,
      pitch: candidate.event.pitch,
      spawnPos: { x, y: sampleTerrain(terrain, x) + 1.5 + pitchLevel * 3.5 },
      mergePos: { x: pose.x, y: pose.y },
      mergeT,
      beamStartT,
      mode,
      colorIndex: candidate.event.pitch === null ? index % 12 : ((Math.round(candidate.event.pitch) % 12) + 12) % 12,
    };
    glyphs.push(glyph);
    events.push({
      t: mergeT,
      type: "glyph.merge",
      layer: "runner-glyphs",
      params: { hitT: mergeT, glyphId: glyph.id, pitch: glyph.pitch, source: glyph.source, role: glyph.role, mode },
    });
  }
  return { glyphs, events, source: glyphs[0]!.source };
}

export function compileNotePlatforms(glyphs: readonly RunnerGlyph[], terrain: RunnerTerrain): RunnerNotePlatform[] {
  return glyphs.map((glyph) => ({
    id: `platform:${glyph.id}`,
    t: glyph.mergeT,
    x: glyph.mergePos.x,
    y: sampleTerrain(terrain, glyph.mergePos.x),
    role: glyph.role,
    source: glyph.source,
    pitch: glyph.pitch,
    colorIndex: glyph.colorIndex,
    width: glyph.source === "midi" ? 1.18 : 0.92,
  }));
}
