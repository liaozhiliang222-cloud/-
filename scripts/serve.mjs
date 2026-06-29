import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";

const types = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json;charset=utf-8"
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = normalize(join(root, requestPath));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain;charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, host, () => {
  console.log(`SynthUser prototype: http://${host}:${port}`);
});
