import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Line,
  LineBasicMaterial,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { sampleCurve, type CameraKeyframe } from "@reaper-viz/core";
import { sampleMarblePath, type MarbleImpact, type MarblePerformance, type MarbleTarget } from "@reaper-viz/compiler-marble";

export type { MarblePerformance } from "@reaper-viz/compiler-marble";

export interface MarbleTuning {
  glow: number;
  camera: number;
  targetScale: number;
  tail: number;
}

interface TargetMeshes {
  base: Mesh<BoxGeometry | CylinderGeometry, MeshStandardMaterial>;
  baseRotationZ: number;
  glow: Mesh<SphereGeometry, MeshBasicLike>;
}

type MeshBasicLike = MeshStandardMaterial | MeshPhysicalMaterial;

interface SvgTarget {
  group: SVGGElement;
  base: SVGElement;
  glow: SVGCircleElement;
  baseTransform: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hexNumber(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function worldToScreen(pos: [number, number, number]): [number, number] {
  return [540 + pos[0] * 88 + pos[2] * 28, 960 - pos[1] * 112 + pos[2] * 14];
}

function impactEnvelope(age: number, velocity: number): number {
  if (age < -1 / 60 || age > 0.22) return 0;
  const adjusted = Math.max(0, age);
  return (1 - adjusted / 0.22) * (0.45 + velocity * 0.75);
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function sampleCamera(keys: readonly CameraKeyframe[], t: number): CameraKeyframe {
  if (!keys.length) return { t, pos: [0, 0, 14], zoom: 1, anchor: [0.5, 0.5], ease: "smoothstep" };
  const first = keys[0]!;
  if (t <= first.t) return first;
  const last = keys[keys.length - 1]!;
  if (t >= last.t) return last;
  const nextIndex = keys.findIndex((key) => key.t >= t);
  const to = keys[nextIndex]!;
  const from = keys[Math.max(0, nextIndex - 1)]!;
  const raw = clamp((t - from.t) / Math.max(0.001, to.t - from.t), 0, 1);
  const mix = from.ease === "smoothstep" || to.ease === "smoothstep" ? smoothstep(raw) : raw;
  const sampled: CameraKeyframe = {
    t,
    pos: [
      from.pos[0] + (to.pos[0] - from.pos[0]) * mix,
      from.pos[1] + (to.pos[1] - from.pos[1]) * mix,
      from.pos[2] + (to.pos[2] - from.pos[2]) * mix,
    ],
    zoom: from.zoom + (to.zoom - from.zoom) * mix,
  };
  const anchor = to.anchor ?? from.anchor;
  if (anchor) sampled.anchor = anchor;
  const ease = to.ease ?? from.ease;
  if (ease) sampled.ease = ease;
  return sampled;
}

function makeNoiseTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const image = context.createImageData(canvas.width, canvas.height);
    for (let index = 0; index < image.data.length; index += 4) {
      const value = 32 + ((index * 17 + Math.floor(index / 11) * 29) % 34);
      image.data[index] = value;
      image.data[index + 1] = value + 6;
      image.data[index + 2] = value + 12;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material as Material & Record<string, unknown>)) {
    if (value instanceof Texture) value.dispose();
  }
  material.dispose();
}

function createCompatibleWebGlContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const context = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!context) throw new Error("Marble Music requires WebGL2 support");
  const originalGetParameter = context.getParameter.bind(context);
  context.getParameter = ((parameter: number) => {
    const value = originalGetParameter(parameter);
    if (value !== null && value !== undefined) return value;
    if (parameter === context.VERSION) return "WebGL 2.0";
    if (parameter === context.SHADING_LANGUAGE_VERSION) return "WebGL GLSL ES 3.00";
    if (parameter === context.VENDOR) return "Chromium";
    if (parameter === context.RENDERER) return "WebGL";
    if (parameter === context.MAX_COMBINED_TEXTURE_IMAGE_UNITS) return 16;
    if (parameter === context.MAX_TEXTURE_IMAGE_UNITS) return 8;
    if (parameter === context.MAX_VERTEX_TEXTURE_IMAGE_UNITS) return 4;
    if (parameter === context.MAX_TEXTURE_SIZE) return 4096;
    if (parameter === context.MAX_CUBE_MAP_TEXTURE_SIZE) return 4096;
    if (parameter === context.MAX_VERTEX_ATTRIBS) return 16;
    if (parameter === context.MAX_VERTEX_UNIFORM_VECTORS) return 1024;
    if (parameter === context.MAX_FRAGMENT_UNIFORM_VECTORS) return 1024;
    if (parameter === context.MAX_VARYING_VECTORS) return 8;
    if (parameter === context.VIEWPORT) return [0, 0, canvas.width || 1080, canvas.height || 1920];
    if (parameter === context.SCISSOR_BOX) return [0, 0, canvas.width || 1080, canvas.height || 1920];
    return value;
  }) as typeof context.getParameter;
  const originalPrecision = context.getShaderPrecisionFormat.bind(context);
  context.getShaderPrecisionFormat = ((shaderType: number, precisionType: number) => {
    return originalPrecision(shaderType, precisionType) ?? { rangeMin: 127, rangeMax: 127, precision: 23 };
  }) as typeof context.getShaderPrecisionFormat;
  const originalAttributes = context.getContextAttributes.bind(context);
  context.getContextAttributes = (() => {
    return originalAttributes() ?? {
      alpha: false,
      antialias: true,
      depth: true,
      desynchronized: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: "default",
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false,
    };
  }) as typeof context.getContextAttributes;
  const originalProgramInfoLog = context.getProgramInfoLog.bind(context);
  context.getProgramInfoLog = ((program: WebGLProgram) => originalProgramInfoLog(program) ?? "") as typeof context.getProgramInfoLog;
  const originalShaderInfoLog = context.getShaderInfoLog.bind(context);
  context.getShaderInfoLog = ((shader: WebGLShader) => originalShaderInfoLog(shader) ?? "") as typeof context.getShaderInfoLog;
  return context;
}

function targetGeometry(target: MarbleTarget): BoxGeometry | CylinderGeometry {
  if (target.kind === "peg" || target.kind === "chime") {
    return new CylinderGeometry(target.size[1] * 0.9, target.size[1] * 0.9, target.size[0], 18);
  }
  return new BoxGeometry(target.size[0], target.size[1], target.size[2]);
}

function targetMaterial(target: MarbleTarget): MeshStandardMaterial {
  const color = hexNumber(target.color);
  if (target.material === "brass") return new MeshStandardMaterial({ color: 0xd6a63e, metalness: 0.72, roughness: 0.28 });
  if (target.material === "rubber") return new MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.72 });
  if (target.material === "glow") return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.24, metalness: 0.18, roughness: 0.32 });
  return new MeshStandardMaterial({ color, metalness: 0.42, roughness: 0.36 });
}

export class MarbleScene {
  readonly backendKind = "three";
  readonly tuning: MarbleTuning = { glow: 0.86, camera: 1, targetScale: 1, tail: 0.8 };
  readonly #performance: MarblePerformance;
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera: PerspectiveCamera;
  readonly #targetMeshes = new Map<string, TargetMeshes>();
  readonly #impactByTarget = new Map<string, MarbleImpact[]>();
  readonly #machine = new Group();
  readonly #marble: Mesh<SphereGeometry, MeshPhysicalMaterial>;
  readonly #marbleGlow: PointLight;
  readonly #pathLine: Line<BufferGeometry, LineBasicMaterial>;
  readonly #svg: SVGSVGElement;
  readonly #svgTargets = new Map<string, SvgTarget>();
  readonly #svgMarble: SVGGElement;
  readonly #svgMarbleGlow: SVGCircleElement;
  readonly #svgMarbleCore: SVGCircleElement;
  #disposed = false;

  constructor(canvas: HTMLCanvasElement, performance: MarblePerformance) {
    this.#performance = performance;
    this.#renderer = new WebGLRenderer({ canvas, context: createCompatibleWebGlContext(canvas), antialias: true, alpha: false });
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.setPixelRatio(1);
    this.#renderer.outputColorSpace = SRGBColorSpace;
    const svgOverlay = this.#createSvgOverlay(canvas);
    this.#svg = svgOverlay.svg;
    this.#svgMarble = svgOverlay.marble;
    this.#svgMarbleGlow = svgOverlay.marbleGlow;
    this.#svgMarbleCore = svgOverlay.marbleCore;
    this.#scene.background = new Color(0x08111d);
    this.#camera = new PerspectiveCamera(32, performance.resolution.w / performance.resolution.h, 0.1, 100);
    this.#camera.position.set(0, 0, 15);
    this.#scene.add(new AmbientLight(0x9bbcff, 0.55));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(-4, 8, 8);
    this.#scene.add(key);
    const fill = new DirectionalLight(0x70d9ff, 0.7);
    fill.position.set(5, -3, 5);
    this.#scene.add(fill);
    this.#scene.add(this.#machine);
    this.#addWall();
    this.#addTargets();
    this.#addRods();
    this.#pathLine = this.#makePathLine();
    this.#machine.add(this.#pathLine);
    this.#marble = new Mesh(
      new SphereGeometry(0.28, 36, 20),
      new MeshPhysicalMaterial({ color: 0xf5fcff, roughness: 0.08, metalness: 0.05, transmission: 0.2, thickness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 }),
    );
    this.#marbleGlow = new PointLight(0x8df5ff, 1.1, 3.2);
    this.#machine.add(this.#marble, this.#marbleGlow);
  }

  #createSvgOverlay(canvas: HTMLCanvasElement): { svg: SVGSVGElement; marble: SVGGElement; marbleGlow: SVGCircleElement; marbleCore: SVGCircleElement } {
    const parent = canvas.parentElement;
    parent?.querySelectorAll(".marble-svg-overlay").forEach((entry) => entry.remove());

    const svg = svgElement("svg");
    svg.classList.add("marble-svg-overlay");
    svg.setAttribute("viewBox", "0 0 1080 1920");
    svg.setAttribute("aria-hidden", "true");
    Object.assign(svg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "1",
    });

    const defs = svgElement("defs");
    const glowFilter = svgElement("filter");
    glowFilter.id = "marble-svg-glow";
    glowFilter.setAttribute("x", "-80%");
    glowFilter.setAttribute("y", "-80%");
    glowFilter.setAttribute("width", "260%");
    glowFilter.setAttribute("height", "260%");
    const blur = svgElement("feGaussianBlur");
    blur.setAttribute("stdDeviation", "10");
    blur.setAttribute("result", "blur");
    const merge = svgElement("feMerge");
    const blurNode = svgElement("feMergeNode");
    blurNode.setAttribute("in", "blur");
    const sourceNode = svgElement("feMergeNode");
    sourceNode.setAttribute("in", "SourceGraphic");
    merge.append(blurNode, sourceNode);
    glowFilter.append(blur, merge);
    defs.append(glowFilter);
    svg.append(defs);

    const wall = svgElement("rect");
    wall.setAttribute("x", "18");
    wall.setAttribute("y", "18");
    wall.setAttribute("width", "1044");
    wall.setAttribute("height", "1884");
    wall.setAttribute("rx", "34");
    wall.setAttribute("fill", "#0b1728");
    wall.setAttribute("stroke", "#29415b");
    wall.setAttribute("stroke-width", "2");
    wall.setAttribute("opacity", "0.94");
    svg.append(wall);

    const path = svgElement("polyline");
    path.setAttribute("points", this.#performance.statics.targets.map((target) => worldToScreen(target.pos).join(",")).join(" "));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#7de7ff");
    path.setAttribute("stroke-width", "5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("opacity", "0.35");
    path.setAttribute("filter", "url(#marble-svg-glow)");
    svg.append(path);

    for (const target of this.#performance.statics.targets) {
      const [x, y] = worldToScreen(target.pos);
      const group = svgElement("g");
      const baseTransform = `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(target.rotation[2] * 57.2958).toFixed(2)})`;
      group.setAttribute("transform", baseTransform);
      const glow = svgElement("circle");
      glow.setAttribute("r", "44");
      glow.setAttribute("fill", target.color);
      glow.setAttribute("opacity", "0.08");
      glow.setAttribute("filter", "url(#marble-svg-glow)");
      const base = target.kind === "peg" || target.kind === "chime" ? svgElement("circle") : svgElement("rect");
      if (base instanceof SVGCircleElement) {
        base.setAttribute("r", target.kind === "chime" ? "19" : "14");
      } else {
        const width = Math.max(42, target.size[0] * 88);
        const height = Math.max(16, target.size[2] * 52);
        base.setAttribute("x", String(-width / 2));
        base.setAttribute("y", String(-height / 2));
        base.setAttribute("width", String(width));
        base.setAttribute("height", String(height));
        base.setAttribute("rx", "8");
      }
      base.setAttribute("fill", target.material === "brass" ? "#d6a63e" : target.color);
      base.setAttribute("stroke", "#dff8ff");
      base.setAttribute("stroke-width", "2");
      base.setAttribute("opacity", "0.92");
      group.append(glow, base);
      svg.append(group);
      this.#svgTargets.set(target.id, { group, base, glow, baseTransform });
    }

    const marble = svgElement("g");
    marble.setAttribute("filter", "url(#marble-svg-glow)");
    const marbleGlow = svgElement("circle");
    marbleGlow.setAttribute("r", "54");
    marbleGlow.setAttribute("fill", "#91f5ff");
    marbleGlow.setAttribute("opacity", "0.22");
    const marbleCore = svgElement("circle");
    marbleCore.setAttribute("r", "28");
    marbleCore.setAttribute("fill", "#f5fcff");
    marbleCore.setAttribute("stroke", "#7de7ff");
    marbleCore.setAttribute("stroke-width", "5");
    const marbleShine = svgElement("circle");
    marbleShine.setAttribute("cx", "-9");
    marbleShine.setAttribute("cy", "-11");
    marbleShine.setAttribute("r", "9");
    marbleShine.setAttribute("fill", "#ffffff");
    marbleShine.setAttribute("opacity", "0.72");
    marble.append(marbleGlow, marbleCore, marbleShine);
    svg.append(marble);

    parent?.append(svg);
    return { svg, marble, marbleGlow, marbleCore };
  }

  #addWall(): void {
    const texture = makeNoiseTexture();
    const wall = new Mesh(
      new PlaneGeometry(9.2, 16.2, 1, 1),
      new MeshStandardMaterial({ color: 0x182536, roughness: 0.88, metalness: 0.02, map: texture }),
    );
    wall.position.set(0, 0, -0.42);
    this.#machine.add(wall);
  }

  #addTargets(): void {
    for (const impact of this.#performance.statics.impacts) {
      const list = this.#impactByTarget.get(impact.targetId) ?? [];
      list.push(impact);
      this.#impactByTarget.set(impact.targetId, list);
    }
    for (const target of this.#performance.statics.targets) {
      const base = new Mesh(targetGeometry(target), targetMaterial(target));
      base.position.set(...target.pos);
      base.rotation.set(target.rotation[0], target.rotation[1], target.rotation[2]);
      if (target.kind === "peg" || target.kind === "chime") base.rotation.z += Math.PI / 2;
      const glowMaterial = new MeshStandardMaterial({ color: hexNumber(target.color), emissive: hexNumber(target.color), emissiveIntensity: 0, transparent: true, opacity: 0 });
      const glow = new Mesh(new SphereGeometry(0.42, 20, 12), glowMaterial);
      glow.position.copy(base.position);
      glow.scale.setScalar(1);
      this.#targetMeshes.set(target.id, { base, baseRotationZ: base.rotation.z, glow });
      this.#machine.add(base, glow);
    }
  }

  #addRods(): void {
    const targets = this.#performance.statics.targets;
    const rodMaterial = new MeshStandardMaterial({ color: 0x1b1d23, metalness: 0.75, roughness: 0.26 });
    for (const target of targets) {
      const rod = new Mesh(new CylinderGeometry(0.026, 0.026, 0.86, 10), rodMaterial);
      rod.position.set(target.pos[0] - 0.44, target.pos[1] - 0.18, target.pos[2] - 0.18);
      rod.rotation.z = Math.PI / 2 + target.rotation[2] * 0.45;
      this.#machine.add(rod);
    }
  }

  #makePathLine(): Line<BufferGeometry, LineBasicMaterial> {
    const points = this.#performance.statics.targets.map((target) => new Vector3(target.pos[0], target.pos[1], target.pos[2] - 0.16));
    const geometry = new BufferGeometry().setFromPoints(points);
    const material = new LineBasicMaterial({ color: 0x7ddcff, transparent: true, opacity: 0.22 });
    return new Line(geometry, material);
  }

  #targetIntensity(targetId: string, t: number): number {
    const impacts = this.#impactByTarget.get(targetId) ?? [];
    let intensity = 0;
    for (const impact of impacts) intensity = Math.max(intensity, impactEnvelope(t - impact.t, impact.velocity));
    if (this.#performance.statics.tail.resonanceTargets.includes(targetId) && this.#performance.statics.tail.hasAudibleTail) {
      const tail = this.#performance.statics.tail;
      const progress = clamp((t - tail.finalNoteT) / Math.max(0.001, tail.audioEndT - tail.finalNoteT), 0, 1);
      const energyCurve = this.#performance.curves.energy;
      const energy = energyCurve ? sampleCurve(energyCurve, t) : 0.35;
      intensity = Math.max(intensity, (1 - progress) * energy * this.tuning.tail * 0.55);
    }
    return intensity * this.tuning.glow;
  }

  #renderSvg(t: number, pose: ReturnType<typeof sampleMarblePath>, pulse: number): void {
    const [x, y] = worldToScreen([pose.pos[0], pose.pos[1], pose.pos[2] + 0.42]);
    this.#svgMarble.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(t * 210).toFixed(2)}) scale(${(1 + pulse * 0.18).toFixed(3)})`);
    this.#svgMarbleGlow.setAttribute("opacity", String(clamp(0.26 + pulse * 0.48, 0.18, 0.85)));
    this.#svgMarbleCore.setAttribute("stroke-width", String(5 + pulse * 8));
    for (const [targetId, target] of this.#svgTargets) {
      const intensity = this.#targetIntensity(targetId, t);
      target.group.setAttribute("opacity", String(clamp(0.72 + intensity * 0.3, 0.65, 1)));
      target.group.setAttribute("transform", target.baseTransform);
      target.glow.setAttribute("r", String(44 + intensity * 24));
      target.glow.setAttribute("opacity", String(clamp(0.08 + intensity * 0.58, 0.06, 0.78)));
      target.base.setAttribute("stroke-width", String(2 + intensity * 4));
    }
  }

  renderFrame(t: number): void {
    if (this.#disposed) return;
    const pose = sampleMarblePath(this.#performance.statics.path, t);
    this.#marble.position.set(pose.pos[0], pose.pos[1], pose.pos[2] + 0.42);
    this.#marble.rotation.set(t * 3.2, t * 1.7, -t * 2.4);
    const currentImpact = this.#performance.statics.impacts.reduce((best, impact) => {
      const age = Math.abs(t - impact.t);
      return age < best.age ? { age, impact } : best;
    }, { age: Number.POSITIVE_INFINITY, impact: undefined as MarbleImpact | undefined }).impact;
    const pulse = currentImpact ? impactEnvelope(t - currentImpact.t, currentImpact.velocity) : 0;
    this.#renderSvg(t, pose, pulse);
    this.#marble.scale.setScalar(1 + pulse * 0.16);
    this.#marbleGlow.position.copy(this.#marble.position);
    this.#marbleGlow.intensity = 0.6 + pulse * 2.4;
    for (const [targetId, meshes] of this.#targetMeshes) {
      const intensity = this.#targetIntensity(targetId, t);
      meshes.base.scale.setScalar(this.tuning.targetScale * (1 + intensity * 0.1));
      meshes.base.rotation.z = meshes.baseRotationZ + Math.sin(t * 20 + targetId.length) * intensity * 0.08;
      meshes.glow.material.opacity = clamp(intensity * 0.42, 0, 0.5);
      meshes.glow.material.emissiveIntensity = intensity * 1.8;
      meshes.glow.scale.setScalar(0.9 + intensity * 1.2);
    }
    const cameraKey = sampleCamera(this.#performance.camera, t);
    const cameraLift = Math.sin(t * 0.33) * 0.08 * this.tuning.camera;
    this.#camera.position.set(cameraKey.pos[0] + pose.pos[0] * 0.08, cameraKey.pos[1] + pose.pos[1] * 0.04 + cameraLift, cameraKey.pos[2] - this.tuning.camera * 0.34);
    this.#camera.zoom = cameraKey.zoom * this.tuning.camera;
    this.#camera.updateProjectionMatrix();
    this.#camera.lookAt(cameraKey.pos[0] * 0.22 + pose.pos[0] * 0.16, cameraKey.pos[1] * 0.32 + pose.pos[1] * 0.12, 0);
    this.#renderer.render(this.#scene, this.#camera);
  }

  destroy(): void {
    this.#disposed = true;
    this.#svg.remove();
    this.#scene.traverse((object: Object3D) => {
      const mesh = object as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => disposeMaterial(entry));
      else if (material) disposeMaterial(material);
    });
    this.#renderer.dispose();
  }
}
