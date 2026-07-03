import { parseSong, type Song } from "@reaper-viz/core";
import { captureCanvasPng, exportCanvasMp4, PixiBackend, supportsCanvasMp4 } from "@reaper-viz/render";
import { TestPatternScene } from "@reaper-viz/scene-testpattern";
import { Pane } from "tweakpane";
import "./styles.css";

interface ProjectSummary { id: string; name: string; durationSec: number; }
interface BindingApi { on(event: "change", handler: () => void): BindingApi; }
interface BindingPane {
  addBinding<T extends object, K extends keyof T>(target: T, key: K, options: Record<string, unknown>): BindingApi;
}

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app root");

root.innerHTML = `
  <main class="shell">
    <aside class="panel">
      <header><div class="brand-kicker">Reaper → World</div><h1>Sound Worlds</h1><p class="lede">A deterministic preview room for music-driven worlds. Every frame answers to the song.</p></header>
      <section class="control-group"><label for="project">Project</label><select id="project"><option>Loading exports…</option></select></section>
      <section class="control-group"><div class="eyebrow">Transport</div><div class="transport"><button class="play" id="play" aria-label="Play">▶</button><span class="timecode" id="time">00:00.000 / 00:00.000</span></div><input id="scrub" aria-label="Timeline" type="range" min="0" max="1" value="0" step="0.001" /><audio id="audio" preload="auto"></audio></section>
      <section class="checks"><label class="check">Sync flash <input id="sync" type="checkbox" checked /></label><label class="check">9:16 safe area <input id="guides" type="checkbox" /></label></section>
      <section class="tuning"><div class="eyebrow">Scene tuning</div><div id="tweakpane"></div></section>
      <section class="exports"><div class="eyebrow">Export</div><div class="export-actions"><button id="export-mp4" disabled>Render 3s MP4</button><button id="export-png">Save PNG</button></div><div class="export-progress" id="export-progress"><span></span></div><p>Preview MP4 is silent; the mastered WAV is attached in the delivery step.</p></section>
      <div class="status"><strong id="status-title">Waiting for project</strong><span id="status-detail">Analyzer output appears here automatically.</span></div>
    </aside>
    <section class="stage-wrap"><div class="stage-meta"><span>Test pattern · PixiJS</span><span>1080 × 1920 · 60 FPS</span></div><div class="frame" id="frame"><canvas id="canvas"></canvas><div class="guide" id="guide"></div><div class="sync-flash" id="flash"></div></div></section>
  </main>`;

const select = document.querySelector<HTMLSelectElement>("#project")!;
const play = document.querySelector<HTMLButtonElement>("#play")!;
const scrub = document.querySelector<HTMLInputElement>("#scrub")!;
const timecode = document.querySelector<HTMLSpanElement>("#time")!;
const guide = document.querySelector<HTMLDivElement>("#guide")!;
const flash = document.querySelector<HTMLDivElement>("#flash")!;
const sync = document.querySelector<HTMLInputElement>("#sync")!;
const guides = document.querySelector<HTMLInputElement>("#guides")!;
const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const audioElement = document.querySelector<HTMLAudioElement>("#audio")!;
const statusTitle = document.querySelector<HTMLElement>("#status-title")!;
const statusDetail = document.querySelector<HTMLElement>("#status-detail")!;
const exportMp4 = document.querySelector<HTMLButtonElement>("#export-mp4")!;
const exportPng = document.querySelector<HTMLButtonElement>("#export-png")!;
const exportProgress = document.querySelector<HTMLDivElement>("#export-progress")!;

let backend: PixiBackend | undefined;
let scene: TestPatternScene | undefined;
let song: Song | undefined;
let audio: HTMLAudioElement = audioElement;
let animationFrame = 0;
let previousBeat = -1;
let pane: Pane | undefined;

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

function renderAt(t: number): void {
  if (!song || !scene) return;
  scene.renderFrame(t);
  scrub.value = String(t);
  timecode.textContent = `${formatTime(t)} / ${formatTime(song.meta.durationSec)}`;
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

async function loadProject(id: string): Promise<void> {
  cancelAnimationFrame(animationFrame);
  audio.pause();
  scene?.destroy();
  backend?.destroy();
  pane?.dispose();
  statusTitle.textContent = "Loading analyzed song";
  statusDetail.textContent = id;
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}/song.json`);
  if (!response.ok) throw new Error(`Song request failed: ${response.status}`);
  song = parseSong(await response.json());
  audio.src = `/api/projects/${encodeURIComponent(id)}/master.wav`;
  audio.load();
  await waitForAudioMetadata(audio);
  backend = await PixiBackend.create({ canvas, width: 1080, height: 1920 });
  scene = new TestPatternScene(backend, song);
  pane = new Pane({ container: document.querySelector<HTMLDivElement>("#tweakpane")! });
  const bindingPane = pane as unknown as BindingPane;
  bindingPane.addBinding(scene.tuning, "glow", { min: 0, max: 1, step: 0.01, label: "Orb glow" }).on("change", () => renderAt(audio.currentTime));
  bindingPane.addBinding(scene.tuning, "gridOpacity", { min: 0, max: 0.7, step: 0.01, label: "Grid" }).on("change", () => renderAt(audio.currentTime));
  bindingPane.addBinding(scene.tuning, "motion", { min: 0, max: 2, step: 0.05, label: "Motion" }).on("change", () => renderAt(audio.currentTime));
  scrub.max = String(song.meta.durationSec);
  previousBeat = -1;
  renderAt(0);
  statusTitle.textContent = `${song.tracks.length} tracks · ${song.grid.bars.length} bars`;
  statusDetail.textContent = `${song.grid.beats.length} beats · ${song.meta.durationSec.toFixed(3)} seconds`;
  const mp4Supported = await supportsCanvasMp4(canvas.width, canvas.height);
  exportMp4.disabled = !mp4Supported;
  exportMp4.title = mp4Supported ? "Render a deterministic three-second silent MP4" : "H.264 WebCodecs encoding is unavailable in this browser";
  audio.addEventListener("ended", () => { play.textContent = "▶"; play.setAttribute("aria-label", "Play"); });
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
guides.addEventListener("change", () => guide.classList.toggle("visible", guides.checked));
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
  const projects = await response.json() as ProjectSummary[];
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
