// Standalone HTML only. No network, real mailbox, AI key, or production DB.
import { analyzeMail } from "../../server/mail/analysis.js";
import {
  snapshotPerson,
  applyPersonnelChange,
} from "../../src/mail-application.js";
import { createPendingPerson } from "../../src/personnel-records.js";
import { validIsoDate } from "../../src/personnel-workflow.js";
export function installDemoApi(seed, actor) {
  const state = structuredClone(seed.states.pmo),
    messages = [],
    requests = [],
    invitations = {};
  let settings = { ...seed.inbox.settings };
  const originalFetch = window.fetch.bind(window),
    fail = (status, message) => {
      throw Object.assign(new Error(message), { status });
    };
  const ownState = () => ({
    ...structuredClone(state),
    people: state.people.filter((p) =>
      actor.kind === "member"
        ? p.id === actor.personId
        : actor.scope === "PMO" || p.project === actor.scope,
    ),
  });
  const inbox = () => ({
    provider: {
      ...seed.inbox.provider,
      notice: "HTML 합성 시연 · 실제 메일 연결 없음",
    },
    settings,
    requests: requests.map((r) => ({
      ...r,
      payload: r.edit,
      subject: r.message.subject,
      receivedAt: r.message.receivedAt,
      source: "mock",
      analysisMode: r.message.analysisMode,
      analysisNotice: r.message.analysisNotice,
    })),
    messages: messages.map((m) => ({
      ...m,
      preview: m.latestBody.slice(0, 160),
      requestCount: requests.filter((r) => r.messageId === m.id).length,
    })),
  });
  const detail = (r) => ({
    ...structuredClone(r),
    projectPeople: state.people.map(snapshotPerson),
    candidates: state.people
      .filter((p) => p.project === r.edit.project && p.name === r.edit.name)
      .map(snapshotPerson),
    selected: state.people.find((p) => p.id === r.edit.personId),
    thread: [],
    conflict: false,
  });
  window.fetch = async (input, options = {}) => {
    const path = String(typeof input === "string" ? input : input.url),
      method = options.method || "GET";
    if (!path.startsWith("/api/")) return originalFetch(input, options);
    let result,
      status = 200;
    try {
      const body =
        typeof options.body === "string"
          ? JSON.parse(options.body)
          : options.body || {};
      if (
        (path === "/api/state" && method === "GET") ||
        path === "/api/session"
      )
        result = { actor, state: ownState() };
      else if (path.startsWith("/api/mail/") && actor.scope !== "PMO")
        fail(403, "PMO 전용 화면입니다.");
      else if (path === "/api/mail/inbox") result = inbox();
      else if (path === "/api/mail/settings" && method === "PUT") {
        settings = { ...body };
        result = inbox();
      } else if (path === "/api/mail/sync") {
        let imported = 0,
          duplicates = 0;
        const created = [];
        if (!body.analyzeIds)
          for (const m of Object.values(seed.messages).filter(
            (m) =>
              m.source === "mock" &&
              settings.folder === seed.inbox.settings.folder &&
              (!settings.search ||
                `${m.subject}\n${m.latestBody}`.includes(settings.search)) &&
              (!settings.since || m.receivedAt >= settings.since),
          )) {
            if (messages.some((x) => x.id === m.id)) {
              duplicates++;
              continue;
            }
            messages.push({
              ...structuredClone(m),
              analysisState: "pending",
              analysisMode: null,
              analysisNotice: "",
            });
            imported++;
          }
        if (!body.collectOnly)
          for (const m of messages.filter(
            (m) =>
              (!body.analyzeIds || body.analyzeIds.includes(m.id)) &&
              m.analysisState !== "processed",
          )) {
            const years = [
              ...new Set(
                state.people
                  .filter((p) => m.subject.includes(p.project))
                  .map((p) => p.start?.slice(0, 4))
                  .filter(Boolean),
              ),
            ];
            const analysis = await analyzeMail(
              {
                ...m,
                referenceYear: years.length === 1 ? Number(years[0]) : null,
              },
              { aiKey: "" },
            );
            Object.assign(m, {
              analysisState: "processed",
              analysisMode: analysis.mode,
              analysisNotice: analysis.notice,
            });
            for (const payload of analysis.requests) {
              const id = crypto.randomUUID();
              requests.push({
                id,
                messageId: m.id,
                message: m,
                payload: structuredClone(payload),
                edit: structuredClone(payload),
                status: "pending",
                version: 1,
                snapshots: Object.fromEntries(
                  state.people
                    .filter(
                      (p) =>
                        p.name === payload.name &&
                        p.project === payload.project,
                    )
                    .map((p) => [p.id, snapshotPerson(p)]),
                ),
                history: [],
                result: null,
                personId: null,
              });
              created.push(id);
            }
          }
        result = {
          ...inbox(),
          created,
          imported,
          duplicates,
          errors: 0,
          analysisIds: messages.map((m) => m.id),
        };
      } else if (/^\/api\/mail\/messages\//.test(path)) {
        const m = messages.find((m) => m.id === path.split("/")[4]);
        if (!m) fail(404, "메일을 찾을 수 없습니다.");
        result = { message: m };
      } else if (/^\/api\/mail\/requests\//.test(path)) {
        const r = requests.find((r) => r.id === path.split("/")[4]);
        if (!r) fail(404, "초안을 찾을 수 없습니다.");
        const action = path.split("/")[5];
        if (method === "GET") result = { request: detail(r) };
        else if (action === "approve" && r.status === "applied")
          result = { request: detail(r), state: ownState(), reused: true };
        else {
          if (
            !["pending", "held"].includes(r.status) ||
            body.version !== r.version
          )
            fail(409, "최신 초안을 다시 확인하세요.");
          if (method === "PATCH") {
            r.edit = structuredClone(body.edit);
            r.version++;
            r.history.push({ kind: "edited", at: new Date().toISOString() });
            result = { request: detail(r) };
          } else if (action === "hold") {
            r.status = "held";
            r.version++;
            result = { request: detail(r) };
          } else if (action === "rebase") {
            const p = state.people.find((p) => p.id === body.personId);
            if (
              !p ||
              p.recordVersion !== body.personVersion ||
              !body.acknowledged
            )
              fail(409, "최신 인원 정보를 확인하세요.");
            r.snapshots[p.id] = snapshotPerson(p);
            r.version++;
            result = { request: detail(r) };
          } else if (action === "approve") {
            const q = r.edit;
            if (!body.reviewConfirmed) fail(400, "원문 검토를 확인하세요.");
            if (!q.name || !q.company || !q.project)
              fail(400, "이름·수행사·프로젝트를 확인하세요.");
            if (
              (q.type === "new" || q.startDateRequested) &&
              q.type !== "hold" &&
              !validIsoDate(q.startDate)
            )
              fail(400, "투입일을 확인하세요.");
            if (q.conditional && !body.conditionConfirmed)
              fail(400, "요청 조건을 확인하세요.");
            let p;
            if (q.type === "new") {
              if (!body.newRecordConfirmed)
                fail(400, "신규 기록 생성을 확인하세요.");
            } else {
              p = state.people.find((p) => p.id === q.personId);
              if (
                !p ||
                p.project !== q.project ||
                p.name !== q.name ||
                p.company !== q.company
              )
                fail(400, "대상 고유 인원 기록을 선택하세요.");
              if (r.snapshots[p.id]?.recordVersion !== p.recordVersion)
                fail(409, "인원 정보가 변경되었습니다.");
            }
            const beforeState = structuredClone(state);
            try {
              if (!p)
                p = createPendingPerson(state, {
                  project: q.project,
                  company: q.company,
                  name: q.name,
                  start: q.startDate,
                  end: q.endDate || "",
                  birthRaw: q.birthRaw || "",
                });
              const applied = applyPersonnelChange(state, p, q, r.id);
              p.recordVersion = (p.recordVersion || 0) + 1;
              p.mailSources = [
                ...(p.mailSources || []),
                { requestId: r.id, messageId: r.messageId },
              ];
              p.history.unshift({
                text: "메일 요청 승인 · HTML 시연",
                date: new Date().toLocaleString("ko-KR"),
              });
              state.revision++;
              r.status = "applied";
              r.version++;
              r.personId = p.id;
              r.result = {
                personId: p.id,
                displayId: p.displayId,
                before: applied.previous,
                after: snapshotPerson(p),
                changedDeadlines: applied.changedDeadlines,
                tasks: applied.tasks,
              };
              r.history.push({ kind: "applied", at: new Date().toISOString() });
              result = {
                request: detail(r),
                state: ownState(),
                personId: p.id,
              };
            } catch (e) {
              Object.assign(state, beforeState);
              throw e;
            }
          } else fail(400, "시연에서 지원하지 않는 요청입니다.");
        }
      } else if (/^\/api\/people\/[^/]+\/invitation$/.test(path)) {
        const id = path.split("/")[3],
          p = state.people.find((p) => p.id === id);
        if (!p) fail(404, "인원 없음");
        if (method === "POST") {
          const token = crypto.randomUUID();
          invitations[id] = {
            status: "active",
            url: `${location.href.split("#")[0]}#demo-invite=${token}`,
            expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
          };
        }
        result = invitations[id] || { status: "none" };
      } else
        fail(
          403,
          "HTML은 메일 읽기·검토·승인과 명단 반영을 시연합니다. 실제 등록·파일 저장·초대 링크 접속은 서버에서 실행해 주세요.",
        );
    } catch (e) {
      status = e.status || 400;
      result = { error: e.message };
    }
    return new Response(JSON.stringify(result), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  };
  return ownState();
}
