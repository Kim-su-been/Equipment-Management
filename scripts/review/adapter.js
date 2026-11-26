import {
  getPerformance,
  syncPerformance,
} from "../../src/performance-service.js";
// Browser-only implementation of the existing API contract. No API requests leave the HTML.
import { analyzeMail } from "../../server/mail/analysis.js";
import { demoMails } from "../../server/mail/fixtures.js";
import { validateEdit } from "../../src/mail-request-validation.js";
import {
  snapshotPerson,
  applyPersonnelChange,
} from "../../src/mail-application.js";
import { createPendingPerson } from "../../src/personnel-records.js";
import {
  validIsoDate,
  reschedulePreparation,
} from "../../src/personnel-workflow.js";
import {
  readWorkbook,
  aiMapping,
  extractRows,
  norm,
} from "../../src/workbook.js";
import { parseBirth } from "../../src/birth.js";
import { normalizeLegacyState } from "../../src/migration.js";
import { viewState, inScope } from "../../src/actor-scope.js";
import { applyStatePatch } from "../../src/state-permissions.js";
import { PROJECTS } from "../../src/data.js";
import { openLocalWorkspace, packBackup, unpackBackup } from "./storage.js";
const id = () => crypto.randomUUID(),
  now = () => new Date().toISOString();
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const digest = async (blob) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const splitReply = (body) => {
  const lines = String(body).split(/\r?\n/),
    i = lines.findIndex((l) =>
      /^\s*(?:>|[-_]{2,}\s*(?:Original Message|원본)|On .+wrote:|보낸\s*사람\s*:|From\s*:)/i.test(
        l,
      ),
    );
  return {
    latestBody: (i < 0 ? lines : lines.slice(0, i)).join("\n").trim(),
    quotedBody: i < 0 ? "" : lines.slice(i).join("\n"),
  };
};
const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export async function installDemoApi(
  seed,
  initialActor = { kind: "admin", scope: "PMO" },
) {
  globalThis.__READYBOARD_OFFLINE__ = true;
  const storage = await openLocalWorkspace();
  const initial = () => ({
    schema: 1,
    version: 1,
    state: structuredClone(seed.states.pmo),
    messages: [],
    requests: [],
    invitations: [],
    files: {},
    imports: [],
    manual: {},
    audit: [],
    settings: { ...seed.inbox.settings },
  });
  let w = (await storage.read()) || initial(),
    actor = initialActor,
    queue = Promise.resolve();
  const emit = () =>
    window.dispatchEvent(new Event("readyboard:offline-change"));
  const store = {
    load: () => structuredClone(w.state),
    save: (input) => {
      const next = normalizeLegacyState(input),
        previous = new Map(w.state.people.map((p) => [p.id, p]));
      for (const p of next.people) {
        const before = previous.get(p.id),
          compare = (x) => JSON.stringify({ ...x, recordVersion: undefined });
        p.recordVersion = before
          ? (before.recordVersion || 1) +
            (compare(before) !== compare(p) ? 1 : 0)
          : 1;
        p.projectId ||= `project-${PROJECTS.indexOf(p.project) + 1}`;
        p.companyId =
          (before?.company === p.company
            ? before.companyId
            : w.state.people.find((x) => norm(x.company) === norm(p.company))
                ?.companyId) ||
          `company-${encodeURIComponent(norm(p.company))}`;
      }
      next.revision = (w.state.revision || 0) + 1;
      w.state = next;
    },
    fileMetadata: (fileId) =>
      w.files[fileId]
        ? {
            person_id: w.files[fileId].personId,
            task_id: w.files[fileId].taskId,
          }
        : null,
    audit: (who, kind, payload, personId) =>
      w.audit.push({
        id: id(),
        actor: who,
        kind,
        payload,
        personId,
        at: now(),
      }),
  };
  const snapshot = (who) => ({
    actor: who,
    state: who ? viewState(store, who) : null,
  });
  const staff = (who, pmo = false) => {
    if (who?.kind !== "admin" || (pmo && who.scope !== "PMO"))
      fail(403, pmo ? "PMO에게만 허용된 작업입니다." : "주관사 작업입니다.");
  };
  const personFor = (who, pid) => {
    const p = w.state.people.find((p) => p.id === pid);
    if (!p || !who || !inScope(who, p))
      fail(404, "담당 범위의 인원을 찾을 수 없습니다.");
    return p;
  };
  const inviteUrl = (t) => {
    const url = new URL(location.href);
    url.hash = `invite=${t}`;
    return url.href;
  };
  const inviteView = (i) => ({
    status: i.usedAt
      ? "used"
      : i.revokedAt
        ? "revoked"
        : i.expiresAt <= Date.now()
          ? "expired"
          : "active",
    expiresAt: new Date(i.expiresAt).toISOString(),
    url:
      i.usedAt || i.revokedAt || i.expiresAt <= Date.now()
        ? null
        : inviteUrl(i.token),
  });
  const invitation = (t) => {
    const i = w.invitations.find((i) => i.token === t);
    if (!i)
      fail(
        404,
        "초대 링크를 찾을 수 없습니다. 같은 HTML 파일과 브라우저에서 발급한 링크인지 확인해 주세요.",
      );
    if (i.revokedAt)
      fail(410, "재발급으로 종료된 링크입니다. 최신 링크를 확인해 주세요.");
    if (i.usedAt)
      fail(
        410,
        "이미 등록을 마친 링크입니다. 상단 수행사 화면에서 내 작업을 확인해 주세요.",
      );
    if (i.expiresAt <= Date.now())
      fail(410, "초대 링크가 만료되었습니다. PMO에서 재발급해 주세요.");
    const p = w.state.people.find((p) => p.id === i.personId);
    if (!p || p.registrationStatus !== "pending_registration")
      fail(410, "이미 등록이 완료되었거나 종료된 등록 건입니다.");
    return { i, p };
  };
  const inbox = () => ({
    provider: {
      provider: "mock",
      label: "가상 메일함",
      configured: true,
      actual: false,
      notice:
        "HTML 가상 메일 · 브라우저에서 규칙 기반 분석 · 외부 메일과 AI 호출 없음",
    },
    settings: w.settings,
    requests: w.requests.map((r) => ({
      id: r.id,
      messageId: r.messageId,
      version: r.version,
      status: r.status,
      payload: r.edit,
      personId: r.personId,
      subject: r.message.subject,
      receivedAt: r.message.receivedAt,
      source: "mock",
      analysisMode: r.message.analysisMode,
      analysisNotice: r.message.analysisNotice,
    })),
    messages: w.messages
      .map((m) => ({
        ...m,
        preview: m.latestBody.slice(0, 160),
        requestCount: w.requests.filter((r) => r.messageId === m.id).length,
      }))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
  });
  const detail = (r) => {
    const selected = w.state.people.find((p) => p.id === r.edit.personId);
    return {
      ...structuredClone(r),
      projectPeople: w.state.people.map(snapshotPerson),
      candidates: w.state.people
        .filter(
          (p) =>
            (!r.edit.project || p.project === r.edit.project) &&
            norm(p.name) === norm(r.edit.name),
        )
        .map(snapshotPerson),
      selected: selected ? snapshotPerson(selected) : null,
      thread: w.requests
        .filter(
          (x) => x.id !== r.id && x.message.threadId === r.message.threadId,
        )
        .map((x) => ({
          ...x,
          subject: x.message.subject,
          receivedAt: x.message.receivedAt,
        })),
      conflict: !!(
        selected &&
        ["pending", "held"].includes(r.status) &&
        r.snapshots[selected.id]?.recordVersion !== selected.recordVersion
      ),
    };
  };
  const analyze = async (m) => {
    if (m.analysisState === "processed") return [];
    const years = [
      ...new Set(
        w.state.people
          .filter((p) => m.subject.includes(p.project))
          .map((p) => p.start?.slice(0, 4))
          .filter(Boolean),
      ),
    ];
    const analysis = await analyzeMail(
      { ...m, referenceYear: years.length === 1 ? Number(years[0]) : null },
      { aiKey: "" },
    );
    Object.assign(m, {
      analysisState: "processed",
      analysisMode: analysis.mode,
      analysisNotice: analysis.notice,
    });
    const created = [];
    for (const payload of analysis.requests) {
      const rid = id(),
        r = {
          id: rid,
          messageId: m.id,
          message: m,
          payload: structuredClone(payload),
          edit: structuredClone(payload),
          status: "pending",
          version: 1,
          snapshots: Object.fromEntries(
            w.state.people
              .filter(
                (p) => p.name === payload.name && p.project === payload.project,
              )
              .map((p) => [p.id, snapshotPerson(p)]),
          ),
          history: [{ kind: "analyzed", at: now() }],
          result: null,
          personId: null,
        };
      for (const older of w.requests)
        if (
          older.message.threadId === m.threadId &&
          older.message.receivedAt < m.receivedAt &&
          ["pending", "held"].includes(older.status) &&
          ["project", "company", "name"].every(
            (k) => norm(older.edit[k]) === norm(payload[k]),
          )
        ) {
          older.status = "superseded";
          older.version++;
          older.history.push({
            kind: "superseded",
            at: now(),
            payload: { byRequestId: rid },
          });
        }
      w.requests.push(r);
      created.push(rid);
    }
    return created;
  };
  const rowPreview = (record, rows) =>
    rows.map((row) => {
      const linked = record.rows[row.key],
        candidates = w.state.people
          .filter(
            (p) =>
              p.project === record.project && norm(p.name) === norm(row.name),
          )
          .map((p) => ({
            ...snapshotPerson(p),
            birthDate: p.birthDate,
            birthYear: p.birthYear,
          })),
        sameName =
          rows.filter((r) => norm(r.name) === norm(row.name)).length > 1;
      return {
        ...row,
        linkedPersonId: linked || null,
        candidates,
        sameNameInFile: sameName,
        needsDecision: !linked && (!!candidates.length || sameName),
        decision: linked
          ? "existing"
          : candidates.length || sameName
            ? ""
            : "new",
      };
    });
  async function dispatch(path, options, who) {
    const url = new URL(path, "https://offline.invalid"),
      parts = url.pathname.split("/").filter(Boolean),
      method = (options.method || "GET").toUpperCase(),
      body =
        typeof options.body === "string"
          ? JSON.parse(options.body)
          : options.body || {},
      headers = new Headers(options.headers || {});
    if (url.pathname === "/api/health")
      return { ok: true, storage: storage.kind, offline: true };
    if (url.pathname === "/api/session")
      return who
        ? snapshot(who)
        : { actor: null, loginOptions: ["PMO", ...PROJECTS] };
    if (url.pathname === "/api/admin/login") {
      if (!["PMO", ...PROJECTS].includes(body.scope))
        fail(400, "역할을 확인해 주세요.");
      actor = { kind: "admin", scope: body.scope };
      return snapshot(actor);
    }
    if (url.pathname === "/api/logout") {
      actor = null;
      return { ok: true };
    }
    if (parts[1] === "invites" && parts[2]) {
      const { i, p } = invitation(parts[2]);
      if (method === "GET") return { person: structuredClone(p) };
      if (method !== "POST") fail(405, "지원하지 않는 요청입니다.");
      const birth = parseBirth(body.birthDate),
        phone = String(body.phone || "").replace(/\D/g, "");
      if (!body.confirmed) fail(400, "본인 기본 정보가 맞는지 확인해 주세요.");
      if (birth.review !== "정상" || birth.birthPrecision !== "date")
        fail(400, "전체 생년월일을 확인해 주세요.");
      if (
        (p.birthDate && p.birthDate !== birth.birthDate) ||
        (p.birthYear && p.birthYear !== birth.birthYear)
      )
        fail(400, "계획서의 생년월일과 다릅니다. PMO에게 확인해 주세요.");
      if (!/^0\d{8,10}$/.test(phone)) fail(400, "연락처를 확인해 주세요.");
      if (
        !validIsoDate(body.start) ||
        !validIsoDate(body.end) ||
        body.start > body.end
      )
        fail(400, "투입 예정 시작일과 종료일을 확인해 주세요.");
      const state = store.load(),
        target = state.people.find((x) => x.id === p.id),
        old = target.start;
      Object.assign(target, birth, {
        phone,
        start: body.start,
        end: body.end,
        registrationStatus: "registered",
        registeredAt: now(),
        selfRegistered: true,
        profileRevision: (target.profileRevision || 1) + 1,
        birthReview: "정상",
      });
      delete target.review;
      delete target.reason;
      reschedulePreparation(state, target, old, target.start);
      target.history.unshift({
        text: "개인 초대 링크로 본인 등록 완료",
        date: new Date().toLocaleString("ko-KR"),
      });
      store.save(state);
      w.invitations
        .filter((x) => x.personId === p.id && !x.revokedAt && !x.usedAt)
        .forEach((x) => (x.usedAt = Date.now()));
      actor = { kind: "member", personId: p.id, project: p.project };
      return snapshot(actor);
    }
    if (!who) fail(401, "상단에서 시연 역할을 선택해 주세요.");
    if (url.pathname === "/api/performance" && method === "GET")
      return getPerformance(store, who);
    if (url.pathname === "/api/performance/sync" && method === "POST")
      return syncPerformance(store, who);
    if (url.pathname === "/api/state") {
      if (method === "PATCH") applyStatePatch(store, who, body.operations);
      return snapshot(who);
    }
    if (url.pathname === "/api/files" && method === "POST") {
      const p = personFor(who, url.searchParams.get("personId")),
        taskId = url.searchParams.get("taskId"),
        name = decodeURIComponent(headers.get("X-File-Name") || "증빙파일");
      if (p.registrationStatus !== "registered")
        fail(409, "본인 등록을 먼저 완료해 주세요.");
      if (!["O08", "O09", "O10", "O11"].includes(taskId))
        fail(400, "증빙 작업을 확인해 주세요.");
      if (!(body instanceof Blob) || !body.size || body.size > 10 * 1024 * 1024)
        fail(400, "10MB 이하의 원본 파일을 선택해 주세요.");
      if (!/\.(pdf|png|jpe?g|html)$/i.test(name))
        fail(400, "PDF·이미지·HTML 원본을 선택해 주세요.");
      const record = {
        id: id(),
        personId: p.id,
        taskId,
        name,
        savedAt: now(),
        digest: await digest(body),
        blob: body,
      };
      w.files[record.id] = record;
      const { blob, ...metadata } = record;
      return metadata;
    }
    if (parts[1] === "files" && parts[2]) {
      const f = w.files[parts[2]];
      if (!f) fail(404, "보관 원본을 찾을 수 없습니다.");
      personFor(who, f.personId);
      return new Response(f.blob, {
        headers: {
          "Content-Type": f.blob.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(f.name),
          "X-Person-Id": f.personId,
          "X-Task-Id": f.taskId,
          "X-Digest": f.digest,
        },
      });
    }
    if (url.pathname === "/api/people" && method === "POST") {
      staff(who);
      if (w.manual[body.requestId])
        return { ...w.manual[body.requestId], ...snapshot(who) };
      if (
        !/^[\w-]{10,100}$/.test(body.requestId || "") ||
        !Array.isArray(body.rows) ||
        !body.rows.length ||
        body.rows.length > 100
      )
        fail(400, "등록 요청과 인원을 확인해 주세요.");
      const state = store.load(),
        created = [];
      for (const row of body.rows) {
        if (
          !PROJECTS.includes(row.project) ||
          (who.scope !== "PMO" && who.scope !== row.project)
        )
          fail(403, "담당 프로젝트에만 등록할 수 있습니다.");
        const p = createPendingPerson(state, row);
        p.history.unshift({
          text: "주관사 수동 등록 · 본인 등록 대기",
          date: new Date().toLocaleString("ko-KR"),
        });
        created.push(p.id);
      }
      store.save(state);
      w.manual[body.requestId] = { created };
      return { created, ...snapshot(who) };
    }
    if (parts[1] === "people" && parts[3] === "invitation") {
      staff(who, true);
      const p = personFor(who, parts[2]),
        existing = [...w.invitations]
          .reverse()
          .find((i) => i.personId === p.id && !i.usedAt && !i.revokedAt);
      if (method === "GET")
        return existing ? inviteView(existing) : { status: "none" };
      if (p.registrationStatus !== "pending_registration")
        fail(409, "등록을 마친 인원에게는 새 등록 링크를 발급할 수 없습니다.");
      if (existing && existing.expiresAt > Date.now() && !body.reissue)
        return inviteView(existing);
      w.invitations
        .filter((i) => i.personId === p.id && !i.usedAt && !i.revokedAt)
        .forEach((i) => (i.revokedAt = Date.now()));
      const i = {
        id: id(),
        personId: p.id,
        token: token(),
        createdAt: Date.now(),
        expiresAt: Date.now() + 72 * 3600000,
      };
      w.invitations.push(i);
      return inviteView(i);
    }
    if (parts[1] === "imports") {
      staff(who, true);
      if (!parts[2]) {
        const project = url.searchParams.get("project"),
          filename = decodeURIComponent(
            headers.get("X-File-Name") || "인력계획서.xlsx",
          );
        if (
          !PROJECTS.includes(project) ||
          !/\.xlsx$/i.test(filename) ||
          !(body instanceof Blob)
        )
          fail(400, "프로젝트와 XLSX 파일을 확인해 주세요.");
        const hash = await digest(body);
        let record = w.imports.find(
          (r) => r.project === project && r.fileHash === hash,
        );
        if (!record) {
          const book = await readWorkbook(await body.arrayBuffer());
          record = {
            id: id(),
            project,
            fileHash: hash,
            filename,
            book,
            proposal: await aiMapping(book, { aiKey: "" }),
            rows: {},
            blob: body,
          };
          w.imports.push(record);
        }
        return {
          ...record,
          blob: undefined,
          book: undefined,
          sheets: record.book.sheets.map((s) => ({
            ...s,
            rows: s.rows.slice(0, 35),
          })),
          reuploaded: !!Object.keys(record.rows).length,
        };
      }
      const record = w.imports.find((r) => r.id === parts[2]);
      if (!record) fail(404, "불러온 파일을 찾을 수 없습니다.");
      const rows = rowPreview(record, extractRows(record.book, body.mapping));
      if (parts[3] === "preview") return { mapping: body.mapping, rows };
      if (parts[3] === "commit") {
        if (
          !body.mappingConfirmed ||
          !Array.isArray(body.rows) ||
          !body.rows.length ||
          body.rows.length > 1000 ||
          new Set(body.rows.map((r) => r.key)).size !== body.rows.length
        )
          fail(400, "매핑과 확정할 행을 확인해 주세요.");
        const state = store.load(),
          created = [],
          linked = [],
          reused = [];
        for (const chosen of body.rows) {
          const source = rows.find((r) => r.key === chosen.key);
          if (!source) fail(400, "원본에 없는 행입니다.");
          if (source.linkedPersonId) {
            reused.push(source.linkedPersonId);
            continue;
          }
          const company = String(chosen.company ?? source.company).trim(),
            name = String(chosen.name ?? source.name).trim(),
            birth = parseBirth(chosen.birthRaw ?? source.birthRaw, {
              date1904: record.book.date1904,
            });
          if (
            !name ||
            !company ||
            name.length > 80 ||
            company.length > 100 ||
            birth.review === "오류"
          )
            fail(400, `${source.row}행의 이름·회사·생년월일을 확인해 주세요.`);
          if (birth.review === "확인 필요" && !chosen.reviewConfirmed)
            fail(400, `${source.row}행의 생년월일 확인 대상을 확인해 주세요.`);
          if (!["new", "existing"].includes(chosen.decision))
            fail(400, `${source.row}행의 등록 방식을 선택해 주세요.`);
          let p;
          if (chosen.decision === "existing") {
            p = state.people.find(
              (p) => p.id === chosen.personId && p.project === record.project,
            );
            if (!p) fail(400, "연결할 기존 인원을 선택해 주세요.");
            linked.push(p.id);
          } else {
            p = createPendingPerson(state, {
              project: record.project,
              name,
              company,
              birthRaw: birth.birthDate || birth.birthYear || "",
            });
            created.push(p.id);
          }
          const provenance = {
            importId: record.id,
            fileHash: record.fileHash,
            filename: record.filename,
            sheet: source.sheet,
            sheetIndex: source.sheetIndex,
            row: source.row,
            original: source.original,
            confirmed: {
              name,
              company,
              birthRaw: chosen.birthRaw ?? source.birthRaw,
            },
            decision: chosen.decision,
            at: now(),
          };
          p.importSources = [...(p.importSources || []), provenance];
          p.history.unshift({
            text: `인력계획서 ${source.sheet} ${source.row}행 확정`,
            date: new Date().toLocaleString("ko-KR"),
          });
          record.rows[source.key] = p.id;
        }
        store.save(state);
        return { created, linked, reused, ...snapshot(who) };
      }
    }
    if (parts[1] === "mail") {
      staff(who, true);
      if (parts[2] === "inbox") return inbox();
      if (parts[2] === "settings") {
        if (
          !String(body.folder || "").trim() ||
          (body.since && !validIsoDate(body.since))
        )
          fail(400, "메일 수집 범위를 확인해 주세요.");
        w.settings = {
          folder: body.folder,
          search: body.search || "",
          since: body.since || "",
        };
        return inbox();
      }
      if (parts[2] === "sync") {
        let imported = 0,
          duplicates = 0;
        const seen = new Set(),
          created = [];
        if (!body.analyzeIds)
          for (const m of demoMails(w.state.people).filter(
            (m) =>
              m.folder === w.settings.folder &&
              (!w.settings.search ||
                `${m.subject}\n${m.body}`
                  .toLowerCase()
                  .includes(w.settings.search.toLowerCase())) &&
              (!w.settings.since || m.receivedAt >= w.settings.since),
          )) {
            const existing = w.messages.find((x) => x.externalId === m.id);
            if (existing) {
              duplicates++;
              seen.add(existing.id);
              continue;
            }
            const mail = {
              ...m,
              id: id(),
              externalId: m.id,
              threadId: m.threadId,
              source: "mock",
              ...splitReply(m.body),
              analysisState: "pending",
            };
            w.messages.push(mail);
            seen.add(mail.id);
            imported++;
          }
        for (const mid of body.analyzeIds || seen) {
          const m = w.messages.find((m) => m.id === mid);
          if (m && !body.collectOnly) created.push(...(await analyze(m)));
        }
        return {
          ...inbox(),
          created,
          imported,
          duplicates,
          errors: 0,
          analysisIds: [...seen],
        };
      }
      if (parts[2] === "messages") {
        const m = w.messages.find((m) => m.id === parts[3]);
        if (!m) fail(404, "메일을 찾을 수 없습니다.");
        if (parts[4] === "analyze")
          return { created: await analyze(m), ...inbox() };
        return { message: m };
      }
      if (parts[2] === "requests") {
        const r = w.requests.find((r) => r.id === parts[3]),
          action = parts[4];
        if (!r) fail(404, "초안을 찾을 수 없습니다.");
        if (method === "GET") return { request: detail(r) };
        if (action === "approve" && r.status === "applied")
          return { request: detail(r), ...snapshot(who), reused: true };
        if (
          !["pending", "held"].includes(r.status) ||
          body.version !== r.version
        )
          fail(409, "최신 초안을 다시 확인하세요.");
        if (method === "PATCH") {
          r.edit = validateEdit(body.edit);
          r.version++;
          r.history.push({ kind: "edited", at: now() });
          return { request: detail(r) };
        }
        if (action === "hold") {
          r.status = "held";
          r.version++;
          r.history.push({
            kind: "held",
            at: now(),
            payload: { reason: body.reason },
          });
          return { request: detail(r) };
        }
        if (action === "rebase") {
          const p = w.state.people.find((p) => p.id === body.personId);
          if (
            !p ||
            p.recordVersion !== body.personVersion ||
            !body.acknowledged
          )
            fail(409, "최신 인원 정보를 확인하세요.");
          r.snapshots[p.id] = snapshotPerson(p);
          r.version++;
          return { request: detail(r) };
        }
        if (action === "approve") {
          const q = validateEdit(r.edit);
          if (!body.reviewConfirmed) fail(400, "원문 검토를 확인하세요.");
          if (!q.name || !q.company || !PROJECTS.includes(q.project))
            fail(400, "이름·수행사·프로젝트를 확인하세요.");
          if (
            (q.type === "new" || q.startDateRequested) &&
            q.type !== "hold" &&
            !validIsoDate(q.startDate)
          )
            fail(400, "투입일을 확인하세요.");
          if (q.endDateRequested && !validIsoDate(q.endDate))
            fail(400, "종료일을 확인하세요.");
          if (q.conditional && !body.conditionConfirmed)
            fail(400, "요청 조건을 확인하세요.");
          if (
            [
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
              (k) => JSON.stringify(r.payload[k]) !== JSON.stringify(q[k]),
            ) &&
            !String(q.reviewNote || "").trim()
          )
            fail(400, "추출값을 수정한 근거를 검토 메모에 입력해 주세요.");
          if (
            q.type === "change" &&
            !q.startDate &&
            !q.endDate &&
            !q.tasks.length &&
            !q.resume
          )
            fail(
              400,
              "반영할 변경이 없습니다. 초안을 확인하거나 보류해 주세요.",
            );
          const state = store.load();
          let p;
          if (q.type === "new") {
            if (!body.newRecordConfirmed)
              fail(400, "신규 기록 생성을 확인하세요.");
            p = createPendingPerson(state, {
              project: q.project,
              company: q.company,
              name: q.name,
              start: q.startDate,
              end: q.endDate || "",
              birthRaw: q.birthRaw || "",
            });
          } else {
            p = state.people.find((p) => p.id === q.personId);
            if (
              !p ||
              p.project !== q.project ||
              norm(p.name) !== norm(q.name) ||
              norm(p.company) !== norm(q.company)
            )
              fail(400, "대상 고유 인원 기록을 선택하세요.");
            if (r.snapshots[p.id]?.recordVersion !== p.recordVersion)
              fail(409, "인원 정보가 변경되었습니다. 최신값을 확인해 주세요.");
          }
          const applied = applyPersonnelChange(state, p, q, r.id);
          p.mailSources = [
            ...(p.mailSources || []),
            { requestId: r.id, messageId: r.messageId, at: now() },
          ];
          p.history.unshift({
            text: `메일 요청 승인 · ${q.type === "new" ? "신규 투입" : q.type === "hold" ? "투입 보류" : "정보 변경"}`,
            date: new Date().toLocaleString("ko-KR"),
          });
          store.save(state);
          r.status = "applied";
          r.version++;
          r.personId = p.id;
          r.result = {
            personId: p.id,
            displayId: p.displayId,
            before: applied.previous,
            after: snapshotPerson(w.state.people.find((x) => x.id === p.id)),
            changedDeadlines: applied.changedDeadlines,
            tasks: applied.tasks,
          };
          r.history.push({ kind: "applied", at: now(), payload: r.result });
          return { request: detail(r), ...snapshot(who), personId: p.id };
        }
      }
    }
    if (parts[1] === "migrate") {
      staff(who, true);
      if (!Array.isArray(body.people) || body.people.length > 1000)
        fail(400, "이전 명단 형식을 확인해 주세요.");
      const data = normalizeLegacyState(body),
        state = store.load(),
        idMap = {};
      for (const p of data.people) {
        if (!PROJECTS.includes(p.project) || !p.name || !p.company)
          fail(400, "이전 명단 정보를 확인해 주세요.");
        const existing = state.people.find(
          (x) =>
            (x.legacyId === p.id && x.project === p.project) || x.id === p.id,
        );
        idMap[p.id] =
          existing?.id || (/^[0-9a-f-]{36}$/i.test(p.id) ? p.id : id());
        if (!existing) {
          const copy = { ...p, id: idMap[p.id], legacyId: p.id };
          for (const f of Object.values(copy.files))
            if (f.storageId && !w.files[f.storageId]) {
              f.legacyStorageId = f.storageId;
              delete f.storageId;
            }
          state.people.push(copy);
        }
      }
      for (const key of ["messages", "notifications", "customTasks"])
        for (const item of data[key] || [])
          if (!state[key].some((x) => x.id === item.id))
            state[key].push({
              ...item,
              ...(item.personId
                ? { personId: idMap[item.personId] || item.personId }
                : {}),
              ...(item.personIds
                ? { personIds: item.personIds.map((x) => idMap[x] || x) }
                : {}),
            });
      store.save(state);
      return { idMap, ...snapshot(who) };
    }
    fail(404, "지원하지 않는 작업입니다.");
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, options = {}) => {
    const path = typeof input === "string" ? input : input.url;
    if (!path.startsWith("/api/")) return originalFetch(input, options);
    const who = actor;
    const task = queue
      .catch(() => {})
      .then(async () => {
        const current = await storage.read();
        if (current && current.version > w.version) w = current;
        const previous = structuredClone(w),
          previousActor = actor;
        try {
          const result = await dispatch(path, options, who);
          if (
            !["GET", "HEAD"].includes((options.method || "GET").toUpperCase())
          ) {
            w.version++;
            await storage.write(w);
            emit();
          }
          return result instanceof Response
            ? result
            : new Response(JSON.stringify(result), {
                status: 200,
                headers: { "Content-Type": "application/json; charset=utf-8" },
              });
        } catch (e) {
          w = previous;
          actor = previousActor;
          return new Response(JSON.stringify({ error: e.message }), {
            status: e.status || 400,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }
      });
    queue = task;
    return task;
  };
  const exclusive = (fn) => {
    const task = queue.catch(() => {}).then(fn);
    queue = task;
    return task;
  };
  return {
    storageKind: storage.kind,
    getResource: () => snapshot(actor),
    people: () => structuredClone(w.state.people),
    setActor: (value) => {
      actor = value;
      return snapshot(actor);
    },
    backup: () =>
      exclusive(
        async () =>
          new Blob(
            [
              JSON.stringify({
                format: "readyboard-offline-backup",
                version: 1,
                workspace: await packBackup(w),
              }),
            ],
            { type: "application/json" },
          ),
      ),
    restore: (file) =>
      exclusive(async () => {
        if (file.size > 100 * 1024 * 1024)
          throw new Error("100MB 이하의 백업을 선택해 주세요.");
        const input = JSON.parse(await file.text());
        if (input.format !== "readyboard-offline-backup" || input.version !== 1)
          throw new Error("레디보드 시연 백업 파일을 선택해 주세요.");
        const next = unpackBackup(input.workspace);
        if (
          !next ||
          next.schema !== 1 ||
          !Array.isArray(next.state?.people) ||
          !["messages", "notifications", "customTasks", "activity"].every((k) =>
            Array.isArray(next.state[k]),
          ) ||
          !["messages", "requests", "imports", "invitations", "audit"].every(
            (k) => Array.isArray(next[k]),
          ) ||
          !next.files ||
          typeof next.files !== "object" ||
          !next.manual ||
          !next.settings ||
          new Set(next.state.people.map((p) => p.id)).size !==
            next.state.people.length ||
          next.state.people.some(
            (p) =>
              !p.id ||
              !PROJECTS.includes(p.project) ||
              !p.name ||
              !p.company ||
              !p.tasks ||
              !p.files,
          ) ||
          Object.values(next.files).some(
            (f) => !(f.blob instanceof Blob) || !f.id || !f.personId,
          )
        )
          throw new Error("백업 데이터 형식을 확인해 주세요.");
        next.version = w.version + 1;
        await storage.write(next);
        w = next;
        emit();
        return snapshot(actor);
      }),
    reset: () =>
      exclusive(async () => {
        const next = initial();
        next.version = w.version + 1;
        await storage.write(next);
        w = next;
        actor = { kind: "admin", scope: "PMO" };
        emit();
        return snapshot(actor);
      }),
  };
}
