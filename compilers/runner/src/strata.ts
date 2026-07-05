import { sampleCurve, type Song, type SongTrack, type TimedCurve } from "@reaper-viz/core";
import { sampleTerrain } from "./terrain.js";
import type { RunnerStratum, RunnerTerrain } from "./types.js";

const MAX_STRATA = 5;

function mean(values: readonly number[]): number {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (!sorted.length) return 0;
  const position = Math.max(0, Math.min(sorted.length - 1, fraction * (sorted.length - 1)));
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const alpha = position - low;
  return (sorted[low] ?? 0) * (1 - alpha) + (sorted[high] ?? 0) * alpha;
}

function smooth(values: readonly number[], radius: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length, index + radius + 1);
    let total = 0;
    for (let cursor = start; cursor < end; cursor += 1) total += values[cursor] ?? 0;
    return total / (end - start);
  });
}

function normalizedWave(track: SongTrack, tAtX: TimedCurve, count: number, dx: number): number[] {
  const raw = Array.from({ length: count }, (_, index) => sampleCurve(track.curves.rms, sampleCurve(tAtX, index * dx)));
  const signal = smooth(raw, 5);
  const sorted = [...signal].sort((a, b) => a - b);
  const low = percentile(sorted, 0.1);
  const high = percentile(sorted, 0.9);
  const range = high - low;
  return signal.map((value) => range > 1e-6 ? Math.max(0, Math.min(1, (value - low) / range)) : 0.5);
}

export function compileStrata(song: Song, terrain: RunnerTerrain, tAtX: TimedCurve, worldLength: number): RunnerStratum[] {
  const dx = terrain.dx;
  const count = Math.floor(worldLength / dx) + 1;
  const ranked = song.tracks
    .map((track, index) => ({ track, index, energy: track.gain?.meanRms ?? mean(track.curves.rms.values) }))
    .filter((candidate) => candidate.track.curves.rms.values.length > 0)
    .sort((a, b) => b.energy - a.energy || a.index - b.index)
    .slice(0, MAX_STRATA);

  return ranked.map(({ track, energy }, index) => {
    const wave = normalizedWave(track, tAtX, count, dx);
    const depth = 0.95 + index * 0.92;
    const amplitude = 0.28 + Math.min(0.7, energy) * 0.55;
    const edge = wave.map((value, pointIndex) => {
      const x = pointIndex * dx;
      return Number((sampleTerrain(terrain, x) - depth - amplitude * value).toFixed(6));
    });
    return {
      id: `stratum-${index}-${track.role}`,
      trackId: track.id,
      role: track.role,
      dx,
      depth: Number(depth.toFixed(6)),
      amplitude: Number(amplitude.toFixed(6)),
      edge,
    };
  });
}
