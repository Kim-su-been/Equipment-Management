import React from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { adminStageGroups } from "./admin-stage-groups.js";

const descriptions = {
  registration: "초대 · 본인 정보 입력",
  accounts: "신청 · 발급 · 최초 접속",
  submission: "교육 수료 · 서류 제출 · 보완",
  review: "제출 원본 확인 · 승인",
  final: "출입 준비 · 최종 확인",
};
const date = (value) => (value ? value.replaceAll("-", ".") : "미정");

export default function AdminStageBoard({
  people,
  data,
  scope,
  today,
  canInvite,
  onOpen,
  onTask,
  onInvite,
  onLifecycle,
  onRepair,
}) {
  const groups = adminStageGroups(people, data, scope, today);
  const completed = groups[4].people.filter((r) => r.final).length;
  function action(entry) {
    const { person, identity, state, stage, next } = entry;
    if (identity.missing)
      return { label: "인원 정보 복구", run: () => onRepair(person.id) };
    if (entry.held)
      return { label: "보류 내용 보기", run: () => onOpen(person) };
    if (stage.id === "registration")
      return canInvite
        ? { label: "초대 링크 보기", run: () => onInvite(person.id) }
        : { label: "등록 상태 보기", run: () => onOpen(person) };
    if (entry.final)
      return state.overdue
        ? { label: "투입 상태 변경", run: () => onLifecycle(person) }
        : { label: "인원 상세 보기", run: () => onOpen(person) };
    if (next?.owner === "admin" && next.actionable)
      return {
        label:
          next.task.id === "O16"
            ? "최종 준비 확인"
            : stage.id === "review"
              ? "제출물 검토"
              : "준비 작업 보기",
        run: () => onTask(person, next.task.id),
      };
    return { label: "진행 상태 보기", run: () => onOpen(person) };
  }
  return (
    <>
      <div className="admin-stage-summary">
        <span>
          최종 확인 완료 <b>{completed}명</b>
        </span>
        <p>
          진행할 작업이 있는 단계에 인원을 표시합니다. 병행 작업이 있으면 여러
          단계에 함께 표시되며, 단계별 인원 수는 중복될 수 있습니다.
        </p>
      </div>
      <ol className="admin-stage-board" aria-label="단계별 준비 인원">
        {groups.map((group, index) => (
          <li
            key={group.id}
            className={`admin-stage-column ${group.id}`}
            data-stage-id={group.id}
          >
            <header className="admin-stage-heading">
              <div>
                <span className="admin-stage-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <strong>
                  {group.people.length}
                  <small>명</small>
                </strong>
              </div>
              <h3>{group.title}</h3>
              <p>{descriptions[group.id]}</p>
            </header>
            <ul
              className="admin-stage-people"
              aria-label={`${group.title} 인원`}
            >
              {group.people.map((entry) => {
                const { identity, person, state } = entry;
                const nextAction = action(entry);
                return (
                  <li
                    className={`stage-person ${entry.final ? "confirmed" : entry.held ? "held" : ""}`}
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
                        {entry.final && <CheckCircle2 size={14} />}
                      </strong>
                      <span>{identity.company}</span>
                      <small>
                        {identity.project} · 투입 {date(person.start)}
                      </small>
                    </button>
                    <div className="stage-person-footer">
                      <div className="stage-person-flags">
                        {entry.held ? (
                          <span className="work-badge orange">투입 보류</span>
                        ) : entry.final ? (
                          <span className="work-badge green">
                            준비 확인 완료
                          </span>
                        ) : entry.needsFix ? (
                          <span className="work-badge red">보완 필요</span>
                        ) : state.overdue ? (
                          <span className="work-badge orange">예정일 경과</span>
                        ) : state.imminent ? (
                          <span className="work-badge orange">투입 임박</span>
                        ) : (
                          <span className="stage-person-remaining">
                            남은 {entry.remaining}건
                          </span>
                        )}
                      </div>
                      <button
                        className="stage-person-action"
                        onClick={nextAction.run}
                      >
                        {nextAction.label}
                        <ArrowRight size={13} />
                      </button>
                    </div>
                    {entry.final && state.overdue && !entry.held && (
                      <span className="stage-lifecycle-alert">
                        예정일 경과 · 투입 여부 확인 필요
                      </span>
                    )}
                  </li>
                );
              })}
              {!group.people.length && (
                <li className="stage-empty">
                  이 단계에 해당하는 인원이 없습니다.
                </li>
              )}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}
