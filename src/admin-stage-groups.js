import {
  PROCEDURE_PHASES,
  PROCEDURE_STEPS,
  DRAFT_TASK_IDS,
  procedureStep,
} from "./work-procedures.js";
import {
  businessDate,
  personIdentity,
  personState,
  taskRows,
  dayGap,
  horizonDays,
} from "./work-summary.js";
import { personCompletion } from "./completion-metrics.js";
import { taskStatus } from "./data.js";

export function adminStageGroups(
  people,
  data,
  scope = "PMO",
  today = businessDate(),
) {
  const groups = PROCEDURE_PHASES.map((phase) => ({
    ...phase,
    people: [],
    steps: PROCEDURE_STEPS.filter((s) => s.phase === phase.id).map((step) => ({
      ...step,
      id: step.taskId,
      people: [],
    })),
  }));
  groups[0].steps.unshift({
    id: "O01",
    taskId: "O01",
    title: "본인 등록",
    people: [],
  });
  groups[0].steps.push({
    id: "additional",
    title: "기존·추가 준비 및 최종 확인",
    people: [],
  });
  const scoped = [
    ...new Map(
      people
        .filter((p) => scope === "PMO" || p.project === scope)
        .map((p) => [p.id, p]),
    ).values(),
  ];
  const rows = taskRows(scoped, data, today);
  for (const person of scoped) {
    const state = personState(person, data, today),
      identity = personIdentity(data, person.id);
    const retired = /철수/.test(person.lifecycle || "");
    const endGap = dayGap(person.end, today);
    const exiting =
      retired ||
      (person.lifecycle === "투입 중" &&
        endGap !== null &&
        endGap <= horizonDays(data.settings));
    const own = rows
      .filter((r) => r.person.id === person.id && r.status !== "cancelled")
      .map((r) => {
        const draftPending =
          DRAFT_TASK_IDS.includes(r.task.id) &&
          !person.drafting?.[r.task.id]?.done;
        const courseDone =
          r.task.group === "교육" &&
          taskStatus(person, r.task.id, undefined, data.customTasks) ===
            "done" &&
          !["fix", "error"].includes(r.status);
        return {
          ...r,
          done:
            r.task.id === "O01"
              ? state.registered
              : (r.done || courseDone) && !draftPending,
          draftPending,
        };
      });
    const entryRows = own.filter(
      (r) =>
        (procedureStep(r.task.id)?.phase ||
          r.task.procedurePhase ||
          "entry") === "entry",
    );
    const workspace = own.filter((r) => r.task.id === "O13");
    const phases = [];
    if (!retired)
      phases.push([
        groups[0],
        entryRows,
        personCompletion(person, data, "overall"),
      ]);
    if (
      !retired &&
      state.registered &&
      workspace.some(
        (r) => r.done || r.actionable || person.lifecycle === "투입 중",
      )
    )
      phases.push([groups[1], workspace, workspace.every((r) => r.done)]);
    if (exiting && state.registered) {
      const exitRows = own.filter((r) => r.task.procedurePhase === "exit");
      phases.push([
        groups[2],
        exitRows,
        exitRows.length > 0 && exitRows.every((r) => r.done),
      ]);
    }
    for (const [group, list, complete] of phases) {
      const remaining = list.filter((r) => !r.done);
      const next =
        remaining.find((r) => r.draftPending) ||
        remaining.find((r) => r.owner === "admin" && r.actionable) ||
        remaining[0];
      const entry = {
        person,
        identity,
        state,
        next,
        held: !!person.onboardingHold?.active,
        phaseComplete: complete,
        remaining: remaining.length,
        needsFix: remaining.some((r) => r.status === "fix"),
        exitOverdue: group.id === "exit" && endGap < 0,
        rank: person.onboardingHold?.active
          ? 4
          : state.overdue
            ? 0
            : state.imminent
              ? 1
              : 3,
      };
      group.people.push(entry);
      for (const row of remaining) {
        const step =
          group.steps.find((s) => s.taskId === row.task.id) ||
          group.steps.find((s) => s.id === "additional");
        if (!step) continue;
        const existing = step.people.find((p) => p.person.id === person.id);
        if (!existing)
          step.people.push({
            ...entry,
            next: row,
            draftPending: row.draftPending,
          });
      }
    }
  }
  const sort = (a, b) =>
    a.rank - b.rank ||
    (a.person.start || "9999").localeCompare(b.person.start || "9999") ||
    a.identity.name.localeCompare(b.identity.name);
  for (const group of groups) {
    group.people.sort(sort);
    for (const step of group.steps) step.people.sort(sort);
    group.completed = group.people.filter((p) => p.phaseComplete).length;
    group.percent = group.people.length
      ? Math.round((group.completed / group.people.length) * 100)
      : null;
  }
  return groups;
}
