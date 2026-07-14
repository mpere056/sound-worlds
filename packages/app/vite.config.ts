import { createReadStream, existsSync, statSync } from "node:fs";
import { appendFile, readdir, readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(APP_DIR, "../..");
const PROJECTS = join(ROOT, "projects");
const PHASEGLASS_SHADER_LOG = join(tmpdir(), "reaper-viz-phaseglass-shader.log");

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (body.length > 512_000) throw new Error("Diagnostic payload exceeds 512 KB");
  }
  return JSON.parse(body || "null") as unknown;
}

async function projectNames(): Promise<string[]> {
  if (!existsSync(PROJECTS)) return [];
  const entries = await readdir(PROJECTS, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && existsSync(join(PROJECTS, entry.name, "song.json")))
    .map((entry) => entry.name).sort();
}

async function resolveProject(name: string): Promise<string | null> {
  const names = await projectNames();
  return names.includes(name) ? join(PROJECTS, name) : null;
}

function streamAudio(request: IncomingMessage, response: ServerResponse, path: string): void {
  const size = statSync(path).size;
  const range = request.headers.range;
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Content-Type", "audio/wav");
  if (!range) {
    response.setHeader("Content-Length", size);
    createReadStream(path).pipe(response);
    return;
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!match) { response.statusCode = 416; response.end(); return; }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) { response.statusCode = 416; response.end(); return; }
  response.statusCode = 206;
  response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  response.setHeader("Content-Length", end - start + 1);
  createReadStream(path, { start, end }).pipe(response);
}

function projectApi(): Plugin {
  return {
    name: "reaper-viz-project-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        try {
          const url = new URL(request.url ?? "/", "http://localhost");
          if (url.pathname === "/api/diagnostics/phaseglass-shader" && request.method === "POST") {
            const diagnostic = await readJsonBody(request);
            const entry = `${JSON.stringify({ receivedAt: new Date().toISOString(), diagnostic })}\n`;
            await appendFile(PHASEGLASS_SHADER_LOG, entry, "utf8");
            console.error(`[Phaseglass shader diagnostic] ${PHASEGLASS_SHADER_LOG}\n${entry}`);
            sendJson(response, 202, { logged: true, path: PHASEGLASS_SHADER_LOG });
            return;
          }
          if (url.pathname === "/api/projects") {
            const projects = await Promise.all((await projectNames()).map(async (id) => {
              const song = JSON.parse(await readFile(join(PROJECTS, id, "song.json"), "utf8")) as { meta: { name: string; durationSec: number } };
              const concepts = [
                ...(existsSync(join(PROJECTS, id, "performance.runner.json")) ? ["runner"] : []),
                ...(existsSync(join(PROJECTS, id, "performance.metro.json")) ? ["metro"] : []),
                ...(existsSync(join(PROJECTS, id, "performance.painting.json")) ? ["painting"] : []),
                ...(existsSync(join(PROJECTS, id, "performance.marble.json")) ? ["marble"] : []),
                ...(existsSync(join(PROJECTS, id, "performance.brick-breaker.json")) ? ["brick-breaker"] : []),
                ...(existsSync(join(PROJECTS, id, "performance.aurora.json")) ? ["aurora"] : []),
                ...(existsSync(join(PROJECTS, id, "performance.phaseglass.json")) ? ["phaseglass"] : []),
              ];
              return { id, name: song.meta.name, durationSec: song.meta.durationSec, concepts };
            }));
            sendJson(response, 200, projects);
            return;
          }
          const match = /^\/api\/projects\/([^/]+)\/(song\.json|performance\.(runner|metro|painting|marble|brick-breaker|aurora|phaseglass)\.json|master\.wav)$/.exec(url.pathname);
          if (!match) { next(); return; }
          const project = await resolveProject(decodeURIComponent(match[1] ?? ""));
          if (!project) { sendJson(response, 404, { error: "Unknown project" }); return; }
          if (match[2]?.endsWith(".json")) {
            const path = join(project, match[2]);
            if (!existsSync(path)) { sendJson(response, 404, { error: "Compiled concept is unavailable" }); return; }
            sendJson(response, 200, JSON.parse(await readFile(path, "utf8")));
          } else {
            streamAudio(request, response, join(project, "master.wav"));
          }
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : "Unknown server error" });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [projectApi()],
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
});
