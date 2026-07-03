import { sampleCurve } from "./curve.js";
import type { Song, SongBar, SongEvent, SongSection } from "./types.js";

export interface EventQuery { role?: string; kind?: SongEvent["kind"]; within?: SongSection; }

function floorIndex(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((sorted[middle] ?? Number.POSITIVE_INFINITY) <= value) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

export class MusicalTime {
  readonly #song: Song;

  constructor(song: Song) { this.#song = song; }

  beatAt(t: number): number { return floorIndex(this.#song.grid.beats, t); }

  barAt(t: number): SongBar | undefined {
    const starts = this.#song.grid.bars.map((bar) => bar.startSec);
    const bar = this.#song.grid.bars[floorIndex(starts, t)];
    return bar && t <= bar.endSec + 1e-9 ? bar : undefined;
  }

  timeOfBar(index: number): number {
    const bar = this.#song.grid.bars[index];
    if (!bar) throw new RangeError(`Unknown bar index ${index}`);
    return bar.startSec;
  }

  quantize(t: number, division: "1/4" | "1/8" | "1/16"): number {
    const beats = this.#song.grid.beats;
    if (beats.length < 2) return beats[0] ?? 0;
    const beatIndex = Math.min(floorIndex(beats, t), beats.length - 2);
    const start = beats[beatIndex] ?? 0;
    const end = beats[beatIndex + 1] ?? start;
    const subdivisions = Number(division.slice(2)) / 4;
    const step = (end - start) / subdivisions;
    return Math.max(0, Math.min(this.#song.meta.contentEndSec, start + Math.round((t - start) / step) * step));
  }

  phase(t: number, unit: "beat" | "bar"): number {
    if (unit === "bar") {
      const bar = this.barAt(t);
      return bar ? Math.max(0, Math.min(1, (t - bar.startSec) / (bar.endSec - bar.startSec))) : 0;
    }
    const beats = this.#song.grid.beats;
    if (beats.length < 2) return 0;
    const index = Math.min(floorIndex(beats, t), beats.length - 2);
    const start = beats[index] ?? 0;
    const end = beats[index + 1] ?? start + 1;
    return Math.max(0, Math.min(1, (t - start) / (end - start)));
  }

  sections(): readonly SongSection[] { return this.#song.sections; }

  sectionAt(t: number): SongSection | undefined {
    return this.#song.sections.find((section) => t >= section.startSec && t < section.endSec);
  }

  repeatsOf(section: SongSection | string): SongSection[] {
    const group = typeof section === "string" ? section : section.repeatGroup;
    return this.#song.sections.filter((candidate) => candidate.repeatGroup === group);
  }

  events(query: EventQuery = {}): Array<SongEvent & { trackId: string; role: string }> {
    const start = query.within?.startSec ?? Number.NEGATIVE_INFINITY;
    const end = query.within?.endSec ?? Number.POSITIVE_INFINITY;
    return this.#song.tracks
      .filter((track) => query.role === undefined || track.role === query.role)
      .flatMap((track) => track.events
        .filter((event) => (query.kind === undefined || event.kind === query.kind) && event.t >= start && event.t < end)
        .map((event) => ({ ...event, trackId: track.id, role: track.role })))
      .sort((a, b) => a.t - b.t || a.trackId.localeCompare(b.trackId));
  }

  energyAt(t: number): number { return sampleCurve(this.#song.master.energy, t); }
}
