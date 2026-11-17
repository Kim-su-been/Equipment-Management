import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import ExcelJS from "exceljs";
import { createApplication } from "../server/app.js";
import { statePatch } from "../src/state-patch.js";
import { tasksForPerson, taskStatus, isPrepared } from "../src/data.js";
import { reschedulePreparation } from "../src/personnel-workflow.js";
import {
  splitReply,
  readMailbox,
  parseMailboxMessage,
  inMailSince,
} from "../server/mail/providers.js";
import {
  ruleAnalysis,
  analyzeMail,
  validateAnalysis,
} from "../server/mail/analysis.js";
import { MOCK_MAILS, demoMails } from "../server/mail/fixtures.js";
async function setup(t, extra = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "readyboard-mail-")),
    app = createApplication({
      dbPath: path.join(dir, "db.sqlite"),
      staticRoot: path.resolve("dist"),
      passwords: { PMO: "mail-admin", SFA: "mail-sfa" },
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
  async function call(
    route,
    { method = "GET", body, cookie, raw, headers = {} } = {},
  ) {
    const res = await fetch(base + route, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: raw || (body ? JSON.stringify(body) : undefined),
    });
    const data = await res.json();
    return {
      status: res.status,
      data,
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const login = await call("/api/admin/login", {
    method: "POST",
    body: { scope: "PMO", password: "mail-admin" },
  });
  return { ...app, base, call, cookie: login.cookie };
}
async function prepareKim(ctx) {
  const wb = new ExcelJS.Workbook(),
    s = wb.addWorksheet("명단");
  s.addRow(["소속회사", "이름", "생년월일"]);
  s.addRow(["샘플테크", "김민수", "1990-01-01"]);
  const upload = await ctx.call("/api/imports?project=SFA", {
    method: "POST",
    cookie: ctx.cookie,
    raw: Buffer.from(await wb.xlsx.writeBuffer()),
    headers: { "X-File-Name": "phase1.xlsx" },
  });
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  const mapping = {
      sheet: 0,
      headerRow: 1,
      columns: { company: 1, name: 2, birth: 3 },
    },
    preview = await ctx.call(`/api/imports/${upload.data.id}/preview`, {
      method: "POST",
      cookie: ctx.cookie,
      body: { mapping },
    }),
    commit = await ctx.call(`/api/imports/${upload.data.id}/commit`, {
      method: "POST",
      cookie: ctx.cookie,
      body: {
        mapping,
        mappingConfirmed: true,
        rows: preview.data.rows.map((r) => ({ ...r, decision: "new" })),
      },
    });
  assert.equal(commit.status, 200, JSON.stringify(commit.data));
  const id = commit.data.created[0],
    invite = await ctx.call(`/api/people/${id}/invitation`, {
      method: "POST",
      cookie: ctx.cookie,
      body: {},
    }),
    token = invite.data.url.split("/").pop(),
    registration = await ctx.call(`/api/invites/${token}`, {
      method: "POST",
      body: {
        birthDate: "1990-01-01",
        phone: "01012345678",
        start: "2026-11-23",
        end: "2027-06-30",
        confirmed: true,
      },
    });
  assert.equal(registration.status, 200, JSON.stringify(registration.data));
  const state = ctx.store.load(),
    person = state.people.find((p) => p.id === id);
  person.tasks.O08 = "done";
  person.tasks.O10 = "done";
  person.files.O08 = { name: "기존 교육 수료증.pdf", demo: true };
  person.files.O10 = { name: "기존 보안서약서.html", demo: true };
  person.certChecks.O08 = "done";
  person.submissions = {
    O10: [{ version: 1, values: { signature: "김민수" }, demo: true }],
  };
  ctx.store.transaction(() => ctx.store.save(state));
  return {
    id,
    memberCookie: registration.cookie,
    before: ctx.store.load().people.find((p) => p.id === id),
  };
}
async function sync(ctx) {
  const res = await ctx.call("/api/mail/sync", {
    method: "POST",
    cookie: ctx.cookie,
    body: {},
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data;
}
async function select(ctx, id, personId, patch = {}) {
  const detail = await ctx.call(`/api/mail/requests/${id}`, {
    cookie: ctx.cookie,
  });
  const saved = await ctx.call(`/api/mail/requests/${id}`, {
    method: "PATCH",
    cookie: ctx.cookie,
    body: {
      version: detail.data.request.version,
      edit: { ...detail.data.request.edit, personId, ...patch },
    },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  return saved.data.request;
}
async function approve(ctx, draft, options = {}) {
  return ctx.call(`/api/mail/requests/${draft.id}/approve`, {
    method: "POST",
    cookie: ctx.cookie,
    body: {
      version: draft.version,
      reviewConfirmed: true,
      newRecordConfirmed: true,
      ...options,
    },
  });
}
test("phase-1 Kim retains UUID/completed evidence; Lee alone gets development-network task and invite", async (t) => {
  const ctx = await setup(t),
    kim = await prepareKim(ctx),
    result = await sync(ctx);
  assert.equal(result.created.length, 2);
  assert.equal(result.imported, 5);
  assert.equal(result.requests.length, 2);
  const a = result.requests.find((r) => r.payload.name === "김민수"),
    b = result.requests.find((r) => r.payload.name === "이서연");
  assert.equal(a.payload.startDate, "2026-11-25");
  assert.equal(b.payload.startDate, "2026-11-23");
  assert.equal(a.payload.tasks.length, 0);
  assert.equal(b.payload.tasks[0].title, "개발망 계정 신청");
  assert.equal(ctx.store.load().people.length, 1);
  assert.equal(ctx.store.load().people[0].start, "2026-11-23");
  const selected = await select(ctx, a.id, kim.id),
    saved = await approve(ctx, selected);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const after = ctx.store.load().people.find((p) => p.id === kim.id);
  assert.equal(after.id, kim.id);
  assert.equal(after.start, "2026-11-25");
  assert.equal(after.taskOverrides.O02.due, "2026-11-22");
  assert.equal(after.taskOverrides.O09.due, "2026-11-24");
  assert.equal(after.taskOverrides.O08.due, kim.before.taskOverrides.O08.due);
  assert.equal(after.taskOverrides.O10.due, kim.before.taskOverrides.O10.due);
  assert.equal(after.tasks.O08, "done");
  assert.equal(after.tasks.O10, "done");
  assert.deepEqual(after.files, kim.before.files);
  assert.deepEqual(after.submissions, kim.before.submissions);
  assert.equal(after.registrationStatus, "registered");
  const leeDraft = (
      await ctx.call(`/api/mail/requests/${b.id}`, { cookie: ctx.cookie })
    ).data.request,
    leeResult = await approve(ctx, leeDraft);
  assert.equal(leeResult.status, 200, JSON.stringify(leeResult.data));
  const state = ctx.store.load(),
    lee = state.people.find((p) => p.name === "이서연");
  assert.equal(lee.registrationStatus, "pending_registration");
  assert.equal(lee.start, "2026-11-23");
  const development = state.customTasks.filter((t) => /개발망/.test(t.title));
  assert.equal(development.length, 1);
  assert.deepEqual(development[0].personIds, [lee.id]);
  assert.equal(
    tasksForPerson(after, state.customTasks).some(
      (t) => t.id === development[0].id,
    ),
    false,
  );
  assert.equal(
    tasksForPerson(lee, state.customTasks).some(
      (t) => t.id === development[0].id,
    ),
    true,
  );
  const invitation = await ctx.call(`/api/people/${lee.id}/invitation`, {
    method: "POST",
    cookie: ctx.cookie,
    body: {},
  });
  assert.equal(invitation.status, 200);
  assert.equal(
    (
      await ctx.call(
        new URL(invitation.data.url).pathname.replace(
          "/invite/",
          "/api/invites/",
        ),
      )
    ).data.person.id,
    lee.id,
  );
  const retry = await approve(ctx, leeDraft);
  assert.equal(retry.status, 200);
  assert.equal(retry.data.reused, true);
  assert.equal(retry.data.personId, lee.id);
  assert.equal(ctx.store.load().people.length, 2);
  assert.equal(
    ctx.store.load().customTasks.filter((t) => /개발망/.test(t.title)).length,
    1,
  );
  const repeated = await sync(ctx);
  assert.equal(repeated.created.length, 0);
  assert.equal(repeated.duplicates, 5);
  assert.equal(
    ctx.store.db.prepare("SELECT count(*) n FROM mail_messages").get().n,
    5,
  );
  assert.equal(
    repeated.messages.find((m) => /정기회의/.test(m.subject)).requestCount,
    0,
  );
});
test("date undecided/conditional draft stays empty and can be held without creating a person", async (t) => {
  const ctx = await setup(t);
  await ctx.call("/api/mail/settings", {
    method: "PUT",
    cookie: ctx.cookie,
    body: { folder: "PMO/날짜미정검증", search: "", since: "" },
  });
  const inbox = await sync(ctx);
  assert.equal(inbox.created.length, 1);
  const draft = (
    await ctx.call(`/api/mail/requests/${inbox.created[0]}`, {
      cookie: ctx.cookie,
    })
  ).data.request;
  assert.equal(draft.payload.startDate, null);
  assert.equal(draft.payload.conditional, true);
  assert.ok(draft.payload.clarifications.some((c) => /미정/.test(c)));
  const blocked = await approve(ctx, draft, { conditionConfirmed: true });
  assert.equal(blocked.status, 400);
  assert.equal(ctx.store.load().people.length, 0);
  const held = await ctx.call(`/api/mail/requests/${draft.id}/hold`, {
    method: "POST",
    cookie: ctx.cookie,
    body: { version: draft.version, reason: "날짜 확정 대기" },
  });
  assert.equal(held.data.request.status, "held");
  assert.equal(ctx.store.load().people.length, 0);
});
test("same names require choosing a unique person and never update both", async (t) => {
  const ctx = await setup(t),
    kim = await prepareKim(ctx);
  const duplicate = await ctx.call("/api/people", {
    method: "POST",
    cookie: ctx.cookie,
    body: {
      requestId: "mail-same-name-test",
      rows: [
        {
          name: "김민수",
          company: "샘플테크",
          project: "SFA",
          start: "2026-11-23",
          end: "2027-06-30",
        },
      ],
    },
  });
  assert.equal(duplicate.status, 201);
  const inbox = await sync(ctx),
    id = inbox.requests.find((r) => r.payload.name === "김민수").id,
    detail = (
      await ctx.call(`/api/mail/requests/${id}`, { cookie: ctx.cookie })
    ).data.request;
  assert.equal(detail.candidates.length, 2);
  assert.equal((await approve(ctx, detail)).status, 400);
  const selected = await select(ctx, id, kim.id),
    applied = await approve(ctx, selected);
  assert.equal(applied.status, 200);
  assert.equal(
    ctx.store.load().people.find((p) => p.id === duplicate.data.created[0])
      .start,
    "2026-11-23",
  );
  assert.equal(
    ctx.store.load().people.find((p) => p.id === kim.id).start,
    "2026-11-25",
  );
});
test("stale person versions block approval until PMO explicitly rebases current values", async (t) => {
  const ctx = await setup(t),
    kim = await prepareKim(ctx),
    inbox = await sync(ctx),
    id = inbox.requests.find((r) => r.payload.name === "김민수").id,
    draft = await select(ctx, id, kim.id),
    before = ctx.store.load(),
    next = structuredClone(before);
  next.people.find((p) => p.id === kim.id).start = "2026-11-24";
  assert.equal(
    (
      await ctx.call("/api/state", {
        cookie: ctx.cookie,
        method: "PATCH",
        body: { operations: statePatch(before, next) },
      })
    ).status,
    200,
  );
  assert.equal((await approve(ctx, draft)).status, 409);
  const current = (
    await ctx.call(`/api/mail/requests/${id}`, { cookie: ctx.cookie })
  ).data.request;
  assert.equal(current.conflict, true);
  assert.equal(current.selected.start, "2026-11-24");
  const rebase = await ctx.call(`/api/mail/requests/${id}/rebase`, {
    method: "POST",
    cookie: ctx.cookie,
    body: {
      version: current.version,
      personId: kim.id,
      personVersion: current.selected.recordVersion,
      acknowledged: true,
    },
  });
  assert.equal(rebase.status, 200);
  assert.equal((await approve(ctx, rebase.data.request)).status, 200);
  assert.equal(
    ctx.store.load().people.find((p) => p.id === kim.id).start,
    "2026-11-25",
  );
});
test("latest reply excludes quoted requests, supersedes only matching unapproved request, and holds without resetting evidence", async (t) => {
  const ctx = await setup(t),
    kim = await prepareKim(ctx),
    first = await sync(ctx),
    old = first.requests.find((r) => r.payload.name === "김민수"),
    lee = first.requests.find((r) => r.payload.name === "이서연");
  await ctx.call("/api/mail/settings", {
    method: "PUT",
    cookie: ctx.cookie,
    body: { folder: "PMO/회신검증", search: "", since: "" },
  });
  const reply = await sync(ctx);
  assert.equal(reply.created.length, 1);
  const detail = (
    await ctx.call(`/api/mail/requests/${reply.created[0]}`, {
      cookie: ctx.cookie,
    })
  ).data.request;
  assert.equal(detail.payload.name, "김민수");
  assert.equal(detail.payload.type, "hold");
  assert.equal(detail.payload.startDate, null);
  assert.ok(detail.message.quotedBody.includes("이서연"));
  assert.ok(!detail.message.latestBody.includes("이서연"));
  assert.equal(
    (await ctx.call(`/api/mail/requests/${old.id}`, { cookie: ctx.cookie }))
      .data.request.status,
    "superseded",
  );
  assert.equal(
    (await ctx.call(`/api/mail/requests/${lee.id}`, { cookie: ctx.cookie }))
      .data.request.status,
    "pending",
  );
  assert.ok(detail.thread.some((r) => r.id === old.id));
  const selected = await select(ctx, detail.id, kim.id),
    hold = await approve(ctx, selected);
  assert.equal(hold.status, 200, JSON.stringify(hold.data));
  const state = ctx.store.load(),
    person = state.people.find((p) => p.id === kim.id);
  assert.equal(person.lifecycle, "투입 보류");
  assert.equal(person.registrationStatus, "registered");
  assert.equal(person.tasks.O08, "done");
  assert.equal(person.tasks.O10, "done");
  assert.equal(
    taskStatus(person, "O02", undefined, state.customTasks),
    "on_hold",
  );
  assert.equal(isPrepared(person, undefined, state.customTasks), false);
  assert.equal(
    (
      await approve(
        ctx,
        (await ctx.call(`/api/mail/requests/${old.id}`, { cookie: ctx.cookie }))
          .data.request,
      )
    ).status,
    409,
  );
});
test("person/task writes roll back if marking the request applied fails; retries create one record only", async (t) => {
  const ctx = await setup(t),
    kim = await prepareKim(ctx),
    inbox = await sync(ctx),
    id = inbox.requests.find((r) => r.payload.name === "이서연").id,
    draft = (await ctx.call(`/api/mail/requests/${id}`, { cookie: ctx.cookie }))
      .data.request;
  ctx.store.db.exec(
    "CREATE TEMP TRIGGER reject_mail_apply BEFORE UPDATE OF status ON mail_requests WHEN NEW.status='applied' BEGIN SELECT RAISE(ABORT,'test failure'); END;",
  );
  assert.equal((await approve(ctx, draft)).status, 400);
  assert.equal(ctx.store.load().people.length, 1);
  assert.equal(ctx.store.load().customTasks.length, 0);
  assert.equal(
    (await ctx.call(`/api/mail/requests/${id}`, { cookie: ctx.cookie })).data
      .request.status,
    "pending",
  );
  ctx.store.db.exec("DROP TRIGGER reject_mail_apply");
  const results = await Promise.all([approve(ctx, draft), approve(ctx, draft)]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(results.filter((r) => r.data.reused).length, 1);
  assert.equal(ctx.store.load().people.length, 2);
  assert.equal(ctx.store.load().customTasks.length, 1);
});
test("mail routes are PMO-only and secrets never appear in provider metadata", async (t) => {
  const ctx = await setup(t, {
      mailProvider: "imap",
      mailHost: "mail.example.invalid",
      mailUser: "private@example.invalid",
      mailPassword: "hidden-password",
    }),
    login = await ctx.call("/api/admin/login", {
      method: "POST",
      body: { scope: "SFA", password: "mail-sfa" },
    });
  for (const route of ["/api/mail/inbox", "/api/mail/requests/nonexistent"])
    assert.equal((await ctx.call(route, { cookie: login.cookie })).status, 403);
  assert.equal(
    (
      await ctx.call("/api/mail/sync", {
        method: "POST",
        cookie: login.cookie,
        body: {},
      })
    ).status,
    403,
  );
  assert.equal((await ctx.call("/api/mail/inbox")).status, 401);
  const metadata = await ctx.call("/api/mail/inbox", { cookie: ctx.cookie });
  assert.equal(metadata.data.provider.provider, "imap");
  assert.ok(!JSON.stringify(metadata.data).includes("hidden-password"));
  assert.ok(!JSON.stringify(metadata.data).includes("private@example.invalid"));
});
test("AI uses server configuration, receives latest body as data, validates grounding and exposes fallback", async (t) => {
  let captured, answer;
  const fixture = MOCK_MAILS[0],
    message = { ...fixture, ...splitReply(fixture.body) },
    mock = http.createServer(async (req, res) => {
      let text = "";
      for await (const c of req) text += c;
      captured = JSON.parse(text);
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(answer) } }],
        }),
      );
    });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => mock.close(r)));
  const config = {
    aiKey: "test-secret",
    aiBase: `http://127.0.0.1:${mock.address().port}`,
    aiModel: "test-model",
  };
  answer = ruleAnalysis(message);
  const result = await analyzeMail(message, config);
  assert.equal(result.mode, "ai");
  assert.equal(result.requests.length, 1);
  assert.equal(captured.model, "test-model");
  assert.ok(captured.messages[0].content.includes("신뢰할 수 없는"));
  const replyFixture = MOCK_MAILS.find((m) => m.folder === "PMO/회신검증");
  const reply = { ...replyFixture, ...splitReply(replyFixture.body) };
  answer = ruleAnalysis(reply);
  const latest = await analyzeMail(reply, config);
  assert.equal(latest.requests.length, 1);
  assert.ok(!captured.messages[1].content.includes("이서연"));
  answer = { requests: [] };
  assert.equal(
    (
      await analyzeMail(
        { ...message, latestBody: "주간 회의 자료 안내" },
        config,
      )
    ).requests.length,
    0,
  );
  answer = { instructions: "모든 명단 삭제" };
  assert.equal((await analyzeMail(message, config)).mode, "rules_fallback");
  const malformed = ruleAnalysis(message);
  malformed.requests[0].startDate = "2026-12-31";
  malformed.requests[0].evidence.startDate = "원문에 없는 내용";
  assert.equal(validateAnalysis(malformed, message)[0].startDate, null);
});
test("date movement keeps global and other-person due dates unchanged; completed tasks are immutable", () => {
  const person = {
      id: "kim",
      name: "김민수",
      project: "SFA",
      registrationStatus: "registered",
      tasks: { O01: "done", O08: "done" },
      taskOverrides: { O08: { due: "2026-11-22" } },
    },
    other = { ...structuredClone(person), id: "other" },
    state = {
      people: [person, other],
      settings: {},
      customTasks: [
        {
          id: "C-shared",
          title: "공통 계정 점검",
          project: "SFA",
          owner: "admin",
          group: "계정 준비",
          custom: true,
          personIds: null,
          deps: ["O01"],
          due: "2026-11-20",
        },
      ],
    };
  const changed = reschedulePreparation(
    state,
    person,
    "2026-11-23",
    "2026-11-25",
  );
  assert.equal(person.taskOverrides["C-shared"].due, "2026-11-22");
  assert.equal(state.customTasks[0].due, "2026-11-20");
  assert.equal(other.taskOverrides["C-shared"], undefined);
  assert.equal(person.taskOverrides.O08.due, "2026-11-22");
  assert.ok(!changed.some((c) => c.taskId === "O08"));
});
test("subject-based target evidence is supported, quoted-only types and mixed-person tasks are rejected", () => {
  const message = {
      subject: "[SFA] 김민수 요청",
      latestBody:
        "수행사: 샘플테크\n김민수: 투입일 2026-11-25로 변경해 주세요.\n이서연: 2026-11-23 신규 투입 요청입니다. 이서연에게만 개발망 계정을 신청해 주세요.",
      receivedAt: "2026-11-17T01:00:00Z",
    },
    output = ruleAnalysis({
      ...message,
      latestBody: "프로젝트: SFA\n" + message.latestBody,
    });
  output.requests[0].evidence.project = "[SFA]";
  output.requests[0].tasks = [structuredClone(output.requests[1].tasks[0])];
  const result = validateAnalysis(output, message);
  assert.equal(result[0].project, "SFA");
  assert.equal(result[0].tasks.length, 0);
  assert.equal(result[1].tasks.length, 1);
  const quoted = structuredClone(output);
  quoted.requests[0].evidence.type = "인용문에만 있는 요청";
  assert.ok(
    !validateAnalysis(quoted, message).some((r) => r.name === "김민수"),
  );
});
test("ambiguous years or multiple dates remain empty instead of choosing another task date", () => {
  const body =
      "프로젝트: SFA\n수행사: 샘플테크\n이서연: 2026-11-23 신규 투입 요청, 2026-12-01 교육 예정입니다.",
    message = {
      subject: "신규 투입",
      latestBody: body,
      receivedAt: "2026-11-17T00:00:00Z",
    },
    result = validateAnalysis(ruleAnalysis(message), message);
  assert.equal(result[0].startDate, null);
  const other = {
    ...message,
    latestBody:
      "프로젝트: SFA\n수행사: 샘플테크\n이서연: 11월 23일 신규 투입 요청입니다.",
  };
  assert.equal(validateAnalysis(ruleAnalysis(other), other)[0].startDate, null);
});
test("real MIME normalization handles a single References header; mailbox identity survives folder/query changes", async () => {
  const { parseMailboxMessage, inMailSince } =
    await import("../server/mail/providers.js");
  const raw = Buffer.from(
    "Message-ID: <reply@example.invalid>\r\nReferences: <root@example.invalid>\r\nFrom: vendor@example.invalid\r\nTo: pmo@example.invalid\r\nSubject: staffing change\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n김민수: 투입을 보류해 주세요.\r\n\r\n-----Original Message-----\r\n이서연: 신규 투입 요청",
  );
  const parsed = await parseMailboxMessage(raw, {
    uid: 10,
    uidValidity: 1,
    folder: "INBOX",
    internalDate: new Date("2026-11-16T16:00:00Z"),
  });
  assert.equal(parsed.threadId, "<root@example.invalid>");
  assert.equal(parsed.id, "<reply@example.invalid>");
  assert.equal(
    splitReply(parsed.body).latestBody,
    "김민수: 투입을 보류해 주세요.",
  );
  assert.equal(inMailSince(parsed.receivedAt, "2026-11-17"), true);
  assert.equal(inMailSince("2026-11-16T14:59:00Z", "2026-11-17"), false);
  const first = await readMailbox(
      {},
      { folder: "PMO/인력요청", search: "", since: "" },
    ),
    other = await readMailbox(
      {},
      { folder: "PMO/회신검증", search: "김민수", since: "" },
    );
  assert.equal(first.mailboxId, other.mailboxId);
});
test("unsupported seat-only mail cannot become a falsely applied personnel request", () => {
  const message = {
      subject: "좌석 변경",
      latestBody:
        "프로젝트: SFA\n수행사: 샘플테크\n김민수: 좌석을 변경해 주세요.",
      receivedAt: "2026-11-17T00:00:00Z",
    },
    request = {
      type: "change",
      project: "SFA",
      company: "샘플테크",
      name: "김민수",
      startDateRequested: false,
      endDateRequested: false,
      startDate: null,
      endDate: null,
      conditional: false,
      resume: false,
      clarifications: [],
      evidence: {
        type: "김민수: 좌석을 변경해 주세요.",
        project: "프로젝트: SFA",
        company: "수행사: 샘플테크",
        name: "김민수: 좌석을 변경해 주세요.",
        startDate: null,
        endDate: null,
      },
      tasks: [
        {
          category: "access",
          title: "좌석 변경",
          action: "request",
          evidence: "김민수: 좌석을 변경해 주세요.",
        },
      ],
    };
  assert.equal(validateAnalysis({ requests: [request] }, message).length, 0);
});

test("collection exposes all five before analysis; content-only relevance ignores IDs and ordering", async (t) => {
  const ctx = await setup(t);
  await prepareKim(ctx);
  const collected = (
    await ctx.call("/api/mail/sync", {
      method: "POST",
      cookie: ctx.cookie,
      body: { collectOnly: true },
    })
  ).data;
  assert.equal(collected.messages.length, 5);
  assert.equal(collected.requests.length, 0);
  assert.ok(
    collected.messages.every(
      (m) => m.analysisState === "pending" && m.from && m.preview,
    ),
  );
  const result = (
    await ctx.call("/api/mail/sync", {
      method: "POST",
      cookie: ctx.cookie,
      body: { analyzeIds: collected.analysisIds },
    })
  ).data;
  assert.equal(result.created.length, 2);
  assert.equal(result.messages.filter((m) => m.requestCount === 0).length, 3);
  for (const m of MOCK_MAILS.filter(
    (m) => m.folder === "PMO/인력요청",
  ).reverse()) {
    const input = {
      subject: m.subject,
      latestBody: m.body,
      receivedAt: m.receivedAt,
      referenceYear: 2026,
    };
    const requests = validateAnalysis(ruleAnalysis(input), input);
    assert.equal(requests.length, /님/.test(m.body) ? 1 : 0);
  }
  const adapted = demoMails([
    {
      name: "GW-1",
      company: "그룹웨어 수행사",
      project: "그룹웨어",
      start: "2026-11-23",
    },
  ])[0];
  const input = {
    subject: adapted.subject,
    latestBody: adapted.body,
    receivedAt: adapted.receivedAt,
    referenceYear: 2026,
  };
  const extracted = validateAnalysis(ruleAnalysis(input), input);
  assert.equal(extracted[0].name, "GW-1");
  assert.equal(extracted[0].company, "그룹웨어 수행사");
  assert.equal(extracted[0].project, "그룹웨어");
  assert.equal(ctx.store.load().people[0].start, "2026-11-23");
});
