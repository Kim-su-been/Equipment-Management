// Explicit synthetic groupware payload. No ITGS endpoint is called.
export const PERFORMANCE_AS_OF = "2026-11-26";
export const SDLC_STAGES = [
  { id: "request", title: "요청 접수" },
  { id: "analysis", title: "분석·설계" },
  { id: "development", title: "개발" },
  { id: "verification", title: "검증" },
  { id: "completed", title: "완료" },
];
export const PERFORMANCE_PROJECTS = ["SFA", "그룹웨어", "AO 개발팀"];
export function shiftDay(date, days) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return new Date(time + days * 86400000).toISOString().slice(0, 10);
}
export function makePerformanceDemo(people = []) {
  const participants = people
    .filter(
      (p) =>
        p.registrationStatus !== "pending_registration" &&
        ["SFA", "그룹웨어"].includes(p.project),
    )
    .map((p) => ({
      id: `person:${p.id}`,
      personId: p.id,
      name: p.name,
      company: p.company,
      project: p.project,
      kind: "프로젝트",
      role: "개발",
      demo: true,
    }));
  ["김태오", "박유나", "이도겸", "정수연"].forEach((name, i) =>
    participants.push({
      id: `ao-demo-${i + 1}`,
      personId: null,
      name,
      company: "가상 AO 파트너",
      project: "AO 개발팀",
      kind: "AO 운영",
      role: "개발",
      demo: true,
    }),
  );
  const requests = [];
  const titles = [
    "조회 화면 개선",
    "API 응답 오류 수정",
    "데이터 연계 개발",
    "권한 정책 검증",
    "사용자 요청 분석",
    "운영 기능 보완",
    "배치 처리 개선",
    "검증 반려 수정",
  ];
  participants.forEach((p) => {
    // Stable source keys and variants do not change when another person registers.
    const hash = [...p.id].reduce(
      (n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0,
      7,
    );
    const index = hash % 12;
    const delta = index % 3;
    const cases = [
      {
        start: shiftDay("2026-11-02", delta),
        days: [0, 1, 3 + delta, 6 + delta, 8 + delta],
        due: index % 3 === 0 ? 15 : 10,
        done: true,
      },
      {
        start: shiftDay("2026-11-03", delta),
        days: [0, 1, 4, 11, 13],
        due: 10,
        done: true,
      },
      {
        start: "2026-11-12",
        days: [0, 1, 4],
        due: index % 3 === 2 ? 18 : 10,
        wait: true,
      },
      { start: "2026-11-17", days: [0, 1, 3, 7], due: 14 },
      { start: "2026-11-23", days: [0, 1], due: 7 },
      { start: "2026-11-01", days: [0], due: 4, cancelled: true },
      {
        start: shiftDay("2026-11-04", delta),
        days: [0, 1, 2 + delta, 4 + delta, 5 + delta],
        due: index % 3 === 0 ? null : 9,
        done: true,
      },
      {
        start: shiftDay("2026-11-05", delta),
        days: index % 2 === 0 ? [0, 1, 3, 5, 7, 9, 12] : [0, 1, 4, 7, 10],
        due: index % 4 === 0 ? 14 : 11,
        done: true,
        rework: index % 2 === 0,
      },
    ];
    cases.forEach((c, i) => {
      const stages = c.rework
        ? [
            "request",
            "analysis",
            "development",
            "verification",
            "development",
            "verification",
            "completed",
          ]
        : SDLC_STAGES.map((s) => s.id);
      const events = c.days.map((d, n) => ({
        stage: stages[n],
        at: shiftDay(c.start, d),
      }));
      requests.push({
        id: `GW-DEMO:${p.id}:${i + 1}`,
        externalId: `${p.project === "AO 개발팀" ? "AO" : p.project === "SFA" ? "SFA" : "GW"}-${`${hash.toString(36).toUpperCase()}-${i + 1}`}`,
        participantId: p.id,
        project: p.project,
        title: titles[i],
        type: i === 1 ? "장애 수정" : i === 4 ? "요청 분석" : "기능 개선",
        createdAt: c.start,
        dueDate: c.due === null ? null : shiftDay(c.start, c.due),
        completedAt: c.done ? events.at(-1).at : null,
        cancelledAt: c.cancelled ? shiftDay(c.start, 2) : null,
        events,
        waitReason: c.wait
          ? "연계 시스템 응답 대기 · 가상 원문에 기재된 사유"
          : "",
        source: "가상 그룹웨어",
        sourceUpdatedAt: PERFORMANCE_AS_OF,
        demo: true,
      });
    });
  });
  return {
    schema: 1,
    source: "가상 그룹웨어 응답",
    asOf: PERFORMANCE_AS_OF,
    participants,
    requests,
    syncedAt: null,
  };
}
