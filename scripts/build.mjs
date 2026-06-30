import { cp, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(process.cwd());
const dist = join(root, "dist");

const items = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "_headers",
  "_redirects",
  "icons",
  "src",
  "scripts",
  "package.json",
  "README.md",
  "deploy-guide.md"
];

async function build() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  for (const item of items) {
    const src = join(root, item);
    const dest = join(dist, item);
    try {
      await cp(src, dest, { recursive: true });
    } catch (e) {
      console.warn(`Skip ${item}: ${e.message}`);
    }
  }

  console.log("Build complete: dist/");
}

build();
