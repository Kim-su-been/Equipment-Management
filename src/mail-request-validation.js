import { blankRequest } from "../server/mail/analysis.js";
import { validIsoDate } from "./personnel-workflow.js";
const groups = { account: true, access: true, education: true, document: true };
const error = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export function validateEdit(edit) {
  const result = { ...blankRequest(), ...edit };
  if (!["new", "change", "hold"].includes(result.type))
    error(400, "요청 유형을 확인해 주세요.");
  for (const key of ["project", "company", "name"])
    if (
      result[key] !== null &&
      (typeof result[key] !== "string" ||
        result[key].length > (key === "name" ? 80 : 100))
    )
      error(400, "대상 정보를 확인해 주세요.");
  for (const key of ["startDate", "endDate"])
    if (result[key] && !validIsoDate(result[key]))
      error(400, "날짜를 YYYY-MM-DD로 확인해 주세요.");
  if (!Array.isArray(result.tasks) || result.tasks.length > 20)
    error(400, "준비 작업 요청을 확인해 주세요.");
  result.tasks = result.tasks.map((t) => {
    if (
      !groups[t.category] ||
      !["request", "hold", "cancel"].includes(t.action) ||
      typeof t.title !== "string" ||
      !t.title.trim() ||
      /좌석/.test(t.title) ||
      t.title.length > 100
    )
      error(400, "준비 작업의 분류·내용·처리 방식을 확인해 주세요.");
    return {
      category: t.category,
      title: t.title.trim(),
      action: t.action,
      evidence: String(t.evidence || "").slice(0, 1000),
    };
  });
  return result;
}
