import { parsePerformance, parseSong, type Song } from "@reaper-viz/core";
import type { MarbleCompileProfile, MarbleMotionMix } from "@reaper-viz/compiler-marble";
import { captureCanvasPng, exportCanvasMp4, PixiBackend, supportsCanvasMp4 } from "@reaper-viz/render";
import { MarbleScene, type MarblePerformance, type MarblePreparedTransition, type MarbleSceneActivation, type MarbleSceneProfileSnapshot, type MarbleTuning } from "@reaper-viz/scene-marble";
import { BrickBreakerScene, type BrickBreakerPerformance } from "@reaper-viz/scene-brick-breaker";
import { AuroraScene, type AuroraPerformance } from "@reaper-viz/scene-aurora";
import { PhaseglassScene, type PhaseglassDiagnostic, type PhaseglassPerformance } from "@reaper-viz/scene-phaseglass";
import { MetroScene, type MetroPerformance } from "@reaper-viz/scene-metro";
import { PaintingScene, type PaintingPerformance } from "@reaper-viz/scene-painting";
import { RunnerScene, type RunnerPerformance } from "@reaper-viz/scene-runner";
import { TestPatternScene } from "@reaper-viz/scene-testpattern";
import { Pane } from "tweakpane";
import { MarblePlannerClient } from "./marble-planner-client.js";
import { MarbleHandController, type MarbleHandCameraControl } from "./marble-hand-control.js";
import type { MarbleHandWorkerOutbound } from "./marble-hand-worker-protocol.js";
import { MarbleTransitionRouterClient } from "./marble-transition-router-client.js";
import {
  copyMarbleMotionMix,
  filterMarbleMotionMix,
  marbleMotionMixLabel,
  nextMarbleRequestDelay,
  projectMarbleMotionMix,
  type MarbleLiveMixState,
} from "./marble-live-coordinator.js";
import type { MarblePlannerSuccess } from "./marble-planner-protocol.js";
import "./styles.css";

interface ProjectSummary { id: string; name: string; durationSec: number; concepts: string[]; }
interface ActiveScene { backendKind: "pixi" | "three"; tuning: object; renderFrame(t: number): void; destroy(): void; auditFrame?(t: number): string[]; profileSnapshot?(): MarbleSceneProfileSnapshot; replacePerformance?(performance: MarblePerformance): void; }
interface BindingApi { on(event: "change", handler: () => void): BindingApi; }
interface BindingPane {
  addBinding<T extends object, K extends keyof T>(target: T, key: K, options: Record<string, unknown>): BindingApi;
  refresh(): void;
}
interface HotModule {
  dispose(callback: () => void): void;
}
interface HotImportMeta extends ImportMeta {
  readonly hot?: HotModule;
}

interface MarbleBrowserSwapProfile {
  mix: MarbleMotionMix;
  compileMs: number;
  plannerRoundTripMs: number;
  sceneReplacementMs: number;
  firstRenderMs: number;
  routePlanningMs?: number;
  compiler?: MarbleCompileProfile;
  resources?: MarbleSceneProfileSnapshot;
}

interface MarbleBrowserProfile {
  frameIntervalsMs: number[];
  renderMs: number[];
  longTasks: Array<{ durationMs: number; startTimeMs: number }>;
  swaps: MarbleBrowserSwapProfile[];
  liveState?: MarbleLiveMixState;
}

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app root");

for (const staleAudio of document.querySelectorAll("audio")) {
  staleAudio.pause();
  staleAudio.removeAttribute("src");
  staleAudio.load();
}

root.innerHTML = `
  <main class="shell">
    <aside class="panel">
      <header><div class="brand-kicker">Reaper → World</div><h1>Sound Worlds</h1><p class="lede">A deterministic preview room for music-driven worlds. Every frame answers to the song.</p></header>
      <section class="control-group"><label for="project">Project</label><select id="project"><option>Loading exports…</option></select></section>
      <section class="control-group"><label for="concept">World</label><select id="concept"><option>Loading concepts…</option></select></section>
      <section class="control-group"><div class="eyebrow">Transport</div><div class="transport"><button class="play" id="play" aria-label="Play">▶</button><span class="timecode" id="time">00:00.000 / 00:00.000</span></div><input id="scrub" aria-label="Timeline" type="range" min="0" max="1" value="0" step="0.001" /><audio id="audio" preload="auto"></audio></section>
      <section class="checks"><label class="check">Sync flash <input id="sync" type="checkbox" checked /></label><label class="check">Metro audit <input id="audit" type="checkbox" /></label><label class="check">9:16 safe area <input id="guides" type="checkbox" /></label></section>
      <section class="tuning"><div class="eyebrow">Scene tuning</div><div id="tweakpane"></div></section>
      <section class="hand-controls" id="hand-controls" hidden><div class="eyebrow">Hand control</div><div class="hand-actions"><button id="hand-toggle" type="button">Enable camera</button><span id="hand-state">Off</span></div><video id="hand-video" autoplay muted playsinline hidden></video></section>
      <section class="exports"><div class="eyebrow">Export</div><div class="export-actions"><button id="export-mp4" disabled>Render 3s MP4</button><button id="export-png">Save PNG</button></div><div class="export-progress" id="export-progress"><span></span></div><p>Preview MP4 is silent; the mastered WAV is attached in the delivery step.</p></section>
      <div class="status"><strong id="status-title">Waiting for project</strong><span id="status-detail">Analyzer output appears here automatically.</span></div>
    </aside>
    <section class="stage-wrap"><div class="stage-meta"><span id="scene-label">Loading world…</span><span>1080 × 1920 · 60 FPS</span></div><div class="frame" id="frame"><canvas id="canvas"></canvas><div class="guide" id="guide"></div><div class="sync-flash" id="flash"></div><div class="metro-audit" id="metro-audit"></div></div></section>
  </main>`;

const select = document.querySelector<HTMLSelectElement>("#project")!;
const conceptSelect = document.querySelector<HTMLSelectElement>("#concept")!;
const play = document.querySelector<HTMLButtonElement>("#play")!;
const scrub = document.querySelector<HTMLInputElement>("#scrub")!;
const timecode = document.querySelector<HTMLSpanElement>("#time")!;
const guide = document.querySelector<HTMLDivElement>("#guide")!;
const flash = document.querySelector<HTMLDivElement>("#flash")!;
const sync = document.querySelector<HTMLInputElement>("#sync")!;
const audit = document.querySelector<HTMLInputElement>("#audit")!;
const guides = document.querySelector<HTMLInputElement>("#guides")!;
const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const audioElement = document.querySelector<HTMLAudioElement>("#audio")!;
const statusTitle = document.querySelector<HTMLElement>("#status-title")!;
const statusDetail = document.querySelector<HTMLElement>("#status-detail")!;
const exportMp4 = document.querySelector<HTMLButtonElement>("#export-mp4")!;
const exportPng = document.querySelector<HTMLButtonElement>("#export-png")!;
const exportProgress = document.querySelector<HTMLDivElement>("#export-progress")!;
const sceneLabel = document.querySelector<HTMLSpanElement>("#scene-label")!;
const metroAudit = document.querySelector<HTMLDivElement>("#metro-audit")!;
const tweakpaneContainer = document.querySelector<HTMLDivElement>("#tweakpane")!;
const handControls = document.querySelector<HTMLElement>("#hand-controls")!;
const handToggle = document.querySelector<HTMLButtonElement>("#hand-toggle")!;
const handState = document.querySelector<HTMLSpanElement>("#hand-state")!;
const handVideo = document.querySelector<HTMLVideoElement>("#hand-video")!;

let backend: PixiBackend | undefined;
let scene: ActiveScene | undefined;
let song: Song | undefined;
let audio: HTMLAudioElement = audioElement;
let projects: ProjectSummary[] = [];
let currentProjectId = "";
let animationFrame = 0;
let previousBeat = -1;
let pane: Pane | undefined;
let renderFailure: string | undefined;
let marbleRebuildTimer: number | undefined;
let marbleSourceTrackId: string | undefined;
const marbleMotionMix: MarbleMotionMix = { leftRight: 20, upDown: 20, frontBack: 60 };
let previousMarbleMotionMix: MarbleMotionMix = { ...marbleMotionMix };
const marbleLiveMixState: MarbleLiveMixState = {
  desired: copyMarbleMotionMix(marbleMotionMix),
  active: copyMarbleMotionMix(marbleMotionMix),
};
const marbleTuning: MarbleTuning = { glow: 0.78, camera: 0.88, cameraOrbitYaw: 0, cameraOrbitPitch: 0, cameraOrbitDistance: 0, targetScale: 1, tail: 0.8, motionTrail: 0.72 };
const marbleHandCamera: MarbleHandCameraControl = { yaw: 0, pitch: 0, distance: 0 };
const marbleProfilingEnabled = new URLSearchParams(window.location.search).has("profileMarble");
const marbleBrowserProfile: MarbleBrowserProfile = { frameIntervalsMs: [], renderMs: [], longTasks: [], swaps: [] };
let previousAnimationFrameAt: number | undefined;
let profilePublishFrame = 0;
let marblePlannerRequestedAt = 0;
let marbleLastRequestAt = Number.NEGATIVE_INFINITY;
let pendingMarbleActivationResult: MarblePlannerSuccess | undefined;
let pendingMarbleRoutePlanningMs = 0;
let marbleResumeAfterTransition = false;
const marbleHandController = new MarbleHandController();
let marbleHandWorker: Worker | undefined;
let marbleHandStream: MediaStream | undefined;
let marbleHandFramePending = false;
let marbleHandVideoCallback: number | undefined;
let marbleHandFallbackTimer: number | undefined;
let marbleHandLastResultAt = Number.NEGATIVE_INFINITY;
let marbleHandLastCameraAt = Number.NEGATIVE_INFINITY;
let marbleHandPermissionTimer: number | undefined;
let marbleHandGeneration = 0;
const marblePlanner = new MarblePlannerClient(
  new Worker(new URL("./marble-planner.worker.ts", import.meta.url), { type: "module" }),
  {
    planned: (result) => applyPlannedMarble(result),
    failed: (error) => reportMarblePlanningFailure(error),
  },
);
const marbleTransitionRouter = new MarbleTransitionRouterClient(
  () => new Worker(new URL("./marble-transition-router.worker.ts", import.meta.url), { type: "module" }),
);

if (marbleProfilingEnabled) {
  (globalThis as typeof globalThis & { __marbleLiveProfile?: MarbleBrowserProfile }).__marbleLiveProfile = marbleBrowserProfile;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        marbleBrowserProfile.longTasks.push({ durationMs: entry.duration, startTimeMs: entry.startTime });
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // Long Task API support is optional; frame timing remains available.
  }
  publishMarbleProfile();
}

function pushBounded<T>(values: T[], value: T, limit = 2400): void {
  values.push(value);
  if (values.length > limit) values.splice(0, values.length - limit);
}

function reportPhaseglassFailure(diagnostic: PhaseglassDiagnostic): void {
  const primaryLog = diagnostic.kind === "shader"
    ? diagnostic.fragmentLog || diagnostic.programLog || diagnostic.vertexLog || "WebGL linked no runnable shader program"
    : diagnostic.kind === "context-lost"
      ? `WebGL context lost while rendering Phaseglass; error ${diagnostic.webglError}${diagnostic.statusMessage ? `; ${diagnostic.statusMessage}` : ""}`
      : `Uniformly black volume target at ${diagnostic.time.toFixed(3)}s; WebGL error ${diagnostic.webglError}; samples ${diagnostic.samples.join(",")}; notes ${diagnostic.noteCount}`;
  const summary = primaryLog.replace(/\s+/g, " ").trim().slice(0, 900);
  statusTitle.textContent = diagnostic.kind === "shader"
    ? `Phaseglass ${diagnostic.stage} shader failed`
    : diagnostic.kind === "context-lost"
      ? "Phaseglass lost the WebGL context"
      : "Phaseglass produced a black GPU frame";
  statusDetail.textContent = summary;
  renderFailure = summary;
  (globalThis as typeof globalThis & { __phaseglassDiagnostic?: PhaseglassDiagnostic }).__phaseglassDiagnostic = diagnostic;
  void fetch("/api/diagnostics/phaseglass-shader", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: currentProjectId,
      userAgent: navigator.userAgent,
      capturedAt: new Date().toISOString(),
      diagnostic,
    }),
  }).catch((error: unknown) => console.error("[Phaseglass shader diagnostic upload failed]", error));
}

function profilePercentile(values: readonly number[], amount: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * amount))] ?? 0;
}

function publishMarbleProfile(): void {
  if (!marbleProfilingEnabled) return;
  const sceneApplications = marbleBrowserProfile.swaps.map((entry) => entry.sceneReplacementMs);
  const firstRenders = marbleBrowserProfile.swaps.map((entry) => entry.firstRenderMs);
  const rendererIdentities = [...new Set(marbleBrowserProfile.swaps.flatMap((entry) => entry.resources ? [entry.resources.rendererIdentity] : []))];
  const geometryCounts = marbleBrowserProfile.swaps.flatMap((entry) => entry.resources ? [entry.resources.rendererMemory.geometries] : []);
  const programCounts = marbleBrowserProfile.swaps.flatMap((entry) => entry.resources ? [entry.resources.programs] : []);
  let output = document.querySelector<HTMLScriptElement>("#marble-live-profile");
  if (!output) {
    output = document.createElement("script");
    output.id = "marble-live-profile";
    output.type = "application/json";
    document.head.append(output);
  }
  output.textContent = JSON.stringify({
    frameCount: marbleBrowserProfile.frameIntervalsMs.length,
    frameP95Ms: profilePercentile(marbleBrowserProfile.frameIntervalsMs, 0.95),
    frameMaxMs: Math.max(0, ...marbleBrowserProfile.frameIntervalsMs),
    renderP95Ms: profilePercentile(marbleBrowserProfile.renderMs, 0.95),
    sceneApplicationP95Ms: profilePercentile(sceneApplications, 0.95),
    firstRenderP95Ms: profilePercentile(firstRenders, 0.95),
    rendererIdentities,
    geometryRange: geometryCounts.length ? [Math.min(...geometryCounts), Math.max(...geometryCounts)] : [0, 0],
    programRange: programCounts.length ? [Math.min(...programCounts), Math.max(...programCounts)] : [0, 0],
    longTasks: marbleBrowserProfile.longTasks,
    latestSwap: marbleBrowserProfile.swaps.at(-1),
    swapCount: marbleBrowserProfile.swaps.length,
    liveState: {
      desired: copyMarbleMotionMix(marbleLiveMixState.desired),
      ...(marbleLiveMixState.requested ? { requested: copyMarbleMotionMix(marbleLiveMixState.requested) } : {}),
      ...(marbleLiveMixState.planned ? { planned: copyMarbleMotionMix(marbleLiveMixState.planned) } : {}),
      active: copyMarbleMotionMix(marbleLiveMixState.active),
    },
  });
}

function marbleLiveStateDetail(): string {
  return `desired ${marbleMotionMixLabel(marbleLiveMixState.desired)} | requested ${marbleMotionMixLabel(marbleLiveMixState.requested)} | planned ${marbleMotionMixLabel(marbleLiveMixState.planned)} | active ${marbleMotionMixLabel(marbleLiveMixState.active)}`;
}

function destroyActiveScene(): void {
  scene?.destroy();
  scene = undefined;
}

function destroyPixiBackend(): void {
  backend?.destroy();
  backend = undefined;
}

async function ensurePixiBackend(): Promise<PixiBackend> {
  backend ??= await PixiBackend.create({ canvas, width: 1080, height: 1920 });
  return backend;
}

function formatTime(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sound-world";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function updateTransport(t: number): void {
  if (!song) return;
  scrub.value = String(t);
  timecode.textContent = `${formatTime(t)} / ${formatTime(song.meta.durationSec)}`;
}

function reportRenderFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown render error";
  if (message === renderFailure) return;
  renderFailure = message;
  statusTitle.textContent = "Visual render paused";
  statusDetail.textContent = message;
  console.error(error);
}

function renderAt(t: number): void {
  if (!song || !scene) return;
  const activeScene: ActiveScene = scene;
  const auditFrame = activeScene.auditFrame;
  updateTransport(t);
  try {
    const renderStartedAt = marbleProfilingEnabled ? performance.now() : 0;
    activeScene.renderFrame(t);
    const renderDurationMs = marbleProfilingEnabled ? performance.now() - renderStartedAt : 0;
    if (marbleProfilingEnabled) pushBounded(marbleBrowserProfile.renderMs, renderDurationMs);
    if (activeScene instanceof MarbleScene) reportMarbleActivation(activeScene.consumeActivation(), renderDurationMs, activeScene);
    renderFailure = undefined;
  } catch (error) {
    reportRenderFailure(error);
    return;
  }
  let beat = -1;
  for (let index = 0; index < song.grid.beats.length; index += 1) {
    if ((song.grid.beats[index] ?? Number.POSITIVE_INFINITY) > t + 1e-6) break;
    beat = index;
  }
  if (sync.checked && beat !== previousBeat && beat >= 0) {
    flash.classList.remove("active");
    requestAnimationFrame(() => flash.classList.add("active"));
  }
  previousBeat = beat;
  if (audit.checked && auditFrame) {
    metroAudit.classList.add("visible");
    metroAudit.textContent = auditFrame(t).join("\n");
  } else {
    metroAudit.classList.remove("visible");
    metroAudit.textContent = "";
  }
}

function reportMarbleActivation(activation: MarbleSceneActivation | undefined, firstRenderMs: number, activeScene: MarbleScene): void {
  if (!activation) return;
  const result = pendingMarbleActivationResult;
  pendingMarbleActivationResult = undefined;
  marbleLiveMixState.active = copyMarbleMotionMix(activation.motionMix);
  delete marbleLiveMixState.planned;
  if (marbleProfilingEnabled && result) {
    pushBounded(marbleBrowserProfile.swaps, {
      mix: { ...activation.motionMix },
      compileMs: result.compileProfile?.totalMs ?? 0,
      plannerRoundTripMs: performance.now() - marblePlannerRequestedAt,
      sceneReplacementMs: activation.applicationMs,
      firstRenderMs,
      routePlanningMs: pendingMarbleRoutePlanningMs,
      ...(result.compileProfile ? { compiler: result.compileProfile } : {}),
      resources: activeScene.profileSnapshot(),
    }, 400);
    publishMarbleProfile();
  }
  pendingMarbleRoutePlanningMs = 0;
  statusTitle.textContent = "Marble Music | live motion mix";
  statusDetail.textContent = marbleProfilingEnabled ? marbleLiveStateDetail() : result ? marbleStatus(result.performance) : `${marbleMotionMixLabel(activation.motionMix)}% active`;
  publishMarbleProfile();
  play.disabled = false;
  scrub.disabled = false;
  if (marbleResumeAfterTransition) {
    marbleResumeAfterTransition = false;
    void audio.play().then(() => {
      play.textContent = "â…¡";
      play.setAttribute("aria-label", "Pause");
    }).catch((error: unknown) => {
      play.textContent = "â–¶";
      play.setAttribute("aria-label", "Play");
      statusTitle.textContent = "Playback paused after re-layout";
      statusDetail.textContent = error instanceof Error ? error.message : "The browser could not resume audio playback";
    });
  }
}

function tick(): void {
  if (marbleProfilingEnabled) {
    const frameAt = performance.now();
    if (previousAnimationFrameAt !== undefined) pushBounded(marbleBrowserProfile.frameIntervalsMs, frameAt - previousAnimationFrameAt);
    previousAnimationFrameAt = frameAt;
    profilePublishFrame += 1;
    if (profilePublishFrame % 60 === 0) publishMarbleProfile();
  }
  if (!audio.paused || (scene instanceof MarbleScene && scene.isTransitioning())) renderAt(audio.currentTime);
  animationFrame = requestAnimationFrame(tick);
}

function waitForAudioMetadata(element: HTMLAudioElement): Promise<void> {
  if (element.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const loaded = (): void => { cleanup(); resolve(); };
    const failed = (): void => { cleanup(); reject(new Error("The browser could not decode the exported master WAV")); };
    const cleanup = (): void => {
      element.removeEventListener("loadedmetadata", loaded);
      element.removeEventListener("error", failed);
    };
    element.addEventListener("loadedmetadata", loaded, { once: true });
    element.addEventListener("error", failed, { once: true });
  });
}

function addTuningBinding<T extends object, K extends keyof T>(
  bindingPane: BindingPane,
  target: T,
  key: K,
  options: Record<string, unknown>,
): void {
  bindingPane.addBinding(target, key, options).on("change", () => renderAt(audio.currentTime));
}

function marbleStatus(performance: MarblePerformance): string {
  const mix = performance.statics.motionMix ?? { leftRight: 20, upDown: 20, frontBack: 60 };
  const clusters = performance.statics.clusters.filter((cluster) => cluster.kind !== "single").length;
  return `${performance.statics.source.trackName} | ${performance.statics.source.noteCount} note impacts | ${clusters} clusters | ${mix.leftRight}/${mix.upDown}/${mix.frontBack}%`;
}

function rebuildMarbleScene(): void {
  marbleRebuildTimer = undefined;
  if (!song || conceptSelect.value !== "marble") return;
  statusTitle.textContent = "Rebalancing marble world";
  statusDetail.textContent = `${marbleMotionMix.leftRight}% left/right | ${marbleMotionMix.upDown}% up/down | ${marbleMotionMix.frontBack}% front/back`;
  marblePlannerRequestedAt = performance.now();
  marbleLastRequestAt = marblePlannerRequestedAt;
  marbleLiveMixState.requested = copyMarbleMotionMix(marbleMotionMix);
  publishMarbleProfile();
  marblePlanner.request(marbleMotionMix, {
    profile: marbleProfilingEnabled,
    ...(marbleSourceTrackId ? { sourceTrackId: marbleSourceTrackId } : {}),
  });
}

function beginPreparedMarbleTransition(activeScene: MarbleScene, result: MarblePlannerSuccess, prepared: MarblePreparedTransition): void {
  void marbleTransitionRouter.route([...prepared.fromTargets.values()], [...prepared.toTargets.values()]).then((routed) => {
    if (scene !== activeScene || conceptSelect.value !== "marble") return;
    if (routed.route.overlapCount !== 0) {
      statusTitle.textContent = "Safe platform route unavailable";
      statusDetail.textContent = `${routed.route.overlapCount} intermediate overlaps remain; transport is held while you adjust the mix`;
      return;
    }
    pendingMarbleRoutePlanningMs = routed.planningMs;
    const transition = activeScene.startPreparedTransition(prepared, new Map(routed.route.offsets), new Map(routed.route.timings));
    pendingMarbleActivationResult = result;
    statusTitle.textContent = "Moving marble platforms";
    statusDetail.textContent = `${marbleStatus(result.performance)} | ${transition.platformCount} platforms moving | ${transition.durationMs} ms`;
    renderAt(audio.currentTime);
  }).catch((error: unknown) => {
    if (error instanceof Error && (error.message.includes("superseded") || error.message.includes("invalidated"))) return;
    if (scene !== activeScene || conceptSelect.value !== "marble") return;
    statusTitle.textContent = "Platform routing unavailable";
    statusDetail.textContent = `${error instanceof Error ? error.message : "Transition routing failed"}; transport remains held`;
  });
}

function applyPlannedMarble(result: MarblePlannerSuccess): void {
  if (!song || conceptSelect.value !== "marble") return;
  const replacementStartedAt = marbleProfilingEnabled ? performance.now() : 0;
  marbleLiveMixState.planned = copyMarbleMotionMix(result.performance.statics.motionMix);
  publishMarbleProfile();
  const nextScene = scene instanceof MarbleScene ? scene : new MarbleScene(canvas, result.performance, marbleTuning, () => globalThis.performance.now());
  if (scene === nextScene) {
    const wasPlaying = !audio.paused;
    if (wasPlaying) {
      audio.pause();
      marbleResumeAfterTransition = true;
    }
    const prepared = nextScene.preparePerformanceTransition(result.performance, audio.currentTime);
    play.disabled = true;
    scrub.disabled = true;
    statusTitle.textContent = "Planning safe platform movement";
    statusDetail.textContent = `${marbleStatus(result.performance)} | checking intermediate clearance`;
    renderAt(audio.currentTime);
    beginPreparedMarbleTransition(nextScene, result, prepared);
    return;
  } else {
    scene = nextScene;
  }
  pendingMarbleActivationResult = undefined;
  const sceneReplacementMs = marbleProfilingEnabled ? performance.now() - replacementStartedAt : 0;
  previousBeat = -1;
  const firstRenderStartedAt = marbleProfilingEnabled ? performance.now() : 0;
  renderAt(audio.currentTime);
  if (marbleProfilingEnabled) {
    pushBounded(marbleBrowserProfile.swaps, {
      mix: { ...result.performance.statics.motionMix },
      compileMs: result.compileProfile?.totalMs ?? 0,
      plannerRoundTripMs: performance.now() - marblePlannerRequestedAt,
      sceneReplacementMs,
      firstRenderMs: performance.now() - firstRenderStartedAt,
      ...(result.compileProfile ? { compiler: result.compileProfile } : {}),
      resources: nextScene.profileSnapshot(),
    }, 400);
    publishMarbleProfile();
  }
  statusTitle.textContent = "Marble Music | live motion mix";
  statusDetail.textContent = marbleStatus(result.performance);
}

function reportMarblePlanningFailure(error: string): void {
  if (conceptSelect.value !== "marble") return;
  statusTitle.textContent = "Motion mix unavailable";
  statusDetail.textContent = error;
}

function scheduleMarbleRebuild(): void {
  if (marbleRebuildTimer !== undefined) window.clearTimeout(marbleRebuildTimer);
  const delayMs = nextMarbleRequestDelay(performance.now(), marbleLastRequestAt);
  if (delayMs <= 0) {
    rebuildMarbleScene();
    return;
  }
  marbleRebuildTimer = window.setTimeout(rebuildMarbleScene, delayMs);
}

function updateMarbleMotionMix(changed: keyof MarbleMotionMix, bindingPane: BindingPane): void {
  Object.assign(marbleMotionMix, projectMarbleMotionMix(changed, marbleMotionMix[changed], previousMarbleMotionMix));
  previousMarbleMotionMix = { ...marbleMotionMix };
  marbleLiveMixState.desired = copyMarbleMotionMix(marbleMotionMix);
  publishMarbleProfile();
  bindingPane.refresh();
  scheduleMarbleRebuild();
}

function addMarbleMotionBinding(bindingPane: BindingPane, key: keyof MarbleMotionMix, label: string): void {
  bindingPane.addBinding(marbleMotionMix, key, { min: 10, max: 80, step: 1, label })
    .on("change", () => updateMarbleMotionMix(key, bindingPane));
}

function applyMarbleHandMix(nextMix: MarbleMotionMix, timestampMs: number): void {
  const deltaSec = Number.isFinite(marbleHandLastResultAt) ? Math.max(1 / 120, (timestampMs - marbleHandLastResultAt) / 1000) : 1 / 30;
  marbleHandLastResultAt = timestampMs;
  const filtered = filterMarbleMotionMix(nextMix, marbleMotionMix, deltaSec, { deadband: 0.5, slewPerSec: 90 });
  if (filtered.leftRight === marbleMotionMix.leftRight && filtered.upDown === marbleMotionMix.upDown && filtered.frontBack === marbleMotionMix.frontBack) return;
  Object.assign(marbleMotionMix, filtered);
  previousMarbleMotionMix = copyMarbleMotionMix(filtered);
  marbleLiveMixState.desired = copyMarbleMotionMix(filtered);
  if (pane) (pane as unknown as BindingPane).refresh();
  publishMarbleProfile();
  scheduleMarbleRebuild();
}

function applyMarbleHandCamera(next: MarbleHandCameraControl, timestampMs: number): void {
  const deltaSec = Number.isFinite(marbleHandLastCameraAt) ? Math.max(1 / 120, (timestampMs - marbleHandLastCameraAt) / 1000) : 1 / 30;
  marbleHandLastCameraAt = timestampMs;
  const blend = 1 - Math.exp(-10 * deltaSec);
  marbleHandCamera.yaw += (next.yaw - marbleHandCamera.yaw) * blend;
  marbleHandCamera.pitch += (next.pitch - marbleHandCamera.pitch) * blend;
  marbleHandCamera.distance += (next.distance - marbleHandCamera.distance) * blend;
  marbleTuning.cameraOrbitYaw = marbleHandCamera.yaw;
  marbleTuning.cameraOrbitPitch = marbleHandCamera.pitch;
  marbleTuning.cameraOrbitDistance = marbleHandCamera.distance;
}

function scheduleMarbleHandFrame(): void {
  if (!marbleHandWorker || !marbleHandStream || handVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const capture = async (timestampMs: number): Promise<void> => {
    if (!marbleHandWorker || !marbleHandStream || marbleHandFramePending) return;
    marbleHandFramePending = true;
    try {
      const frame = await createImageBitmap(handVideo);
      marbleHandWorker.postMessage({ type: "frame", frame, timestampMs }, [frame]);
    } catch (error) {
      marbleHandFramePending = false;
      handState.textContent = error instanceof Error ? error.message : "Frame capture failed";
    }
  };
  if ("requestVideoFrameCallback" in handVideo) {
    marbleHandVideoCallback = handVideo.requestVideoFrameCallback((now) => {
      void capture(now);
      scheduleMarbleHandFrame();
    });
  } else {
    marbleHandFallbackTimer = window.setTimeout(() => {
      void capture(performance.now());
      scheduleMarbleHandFrame();
    }, 33);
  }
}

function stopMarbleHandTracking(status = "Off"): void {
  marbleHandGeneration += 1;
  if (marbleHandVideoCallback !== undefined && "cancelVideoFrameCallback" in handVideo) handVideo.cancelVideoFrameCallback(marbleHandVideoCallback);
  if (marbleHandFallbackTimer !== undefined) window.clearTimeout(marbleHandFallbackTimer);
  if (marbleHandPermissionTimer !== undefined) window.clearTimeout(marbleHandPermissionTimer);
  marbleHandVideoCallback = undefined;
  marbleHandFallbackTimer = undefined;
  marbleHandPermissionTimer = undefined;
  marbleHandWorker?.terminate();
  marbleHandWorker = undefined;
  marbleHandStream?.getTracks().forEach((track) => track.stop());
  marbleHandStream = undefined;
  marbleHandFramePending = false;
  marbleHandLastResultAt = Number.NEGATIVE_INFINITY;
  marbleHandLastCameraAt = Number.NEGATIVE_INFINITY;
  marbleHandController.reset();
  handVideo.pause();
  handVideo.srcObject = null;
  handVideo.hidden = true;
  handToggle.textContent = "Enable camera";
  handState.textContent = status;
}

async function startMarbleHandTracking(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    handState.textContent = "Camera unavailable";
    return;
  }
  handToggle.disabled = true;
  handState.textContent = "Requesting camera";
  const generation = ++marbleHandGeneration;
  marbleHandPermissionTimer = window.setTimeout(() => {
    if (generation !== marbleHandGeneration || marbleHandStream) return;
    marbleHandPermissionTimer = undefined;
    marbleHandGeneration += 1;
    handToggle.disabled = false;
    handState.textContent = "Camera permission timed out";
  }, 12_000);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 }, facingMode: "user" },
    });
    if (generation !== marbleHandGeneration || conceptSelect.value !== "marble") {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    if (marbleHandPermissionTimer !== undefined) window.clearTimeout(marbleHandPermissionTimer);
    marbleHandPermissionTimer = undefined;
    marbleHandStream = stream;
    handVideo.srcObject = marbleHandStream;
    handVideo.hidden = false;
    await handVideo.play();
    marbleHandWorker = new Worker(new URL("./marble-hand.worker.ts", import.meta.url), { type: "module" });
    marbleHandWorker.onmessage = (event: MessageEvent<MarbleHandWorkerOutbound>) => {
      const message = event.data;
      if (message.type === "ready") {
        handToggle.disabled = false;
        handToggle.textContent = "Disable camera";
        handState.textContent = "Show one hand";
        scheduleMarbleHandFrame();
        return;
      }
      marbleHandFramePending = false;
      if (message.type === "failed") {
        stopMarbleHandTracking(message.error);
        return;
      }
      const control = marbleHandController.update({
        ...(message.landmarks ? { landmarks: message.landmarks } : {}),
        confidence: message.confidence,
        timestampMs: message.timestampMs,
      }, marbleMotionMix, marbleHandCamera);
      handState.textContent = control.finger
        ? `${control.phase} ${control.finger === "index" ? "motion" : "camera"} | ${message.inferenceMs.toFixed(0)} ms`
        : `Show one hand | ${message.inferenceMs.toFixed(0)} ms`;
      if (control.mix && conceptSelect.value === "marble") applyMarbleHandMix(control.mix, message.timestampMs);
      if (control.camera && conceptSelect.value === "marble") applyMarbleHandCamera(control.camera, message.timestampMs);
    };
    marbleHandWorker.postMessage({
      type: "initialize",
      wasmRoot: new URL("/mediapipe-wasm", window.location.href).href,
      modelPath: new URL("/models/hand_landmarker.task", window.location.href).href,
    });
    handState.textContent = "Loading hand model";
  } catch (error) {
    stopMarbleHandTracking(error instanceof Error ? error.message : "Camera permission denied");
  } finally {
    if (!marbleHandWorker) handToggle.disabled = false;
  }
}

async function loadConcept(concept: string): Promise<void> {
  if (marbleRebuildTimer !== undefined) window.clearTimeout(marbleRebuildTimer);
  marbleRebuildTimer = undefined;
  marbleLastRequestAt = Number.NEGATIVE_INFINITY;
  marbleResumeAfterTransition = false;
  play.disabled = false;
  scrub.disabled = false;
  marblePlanner.invalidate();
  marbleTransitionRouter.invalidate();
  handControls.hidden = true;
  stopMarbleHandTracking();
  pendingMarbleActivationResult = undefined;
  const wasThree = scene?.backendKind === "three";
  destroyActiveScene();
  if (wasThree) destroyPixiBackend();
  pane?.dispose();
  if (!song) return;
  statusTitle.textContent = "Building world";
  statusDetail.textContent = concept;
  pane = new Pane({ container: tweakpaneContainer });
  const bindingPane = pane as unknown as BindingPane;
  if (concept === "brick-breaker") {
    const backend = await ensurePixiBackend();
    const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectId)}/performance.brick-breaker.json`);
    if (!response.ok) throw new Error(`Brick Breaker performance request failed: ${response.status}`);
    const performance = parsePerformance(await response.json()) as BrickBreakerPerformance;
    const brickBreaker = new BrickBreakerScene(backend, performance);
    scene = brickBreaker;
    addTuningBinding(bindingPane, brickBreaker.tuning, "glow", { min: 0, max: 1.2, step: 0.01, label: "Glow" });
    addTuningBinding(bindingPane, brickBreaker.tuning, "fragments", { min: 0, max: 1.2, step: 0.01, label: "Fragments" });
    addTuningBinding(bindingPane, brickBreaker.tuning, "trail", { min: 0, max: 1, step: 0.01, label: "Trail" });
    sceneLabel.textContent = "Brick Breaker · B2 Collision Preview";
    statusTitle.textContent = "Brick Breaker · direct-contact preview";
    const wallContacts = performance.statics.ballSegments.filter((segment) => segment.kind === "wall").length;
    const supportBeats = performance.statics.report.groupedHitCount - performance.statics.bricks.length;
    const supportHitLabel = supportBeats === 1 ? "hit" : "hits";
    statusDetail.textContent = `${performance.statics.bricks.length} certified bricks · ${supportBeats} beat-aligned support ${supportHitLabel} · ${wallContacts} wall bounces · ${performance.statics.paddleContacts.length} paddle returns · final hit ${performance.statics.report.finalHitSec.toFixed(3)}s`;
  } else if (concept === "aurora") {
    destroyPixiBackend();
    const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectId)}/performance.aurora.json`);
    if (!response.ok) throw new Error(`Aurora performance request failed: ${response.status}`);
    const performance = parsePerformance(await response.json()) as AuroraPerformance;
    const aurora = new AuroraScene(canvas, performance);
    scene = aurora;
    addTuningBinding(bindingPane, aurora.tuning, "aurora", { min: 0, max: 1.5, step: 0.01, label: "Aurora" });
    addTuningBinding(bindingPane, aurora.tuning, "fieldMotion", { min: 0.2, max: 2, step: 0.01, label: "Field motion" });
    addTuningBinding(bindingPane, aurora.tuning, "particlePlasma", { min: 0.2, max: 1.8, step: 0.01, label: "Particle" });
    addTuningBinding(bindingPane, aurora.tuning, "coilGlow", { min: 0, max: 1.5, step: 0.01, label: "Coils" });
    addTuningBinding(bindingPane, aurora.tuning, "trail", { min: 0, max: 1.2, step: 0.01, label: "Trail" });
    addTuningBinding(bindingPane, aurora.tuning, "cameraDistance", { min: 0.65, max: 1.6, step: 0.01, label: "Camera" });
    sceneLabel.textContent = "Aurora Cyclotron · A4 Volumetric Field";
    statusTitle.textContent = "Aurora Cyclotron · abstract physics volume";
    const report = performance.statics.routeReport;
    const particleClearance = report.minimumParticleClearance === null ? "n/a" : report.minimumParticleClearance.toFixed(3);
    const coilClearance = report.minimumCoilSurfaceClearance === null ? "n/a" : report.minimumCoilSurfaceClearance.toFixed(3);
    statusDetail.textContent = `${report.deadlineCount} coils · radius ${report.maximumRouteRadius.toFixed(1)} · particle clearance ${particleClearance} · coil clearance ${coilClearance} · ${report.occupancyViolations.length} violations`;
  } else if (concept === "phaseglass") {
    destroyPixiBackend();
    const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectId)}/performance.phaseglass.json`);
    if (!response.ok) throw new Error(`Phaseglass performance request failed: ${response.status}`);
    const performance = parsePerformance(await response.json()) as PhaseglassPerformance;
    const phaseglass = new PhaseglassScene(canvas, performance, reportPhaseglassFailure);
    scene = phaseglass;
    addTuningBinding(bindingPane, phaseglass.tuning, "glass", { min: 0, max: 1.6, step: 0.01, label: "Glass" });
    addTuningBinding(bindingPane, phaseglass.tuning, "caustics", { min: 0, max: 1.6, step: 0.01, label: "Caustics" });
    addTuningBinding(bindingPane, phaseglass.tuning, "dispersion", { min: 0, max: 1.4, step: 0.01, label: "Dispersion" });
    addTuningBinding(bindingPane, phaseglass.tuning, "wavefront", { min: 0, max: 1.4, step: 0.01, label: "Field" });
    addTuningBinding(bindingPane, phaseglass.tuning, "cameraDistance", { min: 0.65, max: 1.6, step: 0.01, label: "Camera" });
    sceneLabel.textContent = "Phaseglass - P6 Refractive Field";
    statusTitle.textContent = "Phaseglass - continuous optical interference";
    const report = performance.statics.routeReport;
    const clearance = report.minimumMembraneClearance === null ? "n/a" : report.minimumMembraneClearance.toFixed(3);
    statusDetail.textContent = `${report.deadlineCount} membranes - exact error ${report.exactCrossingError.toExponential(1)} - speed error ${report.maximumSpeedError.toExponential(1)} - clearance ${clearance} - ${report.earlyCrossingCount} early crossings`;
  } else if (concept === "metro") {
    const backend = await ensurePixiBackend();
    const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectId)}/performance.metro.json`);
    if (!response.ok) throw new Error(`Metro performance request failed: ${response.status}`);
    const performance = parsePerformance(await response.json()) as MetroPerformance;
    const metro = new MetroScene(backend, performance);
    scene = metro;
    addTuningBinding(bindingPane, metro.tuning, "lineWeight", { min: 0.5, max: 1.5, step: 0.02, label: "Lines" });
    addTuningBinding(bindingPane, metro.tuning, "gridOpacity", { min: 0, max: 1, step: 0.01, label: "Grid" });
    addTuningBinding(bindingPane, metro.tuning, "stationScale", { min: 0.6, max: 1.6, step: 0.02, label: "Stations" });
    addTuningBinding(bindingPane, metro.tuning, "cueStrength", { min: 0.4, max: 1.8, step: 0.02, label: "Cues" });
    sceneLabel.textContent = "Metro Map · M3 Cartography";
    statusTitle.textContent = "Metro Map · labeled live network";
    const lineAudits = performance.statics.lineAudits ?? [];
    const fallbacks = lineAudits.filter((line) => line.source === "audio-activity").length;
    const hits = lineAudits.reduce((sum, line) => sum + line.hitCount, 0);
    statusDetail.textContent = `${performance.statics.lines.length} lines · ${performance.statics.stations.length} stations · ${hits} note payoffs · ${fallbacks} audio fallback`;
  } else if (concept === "painting") {
    const backend = await ensurePixiBackend();
    const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectId)}/performance.painting.json`);
    if (!response.ok) throw new Error(`Painting performance request failed: ${response.status}`);
    const performance = parsePerformance(await response.json()) as PaintingPerformance;
    const painting = new PaintingScene(backend, performance);
    scene = painting;
    addTuningBinding(bindingPane, painting.tuning, "paperTexture", { min: 0, max: 1.3, step: 0.01, label: "Paper" });
    addTuningBinding(bindingPane, painting.tuning, "wetness", { min: 0, max: 1.4, step: 0.01, label: "Wetness" });
    addTuningBinding(bindingPane, painting.tuning, "strokeScale", { min: 0.65, max: 1.45, step: 0.01, label: "Stroke size" });
    addTuningBinding(bindingPane, painting.tuning, "reveal", { min: 0.2, max: 1.4, step: 0.01, label: "Reveal" });
    sceneLabel.textContent = "Painting · P1 Artifact Canvas";
    statusTitle.textContent = "Painting · song-made artwork";
    statusDetail.textContent = `${performance.statics.strokes.length} marks · ${performance.statics.strokeCounts.subject} ribbon strokes · ${performance.statics.strokeCounts.rhythm} rhythm marks`;
  } else if (concept === "runner") {
    const backend = await ensurePixiBackend();
    const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectId)}/performance.runner.json`);
    if (!response.ok) throw new Error(`Runner performance request failed: ${response.status}`);
    const performance = parsePerformance(await response.json()) as RunnerPerformance;
    const runner = new RunnerScene(backend, performance);
    scene = runner;
    addTuningBinding(bindingPane, runner.tuning, "terrainContrast", { min: 0.2, max: 1.4, step: 0.02, label: "Terrain" });
    addTuningBinding(bindingPane, runner.tuning, "glow", { min: 0, max: 1.2, step: 0.01, label: "Glow" });
    addTuningBinding(bindingPane, runner.tuning, "trail", { min: 0, max: 1, step: 0.01, label: "Trail" });
    addTuningBinding(bindingPane, runner.tuning, "parallax", { min: 0.2, max: 1.5, step: 0.02, label: "Parallax" });
    sceneLabel.textContent = "Waveform Runner · R3 Music";
    statusTitle.textContent = "Waveform Runner · compiled music";
    statusDetail.textContent = `${performance.statics.jumpReport.length} landings · ${performance.statics.glyphs.length} ${performance.statics.glyphSource} glyphs · ${performance.statics.terrain.source}`;
  } else if (concept === "marble") {
    destroyPixiBackend();
    const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectId)}/performance.marble.json`);
    if (!response.ok) throw new Error(`Marble performance request failed: ${response.status}`);
    const performance = parsePerformance(await response.json()) as MarblePerformance;
    marbleSourceTrackId = performance.statics.source.trackId;
    Object.assign(marbleMotionMix, performance.statics.motionMix ?? { leftRight: 20, upDown: 20, frontBack: 60 });
    previousMarbleMotionMix = { ...marbleMotionMix };
    marbleLiveMixState.desired = copyMarbleMotionMix(marbleMotionMix);
    delete marbleLiveMixState.requested;
    delete marbleLiveMixState.planned;
    marbleLiveMixState.active = copyMarbleMotionMix(marbleMotionMix);
    Object.assign(marbleTuning, { glow: 0.78, camera: 0.88, cameraOrbitYaw: 0, cameraOrbitPitch: 0, cameraOrbitDistance: 0, targetScale: 1, tail: 0.8, motionTrail: 0.72 });
    Object.assign(marbleHandCamera, { yaw: 0, pitch: 0, distance: 0 });
    const marble = new MarbleScene(canvas, performance, marbleTuning, () => globalThis.performance.now());
    scene = marble;
    addMarbleMotionBinding(bindingPane, "leftRight", "Left/right %");
    addMarbleMotionBinding(bindingPane, "upDown", "Up/down %");
    addMarbleMotionBinding(bindingPane, "frontBack", "Front/back %");
    addTuningBinding(bindingPane, marbleTuning, "glow", { min: 0, max: 1.6, step: 0.01, label: "Glow" });
    addTuningBinding(bindingPane, marbleTuning, "camera", { min: 0.4, max: 1.8, step: 0.02, label: "Camera" });
    addTuningBinding(bindingPane, marbleTuning, "targetScale", { min: 0.7, max: 1.4, step: 0.01, label: "Targets" });
    addTuningBinding(bindingPane, marbleTuning, "motionTrail", { min: 0, max: 1.2, step: 0.01, label: "Trail" });
    addTuningBinding(bindingPane, marbleTuning, "tail", { min: 0, max: 1.5, step: 0.01, label: "Resonance" });
    sceneLabel.textContent = "Marble Music · M0/M1";
    statusTitle.textContent = "Marble Music · one-track machine";
    statusDetail.textContent = marbleStatus(performance);
  } else {
    const backend = await ensurePixiBackend();
    const diagnostics = new TestPatternScene(backend, song);
    scene = diagnostics;
    addTuningBinding(bindingPane, diagnostics.tuning, "glow", { min: 0, max: 1, step: 0.01, label: "Orb glow" });
    addTuningBinding(bindingPane, diagnostics.tuning, "gridOpacity", { min: 0, max: 0.7, step: 0.01, label: "Grid" });
    addTuningBinding(bindingPane, diagnostics.tuning, "motion", { min: 0, max: 2, step: 0.05, label: "Motion" });
    sceneLabel.textContent = "Pipeline diagnostics · not Metro";
    statusTitle.textContent = "Pipeline test pattern";
    statusDetail.textContent = "Timing and export diagnostics only";
  }
  audit.disabled = !scene.auditFrame;
  if (!scene.auditFrame) audit.checked = false;
  previousBeat = -1;
  renderAt(audio.currentTime);
  const mp4Supported = await supportsCanvasMp4(canvas.width, canvas.height);
  exportMp4.disabled = !mp4Supported;
  exportMp4.title = mp4Supported ? "Render a deterministic three-second silent MP4" : "H.264 WebCodecs encoding is unavailable in this browser";
}

async function loadProject(id: string): Promise<void> {
  cancelAnimationFrame(animationFrame);
  audio.pause();
  currentProjectId = id;
  statusTitle.textContent = "Loading analyzed song";
  statusDetail.textContent = id;
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}/song.json`);
  if (!response.ok) throw new Error(`Song request failed: ${response.status}`);
  song = parseSong(await response.json());
  marblePlanner.initialize(song);
  audio.src = `/api/projects/${encodeURIComponent(id)}/master.wav`;
  audio.load();
  await waitForAudioMetadata(audio);
  scrub.max = String(song.meta.durationSec);
  audio.currentTime = 0;
  const project = projects.find((candidate) => candidate.id === id);
  const options: HTMLOptionElement[] = [];
  if (project?.concepts.includes("runner")) {
    const runner = document.createElement("option");
    runner.value = "runner";
    runner.textContent = "Waveform Runner · R3 Music";
    options.push(runner);
  }
  if (project?.concepts.includes("metro")) {
    const metro = document.createElement("option");
    metro.value = "metro";
    metro.textContent = "Metro Map · M3 Cartography";
    options.push(metro);
  }
  if (project?.concepts.includes("painting")) {
    const painting = document.createElement("option");
    painting.value = "painting";
    painting.textContent = "Painting · P1 Artifact Canvas";
    options.push(painting);
  }
  if (project?.concepts.includes("marble")) {
    const marble = document.createElement("option");
    marble.value = "marble";
    marble.textContent = "Marble Music · M0/M1";
    options.push(marble);
  }
  if (project?.concepts.includes("brick-breaker")) {
    const brickBreaker = document.createElement("option");
    brickBreaker.value = "brick-breaker";
    brickBreaker.textContent = "Brick Breaker · B2 Collision Preview";
    options.push(brickBreaker);
  }
  if (project?.concepts.includes("aurora")) {
    const aurora = document.createElement("option");
    aurora.value = "aurora";
    aurora.textContent = "Aurora Cyclotron · A4 Volumetric Field";
    options.push(aurora);
  }
  if (project?.concepts.includes("phaseglass")) {
    const phaseglass = document.createElement("option");
    phaseglass.value = "phaseglass";
    phaseglass.textContent = "Phaseglass - P6 Refractive Field";
    options.push(phaseglass);
  }
  const testPattern = document.createElement("option");
  testPattern.value = "testpattern";
  testPattern.textContent = "Pipeline Test Pattern";
  options.push(testPattern);
  if (!project?.concepts.includes("metro")) {
    const metro = document.createElement("option");
    metro.value = "metro";
    metro.textContent = "Metro Map · compile required";
    metro.disabled = true;
    options.push(metro);
  }
  if (!project?.concepts.includes("painting")) {
    const painting = document.createElement("option");
    painting.value = "painting";
    painting.textContent = "Painting · compile required";
    painting.disabled = true;
    options.push(painting);
  }
  if (!project?.concepts.includes("marble")) {
    const marble = document.createElement("option");
    marble.value = "marble";
    marble.textContent = "Marble Music · compile required";
    marble.disabled = true;
    options.push(marble);
  }
  if (!project?.concepts.includes("aurora")) {
    const aurora = document.createElement("option");
    aurora.value = "aurora";
    aurora.textContent = "Aurora Cyclotron · compile required";
    aurora.disabled = true;
    options.push(aurora);
  }
  if (!project?.concepts.includes("phaseglass")) {
    const phaseglass = document.createElement("option");
    phaseglass.value = "phaseglass";
    phaseglass.textContent = "Phaseglass - compile required";
    phaseglass.disabled = true;
    options.push(phaseglass);
  }
  conceptSelect.replaceChildren(...options);
  await loadConcept(options[0]?.value ?? "testpattern");
  animationFrame = requestAnimationFrame(tick);
}

play.addEventListener("click", async () => {
  if (audio.paused) {
    try {
      await audio.play();
      play.textContent = "Ⅱ";
      play.setAttribute("aria-label", "Pause");
    } catch (error) {
      statusTitle.textContent = "Playback unavailable";
      statusDetail.textContent = error instanceof Error ? error.message : "The browser rejected audio playback";
    }
  } else {
    audio.pause();
    play.textContent = "▶";
    play.setAttribute("aria-label", "Play");
  }
});
scrub.addEventListener("input", () => {
  audio.currentTime = Number(scrub.value);
  renderAt(audio.currentTime);
});
select.addEventListener("change", () => void loadProject(select.value));
conceptSelect.addEventListener("change", () => void loadConcept(conceptSelect.value));
audio.addEventListener("ended", () => {
  play.textContent = "▶";
  play.setAttribute("aria-label", "Play");
});
audio.addEventListener("timeupdate", () => updateTransport(audio.currentTime));
guides.addEventListener("change", () => guide.classList.toggle("visible", guides.checked));
audit.addEventListener("change", () => renderAt(audio.currentTime));
handToggle.addEventListener("click", () => {
  if (marbleHandStream) stopMarbleHandTracking();
  else void startMarbleHandTracking();
});
exportPng.addEventListener("click", async () => {
  if (!song || !scene) return;
  const blob = await captureCanvasPng(canvas);
  downloadBlob(blob, `${safeName(song.meta.name)}-${audio.currentTime.toFixed(3)}s.png`);
});
exportMp4.addEventListener("click", async () => {
  if (!song || !scene || exportMp4.disabled) return;
  const restoreTime = audio.currentTime;
  const startSec = Math.min(restoreTime, Math.max(0, song.meta.durationSec - 0.5));
  const durationSec = Math.min(3, song.meta.durationSec - startSec);
  audio.pause();
  exportMp4.disabled = true;
  exportPng.disabled = true;
  exportProgress.classList.add("active");
  statusTitle.textContent = "Rendering deterministic frames";
  try {
    const blob = await exportCanvasMp4({
      canvas,
      renderFrame: (time) => scene?.renderFrame(time),
      startSec,
      durationSec,
      fps: 60,
      onProgress: (complete, total) => {
        const ratio = total > 0 ? complete / total : 0;
        exportProgress.style.setProperty("--progress", `${ratio * 100}%`);
        statusDetail.textContent = `${complete} / ${total} frames`;
      },
    });
    downloadBlob(blob, `${safeName(song.meta.name)}-${startSec.toFixed(3)}s-preview.mp4`);
    statusTitle.textContent = "Preview MP4 ready";
    statusDetail.textContent = `${(blob.size / 1024 / 1024).toFixed(2)} MiB · silent video`;
  } catch (error) {
    statusTitle.textContent = "MP4 render failed";
    statusDetail.textContent = error instanceof Error ? error.message : "Unknown export error";
  } finally {
    exportProgress.classList.remove("active");
    exportProgress.style.setProperty("--progress", "0%");
    exportPng.disabled = false;
    exportMp4.disabled = !(await supportsCanvasMp4(canvas.width, canvas.height));
    renderAt(restoreTime);
  }
});

async function start(): Promise<void> {
  const response = await fetch("/api/projects");
  projects = await response.json() as ProjectSummary[];
  if (!projects.length) {
    select.innerHTML = "<option>No analyzed projects</option>";
    select.disabled = true;
    statusTitle.textContent = "No song.json found";
    statusDetail.textContent = "Run python -m analyzer projects\\your-project first.";
    return;
  }
  select.replaceChildren(...projects.map((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = `${project.name} · ${project.durationSec.toFixed(1)}s`;
    return option;
  }));
  await loadProject(projects[0]!.id);
}

void start().catch((error: unknown) => {
  statusTitle.textContent = "Preview failed";
  statusDetail.textContent = error instanceof Error ? error.message : "Unknown error";
  console.error(error);
});

(import.meta as HotImportMeta).hot?.dispose(() => {
  cancelAnimationFrame(animationFrame);
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  pane?.dispose();
  stopMarbleHandTracking();
  marblePlanner.dispose();
  marbleTransitionRouter.dispose();
  destroyActiveScene();
  destroyPixiBackend();
});
