import {
  AmbientLight,
  BufferGeometry,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CubicBezierCurve3,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { sampleCurve } from "@reaper-viz/core";
import { marbleTargetVisualSize, marbleTargetVisualsOverlap, sampleMarblePose, type MarbleImpact, type MarblePathSegment, type MarblePerformance, type MarblePose, type MarbleTarget } from "@reaper-viz/compiler-marble";

export type { MarblePerformance } from "@reaper-viz/compiler-marble";

export interface MarbleTuning {
  glow: number;
  camera: number;
  cameraOrbitYaw: number;
  cameraOrbitPitch: number;
  cameraOrbitDistance: number;
  targetScale: number;
  tail: number;
}

export function marblePlatformVisualSize(target: MarbleTarget): [number, number, number] {
  return marbleTargetVisualSize(target);
}

export function marbleVisibleTargetIds(targets: readonly MarbleTarget[]): Set<string> {
  const parents = targets.map((_, index) => index);
  const find = (index: number): number => {
    while (parents[index] !== index) index = parents[index]!;
    return index;
  };
  const join = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };
  for (let left = 0; left < targets.length; left += 1) {
    for (let right = left + 1; right < targets.length; right += 1) {
      const sameAuthoredGroup = targets[left]!.visualGroupId && targets[left]!.visualGroupId === targets[right]!.visualGroupId;
      if (sameAuthoredGroup || marbleTargetVisualsOverlap(targets[left]!, targets[right]!, 0)) join(left, right);
    }
  }
  const visible = new Set<string>();
  for (let index = 0; index < targets.length; index += 1) {
    if (find(index) === index) visible.add(targets[index]!.id);
  }
  return visible;
}

export interface MarblePlatformCarrierTransform {
  scale: [number, number, number];
  position: [number, number, number];
}

export function marblePlatformCarrierTransform(target: MarbleTarget): MarblePlatformCarrierTransform {
  const visualSize = marblePlatformVisualSize(target);
  const compact = target.kind === "peg" || target.kind === "chime";
  const collisionHalfThickness = compact ? target.size[1] * 0.9 : target.size[1] / 2;
  const carrierThickness = Math.max(0.065, visualSize[1] * 0.5);
  return {
    scale: [visualSize[0] * 1.06, carrierThickness, visualSize[2] * 1.1],
    position: [0, -(collisionHalfThickness + carrierThickness / 2 + 0.018), 0],
  };
}

export interface MarbleCameraPose {
  position: [number, number, number];
  lookAt: [number, number, number];
  zoom: number;
}

export interface MarbleActivationBoundary {
  activationT: number;
  noteIndex: number;
  translation: [number, number, number];
  performance: MarblePerformance;
  morphTargetCount: number;
}

export interface MarbleSceneActivation {
  activationT: number;
  noteIndex: number;
  applicationMs: number;
  motionMix: MarblePerformance["statics"]["motionMix"];
}

export interface MarblePlatformTransition {
  songT: number;
  startedAtMs: number;
  durationMs: number;
  fromTargets: Map<string, MarbleTarget>;
  toTargets: Map<string, MarbleTarget>;
  fromCarriers: Map<string, MarblePlatformCarrierTransform>;
  toCarriers: Map<string, MarblePlatformCarrierTransform>;
  fromPath: Map<string, MarblePathSegment>;
  toPath: Map<string, MarblePathSegment>;
  targetOffsets: Map<string, [number, number, number]>;
  targetTimings: Map<string, [number, number]>;
  performance: MarblePerformance;
}

export interface MarblePreparedTransition {
  songT: number;
  fromTargets: Map<string, MarbleTarget>;
  toTargets: Map<string, MarbleTarget>;
  fromCarriers: Map<string, MarblePlatformCarrierTransform>;
  toCarriers: Map<string, MarblePlatformCarrierTransform>;
  fromPath: Map<string, MarblePathSegment>;
  toPath: Map<string, MarblePathSegment>;
  performance: MarblePerformance;
}

export interface MarbleTransitionStart {
  durationMs: number;
  platformCount: number;
  motionMix: MarblePerformance["statics"]["motionMix"];
}

export interface MarbleSceneProfileSnapshot {
  rendererIdentity: number;
  performanceUpdates: number;
  rendererMemory: { geometries: number; textures: number };
  rendererRender: { calls: number; triangles: number; points: number; lines: number };
  programs: number;
  sceneObjects: number;
  targetGroups: number;
  railObjects: number;
  svgOverlays: number;
}

interface TargetMeshes {
  group: Group;
  base: Mesh<BoxGeometry | CylinderGeometry, MeshStandardMaterial>;
  home: Vector3;
  baseRotation: [number, number, number];
  baseScale: Vector3;
  glow: Mesh<SphereGeometry, MeshBasicLike>;
  shadow: Mesh<CircleGeometry, MeshBasicMaterial>;
  hardware: Group;
  carrier: Mesh<BoxGeometry, MeshStandardMaterial>;
  compact: boolean;
  rod?: Mesh<CylinderGeometry, MeshStandardMaterial>;
}

interface RailMeshes {
  left: Mesh<CylinderGeometry, MeshStandardMaterial>[];
  right: Mesh<CylinderGeometry, MeshStandardMaterial>[];
  ties: Array<{ index: number; mesh: Mesh<CylinderGeometry, MeshStandardMaterial> }>;
  supports: Array<{
    index: number;
    stem: Mesh<CylinderGeometry, MeshStandardMaterial>;
    collar: Mesh<CylinderGeometry, MeshStandardMaterial>;
  }>;
}

type MeshBasicLike = MeshStandardMaterial | MeshPhysicalMaterial;

interface SvgTarget {
  group: SVGGElement;
  base: SVGElement;
  glow: SVGCircleElement;
  baseTransform: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";
let nextRendererIdentity = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hexNumber(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function worldToScreen(pos: [number, number, number]): [number, number] {
  return [540 + pos[0] * 88 + pos[2] * 28, 960 - pos[1] * 112 + pos[2] * 14];
}

function impactEnvelope(age: number, velocity: number): number {
  if (age < -1 / 60 || age > 0.22) return 0;
  const adjusted = Math.max(0, age);
  return (1 - adjusted / 0.22) * (0.45 + velocity * 0.75);
}

function dampedResponse(age: number, velocity: number): number {
  if (age < -1 / 90 || age > 0.55) return 0;
  const t = Math.max(0, age);
  const zeta = 0.56;
  const omega0 = 25;
  const decay = Math.exp(-zeta * omega0 * t);
  const wobble = Math.sin(omega0 * Math.sqrt(1 - zeta * zeta) * t);
  return decay * wobble * (0.08 + velocity * 0.18);
}

export function sampleMarbleCamera(path: readonly MarblePathSegment[], t: number, cameraTuning: number): MarbleCameraPose {
  const offsets = [-0.24, -0.12, 0, 0.12, 0.24] as const;
  const weights = [1, 2, 3, 2, 1] as const;
  const focus = new Vector3();
  for (let index = 0; index < offsets.length; index += 1) {
    const sample = sampleMarblePose(path, t + offsets[index]!);
    focus.add(new Vector3(...sample.pos).multiplyScalar(weights[index]!));
  }
  focus.multiplyScalar(1 / weights.reduce((sum, weight) => sum + weight, 0));
  const behind = sampleMarblePose(path, t - 0.18).pos;
  const ahead = sampleMarblePose(path, t + 0.18).pos;
  const lead = new Vector3(ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]).multiplyScalar(0.08);
  const routeDepths = path.flatMap((segment) => [segment.from[2], segment.to[2]]);
  const routeDepthCenter = routeDepths.length ? (Math.min(...routeDepths) + Math.max(...routeDepths)) / 2 : 0;
  const cameraLift = Math.sin(t * 0.33) * 0.04 * cameraTuning;
  const orbit = Math.sin(t * 0.21) * 0.035 * cameraTuning;
  const distance = 8 - (cameraTuning - 0.88) * 0.45;
  const depthOffset = focus.z - routeDepthCenter;
  return {
    position: [focus.x + 0.55 + orbit, focus.y + cameraLift + 12, routeDepthCenter + distance + depthOffset * 0.72],
    lookAt: [focus.x + lead.x, focus.y - 0.42 + lead.y * 0.3, routeDepthCenter + depthOffset * 0.88 + lead.z * 0.08],
    zoom: clamp(1.16 + (cameraTuning - 0.88) * 0.08, 1.08, 1.26),
  };
}

export function blendMarbleCamera(from: MarbleCameraPose, to: MarbleCameraPose, raw: number): MarbleCameraPose {
  const progress = clamp(raw, 0, 1);
  const blend = progress * progress * (3 - 2 * progress);
  return {
    position: from.position.map((value, index) => value + (to.position[index]! - value) * blend) as [number, number, number],
    lookAt: from.lookAt.map((value, index) => value + (to.lookAt[index]! - value) * blend) as [number, number, number],
    zoom: from.zoom + (to.zoom - from.zoom) * blend,
  };
}

function translatePoint(point: [number, number, number], translation: [number, number, number]): [number, number, number] {
  return [point[0] + translation[0], point[1] + translation[1], point[2] + translation[2]];
}

function translateMarblePerformance(performance: MarblePerformance, translation: [number, number, number]): MarblePerformance {
  return {
    ...performance,
    camera: performance.camera.map((keyframe) => ({ ...keyframe, pos: translatePoint(keyframe.pos, translation) })),
    statics: {
      ...performance.statics,
      targets: performance.statics.targets.map((target) => ({
        ...target,
        pos: translatePoint(target.pos, translation),
        contactPos: translatePoint(target.contactPos, translation),
      })),
      path: performance.statics.path.map((segment) => ({
        ...segment,
        from: translatePoint(segment.from, translation),
        to: translatePoint(segment.to, translation),
        ...(segment.control ? { control: translatePoint(segment.control, translation) } : {}),
        ...(segment.control2 ? { control2: translatePoint(segment.control2, translation) } : {}),
      })),
    },
  };
}

export function prepareMarbleActivation(
  active: MarblePerformance,
  incoming: MarblePerformance,
  currentT: number,
  minimumLeadSec = 0.08,
): MarbleActivationBoundary | undefined {
  const activeImpacts = new Map(active.statics.impacts.map((impact) => [impact.noteIndex, impact]));
  const boundaryImpact = incoming.statics.impacts.find((impact) => {
    const activeImpact = activeImpacts.get(impact.noteIndex);
    return impact.t >= currentT + minimumLeadSec && activeImpact !== undefined && Math.abs(activeImpact.t - impact.t) <= 1e-6;
  });
  if (!boundaryImpact) return undefined;
  const activePose = sampleMarblePose(active.statics.path, boundaryImpact.t);
  const incomingPose = sampleMarblePose(incoming.statics.path, boundaryImpact.t);
  const translation: [number, number, number] = [
    activePose.pos[0] - incomingPose.pos[0],
    activePose.pos[1] - incomingPose.pos[1],
    activePose.pos[2] - incomingPose.pos[2],
  ];
  return {
    activationT: boundaryImpact.t,
    noteIndex: boundaryImpact.noteIndex,
    translation,
    performance: translateMarblePerformance(incoming, translation),
    morphTargetCount: 0,
  };
}

function interpolateAngle(from: number, to: number, progress: number): number {
  const delta = ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return from + delta * progress;
}

export function interpolateMarbleTarget(from: MarbleTarget, to: MarbleTarget, raw: number): MarbleTarget {
  const progress = clamp(raw, 0, 1);
  return {
    ...(progress < 1 ? from : to),
    pos: from.pos.map((value, index) => value + (to.pos[index]! - value) * progress) as [number, number, number],
    contactPos: from.contactPos.map((value, index) => value + (to.contactPos[index]! - value) * progress) as [number, number, number],
    rotation: from.rotation.map((value, index) => interpolateAngle(value, to.rotation[index]!, progress)) as [number, number, number],
    size: from.size.map((value, index) => value + (to.size[index]! - value) * progress) as [number, number, number],
  };
}

export function applyMarbleCameraOrbit(
  pose: MarbleCameraPose,
  marblePosition: readonly [number, number, number],
  yaw: number,
  pitch: number,
  distanceDelta: number,
): MarbleCameraPose {
  if (Math.abs(yaw) < 1e-6 && Math.abs(pitch) < 1e-6 && Math.abs(distanceDelta) < 1e-6) return pose;
  const target = new Vector3(...marblePosition);
  const offset = new Vector3(...pose.position).sub(target);
  const radius = Math.max(3.5, offset.length() + distanceDelta);
  offset.normalize().multiplyScalar(radius).applyAxisAngle(new Vector3(0, 1, 0), clamp(yaw, -Math.PI, Math.PI));
  const right = new Vector3(0, 1, 0).cross(offset).normalize();
  if (right.lengthSq() > 1e-8) offset.applyAxisAngle(right, clamp(pitch, -0.8, 0.8));
  return {
    position: target.clone().add(offset).toArray() as [number, number, number],
    lookAt: [...marblePosition],
    zoom: pose.zoom,
  };
}

export function interpolateMarbleTargetRoute(
  from: MarbleTarget,
  to: MarbleTarget,
  raw: number,
  offset: [number, number, number] = [0, 0, 0],
  timing: [number, number] = [0, 1],
): MarbleTarget {
  const progress = clamp((raw - timing[0]) / Math.max(1e-6, timing[1] - timing[0]), 0, 1);
  const target = interpolateMarbleTarget(from, to, progress);
  const envelope = Math.sin(Math.PI * progress);
  return {
    ...target,
    pos: target.pos.map((value, index) => value + offset[index]! * envelope) as [number, number, number],
    contactPos: target.contactPos.map((value, index) => value + offset[index]! * envelope) as [number, number, number],
  };
}

function interpolateOptionalPoint(from: [number, number, number] | undefined, to: [number, number, number] | undefined, progress: number): [number, number, number] | undefined {
  if (!from || !to) return progress < 1 ? from : to;
  return from.map((value, index) => value + (to[index]! - value) * progress) as [number, number, number];
}

export function interpolateMarblePathSegment(from: MarblePathSegment, to: MarblePathSegment, raw: number): MarblePathSegment {
  const progress = clamp(raw, 0, 1);
  const result: MarblePathSegment = {
    ...(progress < 1 ? from : to),
    from: from.from.map((value, index) => value + (to.from[index]! - value) * progress) as [number, number, number],
    to: from.to.map((value, index) => value + (to.to[index]! - value) * progress) as [number, number, number],
    arcHeight: (from.arcHeight ?? 0) + ((to.arcHeight ?? 0) - (from.arcHeight ?? 0)) * progress,
  };
  const control = interpolateOptionalPoint(from.control, to.control, progress);
  const control2 = interpolateOptionalPoint(from.control2, to.control2, progress);
  if (control) result.control = control;
  else delete result.control;
  if (control2) result.control2 = control2;
  else delete result.control2;
  return result;
}

export function marblePlatformTransitionProgress(raw: number): number {
  const progress = clamp(raw, 0, 1);
  return progress * progress * (3 - 2 * progress);
}

export function marblePlatformTransitionDuration(fromTargets: ReadonlyMap<string, MarbleTarget>, toTargets: ReadonlyMap<string, MarbleTarget>): number {
  let maxDistance = 0;
  let maxAngle = 0;
  let maxCarrierDelta = 0;
  for (const [targetId, from] of fromTargets) {
    const to = toTargets.get(targetId);
    if (!to) continue;
    maxDistance = Math.max(maxDistance, Math.hypot(...from.pos.map((value, index) => to.pos[index]! - value)));
    maxAngle = Math.max(maxAngle, ...from.rotation.map((value, index) => Math.abs(interpolateAngle(value, to.rotation[index]!, 1) - value)));
    const fromCarrier = marblePlatformCarrierTransform(from);
    const toCarrier = marblePlatformCarrierTransform(to);
    maxCarrierDelta = Math.max(maxCarrierDelta, Math.hypot(...fromCarrier.scale.map((value, index) => toCarrier.scale[index]! - value)));
  }
  return Math.round(clamp(Math.max(450, maxDistance * 200, maxAngle * 260, maxCarrierDelta * 320), 450, 1400));
}

export function interpolateMarblePlatformCarrier(from: MarbleTarget, to: MarbleTarget, raw: number): MarblePlatformCarrierTransform {
  return interpolateMarblePlatformCarrierTransform(marblePlatformCarrierTransform(from), marblePlatformCarrierTransform(to), raw);
}

export function interpolateMarblePlatformCarrierTransform(fromTransform: MarblePlatformCarrierTransform, toTransform: MarblePlatformCarrierTransform, raw: number): MarblePlatformCarrierTransform {
  const progress = clamp(raw, 0, 1);
  return {
    scale: fromTransform.scale.map((value, index) => value + (toTransform.scale[index]! - value) * progress) as [number, number, number],
    position: fromTransform.position.map((value, index) => value + (toTransform.position[index]! - value) * progress) as [number, number, number],
  };
}

export function prepareMarblePerformanceTransition(
  active: MarblePerformance,
  incoming: MarblePerformance,
  currentT: number,
): MarblePerformance {
  const activePose = sampleMarblePose(active.statics.path, currentT);
  const incomingPose = sampleMarblePose(incoming.statics.path, currentT);
  return translateMarblePerformance(incoming, [
    activePose.pos[0] - incomingPose.pos[0],
    activePose.pos[1] - incomingPose.pos[1],
    activePose.pos[2] - incomingPose.pos[2],
  ]);
}

function v3(value: [number, number, number], zOffset = 0): Vector3 {
  return new Vector3(value[0], value[1], value[2] + zOffset);
}

function railSideAt(points: readonly Vector3[], index: number): Vector3 {
  const previous = points[Math.max(0, index - 1)] ?? points[index]!;
  const next = points[Math.min(points.length - 1, index + 1)] ?? points[index]!;
  const tangent = next.clone().sub(previous);
  const side = new Vector3(-tangent.y, tangent.x, 0);
  if (side.lengthSq() < 0.0001) return new Vector3(1, 0, 0);
  return side.normalize();
}

function positionCylinder(mesh: Mesh<CylinderGeometry, MeshStandardMaterial>, from: Vector3, to: Vector3, radius: number): void {
  const direction = to.clone().sub(from);
  const length = Math.max(0.0001, direction.length());
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.scale.set(radius, length, radius);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.multiplyScalar(1 / length));
}

function makeNoiseTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const image = context.createImageData(canvas.width, canvas.height);
    for (let index = 0; index < image.data.length; index += 4) {
      const value = 32 + ((index * 17 + Math.floor(index / 11) * 29) % 34);
      image.data[index] = value;
      image.data[index + 1] = value + 6;
      image.data[index + 2] = value + 12;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material as Material & Record<string, unknown>)) {
    if (value instanceof Texture) value.dispose();
  }
  material.dispose();
}

function createCompatibleWebGlContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const context = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!context) throw new Error("Marble Music requires WebGL2 support");
  const originalGetParameter = context.getParameter.bind(context);
  context.getParameter = ((parameter: number) => {
    const value = originalGetParameter(parameter);
    if (value !== null && value !== undefined) return value;
    if (parameter === context.VERSION) return "WebGL 2.0";
    if (parameter === context.SHADING_LANGUAGE_VERSION) return "WebGL GLSL ES 3.00";
    if (parameter === context.VENDOR) return "Chromium";
    if (parameter === context.RENDERER) return "WebGL";
    if (parameter === context.MAX_COMBINED_TEXTURE_IMAGE_UNITS) return 16;
    if (parameter === context.MAX_TEXTURE_IMAGE_UNITS) return 8;
    if (parameter === context.MAX_VERTEX_TEXTURE_IMAGE_UNITS) return 4;
    if (parameter === context.MAX_TEXTURE_SIZE) return 4096;
    if (parameter === context.MAX_CUBE_MAP_TEXTURE_SIZE) return 4096;
    if (parameter === context.MAX_VERTEX_ATTRIBS) return 16;
    if (parameter === context.MAX_VERTEX_UNIFORM_VECTORS) return 1024;
    if (parameter === context.MAX_FRAGMENT_UNIFORM_VECTORS) return 1024;
    if (parameter === context.MAX_VARYING_VECTORS) return 8;
    if (parameter === context.VIEWPORT) return [0, 0, canvas.width || 1080, canvas.height || 1920];
    if (parameter === context.SCISSOR_BOX) return [0, 0, canvas.width || 1080, canvas.height || 1920];
    return value;
  }) as typeof context.getParameter;
  const originalPrecision = context.getShaderPrecisionFormat.bind(context);
  context.getShaderPrecisionFormat = ((shaderType: number, precisionType: number) => {
    return originalPrecision(shaderType, precisionType) ?? { rangeMin: 127, rangeMax: 127, precision: 23 };
  }) as typeof context.getShaderPrecisionFormat;
  const originalAttributes = context.getContextAttributes.bind(context);
  context.getContextAttributes = (() => {
    return originalAttributes() ?? {
      alpha: false,
      antialias: true,
      depth: true,
      desynchronized: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: "default",
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false,
    };
  }) as typeof context.getContextAttributes;
  const originalProgramInfoLog = context.getProgramInfoLog.bind(context);
  context.getProgramInfoLog = ((program: WebGLProgram) => originalProgramInfoLog(program) ?? "") as typeof context.getProgramInfoLog;
  const originalShaderInfoLog = context.getShaderInfoLog.bind(context);
  context.getShaderInfoLog = ((shader: WebGLShader) => originalShaderInfoLog(shader) ?? "") as typeof context.getShaderInfoLog;
  return context;
}

interface TargetPrimitivePool {
  box: BoxGeometry;
  cylinder: CylinderGeometry;
  sphere: SphereGeometry;
}

interface TargetMaterialPool {
  darkMetal: MeshStandardMaterial;
  screwMetal: MeshStandardMaterial;
  accent: MeshStandardMaterial;
}

function addTargetHardware(target: MarbleTarget, group: Group, geometry: TargetPrimitivePool, materials: TargetMaterialPool): { group: Group; carrier: Mesh<BoxGeometry, MeshStandardMaterial> } {
  const hardware = new Group();
  const visualSize = marblePlatformVisualSize(target);
  const carrierTransform = marblePlatformCarrierTransform(target);
  const carrier = new Mesh(geometry.box, materials.accent);
  carrier.scale.set(...carrierTransform.scale);
  carrier.position.set(...carrierTransform.position);
  hardware.add(carrier);

  const screwOffsetX = visualSize[0] * 0.38;
  const screwOffsetZ = visualSize[2] * 0.32;
  for (const [x, z] of [[-screwOffsetX, -screwOffsetZ], [screwOffsetX, -screwOffsetZ], [-screwOffsetX, screwOffsetZ], [screwOffsetX, screwOffsetZ]] as const) {
    const screw = new Mesh(geometry.cylinder, materials.screwMetal);
    screw.scale.set(0.045, 0.025, 0.045);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, visualSize[1] * 0.72, z);
    hardware.add(screw);
    const slot = new Mesh(geometry.box, materials.darkMetal);
    slot.scale.set(0.062, 0.01, 0.012);
    slot.position.set(x, visualSize[1] * 0.737, z);
    slot.rotation.y = (x + z) > 0 ? 0.6 : -0.6;
    hardware.add(slot);
  }

  const bracketLength = Math.max(0.52, visualSize[0] * 0.55);
  const bracket = new Mesh(geometry.cylinder, materials.darkMetal);
  bracket.scale.set(0.018, bracketLength, 0.018);
  bracket.rotation.z = Math.PI / 2;
  bracket.position.set(-visualSize[0] * 0.55, -0.2, -0.22);
  hardware.add(bracket);
  group.add(hardware);
  return { group: hardware, carrier };
}

export class MarbleScene {
  readonly backendKind = "three";
  readonly tuning: MarbleTuning;
  #performance: MarblePerformance;
  readonly #renderer: WebGLRenderer;
  readonly #now: () => number;
  readonly #rendererIdentity = nextRendererIdentity++;
  readonly #primitiveGeometry = {
    box: new BoxGeometry(1, 1, 1),
    cylinder: new CylinderGeometry(1, 1, 1, 18),
    sphere: new SphereGeometry(1, 20, 12),
    circle: new CircleGeometry(1, 28),
  };
  readonly #sharedMaterials = {
    darkMetal: new MeshStandardMaterial({ color: 0x1d232b, metalness: 0.82, roughness: 0.23 }),
    screwMetal: new MeshStandardMaterial({ color: 0xdcecf4, metalness: 0.66, roughness: 0.18 }),
    rod: new MeshStandardMaterial({ color: 0x1b1d23, metalness: 0.75, roughness: 0.26 }),
    rail: new MeshStandardMaterial({ color: 0x75c5d0, emissive: 0x0e2c36, emissiveIntensity: 0.12, metalness: 0.54, roughness: 0.38, transparent: true, opacity: 0.62 }),
    support: new MeshStandardMaterial({ color: 0x151a20, metalness: 0.8, roughness: 0.26 }),
    tie: new MeshStandardMaterial({ color: 0x24323b, metalness: 0.38, roughness: 0.45 }),
  };
  readonly #targetMaterials = new Map<string, MeshStandardMaterial>();
  readonly #accentMaterials = new Map<string, MeshStandardMaterial>();
  readonly #sharedGeometries = new Set<BufferGeometry>(Object.values(this.#primitiveGeometry));
  readonly #sharedMaterialSet = new Set<Material>(Object.values(this.#sharedMaterials));
  readonly #scene = new Scene();
  readonly #camera: PerspectiveCamera;
  readonly #targetMeshes = new Map<string, TargetMeshes>();
  readonly #railMeshes = new Map<string, RailMeshes>();
  readonly #impactByTarget = new Map<string, MarbleImpact[]>();
  readonly #machine = new Group();
  readonly #performanceObjects = new Group();
  readonly #rails = new Group();
  readonly #marble: Mesh<SphereGeometry, MeshPhysicalMaterial>;
  readonly #marbleGlow: PointLight;
  readonly #marbleShadow: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly #svg: SVGSVGElement;
  readonly #svgTargetLayer: SVGGElement;
  readonly #svgTargets = new Map<string, SvgTarget>();
  readonly #svgMarble: SVGGElement;
  readonly #svgMarbleGlow: SVGCircleElement;
  readonly #svgMarbleCore: SVGCircleElement;
  #disposed = false;
  #performanceUpdates = 0;
  #platformTransition: MarblePlatformTransition | undefined;
  #cameraTransition: { path: readonly MarblePathSegment[]; startT: number; durationSec: number } | undefined;
  #completedActivation: MarbleSceneActivation | undefined;

  #targetMaterial(target: MarbleTarget): MeshStandardMaterial {
    const key = `${target.material}:${target.color}`;
    const cached = this.#targetMaterials.get(key);
    if (cached) return cached;
    const color = hexNumber(target.color);
    const material = target.material === "brass"
      ? new MeshStandardMaterial({ color: 0xd6a63e, metalness: 0.72, roughness: 0.28 })
      : target.material === "rubber"
        ? new MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.72 })
        : target.material === "glow"
          ? new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.24, metalness: 0.18, roughness: 0.32 })
          : new MeshStandardMaterial({ color, metalness: 0.42, roughness: 0.36 });
    this.#targetMaterials.set(key, material);
    this.#sharedMaterialSet.add(material);
    return material;
  }

  #accentMaterial(colorValue: string): MeshStandardMaterial {
    const cached = this.#accentMaterials.get(colorValue);
    if (cached) return cached;
    const color = hexNumber(colorValue);
    const material = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.16, metalness: 0.22, roughness: 0.3, transparent: true, opacity: 0.8 });
    this.#accentMaterials.set(colorValue, material);
    this.#sharedMaterialSet.add(material);
    return material;
  }

  constructor(canvas: HTMLCanvasElement, performance: MarblePerformance, tuning?: MarbleTuning, now: () => number = () => 0) {
    this.tuning = tuning ?? { glow: 0.78, camera: 0.88, cameraOrbitYaw: 0, cameraOrbitPitch: 0, cameraOrbitDistance: 0, targetScale: 1, tail: 0.8 };
    this.#performance = performance;
    this.#now = now;
    this.#renderer = new WebGLRenderer({ canvas, context: createCompatibleWebGlContext(canvas), antialias: true, alpha: false });
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.setPixelRatio(1);
    this.#renderer.outputColorSpace = SRGBColorSpace;
    const svgOverlay = this.#createSvgOverlay(canvas);
    this.#svg = svgOverlay.svg;
    this.#svgTargetLayer = svgOverlay.targetLayer;
    this.#svgMarble = svgOverlay.marble;
    this.#svgMarbleGlow = svgOverlay.marbleGlow;
    this.#svgMarbleCore = svgOverlay.marbleCore;
    this.#scene.background = new Color(0x08111d);
    this.#camera = new PerspectiveCamera(32, performance.resolution.w / performance.resolution.h, 0.1, 100);
    this.#camera.position.set(0, 0, 15);
    this.#scene.add(new AmbientLight(0x9bbcff, 0.55));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(-4, 8, 8);
    this.#scene.add(key);
    const fill = new DirectionalLight(0x70d9ff, 0.7);
    fill.position.set(5, -3, 5);
    this.#scene.add(fill);
    this.#scene.add(this.#machine);
    this.#addWall();
    this.#machine.add(this.#performanceObjects);
    this.#addTargets();
    this.#addRods();
    this.#addRails();
    this.#marble = new Mesh(
      new SphereGeometry(0.28, 36, 20),
      new MeshPhysicalMaterial({ color: 0xf5fcff, roughness: 0.08, metalness: 0.05, transmission: 0.2, thickness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 }),
    );
    this.#marbleShadow = new Mesh(
      new CircleGeometry(0.36, 36),
      new MeshBasicMaterial({ color: 0x02080f, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.#marbleGlow = new PointLight(0x8df5ff, 1.1, 3.2);
    this.#machine.add(this.#marbleShadow, this.#marble, this.#marbleGlow);
  }

  #createSvgOverlay(canvas: HTMLCanvasElement): { svg: SVGSVGElement; targetLayer: SVGGElement; marble: SVGGElement; marbleGlow: SVGCircleElement; marbleCore: SVGCircleElement } {
    const parent = canvas.parentElement;
    parent?.querySelectorAll(".marble-svg-overlay").forEach((entry) => entry.remove());

    const svg = svgElement("svg");
    svg.classList.add("marble-svg-overlay");
    svg.setAttribute("viewBox", "0 0 1080 1920");
    svg.setAttribute("aria-hidden", "true");
    Object.assign(svg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "1",
      display: "none",
    });

    const defs = svgElement("defs");
    const glowFilter = svgElement("filter");
    glowFilter.id = "marble-svg-glow";
    glowFilter.setAttribute("x", "-80%");
    glowFilter.setAttribute("y", "-80%");
    glowFilter.setAttribute("width", "260%");
    glowFilter.setAttribute("height", "260%");
    const blur = svgElement("feGaussianBlur");
    blur.setAttribute("stdDeviation", "10");
    blur.setAttribute("result", "blur");
    const merge = svgElement("feMerge");
    const blurNode = svgElement("feMergeNode");
    blurNode.setAttribute("in", "blur");
    const sourceNode = svgElement("feMergeNode");
    sourceNode.setAttribute("in", "SourceGraphic");
    merge.append(blurNode, sourceNode);
    glowFilter.append(blur, merge);
    defs.append(glowFilter);
    svg.append(defs);

    const wall = svgElement("rect");
    wall.setAttribute("x", "18");
    wall.setAttribute("y", "18");
    wall.setAttribute("width", "1044");
    wall.setAttribute("height", "1884");
    wall.setAttribute("rx", "34");
    wall.setAttribute("fill", "#0b1728");
    wall.setAttribute("stroke", "#29415b");
    wall.setAttribute("stroke-width", "2");
    wall.setAttribute("opacity", "0.94");
    svg.append(wall);

    const targetLayer = svgElement("g");
    targetLayer.classList.add("marble-svg-targets");
    svg.append(targetLayer);
    this.#addSvgTargets(targetLayer);

    const marble = svgElement("g");
    marble.setAttribute("filter", "url(#marble-svg-glow)");
    const marbleGlow = svgElement("circle");
    marbleGlow.setAttribute("r", "54");
    marbleGlow.setAttribute("fill", "#91f5ff");
    marbleGlow.setAttribute("opacity", "0.22");
    const marbleCore = svgElement("circle");
    marbleCore.setAttribute("r", "28");
    marbleCore.setAttribute("fill", "#f5fcff");
    marbleCore.setAttribute("stroke", "#7de7ff");
    marbleCore.setAttribute("stroke-width", "5");
    const marbleShine = svgElement("circle");
    marbleShine.setAttribute("cx", "-9");
    marbleShine.setAttribute("cy", "-11");
    marbleShine.setAttribute("r", "9");
    marbleShine.setAttribute("fill", "#ffffff");
    marbleShine.setAttribute("opacity", "0.72");
    marble.append(marbleGlow, marbleCore, marbleShine);
    svg.append(marble);

    parent?.append(svg);
    return { svg, targetLayer, marble, marbleGlow, marbleCore };
  }

  #addSvgTargets(targetLayer = this.#svgTargetLayer): void {
    for (const target of this.#performance.statics.targets) {
      const [x, y] = worldToScreen(target.pos);
      const group = svgElement("g");
      const baseTransform = `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(target.rotation[2] * 57.2958).toFixed(2)})`;
      group.setAttribute("transform", baseTransform);
      const glow = svgElement("circle");
      glow.setAttribute("r", "44");
      glow.setAttribute("fill", target.color);
      glow.setAttribute("opacity", "0.08");
      glow.setAttribute("filter", "url(#marble-svg-glow)");
      const base = svgElement("rect");
      const visualSize = marblePlatformVisualSize(target);
      const width = Math.max(42, visualSize[0] * 88);
      const height = Math.max(16, visualSize[2] * 52);
      base.setAttribute("x", String(-width / 2));
      base.setAttribute("y", String(-height / 2));
      base.setAttribute("width", String(width));
      base.setAttribute("height", String(height));
      base.setAttribute("rx", "8");
      base.setAttribute("fill", target.material === "brass" ? "#d6a63e" : target.color);
      base.setAttribute("stroke", "#dff8ff");
      base.setAttribute("stroke-width", "2");
      base.setAttribute("opacity", "0.92");
      group.append(glow, base);
      targetLayer.append(group);
      this.#svgTargets.set(target.id, { group, base, glow, baseTransform });
    }
  }

  #addWall(): void {
    const texture = makeNoiseTexture();
    const wall = new Mesh(
      new PlaneGeometry(9.2, 16.2, 1, 1),
      new MeshStandardMaterial({ color: 0x182536, roughness: 0.88, metalness: 0.02, map: texture }),
    );
    wall.position.set(0, 0, -0.42);
    this.#machine.add(wall);
    const frameMaterial = new MeshStandardMaterial({ color: 0x263748, metalness: 0.34, roughness: 0.42 });
    const top = new Mesh(new BoxGeometry(9.5, 0.08, 0.16), frameMaterial.clone());
    top.position.set(0, 8.18, -0.34);
    const bottom = new Mesh(new BoxGeometry(9.5, 0.08, 0.16), frameMaterial.clone());
    bottom.position.set(0, -8.18, -0.34);
    const left = new Mesh(new BoxGeometry(0.08, 16.4, 0.16), frameMaterial.clone());
    left.position.set(-4.72, 0, -0.34);
    const right = new Mesh(new BoxGeometry(0.08, 16.4, 0.16), frameMaterial.clone());
    right.position.set(4.72, 0, -0.34);
    this.#machine.add(top, bottom, left, right);
  }

  #addTargets(): void {
    const visibleTargetIds = marbleVisibleTargetIds(this.#performance.statics.targets);
    for (const impact of this.#performance.statics.impacts) {
      const list = this.#impactByTarget.get(impact.targetId) ?? [];
      list.push(impact);
      this.#impactByTarget.set(impact.targetId, list);
    }
    for (const target of this.#performance.statics.targets) {
      const group = new Group();
      group.position.set(...target.pos);
      group.rotation.set(target.rotation[0], target.rotation[1], target.rotation[2]);
      const compact = target.kind === "peg" || target.kind === "chime";
      const base = new Mesh(this.#primitiveGeometry.box, this.#targetMaterial(target));
      const baseScale = new Vector3(...target.size);
      base.scale.copy(baseScale);
      base.visible = false;
      const hardware = addTargetHardware(target, group, this.#primitiveGeometry, {
        darkMetal: this.#sharedMaterials.darkMetal,
        screwMetal: this.#sharedMaterials.screwMetal,
        accent: this.#accentMaterial(target.color),
      });
      hardware.group.rotation.y = target.visualRoll ?? 0;
      group.add(base);
      const glowMaterial = new MeshStandardMaterial({ color: hexNumber(target.color), emissive: hexNumber(target.color), emissiveIntensity: 0, transparent: true, opacity: 0 });
      const glow = new Mesh(this.#primitiveGeometry.sphere, glowMaterial);
      glow.position.copy(group.position);
      glow.scale.setScalar(1);
      const shadow = new Mesh(
        this.#primitiveGeometry.circle,
        new MeshBasicMaterial({ color: 0x020813, transparent: true, opacity: 0.2, depthWrite: false }),
      );
      shadow.position.set(target.pos[0] - 0.08, target.pos[1] - 0.1, -0.405);
      shadow.scale.set(1.4, 0.46, 1);
      const visible = visibleTargetIds.has(target.id);
      group.visible = visible;
      shadow.visible = visible;
      glow.visible = visible;
      this.#targetMeshes.set(target.id, { group, base, home: group.position.clone(), baseRotation: [group.rotation.x, group.rotation.y, group.rotation.z], baseScale, glow, shadow, hardware: hardware.group, carrier: hardware.carrier, compact });
      this.#performanceObjects.add(shadow, group, glow);
    }
  }

  #addRods(): void {
    const targets = this.#performance.statics.targets;
    for (const target of targets) {
      const rod = new Mesh(this.#primitiveGeometry.cylinder, this.#sharedMaterials.rod);
      rod.scale.set(0.026, 0.86, 0.026);
      rod.position.set(target.pos[0] - 0.44, target.pos[1] - 0.18, target.pos[2] - 0.18);
      rod.rotation.z = Math.PI / 2 + target.rotation[2] * 0.45;
      const meshes = this.#targetMeshes.get(target.id);
      if (meshes) meshes.rod = rod;
      this.#performanceObjects.add(rod);
    }
  }

  #segmentPoints(segment: MarblePathSegment): Vector3[] {
    const steps = segment.kind === "arc" ? 20 : 12;
    const c0 = segment.control ? v3(segment.control, -0.18) : v3(segment.from, -0.18).lerp(v3(segment.to, -0.18), 1 / 3);
    const c1 = segment.control2 ? v3(segment.control2, -0.18) : v3(segment.from, -0.18).lerp(v3(segment.to, -0.18), 2 / 3);
    const curve = new CubicBezierCurve3(v3(segment.from, -0.18), c0, c1, v3(segment.to, -0.18));
    const points: Vector3[] = [];
    for (let index = 0; index <= steps; index += 1) {
      const raw = index / steps;
      const point = curve.getPoint(raw);
      if (segment.kind === "arc") {
        const lift = Math.sin(raw * Math.PI) * (segment.arcHeight ?? 0.32);
        point.y += lift;
        point.z += lift * 0.34;
      }
      points.push(point);
    }
    return points;
  }

  #addRails(): void {
    for (const segment of this.#performance.statics.path) {
      if (segment.kind !== "rail") continue;
      const points = this.#segmentPoints(segment);
      if (points.length < 2) continue;
      const left = Array.from({ length: points.length - 1 }, () => new Mesh(this.#primitiveGeometry.cylinder, this.#sharedMaterials.rail));
      const right = Array.from({ length: points.length - 1 }, () => new Mesh(this.#primitiveGeometry.cylinder, this.#sharedMaterials.rail));
      const ties = Array.from({ length: Math.max(0, Math.ceil((points.length - 2) / 4)) }, (_, tieIndex) => ({
        index: 1 + tieIndex * 4,
        mesh: new Mesh(this.#primitiveGeometry.cylinder, this.#sharedMaterials.tie),
      })).filter((entry) => entry.index < points.length - 1);
      const supportIndexes = Array.from(new Set([0, Math.floor(points.length / 2), points.length - 1]));
      const supports = supportIndexes.map((index) => ({
        index,
        stem: new Mesh(this.#primitiveGeometry.cylinder, this.#sharedMaterials.support),
        collar: new Mesh(this.#primitiveGeometry.cylinder, this.#sharedMaterials.support),
      }));
      const meshes: RailMeshes = { left, right, ties, supports };
      this.#railMeshes.set(segment.id, meshes);
      this.#rails.add(...left, ...right, ...ties.map((entry) => entry.mesh), ...supports.flatMap((entry) => [entry.stem, entry.collar]));
      this.#applyRailVisual(segment, meshes);
    }
    this.#performanceObjects.add(this.#rails);
  }

  #applyRailVisual(segment: MarblePathSegment, meshes: RailMeshes): void {
    const points = this.#segmentPoints(segment);
    if (points.length < 2) return;
    const railGap = 0.115;
    const leftPoints = points.map((point, index) => point.clone().add(railSideAt(points, index).multiplyScalar(railGap)));
    const rightPoints = points.map((point, index) => point.clone().add(railSideAt(points, index).multiplyScalar(-railGap)));
    for (let index = 0; index < Math.min(meshes.left.length, leftPoints.length - 1); index += 1) {
      positionCylinder(meshes.left[index]!, leftPoints[index]!, leftPoints[index + 1]!, 0.018);
      positionCylinder(meshes.right[index]!, rightPoints[index]!, rightPoints[index + 1]!, 0.018);
    }
    for (const tie of meshes.ties) {
      const point = points[tie.index];
      if (!point) continue;
      const side = railSideAt(points, tie.index).multiplyScalar(railGap * 1.21);
      positionCylinder(tie.mesh, point.clone().sub(side), point.clone().add(side), 0.012);
    }
    for (const support of meshes.supports) {
      const point = points[support.index];
      if (!point) continue;
      const floor = new Vector3(point.x, point.y, -0.42);
      positionCylinder(support.stem, floor, point, 0.016);
      support.collar.scale.set(0.038, 0.018, 0.038);
      support.collar.position.copy(point);
      support.collar.rotation.x = Math.PI / 2;
    }
  }

  #targetIntensity(targetId: string, t: number): number {
    const impacts = this.#impactByTarget.get(targetId) ?? [];
    let intensity = 0;
    for (const impact of impacts) intensity = Math.max(intensity, impactEnvelope(t - impact.t, impact.velocity));
    if (this.#performance.statics.tail.resonanceTargets.includes(targetId) && this.#performance.statics.tail.hasAudibleTail) {
      const tail = this.#performance.statics.tail;
      const progress = clamp((t - tail.finalNoteT) / Math.max(0.001, tail.audioEndT - tail.finalNoteT), 0, 1);
      const energyCurve = this.#performance.curves.energy;
      const energy = energyCurve ? sampleCurve(energyCurve, t) : 0.35;
      intensity = Math.max(intensity, (1 - progress) * energy * this.tuning.tail * 0.55);
    }
    return intensity * this.tuning.glow;
  }

  #targetRecoil(targetId: string, t: number): number {
    const impacts = this.#impactByTarget.get(targetId) ?? [];
    let response = 0;
    for (const impact of impacts) response += dampedResponse(t - impact.t, impact.velocity);
    return clamp(response, -0.18, 0.26);
  }

  #renderSvg(t: number, pose: MarblePose, pulse: number): void {
    const [x, y] = worldToScreen(pose.pos);
    this.#svgMarble.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(pose.spin * 57.2958).toFixed(2)}) scale(${(1 + pulse * 0.18).toFixed(3)})`);
    this.#svgMarbleGlow.setAttribute("opacity", String(clamp(0.26 + pulse * 0.48, 0.18, 0.85)));
    this.#svgMarbleCore.setAttribute("stroke-width", String(5 + pulse * 8));
    for (const [targetId, target] of this.#svgTargets) {
      const intensity = this.#targetIntensity(targetId, t);
      target.group.setAttribute("opacity", String(clamp(0.72 + intensity * 0.3, 0.65, 1)));
      target.group.setAttribute("transform", target.baseTransform);
      target.glow.setAttribute("r", String(44 + intensity * 24));
      target.glow.setAttribute("opacity", String(clamp(0.06 + intensity * 0.34, 0.04, 0.48)));
      target.base.setAttribute("stroke-width", String(2 + intensity * 4));
    }
  }

  #platformTransitionState(nowMs: number): { targets: Map<string, MarbleTarget>; carriers: Map<string, MarblePlatformCarrierTransform>; path: Map<string, MarblePathSegment> } {
    const transition = this.#platformTransition;
    if (!transition) {
      const targets = new Map(this.#performance.statics.targets.map((target) => [target.id, target]));
      return {
        targets,
        carriers: new Map([...targets].map(([targetId, target]) => [targetId, marblePlatformCarrierTransform(target)])),
        path: new Map(this.#performance.statics.path.map((segment) => [segment.id, segment])),
      };
    }
    const progress = marblePlatformTransitionProgress((nowMs - transition.startedAtMs) / transition.durationMs);
    const targets = new Map([...transition.fromTargets].map(([targetId, from]) => {
      const to = transition.toTargets.get(targetId);
      return [targetId, to ? interpolateMarbleTargetRoute(from, to, progress, transition.targetOffsets.get(targetId), transition.targetTimings.get(targetId)) : from];
    }));
    const carriers = new Map([...transition.fromCarriers].map(([targetId, from]) => {
      const to = transition.toCarriers.get(targetId);
      return [targetId, to ? interpolateMarblePlatformCarrierTransform(from, to, progress) : from];
    }));
    const path = new Map([...transition.fromPath].map(([segmentId, from]) => {
      const to = transition.toPath.get(segmentId);
      return [segmentId, to ? interpolateMarblePathSegment(from, to, progress) : from];
    }));
    return { targets, carriers, path };
  }

  #renderPlatformTransition(nowMs: number): void {
    const transition = this.#platformTransition;
    if (!transition) return;
    const raw = clamp((nowMs - transition.startedAtMs) / transition.durationMs, 0, 1);
    const progress = marblePlatformTransitionProgress(raw);
    for (const [targetId, from] of transition.fromTargets) {
      const to = transition.toTargets.get(targetId);
      const meshes = this.#targetMeshes.get(targetId);
      if (!to || !meshes) continue;
      this.#applyTargetVisual(
        interpolateMarbleTargetRoute(from, to, progress, transition.targetOffsets.get(targetId), transition.targetTimings.get(targetId)),
        meshes,
        this.#svgTargets.get(targetId),
        interpolateMarblePlatformCarrierTransform(
          transition.fromCarriers.get(targetId) ?? marblePlatformCarrierTransform(from),
          transition.toCarriers.get(targetId) ?? marblePlatformCarrierTransform(to),
          clamp((progress - (transition.targetTimings.get(targetId)?.[0] ?? 0)) / Math.max(1e-6, (transition.targetTimings.get(targetId)?.[1] ?? 1) - (transition.targetTimings.get(targetId)?.[0] ?? 0)), 0, 1),
        ),
      );
    }
    for (const [segmentId, from] of transition.fromPath) {
      const to = transition.toPath.get(segmentId);
      const meshes = this.#railMeshes.get(segmentId);
      if (to && meshes) this.#applyRailVisual(interpolateMarblePathSegment(from, to, progress), meshes);
    }
    if (raw < 1) return;
    const previousPath = this.#performance.statics.path;
    const startedAt = this.#now();
    const performance = transition.performance;
    this.#platformTransition = undefined;
    this.replacePerformance(performance);
    this.#cameraTransition = { path: previousPath, startT: transition.songT, durationSec: 0.35 };
    this.#completedActivation = {
      activationT: transition.songT,
      noteIndex: -1,
      applicationMs: this.#now() - startedAt,
      motionMix: { ...performance.statics.motionMix },
    };
  }

  renderFrame(t: number): void {
    if (this.#disposed) return;
    this.#renderPlatformTransition(this.#now());
    const pose = sampleMarblePose(this.#performance.statics.path, t);
    this.#marble.position.set(...pose.pos);
    this.#marble.quaternion.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]);
    const shadowScale = clamp(1.25 - pose.pos[2] * 0.42, 0.46, 1.35);
    this.#marbleShadow.position.set(pose.pos[0] - 0.08, pose.pos[1] - 0.12, -0.398);
    this.#marbleShadow.scale.set(shadowScale * 1.25, shadowScale * 0.58, 1);
    this.#marbleShadow.material.opacity = clamp(0.28 - pose.pos[2] * 0.06 + (pose.contact ? 0.1 : 0), 0.06, 0.36);
    const currentImpact = this.#performance.statics.impacts.reduce((best, impact) => {
      const age = Math.abs(t - impact.t);
      return age < best.age ? { age, impact } : best;
    }, { age: Number.POSITIVE_INFINITY, impact: undefined as MarbleImpact | undefined }).impact;
    const pulse = currentImpact ? impactEnvelope(t - currentImpact.t, currentImpact.velocity) : 0;
    this.#renderSvg(t, pose, pulse);
    this.#marble.scale.setScalar(1 + pulse * 0.16);
    this.#marbleGlow.position.copy(this.#marble.position);
    this.#marbleGlow.intensity = 0.42 + pulse * 1.8;
    for (const [targetId, meshes] of this.#targetMeshes) {
      const intensity = this.#targetIntensity(targetId, t);
      const recoil = this.#targetRecoil(targetId, t);
      meshes.group.position.set(meshes.home.x, meshes.home.y, meshes.home.z + recoil);
      meshes.group.rotation.set(
        meshes.baseRotation[0] + recoil * 0.35,
        meshes.baseRotation[1] - recoil * 0.22,
        meshes.baseRotation[2] + Math.sin(t * 20 + targetId.length) * intensity * 0.08,
      );
      meshes.base.scale.set(
        meshes.baseScale.x * this.tuning.targetScale * (1 + intensity * 0.08),
        meshes.baseScale.y * this.tuning.targetScale * (1 - Math.max(0, recoil) * 0.18),
        meshes.baseScale.z * this.tuning.targetScale * (1 + intensity * 0.05),
      );
      meshes.hardware.scale.setScalar(1 + intensity * 0.035);
      meshes.glow.material.opacity = clamp(intensity * 0.18, 0, 0.16);
      meshes.glow.material.emissiveIntensity = intensity * 1.25;
      meshes.glow.position.set(meshes.home.x, meshes.home.y, meshes.home.z + recoil * 0.6);
      meshes.glow.scale.setScalar(0.42 * (0.48 + intensity * 0.45 + Math.abs(recoil) * 0.7));
      meshes.shadow.position.set(meshes.home.x - 0.08 - recoil * 0.25, meshes.home.y - 0.1 - recoil * 0.12, -0.405);
      meshes.shadow.material.opacity = clamp(0.16 + intensity * 0.1, 0.08, 0.28);
      meshes.shadow.scale.set(0.42 * (1.4 + Math.abs(recoil) * 2.2), 0.42 * (0.46 + Math.abs(recoil) * 0.42), 1);
    }
    let cameraPose = sampleMarbleCamera(this.#performance.statics.path, t, this.tuning.camera);
    if (this.#cameraTransition) {
      const raw = (t - this.#cameraTransition.startT) / this.#cameraTransition.durationSec;
      if (raw >= 1) {
        this.#cameraTransition = undefined;
      } else if (raw >= 0) {
        const from = sampleMarbleCamera(this.#cameraTransition.path, t, this.tuning.camera);
        cameraPose = blendMarbleCamera(from, cameraPose, raw);
      }
    }
    cameraPose = applyMarbleCameraOrbit(
      cameraPose,
      sampleMarblePose(this.#performance.statics.path, t).pos,
      this.tuning.cameraOrbitYaw,
      this.tuning.cameraOrbitPitch,
      this.tuning.cameraOrbitDistance,
    );
    this.#camera.position.set(...cameraPose.position);
    this.#camera.zoom = cameraPose.zoom;
    this.#camera.updateProjectionMatrix();
    this.#camera.lookAt(...cameraPose.lookAt);
    this.#renderer.render(this.#scene, this.#camera);
  }

  #applyTargetVisual(target: MarbleTarget, meshes: TargetMeshes, svgTarget?: SvgTarget, carrierTransform = marblePlatformCarrierTransform(target)): void {
    meshes.home.set(...target.pos);
    meshes.baseRotation = [...target.rotation];
    meshes.baseScale.set(...target.size);
    meshes.carrier.scale.set(...carrierTransform.scale);
    meshes.carrier.position.set(...carrierTransform.position);
    meshes.hardware.rotation.y = target.visualRoll ?? 0;
    if (meshes.rod) {
      meshes.rod.position.set(target.pos[0] - 0.44, target.pos[1] - 0.18, target.pos[2] - 0.18);
      meshes.rod.rotation.z = Math.PI / 2 + target.rotation[2] * 0.45;
    }
    if (svgTarget) {
      const [x, y] = worldToScreen(target.pos);
      svgTarget.baseTransform = `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(target.rotation[2] * 57.2958).toFixed(2)})`;
    }
  }

  preparePerformanceTransition(performance: MarblePerformance, currentT: number): MarblePreparedTransition {
    const nowMs = this.#now();
    const displayed = this.#platformTransitionState(nowMs);
    if (this.#platformTransition) {
      for (const [targetId, target] of displayed.targets) {
        const meshes = this.#targetMeshes.get(targetId);
        if (meshes) this.#applyTargetVisual(target, meshes, this.#svgTargets.get(targetId), displayed.carriers.get(targetId));
      }
      for (const [segmentId, segment] of displayed.path) {
        const meshes = this.#railMeshes.get(segmentId);
        if (meshes) this.#applyRailVisual(segment, meshes);
      }
      this.#platformTransition = undefined;
    }
    const fromTargets = displayed.targets;
    const alignedPerformance = prepareMarblePerformanceTransition(this.#performance, performance, currentT);
    const toTargets = new Map(alignedPerformance.statics.targets.map((target) => [target.id, target]));
    const toCarriers = new Map([...toTargets].map(([targetId, target]) => [targetId, marblePlatformCarrierTransform(target)]));
    const toPath = new Map(alignedPerformance.statics.path.map((segment) => [segment.id, segment]));
    return {
      songT: currentT,
      fromTargets,
      toTargets,
      fromCarriers: displayed.carriers,
      toCarriers,
      fromPath: displayed.path,
      toPath,
      performance: alignedPerformance,
    };
  }

  startPreparedTransition(
    prepared: MarblePreparedTransition,
    targetOffsets: ReadonlyMap<string, [number, number, number]> = new Map(),
    targetTimings: ReadonlyMap<string, [number, number]> = new Map(),
    durationMs?: number,
  ): MarbleTransitionStart {
    const resolvedDurationMs = durationMs ?? marblePlatformTransitionDuration(prepared.fromTargets, prepared.toTargets);
    this.#platformTransition = {
      songT: prepared.songT,
      startedAtMs: this.#now(),
      durationMs: resolvedDurationMs,
      fromTargets: prepared.fromTargets,
      toTargets: prepared.toTargets,
      fromCarriers: prepared.fromCarriers,
      toCarriers: prepared.toCarriers,
      fromPath: prepared.fromPath,
      toPath: prepared.toPath,
      targetOffsets: new Map(targetOffsets),
      targetTimings: new Map(targetTimings),
      performance: prepared.performance,
    };
    return {
      durationMs: resolvedDurationMs,
      platformCount: [...prepared.fromTargets.keys()].filter((targetId) => prepared.toTargets.has(targetId)).length,
      motionMix: { ...prepared.performance.statics.motionMix },
    };
  }

  transitionPerformance(performance: MarblePerformance, currentT: number, durationMs?: number): MarbleTransitionStart {
    return this.startPreparedTransition(this.preparePerformanceTransition(performance, currentT), new Map(), new Map(), durationMs);
  }

  isTransitioning(): boolean {
    return this.#platformTransition !== undefined;
  }

  consumeActivation(): MarbleSceneActivation | undefined {
    const activation = this.#completedActivation;
    this.#completedActivation = undefined;
    return activation;
  }

  replacePerformance(performance: MarblePerformance): void {
    if (this.#disposed) return;
    this.#performanceObjects.traverse((object: Object3D) => {
      const mesh = object as Mesh;
      if (mesh.geometry && !this.#sharedGeometries.has(mesh.geometry)) mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.filter((entry) => !this.#sharedMaterialSet.has(entry)).forEach((entry) => disposeMaterial(entry));
      else if (material && !this.#sharedMaterialSet.has(material)) disposeMaterial(material);
    });
    this.#performanceObjects.clear();
    this.#rails.clear();
    this.#railMeshes.clear();
    this.#targetMeshes.clear();
    this.#impactByTarget.clear();
    this.#svgTargets.clear();
    this.#svgTargetLayer.replaceChildren();

    this.#performance = performance;
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#camera.aspect = performance.resolution.w / performance.resolution.h;
    this.#camera.updateProjectionMatrix();
    this.#addSvgTargets();
    this.#addTargets();
    this.#addRods();
    this.#addRails();
    this.#performanceUpdates += 1;
  }

  profileSnapshot(): MarbleSceneProfileSnapshot {
    let sceneObjects = 0;
    this.#scene.traverse(() => { sceneObjects += 1; });
    return {
      rendererIdentity: this.#rendererIdentity,
      performanceUpdates: this.#performanceUpdates,
      rendererMemory: { ...this.#renderer.info.memory },
      rendererRender: { ...this.#renderer.info.render },
      programs: this.#renderer.info.programs?.length ?? 0,
      sceneObjects,
      targetGroups: this.#targetMeshes.size,
      railObjects: this.#rails.children.length,
      svgOverlays: this.#svg.parentElement?.querySelectorAll(".marble-svg-overlay").length ?? 0,
    };
  }

  destroy(): void {
    this.#disposed = true;
    this.#platformTransition = undefined;
    this.#cameraTransition = undefined;
    this.#completedActivation = undefined;
    this.#svg.remove();
    this.#scene.traverse((object: Object3D) => {
      const mesh = object as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => disposeMaterial(entry));
      else if (material) disposeMaterial(material);
    });
    for (const geometry of this.#sharedGeometries) geometry.dispose();
    for (const material of this.#sharedMaterialSet) disposeMaterial(material);
    this.#renderer.dispose();
  }
}
