import { taskStatus, tasksForPerson } from "./data.js";
import { procedureStep } from "./work-procedures.js";

export function batchEligibility(person, task, customTasks = []) {
  if (person.registrationStatus === "pending_registration")
    return "본인 등록 완료 후 선택할 수 있습니다.";
  if (person.onboardingHold?.active) return "투입 보류 중인 인원입니다.";
  if (task.owner !== "admin" || task.derived)
    return "수행사가 처리하거나 자동 집계되는 작업입니다.";
  const phase = procedureStep(task.id)?.phase;
  if (phase === "entry" && person.lifecycle === "철수")
    return "철수한 인원은 투입 신청에서 제외됩니다.";
  if (
    phase === "exit" &&
    !["투입 중", "철수 예정", "철수"].includes(person.lifecycle)
  )
    return "투입 중이거나 철수 예정·철수 상태인 인원만 선택할 수 있습니다.";
  const status = taskStatus(person, task.id, undefined, customTasks);
  if (["done", "cancelled"].includes(status))
    return "이미 완료했거나 취소된 작업입니다.";
  if (!["ready", "progress", "review", "error"].includes(status)) {
    const prerequisites = tasksForPerson(person, customTasks).filter(
      (t) =>
        task.deps?.includes(t.id) &&
        taskStatus(person, t.id, undefined, customTasks) !== "done",
    );
    return prerequisites.length
      ? `${prerequisites.map((t) => t.title).join(", ")} 완료 후 선택할 수 있습니다.`
      : "선행 작업 또는 작업 보류 상태를 확인해 주세요.";
  }
  return "";
}
