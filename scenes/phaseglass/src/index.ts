import { samplePhaseglassRay, type PhaseglassMembrane, type PhaseglassPerformance, type PhaseglassRouteSegment, type PhaseglassVec3 } from "@reaper-viz/compiler-phaseglass";
import { Color, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget } from "three";

export type { PhaseglassPerformance } from "@reaper-viz/compiler-phaseglass";

export interface PhaseglassTuning {
  glass: number;
  caustics: number;
  dispersion: number;
  wake: number;
  cameraDistance: number;
}

export const PHASEGLASS_RAYMARCH_SCALE = 0.5;
export const PHASEGLASS_VISIBLE_MEMBRANES = 7;
export const PHASEGLASS_VOLUME_STEPS = 48;
const WAKE_COUNT = 7;
export const PHASEGLASS_FUTURE_PATH_COUNT = 7;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smootherStep(value: number): number {
  const clamped = clamp01(value);
  return clamped ** 3 * (clamped * (clamped * 6 - 15) + 10);
}

export interface PhaseglassAnticipationState {
  vacancy: number;
  fill: number;
  rim: number;
}

export function samplePhaseglassAnticipation(leadSeconds: number, decaySeconds = 0.82): PhaseglassAnticipationState {
  if (leadSeconds >= 0) {
    const preview = smootherStep((3 - leadSeconds) / 3);
    const arrival = smootherStep((0.62 - leadSeconds) / 0.62);
    return { vacancy: preview * (1 - arrival), fill: preview * arrival, rim: preview * (0.25 + arrival * 0.75) };
  }
  const age = -leadSeconds;
  const afterglow = Math.exp(-((age / Math.max(0.08, decaySeconds)) ** 2));
  return { vacancy: 0, fill: afterglow, rim: afterglow * 0.38 };
}

function normalizeVec3(value: PhaseglassVec3, fallback: PhaseglassVec3 = [0, 0, 1]): PhaseglassVec3 {
  const length = Math.hypot(...value);
  return length > 1e-9 ? [value[0] / length, value[1] / length, value[2] / length] : [...fallback];
}

export function samplePhaseglassViewDirection(route: readonly PhaseglassRouteSegment[], time: number, smoothingSeconds = 0.22): PhaseglassVec3 {
  const before = samplePhaseglassRay(route, Math.max(0, time - smoothingSeconds));
  const after = samplePhaseglassRay(route, time + smoothingSeconds);
  return normalizeVec3([
    after.position[0] - before.position[0],
    after.position[1] - before.position[1],
    after.position[2] - before.position[2],
  ], samplePhaseglassRay(route, time).direction);
}

export interface PhaseglassFuturePathSample {
  t: number;
  position: PhaseglassVec3;
  strength: number;
}

export function samplePhaseglassFuturePath(route: readonly PhaseglassRouteSegment[], time: number, durationSec: number, horizonSeconds = 3): PhaseglassFuturePathSample[] {
  return Array.from({ length: PHASEGLASS_FUTURE_PATH_COUNT }, (_, index) => {
    const progress = index / (PHASEGLASS_FUTURE_PATH_COUNT - 1);
    const sampleTime = Math.min(durationSec, time + horizonSeconds * progress);
    return {
      t: sampleTime,
      position: samplePhaseglassRay(route, sampleTime).position,
      strength: 0.12 + smootherStep(1 - progress) * 0.88,
    };
  });
}

export interface PhaseglassCameraFrame {
  position: PhaseglassVec3;
  target: PhaseglassVec3;
  opticalDirection: PhaseglassVec3;
  extent: number;
}

export function samplePhaseglassCameraFrame(route: readonly PhaseglassRouteSegment[], time: number, durationSec: number, cameraDistance = 1): PhaseglassCameraFrame {
  const path = samplePhaseglassFuturePath(route, time, durationSec);
  const signal = path[0]!.position;
  const opticalDirection = samplePhaseglassViewDirection(route, time);
  let weightTotal = 0;
  const corridorCenter: PhaseglassVec3 = [0, 0, 0];
  for (let index = 0; index < path.length; index += 1) {
    const weight = 1 / (1 + index * 0.46);
    weightTotal += weight;
    corridorCenter[0] += path[index]!.position[0] * weight;
    corridorCenter[1] += path[index]!.position[1] * weight;
    corridorCenter[2] += path[index]!.position[2] * weight;
  }
  corridorCenter[0] /= weightTotal;
  corridorCenter[1] /= weightTotal;
  corridorCenter[2] /= weightTotal;
  const target: PhaseglassVec3 = [
    signal[0] * 0.38 + corridorCenter[0] * 0.62,
    signal[1] * 0.38 + corridorCenter[1] * 0.62,
    signal[2] * 0.38 + corridorCenter[2] * 0.62,
  ];
  const extent = path.reduce((largest, sample) => Math.max(largest, Math.hypot(
    sample.position[0] - target[0],
    sample.position[1] - target[1],
    sample.position[2] - target[2],
  )), 0);
  const side = normalizeVec3([opticalDirection[2], 0.16, -opticalDirection[0]], [1, 0, 0]);
  const distance = Math.max(0.55, cameraDistance);
  const retreat = (6.2 + Math.min(9, extent) * 0.72) * distance;
  const lateral = (3.2 + Math.min(7, extent) * 0.22) * distance;
  const lift = (2.6 + Math.min(7, extent) * 0.16) * distance;
  return {
    position: [
      target[0] - opticalDirection[0] * retreat + side[0] * lateral,
      target[1] - opticalDirection[1] * retreat + side[1] * lateral + lift,
      target[2] - opticalDirection[2] * retreat + side[2] * lateral,
    ],
    target,
    opticalDirection,
    extent,
  };
}

interface MusicalRange {
  minPitch: number;
  maxPitch: number;
  minVelocity: number;
  maxVelocity: number;
}

function musicalRange(membranes: readonly PhaseglassMembrane[]): MusicalRange {
  if (!membranes.length) return { minPitch: 36, maxPitch: 84, minVelocity: 0, maxVelocity: 1 };
  return {
    minPitch: Math.min(...membranes.map((membrane) => membrane.pitch)),
    maxPitch: Math.max(...membranes.map((membrane) => membrane.pitch)),
    minVelocity: Math.min(...membranes.map((membrane) => membrane.energy)),
    maxVelocity: Math.max(...membranes.map((membrane) => membrane.energy)),
  };
}

function normalizePitch(range: MusicalRange, pitch: number): number {
  const relative = range.maxPitch - range.minPitch > 1e-6 ? (pitch - range.minPitch) / (range.maxPitch - range.minPitch) : 0.5;
  return clamp01(relative * 0.74 + clamp01((pitch - 36) / 48) * 0.26);
}

function normalizeVelocity(range: MusicalRange, velocity: number): number {
  if (range.maxVelocity - range.minVelocity < 0.05) return clamp01(velocity);
  return clamp01(((velocity - range.minVelocity) / (range.maxVelocity - range.minVelocity)) * 0.76 + velocity * 0.24);
}

export interface PhaseglassMusicalState {
  pitch: number;
  velocity: number;
  pulse: number;
  activity: number;
  pressure: number;
  silence: number;
}

export function samplePhaseglassMusicalState(membranes: readonly PhaseglassMembrane[], time: number): PhaseglassMusicalState {
  if (!membranes.length) return { pitch: 0.5, velocity: 0, pulse: 0, activity: 0, pressure: 0, silence: 1 };
  const range = musicalRange(membranes);
  let memory = 0;
  let pitchSum = 0;
  let velocitySum = 0;
  let pulse = 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (const membrane of membranes) {
    const age = time - membrane.t;
    const velocity = normalizeVelocity(range, membrane.energy);
    nearest = Math.min(nearest, Math.abs(age));
    pulse = Math.max(pulse, Math.exp(-Math.abs(age) * 9.2) * (0.22 + velocity * 0.78));
    if (age < 0) continue;
    const attack = 1 - Math.exp(-age / 0.075);
    const contribution = attack * Math.exp(-age / 0.66) * (0.3 + velocity * 0.7);
    memory += contribution;
    pitchSum += normalizePitch(range, membrane.pitch) * contribution;
    velocitySum += velocity * contribution;
  }
  const activity = clamp01(memory * 0.55);
  const pressure = clamp01((memory - 0.08) / 0.78);
  const pitch = memory > 1e-8 ? pitchSum / memory : normalizePitch(range, membranes[0]!.pitch);
  const velocity = memory > 1e-8 ? velocitySum / memory : normalizeVelocity(range, membranes[0]!.energy);
  const silence = clamp01((nearest - 0.12) / 1.05) * (1 - activity * 0.42);
  return { pitch, velocity, pulse: clamp01(pulse), activity, pressure, silence };
}

const FULLSCREEN_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const VOLUME_FRAGMENT = `
precision highp float;
varying vec2 vUv;
#define MEMBRANE_COUNT ${PHASEGLASS_VISIBLE_MEMBRANES}
#define WAKE_COUNT ${WAKE_COUNT}
#define PATH_COUNT ${PHASEGLASS_FUTURE_PATH_COUNT}
#define VOLUME_STEPS ${PHASEGLASS_VOLUME_STEPS}

uniform vec2 uResolution;
uniform float uTime;
uniform float uEnergy;
uniform float uPitch;
uniform float uVelocity;
uniform float uPulse;
uniform float uActivity;
uniform float uPressure;
uniform float uSilence;
uniform float uGlass;
uniform float uCaustics;
uniform float uDispersion;
uniform float uWake;
uniform vec3 uCameraPosition;
uniform vec3 uCameraTarget;
uniform vec3 uSignalPosition;
uniform vec3 uSignalDirection;
uniform int uMembraneCount;
uniform vec3 uMembraneCenter[MEMBRANE_COUNT];
uniform vec3 uMembraneNormal[MEMBRANE_COUNT];
uniform vec3 uMembraneAxisU[MEMBRANE_COUNT];
uniform vec3 uMembraneAxisV[MEMBRANE_COUNT];
uniform vec3 uMembraneColor[MEMBRANE_COUNT];
uniform float uMembraneRadius[MEMBRANE_COUNT];
uniform float uMembraneVacancy[MEMBRANE_COUNT];
uniform float uMembraneFill[MEMBRANE_COUNT];
uniform float uMembraneRim[MEMBRANE_COUNT];
uniform float uMembranePitch[MEMBRANE_COUNT];
uniform float uMembraneVelocity[MEMBRANE_COUNT];
uniform float uMembranePhase[MEMBRANE_COUNT];
uniform vec3 uWakePosition[WAKE_COUNT];
uniform float uWakeStrength[WAKE_COUNT];
uniform vec3 uPathPosition[PATH_COUNT];
uniform float uPathStrength[PATH_COUNT];

float hash31(vec3 point) {
  return fract(sin(dot(point, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float segmentDistance(vec3 point, vec3 start, vec3 end, out float along) {
  vec3 delta = end - start;
  float lengthSquared = max(0.0001, dot(delta, delta));
  along = clamp(dot(point - start, delta) / lengthSquared, 0.0, 1.0);
  return length(point - (start + delta * along));
}

vec3 architecturalField(vec3 rayDirection) {
  vec3 color = vec3(0.003, 0.006, 0.008);
  for (int layer = 0; layer < 4; layer++) {
    float layerIndex = float(layer);
    float distanceLayer = 10.0 + layerIndex * 7.0;
    vec3 point = uCameraPosition + rayDirection * distanceLayer;
    point += vec3(layerIndex * 3.7, -layerIndex * 1.9, layerIndex * 2.3);
    vec3 cell = abs(fract(point * (0.095 + layerIndex * 0.012)) - 0.5);
    float frame = exp(-min(min(cell.x, cell.y), cell.z) * (58.0 + layerIndex * 8.0));
    float slice = exp(-abs(sin(dot(point, vec3(0.071, 0.053, -0.062)) + layerIndex * 1.4)) * 42.0);
    float facets = frame * (0.22 + slice * 0.78);
    vec3 layerColor = mix(vec3(0.025, 0.13, 0.15), vec3(0.16, 0.11, 0.055), layerIndex / 3.0);
    color += layerColor * facets * (0.38 - layerIndex * 0.055);
  }
  float horizon = exp(-abs(rayDirection.y + 0.17) * 45.0);
  color += vec3(0.025, 0.11, 0.13) * horizon * 0.16;
  return color;
}

void evaluateMembranes(vec3 worldPoint, float time, out float glassDensity, out float causticDensity, out float vacancy, out vec3 tint) {
  glassDensity = 0.0;
  causticDensity = 0.0;
  vacancy = 0.0;
  tint = vec3(0.0);
  for (int index = 0; index < MEMBRANE_COUNT; index++) {
    if (index >= uMembraneCount) break;
    vec3 local = worldPoint - uMembraneCenter[index];
    float plane = dot(local, uMembraneNormal[index]);
    vec2 disc = vec2(dot(local, uMembraneAxisU[index]), dot(local, uMembraneAxisV[index]));
    vec2 sheetCoordinate = disc / max(0.08, uMembraneRadius[index]);
    vec2 absoluteCoordinate = abs(sheetCoordinate);
    float faceted = max(max(absoluteCoordinate.x, absoluteCoordinate.y), (absoluteCoordinate.x + absoluteCoordinate.y) * 0.72);
    float gate = smoothstep(1.08, 0.76, faceted);
    float edge = exp(-abs(faceted - 0.94) * 34.0);
    float ripple = sin(disc.x * mix(5.0, 10.0, uMembranePitch[index]) + sin(disc.y * 4.0 - time * 0.2) + uMembranePhase[index]);
    float sheet = exp(-abs(plane + ripple * 0.018 * gate) * 16.0) * gate;
    float etchingA = exp(-abs(sin(disc.x * (5.0 + uMembranePitch[index] * 7.0) + disc.y * 2.1 + uMembranePhase[index])) * 32.0);
    float etchingB = exp(-abs(sin(disc.y * (6.0 + uMembraneVelocity[index] * 5.0) - disc.x * 1.7 - time * 0.24)) * 38.0);
    float etching = (etchingA * 0.62 + etchingB * 0.48 + etchingA * etchingB) * sheet;
    float presence = 0.16 + uMembraneVacancy[index] * 0.48 + uMembraneFill[index] * 0.92 + uMembraneRim[index] * 0.45;
    glassDensity += sheet * presence * 0.38 + edge * exp(-abs(plane) * 15.0) * presence * 0.5;
    causticDensity += etching * (0.35 + uMembraneVelocity[index] * 1.25) * presence;
    float voidField = exp(-abs(plane) * 5.5) * exp(-faceted * faceted * 1.45) * uMembraneVacancy[index];
    vacancy += voidField;
    tint += uMembraneColor[index] * (sheet * presence + etching * 0.85 + edge * presence * 0.35);
  }
}

float pastBeam(vec3 point) {
  float field = 0.0;
  for (int index = 0; index < WAKE_COUNT - 1; index++) {
    float along;
    float distanceToBeam = segmentDistance(point, uWakePosition[index + 1], uWakePosition[index], along);
    float strength = mix(uWakeStrength[index + 1], uWakeStrength[index], along);
    float interference = 0.58 + 0.42 * sin(along * 16.0 - uTime * 0.8 + float(index));
    field += exp(-distanceToBeam * 11.0) * interference * strength;
  }
  return field;
}

float futureBeam(vec3 point) {
  float field = 0.0;
  for (int index = 0; index < PATH_COUNT - 1; index++) {
    float along;
    float distanceToPath = segmentDistance(point, uPathPosition[index], uPathPosition[index + 1], along);
    float strength = mix(uPathStrength[index], uPathStrength[index + 1], along);
    float dash = smoothstep(0.2, 0.82, 0.5 + 0.5 * sin(along * 25.0 + float(index) * 1.3 - uTime * 0.45));
    field += exp(-distanceToPath * 9.0) * (0.2 + dash * 0.8) * strength;
  }
  return field;
}

float signalPacket(vec3 point, out vec3 packetColor) {
  vec3 local = point - uSignalPosition;
  float longitudinal = dot(local, uSignalDirection);
  vec3 lateralVector = local - uSignalDirection * longitudinal;
  float lateral = length(lateralVector);
  float core = exp(-lateral * (18.0 + uVelocity * 7.0) - abs(longitudinal) * 7.0);
  float blade = exp(-abs(dot(lateralVector, vec3(0.71, 0.43, -0.55))) * 28.0 - abs(longitudinal) * 4.0) * exp(-length(local) * 2.3);
  float modulation = 0.72 + 0.28 * sin(longitudinal * 24.0 - uTime * 2.4);
  packetColor = mix(vec3(0.62, 0.96, 1.0), vec3(1.0, 0.68, 0.24), uPitch * 0.34 + uDispersion * 0.12);
  return (core + blade * 0.46) * modulation;
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;
  vec3 forward = normalize(uCameraTarget - uCameraPosition);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  if (length(right) < 0.01) right = vec3(1.0, 0.0, 0.0);
  vec3 up = normalize(cross(right, forward));
  vec3 rayDirection = normalize(forward * 1.62 + right * uv.x + up * uv.y);
  float depth = 0.12 + hash31(vec3(gl_FragCoord.xy, floor(uTime * 60.0))) * 0.12;
  vec3 color = architecturalField(rayDirection);
  for (int step = 0; step < VOLUME_STEPS; step++) {
    vec3 point = uCameraPosition + rayDirection * depth;
    float glassDensity, causticDensity, vacancy;
    vec3 membraneTint;
    evaluateMembranes(point, uTime, glassDensity, causticDensity, vacancy, membraneTint);
    float history = pastBeam(point) * uWake;
    float preview = futureBeam(point);
    vec3 packetColor;
    float packet = signalPacket(point, packetColor);
    vec3 glassColor = glassDensity > 0.001 ? membraneTint / max(0.12, glassDensity + causticDensity * 0.8) : vec3(0.12, 0.52, 0.56);
    vec3 previewColor = mix(vec3(0.19, 0.65, 0.69), vec3(0.72, 0.46, 0.16), uPitch * 0.4);
    vec3 emission = glassColor * glassDensity * (0.7 + uGlass * 1.15);
    emission += mix(glassColor, vec3(1.0, 0.72, 0.3), uDispersion * 0.3) * causticDensity * (1.2 + uCaustics * 2.4 + uPulse * 0.55);
    emission += previewColor * preview * (0.55 + uActivity * 0.35);
    emission += vec3(0.34, 0.78, 0.82) * history * (0.55 + uPressure * 0.45);
    emission += packetColor * packet * (2.4 + uVelocity * 2.0 + uPulse * 1.1);
    emission += previewColor * vacancy * 0.055;
    float density = glassDensity * 0.22 + causticDensity * 0.1 + preview * 0.07 + history * 0.07 + packet * 0.18;
    float stepLength = 0.23 + depth * 0.006;
    float integration = 0.18 + smoothstep(0.0, 0.34, density) * 0.82;
    color += emission * integration * stepLength * (0.86 + uEnergy * 0.3);
    depth += stepLength;
    if (depth > 30.0) break;
  }
  float vignette = 1.0 - 0.16 * dot(uv, uv);
  color *= vignette;
  color = color / (0.72 + color);
  color = pow(max(color, 0.0), vec3(0.88));
  gl_FragColor = vec4(color, 1.0);
}`;

const COMPOSITE_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVolumeTexture;
uniform vec2 uVolumeResolution;
uniform float uTime;
float hash21(vec2 point) { return fract(sin(dot(point, vec2(41.7, 289.1))) * 43758.5453); }
void main() {
  vec2 texel = 1.0 / uVolumeResolution;
  vec3 center = texture2D(uVolumeTexture, vUv).rgb;
  vec3 north = texture2D(uVolumeTexture, vUv + vec2(0.0, texel.y)).rgb;
  vec3 south = texture2D(uVolumeTexture, vUv - vec2(0.0, texel.y)).rgb;
  vec3 east = texture2D(uVolumeTexture, vUv + vec2(texel.x, 0.0)).rgb;
  vec3 west = texture2D(uVolumeTexture, vUv - vec2(texel.x, 0.0)).rgb;
  vec3 color = max(vec3(0.0), center * 1.31 - (north + south + east + west) * 0.072);
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color *= 0.62 + smoothstep(0.006, 0.28, luminance) * 0.78;
  color += (hash21(gl_FragCoord.xy + uTime * 17.0) - 0.5) * 0.007;
  gl_FragColor = vec4(max(color, 0.0), 1.0);
}`;

function energyAt(performance: PhaseglassPerformance, time: number): number {
  const curve = performance.curves.energy;
  if (!curve?.values.length) return 0;
  const position = Math.max(0, Math.min(curve.values.length - 1, (time - curve.t0) / curve.dt));
  const left = Math.floor(position);
  const right = Math.min(curve.values.length - 1, left + 1);
  return curve.values[left]! + (curve.values[right]! - curve.values[left]!) * (position - left);
}

function vectors(length: number): Vector3[] {
  return Array.from({ length }, () => new Vector3());
}

function numbers(length: number): number[] {
  return Array.from({ length }, () => 0);
}

export class PhaseglassScene {
  readonly backendKind = "three";
  readonly tuning: PhaseglassTuning = { glass: 1, caustics: 0.92, dispersion: 0.68, wake: 0.76, cameraDistance: 1 };
  readonly #performance: PhaseglassPerformance;
  readonly #range: MusicalRange;
  readonly #renderer: WebGLRenderer;
  readonly #camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #volumeScene = new Scene();
  readonly #compositeScene = new Scene();
  readonly #volumeMaterial: ShaderMaterial;
  readonly #compositeMaterial: ShaderMaterial;
  readonly #target: WebGLRenderTarget;
  readonly #centers = vectors(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #normals = vectors(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #axesU = vectors(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #axesV = vectors(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #colors = vectors(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #radii = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #vacancy = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #fill = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #rim = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #pitch = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #velocity = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #phase = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #wakePositions = vectors(WAKE_COUNT);
  readonly #wakeStrength = numbers(WAKE_COUNT);
  readonly #pathPositions = vectors(PHASEGLASS_FUTURE_PATH_COUNT);
  readonly #pathStrength = numbers(PHASEGLASS_FUTURE_PATH_COUNT);

  constructor(canvas: HTMLCanvasElement, performance: PhaseglassPerformance) {
    this.#performance = performance;
    this.#range = musicalRange(performance.statics.membranes);
    this.#renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.setPixelRatio(1);
    this.#renderer.outputColorSpace = SRGBColorSpace;
    const width = Math.round(performance.resolution.w * PHASEGLASS_RAYMARCH_SCALE);
    const height = Math.round(performance.resolution.h * PHASEGLASS_RAYMARCH_SCALE);
    this.#target = new WebGLRenderTarget(width, height, { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
    this.#volumeMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: VOLUME_FRAGMENT,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uResolution: { value: new Vector2(width, height) }, uTime: { value: 0 }, uEnergy: { value: 0 },
        uPitch: { value: 0.5 }, uVelocity: { value: 0 }, uPulse: { value: 0 }, uActivity: { value: 0 }, uPressure: { value: 0 }, uSilence: { value: 1 },
        uGlass: { value: this.tuning.glass }, uCaustics: { value: this.tuning.caustics }, uDispersion: { value: this.tuning.dispersion }, uWake: { value: this.tuning.wake },
        uCameraPosition: { value: new Vector3() }, uCameraTarget: { value: new Vector3() }, uSignalPosition: { value: new Vector3() }, uSignalDirection: { value: new Vector3(0, 0, 1) },
        uMembraneCount: { value: 0 }, uMembraneCenter: { value: this.#centers }, uMembraneNormal: { value: this.#normals },
        uMembraneAxisU: { value: this.#axesU }, uMembraneAxisV: { value: this.#axesV }, uMembraneColor: { value: this.#colors },
        uMembraneRadius: { value: this.#radii }, uMembraneVacancy: { value: this.#vacancy }, uMembraneFill: { value: this.#fill }, uMembraneRim: { value: this.#rim },
        uMembranePitch: { value: this.#pitch }, uMembraneVelocity: { value: this.#velocity }, uMembranePhase: { value: this.#phase },
        uWakePosition: { value: this.#wakePositions }, uWakeStrength: { value: this.#wakeStrength },
        uPathPosition: { value: this.#pathPositions }, uPathStrength: { value: this.#pathStrength },
      },
    });
    this.#volumeScene.add(new Mesh(new PlaneGeometry(2, 2), this.#volumeMaterial));
    this.#compositeMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthWrite: false,
      depthTest: false,
      uniforms: { uVolumeTexture: { value: this.#target.texture }, uVolumeResolution: { value: new Vector2(width, height) }, uTime: { value: 0 } },
    });
    this.#compositeScene.add(new Mesh(new PlaneGeometry(2, 2), this.#compositeMaterial));
  }

  #updateMembranes(time: number): void {
    const membranes = this.#performance.statics.membranes;
    const nextIndex = membranes.findIndex((membrane) => membrane.t >= time - 1e-6);
    const anchor = nextIndex < 0 ? membranes.length - 1 : nextIndex;
    const start = Math.max(0, Math.min(membranes.length - PHASEGLASS_VISIBLE_MEMBRANES, anchor - 2));
    const count = Math.min(PHASEGLASS_VISIBLE_MEMBRANES, membranes.length - start);
    for (let slot = 0; slot < PHASEGLASS_VISIBLE_MEMBRANES; slot += 1) {
      const membrane = slot < count ? membranes[start + slot] : undefined;
      if (!membrane) {
        this.#centers[slot]!.set(0, 0, 200); this.#normals[slot]!.set(0, 0, 1); this.#axesU[slot]!.set(1, 0, 0); this.#axesV[slot]!.set(0, 1, 0); this.#colors[slot]!.set(0, 0, 0);
        this.#radii[slot] = 0; this.#vacancy[slot] = 0; this.#fill[slot] = 0; this.#rim[slot] = 0; this.#pitch[slot] = 0.5; this.#velocity[slot] = 0; this.#phase[slot] = 0;
        continue;
      }
      const anticipation = samplePhaseglassAnticipation(membrane.t - time, 0.5 + membrane.duration * 1.1);
      const color = new Color(membrane.color);
      this.#centers[slot]!.set(...membrane.center); this.#normals[slot]!.set(...membrane.normal).normalize(); this.#axesU[slot]!.set(...membrane.axisU).normalize(); this.#axesV[slot]!.set(...membrane.axisV).normalize();
      this.#colors[slot]!.set(color.r, color.g, color.b); this.#radii[slot] = membrane.radius * 1.55; this.#vacancy[slot] = anticipation.vacancy; this.#fill[slot] = anticipation.fill; this.#rim[slot] = anticipation.rim;
      this.#pitch[slot] = normalizePitch(this.#range, membrane.pitch); this.#velocity[slot] = normalizeVelocity(this.#range, membrane.energy); this.#phase[slot] = (start + slot) * 1.61803398875 + membrane.pitch * 0.071;
    }
    this.#volumeMaterial.uniforms.uMembraneCount!.value = count;
  }

  renderFrame(time: number): void {
    const state = samplePhaseglassRay(this.#performance.statics.route, time);
    const position = new Vector3(...state.position);
    const physicalDirection = new Vector3(...state.direction).normalize();
    const cameraFrame = samplePhaseglassCameraFrame(this.#performance.statics.route, time, this.#performance.durationSec, this.tuning.cameraDistance);
    const cameraPosition = new Vector3(...cameraFrame.position);
    const cameraTarget = new Vector3(...cameraFrame.target);
    const musical = samplePhaseglassMusicalState(this.#performance.statics.membranes, time);
    this.#updateMembranes(time);
    for (let index = 0; index < WAKE_COUNT; index += 1) {
      const sample = samplePhaseglassRay(this.#performance.statics.route, Math.max(0, time - (index + 1) * 0.085));
      this.#wakePositions[index]!.set(...sample.position);
      this.#wakeStrength[index] = this.tuning.wake * (1 - index / WAKE_COUNT);
    }
    const futurePath = samplePhaseglassFuturePath(this.#performance.statics.route, time, this.#performance.durationSec);
    for (let index = 0; index < PHASEGLASS_FUTURE_PATH_COUNT; index += 1) {
      const sample = futurePath[index]!;
      this.#pathPositions[index]!.set(...sample.position);
      this.#pathStrength[index] = sample.strength;
    }
    const uniforms = this.#volumeMaterial.uniforms;
    uniforms.uTime!.value = time; uniforms.uEnergy!.value = energyAt(this.#performance, time); uniforms.uPitch!.value = musical.pitch; uniforms.uVelocity!.value = musical.velocity;
    uniforms.uPulse!.value = musical.pulse; uniforms.uActivity!.value = musical.activity; uniforms.uPressure!.value = musical.pressure; uniforms.uSilence!.value = musical.silence;
    uniforms.uGlass!.value = this.tuning.glass; uniforms.uCaustics!.value = this.tuning.caustics; uniforms.uDispersion!.value = this.tuning.dispersion; uniforms.uWake!.value = this.tuning.wake;
    (uniforms.uCameraPosition!.value as Vector3).copy(cameraPosition); (uniforms.uCameraTarget!.value as Vector3).copy(cameraTarget); (uniforms.uSignalPosition!.value as Vector3).copy(position); (uniforms.uSignalDirection!.value as Vector3).copy(physicalDirection);
    this.#compositeMaterial.uniforms.uTime!.value = time;
    this.#renderer.setRenderTarget(this.#target); this.#renderer.render(this.#volumeScene, this.#camera); this.#renderer.setRenderTarget(null); this.#renderer.render(this.#compositeScene, this.#camera);
  }

  destroy(): void {
    for (const scene of [this.#volumeScene, this.#compositeScene]) {
      scene.traverse((object) => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose()); else material?.dispose();
      });
    }
    this.#target.dispose();
    this.#renderer.dispose();
  }
}
