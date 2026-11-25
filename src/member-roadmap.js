import { requiredTasks } from "./data.js";
import { personState, taskRows } from "./work-summary.js";

export const PREPARATION_STAGES = [
  { id: "registration", title: "본인 등록" },
  { id: "accounts", title: "계정 준비" },
  { id: "submission", title: "교육·서류 제출" },
  { id: "review", title: "주관사 검토" },
  { id: "final", title: "최종 준비 확인" },
];

// Presentation only: use effective evidence/dependency states without writing tasks.
export function memberRoadmap(person, data) {
  const state = personState(person, data);
  const rows = taskRows([person], data).filter((r) => r.status !== "cancelled");
  const requiredIds = new Set(
    requiredTasks(person, data.customTasks || []).map((t) => t.id),
  );
  const required = rows.filter((r) => requiredIds.has(r.task.id));
  const ready =
    state.registered &&
    !person.onboardingHold?.active &&
    required.length === requiredIds.size &&
    required.every((r) => r.status === "done");
  const final = ready && state.final;
  const personal = rows.filter(
    (r) => r.task.owner === "member" && r.task.id !== "O01",
  );
  const accounts = rows.filter((r) => r.task.group === "계정 준비");
  const submissions = personal.filter((r) => r.task.group !== "계정 준비");
  const evidence = rows.filter((r) =>
    ["education", "document"].includes(r.task.kind),
  );
  const submitted = (r) =>
    r.done || (!!r.task.kind && ["review", "ai", "error"].includes(r.status));
  const submitItem = (r) => ({
    ...r,
    done: submitted(r),
    label: r.done ? "완료" : submitted(r) ? "제출 완료" : null,
  });
  const stages = [
    {
      ...PREPARATION_STAGES[0],
      countLabel: "완료",
      description: "기본 정보를 확인하고 본인 정보를 등록해요.",
      items: [
        {
          task: { id: "O01", title: "본인 정보 등록", owner: "member" },
          done: state.registered,
          status: state.registered ? "done" : "ready",
          registration: true,
        },
      ],
    },
    {
      ...PREPARATION_STAGES[1],
      countLabel: "완료",
      description: "주관사의 계정 발급 후 최초 접속을 확인해요.",
      items: accounts,
    },
    {
      ...PREPARATION_STAGES[2],
      countLabel: "제출·처리",
      description: "교육 수료증과 서류를 제출하고 추가 작업을 처리해요.",
      items: submissions.map(submitItem),
    },
    {
      ...PREPARATION_STAGES[3],
      countLabel: "승인",
      description: "제출물 검토 결과를 확인하고 보완 요청을 처리해요.",
      items: evidence,
    },
    {
      ...PREPARATION_STAGES[4],
      countLabel: "확인",
      description: "출입 등 남은 필수 준비와 주관사의 최종 확인을 기다려요.",
      items: rows
        .filter(
          (r) =>
            r.task.id === "O16" ||
            (requiredIds.has(r.task.id) &&
              !accounts.includes(r) &&
              !submissions.some((s) => s.task.id === r.task.id) &&
              !evidence.includes(r)),
        )
        .map((r) =>
          r.task.id === "O16" && !ready
            ? {
                ...r,
                done: false,
                status: person.onboardingHold?.active ? "on_hold" : "waiting",
              }
            : r,
        ),
    },
  ].map((stage) => ({
    ...stage,
    completed: stage.items.filter((r) => r.done).length,
    total: stage.items.length,
    done: stage.items.every((r) => r.done),
  }));
  // A cancelled required task is excluded from the visual checklist, but does
  // not satisfy the existing preparation rule or unlock final confirmation.
  stages[4].done = final;
  const mine =
    state.registered && !person.onboardingHold?.active
      ? personal.filter((r) => r.owner === "member" && !r.done && r.actionable)
      : [];
  const fixes = personal.filter((r) => r.status === "fix");
  const reviewing = evidence.filter((r) =>
    ["review", "ai", "error"].includes(r.status),
  );
  let current;
  if (!state.registered) current = stages[0];
  else if (final || ready) current = stages[4];
  else if (fixes.length) current = stages[2];
  else if (mine.length && !person.onboardingHold?.active)
    current =
      stages.find((s) =>
        s.items.some((r) => mine.some((m) => m.task.id === r.task.id)),
      ) || stages[2];
  else if (reviewing.length) current = stages[3];
  else current = stages.find((s) => !s.done) || stages[4];
  const held = !!person.onboardingHold?.active;
  const note = held
    ? "투입이 보류되어 준비 작업이 잠시 멈췄어요. 담당자에게 확인해 주세요."
    : !state.registered
      ? "개인 초대 링크에서 본인 등록을 마치면 준비 작업을 시작할 수 있어요."
      : final
        ? "최종 준비 확인이 끝났어요. 실제 투입 일정과 안내를 확인해 주세요."
        : ready
          ? "필수 준비가 충족되었습니다. 주관사의 최종 준비 확인을 기다려 주세요."
          : fixes.length
            ? `보완 요청 ${fixes.length}건을 수정한 뒤 다시 제출해 주세요.`
            : mine.length
              ? `지금 처리할 수 있는 내 작업이 ${mine.length}건 있어요. 아래 목록에서 바로 시작하세요.`
              : reviewing.length
                ? `제출물 ${reviewing.length}건을 주관사에서 확인하고 있어요. 검토 결과를 기다려 주세요.`
                : "주관사 준비 또는 선행 작업을 기다리고 있어요. 단계별 작업에서 대기 이유를 확인하세요.";
  return {
    stages,
    current,
    note,
    held,
    final,
    progress: requiredIds.size
      ? Math.round(
          (required.filter((r) => r.status === "done").length /
            requiredIds.size) *
            100,
        )
      : 0,
    personal,
    mine,
    reviewing,
    fixes,
    completed: personal.filter((r) => r.done),
    waiting: personal.filter((r) => !r.done && !mine.includes(r)),
  };
}
