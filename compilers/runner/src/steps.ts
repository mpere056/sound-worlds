import type { PerformanceEvent, Song } from "@reaper-viz/core";

const MIN_STEP_GAP_SEC = 0.16;

function compactTimes(times: number[]): number[] {
  const sorted = [...times].filter((time) => Number.isFinite(time) && time >= 0).sort((a, b) => a - b);
  const compact: number[] = [];
  for (const time of sorted) {
    if (compact.length === 0 || time - compact[compact.length - 1]! >= MIN_STEP_GAP_SEC) compact.push(time);
  }
  return compact;
}

function roleIsPercussive(role: string): boolean {
  const normalized = role.toLowerCase();
  return ["kick", "drums", "drum", "percussion", "perc"].some((needle) => normalized.includes(needle));
}

export function compileSteps(song: Song): PerformanceEvent[] {
  const kickTimes = compactTimes(song.tracks
    .filter((track) => roleIsPercussive(track.role))
    .flatMap((track) => track.events)
    .filter((event) => event.kind === "onset" || event.kind === "note")
    .map((event) => event.t));
  const source = kickTimes.length >= 2 ? "kick-events" : "beat-grid";
  const times = source === "kick-events" ? kickTimes : compactTimes(song.grid.beats);
  return times
    .filter((time) => time <= song.meta.durationSec + 1e-6)
    .map((time, index) => ({
      t: time,
      type: "runner.step",
      layer: "runner",
      params: {
        foot: index % 2 === 0 ? "left" : "right",
        hitT: time,
        source,
      },
    }));
}
