import { sampleCurve, smoothCurve, type Song, type TimedCurve } from "@reaper-viz/core";

export interface VocalHaloResult {
  curve: TimedCurve;
  source: "vocal-rms" | "none";
}

function isVocalRole(role: string): boolean {
  const normalized = role.toLowerCase();
  return ["vocal", "vocals", "voice", "vox"].some((needle) => normalized.includes(needle));
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (!sorted.length) return 0;
  const position = Math.max(0, Math.min(sorted.length - 1, fraction * (sorted.length - 1)));
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const alpha = position - low;
  return (sorted[low] ?? 0) * (1 - alpha) + (sorted[high] ?? 0) * alpha;
}

function normalize(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const low = percentile(sorted, 0.1);
  const high = percentile(sorted, 0.92);
  const range = high - low;
  return values.map((value) => range > 1e-6 ? Math.max(0, Math.min(1, (value - low) / range)) : 0);
}

export function compileVocalHalo(song: Song): VocalHaloResult {
  const vocalTracks = song.tracks.filter((track) => isVocalRole(track.role));
  const base = song.master.energy;
  if (!vocalTracks.length) return { source: "none", curve: { ...base, values: base.values.map(() => 0) } };
  const values = base.values.map((_, index) => {
    const t = base.t0 + index * base.dt;
    return Math.max(...vocalTracks.map((track) => sampleCurve(track.curves.rms, t)));
  });
  const normalized = normalize(values);
  return {
    source: "vocal-rms",
    curve: smoothCurve({ t0: base.t0, dt: base.dt, values: normalized }, Math.max(1, Math.round(0.12 / base.dt))),
  };
}
