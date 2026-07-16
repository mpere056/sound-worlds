import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSong } from "@reaper-viz/core";
import { compileVortexLoom, compileVortexLoomPlan } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const args = process.argv.slice(2).filter((value) => value !== "--");
const projectArg = args[0];
if (!projectArg) throw new Error("Usage: pnpm compile:vortex-loom -- projects/<project> [--track <track-id>]");
const trackIndex = args.indexOf("--track");
const sourceTrackId = trackIndex >= 0 ? args[trackIndex + 1] : undefined;
if (trackIndex >= 0 && !sourceTrackId) throw new Error("Vortex Loom --track requires a track ID");
const project = isAbsolute(projectArg) ? projectArg : resolve(root, projectArg);
const planOutput = resolve(project, "vortex-loom.plan.json");
const performanceOutput = resolve(project, "performance.vortex-loom.json");
await mkdir(project, { recursive: true });
const song = parseSong(JSON.parse(await readFile(resolve(project, "song.json"), "utf8")));
const options = sourceTrackId ? { sourceTrackId } : {};
for (const [output, value] of [[planOutput, compileVortexLoomPlan(song, options)], [performanceOutput, compileVortexLoom(song, options)]] as const) {
  const temporary = `${output}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, output);
  console.log(`WROTE: ${output}`);
}
