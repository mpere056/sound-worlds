import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseSong } from "@reaper-viz/core";
import { compileMarble } from "./index.js";

const args = process.argv.slice(2).filter((value) => value !== "--");
const projectArg = args[0];
if (!projectArg) throw new Error("Usage: pnpm compile:marble -- projects/<project> [--track <track-id>]");
const trackIndex = args.indexOf("--track");
const sourceTrackId = trackIndex >= 0 ? args[trackIndex + 1] : undefined;
const project = resolve(process.env.INIT_CWD ?? process.cwd(), projectArg);
const song = parseSong(JSON.parse(await readFile(resolve(project, "song.json"), "utf8")));
const output = resolve(project, "performance.marble.json");
const temporary = `${output}.tmp`;
await mkdir(dirname(output), { recursive: true });
await writeFile(temporary, `${JSON.stringify(compileMarble(song, sourceTrackId ? { sourceTrackId } : {}), null, 2)}\n`, "utf8");
await rename(temporary, output);
console.log(`WROTE: ${output}`);
