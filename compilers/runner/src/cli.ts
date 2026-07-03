import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSong } from "@reaper-viz/core";
import { compileRunner } from "./index.js";

const argument = process.argv.slice(2).find((value) => value !== "--");
if (!argument) {
  console.error("Usage: pnpm compile:runner -- projects/<project>");
  process.exitCode = 1;
} else {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const project = isAbsolute(argument) ? argument : resolve(repositoryRoot, argument);
  const song = parseSong(JSON.parse(await readFile(resolve(project, "song.json"), "utf8")));
  const performance = compileRunner(song);
  const output = resolve(project, "performance.runner.json");
  const temporary = `${output}.tmp`;
  await writeFile(temporary, `${JSON.stringify(performance, null, 2)}\n`, "utf8");
  await rename(temporary, output);
  console.log(`WROTE: ${output} (${performance.statics.terrain.heights.length} terrain samples)`);
}
