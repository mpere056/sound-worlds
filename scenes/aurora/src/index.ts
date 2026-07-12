import { sampleAuroraParticle, type AuroraPerformance, type AuroraRouteSegment } from "@reaper-viz/compiler-aurora";
import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";

export type { AuroraPerformance } from "@reaper-viz/compiler-aurora";

export interface AuroraTuning {
  aurora: number;
  coilGlow: number;
  trail: number;
  cameraDistance: number;
}

const BACKGROUND_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BACKGROUND_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uEnergy;
uniform float uStrength;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}

void main() {
  vec2 uv = vUv;
  float sky = 0.012 + 0.035 * (1.0 - uv.y);
  vec3 color = vec3(0.006, 0.018, 0.035) + sky * vec3(0.04, 0.16, 0.22);
  float curtain = 0.0;
  for (float band = 0.0; band < 5.0; band += 1.0) {
    float phase = band * 1.73;
    float center = 0.62 + 0.055 * sin(uv.x * (7.0 + band) + uTime * (0.12 + band * 0.018) + phase);
    center += (noise(vec2(uv.x * 4.0 + phase, uTime * 0.045)) - 0.5) * 0.15;
    float width = 0.018 + band * 0.006 + uEnergy * 0.012;
    curtain += exp(-abs(uv.y - center) / width) * (0.22 - band * 0.025);
  }
  float vertical = smoothstep(0.18, 0.9, uv.y) * (0.55 + 0.45 * noise(vec2(uv.x * 9.0, uTime * 0.03)));
  vec3 aurora = mix(vec3(0.04, 0.45, 0.34), vec3(0.12, 0.55, 0.72), uv.x + 0.15 * sin(uTime * 0.1));
  color += aurora * curtain * vertical * uStrength * (0.62 + uEnergy * 0.7);
  float star = step(0.9975, hash(floor(uv * vec2(300.0, 520.0)))) * (0.3 + 0.7 * hash(uv * 913.0));
  color += star * vec3(0.55, 0.75, 0.9) * (1.0 - curtain);
  gl_FragColor = vec4(color, 1.0);
}`;

function hex(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

function energyAt(performance: AuroraPerformance, t: number): number {
  const curve = performance.curves.energy;
  if (!curve?.values.length) return 0;
  const position = Math.max(0, Math.min(curve.values.length - 1, (t - curve.t0) / curve.dt));
  const left = Math.floor(position);
  const right = Math.min(curve.values.length - 1, left + 1);
  return curve.values[left]! + (curve.values[right]! - curve.values[left]!) * (position - left);
}

function routePoints(segment: AuroraRouteSegment, samples = 14): number[] {
  const points: number[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = segment.t0 + (segment.t1 - segment.t0) * index / samples;
    points.push(...sampleAuroraParticle([segment], t).position);
  }
  return points;
}

export class AuroraScene {
  readonly backendKind = "three";
  readonly tuning: AuroraTuning = { aurora: 0.82, coilGlow: 0.78, trail: 0.7, cameraDistance: 1 };
  readonly #performance: AuroraPerformance;
  readonly #renderer: WebGLRenderer;
  readonly #backgroundScene = new Scene();
  readonly #backgroundCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #backgroundMaterial: ShaderMaterial;
  readonly #scene = new Scene();
  readonly #camera: PerspectiveCamera;
  readonly #particle: Mesh<SphereGeometry, MeshPhysicalMaterial>;
  readonly #particleLight: PointLight;
  readonly #trail: Array<Mesh<SphereGeometry, MeshBasicMaterial>>;
  readonly #coilMeshes: Array<{ t: number; ring: Mesh<TorusGeometry, MeshStandardMaterial>; halo: Mesh<TorusGeometry, MeshBasicMaterial> }> = [];

  constructor(canvas: HTMLCanvasElement, performance: AuroraPerformance) {
    this.#performance = performance;
    this.#renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.setPixelRatio(1);
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.autoClear = false;

    this.#backgroundMaterial = new ShaderMaterial({
      vertexShader: BACKGROUND_VERTEX,
      fragmentShader: BACKGROUND_FRAGMENT,
      depthWrite: false,
      depthTest: false,
      uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 }, uStrength: { value: this.tuning.aurora } },
    });
    this.#backgroundScene.add(new Mesh(new PlaneGeometry(2, 2), this.#backgroundMaterial));

    this.#camera = new PerspectiveCamera(39, performance.resolution.w / performance.resolution.h, 0.05, 120);
    this.#scene.add(new AmbientLight(0x83a6b8, 0.5));
    const key = new DirectionalLight(0xdff8ff, 2.2);
    key.position.set(5, 8, 9);
    this.#scene.add(key);

    const routeGeometry = new BufferGeometry();
    routeGeometry.setAttribute("position", new Float32BufferAttribute(performance.statics.route.flatMap((segment) => routePoints(segment)), 3));
    this.#scene.add(new Line(routeGeometry, new LineBasicMaterial({ color: 0x4edccb, transparent: true, opacity: 0.18 })));

    const zAxis = new Vector3(0, 0, 1);
    for (const coil of performance.statics.coils) {
      const geometry = new TorusGeometry(coil.radius, 0.09, 12, 48);
      const material = new MeshStandardMaterial({ color: 0x91a4ad, emissive: hex(coil.color), emissiveIntensity: 0.08, metalness: 0.82, roughness: 0.24, transparent: true });
      const ring = new Mesh(geometry, material);
      ring.position.set(...coil.center);
      ring.quaternion.copy(new Quaternion().setFromUnitVectors(zAxis, new Vector3(...coil.axis).normalize()));
      const halo = new Mesh(new TorusGeometry(coil.radius, 0.16, 10, 48), new MeshBasicMaterial({ color: hex(coil.color), transparent: true, opacity: 0.04, blending: AdditiveBlending, depthWrite: false }));
      halo.position.copy(ring.position);
      halo.quaternion.copy(ring.quaternion);
      this.#scene.add(halo, ring);
      this.#coilMeshes.push({ t: coil.t, ring, halo });
    }

    this.#particle = new Mesh(
      new SphereGeometry(performance.statics.particleRadius, 28, 18),
      new MeshPhysicalMaterial({ color: 0xf8ffff, emissive: 0x76ffe1, emissiveIntensity: 0.32, roughness: 0.06, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.04 }),
    );
    this.#particleLight = new PointLight(0x74ffe1, 2.2, 5);
    this.#trail = Array.from({ length: 12 }, (_, index) => new Mesh(
      new SphereGeometry(performance.statics.particleRadius * (0.82 - index * 0.045), 10, 7),
      new MeshBasicMaterial({ color: 0x75ffe5, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false }),
    ));
    this.#scene.add(...this.#trail, this.#particle, this.#particleLight);
  }

  renderFrame(t: number): void {
    const energy = energyAt(this.#performance, t);
    this.#backgroundMaterial.uniforms.uTime!.value = t;
    this.#backgroundMaterial.uniforms.uEnergy!.value = energy;
    this.#backgroundMaterial.uniforms.uStrength!.value = this.tuning.aurora;

    const state = sampleAuroraParticle(this.#performance.statics.route, t);
    const position = new Vector3(...state.position);
    const direction = new Vector3(...state.velocity).normalize();
    this.#particle.position.copy(position);
    this.#particle.scale.setScalar(1 + energy * 0.18);
    this.#particleLight.position.copy(position);
    this.#particleLight.intensity = 1.2 + energy * 2.4;
    for (const [index, trail] of this.#trail.entries()) {
      const sample = sampleAuroraParticle(this.#performance.statics.route, Math.max(0, t - (index + 1) * 0.035));
      trail.position.set(...sample.position);
      trail.material.opacity = this.tuning.trail * 0.13 * (1 - index / this.#trail.length);
    }
    const nextCoil = this.#coilMeshes.findIndex((coil) => coil.t >= t - 1e-6);
    for (const [index, coil] of this.#coilMeshes.entries()) {
      const age = Math.abs(t - coil.t);
      const pulse = Math.exp(-age * 10);
      const relative = nextCoil < 0 ? index - this.#coilMeshes.length : index - nextCoil;
      const presence = relative < 0 ? 0.24 : relative <= 4 ? 1 - relative * 0.12 : 0.16;
      coil.ring.material.opacity = Math.min(1, presence + pulse * 0.35);
      coil.ring.material.emissiveIntensity = 0.08 + pulse * this.tuning.coilGlow * 2.4;
      coil.halo.material.opacity = presence * 0.025 + pulse * this.tuning.coilGlow * 0.28;
      coil.halo.scale.setScalar(1 + pulse * 0.22);
    }

    const cameraOffset = new Vector3(5.2, 3.4, 7.6).multiplyScalar(this.tuning.cameraDistance);
    cameraOffset.addScaledVector(direction, -2.5 * this.tuning.cameraDistance);
    this.#camera.position.copy(position).add(cameraOffset);
    this.#camera.lookAt(position.clone().addScaledVector(direction, 0.75));

    this.#renderer.clear();
    this.#renderer.render(this.#backgroundScene, this.#backgroundCamera);
    this.#renderer.clearDepth();
    this.#renderer.render(this.#scene, this.#camera);
  }

  destroy(): void {
    this.#scene.traverse((object) => {
      const mesh = object as Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    });
    this.#backgroundMaterial.dispose();
    this.#renderer.dispose();
  }
}
