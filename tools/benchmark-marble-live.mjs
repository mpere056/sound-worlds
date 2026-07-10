import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { compileMarble } from "../compilers/marble/dist/index.js";

const defaultProject = "projects/untitled-project-418cb58f";
const args = process.argv.slice(2);
const json = args.includes("--json");
const runsIndex = args.indexOf("--runs");
const runs = runsIndex >= 0 ? Math.max(3, Number(args[runsIndex + 1] ?? 12)) : 12;
const projectArg = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--runs") ?? defaultProject;
const project = resolve(projectArg);
const song = JSON.parse(await readFile(resolve(project, "song.json"), "utf8"));
const mixes = [
  { leftRight: 20, upDown: 20, frontBack: 60 },
  { leftRight: 10, upDown: 10, frontBack: 80 },
  { leftRight: 45, upDown: 10, frontBack: 45 },
  { leftRight: 10, upDown: 80, frontBack: 10 },
];

function percentile(values, amount) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * amount))] ?? 0;
}

function rounded(value) {
  return Number(value.toFixed(2));
}

const results = [];
for (const motionMix of mixes) {
  const profiles = [];
  for (let run = 0; run <= runs; run += 1) {
    let profile;
    compileMarble(song, {
      motionMix,
      instrumentation: {
        now: () => performance.now(),
        report: (result) => { profile = result; },
      },
    });
    if (!profile) throw new Error("Marble compiler did not report a benchmark profile");
    if (run > 0) profiles.push(profile);
  }
  const totals = profiles.map((profile) => profile.totalMs);
  const phaseNames = Object.keys(profiles[0].phasesMs);
  const phasesMedianMs = Object.fromEntries(phaseNames.map((phase) => [
    phase,
    rounded(percentile(profiles.map((profile) => profile.phasesMs[phase]), 0.5)),
  ]));
  results.push({
    mix: `${motionMix.leftRight}/${motionMix.upDown}/${motionMix.frontBack}`,
    runs,
    total: {
      minMs: rounded(Math.min(...totals)),
      medianMs: rounded(percentile(totals, 0.5)),
      p95Ms: rounded(percentile(totals, 0.95)),
      maxMs: rounded(Math.max(...totals)),
    },
    phasesMedianMs,
    counters: profiles[0].counters,
  });
}

if (json) {
  console.log(JSON.stringify({ project, results }, null, 2));
} else {
  console.log(`Marble live benchmark: ${project}`);
  console.log(`Warm runs per mix: ${runs}`);
  console.table(results.map((result) => ({
    mix: result.mix,
    medianMs: result.total.medianMs,
    p95Ms: result.total.p95Ms,
    targetsMs: result.phasesMedianMs.targets,
    finalizeMs: result.phasesMedianMs.finalize,
    candidates: result.counters.targetCandidates,
    clearanceSamples: result.counters.routeClearanceSamples,
  })));
  for (const result of results) {
    console.log(`\n${result.mix} phase medians (ms)`);
    console.table(result.phasesMedianMs);
    console.log("work counters", result.counters);
  }
}
