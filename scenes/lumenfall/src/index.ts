import { sampleLumenfallPose, type LumenfallImpact, type LumenfallPerformance } from "@reaper-viz/compiler-lumenfall";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  FogExp2,
  Group,
  InstancedMesh,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";

export type { LumenfallPerformance } from "@reaper-viz/compiler-lumenfall";

export interface LumenfallTuning {
  exposure: number;
  lightIntensity: number;
  lightRadius: number;
  wetness: number;
  bounceLight: number;
  trailLength: number;
  trailWidth: number;
  glow: number;
  cameraDistance: number;
}

export function lumenfallSurfaceIrradiance(intensity: number, distance: number, normalFacing: number, occluded = false): number {
  if (occluded || intensity <= 0 || normalFacing <= 0) return 0;
  return intensity * Math.max(0, Math.min(1, normalFacing)) / Math.max(0.01, distance * distance);
}

export function lumenfallImpactPulse(age: number, duration: number): number {
  if (age < 0 || age >= duration || duration <= 0) return 0;
  const normalized = age / duration;
  return Math.exp(-normalized * 5.5) * (1 - normalized);
}

function temperatureColor(kelvin: number): Color {
  const normalized = Math.max(0, Math.min(1, (kelvin - 3600) / 3200));
  return new Color("#ffd7ad").lerp(new Color("#d9f3ff"), normalized);
}

function createBasaltTextures(): { color: DataTexture; roughness: DataTexture } {
  const size = 128;
  const colorData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);
  const noise = (x: number, y: number) => {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const broad = noise(Math.floor(x / 8), Math.floor(y / 8));
      const fine = noise(x, y);
      const vein = Math.pow(Math.max(0, Math.sin(x * 0.16 + Math.sin(y * 0.09) * 2.4)), 18);
      const value = Math.round(9 + broad * 8 + fine * 4 + vein * 12);
      colorData[offset] = Math.round(value * 0.78);
      colorData[offset + 1] = Math.round(value * 0.9);
      colorData[offset + 2] = value;
      colorData[offset + 3] = 255;
      const rough = Math.round(110 + broad * 95 - vein * 48);
      roughnessData[offset] = rough;
      roughnessData[offset + 1] = rough;
      roughnessData[offset + 2] = rough;
      roughnessData[offset + 3] = 255;
    }
  }
  const color = new DataTexture(colorData, size, size);
  color.colorSpace = SRGBColorSpace;
  color.wrapS = color.wrapT = RepeatWrapping;
  color.minFilter = color.magFilter = LinearFilter;
  color.needsUpdate = true;
  const roughness = new DataTexture(roughnessData, size, size);
  roughness.wrapS = roughness.wrapT = RepeatWrapping;
  roughness.minFilter = roughness.magFilter = LinearFilter;
  roughness.needsUpdate = true;
  return { color, roughness };
}

function createInstancedSlabs(performance: LumenfallPerformance, materialName: "dry-basalt" | "wet-basalt", material: MeshPhysicalMaterial): InstancedMesh {
  const slabs = performance.statics.world.slabs.filter((slab) => slab.material === materialName);
  const geometry = new BoxGeometry(1, 1, 1, 1, 1, 1);
  const mesh = new InstancedMesh(geometry, material, slabs.length);
  const helper = new Object3D();
  for (const [index, slab] of slabs.entries()) {
    helper.position.set(...slab.center);
    helper.scale.set(...slab.size);
    helper.rotation.set(0, slab.yaw, 0);
    helper.updateMatrix();
    mesh.setMatrixAt(index, helper.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

function latestImpact(impacts: readonly LumenfallImpact[], time: number): LumenfallImpact | undefined {
  for (let index = impacts.length - 1; index >= 0; index -= 1) if (impacts[index]!.t <= time) return impacts[index];
  return undefined;
}

function destinationImpact(impacts: readonly LumenfallImpact[], time: number): LumenfallImpact {
  return impacts.find((impact) => impact.t >= time) ?? impacts.at(-1)!;
}

export class LumenfallScene {
  readonly backendKind = "three" as const;
  readonly tuning: LumenfallTuning = {
    exposure: 0.82,
    lightIntensity: 0.78,
    lightRadius: 1,
    wetness: 1,
    bounceLight: 0.72,
    trailLength: 0.85,
    trailWidth: 1,
    glow: 0.72,
    cameraDistance: 1,
  };

  readonly #performance: LumenfallPerformance;
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera: PerspectiveCamera;
  readonly #textures = createBasaltTextures();
  readonly #dryMaterial: MeshPhysicalMaterial;
  readonly #wetMaterial: MeshPhysicalMaterial;
  readonly #waterMaterial: MeshPhysicalMaterial;
  readonly #drySlabs: InstancedMesh;
  readonly #wetSlabs: InstancedMesh;
  readonly #water: Mesh;
  readonly #bodyGroup = new Group();
  readonly #bodyCore: Mesh;
  readonly #bodyGlow: Mesh;
  readonly #bodyStreak: Mesh;
  readonly #bodyLight: PointLight;
  readonly #shadowLight: SpotLight;
  readonly #shadowTarget = new Object3D();
  readonly #impactLight: PointLight;
  readonly #impactRing: Mesh;
  readonly #trail: Mesh[] = [];
  readonly #trailGeometry: BufferGeometry;
  readonly #tmpLook = new Vector3();

  constructor(canvas: HTMLCanvasElement, performance: LumenfallPerformance) {
    this.#performance = performance;
    this.#renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.#renderer.setPixelRatio(1);
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.setClearColor(new Color(performance.palette.bg), 1);
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = this.tuning.exposure;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = PCFSoftShadowMap;
    this.#scene.fog = new FogExp2(new Color("#010307"), 0.032);

    this.#camera = new PerspectiveCamera(42, performance.resolution.w / performance.resolution.h, 0.04, 85);

    this.#textures.color.repeat.set(2.5, 2.5);
    this.#textures.roughness.repeat.set(2.5, 2.5);
    this.#dryMaterial = new MeshPhysicalMaterial({
      color: performance.palette.roles.dry ?? "#17191d",
      map: this.#textures.color,
      roughnessMap: this.#textures.roughness,
      roughness: 0.76,
      metalness: 0,
      clearcoat: 0.05,
      clearcoatRoughness: 0.7,
    });
    this.#wetMaterial = new MeshPhysicalMaterial({
      color: performance.palette.roles.wet ?? "#101a22",
      map: this.#textures.color,
      roughnessMap: this.#textures.roughness,
      roughness: 0.22,
      metalness: 0,
      clearcoat: 0.88,
      clearcoatRoughness: 0.12,
    });
    this.#waterMaterial = new MeshPhysicalMaterial({
      color: performance.palette.roles.water ?? "#06121a",
      roughness: 0.2,
      metalness: 0,
      transmission: 0.12,
      transparent: true,
      opacity: 0.82,
      clearcoat: 0.72,
      clearcoatRoughness: 0.18,
      side: DoubleSide,
    });
    this.#drySlabs = createInstancedSlabs(performance, "dry-basalt", this.#dryMaterial);
    this.#wetSlabs = createInstancedSlabs(performance, "wet-basalt", this.#wetMaterial);
    this.#scene.add(this.#drySlabs, this.#wetSlabs);

    const world = performance.statics.world;
    const waterDepth = world.bounds.max[2] - world.bounds.min[2] + 4;
    this.#water = new Mesh(new PlaneGeometry(8.5, waterDepth), this.#waterMaterial);
    this.#water.rotation.x = -Math.PI / 2;
    this.#water.position.set(0, -0.17, (world.bounds.min[2] + world.bounds.max[2]) / 2);
    this.#water.receiveShadow = true;
    this.#scene.add(this.#water);
    this.#scene.add(new AmbientLight(new Color("#10202c"), 0.018));

    const coreGeometry = new SphereGeometry(world.heroRadius * 0.72, 24, 16);
    this.#bodyCore = new Mesh(coreGeometry, new MeshBasicMaterial({ color: "#ffffff" }));
    this.#bodyGlow = new Mesh(new SphereGeometry(world.heroRadius * 1.18, 20, 14), new MeshBasicMaterial({ color: "#dff6ff", transparent: true, opacity: 0.1, blending: AdditiveBlending, depthWrite: false }));
    this.#bodyStreak = new Mesh(new SphereGeometry(world.heroRadius * 0.82, 20, 14), new MeshBasicMaterial({ color: "#f7fdff", transparent: true, opacity: 0.34, blending: AdditiveBlending, depthWrite: false }));
    this.#bodyGroup.add(this.#bodyGlow, this.#bodyStreak, this.#bodyCore);
    this.#scene.add(this.#bodyGroup);

    this.#bodyLight = new PointLight(new Color("#fff4df"), 420, 11, 2);
    this.#scene.add(this.#bodyLight);
    this.#shadowLight = new SpotLight(new Color("#fff4df"), 260, 11, 1.12, 0.48, 2);
    this.#shadowLight.castShadow = true;
    this.#shadowLight.shadow.mapSize.set(512, 512);
    this.#shadowLight.shadow.camera.near = 0.08;
    this.#shadowLight.shadow.camera.far = 13;
    this.#shadowLight.target = this.#shadowTarget;
    this.#scene.add(this.#shadowTarget, this.#shadowLight);
    this.#impactLight = new PointLight(new Color("#d9f5ff"), 0, 6.5, 2);
    this.#scene.add(this.#impactLight);

    this.#impactRing = new Mesh(new RingGeometry(0.15, 0.19, 56), new MeshBasicMaterial({ color: performance.palette.roles.impact ?? "#d9f5ff", transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    this.#impactRing.rotation.x = -Math.PI / 2;
    this.#scene.add(this.#impactRing);

    this.#trailGeometry = new SphereGeometry(world.heroRadius * 0.5, 12, 8);
    for (let index = 0; index < 20; index += 1) {
      const material = new MeshBasicMaterial({ color: "#d9f5ff", transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
      const bead = new Mesh(this.#trailGeometry, material);
      bead.frustumCulled = false;
      this.#trail.push(bead);
      this.#scene.add(bead);
    }
  }

  renderFrame(time: number): void {
    const bounded = Math.max(0, Math.min(this.#performance.durationSec, time));
    const pose = sampleLumenfallPose(this.#performance, bounded);
    this.#bodyGroup.position.set(...pose.position);
    const velocityDirection = new Vector3(...pose.velocity);
    const speed = velocityDirection.length();
    if (speed > 1e-5) velocityDirection.normalize();
    else velocityDirection.set(0, 1, 0);
    this.#bodyGroup.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), velocityDirection));
    const heroRadius = this.#performance.statics.world.heroRadius;
    const motionStretch = Math.min(2.4, speed * 0.22);
    this.#bodyCore.scale.set(0.68, 1.16 + motionStretch * 0.16, 0.68);
    this.#bodyStreak.position.set(0, -heroRadius * (1.45 + motionStretch * 0.3), 0);
    this.#bodyStreak.scale.set(0.42, 2.8 + motionStretch, 0.42);
    this.#bodyLight.position.set(...pose.position);
    this.#shadowLight.position.set(...pose.position);
    this.#shadowTarget.position.set(pose.position[0], pose.position[1] - 1, pose.position[2]);
    const destination = destinationImpact(this.#performance.statics.impacts, bounded);
    const color = temperatureColor(destination.colorTemperatureK);
    this.#bodyLight.color.copy(color);
    this.#shadowLight.color.copy(color);
    const previous = latestImpact(this.#performance.statics.impacts, bounded);
    const pulse = previous ? lumenfallImpactPulse(bounded - previous.t, previous.afterglowSec) : 0;
    this.#bodyLight.intensity = destination.lightIntensity * this.tuning.lightIntensity * (0.34 + pulse * 0.42);
    this.#bodyLight.distance = 10.5 * this.tuning.lightRadius;
    this.#shadowLight.intensity = destination.lightIntensity * this.tuning.lightIntensity * (0.44 + pulse * 0.38);
    this.#shadowLight.distance = 10.5 * this.tuning.lightRadius;
    (this.#bodyGlow.material as MeshBasicMaterial).color.copy(color);
    (this.#bodyStreak.material as MeshBasicMaterial).color.copy(color);
    (this.#bodyGlow.material as MeshBasicMaterial).opacity = 0.04 + this.tuning.glow * 0.08 + pulse * 0.05;
    const glowScale = 0.72 + this.tuning.glow * 0.22 + pulse * 0.12;
    this.#bodyGlow.scale.set(glowScale * 0.72, glowScale * (1.35 + motionStretch * 0.12), glowScale * 0.72);

    this.#wetMaterial.roughness = Math.max(0.08, 0.36 - this.tuning.wetness * 0.14);
    this.#wetMaterial.clearcoat = Math.min(1, 0.58 + this.tuning.wetness * 0.3);
    this.#renderer.toneMappingExposure = this.tuning.exposure;

    if (previous) {
      this.#impactLight.position.set(previous.point[0], previous.point[1] + 0.04, previous.point[2]);
      this.#impactLight.color.copy(temperatureColor(previous.colorTemperatureK));
      this.#impactLight.intensity = previous.lightIntensity * 0.42 * this.tuning.bounceLight * pulse;
      this.#impactRing.position.set(previous.point[0], 0.012, previous.point[2]);
      const scale = 1 + (bounded - previous.t) * 5.5;
      this.#impactRing.scale.setScalar(scale);
      (this.#impactRing.material as MeshBasicMaterial).opacity = pulse * 0.62 * this.tuning.bounceLight;
    } else {
      this.#impactLight.intensity = 0;
      (this.#impactRing.material as MeshBasicMaterial).opacity = 0;
    }

    for (let index = 0; index < this.#trail.length; index += 1) {
      const age = (index + 1) * 0.012 * this.tuning.trailLength;
      const trailPose = sampleLumenfallPose(this.#performance, Math.max(0, bounded - age));
      const bead = this.#trail[index]!;
      bead.position.set(...trailPose.position);
      const fade = (1 - index / this.#trail.length) * this.tuning.trailLength;
      const distanceFromBody = bead.position.distanceTo(this.#bodyGroup.position);
      const visible = distanceFromBody > 0.015 ? 1 : 0;
      bead.scale.setScalar((0.3 + fade * 0.75) * this.tuning.trailWidth);
      (bead.material as MeshBasicMaterial).opacity = fade * 0.14 * visible;
    }

    const cameraScale = Math.max(0.72, this.tuning.cameraDistance);
    this.#camera.position.set(pose.position[0] + 4.7 * cameraScale, 2.65 * cameraScale, pose.position[2] + 7.2 * cameraScale);
    this.#tmpLook.set(pose.position[0] * 0.45, 0.08, pose.position[2] - 2.1);
    this.#camera.lookAt(this.#tmpLook);
    this.#renderer.render(this.#scene, this.#camera);
  }

  destroy(): void {
    for (const mesh of [this.#drySlabs, this.#wetSlabs]) mesh.geometry.dispose();
    this.#water.geometry.dispose();
    (this.#bodyCore.geometry as BufferGeometry).dispose();
    (this.#bodyGlow.geometry as BufferGeometry).dispose();
    this.#impactRing.geometry.dispose();
    this.#trailGeometry.dispose();
    for (const bead of this.#trail) (bead.material as MeshBasicMaterial).dispose();
    this.#dryMaterial.dispose();
    this.#wetMaterial.dispose();
    this.#waterMaterial.dispose();
    (this.#bodyCore.material as MeshBasicMaterial).dispose();
    (this.#bodyGlow.material as MeshBasicMaterial).dispose();
    (this.#bodyStreak.geometry as BufferGeometry).dispose();
    (this.#bodyStreak.material as MeshBasicMaterial).dispose();
    (this.#impactRing.material as MeshBasicMaterial).dispose();
    this.#textures.color.dispose();
    this.#textures.roughness.dispose();
    this.#renderer.dispose();
  }
}
