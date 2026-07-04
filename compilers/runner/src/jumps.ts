import { sampleCurve, type PerformanceEvent, type Song, type TimedCurve } from "@reaper-viz/core";
import { sampleTerrain } from "./terrain.js";
import type { RunnerAirSegment, RunnerJumpReport, RunnerTerrain, RunnerTrajectorySegment } from "./types.js";

interface Landing { t: number; velocity: number; source: string; }
interface JumpCompilation { segments: RunnerTrajectorySegment[]; events: PerformanceEvent[]; reports: RunnerJumpReport[]; source: string; }

function localBeatDuration(song: Song, t: number): number {
  const beats = song.grid.beats;
  if (beats.length < 2) return 0.5;
  let index = 0;
  for (let cursor = 1; cursor < beats.length; cursor += 1) {
    if (beats[cursor]! > t) break;
    index = cursor;
  }
  if (index < beats.length - 1) return Math.max(0.05, beats[index + 1]! - beats[index]!);
  return Math.max(0.05, beats[index]! - beats[index - 1]!);
}

export function selectRunnerLandings(song: Song): { landings: Landing[]; source: string } {
  const fallbacks = ["snare", "clap", "percussion", "kick"];
  let selected: Landing[] = [];
  let source = "bar-downbeats";
  for (const role of fallbacks) {
    const track = song.tracks.find((candidate) => candidate.role.toLowerCase() === role || candidate.name.toLowerCase().includes(role));
    const hits = track?.events.filter((event) => event.kind === "onset" || event.kind === "note") ?? [];
    if (hits.length) {
      selected = hits.map((event) => ({ t: event.t, velocity: event.vel, source: role }));
      source = role;
      break;
    }
  }
  if (!selected.length) selected = song.grid.downbeats.map((t) => ({ t, velocity: 1, source }));
  const budgeted: Landing[] = [];
  for (const bar of song.grid.bars) {
    const candidates = selected.filter((hit) => hit.t >= bar.startSec && hit.t < bar.endSec)
      .sort((a, b) => b.velocity - a.velocity || a.t - b.t).slice(0, 2).sort((a, b) => a.t - b.t);
    budgeted.push(...candidates);
  }
  return { landings: budgeted.sort((a, b) => a.t - b.t), source };
}

export function solveJump(
  takeoffT: number,
  landingT: number,
  beatDuration: number,
  y0: number,
  y1: number,
  clearanceBoost = 0,
): RunnerAirSegment {
  const duration = landingT - takeoffT;
  const gravity = 8 * 3.2 / (beatDuration * beatDuration);
  const vy0 = (y1 - y0) / duration + gravity * duration / 2;
  return { kind: "air", t0: takeoffT, t1: landingT, y0, y1, gravity, vy0, clearanceBoost, landingT };
}

export function airHeight(segment: RunnerAirSegment, t: number): { y: number; vy: number } {
  const duration = segment.t1 - segment.t0;
  const tau = Math.max(0, Math.min(duration, t - segment.t0));
  const u = duration > 0 ? tau / duration : 0;
  const boost = 4 * segment.clearanceBoost * u * (1 - u);
  const boostVelocity = duration > 0 ? 4 * segment.clearanceBoost * (1 - 2 * u) / duration : 0;
  return {
    y: segment.y0 + segment.vy0 * tau - 0.5 * segment.gravity * tau * tau + boost,
    vy: segment.vy0 - segment.gravity * tau + boostVelocity,
  };
}

function clearanceDeficit(segment: RunnerAirSegment, xCurve: TimedCurve, terrain: RunnerTerrain): number {
  let deficit = 0;
  for (let t = segment.t0 + 0.04; t <= segment.t1 - 0.04; t += 1 / 120) {
    const clearance = airHeight(segment, t).y - sampleTerrain(terrain, sampleCurve(xCurve, t));
    deficit = Math.max(deficit, 0.4 - clearance);
  }
  return deficit;
}

function requiredBoost(segment: RunnerAirSegment, xCurve: TimedCurve, terrain: RunnerTerrain): number {
  let boost = 0;
  const duration = segment.t1 - segment.t0;
  for (let t = segment.t0 + 0.04; t <= segment.t1 - 0.04; t += 1 / 120) {
    const u = (t - segment.t0) / duration;
    const shape = 4 * u * (1 - u);
    if (shape <= 1e-6) continue;
    const clearance = airHeight(segment, t).y - sampleTerrain(terrain, sampleCurve(xCurve, t));
    boost = Math.max(boost, (0.4 - clearance) / shape);
  }
  return Math.max(0, boost + 0.01);
}

export function compileJumps(song: Song, xCurve: TimedCurve, terrain: RunnerTerrain): JumpCompilation {
  const selection = selectRunnerLandings(song);
  const air: RunnerAirSegment[] = [];
  const events: PerformanceEvent[] = [];
  const reports: RunnerJumpReport[] = [];
  let previousLanding = 0;
  for (const landing of selection.landings) {
    if (landing.t <= 0 || landing.t >= song.meta.durationSec) continue;
    const beatDuration = localBeatDuration(song, landing.t);
    let chosen: { segment: RunnerAirSegment; durationBeats: number } | undefined;
    let fallback: { segment: RunnerAirSegment; durationBeats: number } | undefined;
    for (const durationBeats of [1, 0.5, 1.5, 2]) {
      const step = beatDuration / 16;
      const rawTakeoff = landing.t - durationBeats * beatDuration;
      const takeoffT = Math.max(0, Math.floor((rawTakeoff + 1e-8) / step) * step);
      if (takeoffT < previousLanding + beatDuration * 0.25) continue;
      const y0 = sampleTerrain(terrain, sampleCurve(xCurve, takeoffT));
      const y1 = sampleTerrain(terrain, sampleCurve(xCurve, landing.t));
      const segment = solveJump(takeoffT, landing.t, beatDuration, y0, y1);
      fallback ??= { segment, durationBeats };
      if (clearanceDeficit(segment, xCurve, terrain) <= 1e-6) { chosen = { segment, durationBeats }; break; }
    }
    if (!chosen && fallback) {
      const clearanceBoost = requiredBoost(fallback.segment, xCurve, terrain);
      chosen = { segment: { ...fallback.segment, clearanceBoost }, durationBeats: fallback.durationBeats };
    }
    if (!chosen) {
      events.push({ t: landing.t, type: "ground.pulse", layer: "runner", params: { hitT: landing.t, source: landing.source } });
      continue;
    }
    air.push(chosen.segment);
    previousLanding = landing.t;
    reports.push({ landingT: landing.t, takeoffT: chosen.segment.t0, durationBeats: chosen.durationBeats, clearanceBoost: chosen.segment.clearanceBoost, source: landing.source });
    events.push(
      { t: chosen.segment.t0, type: "jump.takeoff", layer: "runner", params: { hitT: landing.t } },
      { t: landing.t, type: "jump.land", layer: "runner", params: { hitT: landing.t } },
    );
  }
  const segments: RunnerTrajectorySegment[] = [];
  let cursor = 0;
  for (const segment of air) {
    if (segment.t0 > cursor) segments.push({ kind: "ground", t0: cursor, t1: segment.t0 });
    segments.push(segment);
    cursor = segment.t1;
  }
  if (cursor < song.meta.durationSec) segments.push({ kind: "ground", t0: cursor, t1: song.meta.durationSec });
  return { segments, events: events.sort((a, b) => a.t - b.t), reports, source: selection.source };
}

export function evaluateTrajectory(
  segments: readonly RunnerTrajectorySegment[],
  t: number,
  xCurve: TimedCurve,
  terrain: RunnerTerrain,
): { x: number; y: number; vy: number; grounded: boolean } {
  const x = sampleCurve(xCurve, t);
  const airborne = segments.find((candidate) => candidate.kind === "air" && t >= candidate.t0 - 1e-9 && t < candidate.t1 - 1e-9);
  if (airborne?.kind === "air") {
    const pose = airHeight(airborne, t);
    return { x, y: pose.y, vy: pose.vy, grounded: false };
  }
  return { x, y: sampleTerrain(terrain, x), vy: 0, grounded: true };
}
