import { sampleSpectralBloomState, SPECTRAL_BLOOM_MODE_COUNT, type SpectralBloomPerformance } from "@reaper-viz/compiler-spectral-bloom";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";

export type { SpectralBloomPerformance } from "@reaper-viz/compiler-spectral-bloom";

export interface SpectralBloomTuning {
  deformation: number;
  particleSize: number;
  luminosity: number;
  depth: number;
  cameraDistance: number;
  motion: number;
}

export interface SpectralBloomTopologyData {
  positions: Float32Array;
  interior: Float32Array;
  seeds: Float32Array;
}

function hash01(index: number, salt: number): number {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export function generateSpectralBloomTopology(surfaceCount: number, interiorCount: number): SpectralBloomTopologyData {
  if (!Number.isInteger(surfaceCount) || surfaceCount < 1 || !Number.isInteger(interiorCount) || interiorCount < 0) throw new RangeError("Spectral Bloom particle counts must be non-negative integers with a visible surface");
  const count = surfaceCount + interiorCount;
  const positions = new Float32Array(count * 3);
  const interior = new Float32Array(count);
  const seeds = new Float32Array(count);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const isInterior = index >= surfaceCount;
    const localIndex = isInterior ? index - surfaceCount : index;
    const localCount = isInterior ? Math.max(1, interiorCount) : surfaceCount;
    const y = 1 - 2 * ((localIndex + 0.5) / localCount);
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = localIndex * goldenAngle + hash01(localIndex, isInterior ? 9 : 3) * 0.035;
    const shellRadius = isInterior
      ? 0.16 + Math.pow(hash01(localIndex, 17), 1 / 3) * 1.17
      : 1.48 + (hash01(localIndex, 5) - 0.5) * 0.018;
    const offset = index * 3;
    positions[offset] = Math.cos(angle) * radiusAtY * shellRadius;
    positions[offset + 1] = y * shellRadius;
    positions[offset + 2] = Math.sin(angle) * radiusAtY * shellRadius;
    interior[index] = isInterior ? 1 : 0;
    seeds[index] = hash01(localIndex, isInterior ? 23 : 29);
  }
  return { positions, interior, seeds };
}

const VERTEX_SHADER = `
precision highp float;
attribute float aInterior;
attribute float aSeed;
uniform float uCoefficients[${SPECTRAL_BLOOM_MODE_COUNT}];
uniform float uDeformation;
uniform float uPointSize;
uniform float uLuminosity;
uniform float uEnergy;
uniform float uFlux;
uniform float uCentroid;
uniform float uSpread;
uniform float uFlatness;
uniform float uTime;
varying float vBrightness;
varying float vInterior;
varying float vSeed;

void main() {
  vec3 n = normalize(position);
  float x = n.x;
  float y = n.y;
  float z = n.z;
  float basis[${SPECTRAL_BLOOM_MODE_COUNT}];
  basis[0] = 1.0;
  basis[1] = 2.0 * x * y;
  basis[2] = 2.0 * y * z;
  basis[3] = 0.5 * (3.0 * z * z - 1.0);
  basis[4] = 2.0 * x * z;
  basis[5] = x * x - y * y;
  basis[6] = y * (3.0 * x * x - y * y);
  basis[7] = 2.0 * x * y * z;
  basis[8] = y * (5.0 * z * z - 1.0);
  basis[9] = 0.5 * z * (5.0 * z * z - 3.0);
  basis[10] = x * (5.0 * z * z - 1.0);
  basis[11] = z * (x * x - y * y);
  basis[12] = x * (x * x - 3.0 * y * y);
  basis[13] = y * z * (7.0 * z * z - 3.0);
  basis[14] = (35.0 * z * z * z * z - 30.0 * z * z + 3.0) * 0.125;
  basis[15] = x * z * (7.0 * z * z - 3.0);

  float radial = 0.0;
  float tangentA = 0.0;
  float tangentB = 0.0;
  float strain = 0.0;
  for (int index = 0; index < ${SPECTRAL_BLOOM_MODE_COUNT}; index += 1) {
    float response = uCoefficients[index] * basis[index];
    strain += abs(response);
    radial += response * 0.32;
    if (index == 0 || index == 3 || index == 6 || index == 9 || index == 12 || index == 15) radial += response * 0.68;
    else if (index == 1 || index == 4 || index == 7 || index == 10 || index == 13) tangentA += response;
    else tangentB += response;
  }

  vec3 reference = abs(n.y) < 0.88 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(reference, n));
  vec3 bitangent = normalize(cross(n, tangent));
  float interiorResponse = mix(1.0, 0.48, aInterior);
  float breathing = uCoefficients[0] * 0.11 + uEnergy * 0.045;
  float radialScale = max(0.28, 1.0 + breathing + radial * 0.72 * uDeformation * interiorResponse);
  float torsionScale = 0.52 * uDeformation * interiorResponse * (0.72 + uSpread * 0.38);
  vec3 displaced = position * radialScale + tangent * tangentA * torsionScale + bitangent * tangentB * torsionScale;
  float circulation = sin(uTime * (0.16 + uCentroid * 0.18) + aSeed * 6.28318) * uFlatness * 0.018 * interiorResponse;
  displaced += (tangent + bitangent * 0.45) * circulation;

  vec4 view = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * view;
  float perspective = 8.5 / max(1.2, -view.z);
  float energySize = 0.9 + uEnergy * 0.34 + uFlux * 0.22;
  gl_PointSize = clamp(uPointSize * perspective * energySize * mix(1.0, 0.78, aInterior), 1.0, 6.2);
  vBrightness = uLuminosity * (0.32 + min(1.0, strain * 0.36) + uEnergy * 0.24 + uFlux * 0.38);
  vInterior = aInterior;
  vSeed = aSeed;
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec3 uSurfaceColor;
uniform vec3 uCoreColor;
uniform float uDepth;
varying float vBrightness;
varying float vInterior;
varying float vSeed;

void main() {
  vec2 centered = gl_PointCoord - 0.5;
  float distanceToCenter = length(centered) * 2.0;
  float disc = 1.0 - smoothstep(0.46, 1.0, distanceToCenter);
  float core = exp(-distanceToCenter * distanceToCenter * 4.8);
  if (disc < 0.005) discard;
  vec3 color = mix(uSurfaceColor, uCoreColor, vInterior * (0.58 + uDepth * 0.28));
  color *= 0.78 + vSeed * 0.22;
  float alpha = disc * mix(0.52, 0.2 + uDepth * 0.15, vInterior) * (0.5 + vBrightness * 0.58);
  gl_FragColor = vec4(color * (0.46 + vBrightness + core * 0.32), alpha);
}`;

export class SpectralBloomScene {
  readonly backendKind = "three" as const;
  readonly tuning: SpectralBloomTuning = {
    deformation: 1.12,
    particleSize: 4.3,
    luminosity: 0.92,
    depth: 0.78,
    cameraDistance: 1,
    motion: 1,
  };

  readonly #performance: SpectralBloomPerformance;
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera: PerspectiveCamera;
  readonly #geometry: BufferGeometry;
  readonly #material: ShaderMaterial;
  readonly #points: Points;
  readonly #coefficientUniforms = new Float32Array(SPECTRAL_BLOOM_MODE_COUNT);

  constructor(canvas: HTMLCanvasElement, performance: SpectralBloomPerformance) {
    this.#performance = performance;
    this.#renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.#renderer.setPixelRatio(1);
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.setClearColor(new Color(performance.palette.bg), 1);
    this.#renderer.outputColorSpace = SRGBColorSpace;

    this.#camera = new PerspectiveCamera(31, performance.resolution.w / performance.resolution.h, 0.05, 30);
    this.#camera.position.set(0, 0, 16.5);
    this.#camera.lookAt(0, 0, 0);

    const topology = generateSpectralBloomTopology(performance.statics.topology.surfaceParticles, performance.statics.topology.interiorParticles);
    this.#geometry = new BufferGeometry();
    this.#geometry.setAttribute("position", new BufferAttribute(topology.positions, 3));
    this.#geometry.setAttribute("aInterior", new BufferAttribute(topology.interior, 1));
    this.#geometry.setAttribute("aSeed", new BufferAttribute(topology.seeds, 1));
    this.#geometry.computeBoundingSphere();

    this.#material = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uCoefficients: { value: this.#coefficientUniforms },
        uDeformation: { value: this.tuning.deformation },
        uPointSize: { value: this.tuning.particleSize },
        uLuminosity: { value: this.tuning.luminosity },
        uDepth: { value: this.tuning.depth },
        uEnergy: { value: 0 },
        uFlux: { value: 0 },
        uCentroid: { value: 0 },
        uSpread: { value: 0 },
        uFlatness: { value: 0 },
        uTime: { value: 0 },
        uSurfaceColor: { value: new Color(performance.palette.roles.surface ?? "#e8edf2") },
        uCoreColor: { value: new Color(performance.palette.roles.core ?? "#9eb9d4") },
      },
    });
    this.#points = new Points(this.#geometry, this.#material);
    this.#points.frustumCulled = false;
    this.#scene.add(this.#points);
  }

  renderFrame(time: number): void {
    const bounded = Math.max(0, Math.min(this.#performance.durationSec, time));
    const state = sampleSpectralBloomState(this.#performance, bounded);
    this.#coefficientUniforms.fill(0);
    this.#coefficientUniforms.set(state.coefficients.slice(0, SPECTRAL_BLOOM_MODE_COUNT));
    const uniforms = this.#material.uniforms;
    uniforms.uDeformation!.value = this.tuning.deformation;
    uniforms.uPointSize!.value = this.tuning.particleSize;
    uniforms.uLuminosity!.value = this.tuning.luminosity;
    uniforms.uDepth!.value = this.tuning.depth;
    uniforms.uEnergy!.value = state.energy;
    uniforms.uFlux!.value = state.flux;
    uniforms.uCentroid!.value = state.centroid;
    uniforms.uSpread!.value = state.spread;
    uniforms.uFlatness!.value = state.flatness;
    uniforms.uTime!.value = bounded;

    const motion = this.tuning.motion;
    const yaw = bounded * 0.055 * motion + Math.sin(bounded * 0.13) * 0.08;
    const pitch = Math.sin(bounded * 0.09) * 0.1 * motion;
    const distance = 16.5 * Math.max(0.72, this.tuning.cameraDistance);
    this.#camera.position.set(Math.sin(yaw) * distance, Math.sin(pitch) * distance * 0.52, Math.cos(yaw) * distance);
    this.#camera.lookAt(new Vector3(0, -0.02, 0));
    this.#points.rotation.z = Math.sin(bounded * 0.07) * 0.08 * motion;
    this.#renderer.render(this.#scene, this.#camera);
  }

  destroy(): void {
    this.#geometry.dispose();
    this.#material.dispose();
    this.#renderer.dispose();
  }
}
