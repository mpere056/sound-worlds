import { sampleAuroraParticle, type AuroraCoil, type AuroraPerformance } from "@reaper-viz/compiler-aurora";
import { Color, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget } from "three";

export type { AuroraPerformance } from "@reaper-viz/compiler-aurora";

export interface AuroraTuning {
  aurora: number;
  fieldMotion: number;
  particlePlasma: number;
  coilGlow: number;
  trail: number;
  cameraDistance: number;
}

export const AURORA_RAYMARCH_SCALE = 0.5;
export const AURORA_VISIBLE_FIELD_COUNT = 6;
export const AURORA_VOLUME_STEPS = 68;
const TRAIL_FIELD_COUNT = 6;

export interface AuroraMusicalState {
  pitch: number;
  pitchDirection: number;
  velocity: number;
  beatPulse: number;
  activity: number;
  succession: number;
  silence: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smootherStep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

export interface AuroraAnticipationState {
  aperture: number;
  fill: number;
  rim: number;
}

export function sampleAuroraAnticipation(leadSeconds: number): AuroraAnticipationState {
  if (leadSeconds >= 0) {
    const preview = smootherStep((3 - leadSeconds) / 3);
    const arrival = smootherStep((0.72 - leadSeconds) / 0.72);
    const aperture = preview * (1 - arrival);
    return {
      aperture,
      fill: preview * arrival,
      rim: preview * (0.28 + aperture * 0.72),
    };
  }
  const age = -leadSeconds;
  const afterglow = Math.exp(-((age / 0.62) ** 2));
  return { aperture: 0, fill: afterglow, rim: afterglow * 0.28 };
}

export function sampleAuroraFieldWindowFade(coils: readonly AuroraCoil[], coilIndex: number, time: number): number {
  const entryIndex = coilIndex - (AURORA_VISIBLE_FIELD_COUNT - 2);
  if (entryIndex < 0 || !coils[entryIndex]) return 1;
  return smootherStep((time - coils[entryIndex]!.t) / 0.32);
}

interface AuroraMusicalRange {
  minimumPitch: number;
  maximumPitch: number;
  minimumVelocity: number;
  maximumVelocity: number;
}

function musicalRange(coils: readonly AuroraCoil[]): AuroraMusicalRange {
  if (!coils.length) return { minimumPitch: 36, maximumPitch: 84, minimumVelocity: 0, maximumVelocity: 1 };
  const pitches = coils.map((coil) => coil.pitch);
  const velocities = coils.map((coil) => coil.energy);
  return {
    minimumPitch: Math.min(...pitches),
    maximumPitch: Math.max(...pitches),
    minimumVelocity: Math.min(...velocities),
    maximumVelocity: Math.max(...velocities),
  };
}

function normalizedPitch(range: AuroraMusicalRange, pitch: number): number {
  const relative = range.maximumPitch - range.minimumPitch > 1e-6 ? (pitch - range.minimumPitch) / (range.maximumPitch - range.minimumPitch) : 0.5;
  const absolute = clamp01((pitch - 36) / 48);
  return clamp01(relative * 0.72 + absolute * 0.28);
}

function normalizedVelocity(range: AuroraMusicalRange, velocity: number): number {
  if (range.maximumVelocity - range.minimumVelocity < 0.05) return clamp01(velocity);
  const relative = (velocity - range.minimumVelocity) / (range.maximumVelocity - range.minimumVelocity);
  return clamp01(relative * 0.76 + velocity * 0.24);
}

export function sampleAuroraMusicalState(coils: readonly AuroraCoil[], time: number): AuroraMusicalState {
  if (!coils.length) return { pitch: 0.5, pitchDirection: 0, velocity: 0, beatPulse: 0, activity: 0, succession: 0, silence: 1 };
  const range = musicalRange(coils);
  let currentIndex = 0;
  for (let index = 0; index < coils.length; index += 1) {
    if (coils[index]!.t <= time + 1e-9) currentIndex = index;
    else break;
  }
  const current = coils[currentIndex]!;
  const previous = coils[Math.max(0, currentIndex - 1)]!;
  const next = coils[Math.min(coils.length - 1, currentIndex + 1)]!;
  const nearestDistance = Math.min(...coils.map((coil) => Math.abs(time - coil.t)));
  const gapBefore = currentIndex > 0 ? current.t - previous.t : next.t - current.t;
  const transitionDuration = Math.max(0.11, Math.min(0.34, Math.max(0.001, gapBefore) * 0.68));
  const transitionLinear = clamp01((time - current.t) / transitionDuration);
  const transition = transitionLinear * transitionLinear * (3 - 2 * transitionLinear);
  let memory = 0;
  let beatPulse = 0;
  let phrasePitchSum = 0;
  let phraseVelocitySum = 0;
  for (const coil of coils) {
    const age = time - coil.t;
    const velocity = normalizedVelocity(range, coil.energy);
    if (age >= 0) {
      const attack = 1 - Math.exp(-age / 0.09);
      const contribution = attack * Math.exp(-age / 0.58) * (0.28 + velocity * 0.72);
      memory += contribution;
      phrasePitchSum += normalizedPitch(range, coil.pitch) * contribution;
      phraseVelocitySum += velocity * contribution;
    }
    beatPulse = Math.max(beatPulse, Math.exp(-Math.abs(age) * 8.5) * (0.18 + velocity * 0.82));
  }
  const succession = clamp01((memory - 0.12) / 0.55);
  const activity = clamp01(memory * 0.52 + succession * 0.38);
  const silence = clamp01((nearestDistance - 0.1) / 0.92) * (1 - activity * 0.35);
  const previousPitch = normalizedPitch(range, previous.pitch);
  const currentPitch = normalizedPitch(range, current.pitch);
  const previousVelocity = normalizedVelocity(range, previous.energy);
  const currentVelocity = normalizedVelocity(range, current.energy);
  const transitionArc = Math.sin(transitionLinear * Math.PI);
  const glidingPitch = previousPitch + (currentPitch - previousPitch) * transition;
  const glidingVelocity = previousVelocity + (currentVelocity - previousVelocity) * transition;
  const phrasePitch = memory > 1e-6 ? phrasePitchSum / memory : glidingPitch;
  const phraseVelocity = memory > 1e-6 ? phraseVelocitySum / memory : glidingVelocity;
  const phraseBlend = succession * 0.72;
  const pitchDirection = Math.max(-1, Math.min(1, (current.pitch - previous.pitch) / 12)) * transitionArc * (1 - phraseBlend);
  return {
    pitch: glidingPitch + (phrasePitch - glidingPitch) * phraseBlend,
    pitchDirection,
    velocity: glidingVelocity + (phraseVelocity - glidingVelocity) * phraseBlend,
    beatPulse: clamp01(beatPulse),
    activity,
    succession,
    silence,
  };
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
#define FIELD_COUNT ${AURORA_VISIBLE_FIELD_COUNT}
#define TRAIL_COUNT ${TRAIL_FIELD_COUNT}
#define VOLUME_STEPS ${AURORA_VOLUME_STEPS}

uniform vec2 uResolution;
uniform float uTime;
uniform float uEnergy;
uniform float uBeatPulse;
uniform float uNotePitch;
uniform float uNotePitchDirection;
uniform float uNoteVelocity;
uniform float uNoteActivity;
uniform float uNoteSuccession;
uniform float uNoteSilence;
uniform float uFieldMotion;
uniform float uAurora;
uniform float uParticlePlasma;
uniform float uCoilGlow;
uniform vec3 uCameraPosition;
uniform vec3 uCameraTarget;
uniform vec3 uSingularityPosition;
uniform int uFieldCount;
uniform vec3 uFieldCenter[FIELD_COUNT];
uniform vec3 uFieldAxis[FIELD_COUNT];
uniform vec3 uFieldColor[FIELD_COUNT];
uniform float uFieldRadius[FIELD_COUNT];
uniform float uFieldPresence[FIELD_COUNT];
uniform float uFieldPulse[FIELD_COUNT];
uniform float uFieldPhase[FIELD_COUNT];
uniform float uFieldPitch[FIELD_COUNT];
uniform float uFieldVelocity[FIELD_COUNT];
uniform float uFieldAperture[FIELD_COUNT];
uniform float uFieldFill[FIELD_COUNT];
uniform float uFieldRim[FIELD_COUNT];
uniform vec3 uWakePosition[TRAIL_COUNT];
uniform float uWakeStrength[TRAIL_COUNT];

mat2 rotate2d(float angle) {
  float c = cos(angle), s = sin(angle);
  return mat2(c, -s, s, c);
}

float hash21(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}

float foldedField(vec3 point, float time) {
  float sum = 0.0;
  float weight = 1.0;
  vec3 fold = point;
  for (int octave = 0; octave < 5; octave++) {
    fold = abs(fold) / clamp(dot(fold, fold), 0.18, 3.4) - vec3(0.72, 0.63, 0.68);
    fold.xy *= rotate2d(0.41 + time * 0.017 + float(octave) * 0.07);
    fold.yz *= rotate2d(-0.23 + time * 0.011);
    sum += exp(-abs(length(fold) - 1.05) * (6.0 + float(octave))) / weight;
    weight *= 1.72;
  }
  return sum;
}

float singularityKnot(vec3 local, float time, out vec3 knotColor) {
  vec3 knot = local * 0.72;
  float accumulation = 0.0;
  float scale = 1.0;
  for (int iteration = 0; iteration < 5; iteration++) {
    knot = abs(knot) / clamp(dot(knot, knot), 0.12, 4.0) - vec3(0.82, 0.71, 0.76);
    knot.xz *= rotate2d(time * 0.14 + float(iteration) * 0.43);
    float lace = exp(-abs(length(knot) - 1.12) * (8.0 + float(iteration) * 1.8));
    accumulation += lace / scale;
    scale *= 1.48;
  }
  float angular = abs(dot(cos(knot.zxy * 5.0 + time), sin(knot * 4.0 - time * 0.73)));
  accumulation *= 0.42 + angular * 0.9;
  float hue = pow(0.5 + 0.5 * sin(time * 0.22 + knot.x * 0.6), 7.0) * 0.38;
  knotColor = mix(vec3(0.28, 0.82, 1.0), vec3(1.0, 0.62, 0.16), hue);
  return accumulation * exp(-length(local) * 0.7);
}

vec3 backgroundField(vec3 rayDirection, float time) {
  float azimuth = atan(rayDirection.y, rayDirection.x);
  float radial = length(rayDirection.xy);
  vec3 tunnel = vec3(azimuth * 1.45 - time * 0.055, log(max(0.03, radial)) * 1.75 + time * 0.07, rayDirection.z * 2.1);
  float folded = foldedField(tunnel, time * 0.35);
  float basin = exp(-abs(folded - 0.52) * 5.5);
  vec3 lowRegister = vec3(0.08, 0.3, 0.22);
  vec3 highRegister = vec3(0.025, 0.16, 0.46);
  vec3 color = mix(lowRegister, highRegister, uNotePitch);
  color *= 0.78 + 0.22 * sin(azimuth * (1.6 + uNotePitch * 2.4) + time * 0.08 + uNotePitchDirection * 1.7);
  float phraseBreath = mix(0.32, 1.15, uNoteActivity) * mix(1.0, 0.28, uNoteSilence);
  return color * basin * folded * 0.18 * uAurora * phraseBreath + vec3(0.001, 0.003, 0.008);
}

void applyFieldOperators(vec3 worldPoint, float time, inout vec3 warpedPoint, out float fieldFlux, out float futureVoid, out vec3 fieldColor) {
  fieldFlux = 0.0;
  futureVoid = 0.0;
  fieldColor = vec3(0.0);
  for (int index = 0; index < FIELD_COUNT; index++) {
    if (index >= uFieldCount) break;
    vec3 axis = normalize(uFieldAxis[index]);
    vec3 local = worldPoint - uFieldCenter[index];
    float axial = dot(local, axis);
    vec3 radialVector = local - axis * axial;
    float radial = length(radialVector);
    vec3 radialDirection = radial > 0.001 ? radialVector / radial : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(axis, radialDirection));
    float shellCoordinate = radial - uFieldRadius[index];
    float envelope = exp(-length(local) * 0.62) * uFieldPresence[index];
    float previewReach = exp(-length(local) * 0.44) * uFieldRim[index];
    float apertureEnvelope = exp(-length(local) * 0.38) * uFieldAperture[index];
    float fillEnvelope = exp(-length(local) * 0.52) * uFieldFill[index];
    float pitchScale = mix(2.35, 5.8, uFieldPitch[index]);
    float velocityPressure = mix(0.68, 1.48, uFieldVelocity[index]);
    float articulation = mix(uFieldPulse[index], uFieldPulse[index] * 0.22, uNoteSuccession);
    float phrasePressure = uNoteActivity * (0.22 + uNoteVelocity * 0.18) + uNoteSuccession * 0.2;
    float helicalWave = sin(shellCoordinate * pitchScale - axial * (1.55 + uFieldPitch[index] * 2.2) - time * 1.35 + uFieldPhase[index]);
    float counterWave = cos(shellCoordinate * (pitchScale + 2.1) + axial * 3.4 + time * 0.83 + uFieldPhase[index]);
    warpedPoint += tangent * helicalWave * envelope * velocityPressure * (0.13 + phrasePressure);
    warpedPoint += axis * counterWave * envelope * (0.055 + uFieldVelocity[index] * 0.085);
    warpedPoint += tangent * counterWave * apertureEnvelope * (0.035 + uFieldPitch[index] * 0.035);
    float caustic = exp(-abs(shellCoordinate + sin(axial * 2.7 + time) * 0.18) * 1.15 - abs(axial) * 0.42);
    float broken = pow(0.5 + 0.5 * sin(shellCoordinate * (7.0 + uFieldPitch[index] * 7.0) + axial * 6.0 - time * 2.4 + uFieldPhase[index]), mix(7.0, 16.0, uFieldVelocity[index]));
    float previewLace = pow(0.5 + 0.5 * sin(shellCoordinate * (3.8 + uFieldPitch[index] * 5.6) - axial * (2.4 + uFieldPitch[index] * 3.2) + time * 0.34 + uFieldPhase[index]), 11.0);
    float previewContribution = previewLace * previewReach * (0.08 + uFieldVelocity[index] * 0.12);
    float arrivalContribution = broken * fillEnvelope * (0.15 + uFieldVelocity[index] * 0.3);
    float contribution = caustic * (0.055 + broken * (0.28 + uFieldVelocity[index] * 0.46) + articulation * (0.42 + uFieldVelocity[index] * 0.78) + phrasePressure * 0.52) * envelope + previewContribution + arrivalContribution;
    futureVoid += apertureEnvelope * (0.32 + previewLace * 0.46) * (0.72 + uFieldVelocity[index] * 0.28);
    fieldFlux += contribution;
    fieldColor += uFieldColor[index] * contribution;
  }
}

void applyWake(vec3 worldPoint, float time, inout vec3 warpedPoint, out float wakeDensity) {
  wakeDensity = 0.0;
  for (int index = 0; index < TRAIL_COUNT; index++) {
    vec3 local = worldPoint - uWakePosition[index];
    float distance = length(local);
    float envelope = exp(-distance * 0.9) * uWakeStrength[index];
    vec3 curl = sin(local.yzx * (2.3 + float(index) * 0.12) + time * vec3(1.1, -0.8, 0.63));
    warpedPoint += curl * envelope * 0.13;
    float lace = pow(0.5 + 0.5 * sin(distance * 7.0 - time * 2.0 + float(index)), 9.0);
    wakeDensity += lace * envelope * 0.25;
  }
}

void main() {
  float time = uTime * uFieldMotion;
  float pitchScale = mix(0.78, 1.42, uNotePitch);
  float phrasePressure = mix(0.62, 1.42, uNoteActivity) * (0.88 + uNoteSuccession * 0.28) * mix(1.0, 0.5, uNoteSilence);
  float velocityPressure = mix(0.58, 1.5, uNoteVelocity);
  vec2 uv = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;
  vec3 forward = normalize(uCameraTarget - uCameraPosition);
  vec3 referenceUp = abs(forward.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 right = normalize(cross(forward, referenceUp));
  vec3 up = normalize(cross(right, forward));
  vec3 rayDirection = normalize(forward + right * uv.x * 0.55 + up * uv.y * 0.55);

  vec3 color = vec3(0.0);
  float transmittance = 1.0;
  float projectedField = 0.0;
  float projectedContour = 0.0;
  float depth = 0.15;
  for (int stepIndex = 0; stepIndex < VOLUME_STEPS; stepIndex++) {
    vec3 worldPoint = uCameraPosition + rayDirection * depth;
    vec3 warpedPoint = worldPoint * 0.34 * pitchScale;
    float fieldFlux;
    float futureVoid;
    vec3 fieldTint;
    applyFieldOperators(worldPoint, time, warpedPoint, fieldFlux, futureVoid, fieldTint);
    float wakeDensity;
    applyWake(worldPoint, time, warpedPoint, wakeDensity);
    warpedPoint += sin(warpedPoint.yzx * (1.7 + uNotePitch * 2.3) + time * vec3(0.74, -0.53, 0.39)) * uNoteActivity * 0.085;
    warpedPoint.xy *= rotate2d(uNotePitchDirection * (0.18 + uNoteActivity * 0.24));

    vec3 localToSingularity = worldPoint - uSingularityPosition;
    vec3 knotColor;
    float knot = singularityKnot(localToSingularity, time, knotColor) * uParticlePlasma;
    float fold = foldedField(warpedPoint + vec3(time * 0.025, -time * 0.018, time * 0.011), time * 0.3);
    float radialPhase = length(warpedPoint) * mix(2.45, 5.5, uNotePitch) + fold * (2.2 + uNoteVelocity * 1.4) - time * (0.32 + uNoteActivity * 0.64);
    float filament = pow(0.5 + 0.5 * sin(radialPhase + sin(warpedPoint.y * 4.0 + time) * 1.7), 14.0);
    float fracture = pow(abs(dot(cos(warpedPoint.zxy * 3.7 + time * 0.4), sin(warpedPoint * 3.1 - time * 0.31))), 4.0);
    float electricFrequency = mix(4.8, 9.6, uNotePitch);
    float electric = abs(dot(cos(warpedPoint.zxy * electricFrequency + time * 0.76), sin(warpedPoint * (electricFrequency * 0.84) - time * 0.58)));
    electric = pow(clamp(electric, 0.0, 1.0), mix(8.0, 16.0, uNoteVelocity));
    float microRidge = exp(-abs(sin(dot(warpedPoint, vec3(5.7, 7.1, 4.9)) + fold * 4.0 - time * 0.9)) * 22.0);
    float singularEnvelope = exp(-length(localToSingularity) * 0.68);
    float singularVein = abs(dot(cos(localToSingularity.zxy * 4.8 + time), sin(localToSingularity * 6.4 - time * 0.72)));
    singularVein = pow(clamp(singularVein, 0.0, 1.0), 11.0) * exp(-length(localToSingularity) * 0.42);
    float localInfluence = clamp(singularEnvelope * 0.72 + fieldFlux * 1.35 + wakeDensity * 0.8, 0.0, 1.0);
    float localElectric = electric * localInfluence;
    float fieldPotential = clamp(
      fold * (0.2 + uNoteActivity * 0.16) + localElectric * (0.46 + uNoteVelocity * 0.42) + wakeDensity * (0.48 + uNoteActivity * 0.62) +
      knot * singularEnvelope * 0.62 + singularVein * 0.46 + fieldFlux * 0.94 * uCoilGlow,
      0.0,
      1.6
    );
    fieldPotential *= 1.0 - clamp(futureVoid * 0.68, 0.0, 0.82);
    float contour = exp(-abs(sin(fieldPotential * 9.0 + radialPhase * 0.32 + fracture * 1.8)) * 27.0);
    float density = fieldPotential * 0.31 + contour * fieldPotential * 0.41 + microRidge * fieldPotential * 0.074;
    density *= (0.42 + uEnergy * 0.48) * phrasePressure * velocityPressure;
    density = clamp(density, 0.0, 0.82);

    vec3 registerColor = mix(vec3(0.08, 0.58, 0.32), vec3(0.15, 0.42, 0.98), uNotePitch);
    vec3 baseColor = mix(vec3(0.018, 0.3, 0.26), registerColor, 0.42 + 0.58 * sin(foldedField(warpedPoint.yzx, time * 0.2) * 1.2 + time * 0.07) * 0.5 + 0.29);
    float warmPhase = pow(0.5 + 0.5 * sin(warpedPoint.x * 0.7 + fold + time * 0.12), 9.0) * 0.42;
    vec3 spectralColor = mix(vec3(0.18, 0.78, 1.0), vec3(1.0, 0.5, 0.07), warmPhase);
    vec3 operatorTint = fieldFlux > 0.001 ? fieldTint / fieldFlux : spectralColor;
    vec3 sharedColor = mix(baseColor, spectralColor, clamp(localElectric + contour * 0.38, 0.0, 1.0));
    sharedColor = mix(sharedColor, operatorTint, clamp(fieldFlux * 0.72, 0.0, 0.62));
    sharedColor = mix(sharedColor, knotColor, clamp(knot * singularEnvelope * 0.48, 0.0, 0.58));
    vec3 emission = sharedColor * fieldPotential * (1.1 + uNoteVelocity * 1.65 + contour * (2.7 + uNoteVelocity * 3.1) + uEnergy * 0.9);
    emission += sharedColor * microRidge * fieldPotential * 1.2;
    float stepLength = 0.2 + depth * 0.006;
    color += transmittance * emission * density * stepLength * 0.8;
    projectedField += transmittance * fieldPotential * density * stepLength;
    projectedContour += transmittance * contour * fieldPotential * density * stepLength;
    transmittance *= exp(-density * stepLength * 0.34);
    depth += stepLength;
    if (transmittance < 0.025 || depth > 30.0) break;
  }

  color += backgroundField(rayDirection, time) * transmittance;
  vec3 singularityOffset = uSingularityPosition - uCameraPosition;
  float singularityDepth = max(0.25, dot(singularityOffset, forward));
  vec2 singularityUv = vec2(dot(singularityOffset, right), dot(singularityOffset, up)) / (singularityDepth * 0.55);
  vec2 fieldUv = uv - singularityUv;
  fieldUv += vec2(
    sin(fieldUv.y * 8.0 - time * 0.42),
    cos(fieldUv.x * 7.0 + time * 0.37)
  ) * (0.012 + projectedField * 0.028);
  float fieldRadius = length(fieldUv * vec2(1.0, 1.12)) + 0.018;
  float fieldAngle = atan(fieldUv.y, fieldUv.x);
  float sharedPhase = projectedField * 6.5 + projectedContour * 13.0 + uNotePitchDirection * 2.4;
  float spiralA = exp(-abs(sin(fieldAngle * mix(4.5, 9.5, uNotePitch) + log(fieldRadius) * mix(6.0, 12.5, uNotePitch) - time * 1.15 + sharedPhase)) * mix(42.0, 68.0, uNoteVelocity));
  float spiralB = exp(-abs(sin(fieldAngle * mix(3.5, 7.0, uNotePitch) - log(fieldRadius) * mix(8.0, 14.0, uNotePitch) + time * 0.83 - sharedPhase * 0.72)) * mix(48.0, 76.0, uNoteVelocity));
  float branchPhase = fieldUv.x * 24.0 + sin(fieldUv.y * 13.0 - time + sharedPhase) * 3.8;
  float branch = exp(-abs(sin(branchPhase + time * 0.62)) * 60.0);
  float volumeLuminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float densityGate = smoothstep(0.018, 0.34, volumeLuminance) * smoothstep(0.004, 0.12, projectedField);
  float darknessFalloff = exp(-pow(fieldRadius * mix(1.5, 1.05, uNoteActivity) * mix(1.0, 1.45, uNoteSilence), 1.55));
  float erosionA = 0.5 + 0.5 * sin(fieldAngle * 9.0 + log(fieldRadius) * 5.2 - time * 0.46 + sharedPhase * 1.7);
  float erosionB = 0.5 + 0.5 * sin(fieldUv.x * 17.0 - fieldUv.y * 13.0 + time * 0.31 + projectedContour * 8.0);
  float sustainedBeat = mix(uBeatPulse, max(uBeatPulse * 0.24, uNoteActivity * 0.78), uNoteSuccession);
  float continuity = smoothstep(0.36, 0.76, erosionA * 0.68 + erosionB * 0.32 + projectedContour * 0.38 + sustainedBeat * 0.12);
  float fieldGate = densityGate * darknessFalloff * continuity;
  float beatWave = 0.68 + 0.32 * sin(fieldRadius * 24.0 - time * 3.2 + sharedPhase);
  float caustic = (spiralA * 0.68 + spiralB * 0.46 + branch * spiralA * 0.84) * fieldGate * uParticlePlasma;
  vec3 fieldColor = mix(vec3(0.28, 0.82, 1.0), vec3(0.12, 0.56, 0.84), clamp(fieldRadius * 0.42, 0.0, 1.0));
  float pulseReveal = mix(0.025, 0.11, uNoteActivity) + (0.72 + uNoteVelocity * 0.34) * smoothstep(0.02, 0.72, sustainedBeat);
  color += fieldColor * caustic * (0.46 + projectedField * 0.96) * pulseReveal * (0.82 + uEnergy * beatWave * 0.42);
  float vignette = 1.0 - 0.14 * dot(uv, uv);
  color *= vignette;
  color *= 1.35;
  color = color / (0.68 + color);
  color = pow(max(color, 0.0), vec3(0.84));
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
  vec3 color = max(vec3(0.0), center * 1.34 - (north + south + east + west) * 0.078);
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color *= smoothstep(0.005, 0.32, luminance) * 0.92 + 0.56;
  float grain = hash21(gl_FragCoord.xy + uTime * 19.0) - 0.5;
  color += grain * 0.009;
  gl_FragColor = vec4(max(color, 0.0), 1.0);
}`;

function energyAt(performance: AuroraPerformance, time: number): number {
  const curve = performance.curves.energy;
  if (!curve?.values.length) return 0;
  const position = Math.max(0, Math.min(curve.values.length - 1, (time - curve.t0) / curve.dt));
  const left = Math.floor(position);
  const right = Math.min(curve.values.length - 1, left + 1);
  return curve.values[left]! + (curve.values[right]! - curve.values[left]!) * (position - left);
}

function vectorArray(length: number): Vector3[] {
  return Array.from({ length }, () => new Vector3());
}

function numberArray(length: number): number[] {
  return Array.from({ length }, () => 0);
}

export class AuroraScene {
  readonly backendKind = "three";
  readonly tuning: AuroraTuning = { aurora: 0.95, fieldMotion: 1, particlePlasma: 1.05, coilGlow: 0.92, trail: 0.76, cameraDistance: 1 };
  readonly #performance: AuroraPerformance;
  readonly #musicalRange: AuroraMusicalRange;
  readonly #renderer: WebGLRenderer;
  readonly #camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #volumeScene = new Scene();
  readonly #compositeScene = new Scene();
  readonly #volumeMaterial: ShaderMaterial;
  readonly #compositeMaterial: ShaderMaterial;
  readonly #volumeTarget: WebGLRenderTarget;
  readonly #fieldCenters = vectorArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #fieldAxes = vectorArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #fieldColors = vectorArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #fieldRadii = numberArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #fieldPresence = numberArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #fieldPulse = numberArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #fieldPhase = numberArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #fieldPitch = numberArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #fieldVelocity = numberArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #fieldAperture = numberArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #fieldFill = numberArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #fieldRim = numberArray(AURORA_VISIBLE_FIELD_COUNT);
  readonly #wakePositions = vectorArray(TRAIL_FIELD_COUNT);
  readonly #wakeStrength = numberArray(TRAIL_FIELD_COUNT);

  constructor(canvas: HTMLCanvasElement, performance: AuroraPerformance) {
    this.#performance = performance;
    this.#musicalRange = musicalRange(performance.statics.coils);
    this.#renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.setPixelRatio(1);
    this.#renderer.outputColorSpace = SRGBColorSpace;
    const volumeWidth = Math.round(performance.resolution.w * AURORA_RAYMARCH_SCALE);
    const volumeHeight = Math.round(performance.resolution.h * AURORA_RAYMARCH_SCALE);
    this.#volumeTarget = new WebGLRenderTarget(volumeWidth, volumeHeight, { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
    this.#volumeMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: VOLUME_FRAGMENT,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uResolution: { value: new Vector2(volumeWidth, volumeHeight) },
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uBeatPulse: { value: 0 },
        uNotePitch: { value: 0.5 },
        uNotePitchDirection: { value: 0 },
        uNoteVelocity: { value: 0 },
        uNoteActivity: { value: 0 },
        uNoteSuccession: { value: 0 },
        uNoteSilence: { value: 1 },
        uFieldMotion: { value: this.tuning.fieldMotion },
        uAurora: { value: this.tuning.aurora },
        uParticlePlasma: { value: this.tuning.particlePlasma },
        uCoilGlow: { value: this.tuning.coilGlow },
        uCameraPosition: { value: new Vector3() },
        uCameraTarget: { value: new Vector3() },
        uSingularityPosition: { value: new Vector3() },
        uFieldCount: { value: 0 },
        uFieldCenter: { value: this.#fieldCenters },
        uFieldAxis: { value: this.#fieldAxes },
        uFieldColor: { value: this.#fieldColors },
        uFieldRadius: { value: this.#fieldRadii },
        uFieldPresence: { value: this.#fieldPresence },
        uFieldPulse: { value: this.#fieldPulse },
        uFieldPhase: { value: this.#fieldPhase },
        uFieldPitch: { value: this.#fieldPitch },
        uFieldVelocity: { value: this.#fieldVelocity },
        uFieldAperture: { value: this.#fieldAperture },
        uFieldFill: { value: this.#fieldFill },
        uFieldRim: { value: this.#fieldRim },
        uWakePosition: { value: this.#wakePositions },
        uWakeStrength: { value: this.#wakeStrength },
      },
    });
    this.#volumeScene.add(new Mesh(new PlaneGeometry(2, 2), this.#volumeMaterial));
    this.#compositeMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uVolumeTexture: { value: this.#volumeTarget.texture },
        uVolumeResolution: { value: new Vector2(volumeWidth, volumeHeight) },
        uTime: { value: 0 },
      },
    });
    this.#compositeScene.add(new Mesh(new PlaneGeometry(2, 2), this.#compositeMaterial));
  }

  #updateFieldOperators(time: number, musical: AuroraMusicalState): void {
    const coils = this.#performance.statics.coils;
    const nextIndex = coils.findIndex((coil) => coil.t >= time - 1e-6);
    const anchor = nextIndex < 0 ? coils.length - 1 : nextIndex;
    const start = Math.max(0, Math.min(coils.length - AURORA_VISIBLE_FIELD_COUNT, anchor - 2));
    const count = Math.min(AURORA_VISIBLE_FIELD_COUNT, coils.length - start);
    for (let slot = 0; slot < AURORA_VISIBLE_FIELD_COUNT; slot += 1) {
      const coilIndex = start + slot;
      const coil = slot < count ? coils[coilIndex] : undefined;
      if (!coil) {
        this.#fieldCenters[slot]!.set(0, 0, 200);
        this.#fieldAxes[slot]!.set(0, 1, 0);
        this.#fieldColors[slot]!.set(0, 0, 0);
        this.#fieldRadii[slot] = 0;
        this.#fieldPresence[slot] = 0;
        this.#fieldPulse[slot] = 0;
        this.#fieldPhase[slot] = 0;
        this.#fieldPitch[slot] = 0.5;
        this.#fieldVelocity[slot] = 0;
        this.#fieldAperture[slot] = 0;
        this.#fieldFill[slot] = 0;
        this.#fieldRim[slot] = 0;
        continue;
      }
      const temporalDistance = Math.abs(time - coil.t);
      const temporalReach = coil.t < time ? 0.72 : 1.05;
      const windowFade = sampleAuroraFieldWindowFade(coils, coilIndex, time);
      const presence = Math.exp(-temporalDistance / temporalReach) * (1 - musical.succession * 0.34) * windowFade;
      const pulse = Math.exp(-Math.abs(time - coil.t) * 8.5);
      const color = new Color(coil.color);
      this.#fieldCenters[slot]!.set(...coil.center);
      this.#fieldAxes[slot]!.set(...coil.axis).normalize();
      this.#fieldColors[slot]!.set(color.r, color.g, color.b);
      this.#fieldRadii[slot] = coil.radius;
      this.#fieldPresence[slot] = Math.min(1, presence + pulse * (0.34 - musical.succession * 0.25));
      this.#fieldPulse[slot] = pulse;
      this.#fieldPhase[slot] = coilIndex * 1.61803398875 + coil.pitch * 0.071;
      this.#fieldPitch[slot] = normalizedPitch(this.#musicalRange, coil.pitch);
      this.#fieldVelocity[slot] = normalizedVelocity(this.#musicalRange, coil.energy);
      const anticipation = sampleAuroraAnticipation(coil.t - time);
      this.#fieldAperture[slot] = anticipation.aperture * windowFade;
      this.#fieldFill[slot] = anticipation.fill * windowFade;
      this.#fieldRim[slot] = anticipation.rim * windowFade;
    }
    this.#volumeMaterial.uniforms.uFieldCount!.value = count;
  }

  renderFrame(time: number): void {
    const energy = energyAt(this.#performance, time);
    const musical = sampleAuroraMusicalState(this.#performance.statics.coils, time);
    const state = sampleAuroraParticle(this.#performance.statics.route, time);
    const position = new Vector3(...state.position);
    const direction = new Vector3(...state.velocity).normalize();
    const cameraOffset = new Vector3(5.2, 3.4, 7.6).multiplyScalar(this.tuning.cameraDistance).addScaledVector(direction, -2.5 * this.tuning.cameraDistance);
    const cameraPosition = position.clone().add(cameraOffset);
    const cameraTarget = position.clone().addScaledVector(direction, 0.75);
    this.#updateFieldOperators(time, musical);
    for (let index = 0; index < TRAIL_FIELD_COUNT; index += 1) {
      const sample = sampleAuroraParticle(this.#performance.statics.route, Math.max(0, time - (index + 1) * 0.075));
      this.#wakePositions[index]!.set(...sample.position);
      this.#wakeStrength[index] = this.tuning.trail * (1 - index / TRAIL_FIELD_COUNT);
    }
    const uniforms = this.#volumeMaterial.uniforms;
    uniforms.uTime!.value = time;
    uniforms.uEnergy!.value = energy;
    uniforms.uBeatPulse!.value = musical.beatPulse;
    uniforms.uNotePitch!.value = musical.pitch;
    uniforms.uNotePitchDirection!.value = musical.pitchDirection;
    uniforms.uNoteVelocity!.value = musical.velocity;
    uniforms.uNoteActivity!.value = musical.activity;
    uniforms.uNoteSuccession!.value = musical.succession;
    uniforms.uNoteSilence!.value = musical.silence;
    uniforms.uFieldMotion!.value = this.tuning.fieldMotion;
    uniforms.uAurora!.value = this.tuning.aurora;
    uniforms.uParticlePlasma!.value = this.tuning.particlePlasma;
    uniforms.uCoilGlow!.value = this.tuning.coilGlow;
    (uniforms.uCameraPosition!.value as Vector3).copy(cameraPosition);
    (uniforms.uCameraTarget!.value as Vector3).copy(cameraTarget);
    (uniforms.uSingularityPosition!.value as Vector3).copy(position);
    this.#compositeMaterial.uniforms.uTime!.value = time;
    this.#renderer.setRenderTarget(this.#volumeTarget);
    this.#renderer.render(this.#volumeScene, this.#camera);
    this.#renderer.setRenderTarget(null);
    this.#renderer.render(this.#compositeScene, this.#camera);
  }

  destroy(): void {
    for (const scene of [this.#volumeScene, this.#compositeScene]) {
      scene.traverse((object) => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
    }
    this.#volumeTarget.dispose();
    this.#renderer.dispose();
  }
}
