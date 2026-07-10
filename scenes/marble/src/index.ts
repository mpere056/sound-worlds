import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CubicBezierCurve3,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
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
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { sampleCurve } from "@reaper-viz/core";
import { sampleMarblePose, type MarbleImpact, type MarblePathSegment, type MarblePerformance, type MarblePose, type MarbleTarget } from "@reaper-viz/compiler-marble";

export type { MarblePerformance } from "@reaper-viz/compiler-marble";

export interface MarbleTuning {
  glow: number;
  camera: number;
  targetScale: number;
  tail: number;
}

export interface MarbleCameraPose {
  position: [number, number, number];
  lookAt: [number, number, number];
  zoom: number;
}

export interface MarbleSceneProfileSnapshot {
  rendererIdentity: number;
  performanceUpdates: number;
  rendererMemory: { geometries: number; textures: number };
  rendererRender: { calls: number; triangles: number; points: number; lines: number };
  programs: number;
  sceneObjects: number;
  targetGroups: number;
  railObjects: number;
  svgOverlays: number;
}

interface TargetMeshes {
  group: Group;
  base: Mesh<BoxGeometry | CylinderGeometry, MeshStandardMaterial>;
  home: Vector3;
  baseRotation: [number, number, number];
  glow: Mesh<SphereGeometry, MeshBasicLike>;
  shadow: Mesh<CircleGeometry, MeshBasicMaterial>;
  hardware: Group;
}

type MeshBasicLike = MeshStandardMaterial | MeshPhysicalMaterial;

interface SvgTarget {
  group: SVGGElement;
  base: SVGElement;
  glow: SVGCircleElement;
  baseTransform: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";
let nextRendererIdentity = 1;

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

function dampedResponse(age: number, velocity: number): number {
  if (age < -1 / 90 || age > 0.55) return 0;
  const t = Math.max(0, age);
  const zeta = 0.56;
  const omega0 = 25;
  const decay = Math.exp(-zeta * omega0 * t);
  const wobble = Math.sin(omega0 * Math.sqrt(1 - zeta * zeta) * t);
  return decay * wobble * (0.08 + velocity * 0.18);
}

export function sampleMarbleCamera(path: readonly MarblePathSegment[], t: number, cameraTuning: number): MarbleCameraPose {
  const offsets = [-0.24, -0.12, 0, 0.12, 0.24] as const;
  const weights = [1, 2, 3, 2, 1] as const;
  const focus = new Vector3();
  for (let index = 0; index < offsets.length; index += 1) {
    const sample = sampleMarblePose(path, t + offsets[index]!);
    focus.add(new Vector3(...sample.pos).multiplyScalar(weights[index]!));
  }
  focus.multiplyScalar(1 / weights.reduce((sum, weight) => sum + weight, 0));
  const behind = sampleMarblePose(path, t - 0.18).pos;
  const ahead = sampleMarblePose(path, t + 0.18).pos;
  const lead = new Vector3(ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]).multiplyScalar(0.08);
  const routeDepths = path.flatMap((segment) => [segment.from[2], segment.to[2]]);
  const routeDepthCenter = routeDepths.length ? (Math.min(...routeDepths) + Math.max(...routeDepths)) / 2 : 0;
  const cameraLift = Math.sin(t * 0.33) * 0.04 * cameraTuning;
  const orbit = Math.sin(t * 0.21) * 0.035 * cameraTuning;
  const distance = 8 - (cameraTuning - 0.88) * 0.45;
  const depthOffset = focus.z - routeDepthCenter;
  return {
    position: [focus.x + 0.55 + orbit, focus.y + cameraLift + 12, routeDepthCenter + distance + depthOffset * 0.72],
    lookAt: [focus.x + lead.x, focus.y - 0.42 + lead.y * 0.3, routeDepthCenter + depthOffset * 0.88 + lead.z * 0.08],
    zoom: clamp(1.16 + (cameraTuning - 0.88) * 0.08, 1.08, 1.26),
  };
}

function v3(value: [number, number, number], zOffset = 0): Vector3 {
  return new Vector3(value[0], value[1], value[2] + zOffset);
}

function railSideAt(points: readonly Vector3[], index: number): Vector3 {
  const previous = points[Math.max(0, index - 1)] ?? points[index]!;
  const next = points[Math.min(points.length - 1, index + 1)] ?? points[index]!;
  const tangent = next.clone().sub(previous);
  const side = new Vector3(-tangent.y, tangent.x, 0);
  if (side.lengthSq() < 0.0001) return new Vector3(1, 0, 0);
  return side.normalize();
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

function addTargetHardware(target: MarbleTarget, group: Group): Group {
  const hardware = new Group();
  const darkMetal = new MeshStandardMaterial({ color: 0x1d232b, metalness: 0.82, roughness: 0.23 });
  const screwMetal = new MeshStandardMaterial({ color: 0xdcecf4, metalness: 0.66, roughness: 0.18 });
  const accent = new MeshStandardMaterial({ color: hexNumber(target.color), emissive: hexNumber(target.color), emissiveIntensity: 0.16, metalness: 0.22, roughness: 0.3, transparent: true, opacity: 0.8 });
  const backplate = new Mesh(new BoxGeometry(target.size[0] * 1.1, Math.max(0.035, target.size[1] * 0.35), target.size[2] * 1.16), darkMetal);
  backplate.position.set(0, -target.size[1] * 0.58, -0.07);
  hardware.add(backplate);

  if (target.kind === "peg" || target.kind === "chime") {
    const cap = new Mesh(new SphereGeometry(target.size[1] * 1.15, 18, 10), accent);
    cap.position.set(0, 0.03, 0.02);
    hardware.add(cap);
    const collar = new Mesh(new CylinderGeometry(target.size[1] * 1.22, target.size[1] * 1.22, 0.035, 18), screwMetal);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0, -0.025);
    hardware.add(collar);
  } else {
    const screwOffsetX = target.size[0] * 0.38;
    const screwOffsetZ = target.size[2] * 0.32;
    for (const [x, z] of [[-screwOffsetX, -screwOffsetZ], [screwOffsetX, -screwOffsetZ], [-screwOffsetX, screwOffsetZ], [screwOffsetX, screwOffsetZ]] as const) {
      const screw = new Mesh(new CylinderGeometry(0.045, 0.045, 0.025, 16), screwMetal.clone());
      screw.rotation.x = Math.PI / 2;
      screw.position.set(x, target.size[1] * 0.72, z);
      hardware.add(screw);
      const slot = new Mesh(new BoxGeometry(0.062, 0.01, 0.012), darkMetal.clone());
      slot.position.set(x, target.size[1] * 0.737, z);
      slot.rotation.y = (x + z) > 0 ? 0.6 : -0.6;
      hardware.add(slot);
    }
  }

  const compact = target.kind === "peg" || target.kind === "chime";
  const bracketLength = compact ? 0.18 : 0.52;
  const bracket = new Mesh(new CylinderGeometry(0.018, 0.018, bracketLength, 8), darkMetal.clone());
  bracket.rotation.z = Math.PI / 2;
  bracket.position.set(-target.size[0] * 0.55, compact ? -0.08 : -0.2, compact ? -0.12 : -0.22);
  hardware.add(bracket);
  group.add(hardware);
  return hardware;
}

export class MarbleScene {
  readonly backendKind = "three";
  readonly tuning: MarbleTuning;
  #performance: MarblePerformance;
  readonly #renderer: WebGLRenderer;
  readonly #rendererIdentity = nextRendererIdentity++;
  readonly #scene = new Scene();
  readonly #camera: PerspectiveCamera;
  readonly #targetMeshes = new Map<string, TargetMeshes>();
  readonly #impactByTarget = new Map<string, MarbleImpact[]>();
  readonly #machine = new Group();
  readonly #performanceObjects = new Group();
  readonly #rails = new Group();
  readonly #marble: Mesh<SphereGeometry, MeshPhysicalMaterial>;
  readonly #marbleGlow: PointLight;
  readonly #marbleShadow: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly #svg: SVGSVGElement;
  readonly #svgTargetLayer: SVGGElement;
  readonly #svgTargets = new Map<string, SvgTarget>();
  readonly #svgMarble: SVGGElement;
  readonly #svgMarbleGlow: SVGCircleElement;
  readonly #svgMarbleCore: SVGCircleElement;
  #disposed = false;
  #performanceUpdates = 0;

  constructor(canvas: HTMLCanvasElement, performance: MarblePerformance, tuning?: MarbleTuning) {
    this.tuning = tuning ?? { glow: 0.78, camera: 0.88, targetScale: 1, tail: 0.8 };
    this.#performance = performance;
    this.#renderer = new WebGLRenderer({ canvas, context: createCompatibleWebGlContext(canvas), antialias: true, alpha: false });
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#renderer.setPixelRatio(1);
    this.#renderer.outputColorSpace = SRGBColorSpace;
    const svgOverlay = this.#createSvgOverlay(canvas);
    this.#svg = svgOverlay.svg;
    this.#svgTargetLayer = svgOverlay.targetLayer;
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
    this.#machine.add(this.#performanceObjects);
    this.#addTargets();
    this.#addRods();
    this.#addRails();
    this.#marble = new Mesh(
      new SphereGeometry(0.28, 36, 20),
      new MeshPhysicalMaterial({ color: 0xf5fcff, roughness: 0.08, metalness: 0.05, transmission: 0.2, thickness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 }),
    );
    this.#marbleShadow = new Mesh(
      new CircleGeometry(0.36, 36),
      new MeshBasicMaterial({ color: 0x02080f, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.#marbleGlow = new PointLight(0x8df5ff, 1.1, 3.2);
    this.#machine.add(this.#marbleShadow, this.#marble, this.#marbleGlow);
  }

  #createSvgOverlay(canvas: HTMLCanvasElement): { svg: SVGSVGElement; targetLayer: SVGGElement; marble: SVGGElement; marbleGlow: SVGCircleElement; marbleCore: SVGCircleElement } {
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
      display: "none",
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

    const targetLayer = svgElement("g");
    targetLayer.classList.add("marble-svg-targets");
    svg.append(targetLayer);
    this.#addSvgTargets(targetLayer);

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
    return { svg, targetLayer, marble, marbleGlow, marbleCore };
  }

  #addSvgTargets(targetLayer = this.#svgTargetLayer): void {
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
      targetLayer.append(group);
      this.#svgTargets.set(target.id, { group, base, glow, baseTransform });
    }
  }

  #addWall(): void {
    const texture = makeNoiseTexture();
    const wall = new Mesh(
      new PlaneGeometry(9.2, 16.2, 1, 1),
      new MeshStandardMaterial({ color: 0x182536, roughness: 0.88, metalness: 0.02, map: texture }),
    );
    wall.position.set(0, 0, -0.42);
    this.#machine.add(wall);
    const frameMaterial = new MeshStandardMaterial({ color: 0x263748, metalness: 0.34, roughness: 0.42 });
    const top = new Mesh(new BoxGeometry(9.5, 0.08, 0.16), frameMaterial.clone());
    top.position.set(0, 8.18, -0.34);
    const bottom = new Mesh(new BoxGeometry(9.5, 0.08, 0.16), frameMaterial.clone());
    bottom.position.set(0, -8.18, -0.34);
    const left = new Mesh(new BoxGeometry(0.08, 16.4, 0.16), frameMaterial.clone());
    left.position.set(-4.72, 0, -0.34);
    const right = new Mesh(new BoxGeometry(0.08, 16.4, 0.16), frameMaterial.clone());
    right.position.set(4.72, 0, -0.34);
    this.#machine.add(top, bottom, left, right);
  }

  #addTargets(): void {
    for (const impact of this.#performance.statics.impacts) {
      const list = this.#impactByTarget.get(impact.targetId) ?? [];
      list.push(impact);
      this.#impactByTarget.set(impact.targetId, list);
    }
    for (const target of this.#performance.statics.targets) {
      const group = new Group();
      group.position.set(...target.pos);
      group.rotation.set(target.rotation[0], target.rotation[1], target.rotation[2]);
      const base = new Mesh(targetGeometry(target), targetMaterial(target));
      if (target.kind === "peg" || target.kind === "chime") base.rotation.z += Math.PI / 2;
      const hardware = addTargetHardware(target, group);
      group.add(base);
      const glowMaterial = new MeshStandardMaterial({ color: hexNumber(target.color), emissive: hexNumber(target.color), emissiveIntensity: 0, transparent: true, opacity: 0 });
      const glow = new Mesh(new SphereGeometry(0.42, 20, 12), glowMaterial);
      glow.position.copy(group.position);
      glow.scale.setScalar(1);
      const shadow = new Mesh(
        new CircleGeometry(0.42, 28),
        new MeshBasicMaterial({ color: 0x020813, transparent: true, opacity: 0.2, depthWrite: false }),
      );
      shadow.position.set(target.pos[0] - 0.08, target.pos[1] - 0.1, -0.405);
      shadow.scale.set(1.4, 0.46, 1);
      this.#targetMeshes.set(target.id, { group, base, home: group.position.clone(), baseRotation: [group.rotation.x, group.rotation.y, group.rotation.z], glow, shadow, hardware });
      this.#performanceObjects.add(shadow, group, glow);
    }
  }

  #addRods(): void {
    const targets = this.#performance.statics.targets;
    const rodMaterial = new MeshStandardMaterial({ color: 0x1b1d23, metalness: 0.75, roughness: 0.26 });
    for (const target of targets) {
      if (target.kind === "peg" || target.kind === "chime") continue;
      const rod = new Mesh(new CylinderGeometry(0.026, 0.026, 0.86, 10), rodMaterial);
      rod.position.set(target.pos[0] - 0.44, target.pos[1] - 0.18, target.pos[2] - 0.18);
      rod.rotation.z = Math.PI / 2 + target.rotation[2] * 0.45;
      this.#performanceObjects.add(rod);
    }
  }

  #segmentPoints(segment: MarblePathSegment): Vector3[] {
    const steps = segment.kind === "arc" ? 20 : 12;
    const c0 = segment.control ? v3(segment.control, -0.18) : v3(segment.from, -0.18).lerp(v3(segment.to, -0.18), 1 / 3);
    const c1 = segment.control2 ? v3(segment.control2, -0.18) : v3(segment.from, -0.18).lerp(v3(segment.to, -0.18), 2 / 3);
    const curve = new CubicBezierCurve3(v3(segment.from, -0.18), c0, c1, v3(segment.to, -0.18));
    const points: Vector3[] = [];
    for (let index = 0; index <= steps; index += 1) {
      const raw = index / steps;
      const point = curve.getPoint(raw);
      if (segment.kind === "arc") {
        const lift = Math.sin(raw * Math.PI) * (segment.arcHeight ?? 0.32);
        point.y += lift;
        point.z += lift * 0.34;
      }
      points.push(point);
    }
    return points;
  }

  #addRails(): void {
    const railMaterial = new MeshStandardMaterial({ color: 0x75c5d0, emissive: 0x0e2c36, emissiveIntensity: 0.12, metalness: 0.54, roughness: 0.38, transparent: true, opacity: 0.62 });
    const supportMaterial = new MeshStandardMaterial({ color: 0x151a20, metalness: 0.8, roughness: 0.26 });
    const tieMaterial = new MeshStandardMaterial({ color: 0x24323b, metalness: 0.38, roughness: 0.45 });
    for (const segment of this.#performance.statics.path) {
      if (segment.kind !== "rail") continue;
      const points = this.#segmentPoints(segment);
      if (points.length < 2) continue;
      const railGap = 0.115;
      const leftPoints = points.map((point, index) => point.clone().add(railSideAt(points, index).multiplyScalar(railGap)));
      const rightPoints = points.map((point, index) => point.clone().add(railSideAt(points, index).multiplyScalar(-railGap)));
      for (const sidePoints of [leftPoints, rightPoints]) {
        const curve = new CatmullRomCurve3(sidePoints, false, "centripetal", 0.35);
        const tube = new Mesh(new TubeGeometry(curve, Math.max(8, sidePoints.length * 3), 0.018, 8, false), railMaterial.clone());
        this.#rails.add(tube);
      }
      const tieStep = 4;
      for (let index = 1; index < points.length - 1; index += tieStep) {
        const point = points[index]!;
        const side = railSideAt(points, index);
        const tie = new Mesh(new CylinderGeometry(0.012, 0.012, railGap * 2.42, 6), tieMaterial.clone());
        tie.position.copy(point);
        tie.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), side);
        this.#rails.add(tie);
      }
      const supportIndexes = Array.from(new Set([0, Math.floor(points.length / 2), points.length - 1]));
      for (const index of supportIndexes) {
        const point = points[index]!;
        const supportLength = Math.max(0.18, point.z + 0.42);
        const support = new Mesh(new CylinderGeometry(0.016, 0.016, supportLength, 8), supportMaterial.clone());
        support.position.set(point.x, point.y, (point.z - 0.42) / 2);
        support.rotation.x = Math.PI / 2;
        this.#rails.add(support);
        const collar = new Mesh(new CylinderGeometry(0.038, 0.038, 0.018, 12), supportMaterial.clone());
        collar.position.copy(point);
        collar.rotation.x = Math.PI / 2;
        this.#rails.add(collar);
      }
    }
    this.#performanceObjects.add(this.#rails);
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

  #targetRecoil(targetId: string, t: number): number {
    const impacts = this.#impactByTarget.get(targetId) ?? [];
    let response = 0;
    for (const impact of impacts) response += dampedResponse(t - impact.t, impact.velocity);
    return clamp(response, -0.18, 0.26);
  }

  #renderSvg(t: number, pose: MarblePose, pulse: number): void {
    const [x, y] = worldToScreen(pose.pos);
    this.#svgMarble.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(pose.spin * 57.2958).toFixed(2)}) scale(${(1 + pulse * 0.18).toFixed(3)})`);
    this.#svgMarbleGlow.setAttribute("opacity", String(clamp(0.26 + pulse * 0.48, 0.18, 0.85)));
    this.#svgMarbleCore.setAttribute("stroke-width", String(5 + pulse * 8));
    for (const [targetId, target] of this.#svgTargets) {
      const intensity = this.#targetIntensity(targetId, t);
      target.group.setAttribute("opacity", String(clamp(0.72 + intensity * 0.3, 0.65, 1)));
      target.group.setAttribute("transform", target.baseTransform);
      target.glow.setAttribute("r", String(44 + intensity * 24));
      target.glow.setAttribute("opacity", String(clamp(0.06 + intensity * 0.34, 0.04, 0.48)));
      target.base.setAttribute("stroke-width", String(2 + intensity * 4));
    }
  }

  renderFrame(t: number): void {
    if (this.#disposed) return;
    const pose = sampleMarblePose(this.#performance.statics.path, t);
    this.#marble.position.set(...pose.pos);
    this.#marble.quaternion.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]);
    const shadowScale = clamp(1.25 - pose.pos[2] * 0.42, 0.46, 1.35);
    this.#marbleShadow.position.set(pose.pos[0] - 0.08, pose.pos[1] - 0.12, -0.398);
    this.#marbleShadow.scale.set(shadowScale * 1.25, shadowScale * 0.58, 1);
    this.#marbleShadow.material.opacity = clamp(0.28 - pose.pos[2] * 0.06 + (pose.contact ? 0.1 : 0), 0.06, 0.36);
    const currentImpact = this.#performance.statics.impacts.reduce((best, impact) => {
      const age = Math.abs(t - impact.t);
      return age < best.age ? { age, impact } : best;
    }, { age: Number.POSITIVE_INFINITY, impact: undefined as MarbleImpact | undefined }).impact;
    const pulse = currentImpact ? impactEnvelope(t - currentImpact.t, currentImpact.velocity) : 0;
    this.#renderSvg(t, pose, pulse);
    this.#marble.scale.setScalar(1 + pulse * 0.16);
    this.#marbleGlow.position.copy(this.#marble.position);
    this.#marbleGlow.intensity = 0.42 + pulse * 1.8;
    for (const [targetId, meshes] of this.#targetMeshes) {
      const intensity = this.#targetIntensity(targetId, t);
      const recoil = this.#targetRecoil(targetId, t);
      meshes.group.position.set(meshes.home.x, meshes.home.y, meshes.home.z + recoil);
      meshes.group.rotation.set(
        meshes.baseRotation[0] + recoil * 0.35,
        meshes.baseRotation[1] - recoil * 0.22,
        meshes.baseRotation[2] + Math.sin(t * 20 + targetId.length) * intensity * 0.08,
      );
      meshes.base.scale.set(this.tuning.targetScale * (1 + intensity * 0.08), this.tuning.targetScale * (1 - Math.max(0, recoil) * 0.18), this.tuning.targetScale * (1 + intensity * 0.05));
      meshes.hardware.scale.setScalar(1 + intensity * 0.035);
      meshes.glow.material.opacity = clamp(intensity * 0.18, 0, 0.16);
      meshes.glow.material.emissiveIntensity = intensity * 1.25;
      meshes.glow.position.set(meshes.home.x, meshes.home.y, meshes.home.z + recoil * 0.6);
      meshes.glow.scale.setScalar(0.48 + intensity * 0.45 + Math.abs(recoil) * 0.7);
      meshes.shadow.position.set(meshes.home.x - 0.08 - recoil * 0.25, meshes.home.y - 0.1 - recoil * 0.12, -0.405);
      meshes.shadow.material.opacity = clamp(0.16 + intensity * 0.1, 0.08, 0.28);
      meshes.shadow.scale.set(1.4 + Math.abs(recoil) * 2.2, 0.46 + Math.abs(recoil) * 0.42, 1);
    }
    const cameraPose = sampleMarbleCamera(this.#performance.statics.path, t, this.tuning.camera);
    this.#camera.position.set(...cameraPose.position);
    this.#camera.zoom = cameraPose.zoom;
    this.#camera.updateProjectionMatrix();
    this.#camera.lookAt(...cameraPose.lookAt);
    this.#renderer.render(this.#scene, this.#camera);
  }

  replacePerformance(performance: MarblePerformance): void {
    if (this.#disposed) return;
    this.#performanceObjects.traverse((object: Object3D) => {
      const mesh = object as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => disposeMaterial(entry));
      else if (material) disposeMaterial(material);
    });
    this.#performanceObjects.clear();
    this.#rails.clear();
    this.#targetMeshes.clear();
    this.#impactByTarget.clear();
    this.#svgTargets.clear();
    this.#svgTargetLayer.replaceChildren();

    this.#performance = performance;
    this.#renderer.setSize(performance.resolution.w, performance.resolution.h, false);
    this.#camera.aspect = performance.resolution.w / performance.resolution.h;
    this.#camera.updateProjectionMatrix();
    this.#addSvgTargets();
    this.#addTargets();
    this.#addRods();
    this.#addRails();
    this.#performanceUpdates += 1;
  }

  profileSnapshot(): MarbleSceneProfileSnapshot {
    let sceneObjects = 0;
    this.#scene.traverse(() => { sceneObjects += 1; });
    return {
      rendererIdentity: this.#rendererIdentity,
      performanceUpdates: this.#performanceUpdates,
      rendererMemory: { ...this.#renderer.info.memory },
      rendererRender: { ...this.#renderer.info.render },
      programs: this.#renderer.info.programs?.length ?? 0,
      sceneObjects,
      targetGroups: this.#targetMeshes.size,
      railObjects: this.#rails.children.length,
      svgOverlays: this.#svg.parentElement?.querySelectorAll(".marble-svg-overlay").length ?? 0,
    };
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
