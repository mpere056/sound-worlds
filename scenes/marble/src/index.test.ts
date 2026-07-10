import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compileMarble } from "@reaper-viz/compiler-marble";
import { PerspectiveCamera, Vector3 } from "three";
import { sampleMarbleCamera } from "./index.js";

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function project(point: [number, number, number], state: ReturnType<typeof sampleMarbleCamera>): Vector3 {
  const camera = new PerspectiveCamera(32, 1080 / 1920, 0.1, 100);
  camera.position.set(...state.position);
  camera.zoom = state.zoom;
  camera.lookAt(...state.lookAt);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return new Vector3(...point).project(camera);
}

describe("Marble camera", () => {
  it("stays continuous through impact tangent changes", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "keys", beats: [0, 1, 2.5, 4, 6], pitch: 55, kind: "note" }] });
    const performance = compileMarble(song);
    for (const impact of performance.statics.impacts) {
      const before = sampleMarbleCamera(performance.statics.path, impact.t - 0.001, 0.88);
      const after = sampleMarbleCamera(performance.statics.path, impact.t + 0.001, 0.88);
      expect(distance(before.position, after.position)).toBeLessThan(0.02);
      expect(distance(before.lookAt, after.lookAt)).toBeLessThan(0.02);
      expect(Math.abs(before.zoom - after.zoom)).toBeLessThan(0.0001);
    }
  });

  it("follows route depth continuously with stable zoom", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "keys", beats: [0, 1, 2.5, 4, 6], pitch: 55, kind: "note" }] });
    const performance = compileMarble(song);
    const samples = Array.from({ length: 121 }, (_, index) => sampleMarbleCamera(performance.statics.path, performance.durationSec * index / 120, 0.88));
    const zooms = samples.map((sample) => sample.zoom);
    const cameraDepths = samples.map((sample) => sample.position[2]);
    expect(Math.max(...zooms) - Math.min(...zooms)).toBeLessThan(0.0001);
    expect(Math.max(...cameraDepths) - Math.min(...cameraDepths)).toBeGreaterThan(1);
    for (let index = 1; index < samples.length; index += 1) {
      expect(distance(samples[index - 1]!.position, samples[index]!.position)).toBeLessThan(0.32);
      expect(distance(samples[index - 1]!.lookAt, samples[index]!.lookAt)).toBeLessThan(0.32);
    }
  });

  it("projects front-back travel into visible position and scale changes", () => {
    const song = buildFixtureSong({ bars: 3, patterns: [{ role: "keys", beats: [0, 1.5, 3.5, 5.5, 7.5, 9.5], pitch: 52, kind: "note" }] });
    const performance = compileMarble(song);
    const projections = performance.statics.impacts.map((impact) => {
      const target = performance.statics.targets[impact.noteIndex]!;
      const state = sampleMarbleCamera(performance.statics.path, impact.t, 0.88);
      const center = project(target.contactPos, state);
      const edge = project([target.contactPos[0] + 0.28, target.contactPos[1], target.contactPos[2]], state);
      return { y: center.y, radius: Math.hypot(edge.x - center.x, edge.y - center.y) };
    });
    const y = projections.map((projection) => projection.y);
    const radii = projections.map((projection) => projection.radius);
    expect(Math.max(...y) - Math.min(...y)).toBeGreaterThan(0.12);
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.05);

    const axisContribution = [0, 0, 0];
    for (const segment of performance.statics.path.filter((entry) => entry.kind !== "drop" && entry.kind !== "settle" && entry.kind !== "hold")) {
      const state = sampleMarbleCamera(performance.statics.path, (segment.t0 + segment.t1) / 2, 0.88);
      const base = project(segment.from, state);
      const isolatedEndpoints: Array<[number, number, number]> = [
        [segment.to[0], segment.from[1], segment.from[2]],
        [segment.from[0], segment.to[1], segment.from[2]],
        [segment.from[0], segment.from[1], segment.to[2]],
      ];
      isolatedEndpoints.forEach((endpoint, axis) => {
        const projected = project(endpoint, state);
        axisContribution[axis] = axisContribution[axis]! + Math.hypot(projected.x - base.x, projected.y - base.y);
      });
    }
    const totalContribution = axisContribution.reduce((sum, value) => sum + value, 0);
    expect(axisContribution[2]! / totalContribution).toBeGreaterThan(0.52);
    expect(axisContribution[0]! / totalContribution).toBeLessThan(0.3);
  });
});
