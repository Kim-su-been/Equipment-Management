import {
  snapshotPerson,
  applyTaskRequests,
  applyPersonnelChange,
} from "../../src/mail-application.js";
export { applyTaskRequests } from "../../src/mail-application.js";
import { randomUUID } from "node:crypto";
import {
  readMailbox,
  splitReply,
  mailProviderInfo,
  defaultMailSettings,
  sha,
} from "./providers.js";
import { analyzeMail, blankRequest } from "./analysis.js";
import { createPendingPerson } from "../personnel.js";
import { parseBirth } from "../birth.js";
import { PROJECTS, TASKS, tasksForPerson } from "../../src/data.js";
import { createProjectTask } from "../../src/project-tasks.js";
import {
  reschedulePreparation,
  validIsoDate,
} from "../../src/personnel-workflow.js";
const normal = (v) =>
  String(v || "")
    .replace(/[\s_\-()（）]/g, "")
    .toLowerCase();
const identity = (r) =>
  `${normal(r.project)}:${normal(r.company)}:${normal(r.name)}`;
const error = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const groups = {
  account: "계정 준비",
  access: "출입 준비",
  education: "교육",
  document: "서류",
};
function candidates(state, request) {
  return state.people.filter(
    (p) =>
      (!request.project || p.project === request.project) &&
      normal(p.name) === normal(request.name),
  );
}
function validateEdit(edit) {
  const result = { ...blankRequest(), ...edit };
  if (!["new", "change", "hold"].includes(result.type))
    error(400, "요청 유형을 확인해 주세요.");
  for (const key of ["project", "company", "name"])
    if (
      result[key] !== null &&
      (typeof result[key] !== "string" ||
        result[key].length > (key === "name" ? 80 : 100))
    )
      error(400, "대상 정보를 확인해 주세요.");
  for (const key of ["startDate", "endDate"])
    if (result[key] && !validIsoDate(result[key]))
      error(400, "날짜를 YYYY-MM-DD로 확인해 주세요.");
  if (!Array.isArray(result.tasks) || result.tasks.length > 20)
    error(400, "준비 작업 요청을 확인해 주세요.");
  result.tasks = result.tasks.map((t) => {
    if (
      !groups[t.category] ||
      !["request", "hold", "cancel"].includes(t.action) ||
      typeof t.title !== "string" ||
      !t.title.trim() ||
      /좌석/.test(t.title) ||
      t.title.length > 100
    )
      error(400, "준비 작업의 분류·내용·처리 방식을 확인해 주세요.");
    return {
      category: t.category,
      title: t.title.trim(),
      action: t.action,
      evidence: String(t.evidence || "").slice(0, 1000),
    };
  });
  return result;
}
export function createMailService(store, config) {
  store.db
    .exec(`CREATE TABLE IF NOT EXISTS mail_settings(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_messages(id TEXT PRIMARY KEY,mailbox_id TEXT NOT NULL,external_id TEXT NOT NULL,thread_key TEXT NOT NULL,subject TEXT NOT NULL,received_at TEXT NOT NULL,sender TEXT NOT NULL,source TEXT NOT NULL,latest_body TEXT NOT NULL,quoted_body TEXT NOT NULL,analysis_state TEXT NOT NULL,analysis_mode TEXT,analysis_notice TEXT,content_hash TEXT NOT NULL,UNIQUE(mailbox_id,external_id));
 CREATE TABLE IF NOT EXISTS mail_requests(id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES mail_messages(id),ordinal INTEGER NOT NULL,payload TEXT NOT NULL,edited TEXT,status TEXT NOT NULL,version INTEGER NOT NULL,snapshots TEXT NOT NULL,person_id TEXT,result TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(message_id,ordinal));
 CREATE TABLE IF NOT EXISTS mail_request_history(id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES mail_requests(id),kind TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);`);
  const settings = () => {
    const row = store.db
      .prepare("SELECT payload FROM mail_settings WHERE id=1")
      .get();
    return row
      ? { ...defaultMailSettings(config), ...JSON.parse(row.payload) }
      : defaultMailSettings(config);
  };
  const record = (id) =>
    store.db.prepare("SELECT * FROM mail_requests WHERE id=?").get(id) ||
    error(404, "메일 요청을 찾을 수 없습니다.");
  const history = (id, kind, payload) =>
    store.db
      .prepare("INSERT INTO mail_request_history VALUES(?,?,?,?,?)")
      .run(
        randomUUID(),
        id,
        kind,
        JSON.stringify(payload),
        new Date().toISOString(),
      );
  function messageView(message) {
    return {
      id: message.id,
      mailboxId: message.mailbox_id,
      externalId: message.external_id,
      threadId: message.thread_key,
      subject: message.subject,
      receivedAt: message.received_at,
      from: message.sender,
      source: message.source,
      latestBody: message.latest_body,
      quotedBody: message.quoted_body,
      analysisState: message.analysis_state,
      analysisMode: message.analysis_mode,
      analysisNotice: message.analysis_notice,
    };
  }
  function detail(id) {
    const row = record(id),
      payload = JSON.parse(row.payload),
      edit = row.edited ? JSON.parse(row.edited) : payload,
      message = store.db
        .prepare("SELECT * FROM mail_messages WHERE id=?")
        .get(row.message_id),
      state = store.load(),
      matches = candidates(state, edit),
      snapshots = JSON.parse(row.snapshots),
      selected = edit.personId
        ? state.people.find((p) => p.id === edit.personId)
        : null;
    const thread = store.db
      .prepare(
        "SELECT r.*,m.subject,m.received_at,m.source,m.mailbox_id FROM mail_requests r JOIN mail_messages m ON r.message_id=m.id WHERE m.thread_key=? AND r.id<>? ORDER BY m.received_at DESC",
      )
      .all(message.thread_key, id)
      .filter(
        (r) =>
          r.mailbox_id.split(":").slice(0, 2).join(":") ===
          message.mailbox_id.split(":").slice(0, 2).join(":"),
      )
      .map((r) => ({
        id: r.id,
        status: r.status,
        subject: r.subject,
        receivedAt: r.received_at,
        payload: JSON.parse(r.payload),
        edit: r.edited ? JSON.parse(r.edited) : null,
        personId: r.person_id,
        messageId: r.message_id,
        result: r.result ? JSON.parse(r.result) : null,
      }));
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      payload,
      edit,
      snapshots,
      message: messageView(message),
      candidates: matches.map(snapshotPerson),
      selected: selected ? snapshotPerson(selected) : null,
      projectPeople: state.people.map((p) => snapshotPerson(p)),
      result: row.result ? JSON.parse(row.result) : null,
      personId: row.person_id,
      thread,
      history: store.db
        .prepare(
          "SELECT * FROM mail_request_history WHERE request_id=? ORDER BY created_at DESC",
        )
        .all(id)
        .map((h) => ({
          kind: h.kind,
          payload: JSON.parse(h.payload),
          at: h.created_at,
        })),
      conflict: !!(
        ["pending", "held"].includes(row.status) &&
        selected &&
        snapshots[selected.id]?.recordVersion !== selected.recordVersion
      ),
    };
  }
  function inbox() {
    const rows = store.db
      .prepare(
        "SELECT r.*,m.subject,m.received_at,m.source,m.analysis_mode,m.analysis_notice FROM mail_requests r JOIN mail_messages m ON r.message_id=m.id ORDER BY r.created_at DESC,r.ordinal ASC LIMIT 500",
      )
      .all();
    return {
      provider: mailProviderInfo(config),
      settings: settings(),
      requests: rows.map((r) => ({
        id: r.id,
        version: r.version,
        status: r.status,
        payload: JSON.parse(r.edited || r.payload),
        personId: r.person_id,
        messageId: r.message_id,
        subject: r.subject,
        receivedAt: r.received_at,
        source: r.source,
        analysisMode: r.analysis_mode,
        analysisNotice: r.analysis_notice,
        updatedAt: r.updated_at,
      })),
      messages: store.db
        .prepare(
          "SELECT id,sender,latest_body,subject,received_at,source,analysis_state,analysis_mode,analysis_notice,(SELECT count(*) FROM mail_requests WHERE message_id=mail_messages.id) request_count FROM mail_messages ORDER BY received_at DESC LIMIT 100",
        )
        .all()
        .map((m) => ({
          id: m.id,
          from: m.sender,
          preview: m.latest_body.slice(0, 160),
          subject: m.subject,
          receivedAt: m.received_at,
          source: m.source,
          analysisState: m.analysis_state,
          analysisMode: m.analysis_mode,
          analysisNotice: m.analysis_notice,
          requestCount: m.request_count,
        })),
    };
  }
  async function analyze(id, actor) {
    const message = store.db
      .prepare("SELECT * FROM mail_messages WHERE id=?")
      .get(id);
    if (!message) error(404, "메일 원문을 찾을 수 없습니다.");
    if (message.analysis_state === "processed") return [];
    const result = await analyzeMail(
      {
        subject: message.subject,
        receivedAt: message.received_at,
        latestBody: message.latest_body,
        referenceYear: (() => {
          const people = store
            .load()
            .people.filter((p) => message.subject.includes(p.project));
          const years = [
            ...new Set(people.map((p) => p.start?.slice(0, 4)).filter(Boolean)),
          ];
          return years.length === 1 ? Number(years[0]) : null;
        })(),
      },
      config,
    );
    return store.transaction(() => {
      const current = store.db
        .prepare("SELECT analysis_state FROM mail_messages WHERE id=?")
        .get(id);
      if (current.analysis_state === "processed") return [];
      const state = store.load(),
        created = [];
      for (const [index, request] of result.requests.entries()) {
        const draftId = randomUUID(),
          now = new Date().toISOString(),
          snapshot = Object.fromEntries(
            candidates(state, request).map((p) => [p.id, snapshotPerson(p)]),
          );
        store.db
          .prepare("INSERT INTO mail_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
          .run(
            draftId,
            id,
            index,
            JSON.stringify(request),
            null,
            "pending",
            1,
            JSON.stringify(snapshot),
            null,
            null,
            now,
            now,
          );
        history(draftId, "analyzed", { mode: result.mode });
        created.push(draftId);
        const prior = store.db
          .prepare(
            "SELECT r.*,m.received_at,m.mailbox_id FROM mail_requests r JOIN mail_messages m ON r.message_id=m.id WHERE m.thread_key=? AND r.id<>? AND r.status IN (?,?)",
          )
          .all(message.thread_key, draftId, "pending", "held");
        for (const older of prior) {
          if (
            older.received_at >= message.received_at ||
            older.mailbox_id.split(":").slice(0, 2).join(":") !==
              message.mailbox_id.split(":").slice(0, 2).join(":")
          )
            continue;
          const target = JSON.parse(older.edited || older.payload);
          if (identity(target) === identity(request)) {
            store.db
              .prepare(
                "UPDATE mail_requests SET status=?,version=version+1,updated_at=? WHERE id=?",
              )
              .run("superseded", now, older.id);
            history(older.id, "superseded", {
              byRequestId: draftId,
              reason: "같은 인원의 최신 회신 도착",
            });
          }
        }
      }
      store.db
        .prepare(
          "UPDATE mail_messages SET analysis_state=?,analysis_mode=?,analysis_notice=? WHERE id=?",
        )
        .run("processed", result.mode, result.notice, id);
      store.audit(actor, "mail.analyzed", {
        messageId: id,
        requests: created,
        mode: result.mode,
      });
      return created;
    });
  }
  let syncing = false;
  async function sync(actor, input = {}) {
    if (syncing)
      error(409, "새 메일을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.");
    syncing = true;
    try {
      const source = input.analyzeIds
          ? { messages: [], mailboxId: "analysis" }
          : await readMailbox(config, settings(), store.load().people),
        created = [],
        seen = new Set(
          Array.isArray(input.analyzeIds)
            ? input.analyzeIds
                .slice(0, 50)
                .filter((id) =>
                  store.db
                    .prepare("SELECT id FROM mail_messages WHERE id=?")
                    .get(id),
                )
            : [],
        );
      let imported = 0,
        duplicates = 0,
        errors = 0;
      for (const item of source.messages
        .slice(0, 50)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
        if (
          !item.id ||
          !validIsoDate(item.receivedAt?.slice(0, 10)) ||
          typeof item.body !== "string"
        )
          continue;
        const existing = store.db
          .prepare(
            "SELECT * FROM mail_messages WHERE mailbox_id=? AND external_id=?",
          )
          .get(source.mailboxId, item.id);
        if (existing) {
          duplicates++;
          seen.add(existing.id);
          continue;
        }
        const id = randomUUID(),
          body = splitReply(item.body.slice(0, 100000));
        let thread = item.threadId || item.id;
        if (item.inReplyTo) {
          const parent = store.db
            .prepare(
              "SELECT thread_key FROM mail_messages WHERE external_id=? AND mailbox_id=? ORDER BY received_at DESC LIMIT 1",
            )
            .get(item.inReplyTo, source.mailboxId);
          if (parent) thread = parent.thread_key;
        }
        store.db
          .prepare(
            "INSERT OR IGNORE INTO mail_messages VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            source.mailboxId,
            String(item.id).slice(0, 1000),
            String(thread).slice(0, 1000),
            String(item.subject || "(제목 없음)").slice(0, 500),
            item.receivedAt,
            String(item.from || "").slice(0, 500),
            mailProviderInfo(config).provider,
            body.latestBody,
            body.quotedBody,
            "pending",
            null,
            null,
            sha(item.body),
          );
        imported++;
        seen.add(id);
      }
      for (const id of input.collectOnly ? [] : seen) {
        try {
          created.push(...(await analyze(id, actor)));
        } catch {
          errors++;
          store.db
            .prepare(
              "UPDATE mail_messages SET analysis_state=?,analysis_notice=? WHERE id=?",
            )
            .run(
              "error",
              "분석 처리에 실패했습니다. 원문을 확인하고 다시 분석해 주세요.",
              id,
            );
        }
      }
      store.audit(actor, "mail.sync", {
        provider: mailProviderInfo(config).provider,
        mailboxId: source.mailboxId,
        scope: settings(),
        imported,
        duplicates,
        created: created.length,
        errors,
      });
      return {
        created,
        analysisIds: [...seen],
        imported,
        duplicates,
        errors,
        truncated: !!source.truncated,
        skipped: source.skipped || 0,
        ...inbox(),
      };
    } finally {
      syncing = false;
    }
  }
  function editDraft(id, input, actor) {
    return store.transaction(() => {
      const row = record(id);
      if (!["pending", "held"].includes(row.status))
        error(409, "반영 완료되었거나 이전 요청으로 종료된 초안입니다.");
      if (row.version !== input.version)
        error(
          409,
          "다른 검토자가 초안을 수정했습니다. 최신 초안을 열어 주세요.",
        );
      const edit = validateEdit(input.edit),
        now = new Date().toISOString();
      store.db
        .prepare(
          "UPDATE mail_requests SET edited=?,version=version+1,updated_at=? WHERE id=?",
        )
        .run(JSON.stringify(edit), now, id);
      history(id, "edited", {
        before: JSON.parse(row.edited || row.payload),
        after: edit,
      });
      store.audit(actor, "mail.draft.edit", { requestId: id });
      return detail(id);
    });
  }
  function approve(id, input, actor) {
    return store.transaction(() => {
      const row = record(id);
      if (row.status === "applied")
        return { reused: true, request: detail(id), personId: row.person_id };
      if (!["pending", "held"].includes(row.status))
        error(
          409,
          "최신 회신으로 대체된 요청입니다. 관련 이력을 확인해 주세요.",
        );
      if (row.version !== input.version)
        error(409, "초안이 변경되었습니다. 최신 초안을 다시 확인해 주세요.");
      if (input.reviewConfirmed !== true)
        error(400, "원문과 확인 사항을 검토해 주세요.");
      const request = validateEdit(JSON.parse(row.edited || row.payload)),
        state = store.load();
      if (
        !PROJECTS.includes(request.project) ||
        !request.company?.trim() ||
        !request.name?.trim()
      )
        error(400, "프로젝트·수행사·이름을 확인해 주세요.");
      if (
        (request.type === "new" || request.startDateRequested) &&
        !request.startDate &&
        request.type !== "hold"
      )
        error(
          400,
          "투입일이 미정입니다. 날짜를 확정하거나 초안을 보류해 주세요.",
        );
      if (
        request.type !== "hold" &&
        request.endDateRequested &&
        !request.endDate
      )
        error(400, "종료일이 미정입니다.");
      if (
        request.startDate &&
        request.endDate &&
        request.startDate > request.endDate
      )
        error(400, "투입 기간을 확인해 주세요.");
      if (request.conditional && input.conditionConfirmed !== true)
        error(400, "조건부 요청의 충족 여부를 확인해 주세요.");
      const original = JSON.parse(row.payload),
        changed = [
          "type",
          "project",
          "company",
          "name",
          "startDate",
          "endDate",
          "tasks",
          "resume",
          "conditional",
          "startDateRequested",
          "endDateRequested",
        ].some(
          (key) =>
            JSON.stringify(original[key]) !== JSON.stringify(request[key]),
        );
      if (changed && !String(request.reviewNote || "").trim())
        error(400, "추출값을 수정한 근거를 검토 메모에 입력해 주세요.");
      if (
        request.type === "change" &&
        !request.startDate &&
        !request.endDate &&
        !request.tasks.length &&
        !request.resume
      )
        error(
          400,
          "반영할 변경이 없습니다. 요청을 확인하거나 초안을 보류해 주세요.",
        );
      let person,
        oldStart,
        changedDeadlines = [];
      if (request.type === "new") {
        if (input.newRecordConfirmed !== true)
          error(
            400,
            "기존 인원 후보를 확인하고 별도 신규 기록 생성을 확인해 주세요.",
          );
        person = createPendingPerson(state, {
          project: request.project,
          company: request.company,
          name: request.name,
          start: request.startDate,
          end: request.endDate || "",
          birthRaw: request.birthRaw || "",
        });
      } else {
        person = state.people.find((p) => p.id === request.personId);
        if (!person || person.project !== request.project)
          error(400, "대상 고유 인원 기록을 선택해 주세요.");
        const before = JSON.parse(row.snapshots)[person.id];
        if (!before || before.recordVersion !== person.recordVersion)
          error(
            409,
            "검토 중 인원 정보가 변경되었습니다. 최신 기존값을 확인하고 다시 검토해 주세요.",
          );
        if (
          normal(person.name) !== normal(request.name) ||
          normal(person.company) !== normal(request.company)
        )
          error(
            400,
            "선택한 인원과 이름·수행사가 다릅니다. 대상을 확인해 주세요.",
          );
      }
      const applied = applyPersonnelChange(state, person, request, id);
      const previous = applied.previous,
        tasks = applied.tasks;
      changedDeadlines = applied.changedDeadlines;
      person.mailSources = [
        ...(person.mailSources || []),
        {
          requestId: id,
          messageId: row.message_id,
          at: new Date().toISOString(),
        },
      ];
      person.history.unshift({
        text: `메일 요청 승인 · ${request.type === "new" ? "신규 투입" : request.type === "hold" ? "투입 보류" : "정보 변경"}${request.reviewNote ? ` · ${request.reviewNote}` : ""}`,
        date: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      });
      store.save(state);
      const result = {
        personId: person.id,
        displayId: person.displayId,
        before: previous,
        after: snapshotPerson(
          store.load().people.find((p) => p.id === person.id),
        ),
        changedDeadlines,
        tasks,
      };
      store.db
        .prepare(
          "UPDATE mail_requests SET status=?,person_id=?,result=?,version=version+1,updated_at=? WHERE id=?",
        )
        .run(
          "applied",
          person.id,
          JSON.stringify(result),
          new Date().toISOString(),
          id,
        );
      history(id, "applied", result);
      store.audit(
        actor,
        "mail.approved",
        { requestId: id, ...result },
        person.id,
      );
      // Older unapproved requests for this same person in the same thread are explicitly retired.
      const message = store.db
        .prepare("SELECT * FROM mail_messages WHERE id=?")
        .get(row.message_id);
      for (const older of detail(id).thread) {
        if (
          !["pending", "held"].includes(older.status) ||
          older.receivedAt >= message.received_at
        )
          continue;
        const target = older.edit || older.payload;
        if (identity(target) === identity(request)) {
          store.db
            .prepare(
              "UPDATE mail_requests SET status=?,version=version+1,updated_at=? WHERE id=?",
            )
            .run("superseded", new Date().toISOString(), older.id);
          history(older.id, "superseded", { byRequestId: id });
        }
      }
      return { reused: false, request: detail(id), personId: person.id };
    });
  }
  async function handle(ctx) {
    const { req, res, url, parts, actor, json, readJson, snapshot, fail } = ctx;
    if (url.pathname === "/api/mail/inbox" && req.method === "GET")
      return json(res, 200, inbox());
    if (url.pathname === "/api/mail/settings" && req.method === "PUT") {
      const input = await readJson(req);
      if (
        typeof input.folder !== "string" ||
        !input.folder.trim() ||
        input.folder.length > 200 ||
        typeof input.search !== "string" ||
        input.search.length > 500 ||
        (input.since && !validIsoDate(input.since))
      )
        fail(400, "메일 폴더·검색 범위·수신 시작일을 확인해 주세요.");
      const value = {
        folder: input.folder.trim(),
        search: input.search,
        since: input.since || "",
      };
      store.db
        .prepare(
          "INSERT INTO mail_settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
        )
        .run(JSON.stringify(value));
      store.audit(actor, "mail.scope", value);
      return json(res, 200, inbox());
    }
    if (url.pathname === "/api/mail/sync" && req.method === "POST")
      return json(res, 200, await sync(actor, await readJson(req)));
    if (parts[2] === "messages" && parts[3] && req.method === "GET") {
      const message = store.db
        .prepare("SELECT * FROM mail_messages WHERE id=?")
        .get(parts[3]);
      if (!message) fail(404, "메일을 찾을 수 없습니다.");
      return json(res, 200, { message: messageView(message) });
    }
    if (
      parts[2] === "messages" &&
      parts[3] &&
      parts[4] === "analyze" &&
      req.method === "POST"
    )
      return json(res, 200, {
        created: await analyze(parts[3], actor),
        ...inbox(),
      });
    if (parts[2] === "requests" && parts[3]) {
      const id = parts[3];
      if (req.method === "GET") return json(res, 200, { request: detail(id) });
      const input = await readJson(req);
      if (req.method === "PATCH" && !parts[4])
        return json(res, 200, { request: editDraft(id, input, actor) });
      if (req.method === "POST" && parts[4] === "hold") {
        store.transaction(() => {
          const row = record(id);
          if (
            !["pending", "held"].includes(row.status) ||
            row.version !== input.version
          )
            error(409, "최신 초안을 다시 확인해 주세요.");
          const reason = String(input.reason || "PMO 추가 확인 대기").slice(
            0,
            1000,
          );
          store.db
            .prepare(
              "UPDATE mail_requests SET status=?,version=version+1,updated_at=? WHERE id=?",
            )
            .run("held", new Date().toISOString(), id);
          history(id, "held", { reason });
          store.audit(actor, "mail.draft.hold", { requestId: id, reason });
        });
        return json(res, 200, { request: detail(id) });
      }
      if (req.method === "POST" && parts[4] === "rebase") {
        store.transaction(() => {
          const row = record(id);
          if (
            !["pending", "held"].includes(row.status) ||
            row.version !== input.version ||
            input.acknowledged !== true
          )
            error(409, "최신 초안과 기존값을 확인해 주세요.");
          const person = store
            .load()
            .people.find((p) => p.id === input.personId);
          if (!person || person.recordVersion !== input.personVersion)
            error(
              409,
              "인원 정보가 다시 변경되었습니다. 최신값을 새로고침해 주세요.",
            );
          const snapshots = JSON.parse(row.snapshots);
          snapshots[person.id] = snapshotPerson(person);
          store.db
            .prepare(
              "UPDATE mail_requests SET snapshots=?,version=version+1,updated_at=? WHERE id=?",
            )
            .run(JSON.stringify(snapshots), new Date().toISOString(), id);
          history(id, "rebased", {
            personId: person.id,
            recordVersion: person.recordVersion,
          });
        });
        return json(res, 200, { request: detail(id) });
      }
      if (req.method === "POST" && parts[4] === "approve")
        return json(res, 200, {
          ...approve(id, input, actor),
          ...snapshot(actor),
        });
    }
    fail(404, "지원하지 않는 메일 요청 API입니다.");
  }
  return { handle, inbox, detail, sync };
}
