import React, { useState } from "react";
import { Download } from "lucide-react";
import { PROCEDURE_PHASES, PROCEDURE_STEPS } from "./work-procedures.js";
import { batchEligibility } from "./batch-tasks.js";
import { TASKS, STATUS } from "./data.js";

const date = (s) => (s ? s.replaceAll("-", ".") : "미정");
function TaskGroup({ step, rows, data, scope, onExport, onTask, actionFor }) {
  const [selected, setSelected] = useState([]);
  const task = rows[0]?.task || TASKS.find((t) => t.id === step.taskId);
  const exportable = task?.owner === "admin" && !task?.derived;
  const eligible = rows.filter(
    (r) =>
      exportable && !batchEligibility(r.person, r.task, data.customTasks || []),
  );
  const eligibleIds = new Set(eligible.map((r) => r.person.id));
  const ids = selected.filter((id) => eligibleIds.has(id));
  return (
    <details className="procedure-task-group" data-procedure-task={step.taskId}>
      <summary>
        <span>
          <b>{step.title}</b>
          <small>
            {task?.owner === "member"
              ? "수행사 처리 · 주관사 현황 확인"
              : "주관사 처리"}
          </small>
        </span>
        <span className="procedure-task-count">
          대상 {rows.length}명
          {exportable && <small>선택 가능 {eligible.length}명</small>}
        </span>
      </summary>
      {step.predecessor && (
        <p className="procedure-prerequisite">
          보안교육 수료 후 보안준수 서약서를 작성합니다. 기존 제출본과 검토
          이력은 유지됩니다.
        </p>
      )}
      {exportable && (
        <div className="procedure-batch-toolbar">
          <button
            type="button"
            className="btn"
            disabled={!eligible.length}
            onClick={() =>
              setSelected(
                ids.length === eligible.length
                  ? []
                  : eligible.map((r) => r.person.id),
              )
            }
          >
            {eligible.length > 0 && ids.length === eligible.length
              ? "선택 해제"
              : "선택 가능 인원 전체 선택"}
          </button>
          <span>{ids.length}명 선택</span>
          <button
            type="button"
            className="btn primary"
            disabled={!ids.length}
            onClick={() =>
              onExport({
                taskId: step.taskId,
                personIds: ids,
                project: scope === "PMO" ? "전체" : scope,
                pendingOnly: true,
              })
            }
          >
            <Download size={15} />
            선택 인원 기안 첨부 엑셀
          </button>
        </div>
      )}
      {exportable && (
        <p className="procedure-template-note">
          업무별 예시 양식입니다. 미입력 항목을 확인해 사내 기안에 첨부하세요.
          다운로드만으로 작업이 완료되지는 않습니다.
        </p>
      )}
      <div className="procedure-people-list">
        {rows.map((r) => {
          const reason = exportable
            ? batchEligibility(r.person, r.task, data.customTasks || [])
            : "";
          const [label, tone] = STATUS[r.status] || [r.status, "gray"];
          return (
            <article className="procedure-person" key={r.person.id}>
              {exportable ? (
                <input
                  type="checkbox"
                  aria-label={`${step.title} · ${r.person.name} 선택`}
                  checked={ids.includes(r.person.id)}
                  disabled={!!reason}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...ids, r.person.id]
                        : ids.filter((id) => id !== r.person.id),
                    )
                  }
                />
              ) : (
                <span />
              )}
              <div className="procedure-person-info">
                <button
                  className="person-name"
                  onClick={() => onTask(r.person, r.task.id)}
                >
                  {r.person.name}
                </button>
                <small>
                  {r.person.company} · {r.person.project}
                </small>
                <small>
                  {step.phase === "exit" ? "철수 예정" : "투입 예정"}{" "}
                  {date(step.phase === "exit" ? r.person.end : r.person.start)}
                </small>
                {reason && (
                  <span className="procedure-ineligible">{reason}</span>
                )}
                {r.status === "waiting" && !reason && (
                  <span className="procedure-ineligible">
                    선행 작업 완료 후 진행할 수 있습니다.
                  </span>
                )}
              </div>
              <span className={`work-badge ${tone}`}>{label}</span>
              <div className="procedure-person-actions">
                {actionFor(r.person, r.task)}
                <button
                  className="text-link"
                  onClick={() => onTask(r.person, r.task.id)}
                >
                  작업 상세
                </button>
              </div>
            </article>
          );
        })}
        {!rows.length && (
          <p className="work-empty">
            현재 조회 조건에 해당하는 인원이 없습니다.
          </p>
        )}
      </div>
    </details>
  );
}

export default function ProcedureTaskBoard({
  rows,
  data,
  scope,
  onExport,
  onTask,
  actionFor,
}) {
  const known = new Set(PROCEDURE_STEPS.map((s) => s.taskId));
  const extras = [
    ...new Set(rows.filter((r) => !known.has(r.task.id)).map((r) => r.task.id)),
  ];
  const props = { data, scope, onExport, onTask, actionFor };
  return (
    <div className="procedure-workspace">
      <p className="procedure-overview">
        같은 신청 업무의 인원을 선택해 기안 첨부용 엑셀을 만드세요. 선택 가능한
        미완료 인원만 묶어 내려받습니다.
      </p>
      {PROCEDURE_PHASES.map((phase, index) => (
        <section
          className="procedure-phase"
          key={phase.id}
          aria-label={phase.title}
        >
          <header>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{phase.title}</h2>
              <p>{phase.description}</p>
            </div>
          </header>
          {PROCEDURE_STEPS.filter((s) => s.phase === phase.id).map((step) => (
            <TaskGroup
              key={step.taskId}
              step={step}
              rows={rows.filter((r) => r.task.id === step.taskId)}
              {...props}
            />
          ))}
        </section>
      ))}
      {!!extras.length && (
        <details className="procedure-extras">
          <summary>기존·추가 준비 업무 {extras.length}개</summary>
          <p>
            두레이·개인정보 관련 준비와 프로젝트에서 추가한 작업을 확인할 수
            있습니다.
          </p>
          {extras.map((id) => (
            <TaskGroup
              key={id}
              step={{
                taskId: id,
                title: rows.find((r) => r.task.id === id).task.title,
              }}
              rows={rows.filter((r) => r.task.id === id)}
              {...props}
            />
          ))}
        </details>
      )}
    </div>
  );
}
