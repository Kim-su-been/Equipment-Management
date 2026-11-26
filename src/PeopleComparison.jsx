import React, { useState } from "react";
import { performanceMetrics } from "./performance-metrics.js";
import { PERFORMANCE_PROJECTS } from "./performance-data.js";
const METRICS = {
  volume: {
    title: "처리 현황",
    unit: "건",
    value: (p) => p.completed + p.ongoing,
    format: (p) => `완료 ${p.completed} · 진행 ${p.ongoing}`,
    hint: (p) =>
      `기한 내 완료 ${p.onTime}건, 지연 완료 ${p.late}건, 기한 미등록 완료 ${p.missingDue}건, 진행 ${p.ongoing - p.overdue}건, 진행 지연 ${p.overdue}건`,
  },
  punctuality: {
    title: "납기 준수율",
    unit: "%",
    value: (p) => p.onTimeRate,
    format: (p) => (p.onTimeRate === null ? "—" : `${p.onTimeRate}%`),
    hint: (p) =>
      `준수 ${p.onTime} / 기한 등록 ${p.eligible}건 · 기한 누락 ${p.missingDue}건 제외`,
  },
  overdue: {
    title: "진행 중 지연",
    unit: "건",
    value: (p) => p.overdue,
    format: (p) => `${p.overdue}건`,
    hint: (p) => `진행 중 ${p.ongoing}건 중 지연 ${p.overdue}건`,
  },
  cycle: {
    title: "처리기간 중앙값",
    unit: "일",
    value: (p) => p.medianCycle,
    format: (p) => (p.medianCycle === null ? "—" : `${p.medianCycle}일`),
    hint: (p) => `완료 ${p.completed}건 · 접수부터 완료까지 달력일`,
  },
  rework: {
    title: "재작업률",
    unit: "%",
    value: (p) => p.reworkRate,
    format: (p) => (p.reworkRate === null ? "—" : `${p.reworkRate}%`),
    hint: (p) => `완료 ${p.completed}건 중 재작업 ${p.reworked}건`,
  },
};
const VOLUME_LEGEND = [
  ["on-time", "기한 내 완료"],
  ["late", "지연 완료"],
  ["unknown", "기한 미등록"],
  ["ongoing", "진행"],
  ["overdue", "진행 지연"],
];
export default function PeopleComparison({
  participants,
  rows,
  asOf,
  onPerson,
}) {
  const [metric, setMetric] = useState("punctuality"),
    [order, setOrder] = useState("name");
  const config = METRICS[metric];
  const people = participants.map((p) => ({
    ...p,
    ...performanceMetrics(
      rows.filter((r) => r.participantId === p.id),
      asOf,
    ),
  }));
  const max =
    config.unit === "%"
      ? 100
      : Math.max(1, ...people.map((p) => config.value(p) || 0));
  const width = (n) => `${Math.max(0, Math.min(100, (n / max) * 100))}%`;
  const groups = PERFORMANCE_PROJECTS.map((project) => ({
    project,
    people: people
      .filter((p) => p.project === project)
      .sort((a, b) => {
        const av = config.value(a),
          bv = config.value(b);
        if (order !== "name") {
          if (av === null && bv !== null) return 1;
          if (av !== null && bv === null) return -1;
          const delta =
            order === "high" ? (bv ?? 0) - (av ?? 0) : (av ?? 0) - (bv ?? 0);
          if (delta) return delta;
        }
        return a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id);
      }),
  })).filter((g) => g.people.length);
  return (
    <section
      className="card work-card perf-comparison"
      aria-labelledby="perf-comparison-heading"
    >
      <div className="work-card-heading">
        <div>
          <h2 id="perf-comparison-heading">
            그룹별 인원 비교 <small>{people.length}명</small>
          </h2>
          <p>
            같은 눈금으로 나란히 비교하세요. 인원을 선택하면 개인 그래프와 근거
            업무가 열립니다.
          </p>
        </div>
        <div className="perf-comparison-controls">
          <label>
            비교 지표
            <select
              aria-label="인원 비교 지표"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {Object.entries(METRICS).map(([id, m]) => (
                <option key={id} value={id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            그룹 내 정렬
            <select
              aria-label="인원 비교 정렬"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              <option value="name">이름순</option>
              <option value="high">값이 큰 순</option>
              <option value="low">값이 작은 순</option>
            </select>
          </label>
        </div>
      </div>
      {metric === "volume" ? (
        <div className="perf-comparison-legend">
          {VOLUME_LEGEND.map(([id, label]) => (
            <span key={id}>
              <i className={id} />
              {label}
            </span>
          ))}
        </div>
      ) : (
        <p className="perf-comparison-caption">
          {metric === "punctuality"
            ? "기한이 등록된 완료 업무 기준입니다. 인원별 분모와 제외 건수를 함께 확인하세요."
            : metric === "cycle"
              ? "대기 시간을 포함한 달력일입니다. 동일 요청 유형·기간으로 범위를 맞춰 비교하세요."
              : metric === "rework"
                ? "검증에서 개발로 되돌아간 완료 업무 비율입니다."
                : "조회 종료일 현재 약속 완료일이 지난 미완료 업무입니다."}{" "}
          표본이 없으면 —로 표시합니다.
        </p>
      )}
      <div
        className="perf-comparison-groups"
        style={{ "--comparison-groups": groups.length || 1 }}
      >
        {groups.map((g) => (
          <section
            key={g.project}
            className="perf-comparison-group"
            aria-label={`${g.project} 인원 비교`}
          >
            <header>
              <strong>{g.project}</strong>
              <span>{g.people.length}명</span>
            </header>
            <div
              className="perf-comparison-axis"
              aria-label={`공통 눈금 0에서 ${max}${config.unit}`}
            >
              <span>0</span>
              <span>
                {max / 2}
                {config.unit}
              </span>
              <span>
                {max}
                {config.unit}
              </span>
            </div>
            <div className="perf-comparison-people">
              {g.people.map((p) => {
                const value = config.value(p);
                const segments =
                  metric === "volume"
                    ? [
                        ["on-time", p.onTime],
                        ["late", p.late],
                        ["unknown", p.missingDue],
                        ["ongoing", p.ongoing - p.overdue],
                        ["overdue", p.overdue],
                      ]
                    : [[metric, value || 0]];
                return (
                  <button
                    className="perf-comparison-person"
                    key={p.id}
                    data-person-id={p.id}
                    data-value={value ?? ""}
                    aria-haspopup="dialog"
                    aria-label={`${p.name} 비교 그래프 상세 보기`}
                    title={`${p.name} · ${p.company} · ${config.hint(p)}`}
                    onClick={() => onPerson(p.id)}
                  >
                    <span className="perf-comparison-label">
                      <strong>{p.name}</strong>
                      <b>{config.format(p)}</b>
                    </span>
                    <span
                      className="perf-comparison-track"
                      role="img"
                      aria-label={`${config.title}: ${value === null ? "표본 없음" : `${value}${config.unit}`} · ${config.hint(p)}`}
                    >
                      {segments.map(([id, n]) => (
                        <i
                          key={id}
                          className={id}
                          style={{ width: width(n) }}
                        />
                      ))}
                    </span>
                    <span className="perf-comparison-hint">
                      {config.hint(p)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {!people.length && (
        <p className="work-empty">선택 범위에 비교할 인원이 없습니다.</p>
      )}
      <p className="perf-comparison-footnote">
        상단 프로젝트·인원·요청 유형·기간 필터를 함께 적용합니다. 취소는
        제외하며, 자동 평가 점수로 환산하지 않습니다.
      </p>
    </section>
  );
}
