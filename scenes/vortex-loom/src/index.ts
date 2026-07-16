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
  LineSegments,
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
uniform float uVortexContact[VORTEX_COUNT];
uniform vec2 uNextCenter;
uniform vec2 uNextDirection;
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
  float contact = 0.0;

  for (int index = 0; index < VORTEX_COUNT; index++) {
    if (index >= uVortexCount) break;
    vec2 local = p - uVortexCenter[index];
    float radius2 = dot(local, local) + uVortexCore[index] * uVortexCore[index];
    float influence = uVortexStrength[index] * exp(-radius2 * 1.55);
    displacement += vec2(-local.y, local.x) / radius2 * influence * 0.018 * uFlow;
    float directionalGrain = valueNoise(local * vec2(7.0, 11.0) + vec2(float(index) * 2.7, uTime * 0.045));
    float body = exp(-radius2 * (2.4 + directionalGrain * 3.5)) * influence;
    pigment += uVortexColor[index] * body * (0.18 + directionalGrain * 0.3);
    contact += exp(-radius2 / max(0.008, uVortexCore[index] * 7.0)) * uVortexContact[index];
  }

  vec2 transported = p + displacement;
  float slowNoise = valueNoise(transported * 2.8 + vec2(uTime * 0.018, -uTime * 0.012));
  float fineNoise = valueNoise(transported * 9.0 - vec2(uTime * 0.028, uTime * 0.016));
  float warp = pow(0.5 + 0.5 * cos((transported.x + slowNoise * 0.025) * 78.0), 18.0);
  float weft = pow(0.5 + 0.5 * cos((transported.y + fineNoise * 0.012) * 46.0), 24.0) * 0.18;

  vec2 future = p - uNextCenter;
  vec2 futureNormal = vec2(-uNextDirection.y, uNextDirection.x);
  float across = dot(future, futureNormal);
  float along = dot(future, uNextDirection);
  float corridorWindow = exp(-along * along * 1.7);
  float corridor = exp(-across * across * 180.0) * corridorWindow * uNextPreview * uAnticipation;
  float partedEdge = exp(-pow(abs(across) - 0.085, 2.0) * 340.0) * corridorWindow * uNextPreview * uAnticipation;

  vec3 base = mix(vec3(0.011, 0.022, 0.023), vec3(0.022, 0.044, 0.043), 0.28 + slowNoise * 0.42 + uEnergy * 0.14);
  base += vec3(0.20, 0.34, 0.33) * (warp + weft) * (0.045 + uPressure * 0.025) * (1.0 - corridor * 0.82);
  base += vec3(0.22, 0.38, 0.36) * partedEdge * 0.17;
  base += pigment * uPigment * (0.5 + uPressure * 0.35);
  base += vec3(0.58, 0.82, 0.76) * contact * uContactLight * (0.18 + uPulse * 0.32);
  base *= 1.0 - corridor * 0.24;

  float vignette = smoothstep(1.3, 0.2, length((vUv - 0.5) * vec2(0.86, 1.0)));
  base *= 0.52 + vignette * 0.48;
  base += vec3(0.018, 0.026, 0.024) * uSilence * (0.3 + fineNoise * 0.2);
  gl_FragColor = vec4(base, 1.0);
}`;

const FIBER_VERTEX = `
attribute float aFiber;
varying float vFiber;
void main() {
  vFiber = aFiber;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FIBER_FRAGMENT = `
precision highp float;
varying float vFiber;
uniform float uOpacity;
uniform float uPulse;
void main() {
  vec3 cool = vec3(0.45, 0.68, 0.66);
  vec3 bone = vec3(0.82, 0.84, 0.76);
  vec3 color = mix(cool, bone, 0.18 + vFiber * 0.34 + uPulse * 0.16);
  gl_FragColor = vec4(color, uOpacity * (0.44 + vFiber * 0.34));
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
void main() {
  vec2 p = (vUv - 0.5) * vec2(2.0, 2.0);
  float taper = smoothstep(1.0, 0.16, abs(p.x));
  float strandA = exp(-abs(p.y - sin(p.x * 8.0) * 0.12) * 18.0) * taper;
  float strandB = exp(-abs(p.y + sin(p.x * 7.0 + 1.4) * 0.11) * 20.0) * taper;
  float knot = exp(-dot(p * vec2(1.35, 2.6), p * vec2(1.35, 2.6)) * 2.4);
  float alpha = clamp(strandA + strandB + knot * (0.72 + uPulse * 0.5), 0.0, 1.0);
  vec3 color = mix(vec3(0.55, 0.86, 0.82), vec3(1.0, 0.91, 0.72), knot + uPulse * 0.25);
  color *= 0.78 + uPressure * 0.22 + uPulse * 0.42;
  gl_FragColor = vec4(color, alpha);
}`;

function makeFiberGeometry(performance: VortexLoomPerformance): BufferGeometry {
  const { fiberCount, pointsPerFiber } = performance.statics.fibers;
  const segmentCount = fiberCount * Math.max(0, pointsPerFiber - 1);
  const positions = new Float32Array(segmentCount * 2 * 3);
  const fibers = new Float32Array(segmentCount * 2);
  let vertex = 0;
  for (let fiber = 0; fiber < fiberCount; fiber += 1) {
    const fiberValue = fiberCount > 1 ? fiber / (fiberCount - 1) : 0.5;
    for (let point = 0; point < pointsPerFiber - 1; point += 1) {
      fibers[vertex] = fiberValue;
      fibers[vertex + 1] = fiberValue;
      vertex += 2;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aFiber", new BufferAttribute(fibers, 1));
  return geometry;
}

function visibleVortices(vortices: readonly VortexLoomVortex[], time: number): VortexLoomVortex[] {
  return vortices
    .map((vortex, index) => ({ vortex, index, distance: Math.abs(vortex.t - time) }))
    .filter(({ vortex }) => vortex.activationEnd >= time - 1.2 && vortex.activationStart <= time + 3)
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
  readonly #shuttleMaterial: ShaderMaterial;
  readonly #shuttle: Mesh;
  readonly #vortexCenters = Array.from({ length: MAX_VISIBLE_VORTICES }, () => new Vector2());
  readonly #vortexColors = Array.from({ length: MAX_VISIBLE_VORTICES }, () => new Vector3());
  readonly #vortexCores = new Float32Array(MAX_VISIBLE_VORTICES);
  readonly #vortexStrengths = new Float32Array(MAX_VISIBLE_VORTICES);
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
        uVortexCore: { value: this.#vortexCores }, uVortexStrength: { value: this.#vortexStrengths }, uVortexContact: { value: this.#vortexContacts },
        uNextCenter: { value: new Vector2(0, 0) }, uNextDirection: { value: new Vector2(0, -1) }, uNextPreview: { value: 0 },
      },
    });
    const background = new Mesh(new PlaneGeometry(2.06, 3.5), this.#fieldMaterial);
    background.position.z = -1;
    this.#scene.add(background);

    this.#fiberGeometry = makeFiberGeometry(performance);
    this.#fiberMaterial = new ShaderMaterial({
      vertexShader: FIBER_VERTEX,
      fragmentShader: FIBER_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: { uOpacity: { value: this.tuning.fibers }, uPulse: { value: 0 } },
    });
    const fibers = new LineSegments(this.#fiberGeometry, this.#fiberMaterial);
    fibers.position.z = 0;
    this.#scene.add(fibers);

    this.#shuttleMaterial = new ShaderMaterial({
      vertexShader: SHUTTLE_VERTEX,
      fragmentShader: SHUTTLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uPulse: { value: 0 }, uPressure: { value: 0 } },
    });
    this.#shuttle = new Mesh(new PlaneGeometry(0.19, 0.095), this.#shuttleMaterial);
    this.#shuttle.position.z = 0.4;
    this.#scene.add(this.#shuttle);
  }

  #updateFibers(time: number): void {
    const transported = sampleVortexLoomFiberPositions(this.#performance, time);
    const positions = this.#fiberGeometry.getAttribute("position") as BufferAttribute;
    const array = positions.array as Float32Array;
    const { fiberCount, pointsPerFiber } = this.#performance.statics.fibers;
    let output = 0;
    for (let fiber = 0; fiber < fiberCount; fiber += 1) {
      const stratum = (fiber % 5 - 2) * 0.012;
      for (let point = 0; point < pointsPerFiber - 1; point += 1) {
        const first = (fiber * pointsPerFiber + point) * 2;
        const second = first + 2;
        array[output++] = transported[first]!;
        array[output++] = transported[first + 1]!;
        array[output++] = stratum;
        array[output++] = transported[second]!;
        array[output++] = transported[second + 1]!;
        array[output++] = stratum;
      }
    }
    positions.needsUpdate = true;
  }

  #updateField(time: number, visual: VortexLoomVisualState): void {
    const selected = visibleVortices(this.#performance.statics.vortices, time);
    for (let slot = 0; slot < MAX_VISIBLE_VORTICES; slot += 1) {
      const vortex = selected[slot];
      if (!vortex) {
        this.#vortexCenters[slot]!.set(0, 0);
        this.#vortexColors[slot]!.set(0, 0, 0);
        this.#vortexCores[slot] = 0.04;
        this.#vortexStrengths[slot] = 0;
        this.#vortexContacts[slot] = 0;
        continue;
      }
      const color = new Color(vortex.pigment);
      this.#vortexCenters[slot]!.set(vortex.center[0], vortex.center[1]);
      this.#vortexColors[slot]!.set(color.r, color.g, color.b);
      this.#vortexCores[slot] = Math.max(0.025, vortex.coreRadius);
      this.#vortexStrengths[slot] = vortexActivation(vortex, time) * (0.5 + Math.abs(vortex.circulation) * 0.85);
      this.#vortexContacts[slot] = vortexLoomContactStrength(vortex, time);
    }
    const next = this.#performance.statics.vortices[visual.nextIndex];
    const uniforms = this.#fieldMaterial.uniforms;
    uniforms.uVortexCount!.value = selected.length;
    if (next) {
      (uniforms.uNextCenter!.value as Vector2).set(next.center[0], next.center[1]);
      (uniforms.uNextDirection!.value as Vector2).set(-next.entryDirection[0], -next.entryDirection[1]);
      uniforms.uNextPreview!.value = visual.preview;
    } else {
      uniforms.uNextPreview!.value = 0;
    }
  }

  renderFrame(time: number): void {
    const boundedTime = Math.max(0, Math.min(this.#performance.durationSec, time));
    const musical = sampleVortexLoomMusicalState(this.#performance, boundedTime);
    const visual = sampleVortexLoomVisualState(this.#performance, boundedTime);
    const shuttle = sampleVortexLoomShuttle(this.#performance, boundedTime);
    this.#updateFibers(boundedTime);
    this.#updateField(boundedTime, visual);

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
