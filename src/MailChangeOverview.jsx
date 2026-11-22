import React from "react";
import { tasksForPerson, STATUS, taskStatus } from "./data.js";
const fmt = (v) => (v ? v.replaceAll("-", ".") : "미정");
export function HighlightedMail({ text, quotes }) {
  const unique = [...new Set(quotes.filter(Boolean))]
    .filter((q) => text.includes(q))
    .sort((a, b) => b.length - a.length);
  const ranges = [];
  for (const quote of unique) {
    let start = 0,
      index;
    while ((index = text.indexOf(quote, start)) !== -1) {
      const end = index + quote.length;
      if (!ranges.some((r) => index < r.end && end > r.start))
        ranges.push({ start: index, end });
      start = end;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  let last = 0;
  const result = [];
  for (const r of ranges) {
    result.push(text.slice(last, r.start));
    result.push(<mark key={r.start}>{text.slice(r.start, r.end)}</mark>);
    last = r.end;
  }
  result.push(text.slice(last));
  return <pre>{result}</pre>;
}
export default function MailChangeOverview({
  request,
  edit,
  selected,
  recommended,
  data,
}) {
  const before =
      edit.type === "new"
        ? null
        : request.result?.before || selected || recommended,
    after = request.result?.after;
  const fields = [];
  if (edit.type === "new")
    fields.push(["등록 상태", "기존 인원 없음", "본인 등록 대기"]);
  if (edit.startDateRequested || edit.startDate)
    fields.push([
      "투입일",
      fmt(before?.start),
      fmt(after?.start || edit.startDate),
    ]);
  if (edit.endDateRequested || edit.endDate)
    fields.push(["종료일", fmt(before?.end), fmt(after?.end || edit.endDate)]);
  if (edit.type === "hold" || edit.resume)
    fields.push([
      "투입 상태",
      before?.lifecycle || "확인 필요",
      edit.type === "hold" ? "투입 보류" : "투입 보류 해제",
    ]);
  for (const t of edit.tasks || []) {
    const person = data.people.find((p) => p.id === before?.id),
      task =
        person &&
        tasksForPerson(person, data.customTasks || []).find(
          (x) => x.title === t.title,
        );
    fields.push([
      t.title,
      task
        ? STATUS[
            taskStatus(person, task.id, undefined, data.customTasks)
          ]?.[0] || "기존 작업"
        : "미배정",
      { request: "준비 요청", hold: "보류 요청", cancel: "취소 요청" }[
        t.action
      ],
    ]);
  }
  return (
    <section className="mail-change-overview" aria-label="메일 변경 비교">
      <h2>
        {request.status === "applied" ? "반영한 변경 전·후" : "변경 전·후 확인"}
      </h2>
      <p>
        <b>대상 인원</b>　{edit.name || "이름 확인 필요"} ·{" "}
        {edit.company || "소속 확인 필요"} ·{" "}
        {edit.project || "프로젝트 확인 필요"}
      </p>
      {!selected && recommended && edit.type !== "new" && (
        <p className="mail-field-issue">
          추천 후보의 현재값입니다. 아래에서 반영 대상을 명시적으로 확인해
          주세요.
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>변경 항목</th>
            <th>현재{request.status === "applied" ? " / 반영 전" : ""}</th>
            <th>{request.status === "applied" ? "반영 후" : "제안"}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(([key, old, next], i) => (
            <tr key={`${key}-${i}`}>
              <td>{key}</td>
              <td>{old}</td>
              <td>{next === "미정" ? "확인 필요" : next}</td>
            </tr>
          ))}
          {!fields.length && (
            <tr>
              <td colSpan={3}>변경할 항목을 확인해 주세요.</td>
            </tr>
          )}
        </tbody>
      </table>
      <small>
        {request.message.source === "mock" ? "시연 메일 · " : ""}
        {request.message.analysisMode === "ai"
          ? "실제 AI 추출"
          : request.message.analysisMode === "rules_fallback"
            ? "AI 실패 후 규칙 기반 대체"
            : "규칙 기반 추출"}{" "}
        · PMO 승인 후 반영
      </small>
    </section>
  );
}
