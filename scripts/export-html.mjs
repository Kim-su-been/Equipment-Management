import { build } from "vite";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { makeZip } from "../src/archive.js";

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
  const zipOutput = path.join(
    path.dirname(output),
    `${path.basename(output, path.extname(output))}.zip`,
  );
  const instructions = `투입ON HTML 미리보기

1. ZIP 파일의 압축을 풀어 주세요.
2. ${path.basename(output)} 파일을 Chrome 또는 Edge에서 열어 주세요.
3. 서버 실행이나 npm 설치 없이 화면을 확인할 수 있습니다.

본인 등록·서류 작성·제출·주관사 검토·원본 ZIP 다운로드를 확인할 수 있습니다.
본인확인·AI 가이드는 시연 기능이며 실제 인증·AI 모델·Dooray 전송은 미연동입니다.
입력한 데이터는 현재 브라우저에 보관됩니다. 가상 정보를 사용해 주세요.
`;
  const archive = makeZip([
    { name: path.basename(output), bytes: new TextEncoder().encode(html) },
    { name: "README.txt", bytes: new TextEncoder().encode(instructions) },
  ]);
  await writeFile(zipOutput, new Uint8Array(await archive.arrayBuffer()));
  console.log(`Standalone ZIP: ${zipOutput} (${archive.size} bytes)`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
