import React, { useState } from "react";
import {
  Check,
  Circle,
  ArrowRight,
  Clock3,
  PauseCircle,
  ChevronDown,
} from "lucide-react";
import { STATUS } from "./data.js";

export default function MemberRoadmap({
  roadmap,
  onTask,
  onProfile,
  onContinue,
}) {
  const [selection, setSelection] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const selected =
    roadmap.stages.find((s) => s.id === selection) || roadmap.current;
  return (
    <section
      className="card work-card member-roadmap"
      aria-labelledby="member-roadmap-heading"
    >
      <div className="work-card-heading">
        <div>
          <h2 id="member-roadmap-heading">나의 준비 로드맵</h2>
          <p>완료한 작업과 남은 준비를 단계별로 확인하세요.</p>
        </div>
        <div className="roadmap-progress">
          <span>
            필수 준비율 <b>{roadmap.progress}%</b>
          </span>
          <span
            className="roadmap-progress-bar"
            role="progressbar"
            aria-label="필수 준비율"
            aria-valuenow={roadmap.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${roadmap.progress}%` }} />
          </span>
        </div>
      </div>
      <div
        className={`roadmap-current ${roadmap.held ? "held" : roadmap.final ? "finished" : ""}`}
        role="status"
      >
        {roadmap.held ? (
          <PauseCircle size={20} />
        ) : roadmap.final ? (
          <Check size={20} />
        ) : (
          <ArrowRight size={20} />
        )}
        <div>
          <strong>
            {roadmap.held
              ? "준비 진행 보류"
              : roadmap.final
                ? "최종 준비 확인 완료"
                : `지금 단계 · ${roadmap.current.title}`}
          </strong>
          <p>{roadmap.note}</p>
        </div>
      </div>
      <ol className="roadmap-steps" aria-label="투입 준비 단계">
        {roadmap.stages.map((stage, index) => {
          const current = stage.id === roadmap.current.id;
          const needsFix = stage.items.some((r) => r.status === "fix");
          return (
            <li
              key={stage.id}
              className={`${stage.done ? "done" : "pending"} ${current ? "current" : ""} ${selected.id === stage.id ? "selected" : ""}`}
            >
              <button
                type="button"
                aria-label={`${stage.title} 단계 보기`}
                aria-current={current ? "step" : undefined}
                aria-pressed={selected.id === stage.id}
                aria-controls="roadmap-stage-tasks"
                onClick={() => {
                  setSelection(stage.id);
                  setExpanded(true);
                }}
              >
                <span className="roadmap-step-top">
                  <span className="roadmap-step-number">
                    {stage.done ? (
                      <Check size={17} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span className="roadmap-step-status">
                    {stage.done
                      ? "완료"
                      : needsFix
                        ? "보완 필요"
                        : current
                          ? roadmap.held
                            ? "보류"
                            : "현재 단계"
                          : "미완료"}
                  </span>
                </span>
                <strong>{stage.title}</strong>
                <span className="roadmap-step-count">
                  {stage.countLabel} <b>{stage.completed}</b> / {stage.total}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <details
        id="roadmap-stage-tasks"
        className="roadmap-stage-detail"
        open={expanded}
        onToggle={(e) => setExpanded(e.currentTarget.open)}
      >
        <summary className="roadmap-stage-heading">
          <div>
            <h3>
              {selected.title} · 작업 {selected.completed} / {selected.total}
            </h3>
            <p>{selected.description}</p>
          </div>
          <ChevronDown size={17} />
        </summary>
        {selected.id !== roadmap.current.id && (
          <button
            className="text-link roadmap-return"
            onClick={() => setSelection(null)}
          >
            현재 단계 보기 <ArrowRight size={14} />
          </button>
        )}
        <ul className="roadmap-checklist">
          {selected.items.map((r) => (
            <li key={r.task.id}>
              <button
                type="button"
                aria-label={`${r.task.title} 작업 상세보기`}
                onClick={() =>
                  r.registration
                    ? r.done
                      ? onProfile()
                      : onContinue()
                    : onTask(r.task.id)
                }
                className={
                  r.done ? "done" : r.status === "fix" ? "fix" : "pending"
                }
              >
                {r.done ? (
                  <Check size={17} />
                ) : ["review", "ai", "error"].includes(r.status) ? (
                  <Clock3 size={17} />
                ) : (
                  <Circle size={17} />
                )}
                <span>
                  <b>{r.task.title}</b>
                  <small>
                    {selected.id === "review"
                      ? "주관사 담당자"
                      : r.registration || r.task.owner === "member"
                        ? "수행사 본인"
                        : "주관사 담당자"}
                  </small>
                </span>
                <em>
                  {r.label ||
                    (r.done
                      ? "완료"
                      : r.status === "review"
                        ? "검토 대기"
                        : STATUS[r.status]?.[0] || "미완료")}
                </em>
              </button>
            </li>
          ))}
        </ul>
      </details>
      <div className="roadmap-footer">
        <span>
          <Check size={14} /> 내 작업 완료{" "}
          <b>
            {roadmap.completed.length} / {roadmap.personal.length}
          </b>
        </span>
        <span>
          <Clock3 size={14} /> 주관사 검토 중{" "}
          <b>{roadmap.reviewing.length}건</b>
        </span>
        <small>
          실행 가능한 교육·서류는 계정 준비와 병행할 수 있어요. 최종 확인은
          준비율과 별도로 진행해요.
        </small>
      </div>
    </section>
  );
}
