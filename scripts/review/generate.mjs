import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  chmod,
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
    "레디보드 받은편지함 시연 HTML\n\nreadyboard-review.html을 Chrome 또는 Edge에서 여세요.\n새 메일 확인 → 5통 수집 → 규칙 기반 분석 → 초안 2건 → 검토·승인을 시연할 수 있습니다.\nHTML의 모든 데이터는 합성 시연 자료이며 현재 탭의 메모리에서만 바뀝니다. 새로고침하면 초기화됩니다.\n외부 메일·실제 AI·실제 DB 저장은 서버 실행이 필요합니다.\n파일 열기가 제한되면 Node.js 설치 후 open-preview.cmd 또는 node serve-review.cjs를 실행하세요.\n";
  const archive = makeZip([
    { name: "readyboard-review.html", bytes: new TextEncoder().encode(html) },
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
