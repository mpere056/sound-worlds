import { parsePerformance, Rng, sampleCurve, solvePalette, type Song, type SongEvent, type SongTrack } from "@reaper-viz/core";
import type { PaintingLayer, PaintingPerformance, PaintingPoint, PaintingStatics, PaintingStroke } from "./types.js";

export * from "./types.js";

const W = 1080;
const H = 1920;
const TAU = Math.PI * 2;
const CENTER: PaintingPoint = { x: W * 0.5, y: H * 0.48, z: 0 };
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

function timeAngle(song: Song, t: number, offset = 0): number {
  return -Math.PI / 2 + clamp(t / Math.max(0.001, song.meta.contentEndSec || song.meta.durationSec), 0, 1) * TAU + offset;
}

function orbitalPoint(song: Song, t: number, radius: number, rng: Rng, options: { offset?: number; yScale?: number; zScale?: number; jitter?: number } = {}): PaintingPoint {
  const angle = timeAngle(song, t, options.offset ?? 0);
  const jitter = options.jitter ?? 0;
  return {
    x: CENTER.x + Math.cos(angle) * radius + rng.float(-jitter, jitter),
    y: CENTER.y + Math.sin(angle) * radius * (options.yScale ?? 0.78) + rng.float(-jitter, jitter),
    z: Math.sin(angle + 0.7) * (options.zScale ?? 150) + radius * 0.08,
  };
}

function pitchRadius(pitch: number, minPitch: number, maxPitch: number, inner = 135, outer = 420): number {
  const span = Math.max(1, maxPitch - minPitch);
  return inner + clamp((pitch - minPitch) / span, 0, 1) * (outer - inner);
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

function compileSketch(_song: Song, rng: Rng): PaintingStroke[] {
  const strokes: PaintingStroke[] = [];
  for (let index = 0; index < 7; index += 1) {
    strokes.push(makeStroke({
      id: `sketch:ring:${index}`,
      t: index * 0.12,
      tEnd: index * 0.12 + 1.4,
      layer: "sketch",
      kind: "ring",
      role: "construction",
      color: "#5d6670",
      alpha: 0.08,
      width: rng.float(1.2, 2.6),
      radius: 110 + index * 64 + rng.float(-6, 6),
      points: [{ ...CENTER, z: -230 + index * 28 }],
      rotation: rng.float(-0.08, 0.08),
      roughness: 0.25,
    }));
  }
  return strokes;
}

function compileWashes(song: Song, tracks: SongTrack[], palette: ReturnType<typeof solvePalette>, _rng: Rng): PaintingStroke[] {
  const washTracks = tracks.filter((track) => ["keys", "pads", "fx", "vocals"].includes(canonicalRole(track.role)));
  const source = washTracks.length ? washTracks : tracks.slice(0, 3);
  const strokes: PaintingStroke[] = [];
  song.sections.forEach((section, sectionIndex) => {
    const track = source[sectionIndex % Math.max(1, source.length)];
    const role = track ? canonicalRole(track.role) : "keys";
    const base = roleColor(palette, role);
    const color = mixColor(base, section.kind === "chorus" || section.kind === "drop" ? "#fff2bb" : "#eaf4ff", section.kind === "bridge" ? 0.42 : 0.24);
    const energy = section.energy || sampleCurve(song.master.energy, section.startSec);
    const radius = 520 + sectionIndex * 70 + energy * 260;
    strokes.push(makeStroke({
      id: `wash:${sectionIndex}:${section.repeatGroup}`,
      t: section.startSec,
      tEnd: Math.min(song.meta.durationSec, section.startSec + 1.4),
      layer: "wash",
      kind: "wash",
      role,
      color,
      alpha: clamp(0.16 + energy * 0.22, 0.12, 0.42),
      width: 180 + energy * 120,
      radius,
      points: [{ ...CENTER, z: -300 + sectionIndex * 50 }],
      roughness: 0.9,
      label: section.name,
    }));
  });
  source.forEach((track, trackIndex) => {
    const role = canonicalRole(track.role);
    const base = roleColor(palette, role);
    const color = mixColor(base, trackIndex % 2 === 0 ? "#fff0c8" : "#d7f4ff", 0.28);
    const firstEvent = activityEvents(track)[0];
    const radius = 360 + trackIndex * 105 + sampleCurve(track.curves.rms, firstEvent?.t ?? 0) * 180;
    strokes.push(makeStroke({
      id: `wash:track:${track.id}`,
      t: firstEvent ? Math.max(0, firstEvent.t - 0.18) : trackIndex * 0.22,
      tEnd: Math.min(song.meta.durationSec, (firstEvent?.t ?? 0) + 1.6),
      layer: "wash",
      kind: "wash",
      role,
      color,
      alpha: 0.18,
      width: 135,
      radius,
      points: [{ ...CENTER, z: -180 + trackIndex * 68 }],
      roughness: 0.95,
      label: track.name,
    }));
  });
  return strokes;
}

function compileTerrain(song: Song, tracks: SongTrack[], palette: ReturnType<typeof solvePalette>, _rng: Rng, minPitch: number, maxPitch: number): PaintingStroke[] {
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
    const pulses = events.length
      ? events
      : song.grid.beats.map((beat, index) => ({
        t: beat,
        dur: 0.2,
        vel: sampleCurve(track.curves.rms, beat),
        pitch: minPitch + (index % 4) * 2,
        kind: "note" as const,
      }));
    for (const [eventIndex, event] of pulses.entries()) {
      const pitch = event.pitch ?? minPitch;
      const energy = sampleCurve(track.curves.rms, event.t);
      strokes.push(makeStroke({
        id: `terrain:ripple:${track.id}:${eventIndex}`,
        t: event.t,
        tEnd: Math.min(song.meta.durationSec, event.t + 0.95),
        layer: "terrain",
        kind: "ring",
        role: canonicalRole(track.role),
        color,
        alpha: 0.34 + energy * 0.28,
        width: 12 + (event.vel ?? 0.6) * 26,
        radius: pitchRadius(pitch, minPitch, maxPitch, 170, 475) + trackIndex * 18,
        points: [{ ...CENTER, z: 70 + energy * 130 }],
        roughness: 0.35,
      }));
    }
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
    const trackOffset = (trackIndex - (musicalTracks.length - 1) / 2) * 0.34;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]!;
      const next = events[index + 1];
      const endT = next ? Math.min(next.t, event.t + Math.max(0.18, event.dur || 0.24)) : event.t + Math.max(0.28, event.dur || 0.28);
      const interval = next?.pitch !== null && next?.pitch !== undefined ? next.pitch - event.pitch! : 0;
      const radius = pitchRadius(event.pitch!, minPitch, maxPitch, 145, 390);
      const point = orbitalPoint(song, event.t, radius, rng, { offset: trackOffset, yScale: 0.82, zScale: 260, jitter: 10 });
      strokes.push(makeStroke({
        id: `bloom:${track.id}:${index}`,
        t: event.t,
        tEnd: endT,
        layer: "subject",
        kind: "bloom",
        role,
        color,
        alpha: 0.34 + event.vel * 0.24,
        width: 6 + event.vel * 12 + clamp(Math.abs(interval), 0, 12) * 0.5,
        radius: 16 + event.vel * 32 + clamp(Math.abs(interval), 0, 18) * 1.6,
        points: [point],
        rotation: timeAngle(song, event.t, trackOffset),
        roughness: 0.5,
      }));
    }
  }
  return strokes;
}

function compileRhythm(song: Song, tracks: SongTrack[], palette: ReturnType<typeof solvePalette>, rng: Rng): PaintingStroke[] {
  const rhythmRoles = new Set(["kick", "snare", "hats", "toms", "percussion"]);
  const rhythmTracks = tracks.filter((track) => rhythmRoles.has(canonicalRole(track.role)));
  const sourceTracks = rhythmTracks.length ? rhythmTracks : tracks.filter((track) => activityEvents(track).length).slice(0, 3);
  const strokes: PaintingStroke[] = [];
  for (const [trackIndex, track] of sourceTracks.entries()) {
    const role = rhythmTracks.length ? canonicalRole(track.role) : "percussion";
    const color = roleColor(palette, role, "#ffe2a8");
    const events = activityEvents(track).filter((_, index) => rhythmTracks.length || index % 3 === 0);
    for (const [eventIndex, event] of events.entries()) {
      const energy = sampleCurve(track.curves.rms, event.t);
      const eventRng = rng.fork(`${track.id}:${eventIndex}`);
      const radius = 170 + ((eventIndex + trackIndex * 3) % 5) * 58 + energy * 50;
      const pos = orbitalPoint(song, event.t, radius, eventRng, {
        offset: trackIndex * 0.72 + (role === "snare" ? 0.22 : 0),
        yScale: 0.78,
        zScale: 260,
        jitter: 18 + energy * 24,
      });
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
        rotation: eventRng.float(-Math.PI, Math.PI),
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
  return song.sections.slice(0, 8).map((section, index) => {
    const radius = 430 + index * 76 + section.energy * 180;
    return makeStroke({
      id: `glaze:${index}`,
      t: Math.max(0, section.endSec - 0.65),
      tEnd: section.endSec,
      layer: "glaze",
      kind: "glaze",
      role: canonicalRole(source.role),
      color,
      alpha: 0.12 + section.energy * 0.08,
      width: 86,
      radius,
      points: [{ ...CENTER, z: 120 + index * 28 }],
      rotation: timeAngle(song, section.endSec, rng.float(-0.28, 0.28)),
      roughness: 0.8,
    });
  });
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
    ...compileRhythm(song, song.tracks, palette, rng.fork("rhythm")),
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
      compilerVersion: 2,
    },
  };
  parsePerformance(performance);
  return performance;
}
