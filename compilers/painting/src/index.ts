import { parsePerformance, Rng, sampleCurve, solvePalette, type Song, type SongEvent, type SongTrack } from "@reaper-viz/core";
import type { PaintingLayer, PaintingPerformance, PaintingPoint, PaintingStatics, PaintingStroke } from "./types.js";

export * from "./types.js";

const W = 1080;
const H = 1920;
const MARGIN_X = 92;
const ROLE_ALIASES: Record<string, string> = {
  piano: "keys",
  synth: "keys",
  pad: "pads",
  melody: "lead",
  vocal: "vocals",
  voice: "vocals",
  percussion: "percussion",
};
const LAYER_ORDER: PaintingLayer[] = ["sketch", "wash", "terrain", "subject", "rhythm", "texture", "glaze", "signature"];

function canonicalRole(role: string): string {
  const normalized = role.toLowerCase().replace(/[^a-z]+/g, "");
  return ROLE_ALIASES[normalized] ?? (normalized || "other");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function mixColor(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount);
}

function timeX(song: Song, t: number): number {
  return MARGIN_X + clamp(t / Math.max(0.001, song.meta.durationSec), 0, 1) * (W - MARGIN_X * 2);
}

function pitchY(pitch: number, minPitch: number, maxPitch: number, top = 390, bottom = 1180): number {
  const span = Math.max(1, maxPitch - minPitch);
  return bottom - clamp((pitch - minPitch) / span, 0, 1) * (bottom - top);
}

function pointJitter(point: PaintingPoint, rng: Rng, amount: number): PaintingPoint {
  return { x: point.x + rng.float(-amount, amount), y: point.y + rng.float(-amount, amount) };
}

function roleColor(palette: ReturnType<typeof solvePalette>, role: string, fallback = "#d8c7ff"): string {
  return palette.roles[role] ?? palette.roles[canonicalRole(role)] ?? palette.roles.other ?? fallback;
}

function eventPitchRange(tracks: SongTrack[]): { min: number; max: number } {
  const pitches = tracks.flatMap((track) => track.events.map((event) => event.pitch).filter((pitch): pitch is number => pitch !== null));
  if (!pitches.length) return { min: 36, max: 84 };
  return { min: Math.min(...pitches) - 2, max: Math.max(...pitches) + 2 };
}

function noteEvents(track: SongTrack): SongEvent[] {
  return track.events.filter((event) => event.kind === "note" && event.pitch !== null).sort((a, b) => a.t - b.t);
}

function activityEvents(track: SongTrack): SongEvent[] {
  return track.events.filter((event) => event.kind === "onset" || event.kind === "note").sort((a, b) => a.t - b.t);
}

function makeStroke(stroke: PaintingStroke): PaintingStroke {
  return stroke;
}

function compileSketch(song: Song, rng: Rng): PaintingStroke[] {
  const strokes: PaintingStroke[] = [];
  for (let index = 0; index < 6; index += 1) {
    const y = 300 + index * 205 + rng.float(-24, 24);
    strokes.push(makeStroke({
      id: `sketch:${index}`,
      t: index * 0.12,
      tEnd: index * 0.12 + 1.4,
      layer: "sketch",
      kind: "guide",
      role: "form",
      color: "#5d6670",
      alpha: 0.16,
      width: rng.float(1.2, 2.6),
      points: [
        { x: 88, y },
        pointJitter({ x: W * 0.38, y: y + rng.float(-70, 70) }, rng, 20),
        pointJitter({ x: W * 0.68, y: y + rng.float(-50, 80) }, rng, 20),
        { x: W - 88, y: y + rng.float(-36, 36) },
      ],
      roughness: 0.6,
    }));
  }
  for (const bar of song.grid.bars.filter((bar) => bar.index % 2 === 0).slice(0, 10)) {
    const x = timeX(song, bar.startSec);
    strokes.push(makeStroke({
      id: `sketch:bar:${bar.index}`,
      t: Math.max(0, bar.startSec - 0.25),
      tEnd: bar.startSec + 0.8,
      layer: "sketch",
      kind: "guide",
      role: "bar",
      color: "#75808a",
      alpha: 0.1,
      width: 1.1,
      points: [{ x, y: 250 }, { x: x + rng.float(-16, 16), y: H - 310 }],
      roughness: 0.3,
    }));
  }
  return strokes;
}

function compileWashes(song: Song, tracks: SongTrack[], palette: ReturnType<typeof solvePalette>, rng: Rng): PaintingStroke[] {
  const washTracks = tracks.filter((track) => ["keys", "pads", "fx", "vocals"].includes(canonicalRole(track.role)));
  const source = washTracks.length ? washTracks : tracks.slice(0, 3);
  const strokes: PaintingStroke[] = [];
  song.sections.forEach((section, sectionIndex) => {
    const track = source[sectionIndex % Math.max(1, source.length)];
    const role = track ? canonicalRole(track.role) : "keys";
    const base = roleColor(palette, role);
    const color = mixColor(base, section.kind === "chorus" || section.kind === "drop" ? "#fff2bb" : "#eaf4ff", section.kind === "bridge" ? 0.42 : 0.24);
    const y = 260 + (sectionIndex % 5) * 260 + rng.float(-60, 80);
    const energy = section.energy || sampleCurve(song.master.energy, section.startSec);
    strokes.push(makeStroke({
      id: `wash:${sectionIndex}:${section.repeatGroup}`,
      t: section.startSec,
      tEnd: Math.min(song.meta.durationSec, section.startSec + 1.4),
      layer: "wash",
      kind: "wash",
      role,
      color,
      alpha: clamp(0.16 + energy * 0.22, 0.12, 0.42),
      width: 250 + energy * 210,
      points: [
        pointJitter({ x: -70, y }, rng, 90),
        pointJitter({ x: W * 0.28, y: y + rng.float(-120, 140) }, rng, 70),
        pointJitter({ x: W * 0.66, y: y + rng.float(-130, 120) }, rng, 70),
        pointJitter({ x: W + 80, y: y + rng.float(-90, 90) }, rng, 90),
      ],
      roughness: 0.9,
      label: section.name,
    }));
  });
  source.forEach((track, trackIndex) => {
    const role = canonicalRole(track.role);
    const base = roleColor(palette, role);
    const color = mixColor(base, trackIndex % 2 === 0 ? "#fff0c8" : "#d7f4ff", 0.28);
    const firstEvent = activityEvents(track)[0];
    const y = 420 + trackIndex * 235 + rng.float(-42, 42);
    strokes.push(makeStroke({
      id: `wash:track:${track.id}`,
      t: firstEvent ? Math.max(0, firstEvent.t - 0.18) : trackIndex * 0.22,
      tEnd: Math.min(song.meta.durationSec, (firstEvent?.t ?? 0) + 1.6),
      layer: "wash",
      kind: "wash",
      role,
      color,
      alpha: 0.18,
      width: 165,
      points: [
        pointJitter({ x: -40, y: y + rng.float(-60, 60) }, rng, 44),
        pointJitter({ x: W * 0.32, y: y + rng.float(-95, 95) }, rng, 48),
        pointJitter({ x: W * 0.74, y: y + rng.float(-95, 95) }, rng, 48),
        pointJitter({ x: W + 40, y: y + rng.float(-60, 60) }, rng, 44),
      ],
      roughness: 0.95,
      label: track.name,
    }));
  });
  return strokes;
}

function compileTerrain(song: Song, tracks: SongTrack[], palette: ReturnType<typeof solvePalette>, rng: Rng, minPitch: number, maxPitch: number): PaintingStroke[] {
  const bassTracks = tracks.filter((track) => canonicalRole(track.role) === "bass");
  const candidates = bassTracks.length ? bassTracks : [...tracks].sort((a, b) => {
    const amin = Math.min(...noteEvents(a).map((event) => event.pitch ?? 96), 96);
    const bmin = Math.min(...noteEvents(b).map((event) => event.pitch ?? 96), 96);
    return amin - bmin;
  }).slice(0, 1);
  const strokes: PaintingStroke[] = [];
  for (const [trackIndex, track] of candidates.entries()) {
    const events = noteEvents(track);
    const color = mixColor(roleColor(palette, canonicalRole(track.role), "#26425a"), "#12161d", 0.45);
    const points = events.length >= 2
      ? events.map((event) => ({ x: timeX(song, event.t), y: pitchY(event.pitch!, minPitch, maxPitch, 1080, 1480) + rng.float(-20, 26) }))
      : song.grid.beats.map((beat, index) => ({
        x: timeX(song, beat),
        y: 1330 - sampleCurve(track.curves.rms, beat) * 170 + Math.sin(index * 0.73) * 32,
      }));
    if (points.length < 2) continue;
    strokes.push(makeStroke({
      id: `terrain:${track.id}:${trackIndex}`,
      t: Math.max(0, points[0]!.x / W * song.meta.durationSec - 0.4),
      tEnd: song.meta.durationSec,
      layer: "terrain",
      kind: "terrain",
      role: canonicalRole(track.role),
      color,
      alpha: 0.72,
      width: 28,
      points,
      roughness: 0.55,
    }));
  }
  return strokes;
}

function compileRibbons(song: Song, tracks: SongTrack[], palette: ReturnType<typeof solvePalette>, rng: Rng, minPitch: number, maxPitch: number): PaintingStroke[] {
  const leadTracks = tracks.filter((track) => ["lead", "vocals"].includes(canonicalRole(track.role)));
  const musicalTracks = leadTracks.length ? leadTracks : tracks.filter((track) => noteEvents(track).length).slice(0, 5);
  const strokes: PaintingStroke[] = [];
  for (const [trackIndex, track] of musicalTracks.entries()) {
    const events = noteEvents(track);
    if (!events.length) continue;
    const role = canonicalRole(track.role);
    const color = mixColor(roleColor(palette, role), trackIndex % 2 === 0 ? "#fff7df" : "#f0e6ff", 0.18);
    const laneLift = (trackIndex - (musicalTracks.length - 1) / 2) * 42;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]!;
      const next = events[index + 1];
      const x = timeX(song, event.t);
      const y = pitchY(event.pitch!, minPitch, maxPitch, 390, 1110) + laneLift;
      const endT = next ? Math.min(next.t, event.t + Math.max(0.18, event.dur || 0.24)) : event.t + Math.max(0.28, event.dur || 0.28);
      const endX = timeX(song, endT);
      const interval = next?.pitch !== null && next?.pitch !== undefined ? next.pitch - event.pitch! : 0;
      const curve = clamp(interval, -14, 14) * -5 + rng.float(-26, 26);
      strokes.push(makeStroke({
        id: `ribbon:${track.id}:${index}`,
        t: event.t,
        tEnd: endT,
        layer: "subject",
        kind: "ribbon",
        role,
        color,
        alpha: 0.58,
        width: 8 + event.vel * 18,
        points: [
          { x, y },
          { x: x + (endX - x) * 0.42, y: y + curve },
          { x: endX, y: next ? pitchY(next.pitch ?? event.pitch!, minPitch, maxPitch, 390, 1110) + laneLift : y + rng.float(-24, 24) },
        ],
        roughness: 0.42,
      }));
    }
  }
  return strokes;
}

function compileRhythm(tracks: SongTrack[], palette: ReturnType<typeof solvePalette>, rng: Rng): PaintingStroke[] {
  const rhythmRoles = new Set(["kick", "snare", "hats", "toms", "percussion"]);
  const rhythmTracks = tracks.filter((track) => rhythmRoles.has(canonicalRole(track.role)));
  const sourceTracks = rhythmTracks.length ? rhythmTracks : tracks.filter((track) => activityEvents(track).length).slice(0, 3);
  const anchors: PaintingPoint[] = [
    { x: W * 0.382, y: H * 0.382 },
    { x: W * 0.618, y: H * 0.382 },
    { x: W * 0.382, y: H * 0.618 },
    { x: W * 0.618, y: H * 0.618 },
    { x: W * 0.5, y: H * 0.5 },
  ];
  const strokes: PaintingStroke[] = [];
  for (const [trackIndex, track] of sourceTracks.entries()) {
    const role = rhythmTracks.length ? canonicalRole(track.role) : "percussion";
    const color = roleColor(palette, role, "#ffe2a8");
    const events = activityEvents(track).filter((_, index) => rhythmTracks.length || index % 3 === 0);
    for (const [eventIndex, event] of events.entries()) {
      const anchor = anchors[(eventIndex + trackIndex * 2) % anchors.length]!;
      const energy = sampleCurve(track.curves.rms, event.t);
      const pos = pointJitter(anchor, rng.fork(`${track.id}:${eventIndex}`), 70 + energy * 90);
      const kind = role === "snare" ? "splatter" : role === "hats" ? "stipple" : "dab";
      strokes.push(makeStroke({
        id: `rhythm:${track.id}:${eventIndex}`,
        t: event.t,
        tEnd: event.t + 0.42,
        layer: kind === "stipple" ? "texture" : "rhythm",
        kind,
        role,
        color: mixColor(color, "#fff8d6", kind === "splatter" ? 0.12 : 0.24),
        alpha: kind === "stipple" ? 0.24 : 0.54,
        width: kind === "splatter" ? 4 + event.vel * 8 : 10 + event.vel * 18,
        radius: kind === "stipple" ? 3 + event.vel * 5 : 18 + event.vel * 32 + energy * 20,
        points: [pos],
        rotation: rng.float(-Math.PI, Math.PI),
        roughness: 0.75,
      }));
    }
  }
  return strokes;
}

function compileGlaze(song: Song, tracks: SongTrack[], palette: ReturnType<typeof solvePalette>, rng: Rng): PaintingStroke[] {
  const vocal = tracks.find((track) => canonicalRole(track.role) === "vocals");
  const source = vocal ?? tracks.find((track) => sampleCurve(track.curves.rms, song.meta.durationSec * 0.5) > 0.35);
  if (!source) return [];
  const color = mixColor(roleColor(palette, canonicalRole(source.role), "#f6d6ff"), "#ffffff", 0.34);
  return song.sections.slice(0, 8).map((section, index) => makeStroke({
    id: `glaze:${index}`,
    t: Math.max(0, section.endSec - 0.65),
    tEnd: section.endSec,
    layer: "glaze",
    kind: "glaze",
    role: canonicalRole(source.role),
    color,
    alpha: 0.12 + section.energy * 0.08,
    width: 86,
    points: [
      pointJitter({ x: timeX(song, section.startSec), y: 430 + index * 74 }, rng, 52),
      pointJitter({ x: timeX(song, section.endSec), y: 520 + index * 65 }, rng, 52),
    ],
    roughness: 0.8,
  }));
}

function compileGrain(seed: string): PaintingStatics["grain"] {
  const rng = new Rng(`${seed}:painting:grain`);
  return Array.from({ length: 260 }, () => ({
    x: rng.float(0, W),
    y: rng.float(0, H),
    radius: rng.float(0.4, 1.9),
    alpha: rng.float(0.025, 0.085),
  }));
}

function compileSignature(song: Song): PaintingStroke {
  const t = Math.max(0, song.meta.durationSec - 1.1);
  return makeStroke({
    id: "signature",
    t,
    tEnd: song.meta.durationSec,
    layer: "signature",
    kind: "signature",
    role: "signature",
    color: "#26323b",
    alpha: 0.78,
    width: 2,
    points: [{ x: 100, y: H - 150 }],
    roughness: 0,
    label: song.meta.name,
  });
}

export function compilePainting(song: Song): PaintingPerformance {
  const roles = song.tracks.map((track) => canonicalRole(track.role));
  const palette = solvePalette(null, [...roles, "percussion", "signature"]);
  const rng = new Rng(`${song.meta.seed}:painting`);
  const { min, max } = eventPitchRange(song.tracks);
  const strokes = [
    ...compileSketch(song, rng.fork("sketch")),
    ...compileWashes(song, song.tracks, palette, rng.fork("washes")),
    ...compileTerrain(song, song.tracks, palette, rng.fork("terrain"), min, max),
    ...compileRibbons(song, song.tracks, palette, rng.fork("ribbons"), min, max),
    ...compileRhythm(song.tracks, palette, rng.fork("rhythm")),
    ...compileGlaze(song, song.tracks, palette, rng.fork("glaze")),
    compileSignature(song),
  ].sort((a, b) => a.t - b.t || LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer) || a.id.localeCompare(b.id));
  const strokeCounts = Object.fromEntries(LAYER_ORDER.map((layer) => [layer, strokes.filter((stroke) => stroke.layer === layer).length])) as Record<PaintingLayer, number>;
  const compileLog = [
    `strokes: ${strokes.length}`,
    `roles: ${[...new Set(roles)].sort().join(", ") || "none"}`,
    `signature: ${song.meta.name}`,
  ];
  const performance: PaintingPerformance = {
    schemaVersion: 1,
    concept: "painting",
    seed: `${song.meta.seed}:painting`,
    durationSec: song.meta.durationSec,
    fps: 60,
    resolution: { w: W, h: H },
    palette,
    camera: [
      { t: 0, pos: [W / 2, H / 2, 10], zoom: 1.06, anchor: [0.5, 0.5], ease: "smoothstep" },
      { t: Math.max(0, song.meta.durationSec * 0.45), pos: [W * 0.52, H * 0.47, 10], zoom: 1.12, anchor: [0.5, 0.5], ease: "smoothstep" },
      { t: Math.max(0, song.meta.durationSec - 1.2), pos: [W / 2, H / 2, 10], zoom: 0.98, anchor: [0.5, 0.5], ease: "smoothstep" },
      { t: song.meta.durationSec, pos: [W / 2, H / 2, 10], zoom: 0.98, anchor: [0.5, 0.5], ease: "smoothstep" },
    ],
    curves: { energy: song.master.energy },
    events: strokes.map((stroke) => ({
      t: stroke.t,
      tEnd: stroke.tEnd,
      type: `paint.${stroke.kind}`,
      layer: `painting.${stroke.layer}`,
      params: { strokeId: stroke.id, hitT: stroke.t, role: stroke.role },
    })),
    statics: {
      strokes,
      grain: compileGrain(song.meta.seed),
      signature: { text: song.meta.name, t: Math.max(0, song.meta.durationSec - 1.1), pos: { x: 100, y: H - 150 } },
      strokeCounts,
      compileLog,
      compilerVersion: 1,
    },
  };
  parsePerformance(performance);
  return performance;
}
