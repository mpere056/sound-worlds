import { parsePerformance, parseSong, type Song } from "@reaper-viz/core";
import type { MarbleCompileProfile, MarbleMotionMix } from "@reaper-viz/compiler-marble";
import { captureCanvasPng, exportCanvasMp4, PixiBackend, supportsCanvasMp4 } from "@reaper-viz/render";
import { MarbleScene, type MarblePerformance, type MarbleSceneProfileSnapshot, type MarbleTuning } from "@reaper-viz/scene-marble";
import { MetroScene, type MetroPerformance } from "@reaper-viz/scene-metro";
import { PaintingScene, type PaintingPerformance } from "@reaper-viz/scene-painting";
import { RunnerScene, type RunnerPerformance } from "@reaper-viz/scene-runner";
import { TestPatternScene } from "@reaper-viz/scene-testpattern";
import { Pane } from "tweakpane";
import { MarblePlannerClient } from "./marble-planner-client.js";
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
  compiler?: MarbleCompileProfile;
  resources?: MarbleSceneProfileSnapshot;
}

interface MarbleBrowserProfile {
  frameIntervalsMs: number[];
  renderMs: number[];
  longTasks: Array<{ durationMs: number; startTimeMs: number }>;
  swaps: MarbleBrowserSwapProfile[];
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
const marbleTuning: MarbleTuning = { glow: 0.78, camera: 0.88, targetScale: 1, tail: 0.8 };
const marbleProfilingEnabled = new URLSearchParams(window.location.search).has("profileMarble");
const marbleBrowserProfile: MarbleBrowserProfile = { frameIntervalsMs: [], renderMs: [], longTasks: [], swaps: [] };
let previousAnimationFrameAt: number | undefined;
let profilePublishFrame = 0;
let marblePlannerRequestedAt = 0;
let marbleLastInputAt = 0;
let marbleActivationTimer: number | undefined;
const marblePlanner = new MarblePlannerClient(
  new Worker(new URL("./marble-planner.worker.ts", import.meta.url), { type: "module" }),
  {
    planned: (result) => applyPlannedMarble(result),
    failed: (error) => reportMarblePlanningFailure(error),
  },
);

for (const eventName of ["pointerdown", "keydown", "input"]) {
  tweakpaneContainer.addEventListener(eventName, () => {
    if (conceptSelect.value !== "marble") return;
    marbleLastInputAt = performance.now();
    if (marbleActivationTimer !== undefined) window.clearTimeout(marbleActivationTimer);
    marbleActivationTimer = undefined;
    marblePlanner.invalidate();
  }, { capture: true });
}

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

function profilePercentile(values: readonly number[], amount: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * amount))] ?? 0;
}

function publishMarbleProfile(): void {
  if (!marbleProfilingEnabled) return;
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
    longTasks: marbleBrowserProfile.longTasks,
    latestSwap: marbleBrowserProfile.swaps.at(-1),
    swapCount: marbleBrowserProfile.swaps.length,
  });
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
  updateTransport(t);
  try {
    const renderStartedAt = marbleProfilingEnabled ? performance.now() : 0;
    scene.renderFrame(t);
    if (marbleProfilingEnabled) pushBounded(marbleBrowserProfile.renderMs, performance.now() - renderStartedAt);
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
  if (audit.checked && scene.auditFrame) {
    metroAudit.classList.add("visible");
    metroAudit.textContent = scene.auditFrame(t).join("\n");
  } else {
    metroAudit.classList.remove("visible");
    metroAudit.textContent = "";
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
  if (!audio.paused) renderAt(audio.currentTime);
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
  marblePlanner.request(marbleMotionMix, {
    profile: marbleProfilingEnabled,
    ...(marbleSourceTrackId ? { sourceTrackId: marbleSourceTrackId } : {}),
  });
}

function applyPlannedMarble(result: MarblePlannerSuccess): void {
  if (!song || conceptSelect.value !== "marble") return;
  const remainingQuietMs = 250 - (performance.now() - marbleLastInputAt);
  if (remainingQuietMs > 0) {
    if (marbleActivationTimer !== undefined) window.clearTimeout(marbleActivationTimer);
    marbleActivationTimer = window.setTimeout(() => {
      marbleActivationTimer = undefined;
      applyPlannedMarble(result);
    }, remainingQuietMs);
    return;
  }
  const plannedMix = result.performance.statics.motionMix;
  if (plannedMix.leftRight !== marbleMotionMix.leftRight
    || plannedMix.upDown !== marbleMotionMix.upDown
    || plannedMix.frontBack !== marbleMotionMix.frontBack) return;
  const replacementStartedAt = marbleProfilingEnabled ? performance.now() : 0;
  const nextScene = scene instanceof MarbleScene ? scene : new MarbleScene(canvas, result.performance, marbleTuning);
  if (scene === nextScene) nextScene.replacePerformance(result.performance);
  else scene = nextScene;
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
  marbleRebuildTimer = window.setTimeout(rebuildMarbleScene, 100);
}

function updateMarbleMotionMix(changed: keyof MarbleMotionMix, bindingPane: BindingPane): void {
  const keys: Array<keyof MarbleMotionMix> = ["leftRight", "upDown", "frontBack"];
  marbleMotionMix[changed] = Math.max(10, Math.min(80, Math.round(marbleMotionMix[changed])));
  const others = keys.filter((key) => key !== changed);
  const remainder = 100 - marbleMotionMix[changed];
  const previousRemainder = previousMarbleMotionMix[others[0]!] + previousMarbleMotionMix[others[1]!];
  const firstShare = previousRemainder > 0 ? previousMarbleMotionMix[others[0]!] / previousRemainder : 0.5;
  marbleMotionMix[others[0]!] = Math.max(10, Math.round(remainder * firstShare));
  marbleMotionMix[others[1]!] = 100 - marbleMotionMix[changed] - marbleMotionMix[others[0]!];
  if (marbleMotionMix[others[1]!] < 10) {
    marbleMotionMix[others[1]!] = 10;
    marbleMotionMix[others[0]!] = remainder - 10;
  }
  previousMarbleMotionMix = { ...marbleMotionMix };
  bindingPane.refresh();
  marblePlanner.invalidate();
  scheduleMarbleRebuild();
}

function addMarbleMotionBinding(bindingPane: BindingPane, key: keyof MarbleMotionMix, label: string): void {
  bindingPane.addBinding(marbleMotionMix, key, { min: 10, max: 80, step: 1, label })
    .on("change", () => updateMarbleMotionMix(key, bindingPane));
}

async function loadConcept(concept: string): Promise<void> {
  if (marbleRebuildTimer !== undefined) window.clearTimeout(marbleRebuildTimer);
  marbleRebuildTimer = undefined;
  if (marbleActivationTimer !== undefined) window.clearTimeout(marbleActivationTimer);
  marbleActivationTimer = undefined;
  const wasThree = scene?.backendKind === "three";
  destroyActiveScene();
  if (wasThree) destroyPixiBackend();
  pane?.dispose();
  if (!song) return;
  statusTitle.textContent = "Building world";
  statusDetail.textContent = concept;
  pane = new Pane({ container: document.querySelector<HTMLDivElement>("#tweakpane")! });
  const bindingPane = pane as unknown as BindingPane;
  if (concept === "metro") {
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
    Object.assign(marbleTuning, { glow: 0.78, camera: 0.88, targetScale: 1, tail: 0.8 });
    const marble = new MarbleScene(canvas, performance, marbleTuning);
    scene = marble;
    addMarbleMotionBinding(bindingPane, "leftRight", "Left/right %");
    addMarbleMotionBinding(bindingPane, "upDown", "Up/down %");
    addMarbleMotionBinding(bindingPane, "frontBack", "Front/back %");
    addTuningBinding(bindingPane, marbleTuning, "glow", { min: 0, max: 1.6, step: 0.01, label: "Glow" });
    addTuningBinding(bindingPane, marbleTuning, "camera", { min: 0.4, max: 1.8, step: 0.02, label: "Camera" });
    addTuningBinding(bindingPane, marbleTuning, "targetScale", { min: 0.7, max: 1.4, step: 0.01, label: "Targets" });
    addTuningBinding(bindingPane, marbleTuning, "tail", { min: 0, max: 1.5, step: 0.01, label: "Tail" });
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
  marblePlanner.dispose();
  destroyActiveScene();
  destroyPixiBackend();
});
