export interface MusicalKey { tonic: string; mode: string; confidence: number; }
export interface Palette { bg: string; roles: Record<string, string>; }

const TONICS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ROLE_HUE_OFFSETS: Record<string, number> = {
  kick: 12, snare: 42, hats: 68, toms: 25, percussion: 92,
  bass: 220, lead: 350, keys: 285, pads: 260, fx: 175, vocals: 325, other: 145,
};

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const channel = (offset: number): number => {
    const k = (offset + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${[channel(0), channel(8), channel(4)]
    .map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function solvePalette(key: MusicalKey | null, roles: readonly string[]): Palette {
  const confident = key !== null && key.confidence >= 0.35;
  const tonicIndex = confident ? Math.max(0, TONICS.indexOf(key.tonic.toUpperCase())) : 0;
  const baseHue = confident ? (tonicIndex * 30 + (key.mode.toLowerCase().startsWith("min") ? 215 : 25)) % 360 : 205;
  const sortedRoles = [...new Set(roles)].sort();
  const assigned: Record<string, string> = {};
  sortedRoles.forEach((role, index) => {
    const offset = ROLE_HUE_OFFSETS[role] ?? (index * 137.508);
    const saturation = role === "other" ? 50 : 72;
    const lightness = role === "bass" ? 62 : 68 + (index % 2) * 7;
    assigned[role] = hslToHex(baseHue + offset, saturation, lightness);
  });
  return { bg: hslToHex(baseHue + 190, confident ? 28 : 18, 9), roles: assigned };
}
