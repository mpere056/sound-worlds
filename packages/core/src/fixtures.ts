import type { Song, SongEvent, SongSection, SongTrack } from "./types.js";

export interface RolePattern {
  role: string;
  beats: number[];
  pitch?: number;
  velocity?: number;
  kind?: SongEvent["kind"];
}

export interface FixtureSongOptions {
  name?: string;
  bpm?: number;
  bars?: number;
  beatsPerBar?: number;
  patterns?: RolePattern[];
}

const FIXTURE_HASH = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

export function buildFixtureSong(options: FixtureSongOptions = {}): Song {
  const bpm = options.bpm ?? 120;
  const barCount = options.bars ?? 8;
  const beatsPerBar = options.beatsPerBar ?? 4;
  if (!(bpm > 0) || barCount < 1 || beatsPerBar < 1) throw new RangeError("Invalid fixture timing");
  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * beatsPerBar;
  const duration = barCount * barDuration;
  const beats = Array.from({ length: barCount * beatsPerBar }, (_, index) => index * beatDuration);
  const bars = Array.from({ length: barCount }, (_, index) => ({
    index, startSec: index * barDuration, endSec: (index + 1) * barDuration,
  }));
  const sections: SongSection[] = barCount === 8 ? [
    { name: "Verse 1", kind: "verse", startSec: 0, endSec: 2 * barDuration, repeatGroup: "verse", energy: 0.45 },
    { name: "Chorus 1", kind: "chorus", startSec: 2 * barDuration, endSec: 4 * barDuration, repeatGroup: "chorus", energy: 0.85 },
    { name: "Verse 2", kind: "verse", startSec: 4 * barDuration, endSec: 6 * barDuration, repeatGroup: "verse", energy: 0.55 },
    { name: "Chorus 2", kind: "chorus", startSec: 6 * barDuration, endSec: duration, repeatGroup: "chorus", energy: 0.9 },
  ] : [
    { name: "Song", kind: "unknown", startSec: 0, endSec: duration, repeatGroup: "song", energy: 0.6 },
  ];
  const patterns = options.patterns ?? [
    { role: "kick", beats: [0, 2], velocity: 1, kind: "onset" },
    { role: "snare", beats: [1, 3], velocity: 0.85, kind: "onset" },
    { role: "lead", beats: [0, 1, 2, 3], pitch: 64, velocity: 0.75, kind: "note" },
  ];
  const curveValues = Array.from({ length: Math.ceil(duration / 0.02) + 1 }, () => 0.5);
  const tracks: SongTrack[] = patterns.map((pattern, trackIndex) => {
    const events: SongEvent[] = [];
    for (let bar = 0; bar < barCount; bar += 1) {
      for (const beat of pattern.beats) {
        events.push({
          t: bar * barDuration + beat * beatDuration,
          dur: pattern.kind === "note" ? beatDuration * 0.75 : 0,
          pitch: pattern.kind === "note" ? (pattern.pitch ?? 60) : null,
          vel: pattern.velocity ?? 0.8,
          kind: pattern.kind ?? "onset",
        });
      }
    }
    return {
      id: `{FIXTURE-${trackIndex}-${pattern.role.toUpperCase()}}`,
      name: pattern.role, role: pattern.role, events,
      curves: {
        rms: { t0: 0, dt: 0.02, values: [...curveValues] },
        centroid: { t0: 0, dt: 0.02, values: [...curveValues] }, pitch: null,
      },
      spectra: [],
    };
  });
  return {
    schemaVersion: 1,
    meta: { name: options.name ?? "fixture-song", seed: FIXTURE_HASH, analysisHash: FIXTURE_HASH, contentEndSec: duration, durationSec: duration, key: null },
    grid: { beats, downbeats: bars.map((bar) => bar.startSec), bars }, sections, tracks,
    master: {
      energy: { t0: 0, dt: 0.02, values: curveValues },
      waveform: { peaksPerSec: 20, min: [0], max: [0] }, spectrogram: null, chords: [],
      loudestHit: { t: 0, trackId: tracks[0]?.id ?? "fixture" },
    },
  };
}
