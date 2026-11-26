import ExcelJS from "exceljs";
import { SDLC_STAGES } from "./performance-data.js";
import {
  personMetrics,
  stageDurations,
  assignmentMetrics,
  assignmentDate,
} from "./performance-metrics.js";
export async function exportPerformance(payload, rows, asOf, filter) {
  const workbook = new ExcelJS.Workbook();
  const names = new Map(payload.participants.map((p) => [p.id, p]));
  const add = (name, headers, data) => {
    const s = workbook.addWorksheet(name);
    s.addRow(headers);
    data.forEach((row) => s.addRow(row));
    s.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    s.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0067AC" },
    };
    s.columns.forEach((c) => (c.width = 24));
    s.views = [{ state: "frozen", ySplit: 1 }];
  };
  add(
    "업무 근거",
    [
      "요청 번호",
      "프로젝트·업무",
      "담당자",
      "소속",
      "요청 제목",
      "유형",
      "상태",
      "접수일",
      "배정일",
      "약속 완료일",
      "실제 완료일",
      "지연 사유",
      "출처",
    ],
    rows.map((r) => [
      r.externalId,
      r.project,
      names.get(r.participantId)?.name || "연결 확인 필요",
      names.get(r.participantId)?.company || "",
      r.title,
      r.type,
      r.label,
      r.createdAt,
      assignmentDate(r) || "미확인",
      r.dueDate || "미등록",
      r.done ? r.completedAt : "",
      r.waitReason,
      r.source,
    ]),
  );
  add(
    "인원별 지표",
    [
      "프로젝트·업무",
      "이름",
      "소속",
      "완료 건수",
      "납기 준수율(%)",
      "납기 분모",
      "기한 누락 제외",
      "진행 중",
      "진행 지연",
      "처리기간 중앙값(달력일)",
      "재작업 완료 건수",
    ],
    personMetrics(payload, rows, asOf).map((p) => [
      p.project,
      p.name,
      p.company,
      p.completed,
      p.onTimeRate,
      p.eligible,
      p.missingDue,
      p.ongoing,
      p.overdue,
      p.medianCycle,
      p.reworked,
    ]),
  );
  const compared = payload.participants.filter(
    (p) =>
      (!filter.project ||
        filter.project === "전체" ||
        p.project === filter.project) &&
      (!filter.person || filter.person === "전체" || p.id === filter.person),
  );
  add(
    "배정 기준 비교",
    [
      "프로젝트·업무",
      "이름",
      "소속",
      "배정 건수",
      "완료 건수",
      "완료율(%)",
      "배정→완료 중앙값(달력일)",
      "납기 준수율(%)",
      "납기 분모",
      "기한 누락 제외",
      "진행 지연",
      "취소 제외",
      "배정일 미확인 제외",
    ],
    compared.map((p) => {
      const m = assignmentMetrics(
        rows.filter((r) => r.participantId === p.id),
        filter.from,
        asOf,
      );
      return [
        p.project,
        p.name,
        p.company,
        m.assigned,
        m.completed,
        m.completionRate,
        m.medianAssignedCycle,
        m.onTimeRate,
        m.eligible,
        m.missingDue,
        m.overdue,
        m.cancelled,
        m.assignmentUnknown,
      ];
    }),
  );
  add(
    "단계 이력",
    ["요청 번호", "단계", "진입일"],
    rows.flatMap((r) =>
      r.events.map((e) => [
        r.externalId,
        SDLC_STAGES.find((s) => s.id === e.stage)?.title,
        e.at,
      ]),
    ),
  );
  add(
    "산정 기준",
    ["항목", "내용"],
    [
      ["출처", "가상 그룹웨어 응답 · 실제 ITGS/API/AI 미연동"],
      ["조회 기간", `${filter.from} ~ ${filter.to}`],
      ["집계 기준일", asOf],
      ["선택 범위", filter.project || "전체"],
      [
        "납기 준수율",
        "조회 기간에 완료되고 약속 완료일이 있는 요청 중 기한 내 완료 비율",
      ],
      ["처리기간", "완료일 - 접수일, 달력일 중앙값"],
      [
        "배정 기준 비교",
        "조회기간 내 배정된 업무만 사용. 취소 제외, 완료율=기준일 완료/배정. 처리기간=완료한 업무의 배정일→완료일 중앙값. 기존 인원별 지표 시트는 완료기간 기준이므로 구분한다.",
      ],
      [
        "배정일 호환성",
        "이전 가상 표본은 접수일을 배정일로 사용. 실제 자료는 배정일 미확인 시 제외하며 임의로 추정하지 않는다.",
      ],
      [
        "단계별 기간",
        "완료 요청의 단계별 모든 방문 기간 합산 후 요청별 중앙값. 대기 시간 포함",
      ],
      ["재작업", "검증에서 개발로 되돌아간 이력이 있는 완료 요청 비율"],
      [
        "제외",
        "취소는 지표 제외. 기한 누락은 납기 비율에서만 제외. 분모 0은 빈 값",
      ],
      ...stageDurations(rows).map((s) => [
        `${s.title} 중앙값`,
        s.median === null ? "표본 없음" : `${s.median}일 / ${s.count}건`,
      ]),
    ],
  );
  return new Blob([await workbook.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
