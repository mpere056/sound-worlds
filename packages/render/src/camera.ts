import type { CameraKeyframe } from "@reaper-viz/core";

export interface CameraState { pos: [number, number, number]; zoom: number; }

function easing(name: string | undefined, t: number): number {
  if (name === "cubicInOut") return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
  if (name === "smoothstep") return t * t * (3 - 2 * t);
  return t;
}

export function sampleCamera(keyframes: readonly CameraKeyframe[], t: number): CameraState {
  if (keyframes.length === 0) return { pos: [0, 0, 10], zoom: 1 };
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (!first || !last) return { pos: [0, 0, 10], zoom: 1 };
  if (t <= first.t) return { pos: [...first.pos], zoom: first.zoom };
  if (t >= last.t) return { pos: [...last.pos], zoom: last.zoom };
  let endIndex = 1;
  while ((keyframes[endIndex]?.t ?? Number.POSITIVE_INFINITY) < t) endIndex += 1;
  const start = keyframes[endIndex - 1] ?? first;
  const end = keyframes[endIndex] ?? last;
  const raw = (t - start.t) / (end.t - start.t);
  const alpha = easing(end.ease ?? start.ease, raw);
  const lerp = (a: number, b: number): number => a + (b - a) * alpha;
  return {
    pos: [lerp(start.pos[0], end.pos[0]), lerp(start.pos[1], end.pos[1]), lerp(start.pos[2], end.pos[2])],
    zoom: lerp(start.zoom, end.zoom),
  };
}
