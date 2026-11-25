import React from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { adminStageGroups } from "./admin-stage-groups.js";
const date = (s) => (s ? s.replaceAll("-", ".") : "미정");
export function AdminStageDetails({
  group,
  canInvite,
  onOpen,
  onTask,
  onInvite,
  onLifecycle,
  onRepair,
}) {
  function action(entry) {
    if (entry.identity.missing)
      return { label: "인원 정보 복구", run: () => onRepair(entry.person.id) };
    if (entry.held)
      return { label: "보류 내용 보기", run: () => onOpen(entry.person) };
    if (!entry.state.registered)
      return {
        label: canInvite ? "초대 링크 보기" : "등록 상태 보기",
        run: () =>
          canInvite ? onInvite(entry.person.id) : onOpen(entry.person),
      };
    if (entry.draftPending)
      return {
        label: "기안 작성 기록",
        run: () => onTask(entry.person, entry.next.task.id),
      };
    if (entry.phaseComplete)
      return {
        label:
          entry.state.overdue || entry.exitOverdue
            ? "투입 상태 변경"
            : "인원 상세 보기",
        run: () =>
          entry.state.overdue || entry.exitOverdue
            ? onLifecycle(entry.person)
            : onOpen(entry.person),
      };
    if (entry.next)
      return {
        label: ["review", "error"].includes(entry.next.status)
          ? "제출물 검토"
          : "작업 상세 보기",
        run: () => onTask(entry.person, entry.next.task.id),
      };
    return { label: "인원 상세 보기", run: () => onOpen(entry.person) };
  }
  function personCard(entry) {
    const { person, identity } = entry,
      next = action(entry);
    return (
      <li
        className={`stage-person ${entry.phaseComplete ? "confirmed" : entry.held ? "held" : ""}`}
        key={person.id}
      >
        <button
          className="stage-person-profile"
          aria-label={`${identity.name} 인원 상세 보기`}
          onClick={() =>
            identity.missing ? onRepair(person.id) : onOpen(person)
          }
        >
          <strong>
            {identity.name}
            {entry.phaseComplete && <CheckCircle2 size={14} />}
          </strong>
          <span>{identity.company}</span>
          <small>
            {identity.project} · 투입 {date(person.start)}
          </small>
        </button>
        <div className="stage-person-footer">
          <span
            className={`work-badge ${entry.phaseComplete ? "green" : entry.held || entry.exitOverdue ? "orange" : entry.needsFix ? "red" : "gray"}`}
          >
            {entry.phaseComplete
              ? "단계 완료"
              : entry.held
                ? "투입 보류"
                : entry.exitOverdue
                  ? "종료일 경과"
                  : entry.draftPending
                    ? "기안 기록 대기"
                    : entry.needsFix
                      ? "보완 필요"
                      : "진행 필요"}
          </span>
          <button className="stage-person-action" onClick={next.run}>
            {next.label}
            <ArrowRight size={13} />
          </button>
        </div>
      </li>
    );
  }
  return (
    <div className="admin-stage-detail">
      <div className="admin-stage-detail-summary">
        <strong>
          {group.percent ?? "—"}
          {group.percent !== null && <small>%</small>}
        </strong>
        <span>
          완료 {group.completed}명 / 대상 {group.people.length}명
        </span>
        <p>{group.description}</p>
        {group.id === "exit" && (
          <p>철수 지정 또는 종료 임박 인원을 대상으로 집계합니다.</p>
        )}
      </div>
      {group.steps.map((step) => (
        <details
          className="phase-person-step"
          key={step.id}
          data-phase-task={step.id}
        >
          <summary>
            <span>{step.title}</span>
            <b>{step.people.length}명</b>
          </summary>
          <ul className="admin-stage-people">
            {step.people.map(personCard)}
            {!step.people.length && (
              <li className="stage-empty">
                이 업무에 남은 대상 인원이 없습니다.
              </li>
            )}
          </ul>
        </details>
      ))}
      {group.completed > 0 && (
        <details className="phase-person-step phase-completed">
          <summary>
            <span>단계 완료 인원</span>
            <b>{group.completed}명</b>
          </summary>
          <ul className="admin-stage-people">
            {group.people.filter((p) => p.phaseComplete).map(personCard)}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function AdminStageBoard({
  people,
  data,
  scope,
  today,
  onStage,
}) {
  const groups = adminStageGroups(people, data, scope, today);
  return (
    <>
      <div className="admin-stage-summary">
        <p>
          단계를 선택하면 세부 업무별 인원과 처리할 작업을 팝업에서 확인할 수
          있습니다.
        </p>
      </div>
      <ol
        className="admin-stage-board procedure-stage-board compact-stage-board"
        aria-label="단계별 준비 인원"
      >
        {groups.map((group, index) => (
          <li
            key={group.id}
            className={`admin-stage-column ${group.id}`}
            data-stage-id={group.id}
          >
            <button
              type="button"
              className="admin-stage-open"
              aria-haspopup="dialog"
              aria-label={`${group.title} 준비 인원 보기`}
              onClick={() => onStage(group.id)}
            >
              <span className="admin-stage-totals">
                <span className="admin-stage-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <b>
                  {group.percent ?? "—"}
                  {group.percent !== null && <small>%</small>}
                </b>
              </span>
              <strong>{group.title}</strong>
              <span>
                완료 {group.completed}명 / 대상 {group.people.length}명
              </span>
              <span className="stage-open-description">
                {group.description}
              </span>
              <span className="stage-open-link">
                미완료 {group.people.length - group.completed}명 · 세부 업무
                보기 <ArrowRight size={15} />
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}
