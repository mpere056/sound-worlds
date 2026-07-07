import { parsePerformance, parseSong, type Song } from "@reaper-viz/core";
import { captureCanvasPng, exportCanvasMp4, PixiBackend, supportsCanvasMp4 } from "@reaper-viz/render";
import { MarbleScene, type MarblePerformance } from "@reaper-viz/scene-marble";
import { MetroScene, type MetroPerformance } from "@reaper-viz/scene-metro";
import { PaintingScene, type PaintingPerformance } from "@reaper-viz/scene-painting";
import { RunnerScene, type RunnerPerformance } from "@reaper-viz/scene-runner";
import { TestPatternScene } from "@reaper-viz/scene-testpattern";
import { Pane } from "tweakpane";
import "./styles.css";

interface ProjectSummary { id: string; name: string; durationSec: number; concepts: string[]; }
interface ActiveScene { backendKind: "pixi" | "three"; tuning: object; renderFrame(t: number): void; destroy(): void; auditFrame?(t: number): string[]; }
interface BindingApi { on(event: "change", handler: () => void): BindingApi; }
interface BindingPane {
  addBinding<T extends object, K extends keyof T>(target: T, key: K, options: Record<string, unknown>): BindingApi;
}
interface HotModule {
  dispose(callback: () => void): void;
}
interface HotImportMeta extends ImportMeta {
  readonly hot?: HotModule;
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
    scene.renderFrame(t);
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

async function loadConcept(concept: string): Promise<void> {
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
    const marble = new MarbleScene(canvas, performance);
    scene = marble;
    addTuningBinding(bindingPane, marble.tuning, "glow", { min: 0, max: 1.6, step: 0.01, label: "Glow" });
    addTuningBinding(bindingPane, marble.tuning, "camera", { min: 0.4, max: 1.8, step: 0.02, label: "Camera" });
    addTuningBinding(bindingPane, marble.tuning, "targetScale", { min: 0.7, max: 1.4, step: 0.01, label: "Targets" });
    addTuningBinding(bindingPane, marble.tuning, "tail", { min: 0, max: 1.5, step: 0.01, label: "Tail" });
    sceneLabel.textContent = "Marble Music · M0/M1";
    statusTitle.textContent = "Marble Music · one-track machine";
    statusDetail.textContent = `${performance.statics.source.trackName} · ${performance.statics.source.noteCount} note impacts · ${performance.statics.clusters.filter((cluster) => cluster.kind !== "single").length} clusters`;
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
  destroyActiveScene();
  destroyPixiBackend();
});
