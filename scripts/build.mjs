import { cp, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(process.cwd());
const dist = join(root, "dist");

// 需要复制到 dist 的目录/文件
const items = ["index.html", "manifest.webmanifest", "sw.js", "icons", "src", "scripts", "package.json"];

async function build() {
  await mkdir(dist, { recursive: true });
  for (const item of items) {
    const src = join(root, item);
    const dest = join(dist, item);
    try {
      await cp(src, dest, { recursive: true });
    } catch (e) {
      console.warn(`跳过 ${item}: ${e.message}`);
    }
  }
  console.log("Build complete: dist/");
}

build();
