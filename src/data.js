export const TODAY = "2026-11-09";
export const PROJECTS = ["SFA", "그룹웨어"];
export const TASKS = [
  {
    id: "O01",
    title: "명단 등록 및 투입 정보 확인",
    owner: "admin",
    group: "기본 정보",
    deps: [],
    desc: "프로젝트, 수행사, 투입 기간을 확인하고 명단을 등록합니다.",
  },
  {
    id: "O02",
    title: "eGIS 사용자 계정 신청",
    owner: "admin",
    group: "계정 준비",
    deps: ["O01"],
    desc: "eGIS 담당 부서에 계정을 신청하고 접수 결과를 기록합니다.",
  },
  {
    id: "O03",
    title: "eGIS 발급·사용 가능 확인",
    owner: "admin",
    group: "계정 준비",
    deps: ["O02"],
    desc: "외부에서 발급한 계정의 사용 가능 여부를 확인합니다. 비밀번호는 기록하지 않습니다.",
  },
  {
    id: "O04",
    title: "두레이 사용자 계정 신청",
    owner: "admin",
    group: "계정 준비",
    deps: ["O01"],
    desc: "두레이 사용자 계정 신청 결과를 기록합니다.",
  },
  {
    id: "O05",
    title: "두레이 발급·사용 가능 확인",
    owner: "admin",
    group: "계정 준비",
    deps: ["O04"],
    desc: "두레이 계정 발급과 접속 안내를 확인합니다.",
  },
  {
    id: "O06",
    title: "계정 최초 접속·본인 정보 확인",
    owner: "member",
    group: "계정 준비",
    deps: ["O03", "O05"],
    desc: "발급된 eGIS와 두레이 계정으로 접속한 후 본인 정보를 확인해 주세요.",
  },

  {
    id: "O08",
    title: "정보보안 교육",
    owner: "member",
    group: "교육",
    deps: ["O06"],
    desc: "외부 교육 사이트에서 수강 후 발급받은 수료증을 등록해 주세요.",
    kind: "education",
  },
  {
    id: "O09",
    title: "개인정보보호 교육",
    owner: "member",
    group: "교육",
    deps: ["O06"],
    desc: "개인정보 처리 원칙 교육을 수강하고 수료증을 등록해 주세요.",
    kind: "education",
  },
  {
    id: "O10",
    title: "보안서약서",
    owner: "member",
    group: "서류",
    deps: ["O01"],
    desc: "내용을 읽고 필수 항목을 작성한 후 본인 서명이 포함된 문서를 제출해 주세요.",
    kind: "document",
  },
  {
    id: "O11",
    title: "개인정보 수집·이용 동의서",
    owner: "member",
    group: "서류",
    deps: ["O01"],
    desc: "수집 목적과 보유기간을 확인한 후 동의 여부를 표시하고 서명해 주세요.",
    kind: "document",
  },
  {
    id: "O12",
    title: "제출 서류 확인·승인",
    owner: "admin",
    group: "서류",
    deps: ["O10", "O11"],
    desc: "두 서류의 검토를 완료하면 자동으로 완료됩니다.",
    derived: true,
  },
  {
    id: "O13",
    title: "출입 신청·이용 가능 확인",
    owner: "admin",
    group: "출입 준비",
    deps: ["O12"],
    desc: "서류 확인 후 출입을 신청하고 이용 가능 여부를 기록합니다.",
  },

  {
    id: "O16",
    title: "최종 투입 준비 확인",
    owner: "admin",
    group: "투입 확정",
    deps: ["O03", "O05", "O06", "O08", "O09", "O12", "O13"],
    desc: "필수 준비가 완료되면 투입일을 확인하고 투입을 확정합니다.",
  },
];
export const STATUS = {
  done: ["완료", "green"],
  ready: ["실행 가능", "blue"],
  waiting: ["선행 작업 대기", "gray"],
  progress: ["진행 중", "blue"],
  review: ["확인 요청", "orange"],
  ai: ["AI 검토 중", "purple"],
  fix: ["보완 요청", "red"],
  error: ["수동 확인 필요", "red"],
  on_hold: ["투입·작업 보류", "orange"],
  cancelled: ["요청 취소", "gray"],
};
export function tasksForPerson(person, customTasks = []) {
  return [
    ...TASKS.map((task) => {
      if (!person.selfRegistered) return task;
      if (task.id === "O01")
        return {
          ...task,
          owner: "member",
          desc: "본인 정보 등록이 완료되어 준비 작업이 자동 배정되었습니다.",
        };
      return ["O08", "O09"].includes(task.id)
        ? { ...task, deps: ["O01"] }
        : task;
    }),
    ...customTasks.filter(
      (task) =>
        (task.project === "전체" || task.project === person.project) &&
        (!task.personIds || task.personIds.includes(person.id)),
    ),
  ].map((task) => ({ ...task, ...(person.taskOverrides?.[task.id] || {}) }));
}
export function requiredTasks(person, customTasks = []) {
  return tasksForPerson(person, customTasks).filter(
    (t) =>
      !["O01", "O07", "O12", "O14", "O15", "O16"].includes(t.id) &&
      t.required !== false &&
      ["계정 준비", "출입 준비", "교육", "서류"].includes(t.group),
  );
}
export function taskStatus(person, id, seats = {}, customTasks = []) {
  const task = tasksForPerson(person, customTasks).find((t) => t.id === id);
  if (!task) return "waiting";
  if (person.registrationStatus === "pending_registration" && id !== "O01")
    return "waiting";
  if (
    person.onboardingHold?.active &&
    id !== "O01" &&
    (id === "O16" || (person.tasks[id] !== "done" && !task.derived))
  )
    return "on_hold";
  if (person.tasks[id] !== "done" && task.cancelled) return "cancelled";
  if (person.tasks[id] !== "done" && task.onHold) return "on_hold";
  const statusOf = (id) => taskStatus(person, id, seats, customTasks);
  if (id === "O12")
    return ["O10", "O11"].every((d) =>
      ["done", "cancelled"].includes(statusOf(d)),
    )
      ? "done"
      : ["O10", "O11"].some((d) =>
            ["review", "error", "fix"].includes(statusOf(d)),
          )
        ? "review"
        : "waiting";
  if (
    id === "O16" &&
    requiredTasks(person, customTasks).some((t) => statusOf(t.id) !== "done")
  )
    return "waiting";
  if (person.tasks[id]) return person.tasks[id];
  return task.deps.every((d) => ["done", "cancelled"].includes(statusOf(d)))
    ? "ready"
    : "waiting";
}
export function progress(person, seats, customTasks = []) {
  const actual = requiredTasks(person, customTasks);
  return Math.round(
    (actual.filter(
      (t) => taskStatus(person, t.id, seats, customTasks) === "done",
    ).length /
      actual.length) *
      100,
  );
}
export function isPrepared(person, seats, customTasks = []) {
  if (
    person.registrationStatus === "pending_registration" ||
    person.onboardingHold?.active
  )
    return false;
  return requiredTasks(person, customTasks).every(
    (t) => taskStatus(person, t.id, seats, customTasks) === "done",
  );
}
export function canManage(scope, person) {
  return scope === "PMO" || scope === person.project;
}
const range = (a, b) =>
  Object.fromEntries(
    Array.from({ length: b - a + 1 }, (_, i) => [
      `O${String(a + i).padStart(2, "0")}`,
      "done",
    ]),
  );
export function seed() {
  const people = PROJECTS.flatMap((project, pi) =>
    Array.from({ length: 5 }, (_, i) => {
      const id = `${pi ? "GW" : "SFA"}-${i + 1}`;
      return {
        id,
        name: id,
        project,
        company: `${project} 수행사`,
        role: i === 0 ? "PL" : i === 4 ? "기획자" : "개발자",
        email: `${id.toLowerCase()}@demo.example`,
        start: i === 0 ? TODAY : pi && i === 4 ? "2026-11-10" : "2026-11-16",
        end: "2027-02-26",
        lifecycle: i === 0 ? "투입 중" : "투입 예정",
        tasks: { O01: "done" },
        files: {},
        certChecks: {},
        notes: {},
        history: [],
      };
    }),
  );
  people.forEach((p) => {
    if (["SFA-1", "GW-1"].includes(p.id)) p.tasks = range(1, 16);
    if (p.id === "SFA-2") p.tasks = { ...range(1, 9), O10: "ai", O11: "ai" };
    if (p.id === "SFA-3") p.tasks = range(1, 6);
    if (p.id === "SFA-4")
      p.tasks = {
        O01: "done",
        O02: "done",
        O04: "done",
        O03: "progress",
        O05: "progress",
      };
    if (p.id === "GW-2")
      p.tasks = { ...range(1, 9), O10: "review", O11: "review" };
    if (p.id === "GW-3")
      p.tasks = { ...range(1, 7), O10: "error", O11: "error" };
    if (p.id === "GW-4") p.tasks = { ...range(1, 4), O05: "progress" };
    if (p.id === "GW-5") p.tasks = range(1, 15);
    ["O08", "O09", "O10", "O11"].forEach((id) => {
      if (p.tasks[id])
        p.files[id] = {
          name: `${p.id}_${TASKS.find((t) => t.id === id).title.replaceAll("·", "_")}.pdf`,
          size: "248 KB",
          date: TODAY,
          demo: true,
        };
    });
    ["O08", "O09"].forEach((id) => {
      if (p.files[id]) p.certChecks[id] = p.id === "SFA-2" ? "review" : "done";
    });
    if (p.id === "GW-2")
      p.notes.O10 =
        "서명란이 비어 있는 것으로 보입니다. 원문 확인 후 보완을 요청해 주세요.";
    if (p.id === "GW-3")
      p.notes.O10 =
        "시연용 분석 실패입니다. 담당자가 수동으로 확인할 수 있습니다.";
  });
  people.forEach((p) => {
    for (const id of ["O07", "O14", "O15"]) delete p.tasks[id];
    p.registrationStatus = "registered";
    p.displayId = p.id;
  });
  return {
    people,
    customTasks: [],
    messages: [
      {
        id: "m1",
        personId: "GW-2",
        project: "그룹웨어",
        task: "O10",
        title: "서명 위치를 확인하고 싶어요",
        body: "보안서약서 마지막 페이지에 서명하면 되나요?",
        reply: "",
        date: "2026.11.09 13:20",
        status: "접수",
      },
    ],
    notifications: [
      {
        id: "n1",
        title: "GW-2님의 서류 확인 요청",
        body: "보안서약서 등 2건의 AI 사전 검토가 끝났습니다.",
        project: "그룹웨어",
        read: false,
      },
      {
        id: "n2",
        title: "SFA-2님의 서류가 분석 중입니다",
        body: "AI 결과가 준비되면 확인 요청이 표시됩니다.",
        project: "SFA",
        read: false,
      },
    ],
    settings: { O08: "", O09: "", reminder: true },
    activity: [
      {
        id: 2,
        title: "GW-2 서류 확인 요청",
        desc: "보안서약서, 개인정보 수집·이용 동의서",
        time: "10:40",
        type: "document",
      },
      {
        id: 3,
        title: "SFA 프로젝트 인원 등록",
        desc: "SFA-담당자 · 5명 등록",
        time: "09:10",
        type: "person",
      },
    ],
  };
}
export function evidenceStatus(person, id, seats) {
  return ["O08", "O09"].includes(id)
    ? person.certChecks?.[id] ||
        (person.files[id] ? "done" : taskStatus(person, id, seats))
    : taskStatus(person, id, seats);
}
