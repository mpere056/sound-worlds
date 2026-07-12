import { sampleAuroraParticle, type AuroraPerformance, type AuroraRouteSegment } from "@reaper-viz/compiler-aurora";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Line,
  Mesh,
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
  fieldMotion: number;
  particlePlasma: number;
  coilGlow: number;
  trail: number;
  cameraDistance: number;
}

export const AURORA_PARTICLE_SHADER_DISPLACEMENT = 0.01;
export const AURORA_COIL_SHADER_DISPLACEMENT = 0.008;

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
uniform float uMotion;

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
    float center = 0.62 + 0.055 * sin(uv.x * (7.0 + band) + uTime * uMotion * (0.12 + band * 0.018) + phase);
    center += (noise(vec2(uv.x * 4.0 + phase, uTime * uMotion * 0.045)) - 0.5) * 0.15;
    float width = 0.018 + band * 0.006 + uEnergy * 0.012;
    curtain += exp(-abs(uv.y - center) / width) * (0.22 - band * 0.025);
  }
  float vertical = smoothstep(0.18, 0.9, uv.y) * (0.55 + 0.45 * noise(vec2(uv.x * 9.0, uTime * uMotion * 0.03)));
  vec3 aurora = mix(vec3(0.04, 0.45, 0.34), vec3(0.12, 0.55, 0.72), uv.x + 0.15 * sin(uTime * uMotion * 0.1));
  color += aurora * curtain * vertical * uStrength * (0.62 + uEnergy * 0.7);
  vec2 fieldUv = (uv - 0.5) * vec2(1.0, 1.65);
  float fieldRadius = length(fieldUv);
  float fieldAngle = atan(fieldUv.y, fieldUv.x);
  float interference = 0.5 + 0.5 * sin(fieldRadius * 78.0 - uTime * uMotion * 1.15 + sin(fieldAngle * 5.0 + uTime * 0.18) * 2.1);
  interference = pow(interference, 12.0) * exp(-fieldRadius * 2.8);
  color += vec3(0.025, 0.2, 0.18) * interference * (0.18 + uEnergy * 0.2) * uStrength;
  float starSeed = hash(floor(uv * vec2(300.0, 520.0)));
  float twinkle = 0.58 + 0.42 * sin(uTime * uMotion * (0.35 + starSeed) + starSeed * 19.0);
  float star = step(0.9975, starSeed) * (0.3 + 0.7 * hash(uv * 913.0)) * twinkle;
  color += star * vec3(0.55, 0.75, 0.9) * (1.0 - curtain);
  gl_FragColor = vec4(color, 1.0);
}`;

const PARTICLE_VERTEX = `
varying vec3 vNormalView;
varying vec3 vViewPosition;
varying vec3 vLocal;
uniform float uTime;
uniform float uEnergy;
uniform float uDisplacement;
void main() {
  vLocal = normalize(position);
  float wave = sin(vLocal.x * 11.0 + uTime * 2.7) * sin(vLocal.y * 13.0 - uTime * 2.1) * sin(vLocal.z * 9.0 + uTime * 1.6);
  vec3 displaced = position + normal * wave * uDisplacement * (0.35 + uEnergy * 0.65);
  vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
  vViewPosition = viewPosition.xyz;
  vNormalView = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewPosition;
}`;

const PARTICLE_FRAGMENT = `
precision highp float;
varying vec3 vNormalView;
varying vec3 vViewPosition;
varying vec3 vLocal;
uniform float uTime;
uniform float uEnergy;
uniform float uIntensity;
void main() {
  vec3 viewDir = normalize(-vViewPosition);
  float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormalView), viewDir)), 2.4);
  float longitude = atan(vLocal.z, vLocal.x);
  float latitude = asin(clamp(vLocal.y, -1.0, 1.0));
  float filament = pow(0.5 + 0.5 * sin(longitude * 7.0 + sin(latitude * 5.0 - uTime * 1.4) * 2.2 - uTime * 3.1), 5.0);
  float counter = pow(0.5 + 0.5 * sin(longitude * 3.0 - latitude * 9.0 + uTime * 2.2), 9.0);
  vec3 core = mix(vec3(0.72, 1.0, 0.95), vec3(0.94, 0.98, 1.0), 0.58 + filament * 0.42);
  vec3 spectral = mix(vec3(0.08, 0.86, 0.62), vec3(0.22, 0.58, 1.0), 0.5 + 0.5 * sin(longitude + uTime * 0.32));
  vec3 color = core * (0.75 + uEnergy * 0.5) + spectral * (fresnel * 1.55 + filament * 0.28 + counter * 0.16) * uIntensity;
  gl_FragColor = vec4(color, 1.0);
}`;

const COIL_VERTEX = `
varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewPosition;
uniform float uTime;
uniform float uPulse;
uniform float uPhase;
uniform float uDisplacement;
void main() {
  vUv = uv;
  float fieldWave = sin(uv.x * 37.6991 - uTime * 2.4 + uPhase) * sin(uv.y * 6.2831 + uTime * 1.1);
  vec3 displaced = position + normal * fieldWave * uDisplacement * (0.3 + uPulse * 0.7);
  vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
  vViewPosition = viewPosition.xyz;
  vNormalView = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewPosition;
}`;

const COIL_FRAGMENT = `
precision highp float;
varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewPosition;
uniform vec3 uAccent;
uniform float uTime;
uniform float uPulse;
uniform float uPhase;
uniform float uPresence;
uniform float uIntensity;
void main() {
  vec3 viewDir = normalize(-vViewPosition);
  float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormalView), viewDir)), 2.8);
  float carrier = 0.5 + 0.5 * sin(vUv.x * 12.5664 - uTime * 2.1 + uPhase);
  float packet = pow(carrier, 13.0);
  float filament = pow(0.5 + 0.5 * sin(vUv.x * 43.9823 + vUv.y * 12.5664 + uTime * 1.35 + uPhase), 8.0);
  float seam = pow(1.0 - abs(vUv.y * 2.0 - 1.0), 5.0);
  vec3 metal = (vec3(0.095, 0.135, 0.15) + fresnel * vec3(0.28, 0.36, 0.39)) * (0.42 + uPresence * 0.58);
  vec3 emission = uAccent * (0.11 * uPresence + packet * 1.05 + filament * 0.22 + seam * uPulse * 1.65 + fresnel * 0.2) * uIntensity;
  gl_FragColor = vec4(metal + emission, clamp(uPresence + fresnel * 0.12, 0.0, 1.0));
}`;

const HALO_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uAccent;
uniform float uTime;
uniform float uPulse;
uniform float uPhase;
uniform float uPresence;
uniform float uIntensity;
void main() {
  float filament = pow(0.5 + 0.5 * sin(vUv.x * 31.4159 - uTime * 3.4 + uPhase + sin(vUv.y * 6.2831) * 1.8), 10.0);
  float edge = pow(1.0 - abs(vUv.y * 2.0 - 1.0), 2.0);
  float alpha = (0.025 + filament * 0.12 + uPulse * edge * 0.34) * uPresence * uIntensity;
  gl_FragColor = vec4(uAccent * (0.45 + filament + uPulse), alpha);
}`;

const ROUTE_VERTEX = `
attribute float aProgress;
varying float vProgress;
void main() {
  vProgress = aProgress;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ROUTE_FRAGMENT = `
precision highp float;
varying float vProgress;
uniform float uTime;
uniform float uEnergy;
void main() {
  float phase = fract(vProgress * 7.0 - uTime * 0.24);
  float packet = exp(-phase * 18.0);
  float shimmer = 0.35 + 0.65 * sin(vProgress * 94.0 - uTime * 2.7) * sin(vProgress * 94.0 - uTime * 2.7);
  vec3 color = mix(vec3(0.05, 0.36, 0.32), vec3(0.28, 0.92, 0.78), packet);
  gl_FragColor = vec4(color, (0.035 + packet * 0.3 + shimmer * 0.035) * (0.7 + uEnergy * 0.5));
}`;

const TRAIL_VERTEX = `
varying vec3 vNormalView;
varying vec3 vViewPosition;
void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = viewPosition.xyz;
  vNormalView = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewPosition;
}`;

const TRAIL_FRAGMENT = `
precision highp float;
varying vec3 vNormalView;
varying vec3 vViewPosition;
uniform float uTime;
uniform float uPhase;
uniform float uOpacity;
void main() {
  float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormalView), normalize(-vViewPosition))), 2.0);
  float pulse = 0.7 + 0.3 * sin(uTime * 3.0 - uPhase);
  gl_FragColor = vec4(mix(vec3(0.12, 0.66, 0.58), vec3(0.45, 0.9, 1.0), fresnel), uOpacity * pulse * (0.35 + fresnel));
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
  readonly tuning: AuroraTuning = { aurora: 0.82, fieldMotion: 1, particlePlasma: 0.9, coilGlow: 0.78, trail: 0.7, cameraDistance: 1 };
  readonly #performance: AuroraPerformance;
  readonly #renderer: WebGLRenderer;
  readonly #backgroundScene = new Scene();
  readonly #backgroundCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #backgroundMaterial: ShaderMaterial;
  readonly #routeMaterial: ShaderMaterial;
  readonly #scene = new Scene();
  readonly #camera: PerspectiveCamera;
  readonly #particle: Mesh<SphereGeometry, ShaderMaterial>;
  readonly #particleLight: PointLight;
  readonly #trail: Array<Mesh<SphereGeometry, ShaderMaterial>>;
  readonly #coilMeshes: Array<{ t: number; ring: Mesh<TorusGeometry, ShaderMaterial>; halo: Mesh<TorusGeometry, ShaderMaterial> }> = [];

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
      uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 }, uStrength: { value: this.tuning.aurora }, uMotion: { value: this.tuning.fieldMotion } },
    });
    this.#backgroundScene.add(new Mesh(new PlaneGeometry(2, 2), this.#backgroundMaterial));

    this.#camera = new PerspectiveCamera(39, performance.resolution.w / performance.resolution.h, 0.05, 120);

    const routeGeometry = new BufferGeometry();
    const routePositions = performance.statics.route.flatMap((segment) => routePoints(segment));
    const routePointCount = routePositions.length / 3;
    routeGeometry.setAttribute("position", new Float32BufferAttribute(routePositions, 3));
    routeGeometry.setAttribute("aProgress", new Float32BufferAttribute(Array.from({ length: routePointCount }, (_, index) => index / Math.max(1, routePointCount - 1)), 1));
    this.#routeMaterial = new ShaderMaterial({
      vertexShader: ROUTE_VERTEX,
      fragmentShader: ROUTE_FRAGMENT,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 } },
    });
    this.#scene.add(new Line(routeGeometry, this.#routeMaterial));

    const zAxis = new Vector3(0, 0, 1);
    for (const [index, coil] of performance.statics.coils.entries()) {
      const geometry = new TorusGeometry(coil.radius, coil.tubeRadius, 12, 48);
      const phase = index * 1.61803398875 + coil.pitch * 0.071;
      const material = new ShaderMaterial({
        vertexShader: COIL_VERTEX,
        fragmentShader: COIL_FRAGMENT,
        transparent: true,
        depthWrite: true,
        uniforms: {
          uAccent: { value: new Color(hex(coil.color)) },
          uTime: { value: 0 },
          uPulse: { value: 0 },
          uPhase: { value: phase },
          uPresence: { value: 1 },
          uIntensity: { value: this.tuning.coilGlow },
          uDisplacement: { value: AURORA_COIL_SHADER_DISPLACEMENT },
        },
      });
      const ring = new Mesh(geometry, material);
      ring.position.set(...coil.center);
      ring.quaternion.copy(new Quaternion().setFromUnitVectors(zAxis, new Vector3(...coil.axis).normalize()));
      const halo = new Mesh(new TorusGeometry(coil.radius, coil.tubeRadius * 1.8, 10, 48), new ShaderMaterial({
        vertexShader: COIL_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        uniforms: {
          uAccent: { value: new Color(hex(coil.color)) },
          uTime: { value: 0 },
          uPulse: { value: 0 },
          uPhase: { value: phase + 0.8 },
          uPresence: { value: 1 },
          uIntensity: { value: this.tuning.coilGlow },
          uDisplacement: { value: AURORA_COIL_SHADER_DISPLACEMENT * 0.6 },
        },
      }));
      halo.position.copy(ring.position);
      halo.quaternion.copy(ring.quaternion);
      this.#scene.add(halo, ring);
      this.#coilMeshes.push({ t: coil.t, ring, halo });
    }

    this.#particle = new Mesh(
      new SphereGeometry(performance.statics.particleRadius, 36, 24),
      new ShaderMaterial({
        vertexShader: PARTICLE_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uIntensity: { value: this.tuning.particlePlasma },
          uDisplacement: { value: AURORA_PARTICLE_SHADER_DISPLACEMENT },
        },
      }),
    );
    this.#particleLight = new PointLight(0x74ffe1, 2.2, 5);
    this.#trail = Array.from({ length: 12 }, (_, index) => new Mesh(
      new SphereGeometry(performance.statics.particleRadius * (0.82 - index * 0.045), 10, 7),
      new ShaderMaterial({
        vertexShader: TRAIL_VERTEX,
        fragmentShader: TRAIL_FRAGMENT,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uPhase: { value: index * 0.72 }, uOpacity: { value: 0 } },
      }),
    ));
    this.#scene.add(...this.#trail, this.#particle, this.#particleLight);
  }

  renderFrame(t: number): void {
    const energy = energyAt(this.#performance, t);
    this.#backgroundMaterial.uniforms.uTime!.value = t;
    this.#backgroundMaterial.uniforms.uEnergy!.value = energy;
    this.#backgroundMaterial.uniforms.uStrength!.value = this.tuning.aurora;
    this.#backgroundMaterial.uniforms.uMotion!.value = this.tuning.fieldMotion;
    this.#routeMaterial.uniforms.uTime!.value = t;
    this.#routeMaterial.uniforms.uEnergy!.value = energy;

    const state = sampleAuroraParticle(this.#performance.statics.route, t);
    const position = new Vector3(...state.position);
    const direction = new Vector3(...state.velocity).normalize();
    this.#particle.position.copy(position);
    this.#particle.scale.setScalar(1 + energy * 0.18);
    this.#particle.material.uniforms.uTime!.value = t;
    this.#particle.material.uniforms.uEnergy!.value = energy;
    this.#particle.material.uniforms.uIntensity!.value = this.tuning.particlePlasma;
    this.#particleLight.position.copy(position);
    this.#particleLight.intensity = 1.2 + energy * 2.4;
    for (const [index, trail] of this.#trail.entries()) {
      const sample = sampleAuroraParticle(this.#performance.statics.route, Math.max(0, t - (index + 1) * 0.035));
      trail.position.set(...sample.position);
      trail.material.uniforms.uTime!.value = t;
      trail.material.uniforms.uOpacity!.value = this.tuning.trail * 0.22 * (1 - index / this.#trail.length);
    }
    const nextCoil = this.#coilMeshes.findIndex((coil) => coil.t >= t - 1e-6);
    for (const [index, coil] of this.#coilMeshes.entries()) {
      const age = Math.abs(t - coil.t);
      const pulse = Math.exp(-age * 10);
      const relative = nextCoil < 0 ? index - this.#coilMeshes.length : index - nextCoil;
      const presence = relative < 0 ? 0.24 : relative <= 4 ? 1 - relative * 0.12 : 0.16;
      coil.ring.material.uniforms.uTime!.value = t;
      coil.ring.material.uniforms.uPulse!.value = pulse;
      coil.ring.material.uniforms.uPresence!.value = Math.min(1, presence + pulse * 0.35);
      coil.ring.material.uniforms.uIntensity!.value = this.tuning.coilGlow * (0.7 + energy * 0.3);
      coil.halo.material.uniforms.uTime!.value = t;
      coil.halo.material.uniforms.uPulse!.value = pulse;
      coil.halo.material.uniforms.uPresence!.value = presence;
      coil.halo.material.uniforms.uIntensity!.value = this.tuning.coilGlow;
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
