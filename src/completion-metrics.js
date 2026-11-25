import {
  tasksForPerson,
  taskStatus,
  evidenceStatus,
  isPrepared,
} from "./data.js";
import { DRAFT_TASK_IDS, procedureStep } from "./work-procedures.js";

export const COMPLETION_METRICS = [
  {
    id: "overall",
    title: "전체 투입 준비 완료율",
    help: "필수 준비·기안 기록·최종 준비 확인을 모두 마친 인원",
  },
  {
    id: "drafting",
    title: "기안 작성 완료율",
    help: "계정 신청 6종의 기안 작성을 별도로 완료 기록한 인원",
  },
  {
    id: "education",
    title: "교육 완료율",
    help: "필수 교육을 모두 수료하고 수료증을 등록한 인원",
  },
  {
    id: "documents",
    title: "필수 제출 서류 완료율",
    help: "투입 단계 필수 서류를 모두 제출하고 승인받은 인원 · 철수 서류 제외",
  },
];
export function personCompletion(person, data, metric) {
  if (person.registrationStatus === "pending_registration") return false;
  const custom = data.customTasks || [];
  const tasks = tasksForPerson(person, custom);
  if (metric === "overall")
    return (
      isPrepared(person, undefined, custom) &&
      taskStatus(person, "O16", undefined, custom) === "done" &&
      ["drafting", "education", "documents"].every((key) =>
        personCompletion(person, data, key),
      )
    );
  if (metric === "drafting")
    return DRAFT_TASK_IDS.every((id) => person.drafting?.[id]?.done === true);
  const list = tasks.filter(
    (t) =>
      !t.derived &&
      t.required !== false &&
      procedureStep(t.id)?.phase !== "exit" &&
      t.procedurePhase !== "exit" &&
      (metric === "education"
        ? t.group === "교육"
        : metric === "documents"
          ? t.group === "서류"
          : false),
  );
  return (
    list.length > 0 &&
    list.every((t) => {
      const status = taskStatus(person, t.id, undefined, custom);
      if (status !== "done") return false;
      // A registered certificate completes the course; evidence review is separate.
      return (
        metric !== "education" ||
        !["fix", "error"].includes(evidenceStatus(person, t.id))
      );
    })
  );
}
export function completionMetrics(people, data) {
  const unique = [...new Map(people.map((p) => [p.id, p])).values()];
  return COMPLETION_METRICS.map((metric) => {
    const completed = unique.filter((p) =>
      personCompletion(p, data, metric.id),
    ).length;
    return {
      ...metric,
      completed,
      total: unique.length,
      remaining: unique.length - completed,
      percent: unique.length
        ? Math.round((completed / unique.length) * 100)
        : null,
    };
  });
}
