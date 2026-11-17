import { createProjectTask } from "./project-tasks.js";
import { reschedulePreparation } from "./personnel-workflow.js";
const normal = (v) =>
  String(v || "")
    .replace(/[\s_\-()（）]/g, "")
    .toLowerCase();
const groups = {
  account: "계정 준비",
  access: "출입 준비",
  education: "교육",
  document: "서류",
};
const error = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export function snapshotPerson(p) {
  return {
    id: p.id,
    displayId: p.displayId,
    project: p.project,
    name: p.name,
    company: p.company,
    start: p.start || "",
    end: p.end || "",
    registrationStatus: p.registrationStatus,
    lifecycle: p.lifecycle,
    recordVersion: p.recordVersion,
    tasks: p.tasks,
    taskOverrides: p.taskOverrides || {},
    onboardingHold: p.onboardingHold || null,
  };
}
function baseTask(request) {
  const title = normal(request.title);
  if (request.category === "account") {
    if (/egis/.test(title)) return "O02";
    if (/두레이|dooray/.test(title)) return "O04";
  }
  if (request.category === "access" && /출입/.test(title)) return "O13";
  if (request.category === "education") {
    if (/개인정보/.test(title)) return "O09";
    if (/정보보안|보안교육/.test(title)) return "O08";
  }
  if (request.category === "document") {
    if (/보안서약/.test(title)) return "O10";
    if (/개인정보.*동의/.test(title)) return "O11";
  }
  return null;
}
export function applyTaskRequests(state, person, requests, draftId) {
  const results = [];
  person.taskOverrides ||= {};
  person.taskDirectives ||= [];
  for (const [index, request] of requests.entries()) {
    let taskId =
      baseTask(request) ||
      state.customTasks.find(
        (t) =>
          t.project === person.project &&
          t.personIds?.length === 1 &&
          t.personIds[0] === person.id &&
          normal(t.title) === normal(request.title),
      )?.id;
    if (!taskId && request.action !== "cancel") {
      const task = createProjectTask(state, "PMO", {
        project: person.project,
        title: request.title,
        desc: `메일 승인 요청 · ${request.title}${["education", "document"].includes(request.category) ? " · 기존 교육/서류 양식 외 항목은 담당자와 처리 방법을 확인한 뒤 완료 확인합니다." : ""}`,
        group: groups[request.category],
        owner: ["account", "access"].includes(request.category)
          ? "admin"
          : "member",
        target: "selected",
        personIds: [person.id],
        dependency: "O01",
        required: true,
      });
      task.id = `C-mail-${draftId}-${index}`;
      task.sourceDraftId = draftId;
      task.dueOffsetDays = request.category === "account" ? -3 : -1;
      state.customTasks.push(task);
      taskId = task.id;
    }
    const completed = taskId && person.tasks[taskId] === "done";
    if (taskId && !completed)
      person.taskOverrides[taskId] = {
        ...person.taskOverrides[taskId],
        onHold: request.action === "hold",
        cancelled: request.action === "cancel",
        ...(request.action === "cancel"
          ? { required: false }
          : { required: true }),
        sourceDraftId: draftId,
      };
    const result = {
      taskId: taskId || null,
      title: request.title,
      action: request.action,
      completedPreserved: !!completed,
      note: completed
        ? "기존 완료 상태 유지"
        : !taskId
          ? "기존 작업 없음 · 취소 요청만 기록"
          : "개인별 준비 작업에 반영",
    };
    person.taskDirectives.push({
      ...result,
      draftId,
      at: new Date().toISOString(),
    });
    results.push(result);
  }
  return results;
}

export function applyPersonnelChange(state, person, request, id) {
  const oldStart = person.start;
  const previous = snapshotPerson(person);
  let changedDeadlines = [];
  if (request.type === "hold") {
    person.onboardingHold = {
      active: true,
      reason: request.reviewNote || "메일 투입 보류 요청",
      sourceDraftId: id,
      at: new Date().toISOString(),
    };
    person.lifecycle = "투입 보류";
  } else {
    if (request.startDate) person.start = request.startDate;
    if (request.endDate) person.end = request.endDate;
    if (request.resume) {
      person.onboardingHold = {
        active: false,
        sourceDraftId: id,
        at: new Date().toISOString(),
      };
      if (person.lifecycle === "투입 보류") person.lifecycle = "투입 예정";
    }
  }
  if (person.start && person.end && person.start > person.end)
    error(
      400,
      "기존 종료일보다 투입 시작일이 늦습니다. 종료일도 확인해 주세요.",
    );
  const tasks = applyTaskRequests(state, person, request.tasks, id);
  if (request.type !== "hold")
    changedDeadlines = reschedulePreparation(
      state,
      person,
      oldStart,
      person.start,
      oldStart === person.start && request.type !== "new"
        ? tasks.map((t) => t.taskId).filter(Boolean)
        : null,
    );
  return { previous, tasks, changedDeadlines };
}
