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
import { createApplication } from "../../server/app.js";
import { viewState } from "../../server/store.js";
import { makeZip } from "../../src/archive.js";
const root = process.cwd(),
  temporary = await mkdtemp(path.join(os.tmpdir(), "readyboard-review-"));
const app = createApplication({
  dbPath: path.join(temporary, "preview.sqlite"),
  staticRoot: path.join(root, "dist"),
  passwords: { PMO: "preview-only-local" },
  seedDemo: true,
  inviteTtlMs: 3600000,
  aiKey: "",
  mailProvider: "mock",
  testMode: true,
});
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${app.server.address().port}`;
let cookie;
async function call(
  route,
  body,
  method = body ? "POST" : "GET",
  raw,
  headers = {},
) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  if (route === "/api/admin/login")
    cookie = response.headers.get("set-cookie").split(";")[0];
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}
try {
  await call("/api/admin/login", {
    scope: "PMO",
    password: "preview-only-local",
  });
  const uploaded = await call(
      "/api/imports?project=SFA",
      null,
      "POST",
      await readFile("public/examples/메일검토_기준인력.xlsx"),
      { "X-File-Name": "preview.xlsx" },
    ),
    mapping = {
      sheet: 0,
      headerRow: 1,
      columns: { company: 1, name: 2, birth: 3 },
    },
    rows = (await call(`/api/imports/${uploaded.id}/preview`, { mapping }))
      .rows;
  const imported = await call(`/api/imports/${uploaded.id}/commit`, {
      mapping,
      mappingConfirmed: true,
      rows: rows.map((r) => ({ ...r, decision: "new" })),
    }),
    kimId = imported.created[0],
    invitation = await call(`/api/people/${kimId}/invitation`, {}),
    token = invitation.url.split("/").pop();
  await call(`/api/invites/${token}`, {
    birthDate: "1990-01-01",
    phone: "01012345678",
    start: "2026-11-23",
    end: "2027-06-30",
    confirmed: true,
  });
  let state = app.store.load(),
    kim = state.people.find((p) => p.id === kimId);
  kim.tasks.O08 = "done";
  kim.files.O08 = { name: "검토용_기존수료증.pdf", demo: true };
  kim.certChecks.O08 = "done";
  app.store.transaction(() => app.store.save(state));
  const dataset = { kimId, stages: {} };
  async function capture(stage) {
    const inbox = await call("/api/mail/inbox"),
      details = {},
      messages = {};
    for (const req of inbox.requests)
      details[req.id] = (await call(`/api/mail/requests/${req.id}`)).request;
    for (const m of inbox.messages)
      messages[m.id] = (await call(`/api/mail/messages/${m.id}`)).message;
    dataset.stages[stage] = {
      states: {
        pmo: viewState(app.store, { kind: "admin", scope: "PMO" }),
        sfa: viewState(app.store, { kind: "admin", scope: "SFA" }),
        member: viewState(app.store, { kind: "member", personId: kimId }),
      },
      inbox,
      details,
      messages,
    };
  }
  await call("/api/mail/sync", {});
  await capture("before");
  const before = dataset.stages.before;
  for (const req of before.inbox.requests) {
    let draft = before.details[req.id];
    if (req.payload.type === "change")
      draft = (
        await call(
          `/api/mail/requests/${req.id}`,
          { version: draft.version, edit: { ...draft.edit, personId: kimId } },
          "PATCH",
        )
      ).request;
    await call(`/api/mail/requests/${req.id}/approve`, {
      version: draft.version,
      reviewConfirmed: true,
      newRecordConfirmed: true,
    });
  }
  await capture("after");
  const lee = app.store.load().people.find((p) => p.name === "이서연"),
    leeInvite = await call(`/api/people/${lee.id}/invitation`, {});
  dataset.leeInvite = (
    await call(`/api/invites/${leeInvite.url.split("/").pop()}`)
  ).person;
  dataset.leeId = lee.id;
  await call(
    "/api/mail/settings",
    { folder: "PMO/회신검증", search: "", since: "" },
    "PUT",
  );
  await call("/api/mail/sync", {});
  await capture("reply");
  await writeFile("artifacts/review-data.json", JSON.stringify(dataset));
  await app.close();
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
    "brand/woori-mascots.png",
    "brand/woori-guide.png",
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
      people: before.states.pmo.people.length,
      requests: before.inbox.requests.length,
    }),
  );
} finally {
  if (app.server.listening) await app.close();
  await rm(temporary, { recursive: true, force: true });
}
