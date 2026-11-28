import { TASKS, PROJECTS } from "./data.js";
export function resolveContact(settings, person, taskId) {
  const task = TASKS.find((t) => t.id === taskId);
  const specific = settings.contactRoutes?.[`${person.project}:${taskId}`];
  const fallback = settings.contactRoutes?.[`${person.project}:default`];
  const group = task?.group || "추가 작업";
  return {
    ...(specific ||
      fallback || {
        name: `${person.project === "SFA" ? "SFA" : "GW"}-담당자`,
        memberId: "",
      }),
    project: person.project,
    taskId,
    group,
  };
}
export function saveContactRoute(settings, scope, form) {
  if (
    !PROJECTS.includes(form.project) ||
    (scope !== "PMO" && scope !== form.project) ||
    !["PMO", ...PROJECTS].includes(scope)
  )
    throw new Error("담당 프로젝트 연락처만 설정할 수 있습니다.");
  if (form.taskId !== "default" && !TASKS.some((t) => t.id === form.taskId))
    throw new Error("작업을 확인해 주세요.");
  if (
    !form.name?.trim() ||
    form.name.length > 80 ||
    !/^[a-zA-Z0-9_.@-]{0,120}$/.test(form.memberId || "")
  )
    throw new Error("담당자명과 Dooray 수신자 ID를 확인해 주세요.");
  return {
    ...settings,
    contactRoutes: {
      ...(settings.contactRoutes || {}),
      [`${form.project}:${form.taskId}`]: {
        name: form.name.trim(),
        memberId: form.memberId || "",
      },
    },
  };
}
export function buildDoorayMessage(person, task, title, body, status, route) {
  return {
    recipient: route.memberId || null,
    recipientName: route.name,
    project: person.project,
    taskId: task.id,
    text: `[파트너360 문의] ${title}\n프로젝트: ${person.project}\n문의자: ${person.name || person.id} (${person.id})\n관련 작업: ${task.title}\n현재 상태: ${status}\n담당자: ${route.name}\n\n${body}`,
    delivery: "not_connected",
    idempotencyKey: crypto.randomUUID(),
  };
}
