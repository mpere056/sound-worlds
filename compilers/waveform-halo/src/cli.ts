import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSong } from "@reaper-viz/core";
import { compileWaveformHalo } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const projectArg = process.argv.slice(2).filter((value) => value !== "--")[0];
if (!projectArg) throw new Error("Usage: pnpm compile:waveform-halo -- projects/<project>");
const project = isAbsolute(projectArg) ? projectArg : resolve(root, projectArg);
const output = resolve(project, "performance.waveform-halo.json");
await mkdir(project, { recursive: true });
const song = parseSong(JSON.parse(await readFile(resolve(project, "song.json"), "utf8")));
const temporary = `${output}.tmp`;
await writeFile(temporary, `${JSON.stringify(compileWaveformHalo(song), null, 2)}\n`, "utf8");
await rename(temporary, output);
console.log(`WROTE: ${output}`);
