import { type PhaseglassMembrane, type PhaseglassPerformance, type PhaseglassVec3 } from "@reaper-viz/compiler-phaseglass";
import { Color, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget } from "three";

export type { PhaseglassPerformance } from "@reaper-viz/compiler-phaseglass";

export interface PhaseglassTuning {
  glass: number;
  caustics: number;
  dispersion: number;
  wavefront: number;
  cameraDistance: number;
}

export interface PhaseglassShaderDiagnostic {
  kind: "shader";
  stage: "volume" | "composite" | "unknown";
  webglError: number;
  linkStatus: boolean;
  validateStatus: boolean;
  programLog: string;
  vertexLog: string;
  fragmentLog: string;
  vertexSource: string;
  fragmentSource: string;
}

export interface PhaseglassBlackFrameDiagnostic {
  kind: "black-frame";
  stage: "volume";
  webglError: number;
  time: number;
  samples: number[];
  cameraPosition: PhaseglassVec3;
  cameraTarget: PhaseglassVec3;
  musical: PhaseglassMusicalState;
  energy: number;
  noteCount: number;
}

export interface PhaseglassContextLostDiagnostic {
  kind: "context-lost";
  stage: "renderer";
  webglError: number;
  statusMessage: string;
}

export type PhaseglassDiagnostic = PhaseglassShaderDiagnostic | PhaseglassBlackFrameDiagnostic | PhaseglassContextLostDiagnostic;
export type PhaseglassDiagnosticHandler = (diagnostic: PhaseglassDiagnostic) => void;

export const PHASEGLASS_RAYMARCH_SCALE = 0.5;
export const PHASEGLASS_LAYER_COUNT = 3;
export const PHASEGLASS_NOTE_WINDOW_COUNT = 8;
export const PHASEGLASS_VISIBLE_MEMBRANES = PHASEGLASS_LAYER_COUNT;
export const PHASEGLASS_VOLUME_STEPS = 34;
export const PHASEGLASS_NOTE_EXPRESSION = 1.9;

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

export interface PhaseglassCameraFrame {
  position: PhaseglassVec3;
  target: PhaseglassVec3;
  opticalDirection: PhaseglassVec3;
  extent: number;
}

export function samplePhaseglassCameraFrame(cameraDistance = 1): PhaseglassCameraFrame {
  const directionLength = Math.hypot(0.38, -0.24, 0.89);
  const opticalDirection: PhaseglassVec3 = [0.38 / directionLength, -0.24 / directionLength, 0.89 / directionLength];
  const target: PhaseglassVec3 = [0, 0, 0];
  const extent = 7.4;
  const distance = Math.max(0.55, cameraDistance);
  const retreat = 17.2 * distance;
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

export interface PhaseglassDisturbance {
  noteTime: number;
  pitch: number;
  pitchClass: number;
  register: number;
  chroma: [number, number];
  interval: number;
  spacing: number;
  velocity: number;
  duration: number;
  direction: [number, number];
  phase: number;
  strength: number;
  preview: number;
}

function localPhaseGradient(membrane: PhaseglassMembrane): [number, number] {
  const gradientU = membrane.phaseGradient[0] * membrane.axisU[0] + membrane.phaseGradient[1] * membrane.axisU[1] + membrane.phaseGradient[2] * membrane.axisU[2];
  const gradientV = membrane.phaseGradient[0] * membrane.axisV[0] + membrane.phaseGradient[1] * membrane.axisV[1] + membrane.phaseGradient[2] * membrane.axisV[2];
  const magnitude = Math.hypot(gradientU, gradientV);
  if (magnitude < 1e-9) return [0, 0];
  const boundedMagnitude = 0.24 + Math.tanh(magnitude * 0.18) * 0.76;
  return [gradientU / magnitude * boundedMagnitude, gradientV / magnitude * boundedMagnitude];
}

export function samplePhaseglassDisturbances(membranes: readonly PhaseglassMembrane[], time: number): PhaseglassDisturbance[] {
  const range = musicalRange(membranes);
  return membranes
    .map((membrane, index) => ({ membrane, index, distance: Math.abs(membrane.t - time) }))
    .filter(({ membrane }) => membrane.t >= time - 4.2 && membrane.t <= time + 3)
    .sort((left, right) => left.distance - right.distance || left.index - right.index)
    .slice(0, PHASEGLASS_NOTE_WINDOW_COUNT)
    .sort((left, right) => left.membrane.t - right.membrane.t || left.index - right.index)
    .map(({ membrane, index }) => {
      const pitch = normalizePitch(range, membrane.pitch);
      const midiPitchClass = ((Math.round(membrane.pitch) % 12) + 12) % 12;
      const fifthsPosition = midiPitchClass * 7 % 12;
      const chromaAngle = fifthsPosition / 12 * Math.PI * 2;
      const previous = membranes[index - 1];
      const next = membranes[index + 1];
      const intervalSemitones = previous ? membrane.pitch - previous.pitch : next ? next.pitch - membrane.pitch : 0;
      const neighboringGaps = [previous ? membrane.t - previous.t : Number.POSITIVE_INFINITY, next ? next.t - membrane.t : Number.POSITIVE_INFINITY];
      const nearestGap = Math.min(...neighboringGaps.filter((gap) => gap >= 0));
      const velocity = normalizeVelocity(range, membrane.energy);
      const leadSeconds = membrane.t - time;
      const preview = leadSeconds > 0 ? smootherStep((3 - leadSeconds) / 3) : 0;
      const age = Math.max(0, -leadSeconds);
      const attack = leadSeconds <= 0 ? smootherStep(age / 0.18) : 0;
      const active = attack * Math.exp(-age / (1.65 + membrane.duration * 0.8 + velocity * 1.2));
      let [directionX, directionY] = localPhaseGradient(membrane);
      if (Math.hypot(directionX, directionY) < 1e-6) {
        const angle = pitch * Math.PI * 1.65 + index * 0.17;
        directionX = Math.cos(angle);
        directionY = Math.sin(angle);
      } else {
        const pitchRotation = (pitch - 0.5) * 1.15;
        const cosine = Math.cos(pitchRotation);
        const sine = Math.sin(pitchRotation);
        [directionX, directionY] = [directionX * cosine - directionY * sine, directionX * sine + directionY * cosine];
      }
      const directionLength = Math.max(1e-9, Math.hypot(directionX, directionY));
      return {
        noteTime: membrane.t,
        pitch,
        pitchClass: midiPitchClass / 11,
        register: clamp01((membrane.pitch - 24) / 72),
        chroma: [Math.cos(chromaAngle), Math.sin(chromaAngle)],
        interval: Math.max(-1, Math.min(1, intervalSemitones / 12)),
        spacing: Number.isFinite(nearestGap) ? clamp01(nearestGap / 1.2) : 1,
        velocity,
        duration: clamp01(membrane.duration / 1.2),
        direction: [directionX / directionLength, directionY / directionLength],
        phase: index * 0.754877666 + pitch * 2.31,
        strength: active * (0.34 + velocity * 0.66) + preview * (0.045 + velocity * 0.035),
        preview,
      };
    });
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
#define NOTE_COUNT ${PHASEGLASS_NOTE_WINDOW_COUNT}
#define VOLUME_STEPS ${PHASEGLASS_VOLUME_STEPS}
#define NOTE_EXPRESSION ${PHASEGLASS_NOTE_EXPRESSION.toFixed(2)}

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
uniform float uMembraneDepth[MEMBRANE_COUNT];
uniform float uMembraneTransmission[MEMBRANE_COUNT];
uniform float uMembranePhase[MEMBRANE_COUNT];
uniform float uMembraneSweepPosition[MEMBRANE_COUNT];
uniform float uMembraneSweepStrength[MEMBRANE_COUNT];
uniform float uMembraneContact[MEMBRANE_COUNT];
uniform int uNoteCount;
uniform float uNoteTime[NOTE_COUNT];
uniform float uNotePitch[NOTE_COUNT];
uniform float uNoteRegister[NOTE_COUNT];
uniform vec2 uNoteChroma[NOTE_COUNT];
uniform float uNoteInterval[NOTE_COUNT];
uniform float uNoteSpacing[NOTE_COUNT];
uniform float uNoteVelocity[NOTE_COUNT];
uniform float uNoteDuration[NOTE_COUNT];
uniform vec2 uNoteDirection[NOTE_COUNT];
uniform float uNotePhase[NOTE_COUNT];
uniform float uNoteStrength[NOTE_COUNT];
uniform float uNotePreview[NOTE_COUNT];

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

void evaluateDisturbances(vec2 coordinate, out float phaseMask, out float caustic, out float preview, out vec2 bend) {
  phaseMask = 0.0;
  caustic = 0.0;
  preview = 0.0;
  bend = vec2(0.0);
  for (int noteIndex = 0; noteIndex < NOTE_COUNT; noteIndex++) {
    if (noteIndex >= uNoteCount) break;
    float lead = uNoteTime[noteIndex] - uTime;
    float age = max(0.0, -lead);
    float pitch = uNotePitch[noteIndex];
    float registerPosition = uNoteRegister[noteIndex];
    vec2 chromaAxis = normalize(uNoteChroma[noteIndex] + vec2(0.0001, 0.0));
    vec2 chromaTangent = vec2(-chromaAxis.y, chromaAxis.x);
    float melodicInterval = uNoteInterval[noteIndex];
    float spacing = uNoteSpacing[noteIndex];
    float velocity = uNoteVelocity[noteIndex];
    float duration = uNoteDuration[noteIndex];
    vec2 direction = uNoteDirection[noteIndex];
    vec2 tangent = vec2(-direction.y, direction.x);
    vec2 melodicAxis = normalize(direction + tangent * melodicInterval * 0.82);
    float drift = age * (0.16 + velocity * 0.34);
    vec2 center = melodicAxis * drift;
    vec2 relative = coordinate - center;
    float aperture = 0.88 + duration * 1.28 + (1.0 - spacing) * 0.38;
    vec2 pupil = relative / aperture;
    float radiusSquared = dot(pupil, pupil);
    float radius = sqrt(radiusSquared + 0.0001);
    float travel = age * (1.0 + velocity * 2.7);
    float envelope = exp(-radiusSquared * (0.82 + spacing * 0.42));
    float chromaX = dot(pupil, chromaAxis);
    float chromaY = dot(pupil, chromaTangent);
    vec2 intervalAxis = normalize(melodicAxis + chromaAxis * abs(melodicInterval) * 0.46);
    float intervalProjection = dot(pupil, intervalAxis);
    float defocusMode = 2.0 * radiusSquared - 1.0;
    float astigmatismMode = chromaX * chromaX - chromaY * chromaY;
    float comaMode = (3.0 * radiusSquared - 2.0) * intervalProjection;
    float sphericalMode = 6.0 * radiusSquared * radiusSquared - 6.0 * radiusSquared + 1.0;
    float defocusCoefficient = 2.6 + registerPosition * 5.8;
    float astigmatismCoefficient = 0.9 + abs(melodicInterval) * 3.2 + (1.0 - spacing) * 0.7;
    float comaCoefficient = melodicInterval * 4.2;
    float sphericalCoefficient = (registerPosition - 0.5) * 2.6;
    float phasePotential = defocusMode * defocusCoefficient + astigmatismMode * astigmatismCoefficient + comaMode * comaCoefficient + sphericalMode * sphericalCoefficient;
    float carrierScale = (0.84 + pitch * 0.72) * (0.78 + velocity * 0.5);
    float phaseCoordinate = phasePotential * carrierScale - travel + uNotePhase[noteIndex];
    float secondaryPotential = defocusMode * (1.4 + registerPosition * 2.2) + astigmatismMode * (1.8 + abs(melodicInterval) * 2.4) + comaMode * comaCoefficient * 0.62;
    float secondaryPhase = secondaryPotential - travel * 0.52 + uNotePhase[noteIndex] * 0.73;
    float sharpness = 7.0 + velocity * 27.0;
    float primaryFront = exp(-abs(sin(phaseCoordinate)) * sharpness);
    float secondaryFront = exp(-abs(sin(secondaryPhase)) * (8.0 + velocity * 20.0));
    float phraseCoherence = 1.0 - spacing;
    float front = max(primaryFront, secondaryFront * (0.24 + phraseCoherence * 0.62)) * envelope;
    float contact = exp(-lead * lead * 150.0);
    float activeStrength = uNoteStrength[noteIndex] * (1.0 - step(0.0, lead));
    float future = uNotePreview[noteIndex] * step(0.0, lead);
    float morphologyWave = (sin(phaseCoordinate) + sin(secondaryPhase) * (0.16 + phraseCoherence * 0.46)) * envelope;
    phaseMask += morphologyWave * activeStrength * (0.58 + velocity * 1.02) * NOTE_EXPRESSION;
    caustic += front * (activeStrength * (0.62 + velocity * 1.72) + contact * (0.7 + velocity * 1.45)) * NOTE_EXPRESSION * 0.88;
    preview += future * max(primaryFront, secondaryFront * 0.7) * envelope * 0.34 * NOTE_EXPRESSION * 0.78;
    vec2 defocusGradient = pupil * 4.0 / aperture;
    vec2 astigmatismGradient = (chromaAxis * (2.0 * chromaX) - chromaTangent * (2.0 * chromaY)) / aperture;
    vec2 comaGradient = (pupil * (6.0 * intervalProjection) + intervalAxis * (3.0 * radiusSquared - 2.0)) / aperture;
    vec2 sphericalGradient = pupil * (24.0 * radiusSquared - 12.0) / aperture;
    vec2 wavefrontGradient = defocusGradient * defocusCoefficient + astigmatismGradient * astigmatismCoefficient + comaGradient * comaCoefficient + sphericalGradient * sphericalCoefficient;
    wavefrontGradient /= 1.0 + length(wavefrontGradient) * 0.14;
    bend += wavefrontGradient * activeStrength * envelope * (0.009 + velocity * 0.034) * NOTE_EXPRESSION * 1.12;
  }
}

void evaluatePhaseSheets(vec3 rayOrigin, vec3 rayDirection, float time, out float structure, out float interference, out float dormant, out vec3 tint) {
  structure = 0.0;
  interference = 0.0;
  dormant = 0.0;
  tint = vec3(0.0);
  for (int index = 0; index < MEMBRANE_COUNT; index++) {
    if (index >= uMembraneCount) break;
    float denominator = dot(rayDirection, uMembraneNormal[index]);
    float safeDenominator = abs(denominator) < 0.015 ? (denominator < 0.0 ? -0.015 : 0.015) : denominator;
    float rayDistance = dot(uMembraneCenter[index] - rayOrigin, uMembraneNormal[index]) / safeDenominator;
    float visible = step(0.05, rayDistance) * (1.0 - step(36.0, rayDistance));
    vec3 worldPoint = rayOrigin + rayDirection * max(0.05, rayDistance);
    vec3 local = worldPoint - uMembraneCenter[index];
    vec2 disc = vec2(dot(local, uMembraneAxisU[index]), dot(local, uMembraneAxisV[index]));
    vec2 sheetCoordinate = disc / max(0.08, uMembraneRadius[index]);
    float fresnel = pow(1.0 - abs(dot(rayDirection, uMembraneNormal[index])), 2.0);
    float sheet = exp(-dot(sheetCoordinate, sheetCoordinate) * 0.22) * visible;
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
    structure += sheet * (0.012 + fresnel * 0.026) * (0.22 + activation * 0.3);
    float localInterference = sheet * (directionalEtch * 0.05 + counterEtch * 0.035 + moire * 0.045 + sweep * 0.16 + contactBloom * 0.12) * (0.1 + activation * 0.24);
    interference += localInterference;
    dormant += sheet * directionalEtch * 0.024 * uMembraneVacancy[index];
    vec3 prismaticTint = mix(uMembraneColor[index], mix(vec3(0.62, 0.94, 1.0), vec3(1.0, 0.72, 0.32), uMembranePitch[index]), fresnel * 0.38);
    tint += prismaticTint * (sheet * (0.025 + fresnel * 0.03) + localInterference * 0.16);
  }
}

vec3 holographicField(vec3 point, float notePhase, float noteCaustic, vec2 noteBend) {
  vec2 transverse = point.xy;
  vec2 warped = transverse;
  float phase = point.z * (2.0 + uPitch * 0.7) - uTime * (0.12 + uActivity * 0.08);
  float encodedPhase = 0.0;
  float caustic = 0.0;
  float spectral = 0.0;
  float transmission = 1.0;

  for (int index = 0; index < MEMBRANE_COUNT; index++) {
    if (index >= uMembraneCount) break;
    float downstreamDistance = point.z - uMembraneCenter[index].z;
    float passed = smoothstep(-0.12, 0.12, downstreamDistance);
    float layerPhase = notePhase + float(index) * 0.83;
    vec2 layerBend = noteBend * (4.6 + float(index) * 0.45);
    vec2 gradient = vec2(dot(uMembraneOutgoing[index], uMembraneAxisU[index]), dot(uMembraneOutgoing[index], uMembraneAxisV[index])) + layerBend;
    float gradientLength = length(gradient);
    vec2 gradientDirection = gradientLength > 0.0001 ? gradient / gradientLength : vec2(0.7071, 0.7071);
    float written = uMembraneFill[index];
    float depth = uMembraneDepth[index] * written;
    float propagation = max(0.0, downstreamDistance);
    warped -= gradient * propagation * depth * 0.17;
    float localCoordinate = dot(warped, gradientDirection);
    float crossCoordinate = dot(warped, vec2(-gradientDirection.y, gradientDirection.x));
    float registerPhase = localCoordinate * (3.8 + uMembranePitch[index] * 7.2) + crossCoordinate * (0.8 + uMembraneVelocity[index] * 1.8) + uMembranePhase[index];
    float phaseWave = sin(registerPhase + sin(crossCoordinate * 2.1 - uTime * 0.08) * 0.55 + layerPhase * 1.45);
    phase += passed * depth * phaseWave * (0.72 + uMembraneVelocity[index] * 0.48);
    encodedPhase += passed * depth * (0.5 + 0.5 * cos(registerPhase + propagation * 0.34 + layerPhase));
    caustic += passed * depth * (exp(-abs(sin(registerPhase + phase)) * (10.0 + uMembraneVelocity[index] * 10.0)) + noteCaustic * (0.72 + float(index) * 0.09)) * exp(-propagation * 0.045);
    spectral += passed * depth * abs(sin(registerPhase * 0.47 + propagation * 0.22));
    transmission *= mix(1.0, uMembraneTransmission[index], passed * written * 0.7);
  }

  float radialSquared = dot(warped, warped);
  float broadField = exp(-radialSquared * 0.055);
  float middleField = exp(-radialSquared * 0.15);
  float wavefront = pow(0.5 + 0.5 * cos(phase + encodedPhase * 0.38), 7.0);
  float crossInterference = pow(0.5 + 0.5 * cos(phase * 0.57 - warped.x * warped.y * 0.22 + encodedPhase), 9.0);
  float filaments = pow(0.5 + 0.5 * sin(phase * 1.31 + radialSquared * 0.26), 12.0);
  float density = broadField * transmission * (0.09 + wavefront * 0.2 + crossInterference * 0.13 + encodedPhase * 0.045);
  float focus = middleField * transmission * (caustic * 0.28 + filaments * (0.08 + encodedPhase * 0.08));
  float dispersion = broadField * transmission * spectral * (0.035 + crossInterference * 0.07);
  return vec3(density, focus, dispersion);
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
  float notePhase, noteCaustic, notePreview;
  vec2 noteBend;
  evaluateDisturbances(uv, notePhase, noteCaustic, notePreview, noteBend);
  color += mix(vec3(0.018, 0.07, 0.08), vec3(0.09, 0.055, 0.018), uPitch) * notePreview * 0.26;
  float sheetStructure, sheetInterference, sheetDormant;
  vec3 sheetTint;
  evaluatePhaseSheets(uCameraPosition, rayDirection, uTime, sheetStructure, sheetInterference, sheetDormant, sheetTint);
  vec3 sheetGlassColor = sheetStructure > 0.001 ? sheetTint / max(0.18, sheetStructure + sheetInterference * 0.5) : vec3(0.18, 0.62, 0.66);
  vec3 sheetEmission = sheetGlassColor * sheetStructure * (0.38 + uGlass * 0.92);
  sheetEmission += mix(sheetGlassColor, vec3(1.0, 0.78, 0.4), uDispersion * 0.26) * sheetInterference * (0.54 + uCaustics * 1.42 + uPulse * 0.5);
  sheetEmission += mix(vec3(0.16, 0.43, 0.47), vec3(0.42, 0.31, 0.14), uPitch * 0.32) * sheetDormant * 0.3;
  color += sheetEmission * (0.52 + uEnergy * 0.18);
  for (int step = 0; step < VOLUME_STEPS; step++) {
    vec3 point = uCameraPosition + rayDirection * depth;
    vec3 field = holographicField(point, notePhase, noteCaustic, noteBend) * uWavefront;
    vec3 activeWaveColor = mix(vec3(0.45, 0.92, 0.94), vec3(0.98, 0.67, 0.25), uPitch * 0.44);
    float notePresence = clamp(noteCaustic * 0.16 + length(noteBend) * 1.8 + abs(notePhase) * 0.08, 0.0, 1.0);
    vec3 emission = activeWaveColor * (field.x * (0.74 + uPressure * 0.64) + field.y * (0.84 + uVelocity * 1.02 + (1.0 - uSilence) * 0.34)) * (1.0 + notePresence * 0.72);
    emission += mix(vec3(0.27, 0.74, 0.79), vec3(0.95, 0.55, 0.2), uDispersion * 0.5) * field.z * uDispersion;
    float density = field.x * 0.12 + field.y * 0.11;
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

function vectors2(length: number): Vector2[] {
  return Array.from({ length }, () => new Vector2(1, 0));
}

function numbers(length: number): number[] {
  return Array.from({ length }, () => 0);
}

export class PhaseglassScene {
  readonly backendKind = "three";
  readonly tuning: PhaseglassTuning = { glass: 1.08, caustics: 1, dispersion: 0.58, wavefront: 0.92, cameraDistance: 1 };
  readonly #performance: PhaseglassPerformance;
  readonly #renderer: WebGLRenderer;
  readonly #camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #volumeScene = new Scene();
  readonly #compositeScene = new Scene();
  readonly #volumeMaterial: ShaderMaterial;
  readonly #compositeMaterial: ShaderMaterial;
  readonly #target: WebGLRenderTarget;
  readonly #diagnosticHandler: PhaseglassDiagnosticHandler | undefined;
  readonly #canvas: HTMLCanvasElement;
  #diagnosticProbeFrames = 3;
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
  readonly #depth = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #transmission = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #phase = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #sweepPosition = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #sweepStrength = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #contact = numbers(PHASEGLASS_VISIBLE_MEMBRANES);
  readonly #noteTimes = numbers(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #notePitches = numbers(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #noteRegisters = numbers(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #noteChromas = vectors2(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #noteIntervals = numbers(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #noteSpacings = numbers(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #noteVelocities = numbers(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #noteDurations = numbers(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #noteDirections = vectors2(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #notePhases = numbers(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #noteStrengths = numbers(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #notePreviews = numbers(PHASEGLASS_NOTE_WINDOW_COUNT);
  readonly #handleContextLost = (event: Event): void => {
    const diagnostic: PhaseglassContextLostDiagnostic = {
      kind: "context-lost",
      stage: "renderer",
      webglError: this.#renderer.getContext().getError(),
      statusMessage: (event as WebGLContextEvent).statusMessage ?? "",
    };
    console.error("[Phaseglass WebGL context lost]", diagnostic);
    this.#diagnosticHandler?.(diagnostic);
  };

  constructor(canvas: HTMLCanvasElement, performance: PhaseglassPerformance, onDiagnostic?: PhaseglassDiagnosticHandler) {
    this.#performance = performance;
    this.#diagnosticHandler = onDiagnostic;
    this.#canvas = canvas;
    this.#renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
    canvas.addEventListener("webglcontextlost", this.#handleContextLost);
    this.#renderer.debug.checkShaderErrors = true;
    this.#renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
      const fragmentSource = gl.getShaderSource(fragmentShader) ?? "";
      const diagnostic: PhaseglassShaderDiagnostic = {
        kind: "shader",
        stage: fragmentSource.includes("holographicField") ? "volume" : fragmentSource.includes("uVolumeTexture") ? "composite" : "unknown",
        webglError: gl.getError(),
        linkStatus: Boolean(gl.getProgramParameter(program, gl.LINK_STATUS)),
        validateStatus: Boolean(gl.getProgramParameter(program, gl.VALIDATE_STATUS)),
        programLog: (gl.getProgramInfoLog(program) ?? "").trim(),
        vertexLog: (gl.getShaderInfoLog(vertexShader) ?? "").trim(),
        fragmentLog: (gl.getShaderInfoLog(fragmentShader) ?? "").trim(),
        vertexSource: gl.getShaderSource(vertexShader) ?? "",
        fragmentSource,
      };
      console.error("[Phaseglass WebGL shader failure]", diagnostic);
      this.#diagnosticHandler?.(diagnostic);
    };
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
        uMembranePitch: { value: this.#pitch }, uMembraneVelocity: { value: this.#velocity }, uMembraneDepth: { value: this.#depth }, uMembraneTransmission: { value: this.#transmission }, uMembranePhase: { value: this.#phase },
        uMembraneSweepPosition: { value: this.#sweepPosition }, uMembraneSweepStrength: { value: this.#sweepStrength }, uMembraneContact: { value: this.#contact },
        uNoteCount: { value: 0 }, uNoteTime: { value: this.#noteTimes }, uNotePitch: { value: this.#notePitches }, uNoteRegister: { value: this.#noteRegisters },
        uNoteChroma: { value: this.#noteChromas }, uNoteInterval: { value: this.#noteIntervals }, uNoteSpacing: { value: this.#noteSpacings },
        uNoteVelocity: { value: this.#noteVelocities }, uNoteDuration: { value: this.#noteDurations },
        uNoteDirection: { value: this.#noteDirections }, uNotePhase: { value: this.#notePhases }, uNoteStrength: { value: this.#noteStrengths }, uNotePreview: { value: this.#notePreviews },
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

  #updateOpticalStack(time: number, musical: PhaseglassMusicalState): void {
    const disturbances = samplePhaseglassDisturbances(this.#performance.statics.membranes, time);
    let directionX = 0;
    let directionY = 0;
    let directionWeight = 0;
    let preview = 0;
    for (let index = 0; index < PHASEGLASS_NOTE_WINDOW_COUNT; index += 1) {
      const disturbance = disturbances[index];
      if (!disturbance) {
        this.#noteTimes[index] = time + 100;
        this.#notePitches[index] = 0.5;
        this.#noteRegisters[index] = 0.5;
        this.#noteChromas[index]!.set(1, 0);
        this.#noteIntervals[index] = 0;
        this.#noteSpacings[index] = 1;
        this.#noteVelocities[index] = 0;
        this.#noteDurations[index] = 0;
        this.#noteDirections[index]!.set(1, 0);
        this.#notePhases[index] = 0;
        this.#noteStrengths[index] = 0;
        this.#notePreviews[index] = 0;
        continue;
      }
      this.#noteTimes[index] = disturbance.noteTime;
      this.#notePitches[index] = disturbance.pitch;
      this.#noteRegisters[index] = disturbance.register;
      this.#noteChromas[index]!.set(...disturbance.chroma);
      this.#noteIntervals[index] = disturbance.interval;
      this.#noteSpacings[index] = disturbance.spacing;
      this.#noteVelocities[index] = disturbance.velocity;
      this.#noteDurations[index] = disturbance.duration;
      this.#noteDirections[index]!.set(...disturbance.direction);
      this.#notePhases[index] = disturbance.phase;
      this.#noteStrengths[index] = disturbance.strength;
      this.#notePreviews[index] = disturbance.preview;
      const weight = disturbance.strength * (0.25 + disturbance.velocity * 0.75);
      directionX += disturbance.direction[0] * weight;
      directionY += disturbance.direction[1] * weight;
      directionWeight += weight;
      preview = Math.max(preview, disturbance.preview);
    }
    if (directionWeight < 1e-6) {
      const angle = musical.pitch * Math.PI * 1.65;
      directionX = Math.cos(angle);
      directionY = Math.sin(angle);
    }
    const directionLength = Math.max(1e-9, Math.hypot(directionX, directionY));
    directionX /= directionLength;
    directionY /= directionLength;

    for (let slot = 0; slot < PHASEGLASS_VISIBLE_MEMBRANES; slot += 1) {
      const color = new Color().setHSL(0.53 - musical.pitch * 0.34 + slot * 0.025, 0.48 + musical.velocity * 0.18, 0.62 + musical.velocity * 0.1);
      const z = -4.6 + slot * 4.6;
      this.#centers[slot]!.set((slot - 1) * 0.28, (1 - slot) * 0.2, z);
      this.#normals[slot]!.set(0, 0, 1);
      this.#axesU[slot]!.set(1, 0, 0);
      this.#axesV[slot]!.set(0, 1, 0);
      this.#outgoing[slot]!.set(directionX * (0.3 + musical.velocity * 0.34), directionY * (0.3 + musical.velocity * 0.34), 1).normalize();
      this.#colors[slot]!.set(color.r, color.g, color.b);
      this.#radii[slot] = 3.05;
      this.#vacancy[slot] = 0.22 + preview * 0.78;
      this.#fill[slot] = 0.58 + musical.activity * 0.42;
      this.#rim[slot] = 0.08 + musical.pulse * 0.72;
      this.#pitch[slot] = musical.pitch;
      this.#velocity[slot] = musical.velocity;
      this.#depth[slot] = 0.48 + musical.pressure * 0.46;
      this.#transmission[slot] = 0.94 - musical.velocity * 0.1;
      this.#phase[slot] = slot * 1.61803398875;
      this.#sweepPosition[slot] = -0.95;
      this.#sweepStrength[slot] = 0;
      this.#contact[slot] = musical.pulse;
    }
    this.#volumeMaterial.uniforms.uMembraneCount!.value = PHASEGLASS_LAYER_COUNT;
    this.#volumeMaterial.uniforms.uNoteCount!.value = disturbances.length;
  }

  #probeVolumeFrame(time: number, cameraFrame: PhaseglassCameraFrame, musical: PhaseglassMusicalState, energy: number): void {
    if (this.#diagnosticProbeFrames <= 0) return;
    const samplePoints = [
      [0.5, 0.5],
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ] as const;
    const samples: number[] = [];
    const pixel = new Uint8Array(4);
    for (const [relativeX, relativeY] of samplePoints) {
      this.#renderer.readRenderTargetPixels(
        this.#target,
        Math.min(this.#target.width - 1, Math.floor(this.#target.width * relativeX)),
        Math.min(this.#target.height - 1, Math.floor(this.#target.height * relativeY)),
        1,
        1,
        pixel,
      );
      samples.push(...pixel);
    }
    if (samples.some((value, index) => index % 4 !== 3 && value > 2)) {
      this.#diagnosticProbeFrames = 0;
      return;
    }
    this.#diagnosticProbeFrames -= 1;
    if (this.#diagnosticProbeFrames > 0) return;
    const diagnostic: PhaseglassBlackFrameDiagnostic = {
      kind: "black-frame",
      stage: "volume",
      webglError: this.#renderer.getContext().getError(),
      time,
      samples,
      cameraPosition: [...cameraFrame.position],
      cameraTarget: [...cameraFrame.target],
      musical,
      energy,
      noteCount: Number(this.#volumeMaterial.uniforms.uNoteCount!.value),
    };
    console.error("[Phaseglass black volume frame]", diagnostic);
    this.#diagnosticHandler?.(diagnostic);
  }

  renderFrame(time: number): void {
    const cameraFrame = samplePhaseglassCameraFrame(this.tuning.cameraDistance);
    const cameraPosition = new Vector3(...cameraFrame.position);
    const cameraTarget = new Vector3(...cameraFrame.target);
    const musical = samplePhaseglassMusicalState(this.#performance.statics.membranes, time);
    const energy = energyAt(this.#performance, time);
    this.#updateOpticalStack(time, musical);
    const uniforms = this.#volumeMaterial.uniforms;
    uniforms.uTime!.value = time; uniforms.uEnergy!.value = energy; uniforms.uPitch!.value = musical.pitch; uniforms.uVelocity!.value = musical.velocity;
    uniforms.uPulse!.value = musical.pulse; uniforms.uActivity!.value = musical.activity; uniforms.uPressure!.value = musical.pressure; uniforms.uSilence!.value = musical.silence;
    uniforms.uGlass!.value = this.tuning.glass; uniforms.uCaustics!.value = this.tuning.caustics; uniforms.uDispersion!.value = this.tuning.dispersion; uniforms.uWavefront!.value = this.tuning.wavefront;
    (uniforms.uCameraPosition!.value as Vector3).copy(cameraPosition); (uniforms.uCameraTarget!.value as Vector3).copy(cameraTarget);
    this.#compositeMaterial.uniforms.uTime!.value = time;
    this.#compositeMaterial.uniforms.uPulse!.value = musical.pulse;
    this.#compositeMaterial.uniforms.uDispersion!.value = this.tuning.dispersion;
    this.#renderer.setRenderTarget(this.#target);
    this.#renderer.render(this.#volumeScene, this.#camera);
    this.#probeVolumeFrame(time, cameraFrame, musical, energy);
    this.#renderer.setRenderTarget(null);
    this.#renderer.render(this.#compositeScene, this.#camera);
  }

  destroy(): void {
    this.#canvas.removeEventListener("webglcontextlost", this.#handleContextLost);
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
