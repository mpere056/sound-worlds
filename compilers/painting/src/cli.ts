import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseSong } from "@reaper-viz/core";
import { compilePainting } from "./index.js";

const arg = process.argv.at(-1);
if (!arg) throw new Error("Usage: pnpm compile:painting -- projects/<project>");
const project = resolve(process.env.INIT_CWD ?? process.cwd(), arg);
const song = parseSong(JSON.parse(await readFile(resolve(project, "song.json"), "utf8")));
const output = resolve(project, "performance.painting.json");
const temporary = `${output}.tmp`;
await mkdir(dirname(output), { recursive: true });
await writeFile(temporary, `${JSON.stringify(compilePainting(song), null, 2)}\n`, "utf8");
await rename(temporary, output);
console.log(`WROTE: ${output}`);
