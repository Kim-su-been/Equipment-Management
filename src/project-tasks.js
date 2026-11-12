import { PROJECTS, TASKS, canManage } from "./data.js";

// Validate again at the state boundary; a disabled project select is not a permission check.
export function createProjectTask(data, scope, form) {
  const project = form.project;
  if (
    !["PMO", ...PROJECTS].includes(scope) ||
    !["전체", ...PROJECTS].includes(project) ||
    (scope !== "PMO" && project !== scope)
  ) {
    throw new Error("담당 프로젝트에만 작업을 추가할 수 있습니다.");
  }
  const title = form.title?.trim();
  const desc = form.desc?.trim();
  if (!title || title.length > 100 || !desc || desc.length > 1000)
    throw new Error(
      "작업명(100자 이내)과 안내 내용(1,000자 이내)을 입력해 주세요.",
    );
  if (!["admin", "member"].includes(form.owner))
    throw new Error("작업의 수행 주체를 선택해 주세요.");
  const deps = form.dependency ? [form.dependency] : [];
  if (deps.some((id) => !TASKS.some((t) => t.id === id && id !== "O16")))
    throw new Error("유효한 선행 작업을 선택해 주세요.");
  const due = form.due || "";
  if (
    due &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(due) ||
      !Number.isFinite(Date.parse(due)) ||
      new Date(due).toISOString().slice(0, 10) !== due)
  )
    throw new Error("처리 기한을 올바른 날짜로 입력해 주세요.");
  let personIds = null;
  if (form.target === "selected") {
    personIds = [...new Set(form.personIds || [])];
    if (
      !personIds.length ||
      personIds.some(
        (id) =>
          !data.people.some(
            (p) =>
              p.id === id &&
              canManage(scope, p) &&
              (project === "전체" || p.project === project),
          ),
      )
    )
      throw new Error(
        "선택한 프로젝트의 대상 인원을 한 명 이상 지정해 주세요.",
      );
  } else if (form.target !== "all") {
    throw new Error("작업 대상 범위를 선택해 주세요.");
  }
  return {
    id: `C-${crypto.randomUUID()}`,
    title,
    desc,
    owner: form.owner,
    group: "추가 작업",
    custom: true,
    project,
    personIds,
    deps,
    due,
    required: form.required !== false,
    createdBy: scope,
    createdAt: new Date().toISOString(),
  };
}
