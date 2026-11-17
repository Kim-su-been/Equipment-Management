import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import ExcelJS from "exceljs";
import { createApplication } from "../server/app.js";
import { parseBirth } from "../server/birth.js";
import {
  readWorkbook,
  maskedStructure,
  aiMapping,
} from "../server/workbook.js";
import { statePatch } from "../src/state-patch.js";
import { seed, progress, isPrepared, TASKS, taskStatus } from "../src/data.js";
const files = {
  A: new URL("../public/examples/인력계획서_A.xlsx", import.meta.url),
  B: new URL("../public/examples/인력계획서_B.xlsx", import.meta.url),
};
async function setup(t, extra = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "readyboard-api-"));
  const app = createApplication({
    dbPath: path.join(dir, "db.sqlite"),
    staticRoot: path.resolve("dist"),
    passwords: { PMO: "test-admin", SFA: "test-sfa", 그룹웨어: "test-gw" },
    inviteTtlMs: 3600000,
    aiKey: "",
    testMode: true,
    ...extra,
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  async function request(
    route,
    { cookie, method = "GET", body, raw, headers = {} } = {},
  ) {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(raw ? {} : body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: raw || (body ? JSON.stringify(body) : undefined),
    });
    const data = await response.json();
    return {
      status: response.status,
      data,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  async function login(scope = "PMO") {
    const response = await request("/api/admin/login", {
      method: "POST",
      body: {
        scope,
        password:
          scope === "PMO"
            ? "test-admin"
            : scope === "SFA"
              ? "test-sfa"
              : "test-gw",
      },
    });
    assert.equal(response.status, 200);
    return response.cookie;
  }
  return { ...app, base, request, login };
}
async function upload(ctx, cookie, kind = "A", project = "SFA", bytes) {
  const result = await ctx.request(
    `/api/imports?project=${encodeURIComponent(project)}`,
    {
      cookie,
      method: "POST",
      raw: bytes || (await readFile(files[kind])),
      headers: { "X-File-Name": `${kind}.xlsx` },
    },
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const mapping = {
    sheet: result.data.proposal.sheet,
    headerRow: result.data.proposal.headerRow,
    columns: result.data.proposal.columns,
  };
  const preview = await ctx.request(`/api/imports/${result.data.id}/preview`, {
    cookie,
    method: "POST",
    body: { mapping },
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  return { ...result.data, mapping, rows: preview.data.rows };
}
async function commit(ctx, cookie, load, overrides = {}) {
  return ctx.request(`/api/imports/${load.id}/commit`, {
    cookie,
    method: "POST",
    body: {
      mapping: load.mapping,
      mappingConfirmed: true,
      rows: load.rows.map((r) => ({
        ...r,
        decision: "new",
        reviewConfirmed: true,
        ...overrides,
      })),
    },
  });
}
const validRegistration = {
  birthDate: "1994-03-14",
  phone: "010-1234-5678",
  start: "2026-11-17",
  end: "2027-06-30",
  confirmed: true,
};
test("A/B raw extraction, year-only review and exact reupload are idempotent", async (t) => {
  const ctx = await setup(t),
    cookie = await ctx.login(),
    a = await upload(ctx, cookie);
  assert.equal(a.proposal.source, "rules");
  assert.match(a.proposal.notice, /AI 미연결/);
  assert.equal(a.rows[0].birthDate, "1994-03-14");
  const first = await commit(ctx, cookie, a);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.created.length, 2);
  const ids = first.data.created;
  assert.match(ids[0], /^[a-f0-9-]{36}$/);
  assert.equal(
    first.data.state.people[0].registrationStatus,
    "pending_registration",
  );
  const retry = await commit(ctx, cookie, a);
  assert.deepEqual(retry.data.reused, ids);
  assert.equal(retry.data.state.people.length, 2);
  const re = await upload(ctx, cookie);
  assert.equal(re.id, a.id);
  assert.equal(re.reuploaded, true);
  assert.equal(re.rows[0].linkedPersonId, ids[0]);
  const b = await upload(ctx, cookie, "B", "그룹웨어");
  assert.equal(b.mapping.headerRow, 3);
  assert.equal(b.mapping.columns.name, 3);
  assert.equal(b.rows[0].birthYear, 1996);
  assert.equal(b.rows[0].birthDate, null);
  assert.equal(b.rows[0].birthMonth, null);
  assert.equal(b.rows[0].review, "확인 필요");
  assert.equal(b.rows[0].decision, "");
  const blocked = await ctx.request(`/api/imports/${b.id}/commit`, {
    cookie,
    method: "POST",
    body: { mapping: b.mapping, mappingConfirmed: true, rows: b.rows },
  });
  assert.equal(blocked.status, 400);
  const saved = await commit(ctx, cookie, b);
  assert.equal(saved.data.created.length, 2);
  assert.equal(saved.data.state.people.length, 4);
  assert.notEqual(saved.data.created[0], saved.data.created[1]);
});
test("same names require explicit choice, PMO can link existing or create separate record", async (t) => {
  const ctx = await setup(t),
    cookie = await ctx.login(),
    a = await upload(ctx, cookie),
    first = await commit(ctx, cookie, a);
  const wb = new ExcelJS.Workbook(),
    s = wb.addWorksheet("신규인력");
  s.addRow(["소속회사", "이름", "생년월일"]);
  s.addRow(["별도회사", "김하늘", "1988-06-01"]);
  const second = await upload(
    ctx,
    cookie,
    "A",
    "SFA",
    Buffer.from(await wb.xlsx.writeBuffer()),
  );
  assert.equal(second.rows[0].needsDecision, true);
  assert.equal(second.rows[0].decision, "");
  assert.equal(second.rows[0].candidates[0].id, first.data.created[0]);
  const noChoice = await ctx.request(`/api/imports/${second.id}/commit`, {
    cookie,
    method: "POST",
    body: {
      mapping: second.mapping,
      mappingConfirmed: true,
      rows: second.rows,
    },
  });
  assert.equal(noChoice.status, 400);
  const linked = await commit(ctx, cookie, second, {
    decision: "existing",
    personId: first.data.created[0],
  });
  assert.equal(linked.data.state.people.length, 2);
  assert.equal(linked.data.state.people[0].company, "샘플테크");
  assert.equal(linked.data.state.people[0].importSources.length, 2);
});
test("invite reissue, expired/used links and second-browser completion retain the same person ID", async (t) => {
  const ctx = await setup(t),
    cookie = await ctx.login(),
    a = await upload(ctx, cookie),
    saved = await commit(ctx, cookie, a),
    id = saved.data.created[0];
  const route = `/api/people/${id}/invitation`;
  const issue = await ctx.request(route, { cookie, method: "POST", body: {} });
  assert.equal(issue.status, 200);
  const token = issue.data.url.split("/").pop();
  assert.equal((await ctx.request(`/api/invites/${token}`)).data.person.id, id);
  const reissued = await ctx.request(route, {
    cookie,
    method: "POST",
    body: { reissue: true },
  });
  assert.equal((await ctx.request(`/api/invites/${token}`)).status, 410);
  const fresh = reissued.data.url.split("/").pop();
  ctx.store.db
    .prepare(
      "UPDATE invitations SET expires_at=? WHERE used_at IS NULL AND revoked_at IS NULL",
    )
    .run(Date.now() - 1);
  assert.equal((await ctx.request(`/api/invites/${fresh}`)).status, 410);
  const last = await ctx.request(route, {
      cookie,
      method: "POST",
      body: { reissue: true },
    }),
    active = last.data.url.split("/").pop();
  const wrong = await ctx.request(`/api/invites/${active}`, {
    method: "POST",
    body: { ...validRegistration, birthDate: "1990-01-01" },
  });
  assert.equal(wrong.status, 400);
  const complete = await ctx.request(`/api/invites/${active}`, {
    method: "POST",
    body: validRegistration,
  });
  assert.equal(complete.status, 200, JSON.stringify(complete.data));
  assert.equal(complete.data.actor.personId, id);
  assert.equal(complete.data.state.people.length, 1);
  assert.equal(complete.data.state.people[0].registrationStatus, "registered");
  assert.equal(
    (
      await ctx.request(`/api/invites/${active}`, {
        method: "POST",
        body: validRegistration,
      })
    ).status,
    410,
  );
  const refreshed = await ctx.request("/api/state", { cookie });
  assert.equal(
    refreshed.data.state.people.find((p) => p.id === id).registrationStatus,
    "registered",
  );
  assert.equal(refreshed.data.state.people.length, 2);
  const uploadFile = await ctx.request(`/api/files?personId=${id}&taskId=O08`, {
    cookie: complete.cookie,
    method: "POST",
    raw: Buffer.from("%PDF-1.4 test"),
    headers: {
      "Content-Type": "application/pdf",
      "X-File-Name": "certificate.pdf",
    },
  });
  assert.equal(uploadFile.status, 201);
  const fileRes = await fetch(ctx.base + `/api/files/${uploadFile.data.id}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(await fileRes.text(), "%PDF-1.4 test");
  const person = complete.data.state.people[0],
    next = structuredClone(complete.data.state);
  next.people[0].files.O08 = {
    storageId: uploadFile.data.id,
    name: "certificate.pdf",
  };
  next.people[0].tasks.O08 = "done";
  next.people[0].certChecks.O08 = "ai";
  const patch = await ctx.request("/api/state", {
    cookie: complete.cookie,
    method: "PATCH",
    body: { operations: statePatch(complete.data.state, next) },
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.data));
  const pmo = await ctx.request("/api/state", { cookie });
  assert.equal(
    pmo.data.state.people.find((p) => p.id === person.id).tasks.O08,
    "done",
  );
  assert.ok(
    ctx.store.db.prepare("SELECT * FROM audit_log WHERE person_id=?").all(id)
      .length >= 4,
  );
});
test("year-only birth is completed without inventing month/day and enforces known year", async (t) => {
  const ctx = await setup(t),
    cookie = await ctx.login(),
    b = await upload(ctx, cookie, "B"),
    saved = await commit(ctx, cookie, b),
    id = saved.data.created[0],
    issue = await ctx.request(`/api/people/${id}/invitation`, {
      cookie,
      method: "POST",
      body: {},
    }),
    route = new URL(issue.data.url).pathname.replace(
      "/invite/",
      "/api/invites/",
    );
  const wrong = await ctx.request(route, {
    method: "POST",
    body: validRegistration,
  });
  assert.equal(wrong.status, 400);
  const complete = await ctx.request(route, {
    method: "POST",
    body: { ...validRegistration, birthDate: "1996-04-12" },
  });
  assert.equal(complete.status, 200);
  assert.equal(complete.data.state.people[0].birthDate, "1996-04-12");
});
test("server permissions and optimistic conflict checks block out-of-scope writes", async (t) => {
  const ctx = await setup(t),
    pmo = await ctx.login(),
    sfa = await ctx.login("SFA"),
    a = await upload(ctx, pmo, "A", "그룹웨어"),
    saved = await commit(ctx, pmo, a);
  assert.equal((await ctx.request("/api/state")).status, 401);
  assert.equal(
    (await ctx.request("/api/state", { cookie: sfa })).data.state.people.length,
    0,
  );
  assert.equal(
    (
      await ctx.request("/api/imports?project=SFA", {
        cookie: sfa,
        method: "POST",
        raw: await readFile(files.A),
        headers: { "X-File-Name": "A.xlsx" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await ctx.request(`/api/people/${saved.data.created[0]}/invitation`, {
        cookie: sfa,
        method: "POST",
        body: {},
      })
    ).status,
    403,
  );
  const before = saved.data.state,
    next = structuredClone(before);
  next.people[0].phone = "01012345678";
  const operations = statePatch(before, next);
  assert.equal(
    (
      await ctx.request("/api/state", {
        cookie: sfa,
        method: "PATCH",
        body: { operations },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await ctx.request("/api/state", {
        cookie: pmo,
        method: "PATCH",
        body: { operations },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await ctx.request("/api/state", {
        cookie: pmo,
        method: "PATCH",
        body: { operations },
      })
    ).status,
    409,
  );
  const invalid = await ctx.request("/api/state", {
    cookie: pmo,
    method: "PATCH",
    body: {
      operations: [{ path: ["settings", "__proto__"], value: { bad: true } }],
    },
  });
  assert.equal(invalid.status, 400);
});
test("legacy local data migrates deterministically and retired seats never affect readiness", async (t) => {
  const ctx = await setup(t),
    cookie = await ctx.login(),
    legacy = seed();
  legacy.seats = { "A-01": { personId: "SFA-1" } };
  legacy.versions = [{ id: "old" }];
  legacy.people[0].tasks.O14 = "done";
  const result = await ctx.request("/api/migrate", {
    cookie,
    method: "POST",
    body: legacy,
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const id = result.data.idMap["SFA-1"];
  assert.equal(result.data.state.people[0].id, id);
  assert.equal(result.data.state.people[0].displayId, "SFA-1");
  assert.equal(result.data.state.seats, undefined);
  assert.equal(result.data.state.versions, undefined);
  assert.equal(result.data.state.people[0].tasks.O14, undefined);
  assert.equal(progress(result.data.state.people[0]), 100);
  assert.equal(isPrepared(result.data.state.people[0]), true);
  const again = await ctx.request("/api/migrate", {
    cookie,
    method: "POST",
    body: legacy,
  });
  assert.equal(again.data.state.people.length, 10);
  assert.equal(
    ctx.store.db.prepare("SELECT count(*) n FROM legacy_archives").get().n,
    1,
  );
  assert.ok(TASKS.every((t) => t.kind !== "seat" && !t.title.includes("좌석")));
});
test("AI sees only masked structure; validated proposal and failure fallback are explicit", async (t) => {
  let requestBody,
    confidence = 0.95;
  const mock = http.createServer(async (req, res) => {
    let content = "";
    for await (const c of req) content += c;
    requestBody = JSON.parse(content);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sheet: 0,
                headerRow: 1,
                columns: { company: 1, name: 2, birth: 3 },
                confidence,
              }),
            },
          },
        ],
      }),
    );
  });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => mock.close(r)));
  const book = await readWorkbook(await readFile(files.A));
  const proposal = await aiMapping(book, {
    aiKey: "fake",
    aiBase: `http://127.0.0.1:${mock.address().port}`,
    aiModel: "test",
  });
  assert.equal(proposal.source, "ai");
  assert.equal(proposal.columns.name, 2);
  confidence = 0.4;
  const uncertain = await aiMapping(book, {
    aiKey: "fake",
    aiBase: `http://127.0.0.1:${mock.address().port}`,
    aiModel: "test",
  });
  assert.match(uncertain.notice, /불확실/);
  const aiInput = requestBody.messages[1].content;
  for (const secret of ["김하늘", "샘플테크", "1994", "1994-03-14"])
    assert.equal(aiInput.includes(secret), false, secret);
  assert.ok(aiInput.includes("소속회사"));
  mock.removeAllListeners("request");
  mock.on("request", (req, res) => {
    res.writeHead(503);
    res.end();
  });
  const fallback = await aiMapping(book, {
    aiKey: "fake",
    aiBase: `http://127.0.0.1:${mock.address().port}`,
    aiModel: "test",
  });
  assert.equal(fallback.source, "manual_fallback");
  assert.match(fallback.notice, /실패/);
});
test("birth parsing covers Excel serial/date, year-only, invalid date and empty", () => {
  assert.equal(parseBirth(1996).birthDate, null);
  assert.equal(parseBirth("1996년").birthPrecision, "year");
  assert.equal(parseBirth("1996-02-30").review, "오류");
  assert.equal(parseBirth("19960229").birthDate, "1996-02-29");
  assert.equal(parseBirth("").review, "확인 필요");
  assert.equal(
    parseBirth(new Date("1996-04-12T00:00:00Z")).birthDate,
    "1996-04-12",
  );
  assert.equal(parseBirth(35167).birthPrecision, "date");
});
test("server restart preserves UUID, pending status, source records and active invite encryption", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "readyboard-restart-")),
    config = {
      dbPath: path.join(dir, "db.sqlite"),
      staticRoot: path.resolve("dist"),
      passwords: { PMO: "restart-test" },
      inviteTtlMs: 3600000,
      aiKey: "",
      testMode: true,
    };
  let app = createApplication(config);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  let base = `http://127.0.0.1:${app.server.address().port}`;
  const login = await fetch(base + "/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "PMO", password: "restart-test" }),
    }),
    cookie = login.headers.get("set-cookie").split(";")[0];
  const manual = await fetch(base + "/api/people", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: "restart-test-request",
      rows: [{ name: "서버 재실행", company: "테스트", project: "SFA" }],
    }),
  });
  const saved = await manual.json();
  assert.equal(manual.status, 201, JSON.stringify(saved));
  const id = saved.created[0];
  const issue = await fetch(base + `/api/people/${id}/invitation`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{}",
    }),
    inv = await issue.json(),
    token = inv.url.split("/").pop();
  await app.close();
  app = createApplication(config);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const fresh = await (
    await fetch(base + "/api/state", { headers: { Cookie: cookie } })
  ).json();
  assert.equal(fresh.state.people[0].id, id);
  assert.equal((await fetch(base + `/api/invites/${token}`)).status, 200);
  const again = await (
    await fetch(base + `/api/people/${id}/invitation`, {
      headers: { Cookie: cookie },
    })
  ).json();
  assert.equal(again.url.split("/").pop(), token);
  const retry = await (
    await fetch(base + "/api/people", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "restart-test-request",
        rows: [{ name: "다른 값", company: "테스트", project: "SFA" }],
      }),
    })
  ).json();
  assert.deepEqual(retry.created, [id]);
  assert.equal(retry.state.people.length, 1);
});
test("manual mapping supports nonstandard multi-sheet headers and excludes unconfirmed rows", async (t) => {
  const ctx = await setup(t),
    cookie = await ctx.login(),
    wb = new ExcelJS.Workbook();
  wb.addWorksheet("요약").addRow(["가용 인원 요약"]);
  const s = wb.addWorksheet("원본");
  s.addRow(["계약 인력 세부"]);
  s.addRow(["담당 인력", "출생 정보", "파트너"]);
  s.addRow(["조검토", "1997-02-18", "예시회사"]);
  s.addRow(["제외 대상", "잘못된 날짜", "별도회사"]);
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  const uploaded = await ctx.request("/api/imports?project=SFA", {
    cookie,
    method: "POST",
    raw: bytes,
    headers: { "X-File-Name": "manual.xlsx" },
  });
  assert.equal(uploaded.status, 200);
  const mapping = {
      sheet: 1,
      headerRow: 2,
      columns: { company: 3, name: 1, birth: 2 },
    },
    preview = await ctx.request(`/api/imports/${uploaded.data.id}/preview`, {
      cookie,
      method: "POST",
      body: { mapping },
    });
  assert.equal(preview.data.rows[0].name, "조검토");
  assert.equal(preview.data.rows[1].review, "오류");
  const saved = await ctx.request(`/api/imports/${uploaded.data.id}/commit`, {
    cookie,
    method: "POST",
    body: {
      mapping,
      mappingConfirmed: true,
      rows: [
        {
          ...preview.data.rows[0],
          name: "조수정",
          company: "확정회사",
          birthRaw: "1997-02-19",
          decision: "new",
        },
      ],
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.state.people.length, 1);
  assert.equal(saved.data.state.people[0].name, "조수정");
  assert.equal(saved.data.state.people[0].birthDate, "1997-02-19");
  assert.equal(
    saved.data.state.people[0].importSources[0].original.name,
    "조검토",
  );
});
test("concurrent independent history appends preserve both actions without overwriting changed fields", async (t) => {
  const ctx = await setup(t),
    cookie = await ctx.login(),
    a = await upload(ctx, cookie),
    saved = await commit(ctx, cookie, a),
    base = saved.data.state,
    one = structuredClone(base),
    two = structuredClone(base);
  one.people[0].phone = "01011112222";
  one.people[0].history.unshift({ text: "PMO 동시 조치", date: "2026-11-17" });
  two.people[0].notes.O02 = "별도 작업";
  two.people[0].history.unshift({ text: "별도 작업 조치", date: "2026-11-17" });
  assert.equal(
    (
      await ctx.request("/api/state", {
        cookie,
        method: "PATCH",
        body: { operations: statePatch(base, one) },
      })
    ).status,
    200,
  );
  const result = await ctx.request("/api/state", {
    cookie,
    method: "PATCH",
    body: { operations: statePatch(base, two) },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.state.people[0].phone, "01011112222");
  assert.equal(result.data.state.people[0].notes.O02, "별도 작업");
  assert.deepEqual(
    result.data.state.people[0].history.slice(0, 2).map((x) => x.text),
    ["별도 작업 조치", "PMO 동시 조치"],
  );
});
test("raw Excel date serials are normalized before preview edits and commit, with raw source retained", async (t) => {
  const ctx = await setup(t),
    cookie = await ctx.login(),
    wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("명단");
  sheet.addRow(["소속회사", "이름", "생년월일"]);
  sheet.addRow(["숫자일자 회사", "일련번호", 35167.75]);
  const loaded = await upload(
    ctx,
    cookie,
    "A",
    "SFA",
    Buffer.from(await wb.xlsx.writeBuffer()),
  );
  assert.equal(loaded.rows[0].birthDate, parseBirth(35167).birthDate);
  assert.equal(loaded.rows[0].birthRaw, loaded.rows[0].birthDate);
  const result = await commit(ctx, cookie, loaded);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.state.people[0].birthDate, loaded.rows[0].birthDate);
  assert.equal(
    result.data.state.people[0].importSources[0].original.birthRaw,
    "35167.75",
  );
});
