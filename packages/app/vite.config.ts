import { createReadStream, existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(APP_DIR, "../..");
const PROJECTS = join(ROOT, "projects");

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
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
          if (url.pathname === "/api/projects") {
            const projects = await Promise.all((await projectNames()).map(async (id) => {
              const song = JSON.parse(await readFile(join(PROJECTS, id, "song.json"), "utf8")) as { meta: { name: string; durationSec: number } };
              return { id, name: song.meta.name, durationSec: song.meta.durationSec };
            }));
            sendJson(response, 200, projects);
            return;
          }
          const match = /^\/api\/projects\/([^/]+)\/(song\.json|master\.wav)$/.exec(url.pathname);
          if (!match) { next(); return; }
          const project = await resolveProject(decodeURIComponent(match[1] ?? ""));
          if (!project) { sendJson(response, 404, { error: "Unknown project" }); return; }
          if (match[2] === "song.json") {
            sendJson(response, 200, JSON.parse(await readFile(join(project, "song.json"), "utf8")));
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
