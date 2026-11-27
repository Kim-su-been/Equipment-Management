import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  chmod,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { build } from "vite";
import { makeZip } from "../../src/archive.js";
const root = process.cwd(),
  temporary = await mkdtemp(path.join(os.tmpdir(), "readyboard-offline-"));
const dataset = JSON.parse(
  await readFile(path.join(root, "scripts/review/seed.json"), "utf8"),
);
try {
  const out = path.join(temporary, "bundle");
  await build({
    root,
    configFile: path.join(root, "vite.config.js"),
    build: {
      outDir: out,
      emptyOutDir: true,
      modulePreload: false,
      cssCodeSplit: false,
      rollupOptions: {
        input: path.join(root, "scripts/review/index.html"),
        output: { inlineDynamicImports: true },
      },
    },
  });
  let html = await readFile(
    path.join(out, "scripts/review/index.html"),
    "utf8",
  );
  const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/),
    stylesheet = html.match(
      /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/,
    );
  let js = await readFile(path.join(out, script[1]), "utf8"),
    css = await readFile(path.join(out, stylesheet[1]), "utf8");
  const mime = {
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".pdf": "application/pdf",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  async function asset(name) {
    return `data:${mime[path.extname(name)]};base64,${(await readFile(path.join(root, "public", name))).toString("base64")}`;
  }
  for (const name of [
    "brand/tongyang-family.png",
    "brand/tongyang-ci.svg",
    "brand/tongyang-gelodi.png",
    "forms/security-pledge.png",
    "forms/security-pledge.pdf",
    "forms/privacy-consent.png",
    "forms/privacy-consent.pdf",
    "examples/인력계획서_A.xlsx",
    "examples/인력계획서_B.xlsx",
    "examples/메일검토_기준인력.xlsx",
  ])
    js = js.replaceAll(`/${name}`, await asset(name));
  css = css.replaceAll(
    "/fonts/InterVariable.woff2",
    await asset("fonts/InterVariable.woff2"),
  );
  html = html
    .replace(
      script[0],
      () =>
        `<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>`,
    )
    .replace(
      stylesheet[0],
      () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
    );
  const buildId = /^[0-9a-f]{7,40}$/i.test(
    process.env.VERCEL_GIT_COMMIT_SHA || "",
  )
    ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
    : "static-offline-v3";
  html = html.replace(
    "</head>",
    `<meta name="readyboard-mode" content="offline"/><meta name="readyboard-build" content="${buildId}"/></head>`,
  );
  html +=
    "\n<!--\n" +
    (await readFile("THIRD_PARTY_NOTICES.md", "utf8")) +
    "\n" +
    (await readFile("public/fonts/Inter-LICENSE.txt", "utf8")) +
    "\n-->\n";
  await mkdir("preview", { recursive: true });
  const output = "preview/readyboard-review.html";
  await writeFile(output, html);
  await chmod(output, 0o644);
  const instructions =
    "레디보드 HTML 단독 시연\n\nreadyboard-offline.html을 Chrome 또는 Edge에서 여세요. Node.js나 서버 실행은 필요 없습니다.\n상단 역할에서 PMO / SFA / 그룹웨어 / 수행사를 전환하고 수행사 인원을 선택하세요.\n엑셀 불러오기, 초대 링크 생성·등록, 계정 작업, 서류 작성·제출·승인, 수료증 업로드, ZIP 다운로드, 문의·알림, 메일 요청 검토가 모두 이 브라우저에서 동작합니다.\n개인 초대는 같은 파일과 브라우저에서 열어주세요. 다른 PC·브라우저의 DB와는 연결되지 않습니다.\n명단·업로드 원본·초대·검토 이력은 IndexedDB에 저장됩니다. 브라우저 데이터 삭제·다른 파일 위치로 이동 전 ‘시연 백업’을 내려받고 ‘백업 불러오기’로 복원하세요.\n외부 메일 수신·AI·본인확인·Dooray 전송은 가상 시연이며 실제 외부 서비스는 호출하지 않습니다.\n초기화는 상단 ‘시연 초기화 → 초기화 실행’입니다. 새로고침만으로 데이터가 지워지지 않습니다.\n";
  const archive = makeZip([
    { name: "readyboard-offline.html", bytes: new TextEncoder().encode(html) },
    { name: "README.txt", bytes: new TextEncoder().encode(instructions) },
    {
      name: "serve-review.cjs",
      bytes: await readFile("scripts/review/serve-review.cjs"),
    },
    {
      name: "open-preview.cmd",
      bytes: new TextEncoder().encode(
        "@echo off\r\ncd /d %~dp0\r\nnode serve-review.cjs\r\npause\r\n",
      ),
    },
  ]);
  await writeFile(
    "preview/readyboard-review.zip",
    new Uint8Array(await archive.arrayBuffer()),
  );
  await chmod("preview/readyboard-review.zip", 0o644);
  for (const name of [
    "readyboard-offline",
    "readyboard-preview",
    "tuipon-preview",
  ]) {
    await copyFile(output, `preview/${name}.html`);
    await copyFile("preview/readyboard-review.zip", `preview/${name}.zip`);
  }
  console.log(
    JSON.stringify({
      html: output,
      bytes: Buffer.byteLength(html),
      zip: "preview/readyboard-review.zip",
      mode: "offline",
      people: dataset.stages.before.states.pmo.people.length,
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
