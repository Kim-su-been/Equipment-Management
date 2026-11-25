import { authorizedPeople } from "./onboarding.js";
import { DRAFT_TASK_IDS } from "./work-procedures.js";

export function recordDraftCompletion(
  data,
  scope,
  selection,
  recordedBy = scope,
) {
  if (
    !DRAFT_TASK_IDS.includes(selection.taskId) ||
    typeof selection.done !== "boolean"
  )
    throw new Error("기안 기록 대상과 완료 여부를 확인해 주세요.");
  const people = authorizedPeople(
    data,
    scope,
    scope === "PMO" ? "전체" : scope,
    selection.personIds,
  );
  if (people.some((p) => p.registrationStatus === "pending_registration"))
    throw new Error(
      "본인 등록을 완료한 인원만 기안 완료를 기록할 수 있습니다.",
    );
  const at = new Date().toISOString();
  const changed = people.filter(
    (p) => !!p.drafting?.[selection.taskId]?.done !== selection.done,
  );
  for (const person of changed) {
    person.drafting ||= {};
    person.drafting[selection.taskId] = {
      done: selection.done,
      recordedAt: at,
      recordedBy,
    };
    person.history ||= [];
    person.history.unshift({
      text: `${selection.taskId} · 기안 작성 ${selection.done ? "완료 기록" : "완료 기록 취소"}`,
      date: at,
    });
  }
  return changed.length;
}
export function validDrafting(records) {
  return (
    records &&
    typeof records === "object" &&
    !Array.isArray(records) &&
    Object.entries(records).every(
      ([id, value]) =>
        DRAFT_TASK_IDS.includes(id) &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).every((key) =>
          ["done", "recordedAt", "recordedBy"].includes(key),
        ) &&
        typeof value.done === "boolean" &&
        typeof value.recordedAt === "string" &&
        Number.isFinite(Date.parse(value.recordedAt)) &&
        typeof value.recordedBy === "string" &&
        value.recordedBy.length <= 80,
    )
  );
}
