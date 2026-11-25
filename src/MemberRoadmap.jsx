import React from "react";
import { Check, Circle, Clock3 } from "lucide-react";
import { STATUS } from "./data.js";

export function RoadmapStageDetails({
  stage: selected,
  onTask,
  onProfile,
  onContinue,
}) {
  return (
    <div className="roadmap-stage-detail roadmap-popup-detail">
      <p>{selected.description}</p>
      <p>
        <b>
          완료 {selected.completed} / 전체 {selected.total}건
        </b>
      </p>
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
    </div>
  );
}

export default function MemberRoadmap({ roadmap, onStage }) {
  return (
    <section
      className="card work-card member-roadmap"
      aria-labelledby="member-roadmap-heading"
    >
      <div className="work-card-heading">
        <div>
          <h2 id="member-roadmap-heading">나의 준비 로드맵</h2>
          <p>
            {roadmap.held
              ? "준비 진행 보류"
              : roadmap.final
                ? "최종 준비 확인 완료"
                : `현재 단계 · ${roadmap.current.title}`}{" "}
            · 단계를 누르면 상세 작업이 열려요.
          </p>
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
      <ol className="roadmap-steps" aria-label="투입 준비 단계">
        {roadmap.stages.map((stage, index) => {
          const current = stage.id === roadmap.current.id;
          const needsFix = stage.items.some((r) => r.status === "fix");
          return (
            <li
              key={stage.id}
              className={`${stage.done ? "done" : "pending"} ${current ? "current selected" : ""}`}
            >
              <button
                type="button"
                aria-label={`${stage.title} 단계 보기`}
                aria-current={current ? "step" : undefined}
                aria-haspopup="dialog"
                onClick={() => onStage(stage.id)}
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
    </section>
  );
}
