// Vercel serves this directory as static files. No API server, SQLite, .env, or secret is needed.
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
await import("./review/generate.mjs");
const source = path.resolve("preview/readyboard-offline.html"),
  output = path.resolve("dist");
const html = await readFile(source, "utf8");
if (
  !html.includes('name="readyboard-mode" content="offline"') ||
  !html.includes("HTML 단독 시연") ||
  /<script\b[^>]*\bsrc=/.test(html)
)
  throw new Error("정적 배포용 HTML을 확인할 수 없습니다.");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile(source, path.join(output, "index.html"));
console.log(
  "Readyboard static deployment: dist/index.html · offline browser storage · no runtime API",
);
