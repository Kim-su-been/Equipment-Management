export const MOCK_FOLDER = "PMO/인력요청";
export const MOCK_MAILS = [
  {
    id: "demo-staffing-001",
    threadId: "demo-staffing-thread",
    folder: MOCK_FOLDER,
    subject: "[SFA] 김민수 투입일 변경",
    receivedAt: "2026-11-17T01:00:00.000Z",
    from: "수행사 담당자 <vendor@example.invalid>",
    body: "샘플테크 김민수 님의 투입일을 11월 23일에서 11월 25일로 변경합니다.",
  },
  {
    id: "demo-new-001",
    threadId: "demo-new-thread",
    folder: MOCK_FOLDER,
    subject: "[SFA] 신규 인력 합류 안내",
    receivedAt: "2026-11-17T01:01:00.000Z",
    from: "수행사 담당자 <vendor@example.invalid>",
    body: "샘플테크 이서연 님이 11월 23일 신규 투입됩니다. 개발망 계정 준비 부탁드립니다.",
  },
  {
    id: "demo-status-meeting",
    threadId: "demo-status-meeting",
    folder: MOCK_FOLDER,
    subject: "수행사 투입 현황 공유 회의 안내",
    receivedAt: "2026-11-17T01:03:00.000Z",
    from: "PMO <pmo@example.invalid>",
    body: "금요일 회의에서 수행사 투입 현황을 공유할 예정입니다.",
  },
  {
    id: "demo-cafeteria",
    threadId: "demo-cafeteria",
    folder: MOCK_FOLDER,
    subject: "11월 사내 식당 운영시간 안내",
    receivedAt: "2026-11-17T01:04:00.000Z",
    from: "총무팀 <office@example.invalid>",
    body: "다음 주부터 점심 배식 시간이 11시 30분으로 변경됩니다.",
  },
  {
    id: "demo-uncertain-001",
    threadId: "demo-uncertain-thread",
    folder: "PMO/날짜미정검증",
    subject: "[SFA] 박보류 투입 일정 문의",
    receivedAt: "2026-11-17T02:00:00.000Z",
    from: "수행사 담당자 <vendor@example.invalid>",
    body: "프로젝트: SFA\n수행사: 샘플테크\n박보류: 신규 투입은 다음 주 예정, 날짜 미정입니다. 승인되면 진행 부탁드립니다.",
  },
  {
    id: "demo-general-001",
    threadId: "demo-general-thread",
    folder: MOCK_FOLDER,
    subject: "다음 주 PMO 정기회의 참석 안내",
    receivedAt: "2026-11-17T03:00:00.000Z",
    from: "회의 담당자 <meeting@example.invalid>",
    body: "월요일 오전 10시 정기회의에 참석 부탁드립니다.",
  },
  {
    id: "demo-reply-001",
    threadId: "demo-staffing-thread",
    folder: "PMO/회신검증",
    subject: "Re: [SFA] 김민수 일정 변경 요청 정정",
    receivedAt: "2026-11-18T01:00:00.000Z",
    from: "수행사 담당자 <vendor@example.invalid>",
    body: "프로젝트: SFA\n수행사: 샘플테크\n김민수: 이전 요청을 정정합니다. 투입을 보류해 주세요. 날짜는 미정입니다.\n\n-----Original Message-----\n김민수: 기존 투입일 2026-11-23에서 2026-11-25로 변경해 주세요.\n이서연: 2026-11-23 신규 투입 요청입니다. 이서연에게만 개발망 계정을 신청해 주세요.",
  },
];

// IDs identify messages only; analysis always uses subject and latest body.
export function demoMails(people = []) {
  const person =
    people.find((p) => p.name === "김민수") ||
    people.find((p) => p.registrationStatus !== "pending_registration") ||
    people[0];
  if (!person) return MOCK_MAILS;
  const used = people.some((p) => p.name === "이서연");
  // Stable demo content across repeated synchronization, including after approval.
  const newName =
    used && !people.some((p) => p.name === "이서연" && p.mailSources?.length)
      ? "박지윤"
      : "이서연";
  return MOCK_MAILS.map((m) => ({
    ...m,
    subject: m.subject
      .replaceAll("SFA", person.project)
      .replaceAll("김민수", person.name),
    body: m.body
      .replaceAll("SFA", person.project)
      .replaceAll("샘플테크", person.company)
      .replaceAll("김민수", person.name)
      .replaceAll("이서연", newName),
  }));
}
