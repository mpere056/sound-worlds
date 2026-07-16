import {
  sampleVortexLoomFiberPositions,
  sampleVortexLoomMusicalState,
  sampleVortexLoomShuttle,
  vortexActivation,
  vortexLoomContactStrength,
  vortexLoomEnergyAt,
  type VortexLoomPerformance,
  type VortexLoomVortex,
} from "@reaper-viz/compiler-vortex-loom";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

export type { VortexLoomPerformance } from "@reaper-viz/compiler-vortex-loom";

export interface VortexLoomTuning {
  fibers: number;
  pigment: number;
  flow: number;
  anticipation: number;
  contactLight: number;
  cameraDistance: number;
}

export interface VortexLoomVisualState {
  currentIndex: number;
  nextIndex: number;
  preview: number;
  pulse: number;
  pressure: number;
}

const MAX_VISIBLE_VORTICES = 12;
const DISPLAY_BUNDLE_COUNT = 11;
const BUNDLE_SAMPLE_COUNT = 88;
const TRAIL_SAMPLE_COUNT = 52;
const TRAIL_DURATION_SECONDS = 0.34;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smootherStep(value: number): number {
  const q = clamp01(value);
  return q * q * q * (q * (q * 6 - 15) + 10);
}

export function sampleVortexLoomVisualState(performance: VortexLoomPerformance, time: number): VortexLoomVisualState {
  const vortices = performance.statics.vortices;
  let currentIndex = -1;
  let nextIndex = vortices.length;
  for (let index = 0; index < vortices.length; index += 1) {
    if (vortices[index]!.t <= time + 1e-9) currentIndex = index;
    if (vortices[index]!.t > time + 1e-9) { nextIndex = index; break; }
  }
  const next = vortices[nextIndex];
  const preview = next ? smootherStep((3 - (next.t - time)) / 3) : 0;
  const musical = sampleVortexLoomMusicalState(performance, time);
  return { currentIndex, nextIndex, preview, pulse: musical.pulse, pressure: musical.pressure };
}

export function vortexLoomPigmentHistoryStrength(vortex: VortexLoomVortex, time: number): number {
  const historyAge = time - vortex.t;
  const envelope = historyAge >= 0 ? Math.exp(-historyAge / 5.5) : vortexActivation(vortex, time);
  return envelope * (0.28 + vortex.energy * 0.42);
}

const FIELD_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FIELD_FRAGMENT = `
precision highp float;
varying vec2 vUv;
#define VORTEX_COUNT ${MAX_VISIBLE_VORTICES}

uniform float uTime;
uniform float uEnergy;
uniform float uPulse;
uniform float uPressure;
uniform float uSilence;
uniform float uPigment;
uniform float uFlow;
uniform float uAnticipation;
uniform float uContactLight;
uniform int uVortexCount;
uniform vec2 uVortexCenter[VORTEX_COUNT];
uniform vec3 uVortexColor[VORTEX_COUNT];
uniform float uVortexCore[VORTEX_COUNT];
uniform float uVortexStrength[VORTEX_COUNT];
uniform float uVortexPigmentStrength[VORTEX_COUNT];
uniform float uVortexContact[VORTEX_COUNT];
uniform vec2 uNextCenter;
uniform vec2 uShuttlePosition;
uniform vec3 uNextColor;
uniform float uNextPreview;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(2.0, 3.4);
  vec2 displacement = vec2(0.0);
  vec3 pigment = vec3(0.0);
  vec3 contactPigment = vec3(0.0);

  for (int index = 0; index < VORTEX_COUNT; index++) {
    if (index >= uVortexCount) break;
    vec2 local = p - uVortexCenter[index];
    float radius2 = dot(local, local) + uVortexCore[index] * uVortexCore[index];
    float signedInfluence = uVortexStrength[index] * exp(-radius2 * 1.55);
    vec2 curl = vec2(-local.y, local.x) / radius2 * signedInfluence * 0.018 * uFlow;
    displacement += curl / (1.0 + length(curl) * 1.8);
    float directionalGrain = valueNoise(local * vec2(7.0, 11.0) + vec2(float(index) * 2.7, uTime * 0.045));
    float body = exp(-radius2 * (1.35 + directionalGrain * 2.2)) * uVortexPigmentStrength[index];
    pigment += uVortexColor[index] * body * (0.18 + directionalGrain * 0.3);
    float contact = exp(-radius2 / max(0.008, uVortexCore[index] * 7.0)) * uVortexContact[index];
    contactPigment += uVortexColor[index] * contact;
  }

  vec2 transported = p + displacement;
  float slowNoise = valueNoise(transported * 2.8 + vec2(uTime * 0.018, -uTime * 0.012));
  float fineNoise = valueNoise(transported * 9.0 - vec2(uTime * 0.028, uTime * 0.016));
  float foldPhase = transported.x * 7.4 + sin(transported.y * 2.1 + slowNoise * 2.4) * 0.82 + displacement.y * 3.2;
  float fold = pow(0.5 + 0.5 * cos(foldPhase), 4.0);
  float foldShadow = pow(0.5 + 0.5 * cos(foldPhase + 1.2), 7.0);
  float crossFold = pow(0.5 + 0.5 * cos(transported.y * 4.3 - transported.x * 1.4 + fineNoise * 1.8), 9.0);
  float satinGrain = 0.72 + slowNoise * 0.2 + fineNoise * 0.08;

  vec2 future = p - uNextCenter;
  vec2 tensionSpan = uNextCenter - uShuttlePosition;
  float spanLength2 = max(dot(tensionSpan, tensionSpan), 0.0001);
  float along = clamp(dot(p - uShuttlePosition, tensionSpan) / spanLength2, 0.0, 1.0);
  vec2 spanPoint = uShuttlePosition + tensionSpan * along;
  float spanDistance = length(p - spanPoint);
  float corridorWindow = smoothstep(0.0, 0.08, along) * (0.45 + 0.55 * smoothstep(0.0, 0.72, along));
  float corridor = exp(-spanDistance * spanDistance * 150.0) * corridorWindow * uNextPreview * uAnticipation;
  float partedEdge = exp(-pow(spanDistance - 0.075, 2.0) * 430.0) * corridorWindow * uNextPreview * uAnticipation;
  float futureFocus = exp(-dot(future, future) * 28.0) * uNextPreview * uAnticipation;
  vec2 spanDirection = tensionSpan / sqrt(spanLength2);
  vec2 spanNormal = vec2(-spanDirection.y, spanDirection.x);
  float futureAlong = dot(future, spanDirection);
  float futureAcross = dot(future, spanNormal);
  float apertureVoid = exp(-futureAcross * futureAcross * 190.0 - futureAlong * futureAlong * 34.0) * uNextPreview * uAnticipation;
  float apertureRim = exp(-pow(abs(futureAcross) - 0.072, 2.0) * 520.0 - futureAlong * futureAlong * 36.0) * uNextPreview * uAnticipation;
  float tensionGlint = pow(0.5 + 0.5 * cos(along * 58.0 - uTime * 2.1), 16.0) * corridor;

  vec3 base = mix(vec3(0.009, 0.019, 0.021), vec3(0.032, 0.066, 0.062), 0.24 + slowNoise * 0.38 + uEnergy * 0.16);
  base += vec3(0.17, 0.38, 0.36) * fold * satinGrain * (0.11 + uPressure * 0.065) * (1.0 - corridor * 0.88);
  base -= vec3(0.012, 0.018, 0.017) * foldShadow * 0.7;
  base += vec3(0.38, 0.50, 0.43) * crossFold * (0.012 + uPressure * 0.008);
  base += uNextColor * partedEdge * 0.34;
  base += mix(vec3(0.18, 0.32, 0.31), uNextColor, 0.58) * futureFocus * 0.14;
  base *= 1.0 - apertureVoid * 0.32;
  base += uNextColor * apertureRim * 0.22;
  base += uNextColor * tensionGlint * 0.12;
  base += pigment * uPigment * (0.94 + uPressure * 0.62);
  base += contactPigment * uContactLight * (0.34 + uPulse * 0.48);
  base *= 1.0 - corridor * 0.24;

  float vignette = smoothstep(1.3, 0.2, length((vUv - 0.5) * vec2(0.86, 1.0)));
  base *= 0.52 + vignette * 0.48;
  base += vec3(0.018, 0.026, 0.024) * uSilence * (0.3 + fineNoise * 0.2);
  gl_FragColor = vec4(base, 1.0);
}`;

const RIBBON_VERTEX = `
attribute float aAcross;
attribute float aAlong;
attribute float aBundle;
varying float vAcross;
varying float vAlong;
varying float vBundle;
varying vec2 vPosition;
void main() {
  vAcross = aAcross;
  vAlong = aAlong;
  vBundle = aBundle;
  vPosition = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RIBBON_FRAGMENT = `
precision highp float;
varying float vAcross;
varying float vAlong;
varying float vBundle;
varying vec2 vPosition;
uniform float uOpacity;
uniform float uPulse;
uniform float uPressure;
uniform vec2 uShuttlePosition;
uniform vec2 uNextCenter;
uniform vec3 uNextColor;
uniform float uNextPreview;
void main() {
  float edge = 1.0 - smoothstep(0.72, 1.0, abs(vAcross));
  float satin = 0.5 + 0.5 * cos(vAcross * 2.4 + vBundle * 1.7);
  float weave = 0.58 + satin * 0.3;
  vec2 tensionSpan = uNextCenter - uShuttlePosition;
  float spanLength2 = max(dot(tensionSpan, tensionSpan), 0.0001);
  float alongSpan = clamp(dot(vPosition - uShuttlePosition, tensionSpan) / spanLength2, 0.0, 1.0);
  float spanDistance = length(vPosition - (uShuttlePosition + tensionSpan * alongSpan));
  float corridor = exp(-spanDistance * spanDistance * 150.0) * smoothstep(0.0, 0.08, alongSpan) * uNextPreview;
  float tensionEdge = exp(-pow(spanDistance - 0.075, 2.0) * 430.0) * uNextPreview;
  vec3 cool = vec3(0.17, 0.42, 0.40);
  vec3 bone = vec3(0.76, 0.81, 0.72);
  vec3 color = mix(cool, bone, 0.20 + weave * 0.34 + uPulse * 0.12);
  color = mix(color, uNextColor, tensionEdge * 0.44);
  color *= 0.68 + uPressure * 0.24 + weave * 0.28;
  float alpha = uOpacity * edge * (0.035 + weave * 0.045 + uPulse * 0.012) * (1.0 - corridor * 0.82);
  gl_FragColor = vec4(color, alpha);
}`;

const TRAIL_VERTEX = `
attribute float aAge;
varying float vAge;
void main() {
  vAge = aAge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const TRAIL_FRAGMENT = `
precision highp float;
varying float vAge;
uniform vec3 uColor;
uniform float uPulse;
void main() {
  float fade = smoothstep(0.0, 0.22, vAge) * pow(vAge, 1.8);
  vec3 color = mix(vec3(0.27, 0.55, 0.52), uColor, 0.62);
  gl_FragColor = vec4(color * (0.72 + uPulse * 0.26), fade * 0.34);
}`;

const SHUTTLE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SHUTTLE_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float uPulse;
uniform float uPressure;
uniform vec3 uColor;
void main() {
  vec2 p = (vUv - 0.5) * vec2(2.0, 2.0);
  float taper = smoothstep(1.0, 0.16, abs(p.x));
  float strandA = exp(-abs(p.y - sin(p.x * 8.0) * 0.12) * 18.0) * taper;
  float strandB = exp(-abs(p.y + sin(p.x * 7.0 + 1.4) * 0.11) * 20.0) * taper;
  float knot = exp(-dot(p * vec2(1.35, 2.6), p * vec2(1.35, 2.6)) * 2.4);
  float alpha = clamp(strandA + strandB + knot * (0.72 + uPulse * 0.5), 0.0, 1.0);
  vec3 color = mix(uColor, vec3(1.0, 0.91, 0.72), knot * 0.62 + uPulse * 0.25);
  color *= 0.78 + uPressure * 0.22 + uPulse * 0.42;
  gl_FragColor = vec4(color, alpha);
}`;

function displayedBundleCount(performance: VortexLoomPerformance): number {
  return Math.min(DISPLAY_BUNDLE_COUNT, performance.statics.fibers.fiberCount);
}

function fiberIndexForBundle(bundle: number, bundleCount: number, fiberCount: number): number {
  const lower = fiberCount > 2 ? 1 : 0;
  const upper = fiberCount > 2 ? fiberCount - 2 : fiberCount - 1;
  if (bundleCount <= 1) return Math.round((lower + upper) * 0.5);
  return Math.round(lower + (upper - lower) * (bundle / (bundleCount - 1)));
}

function catmullCoordinate(
  positions: readonly number[],
  fiber: number,
  pointsPerFiber: number,
  unit: number,
  axis: 0 | 1,
): number {
  const scaled = clamp01(unit) * (pointsPerFiber - 1);
  const point = Math.min(pointsPerFiber - 2, Math.floor(scaled));
  const local = scaled - point;
  const coordinate = (index: number): number => {
    const bounded = Math.max(0, Math.min(pointsPerFiber - 1, index));
    return positions[(fiber * pointsPerFiber + bounded) * 2 + axis]!;
  };
  const p0 = coordinate(point - 1);
  const p1 = coordinate(point);
  const p2 = coordinate(point + 1);
  const p3 = coordinate(point + 2);
  const local2 = local * local;
  const local3 = local2 * local;
  return 0.5 * (
    2 * p1
    + (-p0 + p2) * local
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * local2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * local3
  );
}

function makeRibbonGeometry(performance: VortexLoomPerformance): BufferGeometry {
  const bundleCount = displayedBundleCount(performance);
  const vertexCount = bundleCount * (BUNDLE_SAMPLE_COUNT - 1) * 6;
  const positions = new Float32Array(vertexCount * 3);
  const across = new Float32Array(vertexCount);
  const along = new Float32Array(vertexCount);
  const bundleValues = new Float32Array(vertexCount);
  let vertex = 0;
  for (let bundle = 0; bundle < bundleCount; bundle += 1) {
    const bundleValue = bundleCount > 1 ? bundle / (bundleCount - 1) : 0.5;
    for (let sample = 0; sample < BUNDLE_SAMPLE_COUNT - 1; sample += 1) {
      const first = sample / (BUNDLE_SAMPLE_COUNT - 1);
      const second = (sample + 1) / (BUNDLE_SAMPLE_COUNT - 1);
      const acrossValues = [-1, 1, -1, -1, 1, 1];
      const alongValues = [first, first, second, second, first, second];
      for (let corner = 0; corner < 6; corner += 1) {
        across[vertex] = acrossValues[corner]!;
        along[vertex] = alongValues[corner]!;
        bundleValues[vertex] = bundleValue;
        vertex += 1;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aAcross", new BufferAttribute(across, 1));
  geometry.setAttribute("aAlong", new BufferAttribute(along, 1));
  geometry.setAttribute("aBundle", new BufferAttribute(bundleValues, 1));
  return geometry;
}

function updateRibbonGeometry(
  geometry: BufferGeometry,
  performance: VortexLoomPerformance,
  transported: readonly number[],
): void {
  const positionAttribute = geometry.getAttribute("position") as BufferAttribute;
  const output = positionAttribute.array as Float32Array;
  const { fiberCount, pointsPerFiber } = performance.statics.fibers;
  const bundleCount = displayedBundleCount(performance);
  const centers = new Float32Array(BUNDLE_SAMPLE_COUNT * 2);
  const normals = new Float32Array(BUNDLE_SAMPLE_COUNT * 2);
  let cursor = 0;
  for (let bundle = 0; bundle < bundleCount; bundle += 1) {
    const fiber = fiberIndexForBundle(bundle, bundleCount, fiberCount);
    for (let sample = 0; sample < BUNDLE_SAMPLE_COUNT; sample += 1) {
      const unit = sample / (BUNDLE_SAMPLE_COUNT - 1);
      centers[sample * 2] = catmullCoordinate(transported, fiber, pointsPerFiber, unit, 0);
      centers[sample * 2 + 1] = catmullCoordinate(transported, fiber, pointsPerFiber, unit, 1);
    }
    for (let sample = 0; sample < BUNDLE_SAMPLE_COUNT; sample += 1) {
      const previous = Math.max(0, sample - 1);
      const next = Math.min(BUNDLE_SAMPLE_COUNT - 1, sample + 1);
      const tangentX = centers[next * 2]! - centers[previous * 2]!;
      const tangentY = centers[next * 2 + 1]! - centers[previous * 2 + 1]!;
      const tangentLength = Math.max(1e-6, Math.hypot(tangentX, tangentY));
      normals[sample * 2] = -tangentY / tangentLength;
      normals[sample * 2 + 1] = tangentX / tangentLength;
    }
    const depth = (bundle - (bundleCount - 1) * 0.5) * 0.006;
    const width = 0.009 + 0.002 * Math.sin((bundle + 1) * 1.7);
    for (let sample = 0; sample < BUNDLE_SAMPLE_COUNT - 1; sample += 1) {
      const firstNormalX = normals[sample * 2]!;
      const firstNormalY = normals[sample * 2 + 1]!;
      const secondNormalX = normals[(sample + 1) * 2]!;
      const secondNormalY = normals[(sample + 1) * 2 + 1]!;
      const firstX = centers[sample * 2]!;
      const firstY = centers[sample * 2 + 1]!;
      const secondX = centers[(sample + 1) * 2]!;
      const secondY = centers[(sample + 1) * 2 + 1]!;
      const points = [
        firstX - firstNormalX * width, firstY - firstNormalY * width,
        firstX + firstNormalX * width, firstY + firstNormalY * width,
        secondX - secondNormalX * width, secondY - secondNormalY * width,
        secondX - secondNormalX * width, secondY - secondNormalY * width,
        firstX + firstNormalX * width, firstY + firstNormalY * width,
        secondX + secondNormalX * width, secondY + secondNormalY * width,
      ];
      for (let vertex = 0; vertex < 6; vertex += 1) {
        output[cursor++] = points[vertex * 2]!;
        output[cursor++] = points[vertex * 2 + 1]!;
        output[cursor++] = depth;
      }
    }
  }
  positionAttribute.needsUpdate = true;
}

function makeTrailGeometry(): BufferGeometry {
  const vertexCount = (TRAIL_SAMPLE_COUNT - 1) * 6;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertexCount * 3), 3));
  const ages = new Float32Array(vertexCount);
  let vertex = 0;
  for (let sample = 0; sample < TRAIL_SAMPLE_COUNT - 1; sample += 1) {
    const first = sample / (TRAIL_SAMPLE_COUNT - 1);
    const second = (sample + 1) / (TRAIL_SAMPLE_COUNT - 1);
    const values = [first, first, second, second, first, second];
    for (let corner = 0; corner < 6; corner += 1) ages[vertex++] = values[corner]!;
  }
  geometry.setAttribute("aAge", new BufferAttribute(ages, 1));
  return geometry;
}

function updateTrailGeometry(geometry: BufferGeometry, performance: VortexLoomPerformance, time: number): void {
  const positionAttribute = geometry.getAttribute("position") as BufferAttribute;
  const output = positionAttribute.array as Float32Array;
  const centers = new Float32Array(TRAIL_SAMPLE_COUNT * 2);
  const velocities = new Float32Array(TRAIL_SAMPLE_COUNT * 2);
  const startTime = Math.max(0, time - TRAIL_DURATION_SECONDS);
  for (let sample = 0; sample < TRAIL_SAMPLE_COUNT; sample += 1) {
    const unit = sample / (TRAIL_SAMPLE_COUNT - 1);
    const state = sampleVortexLoomShuttle(performance, startTime + (time - startTime) * unit);
    centers[sample * 2] = state.position[0];
    centers[sample * 2 + 1] = state.position[1];
    velocities[sample * 2] = state.velocity[0];
    velocities[sample * 2 + 1] = state.velocity[1];
  }
  const reveal = smootherStep(time / 0.22);
  let cursor = 0;
  for (let sample = 0; sample < TRAIL_SAMPLE_COUNT - 1; sample += 1) {
    const previous = Math.max(0, sample - 1);
    const next = Math.min(TRAIL_SAMPLE_COUNT - 1, sample + 2);
    let tangentX = centers[next * 2]! - centers[previous * 2]!;
    let tangentY = centers[next * 2 + 1]! - centers[previous * 2 + 1]!;
    if (Math.hypot(tangentX, tangentY) < 1e-6) {
      tangentX = velocities[sample * 2]!;
      tangentY = velocities[sample * 2 + 1]!;
    }
    const tangentLength = Math.max(1e-6, Math.hypot(tangentX, tangentY));
    const normalX = -tangentY / tangentLength;
    const normalY = tangentX / tangentLength;
    const age = (sample + 1) / (TRAIL_SAMPLE_COUNT - 1);
    const width = reveal * (0.002 + 0.009 * age * age);
    const firstX = centers[sample * 2]!;
    const firstY = centers[sample * 2 + 1]!;
    const secondX = centers[(sample + 1) * 2]!;
    const secondY = centers[(sample + 1) * 2 + 1]!;
    const points = [
      firstX - normalX * width, firstY - normalY * width,
      firstX + normalX * width, firstY + normalY * width,
      secondX - normalX * width, secondY - normalY * width,
      secondX - normalX * width, secondY - normalY * width,
      firstX + normalX * width, firstY + normalY * width,
      secondX + normalX * width, secondY + normalY * width,
    ];
    for (let vertex = 0; vertex < 6; vertex += 1) {
      output[cursor++] = points[vertex * 2]!;
      output[cursor++] = points[vertex * 2 + 1]!;
      output[cursor++] = 0.24;
    }
  }
  positionAttribute.needsUpdate = true;
}

function visibleVortices(vortices: readonly VortexLoomVortex[], time: number): VortexLoomVortex[] {
  return vortices
    .map((vortex, index) => ({ vortex, index, distance: Math.abs(vortex.t - time) }))
    .filter(({ vortex }) => vortex.t >= time - 7.5 && vortex.activationStart <= time + 3)
    .sort((left, right) => left.distance - right.distance || left.index - right.index)
    .slice(0, MAX_VISIBLE_VORTICES)
    .sort((left, right) => left.index - right.index)
    .map(({ vortex }) => vortex);
}

export class VortexLoomScene {
  readonly backendKind = "three" as const;
  readonly tuning: VortexLoomTuning = { fibers: 0.92, pigment: 0.88, flow: 1, anticipation: 0.9, contactLight: 0.82, cameraDistance: 1 };

  readonly #performance: VortexLoomPerformance;
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera: OrthographicCamera;
  readonly #fieldMaterial: ShaderMaterial;
  readonly #fiberMaterial: ShaderMaterial;
  readonly #fiberGeometry: BufferGeometry;
  readonly #trailMaterial: ShaderMaterial;
  readonly #trailGeometry: BufferGeometry;
  readonly #shuttleMaterial: ShaderMaterial;
  readonly #shuttle: Mesh;
  readonly #vortexCenters = Array.from({ length: MAX_VISIBLE_VORTICES }, () => new Vector2());
  readonly #vortexColors = Array.from({ length: MAX_VISIBLE_VORTICES }, () => new Vector3());
  readonly #vortexCores = new Float32Array(MAX_VISIBLE_VORTICES);
  readonly #vortexStrengths = new Float32Array(MAX_VISIBLE_VORTICES);
  readonly #vortexPigmentStrengths = new Float32Array(MAX_VISIBLE_VORTICES);
  readonly #vortexContacts = new Float32Array(MAX_VISIBLE_VORTICES);

  constructor(canvas: HTMLCanvasElement, performance: VortexLoomPerformance) {
    this.#performance = performance;
    this.#renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.#renderer.setPixelRatio(1);
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#camera = new OrthographicCamera(-1.03, 1.03, 1.75, -1.75, 0.01, 20);
    this.#camera.position.set(0, 0, 5);

    this.#fieldMaterial = new ShaderMaterial({
      vertexShader: FIELD_VERTEX,
      fragmentShader: FIELD_FRAGMENT,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 }, uEnergy: { value: 0 }, uPulse: { value: 0 }, uPressure: { value: 0 }, uSilence: { value: 1 },
        uPigment: { value: this.tuning.pigment }, uFlow: { value: this.tuning.flow }, uAnticipation: { value: this.tuning.anticipation }, uContactLight: { value: this.tuning.contactLight },
        uVortexCount: { value: 0 }, uVortexCenter: { value: this.#vortexCenters }, uVortexColor: { value: this.#vortexColors },
        uVortexCore: { value: this.#vortexCores }, uVortexStrength: { value: this.#vortexStrengths },
        uVortexPigmentStrength: { value: this.#vortexPigmentStrengths }, uVortexContact: { value: this.#vortexContacts },
        uNextCenter: { value: new Vector2(0, 0) }, uShuttlePosition: { value: new Vector2(0, 0) },
        uNextColor: { value: new Color("#86c7bd") }, uNextPreview: { value: 0 },
      },
    });
    const background = new Mesh(new PlaneGeometry(2.06, 3.5), this.#fieldMaterial);
    background.position.z = -1;
    this.#scene.add(background);

    this.#fiberGeometry = makeRibbonGeometry(performance);
    this.#fiberMaterial = new ShaderMaterial({
      vertexShader: RIBBON_VERTEX,
      fragmentShader: RIBBON_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uOpacity: { value: this.tuning.fibers }, uPulse: { value: 0 }, uPressure: { value: 0 },
        uShuttlePosition: { value: new Vector2(0, 0) }, uNextCenter: { value: new Vector2(0, 0) },
        uNextColor: { value: new Color("#86c7bd") }, uNextPreview: { value: 0 },
      },
    });
    const fibers = new Mesh(this.#fiberGeometry, this.#fiberMaterial);
    fibers.position.z = 0;
    this.#scene.add(fibers);

    this.#trailGeometry = makeTrailGeometry();
    this.#trailMaterial = new ShaderMaterial({
      vertexShader: TRAIL_VERTEX,
      fragmentShader: TRAIL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: { uColor: { value: new Color("#d2ad59") }, uPulse: { value: 0 } },
    });
    const trail = new Mesh(this.#trailGeometry, this.#trailMaterial);
    trail.position.z = 0.24;
    this.#scene.add(trail);

    this.#shuttleMaterial = new ShaderMaterial({
      vertexShader: SHUTTLE_VERTEX,
      fragmentShader: SHUTTLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uPulse: { value: 0 }, uPressure: { value: 0 }, uColor: { value: new Color("#86c7bd") } },
    });
    this.#shuttle = new Mesh(new PlaneGeometry(0.23, 0.105), this.#shuttleMaterial);
    this.#shuttle.position.z = 0.4;
    this.#scene.add(this.#shuttle);
  }

  #updateFibers(time: number): void {
    const transported = sampleVortexLoomFiberPositions(this.#performance, time);
    updateRibbonGeometry(this.#fiberGeometry, this.#performance, transported);
    updateTrailGeometry(this.#trailGeometry, this.#performance, time);
  }

  #updateField(time: number, visual: VortexLoomVisualState, shuttlePosition: readonly [number, number]): void {
    const selected = visibleVortices(this.#performance.statics.vortices, time);
    for (let slot = 0; slot < MAX_VISIBLE_VORTICES; slot += 1) {
      const vortex = selected[slot];
      if (!vortex) {
        this.#vortexCenters[slot]!.set(0, 0);
        this.#vortexColors[slot]!.set(0, 0, 0);
        this.#vortexCores[slot] = 0.04;
        this.#vortexStrengths[slot] = 0;
        this.#vortexPigmentStrengths[slot] = 0;
        this.#vortexContacts[slot] = 0;
        continue;
      }
      const color = new Color(vortex.pigment);
      this.#vortexCenters[slot]!.set(vortex.center[0], vortex.center[1]);
      this.#vortexColors[slot]!.set(color.r, color.g, color.b);
      this.#vortexCores[slot] = Math.max(0.025, vortex.coreRadius);
      this.#vortexStrengths[slot] = Math.sign(vortex.circulation) * vortexActivation(vortex, time) * (0.5 + Math.abs(vortex.circulation) * 0.85);
      this.#vortexPigmentStrengths[slot] = vortexLoomPigmentHistoryStrength(vortex, time);
      this.#vortexContacts[slot] = vortexLoomContactStrength(vortex, time);
    }
    const next = this.#performance.statics.vortices[visual.nextIndex];
    const uniforms = this.#fieldMaterial.uniforms;
    const ribbonUniforms = this.#fiberMaterial.uniforms;
    uniforms.uVortexCount!.value = selected.length;
    (uniforms.uShuttlePosition!.value as Vector2).set(shuttlePosition[0], shuttlePosition[1]);
    (ribbonUniforms.uShuttlePosition!.value as Vector2).set(shuttlePosition[0], shuttlePosition[1]);
    if (next) {
      (uniforms.uNextCenter!.value as Vector2).set(next.center[0], next.center[1]);
      (uniforms.uNextColor!.value as Color).set(next.pigment);
      uniforms.uNextPreview!.value = visual.preview;
      (ribbonUniforms.uNextCenter!.value as Vector2).set(next.center[0], next.center[1]);
      (ribbonUniforms.uNextColor!.value as Color).set(next.pigment);
      ribbonUniforms.uNextPreview!.value = visual.preview;
    } else {
      uniforms.uNextPreview!.value = 0;
      ribbonUniforms.uNextPreview!.value = 0;
    }
  }

  renderFrame(time: number): void {
    const boundedTime = Math.max(0, Math.min(this.#performance.durationSec, time));
    const musical = sampleVortexLoomMusicalState(this.#performance, boundedTime);
    const visual = sampleVortexLoomVisualState(this.#performance, boundedTime);
    const shuttle = sampleVortexLoomShuttle(this.#performance, boundedTime);
    this.#updateFibers(boundedTime);
    this.#updateField(boundedTime, visual, shuttle.position);

    const direction = Math.atan2(shuttle.velocity[1], shuttle.velocity[0]);
    this.#shuttle.position.set(shuttle.position[0], shuttle.position[1], 0.4);
    this.#shuttle.rotation.z = direction;
    const shuttleScale = 0.92 + musical.pulse * 0.14 + musical.pressure * 0.08;
    this.#shuttle.scale.set(shuttleScale, shuttleScale, 1);

    this.#camera.zoom = 1 / Math.max(0.72, this.tuning.cameraDistance);
    this.#camera.updateProjectionMatrix();
    const fieldUniforms = this.#fieldMaterial.uniforms;
    fieldUniforms.uTime!.value = boundedTime;
    fieldUniforms.uEnergy!.value = vortexLoomEnergyAt(this.#performance, boundedTime);
    fieldUniforms.uPulse!.value = musical.pulse;
    fieldUniforms.uPressure!.value = musical.pressure;
    fieldUniforms.uSilence!.value = musical.silence;
    fieldUniforms.uPigment!.value = this.tuning.pigment;
    fieldUniforms.uFlow!.value = this.tuning.flow;
    fieldUniforms.uAnticipation!.value = this.tuning.anticipation;
    fieldUniforms.uContactLight!.value = this.tuning.contactLight;
    this.#fiberMaterial.uniforms.uOpacity!.value = this.tuning.fibers;
    this.#fiberMaterial.uniforms.uPulse!.value = musical.pulse;
    this.#fiberMaterial.uniforms.uPressure!.value = musical.pressure;
    const currentVortex = this.#performance.statics.vortices[Math.max(0, visual.currentIndex)]
      ?? this.#performance.statics.vortices[visual.nextIndex];
    if (currentVortex) (this.#trailMaterial.uniforms.uColor!.value as Color).set(currentVortex.pigment);
    if (currentVortex) (this.#shuttleMaterial.uniforms.uColor!.value as Color).set(currentVortex.pigment);
    this.#trailMaterial.uniforms.uPulse!.value = musical.pulse;
    this.#shuttleMaterial.uniforms.uPulse!.value = musical.pulse;
    this.#shuttleMaterial.uniforms.uPressure!.value = musical.pressure;
    this.#renderer.render(this.#scene, this.#camera);
  }

  destroy(): void {
    this.#scene.traverse((object) => {
      const drawable = object as Mesh;
      drawable.geometry?.dispose();
      const material = drawable.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose()); else material?.dispose();
    });
    this.#renderer.dispose();
  }
}
