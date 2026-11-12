import { build } from "vite";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(
  root,
  process.argv[2] || "preview/tuipon-preview.html",
);
const temporary = await mkdtemp(path.join(os.tmpdir(), "tuipon-html-"));
const mime = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const asset = async (name) => {
  const bytes = await readFile(path.join(root, "public", name));
  return `data:${mime[path.extname(name)]};base64,${bytes.toString("base64")}`;
};

try {
  await build({
    root,
    configFile: path.join(root, "vite.config.js"),
    build: {
      outDir: temporary,
      emptyOutDir: true,
      modulePreload: false,
      cssCodeSplit: false,
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  let html = await readFile(path.join(temporary, "index.html"), "utf8");
  const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
  const stylesheet = html.match(
    /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/,
  );
  if (!script || !stylesheet)
    throw new Error("Expected one bundled script and stylesheet.");
  let js = await readFile(path.join(temporary, script[1]), "utf8");
  let css = await readFile(path.join(temporary, stylesheet[1]), "utf8");
  for (const name of ["brand/woori-mascots.png", "brand/woori-guide.png"])
    js = js.replaceAll(`/${name}`, await asset(name));
  css = css.replaceAll(
    "/fonts/InterVariable.woff2",
    await asset("fonts/InterVariable.woff2"),
  );
  html = html.replace(
    script[0],
    () =>
      `<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>`,
  );
  html = html.replace(
    stylesheet[0],
    () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
  );
  html = html.replace("/favicon.svg", await asset("favicon.svg"));
  const notices = await readFile(
    path.join(root, "THIRD_PARTY_NOTICES.md"),
    "utf8",
  );
  const license = await readFile(
    path.join(root, "public/fonts/Inter-LICENSE.txt"),
    "utf8",
  );
  html += `\n<!--\nStandalone prototype export. Includes simulated AI and browser-local data.\n${notices}\n${license}\n-->\n`;
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, html);
  console.log(`Standalone HTML: ${output} (${Buffer.byteLength(html)} bytes)`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
