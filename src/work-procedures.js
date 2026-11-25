// Stable task IDs keep existing people and completed work intact.
export const PROCEDURE_PHASES = [
  {
    id: "entry",
    title: "투입 단계",
    description: "보안교육·서약서와 시스템별 계정 신청",
  },
  { id: "execution", title: "수행 단계", description: "업무공간 출입 등록" },
  {
    id: "exit",
    title: "철수 단계",
    description: "서약서·파기확인서·철수확인서 징구",
  },
];
export const PROCEDURE_TASKS = [
  ["P-PASSWORD", "패스워드 솔루션 계정 신청"],
  ["P-DBSAFER", "DB Safer 계정 신청"],
  ["P-DBUSER", "DB 사용자 계정 신청"],
  ["P-NGS", "NGS 계정 생성 신청"],
  ["P-SOFTMANAGER", "소프트매니저 계정 신청"],
]
  .map(([id, title]) => ({
    id,
    title,
    owner: "admin",
    group: "계정 준비",
    procedurePhase: "entry",
    deps: ["O01"],
    required: true,
    desc: "신청이 필요한 인원을 선택해 기안 첨부용 예시 엑셀을 작성합니다. 사내 결재·계정 발급 결과를 확인한 뒤 완료 처리하세요.",
  }))
  .concat(
    [
      ["P-NDA", "비밀준수 서약서 징구"],
      ["P-DESTROY", "파기확인서 징구"],
      ["P-WITHDRAW", "철수확인서 징구"],
    ].map(([id, title]) => ({
      id,
      title,
      owner: "admin",
      group: "철수 서류",
      procedurePhase: "exit",
      deps: ["O01"],
      required: false,
      desc: "해당 인원의 서류를 징구한 뒤 결과를 확인하고 완료 처리합니다. 내려받는 엑셀은 서약서 원본이 아닌 징구 현황용 예시 대장입니다.",
    })),
  );

export const PROCEDURE_STEPS = [
  { taskId: "O08", phase: "entry", title: "보안교육 실시" },
  {
    taskId: "O10",
    phase: "entry",
    title: "보안준수 서약서",
    predecessor: "O08",
  },
  { taskId: "O02", phase: "entry", title: "eGIS 계정 신청" },
  ...PROCEDURE_TASKS.filter((t) => t.procedurePhase === "entry").map((t) => ({
    taskId: t.id,
    phase: "entry",
    title: t.title,
  })),
  { taskId: "O13", phase: "execution", title: "업무공간 출입 등록" },
  ...PROCEDURE_TASKS.filter((t) => t.procedurePhase === "exit").map((t) => ({
    taskId: t.id,
    phase: "exit",
    title: t.title,
  })),
];
export const procedureStep = (id) =>
  PROCEDURE_STEPS.find((step) => step.taskId === id);
export const DRAFT_TASK_IDS = [
  "O02",
  ...PROCEDURE_TASKS.filter((t) => t.procedurePhase === "entry").map(
    (t) => t.id,
  ),
];
