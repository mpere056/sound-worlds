import { sampleSpectralBloomState, type SpectralBloomPerformance } from "@reaper-viz/compiler-spectral-bloom";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  FloatType,
  LinearFilter,
  PerspectiveCamera,
  Points,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";

export type { SpectralBloomPerformance } from "@reaper-viz/compiler-spectral-bloom";

export const SPECTRAL_BLOOM_WAVEFORM_SAMPLES = 128;
export const SPECTRAL_BLOOM_BAND_COUNT = 24;

export interface SpectralBloomTuning {
  waveformDepth: number;
  spectralDepth: number;
  particleSize: number;
  luminosity: number;
  core: number;
  cameraDistance: number;
  orbit: number;
}

export interface SpectralBloomTopologyData {
  positions: Float32Array;
  interior: Float32Array;
  seeds: Float32Array;
}

export interface SpectralBloomDirectDisplacement {
  radialScale: number;
  tangentAmount: number;
}

export function spectralBloomDirectDisplacement(waveform: number, delayedWaveform: number, signedBand: number, bandMagnitude: number, waveformDepth = 1, spectralDepth = 1, interior = 0): SpectralBloomDirectDisplacement {
  const response = 1 - Math.max(0, Math.min(1, interior)) * 0.48;
  return {
    radialScale: Math.max(0.35, 1 + waveform * 0.58 * waveformDepth * response + signedBand * 0.2 * spectralDepth * response),
    tangentAmount: delayedWaveform * (0.1 + bandMagnitude * 0.24) * waveformDepth * response,
  };
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
uniform sampler2D uWaveformTexture;
uniform sampler2D uBandTexture;
uniform float uWaveformDepth;
uniform float uSpectralDepth;
uniform float uPointSize;
uniform float uLuminosity;
uniform float uCore;
varying float vBrightness;
varying float vInterior;
varying float vSeed;

float waveformAt(float position) {
  return texture2D(uWaveformTexture, vec2(fract(position), 0.5)).r;
}

void main() {
  vec3 n = normalize(position);
  float longitude = atan(n.z, n.x) / 6.28318530718 + 0.5;
  float latitude = n.y * 0.5 + 0.5;
  float phaseSkew = (latitude - 0.5) * 0.11;
  float waveform = waveformAt(longitude + phaseSkew);
  float delayedWaveform = waveformAt(longitude + 0.25 - phaseSkew * 0.6);
  vec4 spectral = texture2D(uBandTexture, vec2(latitude, 0.5));
  float bandMagnitude = spectral.r;
  float signedBand = spectral.g;

  vec3 reference = abs(n.y) < 0.88 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(reference, n));
  vec3 bitangent = normalize(cross(n, tangent));
  float interiorResponse = mix(1.0, 0.52, aInterior);
  float radialScale = max(0.35, 1.0
    + waveform * 0.58 * uWaveformDepth * interiorResponse
    + signedBand * 0.2 * uSpectralDepth * interiorResponse);
  float tangentAmount = delayedWaveform * (0.1 + bandMagnitude * 0.24) * uWaveformDepth * interiorResponse;
  float spectralShear = signedBand * bandMagnitude * 0.15 * uSpectralDepth * interiorResponse;
  vec3 displaced = position * radialScale + tangent * tangentAmount + bitangent * spectralShear;

  vec4 view = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * view;
  float perspective = 8.5 / max(1.2, -view.z);
  float measuredActivity = max(abs(waveform), bandMagnitude);
  gl_PointSize = clamp(uPointSize * perspective * (0.92 + measuredActivity * 0.34) * mix(1.0, 0.78, aInterior), 1.0, 6.2);
  vBrightness = uLuminosity * (0.22 + abs(waveform) * 0.58 + bandMagnitude * 0.32 + abs(signedBand) * 0.24);
  vInterior = aInterior;
  vSeed = aSeed;
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec3 uSurfaceColor;
uniform vec3 uCoreColor;
uniform float uCore;
varying float vBrightness;
varying float vInterior;
varying float vSeed;

void main() {
  vec2 centered = gl_PointCoord - 0.5;
  float distanceToCenter = length(centered) * 2.0;
  float disc = 1.0 - smoothstep(0.46, 1.0, distanceToCenter);
  float pointCore = exp(-distanceToCenter * distanceToCenter * 4.8);
  if (disc < 0.005) discard;
  vec3 color = mix(uSurfaceColor, uCoreColor, vInterior * (0.5 + uCore * 0.34));
  color *= 0.78 + vSeed * 0.22;
  float alpha = disc * mix(0.52, 0.2 + uCore * 0.15, vInterior) * (0.5 + vBrightness * 0.58);
  gl_FragColor = vec4(color * (0.46 + vBrightness + pointCore * 0.32), alpha);
}`;

function makeDataTexture(data: Float32Array<ArrayBuffer>, width: number, repeat: boolean): DataTexture {
  const texture = new DataTexture(data, width, 1, RGBAFormat, FloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class SpectralBloomScene {
  readonly backendKind = "three" as const;
  readonly tuning: SpectralBloomTuning = {
    waveformDepth: 1,
    spectralDepth: 0.82,
    particleSize: 4.3,
    luminosity: 0.92,
    core: 0.78,
    cameraDistance: 1,
    orbit: 0.42,
  };

  readonly #performance: SpectralBloomPerformance;
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera: PerspectiveCamera;
  readonly #geometry: BufferGeometry;
  readonly #material: ShaderMaterial;
  readonly #points: Points;
  readonly #waveformData = new Float32Array(SPECTRAL_BLOOM_WAVEFORM_SAMPLES * 4);
  readonly #bandData = new Float32Array(SPECTRAL_BLOOM_BAND_COUNT * 4);
  readonly #waveformTexture: DataTexture;
  readonly #bandTexture: DataTexture;

  constructor(canvas: HTMLCanvasElement, performance: SpectralBloomPerformance) {
    if (performance.statics.field.waveformSamplesPerFrame !== SPECTRAL_BLOOM_WAVEFORM_SAMPLES) throw new Error(`Spectral Bloom scene requires ${SPECTRAL_BLOOM_WAVEFORM_SAMPLES} waveform samples per frame`);
    if (performance.statics.field.bandFrames[0]?.length !== SPECTRAL_BLOOM_BAND_COUNT) throw new Error(`Spectral Bloom scene requires ${SPECTRAL_BLOOM_BAND_COUNT} spectral bands`);
    this.#performance = performance;
    this.#renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.#renderer.setPixelRatio(1);
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.setClearColor(new Color(performance.palette.bg), 1);
    this.#renderer.outputColorSpace = SRGBColorSpace;

    this.#camera = new PerspectiveCamera(31, performance.resolution.w / performance.resolution.h, 0.05, 40);
    this.#camera.position.set(0, 0, 16.5);
    this.#camera.lookAt(0, 0, 0);

    const topology = generateSpectralBloomTopology(performance.statics.topology.surfaceParticles, performance.statics.topology.interiorParticles);
    this.#geometry = new BufferGeometry();
    this.#geometry.setAttribute("position", new BufferAttribute(topology.positions, 3));
    this.#geometry.setAttribute("aInterior", new BufferAttribute(topology.interior, 1));
    this.#geometry.setAttribute("aSeed", new BufferAttribute(topology.seeds, 1));
    this.#geometry.computeBoundingSphere();

    this.#waveformTexture = makeDataTexture(this.#waveformData, SPECTRAL_BLOOM_WAVEFORM_SAMPLES, true);
    this.#bandTexture = makeDataTexture(this.#bandData, SPECTRAL_BLOOM_BAND_COUNT, false);
    this.#material = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uWaveformTexture: { value: this.#waveformTexture },
        uBandTexture: { value: this.#bandTexture },
        uWaveformDepth: { value: this.tuning.waveformDepth },
        uSpectralDepth: { value: this.tuning.spectralDepth },
        uPointSize: { value: this.tuning.particleSize },
        uLuminosity: { value: this.tuning.luminosity },
        uCore: { value: this.tuning.core },
        uSurfaceColor: { value: new Color(performance.palette.roles.surface ?? "#e8edf2") },
        uCoreColor: { value: new Color(performance.palette.roles.core ?? "#9eb9d4") },
      },
    });
    this.#points = new Points(this.#geometry, this.#material);
    this.#points.frustumCulled = false;
    this.#scene.add(this.#points);
  }

  #uploadMeasuredState(time: number): void {
    const state = sampleSpectralBloomState(this.#performance, time);
    for (let index = 0; index < SPECTRAL_BLOOM_WAVEFORM_SAMPLES; index += 1) {
      const offset = index * 4;
      this.#waveformData[offset] = state.waveform[index] ?? 0;
      this.#waveformData[offset + 1] = 0;
      this.#waveformData[offset + 2] = 0;
      this.#waveformData[offset + 3] = 1;
    }
    for (let index = 0; index < SPECTRAL_BLOOM_BAND_COUNT; index += 1) {
      const offset = index * 4;
      this.#bandData[offset] = state.bands[index] ?? 0;
      this.#bandData[offset + 1] = state.signedBands[index] ?? 0;
      this.#bandData[offset + 2] = 0;
      this.#bandData[offset + 3] = 1;
    }
    this.#waveformTexture.needsUpdate = true;
    this.#bandTexture.needsUpdate = true;
  }

  renderFrame(time: number): void {
    const bounded = Math.max(0, Math.min(this.#performance.durationSec, time));
    this.#uploadMeasuredState(bounded);
    const uniforms = this.#material.uniforms;
    uniforms.uWaveformDepth!.value = this.tuning.waveformDepth;
    uniforms.uSpectralDepth!.value = this.tuning.spectralDepth;
    uniforms.uPointSize!.value = this.tuning.particleSize;
    uniforms.uLuminosity!.value = this.tuning.luminosity;
    uniforms.uCore!.value = this.tuning.core;

    const yaw = bounded * 0.018 * this.tuning.orbit;
    const pitch = Math.sin(bounded * 0.035) * 0.04 * this.tuning.orbit;
    const distance = 16.5 * Math.max(0.72, this.tuning.cameraDistance);
    this.#camera.position.set(Math.sin(yaw) * distance, Math.sin(pitch) * distance * 0.52, Math.cos(yaw) * distance);
    this.#camera.lookAt(new Vector3(0, 0, 0));
    this.#renderer.render(this.#scene, this.#camera);
  }

  destroy(): void {
    this.#waveformTexture.dispose();
    this.#bandTexture.dispose();
    this.#geometry.dispose();
    this.#material.dispose();
    this.#renderer.dispose();
  }
}
