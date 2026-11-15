import { TASKS } from "./data.js";
import { authorizedPeople } from "./onboarding.js";
export const TASK_EXPORTS = {
  O02: {
    title: "eGIS 계정 신청",
    columns: [
      ["성명", "name"],
      ["소속 수행사", "company"],
      ["프로젝트", "project"],
      ["업무 역할", "role"],
      ["이메일", "email"],
      ["연락처", "phone"],
      ["사용 시작일", "start"],
      ["사용 종료일", "end"],
    ],
  },
  O04: {
    title: "Dooray 계정 신청",
    columns: [
      ["표시명", "name"],
      ["회사", "company"],
      ["프로젝트", "project"],
      ["이메일", "email"],
      ["연락처", "phone"],
      ["가입 예정일", "start"],
      ["종료 예정일", "end"],
    ],
  },
  O13: {
    title: "출입 신청",
    columns: [
      ["성명", "name"],
      ["소속", "company"],
      ["방문 프로젝트", "project"],
      ["연락처", "phone"],
      ["출입 시작일", "start"],
      ["출입 종료일", "end"],
    ],
  },
  O14: {
    title: "좌석 배정",
    columns: [
      ["성명", "name"],
      ["소속", "company"],
      ["프로젝트", "project"],
      ["연락처", "phone"],
      ["사용 시작일", "start"],
      ["사용 종료일", "end"],
      ["배정 좌석", "seat"],
    ],
  },
};
export function taskExportRows(data, scope, selection) {
  const people = authorizedPeople(
    data,
    scope,
    selection.project,
    selection.personIds,
  );
  const task = [...TASKS, ...(data.customTasks || [])].find(
    (t) => t.id === selection.taskId,
  );
  if (!task || task.owner !== "admin")
    throw new Error("주관사 작업의 양식을 선택해 주세요.");
  const template = TASK_EXPORTS[task.id] || {
    title: task.title,
    columns: TASK_EXPORTS.O02.columns,
  };
  if (
    task.custom &&
    people.some(
      (p) =>
        (task.project !== "전체" && p.project !== task.project) ||
        (task.personIds && !task.personIds.includes(p.id)),
    )
  )
    throw new Error("작업이 배정되지 않은 인원이 포함되어 있습니다.");
  return {
    task,
    template,
    rows: people.map((p) =>
      Object.fromEntries(
        template.columns.map(([label, key]) => [
          label,
          key === "seat"
            ? Object.entries(data.seats).find(
                ([, v]) => v?.personId === p.id,
              )?.[0] || "미배정"
            : p[key] || "미입력",
        ]),
      ),
    ),
  };
}
export async function exportTaskWorkbook(data, scope, selection) {
  const { task, template, rows } = taskExportRows(data, scope, selection);
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("신청 정보");
  sheet.columns = template.columns.map(([label]) => ({
    header: label,
    key: label,
    width: label.includes("메일") ? 32 : 22,
  }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0067AC" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const info = workbook.addWorksheet("양식 안내");
  [
    ["양식", `${template.title} · 예시 v1.0`],
    ["작업", task.title],
    ["대상", `${selection.project} · ${rows.length}명`],
    ["생성 시점", new Date().toISOString()],
    [
      "사용 범위",
      "사내 공식 양식이 아닌 예시입니다. 실제 양식을 확보한 뒤 필드 매핑을 교체하세요.",
    ],
    ["미입력 처리", "미입력으로 표시된 항목을 신청 전에 확인하세요."],
    [
      "기준 기간",
      "등록된 투입 예정 기간입니다. 실제 투입일 또는 MM 실적을 의미하지 않습니다.",
    ],
  ].forEach((row) => info.addRow(row));
  info.getColumn(1).width = 18;
  info.getColumn(2).width = 100;
  return {
    blob: new Blob([await workbook.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    name: `레디보드_${template.title}_${selection.project}.xlsx`,
  };
}
