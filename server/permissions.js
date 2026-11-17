import { TASKS, taskStatus, isPrepared, evidenceStatus } from "../src/data.js";
import {
  entityState,
  readPath,
  writePath,
  restoreState,
} from "../src/state-patch.js";
import { reschedulePreparation } from "../src/personnel-workflow.js";
import { createProjectTask } from "../src/project-tasks.js";
import { inScope } from "./store.js";
const immutable = new Set([
  "id",
  "project",
  "projectId",
  "companyId",
  "displayId",
  "legacyId",
  "registrationStatus",
  "registeredAt",
  "birthDate",
  "birthYear",
  "birthPrecision",
  "importSources",
  "recordVersion",
  "mailSources",
  "onboardingHold",
  "taskDirectives",
]);
export function applyStatePatch(store, actor, ops) {
  if (!Array.isArray(ops) || ops.length > 250)
    throw Object.assign(new Error("저장 변경 범위를 확인해 주세요."), {
      status: 400,
    });
  const original = store.load(),
    entities = entityState(original);
  for (const op of ops) {
    if (
      !Array.isArray(op.path) ||
      op.path.length < 2 ||
      op.path.length > 12 ||
      op.path.some(
        (k) =>
          typeof k !== "string" ||
          ["__proto__", "prototype", "constructor"].includes(k),
      )
    )
      throw Object.assign(new Error("잘못된 변경 경로입니다."), {
        status: 400,
      });
    const [collection, id, field, taskId] = op.path;
    const person = original.people.find((p) => p.id === id);
    if (collection === "people") {
      if (
        !person ||
        !inScope(actor, person) ||
        op.path.length < 3 ||
        immutable.has(field)
      )
        throw Object.assign(
          new Error("해당 인원 또는 등록 기본 정보는 변경할 수 없습니다."),
          { status: 403 },
        );
      if (actor.kind === "member") {
        if (
          ![
            "tasks",
            "files",
            "certChecks",
            "notes",
            "history",
            "submissions",
            "documentDrafts",
            "fileHistory",
          ].includes(field)
        )
          throw Object.assign(new Error("본인에게 허용되지 않은 변경입니다."), {
            status: 403,
          });
        if (field === "tasks") {
          if (["O10", "O11"].includes(taskId) && op.value === "done")
            throw Object.assign(
              new Error("제출 서류 승인은 주관사만 처리할 수 있습니다."),
              { status: 403 },
            );
          const task =
            TASKS.find((t) => t.id === taskId) ||
            (original.customTasks || []).find((t) => t.id === taskId);
          if (
            !task ||
            task.owner !== "member" ||
            !["done", "ai", "review", "fix"].includes(op.value)
          )
            throw Object.assign(
              new Error("주관사 작업은 수행사가 처리할 수 없습니다."),
              { status: 403 },
            );
          if (
            !["ready", "progress", "fix", "done", "ai"].includes(
              taskStatus(person, taskId, {}, original.customTasks),
            )
          )
            throw Object.assign(new Error("선행 작업을 먼저 완료해 주세요."), {
              status: 409,
            });
        }
        if (field === "certChecks" && !["ai", "review"].includes(op.value))
          throw Object.assign(new Error("증빙 승인은 주관사가 처리합니다."), {
            status: 403,
          });
      }
      if (actor.kind === "admin" && field === "tasks") {
        const task =
          TASKS.find((t) => t.id === taskId) ||
          (original.customTasks || []).find((t) => t.id === taskId);
        if (!task)
          throw Object.assign(new Error("유효하지 않은 준비 작업입니다."), {
            status: 400,
          });
        if (
          task.owner === "member" &&
          !["O08", "O09", "O10", "O11"].includes(taskId)
        )
          throw Object.assign(new Error("수행사 본인의 작업입니다."), {
            status: 403,
          });
        if (
          task.owner === "admin" &&
          op.value === "done" &&
          (!["ready", "progress"].includes(
            taskStatus(person, taskId, {}, original.customTasks),
          ) ||
            (taskId === "O16" && !isPrepared(person, {}, original.customTasks)))
        )
          throw Object.assign(new Error("필수 선행 작업을 확인해 주세요."), {
            status: 409,
          });
      }
    } else if (collection === "settings") {
      if (
        actor.kind === "member" ||
        (actor.scope !== "PMO" &&
          !(
            id === "contactRoutes" &&
            String(field).startsWith(`${actor.scope}:`)
          ))
      )
        throw Object.assign(new Error("설정 변경 권한이 없습니다."), {
          status: 403,
        });
    } else if (
      ["messages", "notifications", "customTasks"].includes(collection)
    ) {
      const item =
        entities[collection][id] || (op.path.length === 2 ? op.value : null);
      if (collection === "customTasks") {
        if (op.path.length !== 2 || entities.customTasks[id])
          throw Object.assign(
            new Error("추가 작업은 신규 생성만 지원합니다."),
            { status: 403 },
          );
        if (!item || item.id !== id || !id.startsWith("C-"))
          throw Object.assign(new Error("작업 ID를 확인해 주세요."), {
            status: 400,
          });
        createProjectTask(original, actor.scope, {
          ...item,
          target: item.personIds ? "selected" : "all",
          dependency: item.deps?.[0] || "",
        });
        if ((item.deps || []).length > 1)
          throw Object.assign(
            new Error("추가 작업 선행 기준을 확인해 주세요."),
            { status: 400 },
          );

        if (
          actor.kind === "member" ||
          !item ||
          (actor.scope !== "PMO" && item.project !== actor.scope) ||
          item.kind === "seat" ||
          item.deps?.includes("O14")
        )
          throw Object.assign(new Error("작업 추가 범위를 벗어났습니다."), {
            status: 403,
          });
      } else {
        const owner = original.people.find((p) => p.id === item?.personId);
        if (
          !item ||
          (owner
            ? !inScope(actor, owner)
            : actor.kind === "member" ||
              (actor.scope !== "PMO" && item.project !== actor.scope))
        )
          throw Object.assign(
            new Error("해당 문의·알림에 접근할 수 없습니다."),
            { status: 403 },
          );
        if (
          actor.kind === "member" &&
          collection === "messages" &&
          op.path.length > 2 &&
          ["reply", "status"].includes(field)
        )
          throw Object.assign(new Error("담당자 답변 권한이 없습니다."), {
            status: 403,
          });
      }
    } else
      throw Object.assign(new Error("지원하지 않는 저장 항목입니다."), {
        status: 400,
      });
    const current = readPath(entities, op.path);
    // Independent task actions may append history concurrently. Preserve both additions;
    // all actual business fields still require their original values to match.
    if (
      collection === "people" &&
      field === "history" &&
      op.path.length === 3 &&
      Array.isArray(current) &&
      Array.isArray(op.oldValue) &&
      Array.isArray(op.value) &&
      op.value.length >= op.oldValue.length &&
      JSON.stringify(op.value.slice(op.value.length - op.oldValue.length)) ===
        JSON.stringify(op.oldValue)
    ) {
      const added = op.value.slice(0, op.value.length - op.oldValue.length);
      writePath(entities, op.path, [...added, ...current]);
      continue;
    }
    if (
      (current !== undefined) !== !!op.hadOld ||
      JSON.stringify(current ?? null) !== JSON.stringify(op.oldValue)
    )
      throw Object.assign(
        new Error(
          "다른 사용자가 같은 항목을 변경했습니다. 최신 상태를 확인하고 다시 처리해 주세요.",
        ),
        { status: 409 },
      );
    writePath(entities, op.path, op.value, op.remove);
  }
  const next = restoreState(entities, original);
  for (const op of ops) {
    if (op.path[0] !== "people") continue;
    const [, id, field, taskId] = op.path,
      person = next.people.find((p) => p.id === id),
      before = original.people.find((p) => p.id === id);
    if (
      field === "tasks" &&
      ["O08", "O09", "O10", "O11"].includes(taskId) &&
      ["done", "review", "ai", "fix", "error"].includes(op.value) &&
      !person.files?.[taskId]
    )
      throw Object.assign(new Error("증빙 원본을 먼저 제출해 주세요."), {
        status: 409,
      });
    if (
      field === "tasks" &&
      actor.kind === "admin" &&
      ["O10", "O11"].includes(taskId) &&
      ["done", "fix"].includes(op.value) &&
      !["review", "error", "fix", "done"].includes(
        evidenceStatus(before, taskId),
      )
    )
      throw Object.assign(new Error("검토 요청 상태를 먼저 확인해 주세요."), {
        status: 409,
      });
  }

  for (const person of next.people) {
    const previous = original.people.find((p) => p.id === person.id);
    if (previous?.start !== person.start)
      reschedulePreparation(next, person, previous?.start, person.start);
  }
  // Uploaded references must belong to the same person and task; client-only fake IDs cannot grant access.
  for (const person of next.people)
    for (const [taskId, file] of Object.entries(person.files || {})) {
      if (file.storageId) {
        const saved = store.db
          .prepare("SELECT person_id,task_id FROM files WHERE id=?")
          .get(file.storageId);
        if (!saved || saved.person_id !== person.id || saved.task_id !== taskId)
          throw Object.assign(
            new Error("제출 원본 연결을 확인할 수 없습니다."),
            { status: 400 },
          );
      }
    }
  for (const person of next.people)
    if (person.start && person.end && person.start > person.end)
      throw Object.assign(new Error("투입 종료일은 시작일 이후여야 합니다."), {
        status: 400,
      });
  next.activity.unshift({
    id: crypto.randomUUID(),
    personId: actor.personId || null,
    project: actor.scope === "PMO" ? null : actor.scope,
    title: "준비 정보 변경",
    desc: actor.kind === "member" ? "수행사 처리" : "주관사 처리",
    time: new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
  next.activity = next.activity.slice(0, 100);
  store.save(next);
  store.audit(actor, "state.patch", { paths: ops.map((op) => op.path) });
  return next;
}
