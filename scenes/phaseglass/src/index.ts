import { samplePhaseglassRay, type PhaseglassMembrane, type PhaseglassPerformance, type PhaseglassRouteSegment, type PhaseglassVec3 } from "@reaper-viz/compiler-phaseglass";
import { Color, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget } from "three";

export type { PhaseglassPerformance } from "@reaper-viz/compiler-phaseglass";

export interface PhaseglassTuning {
  glass: number;
  caustics: number;
  dispersion: number;
  wavefront: number;
  cameraDistance: number;
}

export const PHASEGLASS_RAYMARCH_SCALE = 0.5;
export const PHASEGLASS_VISIBLE_MEMBRANES = 7;
export const PHASEGLASS_VOLUME_STEPS = 48;
export const PHASEGLASS_PATH_SEGMENT_COUNT = 10;
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
  return { vacancy: 0, fill: 0.2 + afterglow * 0.8, rim: 0.08 + afterglow * 0.3 };
}

export interface PhaseglassCausticSweep {
  position: number;
  strength: number;
  contact: number;
}

export function samplePhaseglassCausticSweep(leadSeconds: number): PhaseglassCausticSweep {
  const age = Math.max(0, -leadSeconds);
  const started = smootherStep((-leadSeconds + 0.015) / 0.075);
  return {
    position: -0.95 + clamp01(age / 0.9) * 1.9,
    strength: started * Math.exp(-age * 1.7),
    contact: Math.exp(-((leadSeconds / 0.085) ** 2)),
  };
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
  const start = Math.max(0, Math.min(durationSec, time));
  const end = Math.max(start, Math.min(durationSec, time + horizonSeconds));
  const times = [start, ...route.map((segment) => segment.t1).filter((boundary) => boundary > start + 1e-7 && boundary < end - 1e-7), end];
  while (times.length < PHASEGLASS_FUTURE_PATH_COUNT) {
    let largestGap = -1;
    let insertAt = 1;
    for (let index = 1; index < times.length; index += 1) {
      const gap = times[index]! - times[index - 1]!;
      if (gap > largestGap + 1e-9) {
        largestGap = gap;
        insertAt = index;
      }
    }
    if (largestGap < 1e-8) times.push(end);
    else times.splice(insertAt, 0, (times[insertAt - 1]! + times[insertAt]!) * 0.5);
  }
  while (times.length > PHASEGLASS_FUTURE_PATH_COUNT) {
    let removeAt = 1;
    let smallestImportance = Number.POSITIVE_INFINITY;
    for (let index = 1; index < times.length - 1; index += 1) {
      const importance = Math.min(times[index]! - times[index - 1]!, times[index + 1]! - times[index]!);
      if (importance < smallestImportance) {
        smallestImportance = importance;
        removeAt = index;
      }
    }
    times.splice(removeAt, 1);
  }
  return times.map((sampleTime) => {
    const progress = end > start + 1e-9 ? (sampleTime - start) / (end - start) : 1;
    return { t: sampleTime, position: samplePhaseglassRay(route, sampleTime).position, strength: 0.12 + smootherStep(1 - progress) * 0.88 };
  });
}

export interface PhaseglassPathSegmentSample {
  t0: number;
  t1: number;
  start: PhaseglassVec3;
  end: PhaseglassVec3;
  strength: number;
}

function samplePhaseglassSegmentWindow(route: readonly PhaseglassRouteSegment[], start: number, end: number, future: boolean): PhaseglassPathSegmentSample[] {
  const samples = route
    .filter((segment) => segment.t1 > start + 1e-8 && segment.t0 < end - 1e-8)
    .slice(future ? 0 : -PHASEGLASS_PATH_SEGMENT_COUNT)
    .slice(0, PHASEGLASS_PATH_SEGMENT_COUNT)
    .map((segment) => {
      const t0 = Math.max(start, segment.t0);
      const t1 = Math.min(end, segment.t1);
      const progress = end > start + 1e-8 ? (future ? (t0 - start) / (end - start) : (t1 - start) / (end - start)) : 1;
      return {
        t0,
        t1,
        start: samplePhaseglassRay(route, t0).position,
        end: samplePhaseglassRay(route, t1).position,
        strength: future ? 0.18 + smootherStep(1 - progress) * 0.72 : 0.18 + smootherStep(progress) * 0.82,
      };
    });
  const fallback = samplePhaseglassRay(route, future ? end : start).position;
  while (samples.length < PHASEGLASS_PATH_SEGMENT_COUNT) {
    samples.push({ t0: end, t1: end, start: [...fallback], end: [...fallback], strength: 0 });
  }
  return samples;
}

export function samplePhaseglassFutureSegments(route: readonly PhaseglassRouteSegment[], time: number, durationSec: number, horizonSeconds = 3): PhaseglassPathSegmentSample[] {
  const start = Math.max(0, Math.min(durationSec, time));
  return samplePhaseglassSegmentWindow(route, start, Math.max(start, Math.min(durationSec, time + horizonSeconds)), true);
}

export function samplePhaseglassHistorySegments(route: readonly PhaseglassRouteSegment[], time: number, historySeconds = 2.4): PhaseglassPathSegmentSample[] {
  const end = Math.max(0, time);
  return samplePhaseglassSegmentWindow(route, Math.max(0, end - historySeconds), end, false);
}

export interface PhaseglassCameraFrame {
  position: PhaseglassVec3;
  target: PhaseglassVec3;
  opticalDirection: PhaseglassVec3;
  extent: number;
}

export function samplePhaseglassCameraFrame(route: readonly PhaseglassRouteSegment[], time: number, durationSec: number, cameraDistance = 1): PhaseglassCameraFrame {
  const windowStart = Math.max(0, time - 1.2);
  const windowEnd = Math.max(windowStart, Math.min(durationSec, time + 3));
  const path = Array.from({ length: 13 }, (_, index) => samplePhaseglassRay(route, windowStart + (windowEnd - windowStart) * index / 12).position);
  const opticalDirection = normalizeVec3([0.38, -0.24, 0.89]);
  let weightTotal = 0;
  const corridorCenter: PhaseglassVec3 = [0, 0, 0];
  for (let index = 0; index < path.length; index += 1) {
    const relative = index / Math.max(1, path.length - 1);
    const weight = 0.45 + Math.sin(relative * Math.PI) * 0.55;
    weightTotal += weight;
    corridorCenter[0] += path[index]![0] * weight;
    corridorCenter[1] += path[index]![1] * weight;
    corridorCenter[2] += path[index]![2] * weight;
  }
  corridorCenter[0] /= weightTotal;
  corridorCenter[1] /= weightTotal;
  corridorCenter[2] /= weightTotal;
  const target: PhaseglassVec3 = [...corridorCenter];
  const extent = path.reduce((largest, sample) => Math.max(largest, Math.hypot(
    sample[0] - target[0],
    sample[1] - target[1],
    sample[2] - target[2],
  )), 0);
  const distance = Math.max(0.55, cameraDistance);
  const retreat = (8.4 + Math.min(12, extent) * 0.82) * distance;
  return {
    position: [
      target[0] - opticalDirection[0] * retreat,
      target[1] - opticalDirection[1] * retreat,
      target[2] - opticalDirection[2] * retreat,
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
#define HISTORY_COUNT ${PHASEGLASS_PATH_SEGMENT_COUNT}
#define PATH_COUNT ${PHASEGLASS_PATH_SEGMENT_COUNT}
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
uniform float uWavefront;
uniform vec3 uCameraPosition;
uniform vec3 uCameraTarget;
uniform int uMembraneCount;
uniform vec3 uMembraneCenter[MEMBRANE_COUNT];
uniform vec3 uMembraneNormal[MEMBRANE_COUNT];
uniform vec3 uMembraneAxisU[MEMBRANE_COUNT];
uniform vec3 uMembraneAxisV[MEMBRANE_COUNT];
uniform vec3 uMembraneOutgoing[MEMBRANE_COUNT];
uniform vec3 uMembraneColor[MEMBRANE_COUNT];
uniform float uMembraneRadius[MEMBRANE_COUNT];
uniform float uMembraneVacancy[MEMBRANE_COUNT];
uniform float uMembraneFill[MEMBRANE_COUNT];
uniform float uMembraneRim[MEMBRANE_COUNT];
uniform float uMembranePitch[MEMBRANE_COUNT];
uniform float uMembraneVelocity[MEMBRANE_COUNT];
uniform float uMembranePhase[MEMBRANE_COUNT];
uniform float uMembraneSweepPosition[MEMBRANE_COUNT];
uniform float uMembraneSweepStrength[MEMBRANE_COUNT];
uniform float uMembraneContact[MEMBRANE_COUNT];
uniform vec3 uHistoryStart[HISTORY_COUNT];
uniform vec3 uHistoryEnd[HISTORY_COUNT];
uniform float uHistoryStrength[HISTORY_COUNT];
uniform float uHistoryT0[HISTORY_COUNT];
uniform float uHistoryT1[HISTORY_COUNT];
uniform vec3 uPathStart[PATH_COUNT];
uniform vec3 uPathEnd[PATH_COUNT];
uniform float uPathStrength[PATH_COUNT];
uniform float uPathT0[PATH_COUNT];
uniform float uPathT1[PATH_COUNT];

float hash31(vec3 point) {
  return fract(sin(dot(point, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

vec3 architecturalField(vec3 rayDirection) {
  vec3 color = vec3(0.006, 0.012, 0.015);
  for (int layer = 0; layer < 5; layer++) {
    float layerIndex = float(layer);
    float distanceLayer = 9.0 + layerIndex * 6.5;
    vec3 point = uCameraPosition + rayDirection * distanceLayer;
    point += vec3(layerIndex * 2.9, -layerIndex * 1.2, layerIndex * 1.7);
    vec3 grid = abs(fract(point * vec3(0.085, 0.11, 0.075)) - 0.5);
    float verticalFrame = exp(-min(grid.x, grid.z) * (72.0 + layerIndex * 8.0));
    float horizontalFrame = exp(-grid.y * (82.0 + layerIndex * 7.0));
    float draftingPlane = exp(-abs(sin(dot(point, vec3(0.047, -0.019, 0.061)) + layerIndex * 1.7)) * 56.0);
    float structure = verticalFrame * (0.18 + horizontalFrame * 0.82) + draftingPlane * horizontalFrame * 0.34;
    vec3 layerColor = mix(vec3(0.018, 0.105, 0.12), vec3(0.13, 0.085, 0.035), layerIndex / 4.0);
    color += layerColor * structure * (0.34 - layerIndex * 0.038);
  }
  float horizon = exp(-abs(rayDirection.y + 0.21) * 54.0);
  color += vec3(0.018, 0.075, 0.085) * horizon * 0.22;
  return color;
}

void evaluatePhaseSheets(vec3 worldPoint, vec3 rayDirection, float time, out float structure, out float interference, out float dormant, out vec3 tint) {
  structure = 0.0;
  interference = 0.0;
  dormant = 0.0;
  tint = vec3(0.0);
  for (int index = 0; index < MEMBRANE_COUNT; index++) {
    if (index >= uMembraneCount) break;
    vec3 local = worldPoint - uMembraneCenter[index];
    float plane = dot(local, uMembraneNormal[index]);
    vec2 disc = vec2(dot(local, uMembraneAxisU[index]), dot(local, uMembraneAxisV[index]));
    vec2 sheetCoordinate = disc / max(0.08, uMembraneRadius[index]);
    vec2 absoluteCoordinate = abs(sheetCoordinate);
    float roundedSheet = pow(pow(absoluteCoordinate.x, 3.2) + pow(absoluteCoordinate.y, 3.2), 1.0 / 3.2);
    float faceted = max(roundedSheet, (absoluteCoordinate.x + absoluteCoordinate.y) * 0.67);
    float panelGate = smoothstep(1.94, 1.38, faceted);
    float apertureGate = smoothstep(1.1, 0.74, roundedSheet);
    float frame = exp(-abs(faceted - 1.66) * 24.0);
    float apertureBevel = exp(-abs(roundedSheet - 1.04) * 26.0);
    float sheet = exp(-abs(plane) * 7.5) * panelGate;
    float fresnel = pow(1.0 - abs(dot(rayDirection, uMembraneNormal[index])), 2.0);
    vec2 bend = vec2(dot(uMembraneOutgoing[index], uMembraneAxisU[index]), dot(uMembraneOutgoing[index], uMembraneAxisV[index]));
    bend = normalize(bend + vec2(0.0001));
    float phaseCoordinate = dot(disc, bend);
    float crossCoordinate = dot(disc, vec2(-bend.y, bend.x));
    float directionalEtch = exp(-abs(sin(phaseCoordinate * (7.0 + uMembranePitch[index] * 9.0) + crossCoordinate * 1.7 + uMembranePhase[index])) * 30.0);
    float counterEtch = exp(-abs(sin(crossCoordinate * (5.0 + uMembraneVelocity[index] * 7.0) - phaseCoordinate * 2.2 - time * 0.16)) * 38.0);
    float moire = pow(0.5 + 0.5 * cos(phaseCoordinate * 13.0 + sin(crossCoordinate * 5.0 + uMembranePhase[index])), 9.0);
    float normalizedPhase = phaseCoordinate / max(0.08, uMembraneRadius[index]);
    float sweep = exp(-abs(normalizedPhase - uMembraneSweepPosition[index]) * 24.0) * uMembraneSweepStrength[index];
    float contactBloom = (0.24 + moire * 0.76) * uMembraneContact[index];
    float activation = uMembraneFill[index] + uMembraneRim[index] * 0.7;
    float persistent = 0.22 + activation * 0.78;
    structure += sheet * (panelGate * 0.07 + frame * (0.62 + fresnel * 0.46) + apertureBevel * (0.18 + fresnel * 0.28)) * persistent;
    float localInterference = sheet * apertureGate * (directionalEtch * 0.4 + counterEtch * 0.22 + moire * 0.5 + sweep * 1.25 + contactBloom * 0.72) * (0.18 + activation * (0.82 + uMembraneVelocity[index] * 0.4));
    interference += localInterference;
    dormant += sheet * (frame * 0.72 + directionalEtch * apertureGate * 0.18) * uMembraneVacancy[index];
    vec3 prismaticTint = mix(uMembraneColor[index], mix(vec3(0.62, 0.94, 1.0), vec3(1.0, 0.72, 0.32), uMembranePitch[index]), fresnel * 0.38);
    tint += prismaticTint * (sheet * (0.14 + frame * 0.48 + apertureBevel * 0.2) + localInterference * 0.24);
  }
}

vec3 waveSegment(vec3 point, vec3 start, vec3 end, float strength, float t0, float t1, float dormant) {
  vec3 delta = end - start;
  float segmentLength = length(delta);
  if (strength <= 0.0001 || segmentLength <= 0.0001) return vec3(0.0);
  vec3 direction = delta / segmentLength;
  float rawAlong = dot(point - start, delta) / max(0.0001, dot(delta, delta));
  float along = clamp(rawAlong, 0.0, 1.0);
  vec3 center = start + delta * along;
  vec3 side = cross(direction, vec3(0.0, 1.0, 0.0));
  if (length(side) < 0.05) side = cross(direction, vec3(1.0, 0.0, 0.0));
  side = normalize(side);
  vec3 verticalAxis = normalize(cross(side, direction));
  vec3 local = point - center;
  float lateral = dot(local, side);
  float vertical = dot(local, verticalAxis);
  float scoreTime = mix(t0, t1, along);
  float outsideDistance = max(max(-rawAlong, rawAlong - 1.0), 0.0) * segmentLength;
  float joinEnvelope = exp(-outsideDistance * outsideDistance * 2.6);
  float radialSquared = lateral * lateral * 1.55 + vertical * vertical * 7.2;
  float envelope = exp(-radialSquared);
  float broadEnvelope = exp(-radialSquared * 0.42);
  float core = exp(-radialSquared * 4.8);
  float carrierPhase = (scoreTime - uTime) * (17.0 + uPitch * 5.0);
  float strand = pow(0.5 + 0.5 * cos(lateral * (10.0 + uPitch * 6.0) + vertical * 2.2 + scoreTime * 2.4), 6.0);
  float movingCrest = 0.32 + 0.68 * pow(0.5 + 0.5 * cos(carrierPhase), 4.0);
  float futureReach = exp(-max(0.0, scoreTime - uTime) * 0.95);
  float visibleStrength = strength * mix(1.0, 0.2 + futureReach * 0.8, dormant);
  float wave = (broadEnvelope * 0.2 + envelope * (0.26 + strand * 0.42) + core * 0.58) * visibleStrength * joinEnvelope;
  float crest = (core * 0.58 + envelope * 0.42) * movingCrest * visibleStrength * joinEnvelope * mix(1.0, 0.7, dormant);
  float spectralEdge = envelope * smoothstep(0.08, 0.7, abs(lateral)) * strand * visibleStrength * joinEnvelope;
  return vec3(wave, crest, spectralEdge);
}

vec3 historyWave(vec3 point) {
  vec3 field = vec3(0.0);
  for (int index = 0; index < HISTORY_COUNT; index++) {
    field += waveSegment(point, uHistoryStart[index], uHistoryEnd[index], uHistoryStrength[index], uHistoryT0[index], uHistoryT1[index], 0.0);
  }
  return field;
}

vec3 futureWave(vec3 point) {
  vec3 field = vec3(0.0);
  for (int index = 0; index < PATH_COUNT; index++) {
    field += waveSegment(point, uPathStart[index], uPathEnd[index], uPathStrength[index], uPathT0[index], uPathT1[index], 1.0);
  }
  return field;
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;
  vec3 forward = normalize(uCameraTarget - uCameraPosition);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  if (length(right) < 0.01) right = vec3(1.0, 0.0, 0.0);
  vec3 up = normalize(cross(right, forward));
  vec3 rayDirection = normalize(forward * 1.62 + right * uv.x + up * uv.y);
  float depth = 0.3 + hash31(vec3(gl_FragCoord.xy, floor(uTime * 60.0))) * 0.28;
  vec3 color = architecturalField(rayDirection);
  for (int step = 0; step < VOLUME_STEPS; step++) {
    vec3 point = uCameraPosition + rayDirection * depth;
    float structure, interference, dormant;
    vec3 sheetTint;
    evaluatePhaseSheets(point, rayDirection, uTime, structure, interference, dormant, sheetTint);
    vec3 history = historyWave(point) * uWavefront;
    vec3 preview = futureWave(point) * uWavefront;
    vec3 glassColor = structure > 0.001 ? sheetTint / max(0.18, structure + interference * 0.5) : vec3(0.18, 0.62, 0.66);
    vec3 activeWaveColor = mix(vec3(0.45, 0.92, 0.94), vec3(0.98, 0.67, 0.25), uPitch * 0.44);
    vec3 dormantColor = mix(vec3(0.16, 0.43, 0.47), vec3(0.42, 0.31, 0.14), uPitch * 0.32);
    vec3 emission = glassColor * structure * (0.5 + uGlass * 1.22);
    emission += mix(glassColor, vec3(1.0, 0.78, 0.4), uDispersion * 0.26) * interference * (0.82 + uCaustics * 2.1 + uPulse * 0.68);
    emission += dormantColor * dormant * 0.42;
    emission += activeWaveColor * (history.x * (0.62 + uPressure * 0.32) + history.y * (0.48 + uVelocity * 0.5 + (1.0 - uSilence) * 0.36));
    emission += mix(activeWaveColor, vec3(0.42, 0.7, 0.73), 0.52) * (preview.x * 0.24 + preview.y * 0.34);
    emission += mix(vec3(0.27, 0.74, 0.79), vec3(0.95, 0.55, 0.2), uDispersion * 0.5) * (history.z + preview.z * 0.22) * uDispersion;
    float density = structure * 0.18 + interference * 0.12 + history.x * 0.1 + history.y * 0.08 + preview.x * 0.04;
    float stepLength = 0.42 + depth * 0.012;
    float integration = 0.16 + smoothstep(0.0, 0.3, density) * 0.84;
    color += emission * integration * stepLength * (0.78 + uEnergy * 0.26);
    depth += stepLength;
    if (depth > 36.0) break;
  }
  float vignette = 1.0 - 0.13 * dot(uv, uv);
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
uniform float uPulse;
uniform float uDispersion;
float hash21(vec2 point) { return fract(sin(dot(point, vec2(41.7, 289.1))) * 43758.5453); }
void main() {
  vec2 texel = 1.0 / uVolumeResolution;
  vec3 center = texture2D(uVolumeTexture, vUv).rgb;
  vec3 north = texture2D(uVolumeTexture, vUv + vec2(0.0, texel.y)).rgb;
  vec3 south = texture2D(uVolumeTexture, vUv - vec2(0.0, texel.y)).rgb;
  vec3 east = texture2D(uVolumeTexture, vUv + vec2(texel.x, 0.0)).rgb;
  vec3 west = texture2D(uVolumeTexture, vUv - vec2(texel.x, 0.0)).rgb;
  vec3 northeast = texture2D(uVolumeTexture, vUv + texel * vec2(1.7, 1.7)).rgb;
  vec3 northwest = texture2D(uVolumeTexture, vUv + texel * vec2(-1.7, 1.7)).rgb;
  vec3 southeast = texture2D(uVolumeTexture, vUv + texel * vec2(1.7, -1.7)).rgb;
  vec3 southwest = texture2D(uVolumeTexture, vUv + texel * vec2(-1.7, -1.7)).rgb;
  vec3 bloom = (north + south + east + west + northeast + northwest + southeast + southwest) * 0.125;
  vec3 color = max(vec3(0.0), center * 1.16 - bloom * 0.09);
  float luminance = dot(center, vec3(0.2126, 0.7152, 0.0722));
  float highlight = smoothstep(0.08, 0.62, luminance);
  color += bloom * (0.08 + highlight * (0.2 + uPulse * 0.18));
  vec2 spectralOffset = vec2(texel.x * (1.2 + uDispersion * 1.8), 0.0);
  vec3 spectral = vec3(texture2D(uVolumeTexture, vUv + spectralOffset).r, center.g, texture2D(uVolumeTexture, vUv - spectralOffset).b);
  color = mix(color, spectral, highlight * uDispersion * 0.09);
  color *= 0.72 + smoothstep(0.008, 0.3, luminance) * 0.54;
  color += (hash21(gl_FragCoord.xy + uTime * 17.0) - 0.5) * 0.0045;
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
  readonly tuning: PhaseglassTuning = { glass: 1.08, caustics: 1, dispersion: 0.58, wavefront: 0.92, cameraDistance: 1 };
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
  readonly #outgoing = vectors(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #colors = vectors(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #radii = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #vacancy = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #fill = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #rim = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #pitch = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #velocity = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #phase = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #sweepPosition = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #sweepStrength = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #contact = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #historyStarts = vectors(PHASEGLASS_PATH_SEGMENT_COUNT);
  readonly #historyEnds = vectors(PHASEGLASS_PATH_SEGMENT_COUNT);
  readonly #historyStrength = numbers(PHASEGLASS_PATH_SEGMENT_COUNT);
  readonly #historyT0 = numbers(PHASEGLASS_PATH_SEGMENT_COUNT);
  readonly #historyT1 = numbers(PHASEGLASS_PATH_SEGMENT_COUNT);
  readonly #pathStarts = vectors(PHASEGLASS_PATH_SEGMENT_COUNT);
  readonly #pathEnds = vectors(PHASEGLASS_PATH_SEGMENT_COUNT);
  readonly #pathStrength = numbers(PHASEGLASS_PATH_SEGMENT_COUNT);
  readonly #pathT0 = numbers(PHASEGLASS_PATH_SEGMENT_COUNT);
  readonly #pathT1 = numbers(PHASEGLASS_PATH_SEGMENT_COUNT);

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
        uGlass: { value: this.tuning.glass }, uCaustics: { value: this.tuning.caustics }, uDispersion: { value: this.tuning.dispersion }, uWavefront: { value: this.tuning.wavefront },
        uCameraPosition: { value: new Vector3() }, uCameraTarget: { value: new Vector3() },
        uMembraneCount: { value: 0 }, uMembraneCenter: { value: this.#centers }, uMembraneNormal: { value: this.#normals },
        uMembraneAxisU: { value: this.#axesU }, uMembraneAxisV: { value: this.#axesV }, uMembraneOutgoing: { value: this.#outgoing }, uMembraneColor: { value: this.#colors },
        uMembraneRadius: { value: this.#radii }, uMembraneVacancy: { value: this.#vacancy }, uMembraneFill: { value: this.#fill }, uMembraneRim: { value: this.#rim },
        uMembranePitch: { value: this.#pitch }, uMembraneVelocity: { value: this.#velocity }, uMembranePhase: { value: this.#phase },
        uMembraneSweepPosition: { value: this.#sweepPosition }, uMembraneSweepStrength: { value: this.#sweepStrength }, uMembraneContact: { value: this.#contact },
        uHistoryStart: { value: this.#historyStarts }, uHistoryEnd: { value: this.#historyEnds }, uHistoryStrength: { value: this.#historyStrength }, uHistoryT0: { value: this.#historyT0 }, uHistoryT1: { value: this.#historyT1 },
        uPathStart: { value: this.#pathStarts }, uPathEnd: { value: this.#pathEnds }, uPathStrength: { value: this.#pathStrength }, uPathT0: { value: this.#pathT0 }, uPathT1: { value: this.#pathT1 },
      },
    });
    this.#volumeScene.add(new Mesh(new PlaneGeometry(2, 2), this.#volumeMaterial));
    this.#compositeMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthWrite: false,
      depthTest: false,
      uniforms: { uVolumeTexture: { value: this.#target.texture }, uVolumeResolution: { value: new Vector2(width, height) }, uTime: { value: 0 }, uPulse: { value: 0 }, uDispersion: { value: this.tuning.dispersion } },
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
        this.#centers[slot]!.set(0, 0, 200); this.#normals[slot]!.set(0, 0, 1); this.#axesU[slot]!.set(1, 0, 0); this.#axesV[slot]!.set(0, 1, 0); this.#outgoing[slot]!.set(0, 0, 1); this.#colors[slot]!.set(0, 0, 0);
        this.#radii[slot] = 0; this.#vacancy[slot] = 0; this.#fill[slot] = 0; this.#rim[slot] = 0; this.#pitch[slot] = 0.5; this.#velocity[slot] = 0; this.#phase[slot] = 0; this.#sweepPosition[slot] = -0.95; this.#sweepStrength[slot] = 0; this.#contact[slot] = 0;
        continue;
      }
      const anticipation = samplePhaseglassAnticipation(membrane.t - time, 0.5 + membrane.duration * 1.1);
      const color = new Color(membrane.color);
      this.#centers[slot]!.set(...membrane.center); this.#normals[slot]!.set(...membrane.normal).normalize(); this.#axesU[slot]!.set(...membrane.axisU).normalize(); this.#axesV[slot]!.set(...membrane.axisV).normalize(); this.#outgoing[slot]!.set(...membrane.outgoingDirection).normalize();
      this.#colors[slot]!.set(color.r, color.g, color.b); this.#radii[slot] = membrane.radius; this.#vacancy[slot] = anticipation.vacancy; this.#fill[slot] = anticipation.fill; this.#rim[slot] = anticipation.rim;
      this.#pitch[slot] = normalizePitch(this.#range, membrane.pitch); this.#velocity[slot] = normalizeVelocity(this.#range, membrane.energy); this.#phase[slot] = (start + slot) * 1.61803398875 + membrane.pitch * 0.071;
      const sweep = samplePhaseglassCausticSweep(membrane.t - time);
      this.#sweepPosition[slot] = sweep.position; this.#sweepStrength[slot] = sweep.strength; this.#contact[slot] = sweep.contact;
    }
    this.#volumeMaterial.uniforms.uMembraneCount!.value = count;
  }

  renderFrame(time: number): void {
    const cameraFrame = samplePhaseglassCameraFrame(this.#performance.statics.route, time, this.#performance.durationSec, this.tuning.cameraDistance);
    const cameraPosition = new Vector3(...cameraFrame.position);
    const cameraTarget = new Vector3(...cameraFrame.target);
    const musical = samplePhaseglassMusicalState(this.#performance.statics.membranes, time);
    this.#updateMembranes(time);
    const historyPath = samplePhaseglassHistorySegments(this.#performance.statics.route, time);
    for (let index = 0; index < PHASEGLASS_PATH_SEGMENT_COUNT; index += 1) {
      const sample = historyPath[index]!;
      this.#historyStarts[index]!.set(...sample.start);
      this.#historyEnds[index]!.set(...sample.end);
      this.#historyStrength[index] = sample.strength;
      this.#historyT0[index] = sample.t0;
      this.#historyT1[index] = sample.t1;
    }
    const futurePath = samplePhaseglassFutureSegments(this.#performance.statics.route, time, this.#performance.durationSec);
    for (let index = 0; index < PHASEGLASS_PATH_SEGMENT_COUNT; index += 1) {
      const sample = futurePath[index]!;
      this.#pathStarts[index]!.set(...sample.start);
      this.#pathEnds[index]!.set(...sample.end);
      this.#pathStrength[index] = sample.strength;
      this.#pathT0[index] = sample.t0;
      this.#pathT1[index] = sample.t1;
    }
    const uniforms = this.#volumeMaterial.uniforms;
    uniforms.uTime!.value = time; uniforms.uEnergy!.value = energyAt(this.#performance, time); uniforms.uPitch!.value = musical.pitch; uniforms.uVelocity!.value = musical.velocity;
    uniforms.uPulse!.value = musical.pulse; uniforms.uActivity!.value = musical.activity; uniforms.uPressure!.value = musical.pressure; uniforms.uSilence!.value = musical.silence;
    uniforms.uGlass!.value = this.tuning.glass; uniforms.uCaustics!.value = this.tuning.caustics; uniforms.uDispersion!.value = this.tuning.dispersion; uniforms.uWavefront!.value = this.tuning.wavefront;
    (uniforms.uCameraPosition!.value as Vector3).copy(cameraPosition); (uniforms.uCameraTarget!.value as Vector3).copy(cameraTarget);
    this.#compositeMaterial.uniforms.uTime!.value = time;
    this.#compositeMaterial.uniforms.uPulse!.value = musical.pulse;
    this.#compositeMaterial.uniforms.uDispersion!.value = this.tuning.dispersion;
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
