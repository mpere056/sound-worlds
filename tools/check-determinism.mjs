import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const roots = ["packages/core", "packages/render", "compilers", "scenes"];
const forbidden = [
  [/(^|\W)Math\.random\s*\(/g, "Math.random"],
  [/(^|\W)Date\.now\s*\(/g, "Date.now"],
  [/(^|\W)performance\.now\s*\(/g, "performance.now"],
];

async function filesBelow(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
      const child = join(path, entry.name);
      if (entry.isDirectory() && entry.name !== "dist" && entry.name !== "node_modules") return filesBelow(child);
      return entry.isFile() && [".ts", ".tsx", ".js", ".mjs"].includes(extname(entry.name)) ? [child] : [];
    }));
    return nested.flat();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

const violations = [];
for (const root of roots) {
  for (const file of await filesBelow(root)) {
    const source = await readFile(file, "utf8");
    for (const [pattern, label] of forbidden) {
      pattern.lastIndex = 0;
      if (pattern.test(source)) violations.push(`${relative(".", file)}: forbidden ${label}`);
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("determinism check: OK");
}
