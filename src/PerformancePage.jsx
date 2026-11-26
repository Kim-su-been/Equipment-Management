import React, { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  RefreshCw,
  Download,
  ArrowRight,
  X,
  Info,
} from "lucide-react";
import { api } from "./api.js";
import BrandCharacters from "./BrandCharacters.jsx";
import { SDLC_STAGES, PERFORMANCE_PROJECTS } from "./performance-data.js";
import {
  validDay,
  selectRequests,
  performanceMetrics,
  stageDurations,
  weeklyTrend,
  personMetrics,
  daysBetween,
} from "./performance-metrics.js";
import { exportPerformance } from "./performance-export.js";
import "./performance.css";
const percent = (n) => (n === null ? "—" : `${n}%`);
const days = (n) => (n === null ? "—" : `${n}일`);
const date = (n) => (n ? n.replaceAll("-", ".") : "미등록");
function PerfDialog({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="performance-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="닫기" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="performance-dialog-body">{children}</div>
      <footer>
        <button className="btn" onClick={onClose}>
          닫기
        </button>
      </footer>
    </dialog>
  );
}
function StatCards({ metrics, onSelect }) {
  const cards = [
    [
      "completed",
      "완료 처리",
      `${metrics.completed}건`,
      "취소 제외 · 조회 기간 내 완료",
    ],
    [
      "eligible",
      "납기 준수율",
      percent(metrics.onTimeRate),
      `준수 ${metrics.onTime}건 / 기한 등록 ${metrics.eligible}건 · 기한 누락 ${metrics.missingDue}건 제외`,
    ],
    [
      "overdue",
      "진행 중 지연",
      `${metrics.overdue}건`,
      `진행 중 ${metrics.ongoing}건 중 기한 경과`,
    ],
    [
      "cycle",
      "처리기간 중앙값",
      days(metrics.medianCycle),
      "접수 → 완료 · 달력일 기준",
    ],
  ];
  return (
    <div className="work-stats perf-stats">
      {cards.map(([id, title, value, sub]) => (
        <button
          key={id}
          className="work-stat"
          onClick={() => onSelect(id)}
          aria-label={`${title} ${value} 근거 보기`}
        >
          <span>{title}</span>
          <strong>{value}</strong>
          <small>{sub}</small>
          <span className="stat-foot">
            근거 업무 보기 <ArrowRight size={14} />
          </span>
        </button>
      ))}
    </div>
  );
}
function DurationChart({ rows }) {
  const items = stageDurations(rows),
    max = Math.max(1, ...items.map((x) => x.median || 0));
  return (
    <div
      className="perf-duration-chart"
      role="img"
      aria-label="완료 업무의 단계별 소요기간 중앙값. 반복 단계의 기간은 합산합니다."
    >
      {items.map((s) => (
        <div key={s.id}>
          <span>{s.title}</span>
          <div className="perf-bar-track">
            <i style={{ width: `${((s.median || 0) / max) * 100}%` }} />
          </div>
          <b>{days(s.median)}</b>
          <small>{s.count}건</small>
        </div>
      ))}
      <p>완료 업무 기준 · 달력일 · 대기 포함 · 반복 방문 합산</p>
    </div>
  );
}
function TrendChart({ rows, asOf }) {
  const items = weeklyTrend(rows, asOf),
    max = Math.max(1, ...items.map((x) => x.completed));
  return (
    <div className="perf-trend-chart">
      <div className="perf-legend">
        <span>● 기한 내 완료</span>
        <span className="late">● 지연 완료</span>
        <span className="unknown">● 기한 미등록</span>
      </div>
      {items.map((w) => (
        <div className="perf-trend-row" key={w.from}>
          <span>
            {w.from.slice(5)} ~ {w.to.slice(5)}
          </span>
          <div
            className="perf-stacked"
            aria-label={`${w.from}부터 완료 ${w.completed}건, 정시 ${w.onTime}건, 지연 ${w.late}건, 기한 미등록 ${w.missingDue}건`}
          >
            <i style={{ width: `${(w.onTime / max) * 100}%` }} />
            <i className="late" style={{ width: `${(w.late / max) * 100}%` }} />
            <i
              className="unknown"
              style={{ width: `${(w.missingDue / max) * 100}%` }}
            />
          </div>
          <b>{w.completed}건</b>
        </div>
      ))}
      <p>최근 4주 · 현재 선택 범위에 포함된 완료 업무</p>
    </div>
  );
}
function RequestList({ rows, participants, onOpen }) {
  const names = new Map(participants.map((p) => [p.id, p]));
  return (
    <div className="perf-requests">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>요청·업무</th>
              <th>담당자</th>
              <th>단계·상태</th>
              <th>약속 완료일</th>
              <th>실제 완료일</th>
              <th>상세</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <button className="text-link" onClick={() => onOpen(r)}>
                    {r.title}
                  </button>
                  <small>
                    {r.externalId} · {r.project} · {r.type}
                  </small>
                </td>
                <td>
                  {names.get(r.participantId)?.name || "인원 연결 확인 필요"}
                  <small>{names.get(r.participantId)?.company}</small>
                </td>
                <td>
                  <span
                    className={`work-badge ${r.cancelled ? "gray" : r.overdue || r.late ? "orange" : r.done ? "green" : "blue"}`}
                  >
                    {r.label}
                  </span>
                  {r.waitReason && <small>대기 사유 있음</small>}
                </td>
                <td>{date(r.dueDate)}</td>
                <td>{r.done ? date(r.completedAt) : "—"}</td>
                <td>
                  <button
                    className="btn"
                    onClick={() => onOpen(r)}
                    aria-label={`${r.externalId} 원본 근거 보기`}
                  >
                    근거 보기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="work-empty">조건에 맞는 업무가 없습니다.</p>
      )}
    </div>
  );
}
const matchStatus = (r, status) =>
  status === "all" ||
  (status === "completed" && r.done && !r.cancelled) ||
  (status === "eligible" && r.done && !r.cancelled && validDay(r.dueDate)) ||
  (status === "overdue" && r.overdue) ||
  (status === "late" && r.late) ||
  (status === "missing" && r.done && !r.cancelled && !r.dueDate) ||
  (status === "ongoing" && !r.done && !r.cancelled) ||
  (status === "reworked" && r.done && !r.cancelled && r.reworked) ||
  (status === "cancelled" && r.cancelled);
export default function PerformancePage({ actor, scope }) {
  const [payload, setPayload] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState("overview"),
    [filter, setFilter] = useState({
      project: scope === "PMO" ? "전체" : scope,
      person: "전체",
      type: "전체",
      from: "2026-11-01",
      to: "2026-11-26",
    }),
    [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    [detail, setDetail] = useState(null);
  const admin = actor.kind === "admin";
  useEffect(() => {
    let active = true;
    api("/api/performance")
      .then((data) => {
        if (active) setPayload(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const update = (key, value) => {
    setFilter((f) => ({
      ...f,
      [key]: value,
      ...(key === "project" ? { person: "전체" } : {}),
    }));
  };
  async function sync() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/performance/sync", { method: "POST" });
      setPayload(result);
      setNotice(
        `가상 자료 수집 완료 · 신규 ${result.sync.added}건 / 갱신 ${result.sync.updated}건 / 동일 ${result.sync.unchanged}건. 실제 외부 API는 호출하지 않았습니다.`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!payload)
    return (
      <div className="work-page performance-page">
        <h1>퍼포먼스 관리</h1>
        {error ? (
          <p role="alert">
            {error}
            <button
              className="btn"
              onClick={() => {
                setError("");
                api("/api/performance")
                  .then(setPayload)
                  .catch((e) => setError(e.message));
              }}
            >
              다시 불러오기
            </button>
          </p>
        ) : (
          <p role="status">가상 그룹웨어 표본을 준비하고 있습니다.</p>
        )}
      </div>
    );
  const rangeError =
    !validDay(filter.from) ||
    !validDay(filter.to) ||
    filter.from > filter.to ||
    filter.to > payload.asOf;
  const rows = rangeError ? [] : selectRequests(payload, filter),
    asOf = filter.to > payload.asOf ? payload.asOf : filter.to;
  const metrics = performanceMetrics(rows, asOf),
    people = personMetrics(payload, rows, asOf);
  const options = payload.participants.filter(
    (p) =>
      (scope === "PMO" || p.project === scope) &&
      (filter.project === "전체" || p.project === filter.project),
  );
  const projects = PERFORMANCE_PROJECTS.filter(
    (p) => scope === "PMO" || p === scope,
  );
  const list = rows
    .filter(
      (r) =>
        matchStatus(r, status) &&
        (!search ||
          `${r.externalId} ${r.title} ${payload.participants.find((p) => p.id === r.participantId)?.name}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        (a.dueDate || "9999").localeCompare(b.dueDate || "9999"),
    );
  const openRequest = (r) => setDetail({ type: "request", request: r });
  const metricSelect = (id) => {
    setStatus(id === "cycle" ? "completed" : id);
    setSearch("");
    setTab("requests");
  };
  const table = (
    <RequestList
      rows={list}
      participants={payload.participants}
      onOpen={openRequest}
    />
  );
  async function download() {
    setBusy(true);
    setError("");
    try {
      const blob = await exportPerformance(payload, rows, asOf, filter),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `레디보드_SDLC_${filter.project}_${filter.from}_${filter.to}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const selectedPerson =
    detail?.type === "person"
      ? payload.participants.find((p) => p.id === detail.id)
      : null;
  const personRows = selectedPerson
    ? rows.filter((r) => r.participantId === selectedPerson.id)
    : [];
  return (
    <div className="work-page performance-page">
      <header className="work-title">
        <div>
          <span className="eyebrow">SDLC PERFORMANCE</span>
          <h1>{admin ? "퍼포먼스 관리" : "나의 수행 현황"}</h1>
          <p>진행 단계부터 납기·처리기간까지, 업무 근거와 함께 확인하세요.</p>
        </div>
        <BrandCharacters className="work-mascot" />
        <div className="perf-header-actions">
          {admin && (
            <button className="btn primary" onClick={sync} disabled={busy}>
              <RefreshCw size={15} />
              {busy ? "처리 중…" : "가상 자료 불러오기"}
            </button>
          )}
          <button
            className="btn"
            disabled={busy || rangeError || !rows.length}
            onClick={download}
          >
            <Download size={15} />
            현재 범위 엑셀
          </button>
        </div>
      </header>
      <div className="perf-source">
        <span className="work-badge blue">가상 데이터</span>
        <span>
          그룹웨어 수집 가정 · 기준일 {date(payload.asOf)} ·{" "}
          {payload.preview
            ? "저장 전 표본 미리보기"
            : `저장됨 ${payload.syncedAt ? new Date(payload.syncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : ""}`}
        </span>
        <button
          className="text-link"
          onClick={() => setDetail({ type: "source" })}
        >
          출처·산정 기준 <Info size={14} />
        </button>
      </div>
      {notice && (
        <p className="perf-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <section className="card work-card perf-filter-card">
        <div className="perf-filters">
          {admin && (
            <label>
              프로젝트·운영 업무
              <select
                aria-label="수행 프로젝트 필터"
                value={filter.project}
                onChange={(e) => update("project", e.target.value)}
              >
                {scope === "PMO" && <option>전체</option>}
                {projects.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          )}
          {admin && (
            <label>
              인원
              <select
                aria-label="수행 인원 필터"
                value={filter.person}
                onChange={(e) => update("person", e.target.value)}
              >
                <option>전체</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.project}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            요청 유형
            <select
              aria-label="수행 요청 유형"
              value={filter.type}
              onChange={(e) => update("type", e.target.value)}
            >
              {["전체", "기능 개선", "장애 수정", "요청 분석"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            조회 시작일
            <input
              type="date"
              aria-label="수행 조회 시작일"
              value={filter.from}
              max={filter.to}
              onChange={(e) => update("from", e.target.value)}
            />
          </label>
          <label>
            조회 종료일
            <input
              type="date"
              aria-label="수행 조회 종료일"
              value={filter.to}
              min={filter.from}
              max={payload.asOf}
              onChange={(e) => update("to", e.target.value)}
            />
          </label>
        </div>
        <p>
          완료 지표는 기간 내 완료 업무, 진행 지표는 종료일 현재 미완료 업무
          기준입니다. 취소 {metrics.cancelled}건 제외 · 기간은 달력일로
          계산합니다.
        </p>
        {rangeError && (
          <p role="alert" className="perf-error">
            시작일과 종료일을 확인하세요. 종료일은 표본 기준일 {payload.asOf}
            까지 선택할 수 있습니다.
          </p>
        )}
      </section>
      <StatCards metrics={metrics} onSelect={metricSelect} />
      <nav className="perf-tabs" aria-label="퍼포먼스 보기">
        {[
          ["overview", "전체 현황"],
          ["people", "인원별 지표"],
          ["requests", "업무 목록"],
        ]
          .filter(([id]) => admin || id !== "people")
          .map(([id, label]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
      </nav>
      {tab === "overview" && (
        <>
          <section className="card work-card">
            <div className="work-card-heading">
              <div>
                <h2>SDLC 단계별 현황</h2>
                <p>단계를 누르면 해당 업무를 팝업에서 확인합니다.</p>
              </div>
              <span>대상 {rows.filter((r) => !r.cancelled).length}건</span>
            </div>
            <ol className="perf-stages">
              {SDLC_STAGES.map((s, i) => {
                const count = rows.filter(
                  (r) => !r.cancelled && r.stage === s.id,
                ).length;
                return (
                  <li key={s.id}>
                    <button
                      aria-haspopup="dialog"
                      aria-label={`${s.title} ${count}건 보기`}
                      onClick={() => setDetail({ type: "stage", stage: s.id })}
                    >
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <strong>{s.title}</strong>
                      <b>
                        {count}
                        <small>건</small>
                      </b>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
          <div className="perf-charts">
            <section className="card work-card">
              <h2>단계별 처리기간</h2>
              <DurationChart rows={rows} />
            </section>
            <section className="card work-card">
              <h2>완료 업무 추이</h2>
              <TrendChart rows={rows} asOf={rangeError ? payload.asOf : asOf} />
            </section>
          </div>
          <section className="card work-card">
            <div className="work-card-heading">
              <div>
                <h2>지금 확인할 업무</h2>
                <p>
                  진행 중 지연 업무를 먼저 확인하세요. 표시된 대기 사유는 가상
                  원문에 있는 내용입니다.
                </p>
              </div>
              <button
                className="text-link"
                onClick={() => {
                  setStatus("overdue");
                  setTab("requests");
                }}
              >
                지연 목록 전체 보기 <ArrowRight size={14} />
              </button>
            </div>
            <RequestList
              rows={rows.filter((r) => r.overdue).slice(0, 4)}
              participants={payload.participants}
              onOpen={openRequest}
            />
          </section>
          <div className="perf-secondary-metrics">
            <span>
              재작업률 <b>{percent(metrics.reworkRate)}</b> · 완료{" "}
              {metrics.completed}건 중 {metrics.reworked}건
            </span>
            <span>
              검증 → 개발 재진입 이력 기준 · 개인 종합점수·자동 평가는 제공하지
              않습니다.
            </span>
          </div>
        </>
      )}
      {tab === "people" && (
        <section className="card work-card">
          <div className="work-card-heading">
            <div>
              <h2>인원별 수행 지표</h2>
              <p>
                비교할 업무 유형과 기간을 먼저 맞춰주세요. 인원을 누르면 개인별
                그래프와 근거가 열립니다.
              </p>
            </div>
            <span>{people.length}명</span>
          </div>
          <div className="perf-person-grid">
            {people.map((p) => (
              <button
                key={p.id}
                className="perf-person-card"
                aria-haspopup="dialog"
                onClick={() => setDetail({ type: "person", id: p.id })}
                aria-label={`${p.name} 수행 지표 보기`}
              >
                <span className="perf-person-heading">
                  <strong>{p.name}</strong>
                  <small>{p.project}</small>
                </span>
                <span>
                  {p.company}
                  {!p.personId && " · AO 가상 인원"}
                </span>
                <span className="perf-person-values">
                  <span>
                    완료 <b>{p.completed}건</b>
                  </span>
                  <span>
                    납기 준수 <b>{percent(p.onTimeRate)}</b>
                  </span>
                  <span>
                    진행 지연 <b>{p.overdue}건</b>
                  </span>
                </span>
                <span
                  className="perf-person-bar"
                  aria-label={`기한 내 ${p.onTime}건, 지연 완료 ${p.late}건, 기한 누락 ${p.missingDue}건`}
                >
                  <i
                    style={{
                      width: `${p.completed ? (p.onTime / p.completed) * 100 : 0}%`,
                    }}
                  />
                  <i
                    className="late"
                    style={{
                      width: `${p.completed ? (p.late / p.completed) * 100 : 0}%`,
                    }}
                  />
                  <i
                    className="unknown"
                    style={{
                      width: `${p.completed ? (p.missingDue / p.completed) * 100 : 0}%`,
                    }}
                  />
                </span>
                <small>
                  기한 내 완료 / 지연 완료 / 기한 미등록 · 상세 보기 →
                </small>
              </button>
            ))}
          </div>
          {!people.length && (
            <p className="work-empty">선택 범위에 인원이 없습니다.</p>
          )}
        </section>
      )}
      {tab === "requests" && (
        <section className="card work-card">
          <div className="work-card-heading">
            <h2>
              업무 목록 <small>{list.length}건</small>
            </h2>
          </div>
          <div className="perf-list-filters">
            <label>
              업무 상태
              <select
                aria-label="수행 업무 상태"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {[
                  ["all", "전체"],
                  ["completed", "완료"],
                  ["eligible", "납기 비율 산정 대상"],
                  ["overdue", "진행 중 지연"],
                  ["late", "지연 완료"],
                  ["missing", "완료·기한 미등록"],
                  ["ongoing", "진행 중"],
                  ["reworked", "재작업 완료"],
                  ["cancelled", "취소"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              요청·담당자 검색
              <input
                aria-label="수행 업무 검색"
                value={search}
                placeholder="요청 번호, 제목, 이름"
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className="text-link"
              onClick={() => {
                setSearch("");
                setStatus("all");
              }}
            >
              목록 필터 초기화
            </button>
          </div>
          <p className="perf-table-note">
            목록 검색·상태 필터는 상단 요약 지표를 변경하지 않습니다. 엑셀은
            상단 조회 범위 전체를 포함합니다.
          </p>
          {table}
        </section>
      )}
      {detail && (
        <PerfDialog
          key={`${detail.type}:${detail.id || detail.stage || detail.request?.id || ""}`}
          onClose={() => setDetail(null)}
          title={
            detail.type === "person"
              ? `${selectedPerson?.name} · 수행 지표`
              : detail.type === "personEvidence"
                ? "개인 지표 · 근거 업무"
                : detail.type === "request"
                  ? `${detail.request.externalId} · 업무 근거`
                  : detail.type === "stage"
                    ? `${SDLC_STAGES.find((s) => s.id === detail.stage)?.title} · 업무 목록`
                    : "데이터 출처와 지표 기준"
          }
        >
          {detail.type === "source" && (
            <div className="perf-definitions">
              <p>
                <b>가상 그룹웨어 응답</b>을 레디보드가 수집한 상황을 시연합니다.
                실제 ITGS·그룹웨어 API와 AI 모델은 호출하지 않습니다.
              </p>
              <p>
                프로젝트 표본은 기존 인원 ID에 연결합니다. AO 4명은 이 탭 안에서
                사용하는 별도 가상 인원이며 기존 투입 명단을 변경하지 않습니다.
              </p>
              <dl>
                <dt>납기 준수율</dt>
                <dd>
                  기간 내 완료되고 약속 완료일이 있는 업무 중 기한 내 완료한
                  비율. 기한 누락은 제외하고 건수를 표시합니다.
                </dd>
                <dt>진행 중 지연</dt>
                <dd>
                  조회 종료일 현재 미완료이며 약속 완료일이 지난 업무. 완료
                  지연과 구분합니다.
                </dd>
                <dt>처리기간·단계 기간</dt>
                <dd>
                  달력일 기준. 완료 요청만 사용하며 단계 재진입은 해당 단계의
                  모든 기간을 합산합니다. 대기 시간을 포함하므로 개인의 실제
                  작업시간을 의미하지 않습니다.
                </dd>
                <dt>재작업률</dt>
                <dd>
                  검증에서 개발로 되돌아간 이력이 있는 완료 요청 / 전체 완료
                  요청.
                </dd>
                <dt>기간·누락·취소</dt>
                <dd>
                  완료는 완료일, 진행은 종료일 현재 상태로 조회합니다. 생성
                  전·취소 요청은 지표에서 제외합니다. 분모가 없으면 —입니다.
                </dd>
                <dt>반복 수집·저장</dt>
                <dd>
                  같은 원천 요청 ID는 갱신합니다. 반복 수집해도 중복 생성하지
                  않습니다. HTML에서는 브라우저 저장소, 서버형에서는 기존 DB에
                  저장합니다.
                </dd>
                <dt>비교와 평가</dt>
                <dd>
                  담당 건수·업무 유형·대기 원인을 함께 확인하세요. 원천 데이터의
                  담당자는 대표 담당자 한 명인 가상 사례입니다. 자동
                  등급·블랙리스트·AI 평가는 포함하지 않습니다.
                </dd>
              </dl>
            </div>
          )}
          {detail.type === "stage" && (
            <RequestList
              rows={rows.filter(
                (r) => !r.cancelled && r.stage === detail.stage,
              )}
              participants={payload.participants}
              onOpen={openRequest}
            />
          )}
          {detail.type === "person" && selectedPerson && (
            <>
              <p>
                {selectedPerson.company} · {selectedPerson.project} ·{" "}
                {selectedPerson.personId
                  ? "기존 인원 고유 기록에 연결"
                  : "AO 가상 인원"}
              </p>
              <StatCards
                metrics={performanceMetrics(personRows, asOf)}
                onSelect={(id) =>
                  setDetail({
                    type: "personEvidence",
                    id: selectedPerson.id,
                    metric: id,
                  })
                }
              />
              <DurationChart rows={personRows} />
              <TrendChart rows={personRows} asOf={asOf} />
              <h3>처리 근거</h3>
              <RequestList
                rows={personRows}
                participants={payload.participants}
                onOpen={openRequest}
              />
            </>
          )}
          {detail.type === "personEvidence" && (
            <>
              <button
                className="text-link"
                onClick={() => setDetail({ type: "person", id: detail.id })}
              >
                ← 개인 지표로
              </button>
              <RequestList
                rows={rows.filter(
                  (r) =>
                    r.participantId === detail.id &&
                    matchStatus(
                      r,
                      detail.metric === "cycle" ? "completed" : detail.metric,
                    ),
                )}
                participants={payload.participants}
                onOpen={openRequest}
              />
            </>
          )}
          {detail.type === "request" &&
            (() => {
              const r = detail.request,
                p = payload.participants.find((x) => x.id === r.participantId);
              return (
                <>
                  <span className="work-badge blue">가상 원천 데이터</span>
                  <h3>{r.title}</h3>
                  <dl className="perf-request-facts">
                    <dt>담당자</dt>
                    <dd>
                      {p?.name} · {p?.company} · {r.project}
                    </dd>
                    <dt>약속 / 실제 완료</dt>
                    <dd>
                      {date(r.dueDate)} /{" "}
                      {r.done ? date(r.completedAt) : "미완료"}
                    </dd>
                    <dt>접수 / 처리기간</dt>
                    <dd>
                      {date(r.createdAt)} /{" "}
                      {r.done
                        ? days(daysBetween(r.createdAt, r.completedAt))
                        : "진행 중"}
                    </dd>
                    <dt>상태</dt>
                    <dd>
                      {r.label}
                      {r.reworked ? " · 검증 후 개발 재진입" : ""}
                    </dd>
                    <dt>대기 사유</dt>
                    <dd>
                      {r.waitReason ||
                        "원천 사유 미등록 · 임의로 원인을 추정하지 않습니다."}
                    </dd>
                  </dl>
                  <h3>단계 변경 이력</h3>
                  <ol className="perf-event-list">
                    {r.events.map((e, i) => (
                      <li key={i}>
                        <span>{date(e.at)}</span>
                        <strong>
                          {SDLC_STAGES.find((s) => s.id === e.stage)?.title}
                        </strong>
                        {i > 0 && (
                          <small>
                            직전 단계{" "}
                            {days(daysBetween(r.events[i - 1].at, e.at))}
                          </small>
                        )}
                      </li>
                    ))}
                  </ol>
                  {r.cancelled && (
                    <p>취소일 {date(r.cancelledAt)} · 지표 산정 제외</p>
                  )}
                  <p className="info-note">
                    출처: {r.source} · 원천 요청 {r.externalId} · 갱신일{" "}
                    {date(r.sourceUpdatedAt)}. 날짜는 조회 기준일 이전 이력만
                    표시합니다.
                  </p>
                </>
              );
            })()}
        </PerfDialog>
      )}
    </div>
  );
}
