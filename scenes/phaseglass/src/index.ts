import { samplePhaseglassRay, type PhaseglassMembrane, type PhaseglassPerformance } from "@reaper-viz/compiler-phaseglass";
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

export function samplePhaseglassAnticipation(leadSeconds: number): PhaseglassAnticipationState {
  if (leadSeconds >= 0) {
    const preview = smootherStep((3 - leadSeconds) / 3);
    const arrival = smootherStep((0.62 - leadSeconds) / 0.62);
    return { vacancy: preview * (1 - arrival), fill: preview * arrival, rim: preview * (0.25 + arrival * 0.75) };
  }
  const age = -leadSeconds;
  const afterglow = Math.exp(-((age / 0.82) ** 2));
  return { vacancy: 0, fill: afterglow, rim: afterglow * 0.38 };
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

mat2 rotate2d(float angle) {
  float c = cos(angle), s = sin(angle);
  return mat2(c, -s, s, c);
}

float hash31(vec3 point) {
  return fract(sin(dot(point, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float phaseFold(vec3 point, float time) {
  vec3 fold = point;
  float sum = 0.0;
  float weight = 1.0;
  for (int octave = 0; octave < 5; octave++) {
    fold = abs(fold) / clamp(dot(fold, fold), 0.16, 3.8) - vec3(0.72, 0.64, 0.68);
    fold.xy *= rotate2d(0.31 + float(octave) * 0.13 + time * 0.012);
    fold.yz *= rotate2d(-0.19 + time * 0.009);
    sum += exp(-abs(length(fold) - 1.0) * (5.0 + float(octave) * 1.7)) / weight;
    weight *= 1.65;
  }
  return sum;
}

vec3 opalStrata(vec3 point, vec3 rayDirection, float time) {
  vec3 drifted = point * 0.16 + vec3(0.0, 0.0, time * 0.018);
  float fold = phaseFold(drifted, time * 0.24);
  float depthBands = exp(-abs(sin(dot(point, vec3(0.11, 0.075, 0.052)) + fold * 3.2)) * 16.0);
  float crossBands = exp(-abs(sin(dot(point, vec3(-0.063, 0.13, 0.087)) - fold * 4.1)) * 19.0);
  float cells = pow(0.5 + 0.5 * sin(fold * 8.0 + dot(point, vec3(0.17, -0.12, 0.09))), 7.0);
  float reference = (depthBands * 0.72 + crossBands * 0.5 + depthBands * crossBands) * (0.32 + cells * 0.68);
  float horizon = pow(max(0.0, 1.0 - abs(rayDirection.y + 0.15)), 8.0) * 0.08;
  vec3 cold = vec3(0.035, 0.18, 0.21);
  vec3 warm = vec3(0.23, 0.16, 0.08);
  return mix(cold, warm, pow(cells, 3.0) * 0.44) * (reference * 0.27 + horizon);
}

float signalKnot(vec3 local, float time, out vec3 color) {
  vec3 fold = local * (1.2 + uVelocity * 0.35);
  float lace = 0.0;
  float scale = 1.0;
  for (int iteration = 0; iteration < 5; iteration++) {
    fold = abs(fold) / clamp(dot(fold, fold), 0.11, 4.2) - vec3(0.78, 0.7, 0.74);
    fold.xz *= rotate2d(time * 0.18 + float(iteration) * 0.39);
    lace += exp(-abs(length(fold) - 1.08) * (8.0 + float(iteration) * 1.8)) / scale;
    scale *= 1.48;
  }
  float registerShift = pow(0.5 + 0.5 * sin(fold.x * 0.8 + time * 0.1), 6.0);
  color = mix(vec3(0.55, 0.95, 1.0), vec3(1.0, 0.69, 0.28), clamp(registerShift * 0.38 + uPitch * 0.18, 0.0, 0.58));
  return lace * exp(-length(local) * (1.5 - uActivity * 0.22));
}

void evaluateMembranes(vec3 worldPoint, float time, out float glassDensity, out float causticDensity, out float vacancy, out vec3 tint, inout vec3 warpedPoint) {
  glassDensity = 0.0;
  causticDensity = 0.0;
  vacancy = 0.0;
  tint = vec3(0.0);
  for (int index = 0; index < MEMBRANE_COUNT; index++) {
    if (index >= uMembraneCount) break;
    vec3 local = worldPoint - uMembraneCenter[index];
    float plane = dot(local, uMembraneNormal[index]);
    vec2 disc = vec2(dot(local, uMembraneAxisU[index]), dot(local, uMembraneAxisV[index]));
    float radial = length(disc) / max(0.08, uMembraneRadius[index]);
    float gate = smoothstep(1.08, 0.62, radial);
    float edge = exp(-abs(radial - 0.9) * 15.0);
    float pitchFrequency = mix(5.0, 11.0, uMembranePitch[index]);
    float phase = atan(disc.y, disc.x) * (2.0 + uMembranePitch[index] * 4.0) + radial * pitchFrequency - time * 0.45 + uMembranePhase[index];
    float ripple = sin(phase + sin(disc.x * 3.0 - time * 0.27) * 1.4);
    float sheet = exp(-abs(plane + ripple * 0.035 * gate) * (25.0 + uMembraneVelocity[index] * 18.0)) * gate;
    float lace = exp(-abs(sin(phase * 1.37 + plane * 19.0)) * mix(24.0, 47.0, uMembraneVelocity[index])) * sheet;
    float presence = uMembraneFill[index] * 0.82 + uMembraneRim[index] * 0.35;
    glassDensity += sheet * presence + edge * exp(-abs(plane) * 18.0) * uMembraneRim[index] * 0.42;
    causticDensity += lace * (0.45 + uMembraneVelocity[index] * 0.9) * presence;
    vacancy += exp(-abs(plane) * 4.8) * exp(-radial * radial * 1.6) * uMembraneVacancy[index];
    tint += uMembraneColor[index] * (sheet * presence + lace * 0.72);
    warpedPoint += uMembraneNormal[index] * ripple * sheet * presence * (0.025 + uDispersion * 0.035);
  }
}

float wakeField(vec3 point) {
  float field = 0.0;
  for (int index = 0; index < WAKE_COUNT; index++) {
    vec3 local = point - uWakePosition[index];
    float fold = phaseFold(local * 0.56, uTime * 0.35 + float(index));
    field += exp(-length(local) * 1.25) * (0.26 + fold * 0.34) * uWakeStrength[index];
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
  float depth = 0.15;
  float transmittance = 1.0;
  vec3 color = vec3(0.0025, 0.005, 0.007);
  float projectedVacancy = 0.0;
  float projectedGlass = 0.0;
  for (int step = 0; step < VOLUME_STEPS; step++) {
    vec3 point = uCameraPosition + rayDirection * depth;
    vec3 warpedPoint = point;
    float glassDensity, causticDensity, vacancy;
    vec3 membraneTint;
    evaluateMembranes(point, uTime, glassDensity, causticDensity, vacancy, membraneTint, warpedPoint);
    float wake = wakeField(warpedPoint) * uWake;
    vec3 knotColor;
    float knot = signalKnot(warpedPoint - uSignalPosition, uTime, knotColor);
    float sharedPhase = phaseFold(warpedPoint * 0.17 + uSignalDirection * uTime * 0.025, uTime * 0.18);
    float mist = exp(-abs(sin(sharedPhase * 4.6 + dot(warpedPoint, vec3(0.12, -0.08, 0.1)))) * 9.5) * (0.018 + uActivity * 0.025);
    mist *= 1.0 - clamp(vacancy * 0.62, 0.0, 0.78);
    float density = mist + glassDensity * (0.12 + uGlass * 0.18) + causticDensity * uCaustics * 0.095 + wake * 0.08 + knot * 0.14;
    density *= 0.76 + uEnergy * 0.34 + uPressure * 0.2;
    vec3 baseTint = mix(vec3(0.055, 0.38, 0.4), vec3(0.16, 0.28, 0.61), uPitch);
    vec3 glassTint = glassDensity > 0.001 ? membraneTint / max(0.08, glassDensity + causticDensity * 0.7) : baseTint;
    vec3 emission = baseTint * mist * 0.8;
    emission += glassTint * glassDensity * (0.8 + uGlass * 1.1);
    emission += mix(glassTint, vec3(1.0, 0.76, 0.34), uDispersion * 0.28) * causticDensity * (1.3 + uCaustics * 2.2 + uVelocity * 1.2);
    emission += knotColor * knot * (1.6 + uVelocity * 1.8 + uPulse * 0.8);
    emission += baseTint * wake * (0.45 + uPressure * 0.5);
    float stepLength = 0.21 + depth * 0.006;
    color += transmittance * emission * density * stepLength;
    projectedVacancy += transmittance * vacancy * stepLength * 0.12;
    projectedGlass += transmittance * glassDensity * stepLength;
    transmittance *= exp(-density * stepLength * 0.5);
    depth += stepLength;
    if (transmittance < 0.025 || depth > 29.0) break;
  }
  vec3 referencePoint = uCameraPosition * 0.24 + rayDirection * 18.0;
  vec3 reference = opalStrata(referencePoint, rayDirection, uTime);
  reference *= 1.0 - clamp(projectedVacancy * 0.5, 0.0, 0.68);
  reference *= 0.72 + clamp(projectedGlass * 0.28, 0.0, 0.55);
  color += reference * (0.6 + transmittance * 0.55);
  float vignette = 1.0 - 0.16 * dot(uv, uv);
  color *= vignette;
  color = color / (0.62 + color);
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
      const anticipation = samplePhaseglassAnticipation(membrane.t - time);
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
    const direction = new Vector3(...state.direction).normalize();
    const side = new Vector3(direction.z, 0.15, -direction.x).normalize();
    const cameraPosition = position.clone().addScaledVector(direction, -4.8 * this.tuning.cameraDistance).addScaledVector(side, 2.6 * this.tuning.cameraDistance).add(new Vector3(0, 2.2 * this.tuning.cameraDistance, 0));
    const cameraTarget = position.clone().addScaledVector(direction, 2.2);
    const musical = samplePhaseglassMusicalState(this.#performance.statics.membranes, time);
    this.#updateMembranes(time);
    for (let index = 0; index < WAKE_COUNT; index += 1) {
      const sample = samplePhaseglassRay(this.#performance.statics.route, Math.max(0, time - (index + 1) * 0.085));
      this.#wakePositions[index]!.set(...sample.position);
      this.#wakeStrength[index] = this.tuning.wake * (1 - index / WAKE_COUNT);
    }
    const uniforms = this.#volumeMaterial.uniforms;
    uniforms.uTime!.value = time; uniforms.uEnergy!.value = energyAt(this.#performance, time); uniforms.uPitch!.value = musical.pitch; uniforms.uVelocity!.value = musical.velocity;
    uniforms.uPulse!.value = musical.pulse; uniforms.uActivity!.value = musical.activity; uniforms.uPressure!.value = musical.pressure; uniforms.uSilence!.value = musical.silence;
    uniforms.uGlass!.value = this.tuning.glass; uniforms.uCaustics!.value = this.tuning.caustics; uniforms.uDispersion!.value = this.tuning.dispersion; uniforms.uWake!.value = this.tuning.wake;
    (uniforms.uCameraPosition!.value as Vector3).copy(cameraPosition); (uniforms.uCameraTarget!.value as Vector3).copy(cameraTarget); (uniforms.uSignalPosition!.value as Vector3).copy(position); (uniforms.uSignalDirection!.value as Vector3).copy(direction);
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
