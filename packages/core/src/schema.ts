import { z } from "zod";
import type { Performance, Song, Tuning } from "./types.js";

const finite = z.number().finite();
const unit = finite.min(0).max(1);
const unitCurve = z.object({ t0: finite.nonnegative(), dt: finite.positive(), values: z.array(unit) }).strict();
const numericCurve = z.object({ t0: finite.nonnegative(), dt: finite.positive(), values: z.array(finite) }).strict();
const event = z.object({
  t: finite.nonnegative(), dur: finite.nonnegative(), pitch: finite.nullable(), vel: unit,
  kind: z.enum(["note", "onset"]),
}).strict();
const sectionKind = z.enum(["intro", "verse", "prechorus", "chorus", "bridge", "drop", "breakdown", "solo", "outro", "unknown"]);
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const songSchema = z.object({
  schemaVersion: z.literal(1),
  meta: z.object({
    name: z.string().min(1), seed: hash, analysisHash: hash,
    contentEndSec: finite.positive(), durationSec: finite.positive(),
    key: z.record(z.unknown()).nullable(),
  }).strict(),
  grid: z.object({
    beats: z.array(finite.nonnegative()), downbeats: z.array(finite.nonnegative()),
    bars: z.array(z.object({ index: z.number().int().nonnegative(), startSec: finite.nonnegative(), endSec: finite.nonnegative() }).strict()),
  }).strict(),
  sections: z.array(z.object({
    name: z.string(), kind: sectionKind, startSec: finite.nonnegative(), endSec: finite.nonnegative(),
    repeatGroup: z.string(), energy: unit,
  }).strict()),
  tracks: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), role: z.string().min(1), events: z.array(event),
    curves: z.object({ rms: unitCurve, centroid: unitCurve, pitch: unitCurve.nullable() }).strict(),
    spectra: z.array(z.object({ t: finite.nonnegative(), bands: z.array(unit) }).passthrough()),
  }).strict()).min(1),
  master: z.object({
    energy: unitCurve,
    waveform: z.object({ peaksPerSec: z.number().int().positive(), min: z.array(finite.min(-1).max(1)), max: z.array(finite.min(-1).max(1)) }).strict(),
    spectrogram: z.record(z.unknown()).nullable(), chords: z.array(z.record(z.unknown())),
    loudestHit: z.object({ t: finite.nonnegative(), trackId: z.string().min(1) }).strict(),
  }).strict(),
}).strict();

export function parseSong(value: unknown): Song {
  return songSchema.parse(value) as Song;
}

const performanceEvent = z.object({
  t: finite.nonnegative(), tEnd: finite.nonnegative().optional(), type: z.string().min(1),
  layer: z.string(), params: z.record(z.unknown()),
}).strict().refine((event) => event.tEnd === undefined || event.tEnd >= event.t, "tEnd must not precede t");

export const performanceSchema = z.object({
  schemaVersion: z.literal(1), concept: z.string().min(1), seed: z.string().min(1),
  durationSec: finite.positive(), fps: finite.positive(),
  resolution: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }).strict(),
  palette: z.object({ bg: z.string().regex(/^#[0-9a-fA-F]{6}$/), roles: z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/)) }).strict(),
  camera: z.array(z.object({
    t: finite.nonnegative(), pos: z.tuple([finite, finite, finite]), zoom: finite.positive(), ease: z.string().optional(),
  }).strict()),
  curves: z.record(numericCurve), events: z.array(performanceEvent), statics: z.record(z.unknown()),
}).strict().superRefine((performance, context) => {
  for (let index = 1; index < performance.events.length; index += 1) {
    if ((performance.events[index]?.t ?? 0) < (performance.events[index - 1]?.t ?? 0)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["events", index, "t"], message: "events must be sorted by t" });
    }
  }
});

export const tuningSchema = z.record(z.union([z.string(), finite, z.boolean()]));

export function parsePerformance(value: unknown): Performance {
  return performanceSchema.parse(value) as Performance;
}

export function parseTuning(value: unknown): Tuning {
  return tuningSchema.parse(value);
}
