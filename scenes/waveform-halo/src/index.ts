import { sampleWaveformHaloHistory, type WaveformHaloPerformance } from "@reaper-viz/compiler-waveform-halo";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  FloatType,
  LinearFilter,
  Mesh,
  PerspectiveCamera,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";

export type { WaveformHaloPerformance } from "@reaper-viz/compiler-waveform-halo";

export interface WaveformHaloTuning {
  waveformDepth: number;
  historySpread: number;
  historyDepth: number;
  lineWidth: number;
  glow: number;
  color: number;
  cameraDistance: number;
}

export interface WaveformHaloContourPosition {
  radius: number;
  depth: number;
  opacity: number;
}

export function waveformHaloContourPosition(waveform: number, history: number, currentActivity: number, historicalActivity: number, waveformDepth = 1, historySpread = 1, historyDepth = 1): WaveformHaloContourPosition {
  const h = Math.max(0, Math.min(1, history));
  const activity = Math.max(0, Math.min(1, currentActivity));
  const gate = Math.pow(activity, 0.72);
  const core = h < 0.0001;
  return {
    radius: Math.max(0.62, 1.55 + waveform * waveformDepth * (0.72 + h * 0.48) + h * historySpread * 3.15 * gate),
    depth: h * historyDepth * 2.7 * gate,
    opacity: core ? 1 : gate * Math.max(0, Math.min(1, historicalActivity)) * (1 - h * 0.72),
  };
}

export function generateWaveformHaloRibbonGeometry(ringCount: number, segmentsPerRing: number): BufferGeometry {
  if (!Number.isInteger(ringCount) || ringCount < 2 || !Number.isInteger(segmentsPerRing) || segmentsPerRing < 16) throw new RangeError("Waveform Halo requires at least two rings and sixteen segments");
  const vertexCount = ringCount * segmentsPerRing * 6;
  const position = new Float32Array(vertexCount * 3);
  const angle = new Float32Array(vertexCount);
  const history = new Float32Array(vertexCount);
  const side = new Float32Array(vertexCount);
  let cursor = 0;
  const emit = (angleValue: number, historyValue: number, sideValue: number) => {
    angle[cursor] = angleValue;
    history[cursor] = historyValue;
    side[cursor] = sideValue;
    cursor += 1;
  };
  for (let ring = 0; ring < ringCount; ring += 1) {
    const h = ring / (ringCount - 1);
    for (let segment = 0; segment < segmentsPerRing; segment += 1) {
      const a0 = segment / segmentsPerRing;
      const a1 = (segment + 1) / segmentsPerRing;
      emit(a0, h, -1); emit(a0, h, 1); emit(a1, h, -1);
      emit(a1, h, -1); emit(a0, h, 1); emit(a1, h, 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("aAngle", new BufferAttribute(angle, 1));
  geometry.setAttribute("aHistory", new BufferAttribute(history, 1));
  geometry.setAttribute("aSide", new BufferAttribute(side, 1));
  geometry.boundingSphere = null;
  return geometry;
}

const VERTEX_SHADER = `
precision highp float;
attribute float aAngle;
attribute float aHistory;
attribute float aSide;
uniform sampler2D uHistoryTexture;
uniform float uRingCount;
uniform float uActivity;
uniform float uWaveformDepth;
uniform float uHistorySpread;
uniform float uHistoryDepth;
uniform float uLineWidth;
varying float vAlpha;
varying float vHistory;
varying float vCentroid;
varying float vSide;

void main() {
  float row = (aHistory * (uRingCount - 1.0) + 0.5) / uRingCount;
  vec4 measured = texture2D(uHistoryTexture, vec2(fract(aAngle), row));
  float seamEnvelope = smoothstep(0.0, 0.035, aAngle) * (1.0 - smoothstep(0.965, 1.0, aAngle));
  float waveform = measured.r * seamEnvelope;
  float gate = pow(clamp(uActivity, 0.0, 1.0), 0.72);
  float core = 1.0 - step(0.0001, aHistory);
  float radius = max(0.62, 1.55
    + waveform * uWaveformDepth * (0.72 + aHistory * 0.48)
    + aHistory * uHistorySpread * 3.15 * gate);
  float width = uLineWidth * mix(1.0, 0.58, aHistory);
  radius += aSide * width;
  float angle = aAngle * 6.28318530718;
  vec2 radial = vec2(cos(angle), sin(angle));
  float depth = aHistory * uHistoryDepth * 2.7 * gate;
  vec3 world = vec3(radial * radius, depth);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  vAlpha = mix(gate * measured.a * (1.0 - aHistory * 0.72), 1.0, core);
  vHistory = aHistory;
  vCentroid = measured.b;
  vSide = aSide;
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec3 uCoreColor;
uniform vec3 uCyanColor;
uniform vec3 uMagentaColor;
uniform vec3 uVioletColor;
uniform float uGlow;
uniform float uColor;
uniform float uGlowPass;
varying float vAlpha;
varying float vHistory;
varying float vCentroid;
varying float vSide;

void main() {
  float edge = 1.0 - smoothstep(0.28, 1.0, abs(vSide));
  float huePosition = fract(vHistory * 0.92 + vCentroid * 0.38 + uColor * 0.18);
  vec3 low = mix(uCyanColor, uVioletColor, smoothstep(0.0, 0.58, huePosition));
  vec3 high = mix(uVioletColor, uMagentaColor, smoothstep(0.42, 1.0, huePosition));
  vec3 color = mix(low, high, smoothstep(0.3, 0.78, huePosition));
  color = mix(uCoreColor, color, smoothstep(0.015, 0.15, vHistory));
  float glowAlpha = mix(edge, 0.28 + edge * 0.42, uGlowPass);
  float alpha = vAlpha * glowAlpha * mix(0.88, 0.24 * uGlow, uGlowPass);
  gl_FragColor = vec4(color * mix(1.5, 1.05 + uGlow, uGlowPass), alpha);
}`;

function historyTexture(data: Float32Array<ArrayBuffer>, width: number, height: number): DataTexture {
  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class WaveformHaloScene {
  readonly backendKind = "three" as const;
  readonly tuning: WaveformHaloTuning = {
    waveformDepth: 0.72,
    historySpread: 1,
    historyDepth: 1,
    lineWidth: 0.014,
    glow: 0.9,
    color: 0.86,
    cameraDistance: 1,
  };

  readonly #performance: WaveformHaloPerformance;
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera: PerspectiveCamera;
  readonly #geometry: BufferGeometry;
  readonly #lineMaterial: ShaderMaterial;
  readonly #glowMaterial: ShaderMaterial;
  readonly #lineMesh: Mesh;
  readonly #glowMesh: Mesh;
  readonly #historyData: Float32Array<ArrayBuffer>;
  readonly #historyTexture: DataTexture;
  readonly #ringCount: number;
  readonly #segmentCount: number;
  readonly #waveformSampleCount: number;

  constructor(canvas: HTMLCanvasElement, performance: WaveformHaloPerformance) {
    this.#performance = performance;
    this.#ringCount = performance.statics.topology.ringCount;
    this.#segmentCount = performance.statics.topology.segmentsPerRing;
    this.#waveformSampleCount = performance.statics.field.waveformSamplesPerFrame;
    this.#renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.#renderer.setPixelRatio(1);
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.setClearColor(new Color(performance.palette.bg), 1);
    this.#renderer.outputColorSpace = SRGBColorSpace;

    this.#camera = new PerspectiveCamera(37, performance.resolution.w / performance.resolution.h, 0.05, 30);
    this.#camera.position.set(0, 0.45, 10.4);
    this.#camera.lookAt(0, 0.15, 0.7);

    this.#geometry = generateWaveformHaloRibbonGeometry(this.#ringCount, this.#segmentCount);
    this.#historyData = new Float32Array(this.#ringCount * this.#waveformSampleCount * 4);
    this.#historyTexture = historyTexture(this.#historyData, this.#waveformSampleCount, this.#ringCount);
    const uniforms = {
      uHistoryTexture: { value: this.#historyTexture },
      uRingCount: { value: this.#ringCount },
      uActivity: { value: 0 },
      uWaveformDepth: { value: this.tuning.waveformDepth },
      uHistorySpread: { value: this.tuning.historySpread },
      uHistoryDepth: { value: this.tuning.historyDepth },
      uLineWidth: { value: this.tuning.lineWidth },
      uGlow: { value: this.tuning.glow },
      uColor: { value: this.tuning.color },
      uGlowPass: { value: 0 },
      uCoreColor: { value: new Color(performance.palette.roles.core ?? "#f8fbff") },
      uCyanColor: { value: new Color(performance.palette.roles.cyan ?? "#61e6ff") },
      uMagentaColor: { value: new Color(performance.palette.roles.magenta ?? "#ff57d5") },
      uVioletColor: { value: new Color(performance.palette.roles.violet ?? "#7d55ff") },
    };
    this.#lineMaterial = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms,
    });
    this.#glowMaterial = this.#lineMaterial.clone();
    this.#glowMaterial.uniforms.uGlowPass!.value = 1;
    this.#glowMesh = new Mesh(this.#geometry, this.#glowMaterial);
    this.#lineMesh = new Mesh(this.#geometry, this.#lineMaterial);
    this.#glowMesh.frustumCulled = false;
    this.#lineMesh.frustumCulled = false;
    this.#scene.add(this.#glowMesh, this.#lineMesh);
  }

  #uploadHistory(time: number): number {
    const history = sampleWaveformHaloHistory(this.#performance, time, this.#ringCount, this.#performance.statics.topology.historySec);
    for (let ring = 0; ring < this.#ringCount; ring += 1) {
      const state = history[ring]!;
      for (let sample = 0; sample < this.#waveformSampleCount; sample += 1) {
        const offset = (ring * this.#waveformSampleCount + sample) * 4;
        this.#historyData[offset] = state.waveform[sample] ?? 0;
        this.#historyData[offset + 1] = state.energy;
        this.#historyData[offset + 2] = state.centroid;
        this.#historyData[offset + 3] = state.activity;
      }
    }
    this.#historyTexture.needsUpdate = true;
    return history[0]!.activity;
  }

  renderFrame(time: number): void {
    const bounded = Math.max(0, Math.min(this.#performance.durationSec, time));
    const activity = this.#uploadHistory(bounded);
    for (const material of [this.#lineMaterial, this.#glowMaterial]) {
      const uniforms = material.uniforms;
      uniforms.uActivity!.value = activity;
      uniforms.uWaveformDepth!.value = this.tuning.waveformDepth;
      uniforms.uHistorySpread!.value = this.tuning.historySpread;
      uniforms.uHistoryDepth!.value = this.tuning.historyDepth;
      uniforms.uLineWidth!.value = this.tuning.lineWidth * (material === this.#glowMaterial ? 4.8 : 1);
      uniforms.uGlow!.value = this.tuning.glow;
      uniforms.uColor!.value = this.tuning.color;
    }
    const distance = 10.4 * Math.max(0.72, this.tuning.cameraDistance);
    const yaw = Math.sin(bounded * 0.08) * 0.035;
    this.#camera.position.set(Math.sin(yaw) * distance, 0.45, Math.cos(yaw) * distance);
    this.#camera.lookAt(new Vector3(0, 0.15, 0.7));
    this.#renderer.render(this.#scene, this.#camera);
  }

  destroy(): void {
    this.#historyTexture.dispose();
    this.#geometry.dispose();
    this.#lineMaterial.dispose();
    this.#glowMaterial.dispose();
    this.#renderer.dispose();
  }
}
