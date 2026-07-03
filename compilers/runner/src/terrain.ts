import { sampleCurve, type Song, type SongTrack, type TimedCurve } from "@reaper-viz/core";
import type { RunnerTerrain } from "./types.js";

function percentile(sorted: readonly number[], fraction: number): number {
  if (!sorted.length) return 0;
  const position = Math.max(0, Math.min(sorted.length - 1, fraction * (sorted.length - 1)));
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const alpha = position - low;
  return (sorted[low] ?? 0) * (1 - alpha) + (sorted[high] ?? 0) * alpha;
}

function masterSignal(song: Song, t: number): number {
  const waveform = song.master.waveform;
  const index = Math.max(0, Math.min(waveform.max.length - 1, Math.floor(t * waveform.peaksPerSec)));
  const peak = Math.max(Math.abs(waveform.min[index] ?? 0), Math.abs(waveform.max[index] ?? 0));
  return peak * 0.7 + sampleCurve(song.master.energy, t) * 0.3;
}

function midiSignal(track: SongTrack, t: number): number {
  const notes = track.events.filter((event) => event.kind === "note" && event.pitch !== null && event.dur > 0);
  const active = notes.find((event) => t >= event.t && t <= event.t + event.dur);
  if (active?.pitch !== null && active?.pitch !== undefined) return active.pitch;
  let previous = notes[0];
  let next = notes[notes.length - 1];
  for (const note of notes) {
    if (note.t + note.dur <= t) previous = note;
    if (note.t >= t) { next = note; break; }
  }
  if (previous?.pitch === null || previous?.pitch === undefined) return next?.pitch ?? 0;
  if (next?.pitch === null || next?.pitch === undefined) return previous.pitch;
  const gapStart = previous.t + previous.dur;
  const gapLength = Math.max(1e-6, next.t - gapStart);
  const alpha = Math.max(0, Math.min(1, (t - gapStart) / gapLength));
  const eased = (1 - Math.cos(Math.PI * alpha)) / 2;
  return previous.pitch * (1 - eased) + next.pitch * eased;
}

function selectTerrainSignal(song: Song): { source: RunnerTerrain["source"]; sample(t: number): number } {
  const bass = song.tracks.find((track) => track.role.toLowerCase() === "bass");
  const notes = bass?.events.filter((event) => event.kind === "note" && event.pitch !== null && event.dur > 0) ?? [];
  if (bass && notes.length) return { source: "bass-midi", sample: (t) => midiSignal(bass, t) };
  if (bass?.curves.pitch?.values.length) return { source: "bass-pitch", sample: (t) => sampleCurve(bass.curves.pitch!, t) };
  return { source: "master-envelope", sample: (t) => masterSignal(song, t) };
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

export function compileTerrain(song: Song, tAtX: TimedCurve, worldLength: number): RunnerTerrain {
  const dx = 0.25;
  const hMin = 0;
  const hMax = 14;
  const maxSlope = Math.tan(55 * Math.PI / 180);
  const count = Math.floor(worldLength / dx) + 1;
  const selected = selectTerrainSignal(song);
  const rawSignal = Array.from({ length: count }, (_, index) => {
    const t = sampleCurve(tAtX, index * dx);
    return selected.sample(t);
  });
  const signal = selected.source === "master-envelope" ? smooth(rawSignal, 4) : rawSignal;
  const sorted = [...signal].sort((a, b) => a - b);
  const low = percentile(sorted, 0.1);
  const high = percentile(sorted, 0.9);
  const range = high - low;
  const heights = signal.map((value) => {
    const normalized = range > 1e-6 ? (value - low) / range : 0.5;
    return hMin + Math.max(0, Math.min(1, normalized)) * (hMax - hMin);
  });
  const maxDelta = maxSlope * dx;
  for (let index = 1; index < heights.length; index += 1) {
    const previous = heights[index - 1] ?? 0;
    heights[index] = Math.max(previous - maxDelta, Math.min(previous + maxDelta, heights[index] ?? previous));
  }
  for (let index = heights.length - 2; index >= 0; index -= 1) {
    const following = heights[index + 1] ?? 0;
    heights[index] = Math.max(following - maxDelta, Math.min(following + maxDelta, heights[index] ?? following));
  }
  return { dx, heights: heights.map((value) => Number(value.toFixed(6))), source: selected.source, hMin, hMax, maxSlope };
}

export function sampleTerrain(terrain: RunnerTerrain, x: number): number {
  const position = Math.max(0, x / terrain.dx);
  const low = Math.min(terrain.heights.length - 1, Math.floor(position));
  const high = Math.min(terrain.heights.length - 1, low + 1);
  const alpha = position - Math.floor(position);
  const a = terrain.heights[low] ?? 0;
  const b = terrain.heights[high] ?? a;
  return a + (b - a) * alpha;
}
