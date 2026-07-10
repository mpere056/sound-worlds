import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compileMarble, marbleTargetClearance, sampleMarblePose } from "@reaper-viz/compiler-marble";
import { PerspectiveCamera, Vector3 } from "three";
import { blendMarbleCamera, interpolateMarbleScale, interpolateMarbleTarget, marbleBoundaryTransitionScale, prepareMarbleActivation, prepareMarbleTargetMorph, sampleMarbleCamera, type MarbleCameraPose } from "./index.js";

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
    expect(axisContribution[0]! / totalContribution).toBeLessThan(0.45);
  });
});

describe("Marble live-plan activation", () => {
  it("starts camera blending at the old pose and finishes at the new pose", () => {
    const from: MarbleCameraPose = { position: [1, 2, 3], lookAt: [0, 1, 2], zoom: 1.1 };
    const to: MarbleCameraPose = { position: [4, 6, 8], lookAt: [3, 5, 7], zoom: 1.25 };
    expect(blendMarbleCamera(from, to, 0)).toEqual(from);
    expect(blendMarbleCamera(from, to, 1)).toEqual(to);
    const start = blendMarbleCamera(from, to, 0.001);
    expect(distance(start.position, from.position)).toBeLessThan(0.0001);
    expect(distance(start.lookAt, from.lookAt)).toBeLessThan(0.0001);
  });

  it("aligns an incoming route at the next shared impact without mutating it", () => {
    const song = buildFixtureSong({ bars: 3, patterns: [{ role: "keys", beats: [0, 1.5, 3.5, 5.5, 7.5, 9.5], pitch: 52, kind: "note" }] });
    const active = compileMarble(song, { motionMix: { leftRight: 20, upDown: 20, frontBack: 60 } });
    const incoming = compileMarble(song, { motionMix: { leftRight: 10, upDown: 80, frontBack: 10 } });
    const incomingBefore = JSON.stringify(incoming);
    const currentT = active.statics.impacts[1]!.t + 0.01;
    const activation = prepareMarbleActivation(active, incoming, currentT);

    expect(activation).toBeDefined();
    expect(activation!.activationT).toBeGreaterThan(currentT);
    const activePose = sampleMarblePose(active.statics.path, activation!.activationT);
    const incomingPose = sampleMarblePose(activation!.performance.statics.path, activation!.activationT);
    expect(distance(activePose.pos, incomingPose.pos)).toBeLessThan(1e-9);
    expect(JSON.stringify(incoming)).toBe(incomingBefore);
  });

  it("preserves translated target spacing and route clearance", () => {
    const song = buildFixtureSong({ bars: 2, patterns: [{ role: "keys", beats: [0, 1, 2.5, 4, 6], pitch: 55, kind: "note" }] });
    const active = compileMarble(song, { motionMix: { leftRight: 20, upDown: 20, frontBack: 60 } });
    const incoming = compileMarble(song, { motionMix: { leftRight: 45, upDown: 10, frontBack: 45 } });
    const activation = prepareMarbleActivation(active, incoming, 0);
    expect(activation).toBeDefined();

    const originalTargets = incoming.statics.targets;
    const translatedTargets = activation!.performance.statics.targets;
    for (let index = 1; index < originalTargets.length; index += 1) {
      expect(distance(originalTargets[0]!.pos, originalTargets[index]!.pos))
        .toBeCloseTo(distance(translatedTargets[0]!.pos, translatedTargets[index]!.pos), 10);
    }
    for (const impact of activation!.performance.statics.impacts) {
      const target = translatedTargets[impact.noteIndex]!;
      const pose = sampleMarblePose(activation!.performance.statics.path, impact.t);
      expect(marbleTargetClearance(target, pose.pos)).toBeGreaterThanOrEqual(0.0119);
    }
  });

  it("returns no boundary after the final shared impact", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 1, 2, 3], pitch: 55, kind: "note" }] });
    const active = compileMarble(song);
    const incoming = compileMarble(song, { motionMix: { leftRight: 10, upDown: 10, frontBack: 80 } });
    expect(prepareMarbleActivation(active, incoming, active.durationSec)).toBeUndefined();
  });

  it("interpolates target transforms without taking the long rotation path", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 1, 2, 3], pitch: 55, kind: "note" }] });
    const target = compileMarble(song).statics.targets[0]!;
    const from = { ...target, rotation: [target.rotation[0], 0, Math.PI - 0.1] as [number, number, number] };
    const to = { ...target, pos: [target.pos[0] + 2, target.pos[1] - 1, target.pos[2] + 3] as [number, number, number], rotation: [target.rotation[0], 0, -Math.PI + 0.1] as [number, number, number] };
    const middle = interpolateMarbleTarget(from, to, 0.5);
    expect(middle.pos[0]).toBeCloseTo(target.pos[0] + 1, 10);
    expect(middle.pos[1]).toBeCloseTo(target.pos[1] - 0.5, 10);
    expect(middle.pos[2]).toBeCloseTo(target.pos[2] + 1.5, 10);
    expect(Math.abs(middle.rotation[2] - from.rotation[2])).toBeLessThan(0.11);
  });

  it("accepts safe future-target morphs and crossfades an intersecting fallback", () => {
    const song = buildFixtureSong({ bars: 3, patterns: [{ role: "keys", beats: [0, 3, 6, 9], pitch: 52, kind: "note" }] });
    const active = compileMarble(song);
    const activation = prepareMarbleActivation(active, active, 0);
    expect(activation).toBeDefined();
    const safe = prepareMarbleTargetMorph(active, activation!.performance, 0, activation!);
    expect(safe?.targetIds.length).toBeGreaterThan(0);
    expect(safe?.startT).toBe(0);

    const unsafePerformance = structuredClone(activation!.performance);
    const futureImpact = unsafePerformance.statics.impacts.find((impact) => impact.noteIndex > activation!.noteIndex)!;
    const movingTarget = unsafePerformance.statics.targets.find((target) => target.id === futureImpact.targetId)!;
    const stationaryTarget = unsafePerformance.statics.targets[activation!.noteIndex]!;
    movingTarget.pos = [...stationaryTarget.pos];
    movingTarget.contactPos = [...stationaryTarget.contactPos];
    const fallback = prepareMarbleTargetMorph(active, unsafePerformance, 0, activation!);
    expect(fallback?.targetIds).toHaveLength(0);
    expect(fallback?.fadeTargetIds.length).toBeGreaterThan(0);
    expect(fallback?.fadeTargetIds).not.toContain(active.statics.impacts[activation!.noteIndex]!.targetId);
  });

  it("smoothly scales withheld platforms out and back in", () => {
    expect(interpolateMarbleScale(1, 0.04, 0)).toBe(1);
    expect(interpolateMarbleScale(1, 0.04, 1)).toBeCloseTo(0.04, 10);
    expect(interpolateMarbleScale(0.04, 1, 0.5)).toBeCloseTo(0.52, 10);
    expect(interpolateMarbleScale(0.04, 1, 1)).toBe(1);
    expect(marbleBoundaryTransitionScale(0)).toBe(1);
    expect(marbleBoundaryTransitionScale(0.5)).toBeCloseTo(0.04, 10);
    expect(marbleBoundaryTransitionScale(1)).toBe(1);
  });
});
