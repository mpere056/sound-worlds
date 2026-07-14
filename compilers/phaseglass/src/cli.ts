import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSong } from "@reaper-viz/core";
import { compilePhaseglass, compilePhaseglassPlan } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const args = process.argv.slice(2).filter((value) => value !== "--");
const projectArg = args[0];
if (!projectArg) throw new Error("Usage: pnpm compile:phaseglass -- projects/<project> [--track <track-id>]");
const trackIndex = args.indexOf("--track");
const sourceTrackId = trackIndex >= 0 ? args[trackIndex + 1] : undefined;
if (trackIndex >= 0 && !sourceTrackId) throw new Error("Phaseglass --track requires a track ID");
const project = isAbsolute(projectArg) ? projectArg : resolve(root, projectArg);
const song = parseSong(JSON.parse(await readFile(resolve(project, "song.json"), "utf8")));
const options = sourceTrackId ? { sourceTrackId } : {};
const outputs = [
  { path: resolve(project, "phaseglass.plan.json"), value: compilePhaseglassPlan(song, options) },
  { path: resolve(project, "performance.phaseglass.json"), value: compilePhaseglass(song, options) },
];
await mkdir(project, { recursive: true });
for (const output of outputs) {
  const temporary = `${output.path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(output.value, null, 2)}\n`, "utf8");
  await rename(temporary, output.path);
  console.log(`WROTE: ${output.path}`);
}
