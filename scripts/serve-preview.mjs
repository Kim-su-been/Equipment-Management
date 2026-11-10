import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.PORT || 5173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
const server = http.createServer(async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
  } catch {
    res.writeHead(400);
    res.end("Invalid URL");
    return;
  }
  const target = path.resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    ),
    relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  let info;
  try {
    info = await stat(target);
  } catch {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  if (!info.isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": types[path.extname(target)] || "application/octet-stream",
    "Content-Length": info.size,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(target);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is in use. Run with PORT=5174 to select another port.`
      : error.message,
  );
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`TuipON preview: http://localhost:${port}`);
  console.log(
    "Stop: Ctrl+C. Static built preview; no native build dependencies are loaded.",
  );
});
