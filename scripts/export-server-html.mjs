import { build } from "vite";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  copyFile,
  chmod,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { makeZip } from "../src/archive.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(
  root,
  process.argv[2] || "preview/readyboard-preview.html",
);
const temporary = await mkdtemp(path.join(os.tmpdir(), "tuipon-html-"));
const mime = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
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
  for (const name of [
    "brand/woori-mascots.png",
    "brand/woori-guide.png",
    "forms/security-pledge.png",
    "forms/security-pledge.pdf",
    "forms/privacy-consent.png",
    "forms/privacy-consent.pdf",
  ])
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
  html += `\n<!--\nServer-connected UI export. Registration, shared state and evidence require Readyboard server/SQLite.\n${notices}\n${license}\n-->\n`;
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, html);
  await chmod(output, 0o644);
  console.log(`Standalone HTML: ${output} (${Buffer.byteLength(html)} bytes)`);
  const zipOutput = path.join(
    path.dirname(output),
    `${path.basename(output, path.extname(output))}.zip`,
  );
  const instructions = `레디보드 HTML 화면 자산

이 파일에는 화면 자산만 포함됩니다.
인원 등록·개인 초대 링크·서류와 상태 공유에는 레디보드 서버와 SQLite DB가 필요합니다.
저장소의 .env.example과 README를 참고하여 npm ci, 환경변수 설정, npm run dev로 실행해 주세요.
HTML 파일을 직접 열면 서버 연결 안내가 표시됩니다.
`;
  const archive = makeZip([
    { name: path.basename(output), bytes: new TextEncoder().encode(html) },
    { name: "README.txt", bytes: new TextEncoder().encode(instructions) },
  ]);
  await writeFile(zipOutput, new Uint8Array(await archive.arrayBuffer()));
  await chmod(zipOutput, 0o644);
  console.log(`Standalone ZIP: ${zipOutput} (${archive.size} bytes)`);
  if (!process.argv[2]) {
    // Preserve the previously shared download URLs while using the new brand name.
    const legacyHtml = path.join(root, "preview/tuipon-preview.html");
    const legacyZip = path.join(root, "preview/tuipon-preview.zip");
    await copyFile(output, legacyHtml);
    await chmod(legacyHtml, 0o644);
    await copyFile(zipOutput, legacyZip);
    await chmod(legacyZip, 0o644);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
