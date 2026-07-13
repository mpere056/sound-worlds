import { sampleAuroraParticle, type AuroraPerformance } from "@reaper-viz/compiler-aurora";
import {
  Color,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";

export type { AuroraPerformance } from "@reaper-viz/compiler-aurora";

export interface AuroraTuning {
  aurora: number;
  fieldMotion: number;
  particlePlasma: number;
  coilGlow: number;
  trail: number;
  cameraDistance: number;
}

export const AURORA_PARTICLE_SHADER_DISPLACEMENT = 0.01;
export const AURORA_COIL_SHADER_DISPLACEMENT = 0.008;
export const AURORA_RAYMARCH_SCALE = 0.5;

const MAX_COILS = 7;
const MAX_TRAIL = 8;

const FULLSCREEN_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const RAYMARCH_FRAGMENT = `
precision highp float;
varying vec2 vUv;

#define MAX_COILS ${MAX_COILS}
#define MAX_TRAIL ${MAX_TRAIL}
#define MARCH_STEPS 58

uniform vec2 uResolution;
uniform float uTime;
uniform float uEnergy;
uniform float uFieldMotion;
uniform float uAurora;
uniform float uParticlePlasma;
uniform float uCoilGlow;
uniform float uTrailStrength;
uniform vec3 uCameraPosition;
uniform vec3 uCameraTarget;
uniform vec3 uParticlePosition;
uniform float uParticleRadius;
uniform int uCoilCount;
uniform vec3 uCoilCenter[MAX_COILS];
uniform vec3 uCoilAxis[MAX_COILS];
uniform vec3 uCoilColor[MAX_COILS];
uniform float uCoilRadius[MAX_COILS];
uniform float uCoilTube[MAX_COILS];
uniform float uCoilPresence[MAX_COILS];
uniform float uCoilPulse[MAX_COILS];
uniform float uCoilPhase[MAX_COILS];
uniform vec3 uTrailPosition[MAX_TRAIL];
uniform float uTrailOpacity[MAX_TRAIL];

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

mat2 rotate2d(float angle) {
  float c = cos(angle), s = sin(angle);
  return mat2(c, -s, s, c);
}

vec3 galaxyField(vec3 ray) {
  float time = uTime * uFieldMotion;
  vec3 direction = normalize(ray);
  float azimuth = atan(direction.y, direction.x);
  float radial = length(direction.xy);
  vec3 folded = vec3(azimuth * 1.4 - time * 0.055, log(max(0.025, radial)) * 1.8 + time * 0.08, direction.z * 2.2);
  float accumulation = 0.0;
  float scale = 1.0;
  for (int octave = 0; octave < 5; octave++) {
    folded = abs(folded) / max(0.16, dot(folded, folded)) - vec3(0.72, 0.64, 0.58);
    folded.xy *= rotate2d(0.37 + time * 0.018);
    accumulation += exp(-abs(length(folded) - 1.08) * 5.5) / scale;
    scale *= 1.65;
  }
  float curtain = pow(0.5 + 0.5 * sin(azimuth * 5.0 + folded.z * 3.0 - time * 0.22), 8.0);
  float tunnel = accumulation * (0.17 + curtain * 0.2) * uAurora;
  vec3 cold = vec3(0.015, 0.08, 0.12);
  vec3 green = vec3(0.035, 0.55, 0.38);
  vec3 cyan = vec3(0.08, 0.38, 0.62);
  vec3 color = mix(green, cyan, 0.5 + 0.5 * sin(azimuth + time * 0.08)) * tunnel;
  color += cold * (0.22 + accumulation * 0.08);
  vec2 starCell = floor((direction.xy / max(0.08, abs(direction.z)) + 4.0) * 145.0);
  float seed = hash21(starCell);
  float star = step(0.996, seed) * (0.52 + 0.48 * sin(time * (0.5 + seed) + seed * 31.0));
  return color + star * vec3(0.42, 0.68, 0.82);
}

float particleDistance(vec3 point) {
  vec3 local = point - uParticlePosition;
  vec3 unit = normalize(local + vec3(0.0001));
  float turbulence = sin(unit.x * 13.0 + uTime * 2.7) * sin(unit.y * 17.0 - uTime * 2.1) * sin(unit.z * 11.0 + uTime * 1.6);
  return length(local) - uParticleRadius - turbulence * ${AURORA_PARTICLE_SHADER_DISPLACEMENT.toFixed(3)} * (0.35 + uEnergy * 0.65);
}

float coilDistance(vec3 point, int index, out float angle) {
  vec3 axis = normalize(uCoilAxis[index]);
  vec3 reference = abs(axis.y) < 0.86 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 first = normalize(cross(axis, reference));
  vec3 second = normalize(cross(axis, first));
  vec3 local = point - uCoilCenter[index];
  float axial = dot(local, axis);
  vec3 radialVector = local - axis * axial;
  float radial = length(radialVector);
  angle = atan(dot(radialVector, second), dot(radialVector, first));
  float wave = sin(angle * 6.0 - uTime * uFieldMotion * 2.35 + uCoilPhase[index]) * sin(axial * 24.0 + uTime * 1.15);
  float tube = uCoilTube[index] + wave * ${AURORA_COIL_SHADER_DISPLACEMENT.toFixed(3)} * (0.28 + uCoilPulse[index] * 0.72);
  return length(vec2(radial - uCoilRadius[index], axial)) - tube;
}

float sceneDistance(vec3 point, out vec3 materialColor, out float emission, out float materialKind) {
  float minimum = particleDistance(point);
  materialColor = mix(vec3(0.32, 1.0, 0.78), vec3(0.28, 0.62, 1.0), 0.5 + 0.5 * sin(uTime * 0.23));
  emission = 1.1 * uParticlePlasma;
  materialKind = 0.0;

  for (int index = 0; index < MAX_COILS; index++) {
    if (index >= uCoilCount) break;
    float angle = 0.0;
    float distance = coilDistance(point, index, angle);
    if (distance < minimum) {
      float packet = pow(0.5 + 0.5 * sin(angle * 2.0 - uTime * uFieldMotion * 2.15 + uCoilPhase[index]), 14.0);
      float filament = pow(0.5 + 0.5 * sin(angle * 8.0 + uTime * 1.37 + uCoilPhase[index]), 9.0);
      minimum = distance;
      materialColor = uCoilColor[index];
      emission = uCoilGlow * uCoilPresence[index] * (0.14 + packet * 1.2 + filament * 0.28 + uCoilPulse[index] * 1.8);
      materialKind = 1.0;
    }
  }

  for (int index = 0; index < MAX_TRAIL; index++) {
    float radius = uParticleRadius * (0.62 - float(index) * 0.045);
    float distance = length(point - uTrailPosition[index]) - radius;
    if (distance < minimum && uTrailOpacity[index] > 0.001) {
      minimum = distance;
      materialColor = mix(vec3(0.04, 0.52, 0.39), vec3(0.18, 0.56, 0.9), float(index) / float(MAX_TRAIL));
      emission = uTrailOpacity[index] * 0.9;
      materialKind = 2.0;
    }
  }
  return minimum;
}

vec3 sceneNormal(vec3 point) {
  vec3 ignoredColor;
  float ignoredEmission;
  float ignoredKind;
  float epsilon = 0.003;
  vec2 offset = vec2(epsilon, 0.0);
  float dx = sceneDistance(point + offset.xyy, ignoredColor, ignoredEmission, ignoredKind) - sceneDistance(point - offset.xyy, ignoredColor, ignoredEmission, ignoredKind);
  float dy = sceneDistance(point + offset.yxy, ignoredColor, ignoredEmission, ignoredKind) - sceneDistance(point - offset.yxy, ignoredColor, ignoredEmission, ignoredKind);
  float dz = sceneDistance(point + offset.yyx, ignoredColor, ignoredEmission, ignoredKind) - sceneDistance(point - offset.yyx, ignoredColor, ignoredEmission, ignoredKind);
  return normalize(vec3(dx, dy, dz));
}

void main() {
  vec2 pixel = gl_FragCoord.xy / uResolution;
  vec2 uv = pixel * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;
  vec3 forward = normalize(uCameraTarget - uCameraPosition);
  vec3 referenceUp = abs(forward.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 right = normalize(cross(forward, referenceUp));
  vec3 up = normalize(cross(right, forward));
  vec3 rayDirection = normalize(forward + right * uv.x * 0.52 + up * uv.y * 0.52);
  vec3 color = galaxyField(rayDirection);
  vec3 glow = vec3(0.0);
  float depth = 0.0;
  float hitKind = -1.0;
  vec3 hitColor = vec3(0.0);
  float hitEmission = 0.0;
  vec3 hitPoint = vec3(0.0);

  for (int step = 0; step < MARCH_STEPS; step++) {
    vec3 point = uCameraPosition + rayDirection * depth;
    vec3 sampleColor;
    float sampleEmission;
    float sampleKind;
    float distance = sceneDistance(point, sampleColor, sampleEmission, sampleKind);
    float glowBand = exp(-abs(distance) * (sampleKind < 0.5 ? 18.0 : 11.0));
    glow += sampleColor * sampleEmission * glowBand * 0.018;
    if (distance < 0.0025) {
      hitKind = sampleKind;
      hitColor = sampleColor;
      hitEmission = sampleEmission;
      hitPoint = point;
      break;
    }
    depth += clamp(distance * 0.68, 0.012, 0.72);
    if (depth > 48.0) break;
  }

  if (hitKind >= 0.0) {
    vec3 normal = sceneNormal(hitPoint);
    float fresnel = pow(1.0 - max(0.0, dot(normal, -rayDirection)), hitKind < 0.5 ? 2.0 : 3.2);
    vec3 lightDirection = normalize(vec3(-0.4, 0.75, 0.55));
    float diffuse = 0.22 + 0.78 * max(0.0, dot(normal, lightDirection));
    if (hitKind < 0.5) {
      vec3 local = normalize(hitPoint - uParticlePosition);
      float filament = pow(0.5 + 0.5 * sin(atan(local.z, local.x) * 8.0 + local.y * 12.0 - uTime * 3.0), 7.0);
      color = vec3(0.58, 0.96, 0.92) * diffuse + hitColor * (fresnel * 1.9 + filament * 0.75 + hitEmission * 0.2);
    } else if (hitKind < 1.5) {
      vec3 darkMetal = vec3(0.025, 0.055, 0.065) * diffuse;
      color = darkMetal + hitColor * (0.09 + hitEmission + fresnel * 0.72);
    } else {
      color = hitColor * (0.22 + fresnel * 0.85 + hitEmission);
    }
  }

  color += glow;
  color *= 1.0 - 0.17 * length(uv);
  color = color / (1.0 + color * 0.62);
  color = pow(max(color, 0.0), vec3(0.86));
  gl_FragColor = vec4(color, 1.0);
}`;

const COMPOSITE_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uFieldTexture;
uniform vec2 uResolution;
uniform float uTime;
float hash21(vec2 p) { return fract(sin(dot(p, vec2(41.7, 289.1))) * 43758.5453); }
void main() {
  vec2 texel = 1.0 / uResolution;
  vec3 center = texture2D(uFieldTexture, vUv).rgb;
  vec3 north = texture2D(uFieldTexture, vUv + vec2(0.0, texel.y)).rgb;
  vec3 east = texture2D(uFieldTexture, vUv + vec2(texel.x, 0.0)).rgb;
  vec3 color = center * 0.82 + (north + east) * 0.09;
  float grain = hash21(gl_FragCoord.xy + uTime * 17.0) - 0.5;
  color += grain * 0.012;
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

function fixedVectors(length: number): Vector3[] {
  return Array.from({ length }, () => new Vector3());
}

function fixedNumbers(length: number): number[] {
  return Array.from({ length }, () => 0);
}

export class AuroraScene {
  readonly backendKind = "three";
  readonly tuning: AuroraTuning = { aurora: 0.9, fieldMotion: 1, particlePlasma: 1, coilGlow: 0.86, trail: 0.72, cameraDistance: 1 };
  readonly #performance: AuroraPerformance;
  readonly #renderer: WebGLRenderer;
  readonly #camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #fieldScene = new Scene();
  readonly #compositeScene = new Scene();
  readonly #fieldMaterial: ShaderMaterial;
  readonly #compositeMaterial: ShaderMaterial;
  readonly #fieldTarget: WebGLRenderTarget;
  readonly #coilCenters = fixedVectors(MAX_COILS);
  readonly #coilAxes = fixedVectors(MAX_COILS);
  readonly #coilColors = fixedVectors(MAX_COILS);
  readonly #coilRadii = fixedNumbers(MAX_COILS);
  readonly #coilTubes = fixedNumbers(MAX_COILS);
  readonly #coilPresence = fixedNumbers(MAX_COILS);
  readonly #coilPulse = fixedNumbers(MAX_COILS);
  readonly #coilPhase = fixedNumbers(MAX_COILS);
  readonly #trailPositions = fixedVectors(MAX_TRAIL);
  readonly #trailOpacity = fixedNumbers(MAX_TRAIL);

  constructor(canvas: HTMLCanvasElement, performance: AuroraPerformance) {
    this.#performance = performance;
    this.#renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.setPixelRatio(1);
    this.#renderer.outputColorSpace = SRGBColorSpace;
    const fieldWidth = Math.round(performance.resolution.w * AURORA_RAYMARCH_SCALE);
    const fieldHeight = Math.round(performance.resolution.h * AURORA_RAYMARCH_SCALE);
    this.#fieldTarget = new WebGLRenderTarget(fieldWidth, fieldHeight, { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });

    this.#fieldMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: RAYMARCH_FRAGMENT,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uResolution: { value: new Vector2(fieldWidth, fieldHeight) },
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uFieldMotion: { value: this.tuning.fieldMotion },
        uAurora: { value: this.tuning.aurora },
        uParticlePlasma: { value: this.tuning.particlePlasma },
        uCoilGlow: { value: this.tuning.coilGlow },
        uTrailStrength: { value: this.tuning.trail },
        uCameraPosition: { value: new Vector3() },
        uCameraTarget: { value: new Vector3() },
        uParticlePosition: { value: new Vector3() },
        uParticleRadius: { value: performance.statics.particleRadius },
        uCoilCount: { value: 0 },
        uCoilCenter: { value: this.#coilCenters },
        uCoilAxis: { value: this.#coilAxes },
        uCoilColor: { value: this.#coilColors },
        uCoilRadius: { value: this.#coilRadii },
        uCoilTube: { value: this.#coilTubes },
        uCoilPresence: { value: this.#coilPresence },
        uCoilPulse: { value: this.#coilPulse },
        uCoilPhase: { value: this.#coilPhase },
        uTrailPosition: { value: this.#trailPositions },
        uTrailOpacity: { value: this.#trailOpacity },
      },
    });
    this.#fieldScene.add(new Mesh(new PlaneGeometry(2, 2), this.#fieldMaterial));

    this.#compositeMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uFieldTexture: { value: this.#fieldTarget.texture },
        uResolution: { value: new Vector2(fieldWidth, fieldHeight) },
        uTime: { value: 0 },
      },
    });
    this.#compositeScene.add(new Mesh(new PlaneGeometry(2, 2), this.#compositeMaterial));
  }

  #updateCoils(time: number): void {
    const coils = this.#performance.statics.coils;
    const nextIndex = coils.findIndex((coil) => coil.t >= time - 1e-6);
    const anchor = nextIndex < 0 ? coils.length - 1 : nextIndex;
    const start = Math.max(0, Math.min(coils.length - MAX_COILS, anchor - 2));
    const count = Math.min(MAX_COILS, coils.length - start);
    for (let slot = 0; slot < MAX_COILS; slot += 1) {
      const coilIndex = start + slot;
      const coil = coilIndex < coils.length ? coils[coilIndex] : undefined;
      if (!coil || slot >= count) {
        this.#coilCenters[slot]!.set(0, 0, 200);
        this.#coilAxes[slot]!.set(0, 1, 0);
        this.#coilColors[slot]!.set(0, 0, 0);
        this.#coilRadii[slot] = 0;
        this.#coilTubes[slot] = 0;
        this.#coilPresence[slot] = 0;
        this.#coilPulse[slot] = 0;
        this.#coilPhase[slot] = 0;
        continue;
      }
      const relative = coilIndex - anchor;
      const presence = relative < -1 ? 0.2 : relative <= 4 ? 1 - Math.max(0, relative) * 0.12 : 0.16;
      const pulse = Math.exp(-Math.abs(time - coil.t) * 10);
      this.#coilCenters[slot]!.set(...coil.center);
      this.#coilAxes[slot]!.set(...coil.axis).normalize();
      const color = new Color(coil.color);
      this.#coilColors[slot]!.set(color.r, color.g, color.b);
      this.#coilRadii[slot] = coil.radius;
      this.#coilTubes[slot] = coil.tubeRadius;
      this.#coilPresence[slot] = Math.min(1, presence + pulse * 0.35);
      this.#coilPulse[slot] = pulse;
      this.#coilPhase[slot] = coilIndex * 1.61803398875 + coil.pitch * 0.071;
    }
    this.#fieldMaterial.uniforms.uCoilCount!.value = count;
  }

  renderFrame(time: number): void {
    const energy = energyAt(this.#performance, time);
    const state = sampleAuroraParticle(this.#performance.statics.route, time);
    const position = new Vector3(...state.position);
    const direction = new Vector3(...state.velocity).normalize();
    const cameraOffset = new Vector3(5.2, 3.4, 7.6).multiplyScalar(this.tuning.cameraDistance).addScaledVector(direction, -2.5 * this.tuning.cameraDistance);
    const cameraPosition = position.clone().add(cameraOffset);
    const cameraTarget = position.clone().addScaledVector(direction, 0.75);
    this.#updateCoils(time);
    for (let index = 0; index < MAX_TRAIL; index += 1) {
      const sample = sampleAuroraParticle(this.#performance.statics.route, Math.max(0, time - (index + 1) * 0.045));
      this.#trailPositions[index]!.set(...sample.position);
      this.#trailOpacity[index] = this.tuning.trail * (1 - index / MAX_TRAIL);
    }

    const uniforms = this.#fieldMaterial.uniforms;
    uniforms.uTime!.value = time;
    uniforms.uEnergy!.value = energy;
    uniforms.uFieldMotion!.value = this.tuning.fieldMotion;
    uniforms.uAurora!.value = this.tuning.aurora;
    uniforms.uParticlePlasma!.value = this.tuning.particlePlasma;
    uniforms.uCoilGlow!.value = this.tuning.coilGlow;
    uniforms.uTrailStrength!.value = this.tuning.trail;
    (uniforms.uCameraPosition!.value as Vector3).copy(cameraPosition);
    (uniforms.uCameraTarget!.value as Vector3).copy(cameraTarget);
    (uniforms.uParticlePosition!.value as Vector3).copy(position);
    this.#compositeMaterial.uniforms.uTime!.value = time;

    this.#renderer.setRenderTarget(this.#fieldTarget);
    this.#renderer.render(this.#fieldScene, this.#camera);
    this.#renderer.setRenderTarget(null);
    this.#renderer.render(this.#compositeScene, this.#camera);
  }

  destroy(): void {
    for (const scene of [this.#fieldScene, this.#compositeScene]) {
      scene.traverse((object) => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
    }
    this.#fieldTarget.dispose();
    this.#renderer.dispose();
  }
}
