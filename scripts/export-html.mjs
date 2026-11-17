// All previously shared HTML download paths now contain the complete browser-only demo.
import { copyFile } from "node:fs/promises";
import path from "node:path";
await import("./review/generate.mjs");
if (process.argv[2]) {
  const target = path.resolve(process.argv[2]);
  await copyFile("preview/readyboard-review.html", target);
  await copyFile(
    "preview/readyboard-review.zip",
    target.replace(/\.html$/i, ".zip"),
  );
  console.log(`HTML 단독 시연: ${target}`);
}
