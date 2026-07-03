import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSong } from "@reaper-viz/core";
import { compileMetro } from "./index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const arg = process.argv.slice(2).filter((value) => value !== "--")[0];
if (!arg) throw new Error("Usage: pnpm compile:metro -- projects/<project>");
const project = isAbsolute(arg) ? arg : resolve(ROOT, arg);
const output = resolve(project, "performance.metro.json");
const temporary = `${output}.tmp`;
await mkdir(project, { recursive: true });
const song = parseSong(JSON.parse(await readFile(resolve(project, "song.json"), "utf8")));
await writeFile(temporary, `${JSON.stringify(compileMetro(song), null, 2)}\n`, "utf8");
await rename(temporary, output);
console.log(`WROTE: ${output}`);
