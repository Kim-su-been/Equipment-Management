import {
  tasksForPerson,
  requiredTasks,
  taskStatus,
  isPrepared,
  progress,
  evidenceStatus,
} from "./data.js";
import {
  validIsoDate,
  DEFAULT_DEADLINE_OFFSETS,
  shiftDate,
} from "./personnel-workflow.js";
import { resolveContact } from "./dooray.js";
export const businessDate = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
export const dayGap = (date, today = businessDate()) =>
  validIsoDate(date) && validIsoDate(today)
    ? Math.round((Date.parse(date) - Date.parse(today)) / 86400000)
    : null;
export const horizonDays = (settings) => {
  const n = Number(settings?.imminentDays ?? settings?.upcomingDays ?? 7);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : 7;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
export function personIdentity(data, id) {
  const p = data.people.find((p) => p.id === id);
  return {
    person: p,
    name: p?.name && !uuid.test(p.name) ? p.name : "인원 정보 확인 필요",
    company: p?.company || "소속 확인 필요",
    project: p?.project || "프로젝트 확인 필요",
    code:
      p?.displayId && p.displayId !== p.name && !uuid.test(p.displayId)
        ? p.displayId
        : "",
    missing: !p || !p.name || uuid.test(p.name),
  };
}
export function personState(p, data, today = businessDate()) {
  const custom = data.customTasks || [],
    ready = requiredTasks(p, custom).every(
      (t) => taskStatus(p, t.id, undefined, custom) === "done",
    ),
    registered = p.registrationStatus !== "pending_registration",
    final = ready && taskStatus(p, "O16", undefined, custom) === "done",
    remaining = requiredTasks(p, custom).filter(
      (t) => taskStatus(p, t.id, undefined, custom) !== "done",
    ),
    gap = dayGap(p.start, today),
    planned = p.lifecycle === "투입 예정";
  return {
    registered,
    ready,
    final,
    remaining,
    gap,
    pct: progress(p, undefined, custom) || 0,
    registration: registered ? "등록 완료" : "본인 등록 대기",
    preparation: !registered
      ? "본인 등록 후 준비"
      : !ready
        ? "필수 준비 미완료"
        : final
          ? "최종 준비 확인 완료"
          : "필수 항목 완료 · 최종 확인 대기",
    lifecycle: p.lifecycle || "투입 예정",
    overdue: planned && gap !== null && gap < 0,
    imminent:
      planned &&
      gap !== null &&
      gap >= 0 &&
      gap <= horizonDays(data.settings) &&
      !ready,
  };
}
export function taskRows(people, data, today = businessDate()) {
  return people
    .flatMap((p) =>
      tasksForPerson(p, data.customTasks || [])
        .filter((t) => !t.derived)
        .map((t) => {
          const original = taskStatus(
              p,
              t.id,
              undefined,
              data.customTasks || [],
            ),
            evidence = ["O08", "O09", "O10", "O11"].includes(t.id)
              ? evidenceStatus(p, t.id)
              : null,
            status = ["review", "error", "fix"].includes(evidence)
              ? evidence
              : original,
            owner = ["review", "error"].includes(evidence) ? "admin" : t.owner;
          const offset =
              data.settings?.preparationDeadlineRules?.[p.project]?.[t.id] ??
              DEFAULT_DEADLINE_OFFSETS[t.id],
            due =
              t.due ||
              (validIsoDate(p.start) && Number.isInteger(offset)
                ? shiftDate(p.start, offset)
                : ""),
            gap = dayGap(due, today);
          const blockedBy = (t.deps || []).filter(
            (id) =>
              !["done", "cancelled"].includes(
                taskStatus(p, id, undefined, data.customTasks || []),
              ),
          );
          if (t.id === "O16")
            for (const req of requiredTasks(p, data.customTasks || []))
              if (
                taskStatus(p, req.id, undefined, data.customTasks || []) !==
                  "done" &&
                !blockedBy.includes(req.id)
              )
                blockedBy.push(req.id);
          const contact = resolveContact(data.settings, p, t.id),
            actionable = [
              "ready",
              "progress",
              "review",
              "error",
              "fix",
              "ai",
            ].includes(status);
          return {
            person: p,
            task: t,
            status,
            owner,
            due,
            gap,
            blockedBy,
            actionable,
            done: ["done", "cancelled"].includes(status),
            contact: owner === "admin" ? contact.name : `${p.name} (본인)`,
            registrationBlocked:
              p.registrationStatus === "pending_registration" && t.id !== "O01",
          };
        }),
    )
    .sort(
      (a, b) =>
        Number(b.actionable) - Number(a.actionable) ||
        (a.due || "9999").localeCompare(b.due || "9999") ||
        a.person.name.localeCompare(b.person.name),
    );
}
export function attentionRows(people, data, today = businessDate()) {
  const rows = taskRows(people, data, today);
  return people
    .map((p) => {
      const state = personState(p, data, today),
        own = rows.filter((r) => r.person.id === p.id && !r.done),
        next =
          own.find((r) => r.owner === "admin" && r.actionable) ||
          own.find((r) => r.owner === "member" && r.actionable) ||
          own[0];
      const kind = !state.registered
        ? "invite"
        : state.overdue
          ? "lifecycle"
          : state.ready && !state.final
            ? "final"
            : next?.status === "review" || next?.status === "error"
              ? "review"
              : "task";
      return {
        personId: p.id,
        state,
        next,
        kind,
        due: next?.due || p.start,
        reason: !state.registered
          ? "개인 초대 · 본인 등록 대기"
          : state.overdue
            ? "예정일 경과 · 투입 여부 확인 필요"
            : state.imminent
              ? "투입 임박 · 준비 미완료"
              : state.ready && !state.final
                ? "필수 항목 완료 · 최종 확인 대기"
                : next?.task.title || "준비 상태 확인",
        rank: state.overdue
          ? 0
          : state.imminent
            ? 1
            : kind === "review"
              ? 2
              : kind === "final"
                ? 3
                : !state.registered
                  ? 4
                  : 5,
      };
    })
    .filter(
      (r) =>
        !r.state.registered ||
        r.state.overdue ||
        !r.state.ready ||
        !r.state.final,
    )
    .sort(
      (a, b) =>
        a.rank - b.rank || (a.due || "9999").localeCompare(b.due || "9999"),
    );
}
export function summaryCounts(
  people,
  data,
  requests = [],
  today = businessDate(),
) {
  const scopeProjects = new Set(people.map((p) => p.project));
  return {
    total: people.length,
    imminent: people.filter((p) => personState(p, data, today).imminent).length,
    overdue: people.filter(
      (p) =>
        personState(p, data, today).overdue &&
        !personState(p, data, today).ready,
    ).length,
    reviews: taskRows(people, data, today).filter(
      (r) =>
        ["review", "error"].includes(r.status) && !!r.person.files?.[r.task.id],
    ).length,
    mail: requests.filter(
      (r) =>
        r.status === "pending" &&
        (scopeProjects.has(r.payload.project) ||
          (!r.payload.project &&
            (scopeProjects.size === 2 ||
              people.length === data.people.length))),
    ).length,
  };
}
export function matchesPerson(p, data, filters, today = businessDate()) {
  const s = personState(p, data, today),
    q = (filters.search || "").toLowerCase();
  return (
    (!q ||
      [p.name, p.displayId, p.company, p.role]
        .join(" ")
        .toLowerCase()
        .includes(q)) &&
    (!filters.project ||
      filters.project === "전체" ||
      p.project === filters.project) &&
    (!filters.registration ||
      filters.registration === "전체" ||
      (filters.registration === "pending_registration"
        ? !s.registered
        : s.registered)) &&
    (!filters.lifecycle ||
      filters.lifecycle === "전체" ||
      s.lifecycle === filters.lifecycle) &&
    (!filters.preparation ||
      filters.preparation === "전체" ||
      {
        incomplete: !s.ready,
        final_pending: s.ready && !s.final,
        confirmed: s.final,
        imminent: s.imminent,
        overdue: s.overdue && !s.ready,
      }[filters.preparation])
  );
}
