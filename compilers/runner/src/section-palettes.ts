import type { Palette, PerformanceEvent, Song } from "@reaper-viz/core";
import type { RunnerSectionPalette } from "./types.js";

export interface SectionPaletteCompileResult {
  palettes: RunnerSectionPalette[];
  events: PerformanceEvent[];
}

const KIND_TINTS: Record<string, number> = {
  intro: 0x5be0c3,
  verse: 0x6ba8ff,
  prechorus: 0xa88cff,
  chorus: 0xffd65a,
  bridge: 0xd077ff,
  drop: 0xff7c4d,
  breakdown: 0x7dd3fc,
  solo: 0xff80b5,
  outro: 0xffb98a,
  unknown: 0xa7b6d8,
};

function colorNumber(value: string, fallback: number): number {
  return value.startsWith("#") ? Number.parseInt(value.slice(1), 16) : fallback;
}

function colorHex(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function mixColor(a: number, b: number, amount: number): number {
  const mix = (shift: number): number => {
    const av = (a >> shift) & 0xff;
    const bv = (b >> shift) & 0xff;
    return Math.round(av + (bv - av) * amount);
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

function beatDurationAt(song: Song, t: number): number {
  const beats = song.grid.beats;
  if (beats.length >= 2) {
    for (let index = 1; index < beats.length; index += 1) {
      if ((beats[index] ?? 0) >= t - 1e-6) return Math.max(0.05, (beats[index] ?? t) - (beats[index - 1] ?? 0));
    }
    return Math.max(0.05, (beats[beats.length - 1] ?? t) - (beats[beats.length - 2] ?? 0));
  }
  return 0.5;
}

function sectionPalette(base: Palette, kind: string, energy: number): RunnerSectionPalette {
  const tint = KIND_TINTS[kind] ?? KIND_TINTS.unknown!;
  const strength = 0.12 + Math.max(0, Math.min(1, energy)) * 0.18;
  const roles: Record<string, string> = {};
  for (const [role, color] of Object.entries(base.roles)) {
    roles[role] = colorHex(mixColor(colorNumber(color, 0x70d9ff), tint, role === "bass" ? strength * 0.55 : strength));
  }
  return {
    kind,
    bg: colorHex(mixColor(colorNumber(base.bg, 0x07131f), tint, strength * 0.36)),
    roles,
  };
}

export function compileSectionPalettes(song: Song, base: Palette): SectionPaletteCompileResult {
  const kinds = [...new Set(song.sections.map((section) => section.kind))];
  const palettes = kinds.map((kind) => {
    const matching = song.sections.filter((section) => section.kind === kind);
    const energy = matching.reduce((total, section) => total + section.energy, 0) / Math.max(1, matching.length);
    return sectionPalette(base, kind, energy);
  });
  const initialKind = song.sections[0]?.kind ?? "unknown";
  const events = song.sections
    .filter((section) => section.startSec > 1e-6 && section.startSec < song.meta.durationSec - 1e-6)
    .map((section) => {
      const halfBeat = beatDurationAt(song, section.startSec) * 0.5;
      const previous = [...song.sections].reverse().find((candidate) => candidate.startSec < section.startSec - 1e-6);
      return {
        t: Number(Math.max(0, section.startSec - halfBeat).toFixed(6)),
        tEnd: Number(Math.min(song.meta.durationSec, section.startSec + halfBeat).toFixed(6)),
        type: "palette.shift",
        layer: "runner-palette",
        params: {
          fromKind: previous?.kind ?? initialKind,
          toKind: section.kind,
          section: section.name,
          hitT: Number(section.startSec.toFixed(6)),
        },
      };
    });
  return { palettes, events };
}
