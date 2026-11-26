import React, { useEffect, useRef, useState } from "react";
const fmt = (n, unit) => (n === null ? "—" : `${n}${unit}`);
// Keep gaps for missing denominators rather than drawing a misleading zero line.
function linePath(people, value, x, y) {
  let connected = false;
  return people
    .map((p, i) => {
      const n = value(p);
      if (n === null) {
        connected = false;
        return "";
      }
      const command = connected ? "L" : "M";
      connected = true;
      return `${command}${x(i)},${y(n)}`;
    })
    .join(" ");
}
export default function PeopleAxisChart({ people, group, onPerson }) {
  const ref = useRef(),
    [available, setAvailable] = useState(960),
    [hover, setHover] = useState(null);
  useEffect(() => {
    const node = ref.current;
    const observer = new ResizeObserver((entries) =>
      setAvailable(Math.floor(entries[0].contentRect.width)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const left = 56,
    right = 60,
    width = Math.max(available, people.length * 92 + left + right, 650),
    plot = width - left - right,
    step = plot / Math.max(people.length, 1),
    x = (i) => left + step * (i + 0.5);
  const countMax = Math.max(
      2,
      Math.ceil(Math.max(0, ...people.map((p) => p.assigned)) / 2) * 2,
    ),
    dayMax = Math.max(
      2,
      Math.ceil(
        Math.max(0, ...people.map((p) => p.medianAssignedCycle || 0)) / 2,
      ) * 2,
    );
  const top = { start: 62, end: 222 },
    bottom = { start: 330, end: 490 };
  const countY = (n) => top.end - (n / countMax) * (top.end - top.start),
    rateTopY = (n) => top.end - (n / 100) * (top.end - top.start),
    dayY = (n) => bottom.end - (n / dayMax) * (bottom.end - bottom.start),
    rateBottomY = (n) => bottom.end - (n / 100) * (bottom.end - bottom.start);
  const barWidth = Math.max(12, Math.min(27, step * 0.21));
  const selected = people.find((p) => p.id === hover);
  const label = (p) =>
    `${p.name} · ${p.project} · ${p.company} · 배정 ${p.assigned}건, 완료 ${p.completed}건, 완료율 ${fmt(p.completionRate, "%")}, 배정→완료 ${fmt(p.medianAssignedCycle, "일")}, 납기 준수율 ${fmt(p.onTimeRate, "%")}, 진행 지연 ${p.overdue}건`;
  const grid = (panel, max, unit) =>
    [0, 1, 2, 3, 4].map((i) => {
      const y = panel.end - ((panel.end - panel.start) * i) / 4;
      return (
        <g key={i}>
          <line
            x1={left}
            x2={width - right}
            y1={y}
            y2={y}
            className="perf-axis-grid"
          />
          <text
            x={left - 11}
            y={y + 4}
            textAnchor="end"
            className="perf-axis-tick"
          >
            {(max * i) / 4}
            {unit}
          </text>
          <text x={width - right + 11} y={y + 4} className="perf-axis-tick">
            {i * 25}%
          </text>
        </g>
      );
    });
  return (
    <div className="perf-axis-chart">
      <div className="perf-axis-intro">
        <h3>{group} · 인원별 수행 비교</h3>
        <p>
          가로축은 인원입니다. 위·아래 그래프는 같은 인원 순서이며 막대와
          꺾은선의 단위는 좌·우 축에 표시합니다.
        </p>
      </div>
      <div
        className="perf-axis-scroll"
        ref={ref}
        role="region"
        aria-label="인원을 가로축으로 하는 배정·완료·기간 비교 그래프"
        tabIndex={0}
      >
        <svg
          className="perf-person-axis"
          width={width}
          height="568"
          viewBox={`0 0 ${width} 568`}
          role="group"
          aria-label={`${group} 인원 ${people.length}명, 배정·완료 막대와 완료율 꺾은선, 처리기간 막대와 납기 준수율 꺾은선`}
        >
          <text x={left} y="22" className="perf-axis-title">
            배정·완료 건수와 완료율
          </text>
          <g
            className="perf-axis-legend"
            transform={`translate(${Math.max(left + 225, width - right - 310)},18)`}
          >
            <rect x="0" y="-8" width="11" height="11" fill="#b8d8ee" />
            <text x="16">배정(건)</text>
            <rect x="92" y="-8" width="11" height="11" fill="#267eaf" />
            <text x="108">완료(건)</text>
            <line
              x1="188"
              x2="206"
              y1="-2"
              y2="-2"
              stroke="#078377"
              strokeWidth="3"
            />
            <text x="213">완료율(%)</text>
          </g>
          <text x={left} y="46" className="perf-axis-unit">
            왼쪽 · 건수
          </text>
          <text
            x={width - right}
            y="46"
            textAnchor="end"
            className="perf-axis-unit"
          >
            오른쪽 · 완료율
          </text>
          {grid(top, countMax, "")}
          {people.map((p, i) => (
            <g key={p.id}>
              <rect
                className="perf-assigned-bar"
                data-person-id={p.id}
                data-value={p.assigned}
                x={x(i) - barWidth - 2}
                y={countY(p.assigned)}
                width={barWidth}
                height={top.end - countY(p.assigned)}
                rx="3"
              />
              <rect
                className="perf-completed-bar"
                data-person-id={p.id}
                data-value={p.completed}
                x={x(i) + 2}
                y={countY(p.completed)}
                width={barWidth}
                height={top.end - countY(p.completed)}
                rx="3"
              />
              <text
                className="perf-axis-person-name"
                x={x(i)}
                y="247"
                textAnchor="middle"
              >
                {p.name}
              </text>
              <text
                className="perf-axis-person-meta"
                x={x(i)}
                y="264"
                textAnchor="middle"
              >
                배정 {p.assigned} · 완료 {p.completed}
              </text>
            </g>
          ))}
          <path
            className="perf-completion-line"
            d={linePath(people, (p) => p.completionRate, x, rateTopY)}
          />
          {people.map((p, i) =>
            p.completionRate === null ? (
              <text
                key={p.id}
                x={x(i)}
                y={top.end - 35}
                textAnchor="middle"
                className="perf-axis-no-data"
              >
                표본 없음
              </text>
            ) : (
              <g key={p.id}>
                <circle
                  className="perf-completion-point"
                  data-person-id={p.id}
                  data-value={p.completionRate}
                  cx={x(i)}
                  cy={rateTopY(p.completionRate)}
                  r="4"
                />
                <text
                  x={x(i)}
                  y={Math.max(top.start - 7, rateTopY(p.completionRate) - 13)}
                  textAnchor="middle"
                  className="perf-axis-rate-label"
                >
                  {p.completionRate}%
                </text>
              </g>
            ),
          )}
          <text x={left} y="285" className="perf-axis-title">
            처리기간과 납기 준수율
          </text>
          <g
            className="perf-axis-legend"
            transform={`translate(${Math.max(left + 225, width - right - 310)},281)`}
          >
            <rect x="0" y="-8" width="11" height="11" fill="#8178b3" />
            <text x="16">처리기간(일)</text>
            <line
              x1="153"
              x2="171"
              y1="-2"
              y2="-2"
              stroke="#245b90"
              strokeWidth="3"
            />
            <text x="178">납기 준수율(%)</text>
          </g>
          <text x={left} y="314" className="perf-axis-unit">
            왼쪽 · 달력일 중앙값
          </text>
          <text
            x={width - right}
            y="314"
            textAnchor="end"
            className="perf-axis-unit"
          >
            오른쪽 · 납기 준수율
          </text>
          {grid(bottom, dayMax, "")}
          {people.map((p, i) => (
            <g key={p.id}>
              {p.medianAssignedCycle !== null ? (
                <>
                  <rect
                    className="perf-cycle-bar"
                    data-person-id={p.id}
                    data-value={p.medianAssignedCycle}
                    x={x(i) - barWidth}
                    y={dayY(p.medianAssignedCycle)}
                    width={barWidth * 2}
                    height={bottom.end - dayY(p.medianAssignedCycle)}
                    rx="3"
                  />
                </>
              ) : (
                <text
                  x={x(i)}
                  y={bottom.end - 13}
                  textAnchor="middle"
                  className="perf-axis-no-data"
                >
                  —
                </text>
              )}
              <text
                className="perf-axis-person-name"
                x={x(i)}
                y="515"
                textAnchor="middle"
              >
                {p.name}
              </text>
              <text
                className="perf-axis-person-meta"
                x={x(i)}
                y="533"
                textAnchor="middle"
              >
                처리기간 {fmt(p.medianAssignedCycle, "일")}
              </text>
              <text
                className={`perf-axis-person-meta ${p.overdue ? "has-delay" : ""}`}
                x={x(i)}
                y="550"
                textAnchor="middle"
              >
                {p.overdue ? `진행 지연 ${p.overdue}건` : `진행 ${p.ongoing}건`}
              </text>
            </g>
          ))}
          <path
            className="perf-on-time-line"
            d={linePath(people, (p) => p.onTimeRate, x, rateBottomY)}
          />
          {people.map((p, i) =>
            p.onTimeRate === null ? null : (
              <g key={p.id}>
                <circle
                  className="perf-on-time-point"
                  data-person-id={p.id}
                  data-value={p.onTimeRate}
                  cx={x(i)}
                  cy={rateBottomY(p.onTimeRate)}
                  r="4"
                />
                <text
                  x={x(i)}
                  y={Math.max(bottom.start - 7, rateBottomY(p.onTimeRate) - 13)}
                  textAnchor="middle"
                  className="perf-axis-deadline-label"
                >
                  {p.onTimeRate}%
                </text>
              </g>
            ),
          )}
          {people.map((p, i) => (
            <g
              key={p.id}
              className="perf-axis-hit"
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              aria-label={`${p.name} 가로축 그래프 상세 보기`}
              data-person-id={p.id}
              onClick={() => onPerson(p.id)}
              onKeyDown={(e) => {
                if (["Enter", " "].includes(e.key)) {
                  e.preventDefault();
                  onPerson(p.id);
                }
              }}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.id)}
              onBlur={() => setHover(null)}
            >
              <title>{label(p)} · 선택하면 근거 업무를 확인합니다.</title>
              <rect
                x={x(i) - step / 2 + 4}
                y={top.start - 8}
                width={Math.max(1, step - 8)}
                height={556 - top.start}
                rx="5"
                fill={hover === p.id ? "#0067ac08" : "transparent"}
              />
            </g>
          ))}
        </svg>
      </div>
      <div className="perf-axis-readout" aria-live="polite">
        {selected ? (
          <>
            <strong>{selected.name}</strong>
            <span>
              배정 {selected.assigned}건 / 완료 {selected.completed}건
            </span>
            <span>완료율 {fmt(selected.completionRate, "%")}</span>
            <span>처리기간 {fmt(selected.medianAssignedCycle, "일")}</span>
            <span>납기 준수 {fmt(selected.onTimeRate, "%")}</span>
          </>
        ) : (
          <span>
            인원에 마우스를 올리거나 키보드로 선택하면 수치를 확인할 수
            있습니다. 클릭·Enter로 개인 상세를 엽니다.
          </span>
        )}
      </div>
    </div>
  );
}
