import { describe, expect, it } from "vitest";
import { buildFixtureSong } from "@reaper-viz/core";
import { compileMarble, marbleTargetClearance, marbleTargetVisualsOverlap, sampleMarblePose } from "@reaper-viz/compiler-marble";
import { PerspectiveCamera, Vector3 } from "three";
import { applyMarbleCameraOrbit, blendMarbleCamera, interpolateMarblePathSegment, interpolateMarblePlatformCarrier, interpolateMarbleTarget, interpolateMarbleTargetRoute, marblePlatformCarrierTransform, marblePlatformTransitionDuration, marblePlatformTransitionProgress, marblePlatformVisualSize, marbleVisibleTargetIds, prepareMarbleActivation, prepareMarblePerformanceTransition, sampleMarbleCamera, type MarbleCameraPose } from "./index.js";

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

  it("orbits around the marble while keeping it as the exact look target", () => {
    const base: MarbleCameraPose = { position: [1, 8, 7], lookAt: [0, 0, 0], zoom: 1.16 };
    const marble: [number, number, number] = [1, 2, 3];
    const orbited = applyMarbleCameraOrbit(base, marble, 0.5, -0.2, -1);
    expect(orbited.lookAt).toEqual(marble);
    expect(orbited.position).not.toEqual(base.position);
    expect(distance(orbited.position, marble)).toBeCloseTo(distance(base.position, marble) - 1, 8);
    expect(applyMarbleCameraOrbit(base, marble, 0, 0, 0)).toBe(base);
  });
});

describe("Marble live-plan activation", () => {
  it("derives non-overlapping visible representatives for legacy performances", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 0.12, 0.28, 0.44, 1.5, 2.5], pitch: 58, kind: "note" }] });
    const targets = compileMarble(song).statics.targets.map(({ visualGroupId: _, ...target }) => target);
    const visible = marbleVisibleTargetIds(targets);
    expect(visible.size).toBeLessThan(targets.length);
    const representatives = targets.filter((target) => visible.has(target.id));
    for (let left = 0; left < representatives.length; left += 1) {
      for (let right = left + 1; right < representatives.length; right += 1) {
        expect(marbleTargetVisualsOverlap(representatives[left]!, representatives[right]!, 0)).toBe(false);
      }
    }
  });

  it("bounds visible platform carriers without changing collision target data", () => {
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 1], pitch: 55, kind: "note" }] });
    const source = compileMarble(song).statics.targets[0]!;
    const tinyCompact = { ...source, kind: "peg" as const, size: [0.005, 0.002, 0.004] as [number, number, number] };
    const hugePlate = { ...source, kind: "plate" as const, size: [3, 1, 2] as [number, number, number] };
    expect(marblePlatformVisualSize(tinyCompact)).toEqual([0.58, 0.11, 0.28]);
    expect(marblePlatformVisualSize(hugePlate)).toEqual([1.35, 0.28, 0.7]);
    expect(marblePlatformVisualSize(tinyCompact)[0]).toBeGreaterThan(0.56);
    const middleCarrier = interpolateMarblePlatformCarrier(tinyCompact, hugePlate, 0.5);
    const fromCarrier = marblePlatformCarrierTransform(tinyCompact);
    const toCarrier = marblePlatformCarrierTransform(hugePlate);
    middleCarrier.scale.forEach((value, index) => expect(value).toBeCloseTo((fromCarrier.scale[index]! + toCarrier.scale[index]!) / 2, 10));
    expect(tinyCompact.size).toEqual([0.005, 0.002, 0.004]);
  });

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
    const routedMiddle = interpolateMarbleTargetRoute(from, to, 0.5, [0, 0, 2]);
    expect(routedMiddle.pos[2]).toBeCloseTo(target.pos[2] + 3.5, 10);
    expect(interpolateMarbleTargetRoute(from, to, 0, [0, 0, 2]).pos).toEqual(from.pos);
    expect(interpolateMarbleTargetRoute(from, to, 1, [0, 0, 2]).pos[2]).toBeCloseTo(to.pos[2], 10);
    expect(interpolateMarbleTargetRoute(from, to, 0.25, [0, 0, 2], [0.5, 1]).pos).toEqual(from.pos);
    expect(interpolateMarbleTargetRoute(from, to, 0.75, [0, 0, 2], [0.5, 1]).pos[2]).toBeCloseTo(routedMiddle.pos[2], 10);
  });

  it("aligns a transform-only plan at the held marble time", () => {
    const song = buildFixtureSong({ bars: 3, patterns: [{ role: "keys", beats: [0, 1.5, 3.5, 5.5, 7.5, 9.5], pitch: 52, kind: "note" }] });
    const active = compileMarble(song, { motionMix: { leftRight: 20, upDown: 20, frontBack: 60 } });
    const incoming = compileMarble(song, { motionMix: { leftRight: 45, upDown: 35, frontBack: 20 } });
    const incomingBefore = JSON.stringify(incoming);
    const songT = 2.25;
    const aligned = prepareMarblePerformanceTransition(active, incoming, songT);
    expect(distance(sampleMarblePose(active.statics.path, songT).pos, sampleMarblePose(aligned.statics.path, songT).pos)).toBeLessThan(1e-9);
    expect(aligned.statics.targets.map((target) => target.id)).toEqual(active.statics.targets.map((target) => target.id));
    expect(JSON.stringify(incoming)).toBe(incomingBefore);
  });

  it("uses continuous transform easing and supports displayed-state retargeting", () => {
    expect(marblePlatformTransitionProgress(-1)).toBe(0);
    expect(marblePlatformTransitionProgress(0.5)).toBeCloseTo(0.5, 10);
    expect(marblePlatformTransitionProgress(2)).toBe(1);
    const song = buildFixtureSong({ bars: 1, patterns: [{ role: "keys", beats: [0, 1, 2, 3], pitch: 55, kind: "note" }] });
    const active = compileMarble(song);
    const target = active.statics.targets[0]!;
    const firstDestination = { ...target, pos: [target.pos[0] + 2, target.pos[1] - 1, target.pos[2] + 1] as [number, number, number] };
    const displayed = interpolateMarbleTarget(target, firstDestination, marblePlatformTransitionProgress(0.4));
    const secondDestination = { ...target, pos: [target.pos[0] - 1, target.pos[1] + 2, target.pos[2] - 2] as [number, number, number] };
    expect(interpolateMarbleTarget(displayed, secondDestination, 0).pos).toEqual(displayed.pos);
    expect(marblePlatformTransitionDuration(new Map([[target.id, target]]), new Map([[target.id, target]]))).toBe(450);
    expect(marblePlatformTransitionDuration(new Map([[target.id, target]]), new Map([[target.id, firstDestination]]))).toBe(490);
    const extremeDestination = { ...target, pos: [target.pos[0] + 20, target.pos[1], target.pos[2]] as [number, number, number] };
    expect(marblePlatformTransitionDuration(new Map([[target.id, target]]), new Map([[target.id, extremeDestination]]))).toBe(1400);
    const fromSegment = active.statics.path[1]!;
    const toSegment = { ...fromSegment, from: [fromSegment.from[0] + 2, fromSegment.from[1] - 1, fromSegment.from[2] + 3] as [number, number, number] };
    const middleSegment = interpolateMarblePathSegment(fromSegment, toSegment, 0.5);
    expect(middleSegment.from[0]).toBeCloseTo(fromSegment.from[0] + 1, 10);
    expect(middleSegment.from[1]).toBeCloseTo(fromSegment.from[1] - 0.5, 10);
    expect(middleSegment.from[2]).toBeCloseTo(fromSegment.from[2] + 1.5, 10);
  });
});
