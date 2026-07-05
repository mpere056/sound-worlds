export interface TimedCurve {
  t0: number;
  dt: number;
  values: number[];
}

export interface SongEvent {
  t: number;
  dur: number;
  pitch: number | null;
  vel: number;
  kind: "note" | "onset";
}

export interface SongTrack {
  id: string;
  name: string;
  role: string;
  events: SongEvent[];
  curves: { rms: TimedCurve; centroid: TimedCurve; pitch: TimedCurve | null };
  gain?: { peakRms: number; meanRms: number };
  spectra: Array<{ t: number; bands: number[] }>;
}

export interface SongBar {
  index: number;
  startSec: number;
  endSec: number;
}

export interface SongSection {
  name: string;
  kind: "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "drop" | "breakdown" | "solo" | "outro" | "unknown";
  startSec: number;
  endSec: number;
  repeatGroup: string;
  energy: number;
}

export interface Song {
  schemaVersion: 1;
  meta: {
    name: string;
    seed: string;
    analysisHash: string;
    contentEndSec: number;
    durationSec: number;
    key: Record<string, unknown> | null;
  };
  grid: { beats: number[]; downbeats: number[]; bars: SongBar[] };
  sections: SongSection[];
  tracks: SongTrack[];
  master: {
    energy: TimedCurve;
    waveform: { peaksPerSec: number; min: number[]; max: number[] };
    spectrogram: Record<string, unknown> | null;
    chords: Array<Record<string, unknown>>;
    loudestHit: { t: number; trackId: string };
  };
}

export interface PerformanceEvent {
  t: number;
  tEnd?: number;
  type: string;
  layer: string;
  params: Record<string, unknown>;
}

export interface CameraKeyframe {
  t: number;
  pos: [number, number, number];
  zoom: number;
  anchor?: [number, number];
  ease?: string;
}

export interface Performance {
  schemaVersion: 1;
  concept: string;
  seed: string;
  durationSec: number;
  fps: number;
  resolution: { w: number; h: number };
  palette: { bg: string; roles: Record<string, string> };
  camera: CameraKeyframe[];
  curves: Record<string, TimedCurve>;
  events: PerformanceEvent[];
  statics: Record<string, unknown>;
}

export type Tuning = Record<string, string | number | boolean>;
