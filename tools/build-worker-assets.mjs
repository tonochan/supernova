#!/usr/bin/env node
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "dist", "worker-assets");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of ["index.html", "style.css", "game.js"]) {
  await cp(join(root, file), join(outDir, file));
}

await mkdir(join(outDir, "assets"), { recursive: true });
await cp(join(root, "assets", "fonts"), join(outDir, "assets", "fonts"), { recursive: true });
